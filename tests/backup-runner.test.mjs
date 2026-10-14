import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test(
  "Linux-Wartungsbackup: Dump-/Stopfehler starten Dienste wieder, gestoppte Dienste bleiben aus, Wiederanlauffehler bleibt Fehler",
  { skip: process.platform === "win32" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "shownight-backup-runner-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    await writeFile(
      join(bin, "docker"),
      `#!/bin/sh
set -eu
shift 5
printf '%s\\n' "$*" >> "$TEST_LOG"
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
      if (mode === "stopped") {
        assert.doesNotMatch(calls, /stop|up -d/);
      } else {
        assert.match(calls, /up -d --wait app worker/);
      }
    }
  },
);
