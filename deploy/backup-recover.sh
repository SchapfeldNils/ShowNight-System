#!/bin/sh
set -eu
# Wiederanlauf nach abgebrochener Sicherung (systemd ExecStopPost, auch manuell nutzbar).
# Startet App/Worker nur, wenn deploy/backup.sh sie gestoppt und den Wiederanlauf
# nicht bestätigt hat (Markierung "<stack.env>.backup-stopped"). Sonst keine Aktion:
# vorher bewusst gestoppte Dienste werden nicht automatisch gestartet.
# Aufruf: sh deploy/backup-recover.sh /absolute/private/stack.env
env_file=${1:?private env file required}
marker="$env_file.backup-stopped"
[ -e "$marker" ] || exit 0
compose_file=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/compose.yaml
if docker compose --env-file "$env_file" -f "$compose_file" up -d --wait app worker >/dev/null; then
  rm -f -- "$marker"
  echo 'App und Worker nach abgebrochener Sicherung wieder gestartet; Sicherung prüfen.' >&2
  exit 0
fi
echo 'Wiederanlauf von App/Worker nach abgebrochener Sicherung nicht bestätigt; Betreiberaktion erforderlich.' >&2
exit 1
