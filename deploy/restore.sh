#!/bin/sh
set -eu
# Use a separate stack with NEW volumes. Refuse any non-empty destination.
env_file=${1:?private env file for isolated restore required}
backup_dir=${2:?backup directory required}
[ "${RESTORE_CONFIRM:-}" = "EMPTY_ISOLATED_STACK" ] || { echo 'RESTORE_CONFIRM=EMPTY_ISOLATED_STACK erforderlich.' >&2; exit 1; }
compose_file=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/compose.yaml
compose() { docker compose --env-file "$env_file" -f "$compose_file" "$@"; }
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
compose up -d --wait postgres
tables=$(compose exec -T postgres psql -U shownight -d shownight -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
[ "$tables" = "0" ] || { echo 'Zieldatenbank ist nicht leer; Wiederherstellung abgebrochen.' >&2; exit 1; }
compose run --rm --no-deps --entrypoint sh app -c 'test -z "$(ls -A /data/media)"' || { echo 'Zielmedienvolume ist nicht leer.' >&2; exit 1; }
# Only the generated root and UUID blob/upload filenames are permitted.
tar -tf "$backup_dir/media.tar" | awk '$0 != "./" && $0 !~ /^\.\/[a-f0-9-]+(\.upload)?$/ {bad=1} END {exit bad}'
compose exec -T postgres pg_restore -U shownight -d shownight --single-transaction --exit-on-error --no-owner --no-privileges < "$backup_dir/database.dump"
compose run --rm -T --no-deps --entrypoint tar app -C /data/media -xf - < "$backup_dir/media.tar"
printf '%s\n' 'Restore abgeschlossen. Mit ORIGINAL-MFA-Schlüssel starten, alle Paketprüfsummen prüfen. Login und Eventrechte in isolierter Umgebung nachweisen.'
