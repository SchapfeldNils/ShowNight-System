import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, multipartFile } from "./fixture.js";
import { totp } from "../apps/api/src/security.js";
import { processMedia } from "../apps/api/src/worker.js";
import { migrate } from "../apps/api/src/db.js";
import { PackageStore } from "../apps/local/src/store.js";

test("S3-06: PostgreSQL-Szenen, echte Leases, Rechte, Kopie und SQLite-Paketimport", async (t) => {
  const f = await fixture(55437);
  let cookie = "",
    csrf = "";
  const req = (
    path: string,
    method = "GET",
    payload?: unknown,
    as = { cookie, csrf },
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
  let secret = "",
    show: any,
    scene: any,
    another: any,
    lease: any,
    mediaId = "",
    eventId = "",
    copyId = "";
  const login = async () => {
    const first = (
      await req("/auth/login", "POST", {
        login: "admin",
        password: f.adminPassword,
      })
    ).json();
    secret ||= first.secret;
    const verified = await req("/auth/mfa/verify", "POST", {
      challenge: first.challenge,
      code: totp(secret),
    });
    assert.equal(verified.statusCode, 200, verified.body);
    return {
      cookie: "sn_session=" + verified.cookies[0].value,
      csrf: verified.json().csrfToken,
    };
  };
  const ok = async (path: string, method = "GET", payload?: unknown) => {
    const r = await req(path, method, payload);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  try {
    ({ cookie, csrf } = await login());
    // A second synthetic authenticated session avoids reusing the first TOTP,
    // which the real MFA implementation correctly rejects as a replay.
    const { hash } = await import("../apps/api/src/security.js");
    const secondRaw = randomBytes(32).toString("hex"),
      secondCsrf = randomBytes(24).toString("hex");
    await f.db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at,mfa_verified,csrf_token) SELECT $1,id,now()+interval '1 hour',true,$2 FROM users WHERE login='admin'",
      [hash(secondRaw), secondCsrf],
    );
    const secondSession = {
      cookie: "sn_session=" + secondRaw,
      csrf: secondCsrf,
    };
    await t.test(
      "Leere und bestehende Migration idempotent; exklusive Sitzungssperre, anderer Szene unabhängig",
      async () => {
        await migrate(f.db);
        assert.equal(
          (await f.app.inject({ url: "/health/ready" })).json().schemaVersion,
          11,
        );
        show = await ok("/shows", "POST", {
          name: "Synthetische Szenenvorlage",
        });
        scene = await ok(`/shows/${show.id}/scenes`, "POST", { name: "Titel" });
        another = await ok(`/shows/${show.id}/scenes`, "POST", {
          name: "Abschluss",
        });
        const race = await Promise.all([
          req(`/scenes/${scene.id}/lease`, "POST"),
          req(`/scenes/${scene.id}/lease`, "POST"),
        ]);
        assert.deepEqual(race.map((r) => r.statusCode).sort(), [200, 409]);
        lease = race.find((r) => r.statusCode === 200)!.json();
        assert.equal(
          (
            await req(
              `/scenes/${scene.id}/lease`,
              "POST",
              undefined,
              secondSession,
            )
          ).statusCode,
          409,
        );
        assert.equal(
          (
            await req(
              `/scenes/${another.id}/lease`,
              "POST",
              undefined,
              secondSession,
            )
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await req(
              `/scenes/${scene.id}`,
              "PATCH",
              {
                expectedRevision: 1,
                leaseToken: lease.leaseToken,
                definition: scene.definition,
              },
              secondSession,
            )
          ).statusCode,
          409,
        );
        assert.equal(
          (
            await req(
              `/scenes/${scene.id}/lease`,
              "PATCH",
              { leaseToken: lease.leaseToken },
              { cookie, csrf: "wrong" },
            )
          ).statusCode,
          403,
        );
        const token = (
          await f.db.query(
            "SELECT token_hash FROM scene_leases WHERE scene_id=$1",
            [scene.id],
          )
        ).rows[0].token_hash;
        assert.notEqual(token, lease.leaseToken);
        assert.ok(
          !(await ok(`/shows/${show.id}/scenes`)).some(
            (s: any) => s.leaseToken,
          ),
        );
      },
    );
    await t.test(
      "Rechte/Medienbereich, eigenständige Revision, konkurrierendes Speichern und Ablauffreigabe",
      async () => {
        const upload = multipartFile(f.demoPng);
        const up = await f.app.inject({
          url: `/api/v1/media/uploads?showId=${show.id}`,
          method: "POST",
          headers: {
            origin: f.cfg.origin,
            cookie,
            "x-csrf-token": csrf,
            "content-type": upload.contentType,
          },
          payload: upload.payload,
        });
        assert.equal(up.statusCode, 200, up.body);
        mediaId = up.json().id;
        await processMedia(f.db, f.cfg);
        const common = {
          id: randomUUID(),
          name: "Bild",
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          opacity: 1,
          visible: true,
        };
        const definition = {
          ...scene.definition,
          layers: [
            { ...common, kind: "image", mediaId, fit: "contain" },
            {
              ...common,
              id: randomUUID(),
              kind: "text",
              name: "Titeltext",
              text: "Synthetischer Titel",
              fontSize: 90,
              color: "#ffffff",
            },
          ],
        };
        const payload = {
          expectedRevision: 1,
          leaseToken: lease.leaseToken,
          definition,
        };
        const race = await Promise.all([
          req(`/scenes/${scene.id}`, "PATCH", payload),
          req(`/scenes/${scene.id}`, "PATCH", payload),
        ]);
        assert.deepEqual(race.map((r) => r.statusCode).sort(), [200, 409]);
        scene = race.find((r) => r.statusCode === 200)!.json();
        assert.equal(scene.revision, 2);
        assert.equal(
          race.find((r) => r.statusCode === 409)!.json().error.details.current
            .revision,
          2,
        );
        const foreign = await ok("/shows", "POST", {
          name: "Fremder Medienbereich",
        });
        const up2 = await f.app.inject({
          url: `/api/v1/media/uploads?showId=${foreign.id}`,
          method: "POST",
          headers: {
            origin: f.cfg.origin,
            cookie,
            "x-csrf-token": csrf,
            "content-type": upload.contentType,
          },
          payload: upload.payload,
        });
        const bad = await req(`/scenes/${scene.id}`, "PATCH", {
          ...payload,
          expectedRevision: 2,
          definition: {
            ...definition,
            layers: [{ ...definition.layers[0], mediaId: up2.json().id }],
          },
        });
        assert.equal(bad.statusCode, 400, bad.body);
        await f.db.query(
          "UPDATE scene_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE scene_id=$1",
          [scene.id],
        );
        assert.equal(
          (
            await req(`/scenes/${scene.id}/lease`, "PATCH", {
              leaseToken: lease.leaseToken,
            })
          ).statusCode,
          409,
        );
        const acquired = await req(
          `/scenes/${scene.id}/lease`,
          "POST",
          undefined,
          secondSession,
        );
        assert.equal(acquired.statusCode, 200);
        lease = acquired.json();
        assert.equal(
          (
            await req(`/scenes/${scene.id}`, "PATCH", {
              ...payload,
              expectedRevision: 2,
            })
          ).statusCode,
          409,
        );
        assert.equal(
          (
            await req(
              `/scenes/${scene.id}/lease`,
              "DELETE",
              { leaseToken: lease.leaseToken },
              secondSession,
            )
          ).statusCode,
          200,
        );
      },
    );
    await t.test(
      "Szene wiederverwenden, unabhängig kopieren, v2 samt Medien importieren und nach Neustart lesen",
      async () => {
        show = await ok(`/shows/${show.id}`);
        const cue = {
          id: randomUUID(),
          name: "Titel einsetzen",
          sceneId: scene.id,
        };
        assert.equal(
          (
            await req(`/shows/${show.id}`, "PATCH", {
              expectedRevision: show.revision,
              cues: [{ ...cue, sceneId: randomUUID() }],
            })
          ).statusCode,
          400,
        );
        show = await ok(`/shows/${show.id}`, "PATCH", {
          expectedRevision: show.revision,
          cues: [cue, { ...cue, id: randomUUID(), name: "Titel erneut" }],
        });
        eventId = (
          await ok("/events", "POST", { name: "Synthetischer Szenenabend" })
        ).id;
        const copy = await ok(`/events/${eventId}/show-copies`, "POST", {
          sourceShowId: show.id,
          sourceRevision: show.revision,
        });
        copyId = copy.id;
        const copied = await ok(`/shows/${copy.id}/scenes`);
        assert.notEqual(copy.cues[0].sceneId, scene.id);
        assert.equal(copy.cues[0].sceneId, copy.cues[1].sceneId);
        const copiedScene = copied.find(
          (s: any) => s.id === copy.cues[0].sceneId,
        );
        assert.notEqual(
          copiedScene.definition.layers[0].id,
          scene.definition.layers[0].id,
        );
        assert.equal(copiedScene.definition.layers[0].mediaId, mediaId);
        const failedUpload = multipartFile(
          f.demoPng.subarray(0, 24),
        );
        const unused = await f.app.inject({
          url: `/api/v1/media/uploads?eventId=${eventId}`,
          method: "POST",
          headers: {
            origin: f.cfg.origin,
            cookie,
            "x-csrf-token": csrf,
            "content-type": failedUpload.contentType,
          },
          payload: failedUpload.payload,
        });
        assert.equal(unused.statusCode, 200, unused.body);
        await processMedia(f.db, f.cfg);
        await processMedia(f.db, f.cfg);
        assert.equal((await ok(`/media/${unused.json().id}`)).status, "failed");
        const m = await ok(`/events/${eventId}/packages`, "POST");
        assert.ok(m.media.some((asset: any) => asset.id === mediaId));
        assert.ok(!m.media.some((asset: any) => asset.id === unused.json().id));
        await f.db.query("UPDATE media SET status='failed' WHERE id=$1", [
          mediaId,
        ]);
        const blocked = await req(`/events/${eventId}/packages`, "POST");
        assert.equal(
          blocked.json().status,
          "invalid",
          "Referenced scene media must block packaging",
        );
        await f.db.query("UPDATE media SET status='ready' WHERE id=$1", [
          mediaId,
        ]);
        assert.equal(m.schemaVersion, 2);
        assert.equal(m.status, "valid");
        assert.equal(m.scenes.length, 2);
        const download = await req(`/packages/${m.id}/download`);
        assert.equal(download.statusCode, 200, download.body.slice(0, 100));
        const root = join(f.dir, "scene-store"),
          path = join(f.dir, "scene.snpkg");
        await mkdir(root);
        await writeFile(path, download.rawPayload);
        let store = new PackageStore(root);
        try {
          await store.importArchive(path);
          assert.deepEqual(store.metadata(m.id).manifest.scenes, m.scenes);
          assert.equal((await store.verify(m.id)).status, "valid");
        } finally {
          store.close();
        }
        store = new PackageStore(root);
        try {
          assert.equal(
            store.metadata(m.id).manifest.shows[0].cues[0].sceneId,
            copiedScene.id,
          );
        } finally {
          store.close();
        }
        lease = await ok(`/scenes/${scene.id}/lease`, "POST");
        await ok(`/scenes/${scene.id}`, "PATCH", {
          expectedRevision: 2,
          leaseToken: lease.leaseToken,
          definition: { ...scene.definition, name: "Geänderte Quelle" },
        });
        assert.equal(
          (await ok(`/shows/${copy.id}/scenes`)).find(
            (s: any) => s.id === copiedScene.id,
          ).definition.name,
          "Titel",
        );
      },
    );
    await t.test(
      "Nicht berechtigtes Mitglied und abgemeldete Sitzung können Sperre/Inhalt nicht ändern",
      async () => {
        const invitation = await ok(`/events/${eventId}/users`, "POST", {
          login: "scene-member",
          displayName: "Synthetisches Mitglied",
        });
        await ok("/auth/invitation", "POST", {
          token: invitation.invitationUrl.split("#einladung=")[1],
          password: "synthetic-" + randomBytes(20).toString("hex"),
        });
        // Direct fixture identity is only for a synthetic session; requests still
        // go through actual authentication and current show/lease authorization.
        const { hash } = await import("../apps/api/src/security.js");
        const raw = randomBytes(32).toString("hex"),
          token = randomBytes(24).toString("hex");
        await f.db.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at,mfa_verified,csrf_token) VALUES($1,$2,now()+interval '1 hour',false,$3)",
          [hash(raw), invitation.id, token],
        );
        const member = { cookie: "sn_session=" + raw, csrf: token };
        assert.equal(
          (await req(`/shows/${show.id}/scenes`, "GET", undefined, member))
            .statusCode,
          404,
        );
        assert.equal(
          (await req(`/scenes/${scene.id}/lease`, "POST", undefined, member))
            .statusCode,
          404,
        );
        const readable = await req(
          `/shows/${copyId}/scenes`,
          "GET",
          undefined,
          member,
        );
        assert.equal(readable.statusCode, 200);
        const target = readable.json()[0];
        assert.equal(
          (await req(`/scenes/${target.id}/lease`, "POST", undefined, member))
            .statusCode,
          403,
        );
        const team = await ok(`/events/${eventId}/teams`, "POST", {
          name: "Synthetisches Szenenteam",
        });
        await ok(`/events/${eventId}/teams/${team.id}/members`, "POST", {
          userId: invitation.id,
        });
        await ok(`/shows/${copyId}/teams`, "POST", { teamId: team.id });
        const acquired = await req(
          `/scenes/${target.id}/lease`,
          "POST",
          undefined,
          member,
        );
        assert.equal(acquired.statusCode, 200, acquired.body);
        await f.db.query(
          "DELETE FROM show_teams WHERE show_id=$1 AND team_id=$2",
          [copyId, team.id],
        );
        assert.equal(
          (
            await req(
              `/scenes/${target.id}`,
              "PATCH",
              {
                expectedRevision: target.revision,
                leaseToken: acquired.json().leaseToken,
                definition: target.definition,
              },
              member,
            )
          ).statusCode,
          403,
        );
        await ok("/auth/logout", "POST");
        assert.equal(
          (
            await req(`/scenes/${scene.id}/lease`, "PATCH", {
              leaseToken: lease.leaseToken,
            })
          ).statusCode,
          401,
        );
      },
    );
  } finally {
    await f.close();
  }
});
