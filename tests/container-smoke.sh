#!/bin/sh
set -eu
mkdir -p .local/container
umask 077
db_secret=$(openssl rand -hex 32)
mfa_secret=$(openssl rand -hex 32)
cat > .local/container/stack.env <<EOF
STACK_NAME=shownight-ci
SHOWNIGHT_IMAGE=shownight:ci
POSTGRES_PASSWORD=$db_secret
MFA_ENCRYPTION_KEY=$mfa_secret
PUBLIC_BASE_URL=http://localhost:3000
PROXY_NETWORK_NAME=shownight-ci-proxy
DB_VOLUME_NAME=shownight-ci-database
MEDIA_VOLUME_NAME=shownight-ci-media
DEMO_ENABLED=true
EOF
docker network create shownight-ci-proxy
compose() { docker compose --env-file .local/container/stack.env -f deploy/compose.yaml "$@"; }
compose config --quiet
compose up -d --wait postgres
compose run --rm app node dist/api/cli.js migrate
admin_secret=$(openssl rand -hex 24)
compose run --rm -e BOOTSTRAP_LOGIN=admin -e BOOTSTRAP_PASSWORD="$admin_secret" app node dist/api/cli.js bootstrap
compose run --rm app node dist/api/cli.js demo
compose up -d --wait app worker
compose exec -T app node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
# Issue #33: die feste Ablage für Softwareupdates muss Sicherung und Wiederherstellung überstehen.
compose exec -T app sh -c 'set -eu; d=/data/media/software-updates/windows-x64; mkdir -p "$d/0.0.1" "$d/.upload-0123456789ab"; printf MZsynthetisch > "$d/0.0.1/ShowNight-Streaming-Setup-x64.exe"; printf "{}" > "$d/0.0.1/manifest.json"; printf MZ > "$d/.upload-0123456789ab/ShowNight-Streaming-Setup-x64.exe"'
# Backup/restore through the exact documented shell scripts, into fresh volumes.
backup_password=$(openssl rand -hex 32)
mkdir .local/container/encrypted
printf '%s' "$backup_password" > .local/container/backup-password
sh deploy/backup-run.sh "$PWD/.local/container/stack.env" "$PWD/.local/container/encrypted" "$PWD/.local/container/backup-password"
set -- .local/container/encrypted/shownight-*.snbackup
[ "$#" -eq 1 ]
printf '%s' "$backup_password" | node scripts/backup-vault.mjs open "$1" "$PWD/.local/container/recovered"
unset backup_password
sed -e 's/shownight-ci$/shownight-restore/' -e 's/shownight-ci-database/shownight-restore-database/' -e 's/shownight-ci-media/shownight-restore-media/' .local/container/recovered/stack.env > .local/container/restore.env
RESTORE_CONFIRM=EMPTY_ISOLATED_STACK sh deploy/restore.sh "$PWD/.local/container/restore.env" "$PWD/.local/container/recovered"
docker compose --env-file .local/container/restore.env -f deploy/compose.yaml run --rm app node dist/api/cli.js migrate
docker compose --env-file .local/container/restore.env -f deploy/compose.yaml run --rm app node --input-type=module -e "import pg from 'pg';import {createHash} from 'node:crypto';import{readFile}from'node:fs/promises';const db=new pg.Pool({connectionString:process.env.DATABASE_URL});const rows=await db.query('SELECT blob_key,sha256 FROM media');if(!rows.rowCount)throw Error('Medien fehlen');for(const m of rows.rows){const h=createHash('sha256').update(await readFile('/data/media/'+m.blob_key)).digest('hex');if(h!==m.sha256)throw Error('Hash falsch')}await db.end();"
docker compose --env-file .local/container/restore.env -f deploy/compose.yaml run --rm --no-deps --entrypoint sh app -c 'test "$(cat /data/media/software-updates/windows-x64/0.0.1/ShowNight-Streaming-Setup-x64.exe)" = MZsynthetisch'
compose stop postgres
compose exec -T app node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>{if(r.status!==503)process.exit(1)}).catch(()=>process.exit(1))"
compose start postgres
compose up -d --wait app worker
echo 'Container-Build, Start, Migration, Worker, Backup/Restore und Readiness geprüft. Kein Netcup-Deployment.'
