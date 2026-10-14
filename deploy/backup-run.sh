#!/bin/sh
set -eu
# Prepared daily runner. Installing/enabling a production timer is a separate action.
# Arguments: private stack.env, existing archive directory, independent password file.
env_file=${1:?private stack.env required}
archive_root=${2:?existing archive directory required}
password_file=${3:?private independent password file required}
command -v node >/dev/null || { echo 'Node fehlt.' >&2; exit 1; }
# Open without following a final symlink or blocking on a FIFO. Validate the actual
# open descriptor before any Docker/maintenance action, then inherit that same file.
exec node -e '
const fs = require("node:fs"), {spawnSync} = require("node:child_process");
let fd;
try {
  fd = fs.openSync(process.argv[3], fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  const st = fs.fstatSync(fd);
  const mode = st.mode & 0o7777;
  if (!st.isFile() || st.uid !== process.getuid() || (mode !== 0o400 && mode !== 0o600)) throw Error();
} catch {
  if (fd !== undefined) fs.closeSync(fd);
  process.stderr.write("Unsichere Kennwortdatei: reguläre eigene Datei ohne Symlink mit Modus 0400 oder 0600 erforderlich.\n");
  process.exit(1);
}
try {
  const child = spawnSync("sh", ["-c", fs.readFileSync(0, "utf8"), process.argv[4], ...process.argv.slice(1, 4)],
    {stdio: ["ignore", "inherit", "inherit", fd]});
  process.exitCode = child.status ?? 1;
} finally { fs.closeSync(fd); }
' "$env_file" "$archive_root" "$password_file" "$0" <<'SHOWNIGHT_VALIDATED_BACKUP'
set -eu
env_file=$1
archive_root=$2
base=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
umask 077
for tool in docker flock; do command -v "$tool" >/dev/null || { echo 'Docker Compose oder flock fehlt.' >&2; exit 1; }; done
[ -f "$env_file" ] && [ -d "$archive_root" ] || { echo 'Private Konfiguration oder Sicherungsziel fehlt.' >&2; exit 1; }
archive_root=$(CDPATH= cd -- "$archive_root" && pwd)
# Never overlap maintenance runs. flock is from the free util-linux package.
exec 9>"$env_file.backup.lock"
flock -n 9 || { echo 'Andere Sicherung läuft; keine zweite Unterbrechung.' >&2; exit 1; }
stage=$(mktemp -d "${TMPDIR:-/tmp}/shownight-backup-XXXXXXXX")
cleanup() {
  code=$?
  trap - EXIT
  # Only this invocation's fixed staging files, never a recursive computed deletion.
  for name in database.dump media.tar SHA256SUMS; do rm -f -- "$stage/data/$name"; done
  rmdir -- "$stage/data" 2>/dev/null || true
  rmdir -- "$stage" 2>/dev/null || true
  exit "$code"
}
trap cleanup EXIT
sh "$base/deploy/backup.sh" "$env_file" "$stage/data"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$archive_root/shownight-$stamp-$(basename "$stage").snbackup"
node "$base/scripts/backup-vault.mjs" seal "$stage/data" "$archive" "$env_file" <&3
printf '%s\n' 'Verschlüsselte Sicherung erstellt. Externe Kopie, separates Kennwortziel und isolierten Restore gesondert prüfen. Kein Netcup-Backupnachweis.'
SHOWNIGHT_VALIDATED_BACKUP
