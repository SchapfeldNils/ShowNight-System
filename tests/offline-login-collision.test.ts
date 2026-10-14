import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { rendererFixture } from "./renderer-fixture.js";
import { OfflineLoginConflict } from "../apps/local/src/accounts.js";

test("Offline-Anmeldekennungskollision wird erklärt und erhält Konten, Rechte, Sitzung und alten Importstand", async () => {
  const fixture = await rendererFixture();
  const inspection = new DatabaseSync(
    join(fixture.root, "accounts", "accounts.sqlite"),
    { readOnly: true },
  );
  try {
    const session = (await fixture.loginAdmin()).session;
    const actor = fixture.accounts.actor(session)!;
    const local = fixture.accounts.createUser(actor, fixture.manifest.eventId, {
      login: "collision.local",
      displayName: "Synthetisches lokales Konto",
      role: "mitglied",
    });
    const state = () =>
      Object.fromEntries(
        [
          "meta",
          "users",
          "access",
          "sessions",
          "challenges",
          "invitations",
          "event_blocks",
          "audit",
        ].map((table) => [
          table,
          inspection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        ]),
      );
    const before = state();
    const incoming = {
      ...fixture.snapshot,
      id: randomUUID(),
      sequence: fixture.snapshot.sequence + 1,
      users: [
        {
          ...fixture.snapshot.users[0],
          displayName: "Darf nicht übernommen werden",
        },
        ...fixture.snapshot.users.slice(1),
        {
          ...fixture.snapshot.users[1],
          id: randomUUID(),
          login: "collision.local",
        },
      ],
    };
    assert.throws(
      () => fixture.accounts.importSnapshot(incoming),
      (error: unknown) => {
        assert.ok(error instanceof OfflineLoginConflict);
        assert.match(
          error.message,
          /Vorhandene Konten und Anmeldestand bleiben erhalten/,
        );
        assert.doesNotMatch(error.message, /collision\.local/);
        return true;
      },
    );
    assert.deepEqual(state(), before);
    assert.equal(fixture.accounts.actor(session)!.id, actor.id);
    assert.equal(
      inspection
        .prepare("SELECT id FROM users WHERE login=?")
        .get("collision.local")!.id,
      local.id,
    );
    assert.equal(fixture.accounts.meta("snapshot_id"), fixture.snapshot.id);
  } finally {
    inspection.close();
    fixture.close();
  }
});
