#!/bin/sh
set -eu
# CI-only rehearsal with synthetic data. Never accepts a production env/volume.
[ "${CI:-}" = true ] || { echo 'Nur auf isoliertem CI-Runner ausführen.' >&2; exit 1; }
baseline=1c983fc01c98916fc782422f19e67567821bdaaa
[ "$(git -C .local/netcup-baseline rev-parse HEAD)" = "$baseline" ] || { echo 'Falsche Baseline.' >&2; exit 1; }
[ ! -e .local/netcup-release ] || { echo 'Vorhandener privater Teststand; Abbruch.' >&2; exit 1; }
[ ! -e test-results/netcup-release ] || { echo 'Vorhandener Nachweis; Abbruch.' >&2; exit 1; }
for project in shownight-netcup-release-source shownight-netcup-release-target shownight-netcup-release-rollback; do
  [ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ] || { echo 'Testprojekt bereits vorhanden.' >&2; exit 1; }
  [ -z "$(docker network ls -q --filter "label=com.docker.compose.project=$project")" ] || { echo 'Testprojekt-Netz bereits vorhanden.' >&2; exit 1; }
  for suffix in database media; do
    if docker volume inspect "$project-$suffix" >/dev/null 2>&1; then echo 'Testvolume bereits vorhanden.' >&2; exit 1; fi
  done
  if docker network inspect "${project}_backend" >/dev/null 2>&1; then echo 'Test-Backendnetz bereits vorhanden.' >&2; exit 1; fi
