#!/bin/sh
set -eu
# Prepared daily runner. Installing/enabling a production timer is a separate action.
# Arguments: private stack.env, existing archive directory, independent password file.
env_file=${1:?private stack.env required}
archive_root=${2:?existing archive directory required}
password_file=${3:?private independent password file required}
base=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
umask 077
for tool in node docker flock; do command -v "$tool" >/dev/null || { echo 'Node, Docker Compose oder flock fehlt.' >&2; exit 1; }; done
[ -f "$env_file" ] && [ -f "$password_file" ] && [ -d "$archive_root" ] || { echo 'Private Konfiguration, Kennwortdatei oder Sicherungsziel fehlt.' >&2; exit 1; }
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
node "$base/scripts/backup-vault.mjs" seal "$stage/data" "$archive" "$env_file" < "$password_file"
printf '%s\n' 'Verschlüsselte Sicherung erstellt. Externe Kopie, separates Kennwortziel und isolierten Restore gesondert prüfen. Kein Netcup-Backupnachweis.'
