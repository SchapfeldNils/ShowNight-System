#!/bin/sh
set -eu
# Usage: sh deploy/backup.sh /absolute/private/stack.env /absolute/new-backup-dir
env_file=${1:?private env file required}
backup_dir=${2:?new backup directory required}
compose_file=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/compose.yaml
compose() { docker compose --env-file "$env_file" -f "$compose_file" "$@"; }
umask 077
mkdir "$backup_dir"
# A maintenance window ensures DB references and immutable files match.
running=$(compose ps --status running --services)
printf '%s\n' "$running" | grep -qx app && printf '%s\n' "$running" | grep -qx worker || { echo 'App und Worker müssen vor Sicherung laufen; kein automatischer Start bisher gestoppter Dienste.' >&2; exit 1; }
# Before anything is stopped: the env file must match the running stack exactly,
# otherwise the restart below would recreate containers (wrong volume or image).
command -v node >/dev/null || { echo 'Node fehlt für die Vorprüfung; keine Sicherung.' >&2; exit 1; }
node "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/scripts/stack-check.mjs" "$env_file" "$compose_file" postgres app worker
# Marker: this run stopped app/worker. Removed only after a confirmed restart, so
# deploy/backup-recover.sh (systemd ExecStopPost) can restart after a kill.
marker="$env_file.backup-stopped"
restore_services() {
  code=$?
  trap - EXIT INT TERM HUP
  if compose up -d --wait app worker >/dev/null; then
    rm -f -- "$marker"
  else
    echo 'Wiederanlauf von App/Worker nicht bestätigt; Betreiberaktion erforderlich.' >&2
    code=1
  fi
  exit "$code"
}
trap restore_services EXIT
# A plain sh does not run the EXIT trap when killed by a signal.
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
: > "$marker"
compose stop app worker
compose exec -T postgres pg_dump -U shownight -d shownight --format=custom --no-owner --no-privileges > "$backup_dir/database.dump"
compose run --rm --no-deps --entrypoint tar app -C /data/media -cf - . > "$backup_dir/media.tar"
(cd "$backup_dir" && sha256sum database.dump media.tar > SHA256SUMS)
printf '%s\n' 'Backup erstellt. MFA-Schlüssel und private Konfiguration separat verschlüsselt sichern; externe Kopie und Restore prüfen.'