done
if docker network inspect shownight-netcup-release-proxy >/dev/null 2>&1; then echo 'Testnetz bereits vorhanden.' >&2; exit 1; fi
umask 077
mkdir -p .local/netcup-release/private test-results/netcup-release
private="$PWD/.local/netcup-release/private"
compose_file="$PWD/deploy/compose.yaml"
cleanup() {
  result=$?
  trap - EXIT
  # Only the three fixed, previously absent CI projects and our external network.
  for phase in source target rollback; do
    if [ -f "$private/$phase.env" ]; then
      docker compose --env-file "$private/$phase.env" -f "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
    fi
  done
  docker network rm shownight-netcup-release-proxy >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup EXIT
docker network create shownight-netcup-release-proxy >/dev/null
docker build -t shownight:netcup-release-schema4 .local/netcup-baseline
docker build -t shownight:netcup-release-candidate .
docker image inspect shownight:netcup-release-schema4 --format '{{json .}}' > "$private/baseline-image.json"
docker image inspect shownight:netcup-release-candidate --format '{{json .}}' > "$private/candidate-image.json"
mfa_secret=$(openssl rand -hex 32)
export SN_PROBE_PASSWORD=$(openssl rand -hex 24)
export BOOTSTRAP_LOGIN=release-admin BOOTSTRAP_NAME='Synthetische Releaseprüfung' BOOTSTRAP_PASSWORD="$SN_PROBE_PASSWORD"
make_env() {
  phase=$1
  image=$2
  cat > "$private/$phase.env" <<EOF
STACK_NAME=shownight-netcup-release-$phase
SHOWNIGHT_IMAGE=$image
POSTGRES_PASSWORD=$(openssl rand -hex 32)
MFA_ENCRYPTION_KEY=$mfa_secret
PUBLIC_BASE_URL=http://localhost:3000
PROXY_NETWORK_NAME=shownight-netcup-release-proxy
PROXY_APP_ALIAS=shownight-netcup-release-$phase-app
DB_VOLUME_NAME=shownight-netcup-release-$phase-database
MEDIA_VOLUME_NAME=shownight-netcup-release-$phase-media
DEMO_ENABLED=true
MAIL_MODE=test
MAIL_DELIVERY_ENABLED=false
EOF
}
make_env source shownight:netcup-release-schema4
compose() { phase=$1; shift; docker compose --env-file "$private/$phase.env" -f "$compose_file" "$@"; }
versions() {
  phase=$1 expected=$2
  actual=$(compose "$phase" exec -T postgres psql -U shownight -d shownight -Atc "SELECT string_agg(version::text,',' ORDER BY version) FROM schema_migrations")
  [ "$actual" = "$expected" ] || { echo 'Unerwartete Migrationsliste.' >&2; exit 1; }
}
probe() {
  phase=$1 mode=$2 schema=$3 output=$4
  export SN_PROBE_MODE=$mode SN_PROBE_SCHEMA=$schema
  compose "$phase" exec -T -e SN_PROBE_MODE -e SN_PROBE_SCHEMA -e SN_PROBE_PASSWORD -e SN_PROBE_FIXTURE app node --input-type=module - < tests/netcup-release-probe.mjs > "$output"
}
compose source up -d --wait postgres
compose source run --rm app node dist/api/cli.js migrate
versions source 1,2,3,4
compose source run --rm -e BOOTSTRAP_LOGIN -e BOOTSTRAP_NAME -e BOOTSTRAP_PASSWORD app node dist/api/cli.js bootstrap
compose source run --rm app node dist/api/cli.js demo
compose source up -d --wait app worker
export SN_PROBE_FIXTURE=''
probe source enroll 4 "$private/fixture.json"
export SN_PROBE_FIXTURE=$(cat "$private/fixture.json")
# A harmless completed old test job proves migration 005 preserves its test nature.
compose source exec -T postgres psql -U shownight -d shownight -v ON_ERROR_STOP=1 -c "INSERT INTO mail_jobs(id,business_key,recipient,subject,body,status) VALUES(gen_random_uuid(),'release-existing-test','release@example.invalid','Synthetische Probe','Keine echte Nachricht','simulated')" >/dev/null
# Exact candidate runner, encrypted archive and authenticated extraction, all private.
mkdir "$private/archives"
openssl rand -hex 32 > "$private/backup-password"
sh deploy/backup-run.sh "$private/source.env" "$private/archives" "$private/backup-password"
set -- "$private"/archives/*.snbackup
[ "$#" -eq 1 ] && [ -f "$1" ] || { echo 'Genau eine Sicherung erwartet.' >&2; exit 1; }
node scripts/backup-vault.mjs open "$1" "$private/restored" < "$private/backup-password" > "$private/extraction-result.json"
# Recovered MFA configuration really comes from the authenticated archive, not
# merely a still-live shell variable; DB passwords/project/volumes remain new.
unset mfa_secret
mfa_secret=$(node -e 'const fs=require("node:fs");const text=fs.readFileSync(process.argv[1],"utf8");const lines=text.split(/\r?\n/).filter(x=>x.startsWith("MFA_ENCRYPTION_KEY="));if(lines.length!==1||!/^MFA_ENCRYPTION_KEY=[a-f0-9]{64}$/.test(lines[0]))process.exit(1);process.stdout.write(lines[0].split("=")[1]);' "$private/restored/stack.env")
make_env target shownight:netcup-release-candidate
make_env rollback shownight:netcup-release-schema4
# No old app/worker remains active while new workers run against the migrated copy.
compose source stop app worker
RESTORE_CONFIRM=EMPTY_ISOLATED_STACK sh deploy/restore.sh "$private/target.env" "$private/restored"
compose target run --rm app node dist/api/cli.js migrate
versions target 1,2,3,4,5
compose target run --rm app node dist/api/cli.js migrate
versions target 1,2,3,4,5
mail_default=$(compose target exec -T postgres psql -U shownight -d shownight -Atc "SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='mail_jobs' AND column_name='delivery_mode'")
[ "$mail_default" = "'test'::text" ] || { echo 'Testversand-Default fehlt.' >&2; exit 1; }
old_mail=$(compose target exec -T postgres psql -U shownight -d shownight -Atc "SELECT count(*) FROM mail_jobs WHERE business_key='release-existing-test' AND delivery_mode='test' AND status='simulated'")
[ "$old_mail" = 1 ] || { echo 'Bestehender Testauftrag verändert.' >&2; exit 1; }
compose target up -d --wait app worker
probe target check 5 "$private/target-check.json"
compose target stop app worker
# Return uses the SAME original snapshot in another fresh stack, never SQL downgrade.
RESTORE_CONFIRM=EMPTY_ISOLATED_STACK sh deploy/restore.sh "$private/rollback.env" "$private/restored"
compose rollback run --rm app node dist/api/cli.js migrate
versions rollback 1,2,3,4
rollback_mail_column=$(compose rollback exec -T postgres psql -U shownight -d shownight -Atc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='mail_jobs' AND column_name='delivery_mode'")
[ "$rollback_mail_column" = 0 ] || { echo 'Rückkehr enthält unerwartet Schema 5.' >&2; exit 1; }
compose rollback up -d --wait app worker
probe rollback check 4 "$private/rollback-check.json"
unset SN_PROBE_PASSWORD SN_PROBE_FIXTURE BOOTSTRAP_PASSWORD mfa_secret
node --input-type=module - "$private" <<'PROOF'
import {readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.argv[2];
const read=async name=>JSON.parse(await readFile(`${root}/${name}`, 'utf8'));
const old=await read('baseline-image.json'), current=await read('candidate-image.json');
const target=await read('target-check.json'), rollback=await read('rollback-check.json');
// Deliberate allowlist: private MFA/password/fixture/config data never enters proof.
const result={checkedAt:new Date().toISOString(),candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baselineCommit:'1c983fc01c98916fc782422f19e67567821bdaaa',baselineRebuilt:true,productionDigestMatched:false,architecture:current.Architecture,baselineImageID:old.Id,candidateImageID:current.Id,syntheticOnly:true,productionChanged:false,mailDeliveryEnabled:false,sourceSchema:4,targetSchema:5,rollbackSchema:4,targetMigrations:[1,2,3,4,5],rollbackMigrations:[1,2,3,4],migrationRepeated:true,mailDeliveryModeDefault:'test',encryptedBackup:true,sameBackupForUpgradeAndRollback:true,originalMfaKeyPreserved:true,checks:{target:target.passed,rollback:rollback.passed}};
assert.equal(target.passed,true);assert.equal(rollback.passed,true);
await writeFile('test-results/netcup-release/result.json',JSON.stringify(result,null,2)+'\n');
console.log('Isolierter Schema-4→5- und Rückkehrnachweis bestanden; keine Produktivänderung.');
PROOF
