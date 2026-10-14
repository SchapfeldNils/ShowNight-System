import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { LocalAccounts } from "../apps/local/src/accounts.js";
import { PackageStore } from "../apps/local/src/store.js";
import { localServer } from "../apps/local/src/server.js";
import { HttpError } from "../apps/api/src/errors.js";
import { hashPassword, totp, totpSecret } from "../apps/api/src/security.js";
import type { Actor } from "../apps/api/src/auth.js";

test("Offlinekonten: Technikvergabe bleibt Systemadministration vorbehalten", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "shownight-account-rights-"));
  const accounts = new LocalAccounts(root, randomBytes(32).toString("hex"));
  const inspection = new DatabaseSync(join(root, "accounts.sqlite"), {
    readOnly: true,
  });
  t.after(async () => {
    inspection.close();
    accounts.close();
    const temporaryRoot = resolve(tmpdir());
    assert.ok(resolve(root).startsWith(temporaryRoot + sep));
    assert.ok(root.includes("shownight-account-rights-"));
    await rm(root, { recursive: true, force: true });
  });
  const eventId = randomUUID(),
    otherEventId = randomUUID();
  const password = randomBytes(24).toString("hex");
  const passwordHash = await hashPassword(password);
  const adminSecret = totpSecret(),
    leadSecret = totpSecret();
  accounts.importSnapshot({
    schemaVersion: 1,
    id: randomUUID(),
    serverOrigin: "https://offline-rights.example.test",
    sequence: 1,
    createdAt: new Date().toISOString(),
    packages: [eventId, otherEventId].map((id) => ({
      id: randomUUID(),
      eventId: id,
      manifestSha: randomBytes(32).toString("hex"),
    })),
    users: [
      {
        id: randomUUID(),
        login: "admin",
        displayName: "Synthetische Administration",
        admin: true,
        enabled: true,
        passwordHash,
        mfaSecret: adminSecret,
        grants: [],
      },
      {
        id: randomUUID(),
        login: "lead",
        displayName: "Synthetische Leitung",
        admin: false,
        enabled: true,
        passwordHash,
        mfaSecret: leadSecret,
        grants: [{ eventId, roles: ["leitung", "technik"], assignedShows: [] }],
      },
      {
        id: randomUUID(),
        login: "member",
        displayName: "Synthetisches Mitglied",
        admin: false,
        enabled: true,
        passwordHash,
        mfaSecret: null,
        grants: [{ eventId, roles: ["mitglied"], assignedShows: [] }],
      },
      {
        id: randomUUID(),
        login: "technician",
        displayName: "Synthetische Technik",
        admin: false,
        enabled: true,
        passwordHash,
        mfaSecret: null,
        grants: [{ eventId, roles: ["technik"], assignedShows: [] }],
      },
    ],
  });
  const sessions = new Map<string, string>();
  async function signedIn(login: string, secret?: string): Promise<Actor> {
    const result = await accounts.login(login, password);
    let session: string;
    if (secret) {
      assert.ok("challenge" in result, "Admin und Leitung benötigen echte MFA");
      session = accounts.verify(result.challenge!, totp(secret)).session;
    } else {
      assert.ok("session" in result);
      session = result.session;
    }
    const actor = accounts.actor(session);
    assert.ok(actor);
    sessions.set(actor.id, session);
    return actor;
  }
  const admin = await signedIn("admin", adminSecret);
  const lead = await signedIn("lead", leadSecret);
  const member = await signedIn("member");
  const technician = await signedIn("technician");
  assert.equal(admin.mfaVerified, true);
  assert.equal(lead.mfaVerified, true);
  const counts = () =>
    Object.fromEntries(
      ["users", "access", "invitations", "audit"].map((table) => [
        table,
        Number(
          inspection.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n,
        ),
      ]),
    );
  const input = (login: string, role = "mitglied") => ({
    login,
    displayName: "Synthetisches neues Konto",
    role,
  });
  function deniedWithoutMutation(
    actor: Actor,
    event: string,
    value: unknown,
    status: number,
  ) {
    const before = counts();
    assert.throws(
      () => accounts.createUser(actor, event, value),
      (error: unknown) => error instanceof HttpError && error.status === status,
    );
    assert.deepEqual(
      counts(),
      before,
      "Verweigerung erzeugt weder Konto, Grant, Einladung noch Audit",
    );
  }

  await t.test(
    "Leitung darf trotz eigener Technikrolle keine Technik vergeben; atomare 403",
    () => {
      deniedWithoutMutation(
        lead,
        eventId,
        input("refused-technician", "technik"),
        403,
      );
      assert.equal(
        inspection
          .prepare("SELECT 1 FROM users WHERE login=?")
          .get("refused-technician"),
        undefined,
      );
    },
  );
  await t.test(
    "Admin darf Technik innerhalb vorbereiteter Veranstaltung vergeben",
    () => {
      const before = counts();
      const created = accounts.createUser(
        admin,
        eventId,
        input("new-technician", "technik"),
      );
      assert.ok(created.invitationToken);
      const user = accounts
        .users(admin, eventId)
        .find((u) => "id" in u && u.id === created.id);
      assert.ok(user);
      assert.equal(user.admin, false);
      assert.deepEqual(user.roles, ["technik"]);
      assert.deepEqual(
        counts(),
        Object.fromEntries(
          Object.entries(before).map(([key, value]) => [key, value + 1]),
        ),
      );
    },
  );
  await t.test(
    "Leitung darf Fachkonto im eigenen Event anlegen und persönlich einrichten",
    async () => {
      const before = counts();
      const created = accounts.createUser(lead, eventId, input("new-member"));
      const user = accounts
        .users(lead, eventId)
        .find((u) => "id" in u && u.id === created.id);
      assert.ok(user);
      assert.deepEqual(user.roles, ["mitglied"]);
      assert.deepEqual(
        counts(),
        Object.fromEntries(
          Object.entries(before).map(([key, value]) => [key, value + 1]),
        ),
      );
      const invitedPassword = randomBytes(24).toString("hex");
      assert.deepEqual(
        await accounts.acceptInvitation(
          created.invitationToken,
          invitedPassword,
        ),
        { accepted: true },
      );
      const result = await accounts.login("new-member", invitedPassword);
      assert.ok("session" in result);
      const actor = accounts.actor(result.session);
      assert.ok(actor);
      assert.equal(actor.admin, false);
      assert.deepEqual(accounts.grants(actor), [
        { eventId, roles: ["mitglied"], assignedShows: [] },
      ]);
    },
  );
  await t.test(
    "Fremdes und nicht vorbereitetes Event bleiben ohne Mutation unzugänglich",
    () => {
      deniedWithoutMutation(lead, otherEventId, input("foreign-member"), 404);
      deniedWithoutMutation(
        admin,
        randomUUID(),
        input("unprepared-technician", "technik"),
        404,
      );
    },
  );
  await t.test(
    "Mitglied und Technik ohne Leitung dürfen keine Konten anlegen",
    () => {
      deniedWithoutMutation(
        member,
        eventId,
        input("member-created-lead", "leitung"),
        404,
      );
      deniedWithoutMutation(
        technician,
        eventId,
        input("technician-created-member"),
        404,
      );
    },
  );
  await t.test(
    "Unbekannte Rollen und Systemadmin-Felder werden ohne Mutation abgewiesen",
    () => {
      for (const value of [
        input("invalid-role", "admin"),
        { ...input("invalid-field"), admin: true },
      ]) {
        const before = counts();
        assert.throws(
          () => accounts.createUser(lead, eventId, value),
          z.ZodError,
        );
        assert.deepEqual(counts(), before);
      }
    },
  );
  await t.test(
    "Echte HTTP-Route verweigert Leitung mit 403 und erlaubt Admintechnik mit 200",
    async () => {
      const packageRoot = join(root, "packages");
      await mkdir(packageRoot);
      const packages = new PackageStore(packageRoot);
      const origin = "https://localhost:3443";
      const app = await localServer(accounts, packages, origin);
      try {
        for (const actor of [lead, admin]) {
          const before = counts();
          const response = await app.inject({
            method: "POST",
            url: `/api/local/events/${eventId}/users`,
            headers: {
              origin,
              cookie: "sn_local_session=" + sessions.get(actor.id),
              "x-csrf-token": actor.csrfToken,
            },
            payload: input(
              actor.admin ? "http-technician" : "http-refused-technician",
              "technik",
            ),
          });
          assert.equal(response.statusCode, actor.admin ? 200 : 403);
          if (!actor.admin) {
            assert.deepEqual(counts(), before);
            assert.equal(
              inspection
                .prepare("SELECT 1 FROM users WHERE login=?")
                .get("http-refused-technician"),
              undefined,
            );
          } else {
            const created = response.json<{
              id: string;
              invitationToken: string;
            }>();
            assert.ok(created.invitationToken);
            assert.deepEqual(
              counts(),
              Object.fromEntries(
                Object.entries(before).map(([key, value]) => [key, value + 1]),
              ),
            );
            const grant = inspection
              .prepare(
                "SELECT roles FROM access WHERE user_id=? AND event_id=?",
              )
              .get(created.id, eventId);
            assert.deepEqual(JSON.parse(String(grant?.roles)), ["technik"]);
          }
        }
      } finally {
        await app.close();
        packages.close();
      }
    },
  );
});
