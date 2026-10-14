import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fixture, multipartFile } from "./fixture.js";
import { actor } from "../apps/api/src/auth.js";
import { eventAccess } from "../apps/api/src/permissions.js";
import { totp } from "../apps/api/src/security.js";
import { processMedia } from "../apps/api/src/worker.js";

test("PR-Review: Leitung, MFA, Medienwahl, Einladungsrecovery und Rechtewiderruf", async (t) => {
  const f = await fixture(55439);
  type Auth = { cookie: string; csrf: string };
  let admin: Auth = { cookie: "", csrf: "" };
  const request = (
    path: string,
    method = "GET",
    payload?: unknown,
    as = admin,
  ) =>
    f.app.inject({
      url: "/api/v1" + path,
      method: method as any,
      headers: {
        origin: f.cfg.origin,
        cookie: as.cookie,
        "x-csrf-token": as.csrf,
      },
      ...(payload === undefined ? {} : { payload: payload as any }),
    });
  async function login(name: string, password: string) {
    const first = await request("/auth/login", "POST", {
      login: name,
      password,
    });
    assert.equal(first.statusCode, 200, first.body);
    const authenticated = first.json().authenticated
      ? first
      : await request("/auth/mfa/verify", "POST", {
          challenge: first.json().challenge,
          code: totp(first.json().secret),
        });
    assert.equal(authenticated.statusCode, 200, authenticated.body);
    return {
      cookie: "sn_session=" + authenticated.cookies[0].value,
      csrf: authenticated.json().csrfToken,
    };
  }
  try {
    admin = await login("admin", f.adminPassword);
    const event = (
      await request("/events", "POST", { name: "Review Veranstaltung" })
    ).json().id;
    const foreign = (
      await request("/events", "POST", { name: "Andere Veranstaltung" })
    ).json().id;
    const team = (
      await request(`/events/${event}/teams`, "POST", {
        name: "Gemeinsames Team",
      })
    ).json().id;
    const source = await request("/shows", "POST", { name: "Review Show" });
    assert.equal(source.statusCode, 200, source.body);
    const copy = await request(`/events/${event}/show-copies`, "POST", {
      sourceShowId: source.json().id,
      sourceRevision: source.json().revision,
    });
    assert.equal(copy.statusCode, 200, copy.body);
    const show = copy.json().id;
    async function invite(name: string, leader = false) {
      const pending = await request(`/events/${event}/users`, "POST", {
        login: name,
        displayName: "Synthetisch " + name,
      });
      assert.equal(pending.statusCode, 200, pending.body);
      const uid = pending.json().id;
      const password = randomBytes(20).toString("hex");
      assert.equal(
        (
          await request("/auth/invitation", "POST", {
            token: pending.json().invitationUrl.split("#einladung=")[1],
            password,
          })
        ).statusCode,
        200,
      );
      if (leader)
        assert.equal(
          (
            await request(`/events/${event}/grants`, "POST", {
              userId: uid,
              role: "leitung",
            })
          ).statusCode,
          200,
        );
      return { id: uid, auth: await login(name, password) };
    }
    const lead = await invite("review-leitung", true);
    const member = await invite("review-mitglied");
    const membership = `/events/${event}/teams/${team}/members`;
    await t.test(
      "Mitverwaltung eines vom Admin angelegten Teams; fremde gemeinsame Bereiche bleiben geschützt",
      async () => {
        assert.equal(
          (await request(membership, "POST", { userId: member.id }, lead.auth))
            .statusCode,
          200,
        );
        await request(`/events/${foreign}/teams`, "POST", { teamId: team });
        assert.equal(
          (await request(membership, "POST", { userId: lead.id }, lead.auth))
            .statusCode,
          403,
        );
        assert.equal(
          (
            await request(
              membership + "/" + member.id,
              "DELETE",
              undefined,
              lead.auth,
            )
          ).statusCode,
          403,
        );
        assert.equal(
          (await request(`/events/${foreign}/teams/${team}`, "DELETE"))
            .statusCode,
          200,
        );
      },
    );
    await t.test(
      "Leitungsrolle zwischen Actor- und Rechteabfrage verlangt weiterhin MFA",
      async () => {
        const stale = await actor(
          f.db,
          member.auth.cookie.slice("sn_session=".length),
        );
        assert(stale && !stale.mfaVerified);
        await request(`/events/${event}/grants`, "POST", {
          userId: member.id,
          role: "leitung",
        });
        await assert.rejects(
          () => eventAccess(f.db, stale, event, true),
          (e: any) => e.status === 401,
        );
        await request(`/events/${event}/grants/${member.id}/leitung`, "DELETE");
      },
    );
    await t.test(
      "Eventmedien erscheinen in eigener Show, nicht in unabhängigen/fremden Shows",
      async () => {
        const upload = multipartFile(f.demoPng);
        const r = await f.app.inject({
          url: `/api/v1/media/uploads?eventId=${event}`,
          method: "POST",
          headers: {
            origin: f.cfg.origin,
            cookie: admin.cookie,
            "x-csrf-token": admin.csrf,
            "content-type": upload.contentType,
          },
          payload: upload.payload,
        });
        assert.equal(r.statusCode, 200, r.body);
        await processMedia(f.db, f.cfg);
        const listed = await request(
          `/media?showId=${show}`,
          "GET",
          undefined,
          member.auth,
        );
        assert.equal(listed.statusCode, 200, listed.body);
        assert(listed.json().some((m: any) => m.id === r.json().id));
        const independent = (
          await request("/shows", "POST", { name: "Private Show" })
        ).json().id;
        assert(
          !(await request(`/media?showId=${independent}`))
            .json()
            .some((m: any) => m.id === r.json().id),
        );
        assert.equal(
          (
            await request(
              `/media?showId=${independent}`,
              "GET",
              undefined,
              member.auth,
            )
          ).statusCode,
          404,
        );
      },
    );
    await t.test(
      "Abgelaufene Einladung erneuern, alte Links verwerfen; eingerichtete/fremde Konten schützen",
      async () => {
        const pending = (
          await request(`/events/${event}/users`, "POST", {
            login: "review-pending",
            displayName: "Noch nicht eingerichtet",
          })
        ).json();
        await f.db.query(
          "UPDATE invitations SET expires_at=now()-interval '1 hour' WHERE user_id=$1",
          [pending.id],
        );
        const link = await request(
          `/events/${event}/users/${pending.id}/invitation`,
          "POST",
          undefined,
          lead.auth,
        );
        assert.equal(link.statusCode, 200, link.body);
        const password = randomBytes(20).toString("hex");
        assert.equal(
          (
            await request("/auth/invitation", "POST", {
              token: pending.invitationUrl.split("#einladung=")[1],
              password,
            })
          ).statusCode,
          401,
        );
        assert.equal(
          (
            await request(
              `/events/${foreign}/users/${pending.id}/invitation`,
              "POST",
              undefined,
              lead.auth,
            )
          ).statusCode,
          404,
        );
        assert.equal(
          (
            await request("/auth/invitation", "POST", {
              token: link.json().invitationUrl.split("#einladung=")[1],
              password,
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await request(
              `/events/${event}/users/${pending.id}/invitation`,
              "POST",
            )
          ).statusCode,
          409,
        );
      },
    );
    await t.test(
      "Gleichzeitige Einladungsannahme/Erneuerung ohne Deadlock oder neuen Link nach Kennwortsetzung",
      async () => {
        const pending = (
          await request(`/events/${event}/users`, "POST", {
            login: "review-concurrent",
            displayName: "Synthetisch gleichzeitig",
          })
        ).json();
        const password = randomBytes(20).toString("hex");
        const [consume, renew] = await Promise.all([
          request("/auth/invitation", "POST", {
            token: pending.invitationUrl.split("#einladung=")[1],
            password,
          }),
          request(
            `/events/${event}/users/${pending.id}/invitation`,
            "POST",
            undefined,
            lead.auth,
          ),
        ]);
        assert([200, 401].includes(consume.statusCode), consume.body);
        assert([200, 409].includes(renew.statusCode), renew.body);
        assert(!(consume.statusCode === 200 && renew.statusCode === 200));
        if (renew.statusCode === 200)
          assert.equal(
            (
              await request("/auth/invitation", "POST", {
                token: renew.json().invitationUrl.split("#einladung=")[1],
                password,
              })
            ).statusCode,
            200,
          );
      },
    );
    await t.test(
      "Showzuordnung, Mitgliedschaft und Eventzuordnung sind ohne Datenbankeingriff widerrufbar",
      async () => {
        await request(`/shows/${show}/teams`, "POST", { teamId: team });
        assert.equal(
          (
            await request(`/shows/${show}`, "GET", undefined, member.auth)
          ).json().canEdit,
          true,
        );
        assert.equal(
          (
            await request(
              `/shows/${show}/teams/${team}`,
              "DELETE",
              undefined,
              lead.auth,
            )
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await request(`/shows/${show}`, "GET", undefined, member.auth)
          ).json().canEdit,
          false,
        );
        await request(`/shows/${show}/teams`, "POST", { teamId: team });
        assert.equal(
          (
            await request(
              membership + "/" + member.id,
              "DELETE",
              undefined,
              lead.auth,
            )
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await request(`/shows/${show}`, "GET", undefined, member.auth)
          ).json().canEdit,
          false,
        );
        await request(membership, "POST", { userId: member.id }, lead.auth);
        assert.equal(
          (
            await request(
              `/events/${event}/teams/${team}`,
              "DELETE",
              undefined,
              member.auth,
            )
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await request(
              `/events/${event}/teams/${team}`,
              "DELETE",
              undefined,
              lead.auth,
            )
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await request(`/shows/${show}`, "GET", undefined, member.auth)
          ).json().canEdit,
          false,
        );
        assert.equal(
          (
            await f.db.query(
              "SELECT count(*)::int n FROM show_teams WHERE show_id=$1",
              [show],
            )
          ).rows[0].n,
          0,
        );
      },
    );
  } finally {
    await f.close();
  }
});
