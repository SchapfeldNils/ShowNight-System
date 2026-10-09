import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  writeFile,
  readFile,
  mkdir,
  copyFile,
  readdir,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fixture, multipartFile } from "./fixture.js";
import { bootstrap } from "../apps/api/src/auth.js";
import { migrate, database } from "../apps/api/src/db.js";
import { hash, totp } from "../apps/api/src/security.js";
import { seedDemo } from "../apps/api/src/demo.js";
import { processMedia, processMail } from "../apps/api/src/worker.js";
import { blobPath, fileHash } from "../apps/api/src/media.js";
test("S1 mit echtem PostgreSQL, Originaldateien und isoliertem Restore", async (t) => {
  const f = await fixture();
  const { app, db, cfg } = f;
  let cookie = "",
    csrf = "";
  let eventId = "",
    otherId = "",
    sourceId = "",
    copyId = "",
    mediaId = "",
    packageId = "",
    teamId = "",
    leadId = "",
    leadCookie = "",
    leadCsrf = "",
    memberId = "",
    memberCookie = "",
    memberCsrf = "";
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    as = { cookie, csrf },
  ) =>
    app.inject({
      url: "/api/v1" + path,
      method: method as any,
      headers: {
        origin: cfg.origin,
        cookie: as.cookie,
        "x-csrf-token": as.csrf,
      },
      ...(body === undefined ? {} : { payload: body as any }),
    });
  async function enroll(login: string, password: string) {
    const r = await request(
      "/auth/login",
      "POST",
      { login, password },
      { cookie: "", csrf: "" },
    );
    assert.equal(r.statusCode, 200, r.body);
    const c = r.json();
    assert.equal(c.authenticated, false);
    const verified = await request(
      "/auth/mfa/verify",
      "POST",
      { challenge: c.challenge, code: totp(c.secret) },
      { cookie: "", csrf: "" },
    );
    assert.equal(verified.statusCode, 200, verified.body);
    return {
      cookie: "sn_session=" + verified.cookies[0].value,
      csrf: verified.json().csrfToken,
      codes: verified.json().recoveryCodes,
      secret: c.secret,
    };
  }
  async function invite(login: string) {
    const r = await request("/events/" + eventId + "/users", "POST", {
      login,
      displayName: "Synthetisch " + login,
    });
    assert.equal(r.statusCode, 200, r.body);
    const userId = r.json().id,
      token = r.json().invitationUrl.split("#einladung=")[1],
      pw = randomBytes(20).toString("hex");
    assert.equal(
      (await request("/auth/invitation", "POST", { token, password: pw }))
        .statusCode,
      200,
    );
    assert.equal(
      (await request("/auth/invitation", "POST", { token, password: pw }))
        .statusCode,
      401,
    );
    return { userId, pw };
  }
  try {
    await t.test(
      "S1-02: versionierte Migration wiederholbar, Demo idempotent, Neustart erhält Daten",
      async () => {
        await migrate(db);
        assert.equal((await seedDemo(db, cfg)).created, true);
        assert.equal((await seedDemo(db, cfg)).created, false);
        await migrate(db);
        assert.equal((await app.inject("/health/ready")).statusCode, 200);
        await processMedia(db, cfg);
        await f.pg.stop();
        await f.pg.start();
        await migrate(db);
        const second = database(cfg.DATABASE_URL);
        assert.equal(
          (await second.query("SELECT count(*)::int n FROM events")).rows[0].n,
          1,
        );
        await second.end();
      },
    );
    await t.test(
      "S1-03: Bootstrap einmalig; keine Sitzung vor MFA; falsche Codes; Recovery und Replay",
      async () => {
        await assert.rejects(() =>
          bootstrap(db, "second", "Second", randomBytes(20).toString("hex")),
        );
        assert.equal(
          (await request("/auth/bootstrap", "POST", {})).statusCode,
          404,
        );
        assert.equal(
          (
            await request("/auth/login", "POST", {
              login: "admin",
              password: "wrong",
            })
          ).statusCode,
          401,
        );
        const start = await request("/auth/login", "POST", {
          login: "admin",
          password: f.adminPassword,
        });
        assert(!start.cookies.length);
        assert.equal((await request("/me")).statusCode, 401);
        const c = start.json();
        assert.equal(
          (
            await request("/auth/mfa/verify", "POST", {
              challenge: c.challenge,
              code: "000000",
            })
          ).statusCode,
          401,
        );
        const m = await request("/auth/mfa/verify", "POST", {
          challenge: c.challenge,
          code: totp(c.secret),
        });
        assert.equal(m.statusCode, 200, m.body);
        cookie = "sn_session=" + m.cookies[0].value;
        csrf = m.json().csrfToken;
        assert.equal(m.json().recoveryCodes.length, 8);
        assert.equal(
          (
            await request("/auth/mfa/verify", "POST", {
              challenge: c.challenge,
              code: totp(c.secret),
            })
          ).statusCode,
          401,
        );
        const login2 = await request("/auth/login", "POST", {
          login: "admin",
          password: f.adminPassword,
        });
        const reused = await request("/auth/mfa/verify", "POST", {
          challenge: login2.json().challenge,
          code: totp(c.secret),
        });
        assert.equal(reused.statusCode, 401);
        const recover = await request("/auth/mfa/verify", "POST", {
          challenge: login2.json().challenge,
          code: m.json().recoveryCodes[0],
        });
        assert.equal(recover.statusCode, 200);
        cookie = "sn_session=" + recover.cookies[0].value;
        csrf = recover.json().csrfToken;
        const me = await request("/me");
        assert(me.json().mfaVerified);
        assert(!me.body.includes("password_hash"));
        assert(!me.body.includes(c.secret));
      },
    );
    await t.test(
      "S1-05: Name genügt, Vorlagen und optionale Angaben",
      async () => {
        const r = await request("/events", "POST", {
          name: "Testveranstaltung",
        });
        assert.equal(r.statusCode, 200, r.body);
        eventId = r.json().id;
        assert.equal(r.json().date, null);
        assert.equal(r.json().location, "");
        assert(r.json().modules.includes("shows"));
        otherId = (
          await request("/events", "POST", {
            name: "Zweite Veranstaltung",
            template: "spieleabend",
          })
        ).json().id;
        const team = await request("/events/" + eventId + "/teams", "POST", {
          name: "Testteam",
        });
        assert.equal(team.statusCode, 200, team.body);
        teamId = team.json().id;
        assert.equal(
          (await request("/events/" + eventId + "/teams")).json().length,
          1,
        );
      },
    );
    await t.test(
      "S1-06/08: unabhängige Show und isolierte Kopie; echte parallele Revisionskonflikte",
      async () => {
        sourceId = (
          await request("/shows", "POST", {
            name: "Unabhängige Show",
            description: "Ausgangstext",
          })
        ).json().id;
        const copied = await request(
          "/events/" + eventId + "/show-copies",
          "POST",
          { sourceShowId: sourceId, sourceRevision: 1 },
        );
        assert.equal(copied.statusCode, 200, copied.body);
        copyId = copied.json().id;
        const results = await Promise.all([
          request("/shows/" + sourceId, "PATCH", {
            expectedRevision: 1,
            description: "Fassung A",
          }),
          request("/shows/" + sourceId, "PATCH", {
            expectedRevision: 1,
            description: "Fassung B",
          }),
        ]);
        assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
        const conflict = results.find((r) => r.statusCode === 409)!.json();
        assert.equal(conflict.error.details.current.revision, 2);
        assert.equal(
          (await request("/shows/" + copyId)).json().description,
          "Ausgangstext",
        );
        assert.equal(
          (await request("/shows/" + sourceId + "/history")).json().length,
          2,
        );
        await request("/shows/" + copyId + "/teams", "POST", { teamId });
      },
    );
    await t.test(
      "S1-04: Eventgrenzen, ganze Showteams, Leitung und getrenntes LIVE; MFA nach Rollenwechsel",
      async () => {
        const member = await invite("mitglied");
        memberId = member.userId;
        await request(
          "/events/" + eventId + "/teams/" + teamId + "/members",
          "POST",
          { userId: memberId },
        );
        const login = await request("/auth/login", "POST", {
          login: "mitglied",
          password: member.pw,
        });
        memberCookie = "sn_session=" + login.cookies[0].value;
        memberCsrf = login.json().csrfToken;
        const memberAuth = { cookie: memberCookie, csrf: memberCsrf };
        assert.equal(
          (await request("/events/" + otherId, "GET", undefined, memberAuth))
            .statusCode,
          404,
        );
        assert.equal(
          (await request("/shows/" + sourceId, "GET", undefined, memberAuth))
            .statusCode,
          404,
        );
        assert.equal(
          (
            await request(
              "/events/" + eventId,
              "PATCH",
              { expectedRevision: 1, name: "Angriff" },
              memberAuth,
            )
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await request(
              "/shows/" + copyId,
              "PATCH",
              {
                expectedRevision: 1,
                description: "Team bearbeitet ganze Show",
              },
              memberAuth,
            )
          ).statusCode,
          200,
        );
        const leader = await invite("leitung");
        leadId = leader.userId;
        const before = await request("/auth/login", "POST", {
          login: "leitung",
          password: leader.pw,
        });
        assert(before.json().authenticated);
        await request("/events/" + eventId + "/grants", "POST", {
          userId: leadId,
          role: "leitung",
        });
        assert.equal(
          (
            await request("/me", "GET", undefined, {
              cookie: "sn_session=" + before.cookies[0].value,
              csrf: before.json().csrfToken,
            })
          ).statusCode,
          401,
        );
        const lead = await enroll("leitung", leader.pw);
        leadCookie = lead.cookie;
        leadCsrf = lead.csrf;
        const leaderAuth = { cookie: leadCookie, csrf: leadCsrf };
        const me = (await request("/me", "GET", undefined, leaderAuth)).json();
        assert(me.grants.some((g: any) => g.role === "leitung"));
        assert(!me.grants.some((g: any) => g.role === "live"));
        assert(!me.admin);
        assert.equal(
          (await request("/diagnostics", "GET", undefined, leaderAuth))
            .statusCode,
          403,
        );
        assert.equal(
          (await request("/events/" + otherId, "GET", undefined, leaderAuth))
            .statusCode,
          404,
        );
        const ownedTeam = await request(
          "/events/" + eventId + "/teams",
          "POST",
          { name: "Leitungsteam" },
          leaderAuth,
        );
        assert.equal(ownedTeam.statusCode, 200, ownedTeam.body);
        const ownedTeamId = ownedTeam.json().id;
        const memberPath = `/events/${eventId}/teams/${ownedTeamId}/members`;
        assert.equal(
          (await request(memberPath, "POST", { userId: leadId }, leaderAuth))
            .statusCode,
          200,
        );
        assert.equal(
          (
            await request("/events/" + otherId + "/teams", "POST", {
              teamId: ownedTeamId,
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (await request(memberPath, "POST", { userId: memberId }, leaderAuth))
            .statusCode,
          403,
        );
        assert.equal(
          (await request("/events/" + otherId, "GET", undefined, memberAuth))
            .statusCode,
          404,
        );
        // Also protect independent private shows linked by an administrator.
        await db.query(
          "DELETE FROM event_teams WHERE event_id=$1 AND team_id=$2",
          [otherId, ownedTeamId],
        );
        assert.equal(
          (
            await request("/shows/" + sourceId + "/teams", "POST", {
              teamId: ownedTeamId,
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (await request(memberPath, "POST", { userId: memberId }, leaderAuth))
            .statusCode,
          403,
        );
        assert.equal(
          (await request("/shows/" + sourceId, "GET", undefined, memberAuth))
            .statusCode,
          404,
        );
        await db.query(
          "DELETE FROM show_teams WHERE show_id=$1 AND team_id=$2",
          [sourceId, ownedTeamId],
        );
        assert.equal(
          (
            await request(
              "/shows/" + copyId,
              "PATCH",
              { expectedRevision: 2, name: "Leitung ändert" },
              leaderAuth,
            )
          ).statusCode,
          200,
        );
      },
    );
    await t.test(
      "S1-07: Bild/Video sicher speichern; MIME-Lüge, Größenlimit, Pfad und kaputte Dateien",
      async () => {
        const upload = async (bytes: Buffer, filename: string) => {
          const m = multipartFile(bytes, filename);
          return app.inject({
            url: "/api/v1/media/uploads?showId=" + sourceId,
            method: "POST",
            headers: {
              origin: cfg.origin,
              cookie,
              "x-csrf-token": csrf,
              "content-type": m.contentType,
            },
            payload: m.payload,
          });
        };
        const img = await upload(f.demoPng, "demo.png");
        assert.equal(img.statusCode, 200, img.body);
        mediaId = img.json().id;
        assert.equal(img.json().status, "processing");
        assert.equal(
          (await request("/media/" + mediaId + "/content")).statusCode,
          409,
        );
        await processMedia(db, cfg);
        assert.equal(
          (await request("/media/" + mediaId)).json().status,
          "ready",
        );
        assert.equal(await fileHash(blobPath(cfg, mediaId)), hash(f.demoPng));
        const video = await upload(f.videoBytes, "synthetisch.mp4");
        assert.equal(video.statusCode, 200, video.body);
        await processMedia(db, cfg);
        assert.equal(
          (await request("/media/" + video.json().id)).json().status,
          "ready",
        );
        assert.equal(
          (await upload(Buffer.from("<script>attack</script>"), "fake.png"))
            .statusCode,
          415,
        );
        assert.equal(
          (await upload(f.demoPng, "../attack.png")).statusCode,
          400,
        );
        assert.equal(
          (await upload(Buffer.alloc(5000), "oversize.png")).statusCode,
          413,
        );
        const corrupt = await upload(f.demoPng.subarray(0, 24), "defekt.png");
        assert.equal(corrupt.statusCode, 200);
        await processMedia(db, cfg);
        assert.equal(
          (await request("/media/" + corrupt.json().id)).json().status,
          "failed",
        );
        const content = await app.inject({
          url: "/api/v1/media/" + mediaId + "/content",
          headers: { origin: cfg.origin, cookie, range: "bytes=0-7" },
        });
        assert.equal(content.statusCode, 206);
        assert.deepEqual(content.rawPayload, f.demoPng.subarray(0, 8));
        assert.equal(
          (
            await request("/media/" + mediaId, "GET", undefined, {
              cookie: leadCookie,
              csrf: leadCsrf,
            })
          ).statusCode,
          404,
        );
        // Copy original files into a different access scope without copying private source access.
        const source = await request("/shows/" + sourceId);
        const secondCopy = await request(
          "/events/" + eventId + "/show-copies",
          "POST",
          { sourceShowId: sourceId, sourceRevision: source.json().revision },
        );
        assert.equal(secondCopy.statusCode, 200);
        assert.equal(
          (
            await request("/media/" + mediaId, "GET", undefined, {
              cookie: leadCookie,
              csrf: leadCsrf,
            })
          ).statusCode,
          200,
        );
      },
    );
    await t.test(
      "S1-09: gepinnte Pakete, fehlende/geänderte Dateien; keine Onlineaktivierung",
      async () => {
        // Remove failed attachment from this test copy; no delete API bypass is introduced.
        const failed = (
          await db.query("SELECT id FROM media WHERE status='failed'")
        ).rows[0].id;
        await db.query(
          "DELETE FROM show_media WHERE show_id IN(SELECT id FROM shows WHERE event_id=$1) AND media_id=$2",
          [eventId, failed],
        );
        const p = await request("/events/" + eventId + "/packages", "POST", {});
        assert.equal(p.statusCode, 200, p.body);
        assert.equal(p.json().status, "valid", p.body);
        packageId = p.json().id;
        assert.equal(p.json().liveActivationSupported, false);
        assert(!p.body.includes("password_hash"));
        assert(!p.body.includes(cfg.MFA_ENCRYPTION_KEY));
        await writeFile(blobPath(cfg, mediaId), Buffer.alloc(f.demoPng.length));
        assert.equal(
          (await request("/packages/" + packageId + "/manifest")).json().status,
          "invalid",
        );
        await writeFile(blobPath(cfg, mediaId), f.demoPng);
        await unlink(blobPath(cfg, mediaId));
        assert.equal(
          (await request("/packages/" + packageId + "/manifest")).json().status,
          "invalid",
        );
        await writeFile(blobPath(cfg, mediaId), f.demoPng);
        assert.equal(
          (await request("/activations", "POST", { packageId })).statusCode,
          409,
        );
      },
    );
    await t.test(
      "S1-10: pg_dump/pg_restore in separate leere Datenbank, Medienkopie und Hashvergleich",
      async () => {
        const dump = join(f.dir, "database.dump");
        const pgEnv = {
          ...process.env,
          PGPASSWORD: new URL(cfg.DATABASE_URL).password,
        };
        const args = ["-h", "127.0.0.1", "-p", "55433", "-U", "shownight"];
        const clientDir =
          process.env.PG_BIN_DIR ??
          (process.platform === "win32"
            ? join(
                process.env.LOCALAPPDATA!,
                "ShowNight",
                "tools",
                "pgsql",
                "bin",
              )
            : undefined);
        const pgClient = async (tool: string, options: string[]) => {
          if (clientDir) {
            await promisify(execFile)(
              join(
                clientDir,
                process.platform === "win32" ? `${tool}.exe` : tool,
              ),
              [...args, ...options],
              { env: pgEnv, windowsHide: true },
            );
          } else {
            await promisify(execFile)(
              "docker",
              [
                "run",
                "--rm",
                "--network",
                "host",
                "-e",
                "PGPASSWORD",
                "-v",
                `${f.dir}:/backup`,
                "postgres:17.9-bookworm",
                tool,
                ...args,
                ...options,
              ],
              { env: pgEnv, timeout: 120_000 },
            );
          }
        };
        const clientDump = clientDir ? dump : "/backup/database.dump";
        await pgClient("pg_dump", [
          "-d",
          "shownight_test",
          "-Fc",
          "-f",
          clientDump,
        ]);
        await f.pg.createDatabase("shownight_restore");
        await pgClient("pg_restore", [
          "-d",
          "shownight_restore",
          "--single-transaction",
          "--exit-on-error",
          clientDump,
        ]);
        const restore = database(
          cfg.DATABASE_URL.replace("/shownight_test", "/shownight_restore"),
        );
        await migrate(restore);
        for (const table of [
          "users",
          "grants",
          "teams",
          "shows",
          "media",
          "revisions",
          "packages",
        ])
          assert.deepEqual(
            (
              await restore.query(
                `SELECT * FROM ${table} ORDER BY row_to_json(${table})::text`,
              )
            ).rows,
            (
              await db.query(
                `SELECT * FROM ${table} ORDER BY row_to_json(${table})::text`,
              )
            ).rows,
            table,
          );
        const restoredMedia = join(f.dir, "restored-media");
        await mkdir(restoredMedia);
        for (const filename of await readdir(cfg.MEDIA_ROOT))
          await copyFile(
            join(cfg.MEDIA_ROOT, filename),
            join(restoredMedia, filename),
          );
        for (const m of (
          await restore.query("SELECT blob_key,sha256 FROM media")
        ).rows)
          assert.equal(
            await fileHash(join(restoredMedia, m.blob_key)),
            m.sha256,
          );
        await restore.end();
        assert((await readFile(dump)).length > 0);
      },
    );
    await t.test(
      "Mailwarteschlange: dauerhaft, dedupliziert, simuliert; unterbrochene Übergabe unknown",
      async () => {
        const input = {
          businessKey: "synthetic-test",
          recipient: "demo@example.invalid",
          subject: "Synthetisch",
          text: "Kein Versand",
        };
        assert.equal(
          (await request("/mail-jobs", "POST", input)).statusCode,
          200,
        );
        assert.equal(
          (await request("/mail-jobs", "POST", input)).json().duplicate,
          true,
        );
        await processMail(db, cfg);
        assert.equal(
          (await request("/mail-jobs")).json()[0].status,
          "simulated",
        );
        await db.query(
          "UPDATE mail_jobs SET status='sending',started_at=now()-interval '10 minutes'",
        );
        await processMail(db, cfg);
        assert.equal((await request("/mail-jobs")).json()[0].status, "unknown");
      },
    );
    await t.test(
      "WebSocket: Origin, gefilterter Snapshot, neue Verbindung und widerrufene Sitzung",
      async () => {
        await assert.rejects(() =>
          app.injectWS("/api/v1/status/ws", {
            headers: { origin: cfg.origin },
          }),
        );
        let resolveMessage!: (data: string) => void;
        const message = new Promise<string>((r) => {
          resolveMessage = r;
        });
        const socket = await app.injectWS(
          "/api/v1/status/ws",
          { headers: { origin: cfg.origin, cookie: leadCookie } },
          {
            onInit(ws) {
              ws.once("message", (data: { toString(): string }) =>
                resolveMessage(data.toString()),
              );
            },
          },
        );
        const snapshot = JSON.parse(await message);
        assert.equal(snapshot.type, "snapshot");
        assert(snapshot.events.some((e: any) => e.id === eventId));
        assert(!snapshot.events.some((e: any) => e.id === otherId));
        const closed = new Promise<number>((r) =>
          socket.once("close", (code: number) => r(code)),
        );
        await request("/auth/logout", "POST", undefined, {
          cookie: leadCookie,
          csrf: leadCsrf,
        });
        assert.equal(await closed, 1008);
        let resolveClose!: (code: number) => void;
        const badClose = new Promise<number>((r) => {
          resolveClose = r;
        });
        await app.injectWS(
          "/api/v1/status/ws",
          { headers: { origin: "https://foreign.invalid", cookie } },
          {
            onInit(ws) {
              ws.once("close", (code: number) => resolveClose(code));
            },
          },
        );
        assert.equal(await badClose, 1008);
      },
    );
    await t.test(
      "CSRF/Origin/Rechte und Logout widerrufen Sitzung",
      async () => {
        assert.equal(
          (
            await app.inject({
              url: "/api/v1/events",
              method: "POST",
              headers: {
                cookie,
                origin: "https://attack.invalid",
                "x-csrf-token": csrf,
              },
              payload: { name: "Attack" },
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await app.inject({
              url: "/api/v1/events",
              method: "POST",
              headers: { cookie, origin: cfg.origin },
              payload: { name: "Attack" },
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await request("/auth/logout", "POST", undefined, {
              cookie: memberCookie,
              csrf: memberCsrf,
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await request("/me", "GET", undefined, {
              cookie: memberCookie,
              csrf: memberCsrf,
            })
          ).statusCode,
          401,
        );
      },
    );
    await t.test(
      "S1-11: Datenbankausfall – Liveness bleibt, Readiness 503; Fehler ohne Secrets",
      async () => {
        await f.pg.stop();
        assert.equal((await app.inject("/health/live")).statusCode, 200);
        const r = await app.inject("/health/ready");
        assert.equal(r.statusCode, 503);
        assert(!r.body.includes(new URL(cfg.DATABASE_URL).password));
        await f.pg.start();
      },
    );
  } finally {
    await f.close();
  }
});
