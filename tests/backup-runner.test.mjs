import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Docker-Attrappe für Sicherungs-Tests. Unterstützt die Vorprüfung
// (scripts/stack-check.mjs: config --format json, config --hash, ps -q, inspect).
// TEST_MODE drift-hash / drift-volume simuliert eine abweichende stack.env.
const fakeComposeChecks = `if [ "$1" = inspect ]; then
  shift
  printf '['; first=1
  for id in "$@"; do
    svc=\${id#id-}; hash="hash-$svc"; vol=media-vol
    [ "$svc" = postgres ] && vol=db-vol
    [ "\${TEST_MODE:-}" = drift-hash ] && [ "$svc" = app ] && hash=other-hash
    [ "\${TEST_MODE:-}" = drift-volume ] && [ "$svc" = postgres ] && vol=shownight-database
    [ $first = 1 ] || printf ','; first=0
    printf '{"Config":{"Labels":{"com.docker.compose.config-hash":"%s"}},"Mounts":[{"Type":"volume","Name":"%s"}]}' "$hash" "$vol"
  done
  printf ']\\n'; exit 0
fi
shift 5
printf '%s\\n' "$*" >> "$TEST_LOG"
if [ "$1" = config ]; then
  if [ "$2" = --format ]; then
    printf '%s\\n' '{"services":{"postgres":{"volumes":[{"type":"volume","source":"database"}]},"app":{"volumes":[{"type":"volume","source":"media"}]},"worker":{"volumes":[{"type":"volume","source":"media","read_only":true}]}},"volumes":{"database":{"name":"db-vol"},"media":{"name":"media-vol"}}}'
  else
    for svc in $(printf '%s' "$3" | tr , ' '); do printf '%s hash-%s\\n' "$svc" "$svc"; done
  fi
  exit 0
fi
if [ "$1" = ps ] && [ "$2" = -q ]; then printf 'id-%s\\n' "$3"; exit 0; fi
`;

test(
  "Linux-Wartungsbackup: Dump-/Stopfehler starten Dienste wieder, gestoppte Dienste bleiben aus, Wiederanlauffehler bleibt Fehler, abweichende stack.env stoppt nichts",
  { skip: process.platform === "win32" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "shownight-backup-runner-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    await writeFile(
      join(bin, "docker"),
      `#!/bin/sh
set -eu
${fakeComposeChecks}
case "$1" in
  ps) if [ "$TEST_MODE" = stopped ]; then printf 'postgres\\napp\\n'; else printf 'postgres\\napp\\nworker\\n'; fi ;;
  stop) [ "$TEST_MODE" != stop-fails ] ;;
  exec) [ "$TEST_MODE" != dump-fails ] || exit 1; printf 'synthetic-dump' ;;
  run) printf 'synthetic-media' ;;
  up) [ "$TEST_MODE" != restart-fails ] ;;
  *) exit 1 ;;
esac
`,
      { mode: 0o700 },
    );
    const run = promisify(execFile);
    for (const mode of [
      "ok",
      "stopped",
      "dump-fails",
      "stop-fails",
      "restart-fails",
      "drift-hash",
      "drift-volume",
    ]) {
      const log = join(root, mode + ".log");
      const task = run(
        "sh",
        [
          resolve("deploy/backup.sh"),
          join(root, "stack.env"),
          join(root, mode),
        ],
        {
          env: {
            ...process.env,
            PATH: bin + ":" + process.env.PATH,
            TEST_LOG: log,
            TEST_MODE: mode,
          },
        },
      );
      if (mode === "ok") await task;
      else await assert.rejects(task);
      const calls = await readFile(log, "utf8");
      if (mode === "stopped" || mode.startsWith("drift-")) {
        // Nothing is stopped or restarted when the env file does not match.
        assert.doesNotMatch(calls, /stop|up -d|exec|run /);
      } else {
        assert.match(calls, /up -d --wait app worker/);
      }
    }
  },
);

test(
  "Linux-Runner: unsichere Kennwortdateien vor Docker abweisen, sichere offene Datei bei Pfadersetzung erhalten",
  { skip: process.platform === "win32", timeout: 30000 },
  async () => {
    const { chmod, symlink, readdir } = await import("node:fs/promises");
    const { openBackup } = await import("../scripts/backup-vault.mjs");
    const root = await mkdtemp(join(tmpdir(), "shownight-password-runner-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    await writeFile(join(root, "stack.env"), "SYNTHETIC_CONFIG=fixture\n", {
      mode: 0o600,
    });
    await writeFile(
      join(bin, "docker"),
      `#!/bin/sh
set -eu
${fakeComposeChecks}
case "$1" in
  ps) printf 'postgres\\napp\\nworker\\n' ;;
  stop) if [ "$TEST_REPLACE" = yes ]; then mv "$TEST_PASSWORD" "$TEST_PASSWORD.old"; printf 'different-synthetic-password-123456' > "$TEST_PASSWORD"; fi ;;
  exec) printf 'synthetic-dump' ;;
  run) printf 'synthetic-media' ;;
  up) : ;;
  *) exit 1 ;;
esac
`,
      { mode: 0o700 },
    );
    const run = promisify(execFile);
    const password = "synthetic-runner-password-123456";
    for (const kind of [
      "0644",
      "0640",
      "directory",
      "symlink",
      "fifo",
      "0400",
      "0600",
      "replaced",
    ]) {
      const secret = join(root, "password-" + kind);
      const archiveRoot = join(root, "archives-" + kind);
      const log = join(root, kind + ".log");
      await mkdir(archiveRoot);
      if (kind === "directory") await mkdir(secret);
      else if (kind === "symlink") {
        await writeFile(secret + ".target", password, { mode: 0o600 });
        await symlink(secret + ".target", secret);
      } else if (kind === "fifo") await run("mkfifo", [secret]);
      else {
        await writeFile(secret, password, { mode: 0o600 });
        await chmod(
          secret,
          kind === "0400"
            ? 0o400
            : kind === "0644"
              ? 0o644
              : kind === "0640"
                ? 0o640
                : 0o600,
        );
      }
      const task = run(
        "sh",
        [
          resolve("deploy/backup-run.sh"),
          join(root, "stack.env"),
          archiveRoot,
          secret,
        ],
        {
          timeout: 10000,
          env: {
            ...process.env,
            PATH: bin + ":" + process.env.PATH,
            TEST_LOG: log,
            TEST_PASSWORD: secret,
            TEST_REPLACE: kind === "replaced" ? "yes" : "no",
          },
        },
      );
      if (!["0400", "0600", "replaced"].includes(kind)) {
        await assert.rejects(task, (error) => {
          assert.match(error.stderr, /Unsichere Kennwortdatei/);
          assert.doesNotMatch(error.stderr, new RegExp(password));
          return true;
        });
        await assert.rejects(readFile(log), { code: "ENOENT" });
        assert.deepEqual(await readdir(archiveRoot), []);
      } else {
        await task;
        assert.match(await readFile(log, "utf8"), /stop app worker/);
        const files = await readdir(archiveRoot);
        assert.equal(files.length, 1);
        assert.match(files[0], /\.snbackup$/);
        const restored = join(root, "restored-" + kind);
        await openBackup(join(archiveRoot, files[0]), restored, password);
        assert.equal(
          await readFile(join(restored, "stack.env"), "utf8"),
          "SYNTHETIC_CONFIG=fixture\n",
        );
        if (kind === "replaced")
          assert.notEqual(await readFile(secret, "utf8"), password);
      }
    }
  },
);
