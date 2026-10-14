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
compose stop app worker
trap 'compose up -d app worker >/dev/null' EXIT
compose exec -T postgres pg_dump -U shownight -d shownight --format=custom --no-owner --no-privileges > "$backup_dir/database.dump"
compose run --rm --no-deps --entrypoint tar app -C /data/media -cf - . > "$backup_dir/media.tar"
(cd "$backup_dir" && sha256sum database.dump media.tar > SHA256SUMS)
printf '%s\n' 'Backup erstellt. MFA-Schlüssel und private Konfiguration separat verschlüsselt sichern; externe Kopie und Restore prüfen.'
