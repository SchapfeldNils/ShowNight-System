import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { allowedPath, sensitive, chunks, hash, newState, atomicJson, readState, discover, source, validateResponse, syntaxCheck, enqueueFeedback } from './core.mjs';
import { WhatsAppFeedback, flushFeedback } from './notifications.mjs';
const exec = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'shownight-qa-test-'));
  t.after(async () => {
    const absolute = path.resolve(root), parent = path.resolve(tmpdir());
    if (!absolute.startsWith(parent + path.sep) || !path.basename(absolute).startsWith('shownight-qa-test-')) throw new Error('Unsicherer Test-Cleanup-Pfad.');
    await rm(absolute, { recursive: true, force: true });
  });
  return root;
}
test('Nur versionierbare Fachquellen; Geheimnisse und Schluessel abgewiesen', () => {
  assert.equal(allowedPath('packages/contracts/src/renderer.ts'), true);
  for (const name of ['.env','scripts/../.env','scripts/secrets.ps1','apps/local/src/.private/x.ts','docs/entwicklung/licensen.md','scripts/dir\\x.ps1']) assert.equal(allowedPath(name), false, name);
  assert.equal(sensitive('-----BEGIN RSA PRIVATE KEY-----'), true);
  assert.equal(sensitive('const api_key = "' + 'x'.repeat(30) + '"'), true);
  assert.equal(sensitive('const token = readToken();'), false);
});
test('Abschnitte begrenzt, echte globale Zeilen und Hash stabil', () => {
  const content = Array.from({ length: 240 }, (_, i) => `const item${i} = ${i};`).join('\n');
  const parts = chunks(content);
  assert.equal(parts.length, 3); assert.equal(parts[1].startLine, 111); assert.equal(parts[2].endLine, 240);
  assert.equal(parts[0].contentHash, hash(parts[0].text));
  assert.ok(parts.every(p => p.text.length < 7500));
});
test('Git-Snapshot ignoriert ungespeicherte und unversionierte Aenderungen, dedupliziert und entdeckt neue Commits', async t => {
  const root = await fixture(t), gitPath = process.env.SHOWNIGHT_TEST_GIT ?? 'git';
  const config = { repositoryRoot: root, gitPath };
  const run = args => exec(gitPath, ['-C', root, ...args], { windowsHide: true });
  await run(['init']); await run(['config', 'user.name', 'Synthetic Test']); await run(['config', 'user.email', 'test@example.invalid']);
  await mkdir(path.join(root, 'packages/contracts/src'), { recursive: true });
  const target = path.join(root, 'packages/contracts/src/renderer.ts');
  const original = Array.from({ length: 120 }, (_, i) => `export const value${i} = ${i};`).join('\n');
  await writeFile(target, original); await run(['add', '.']); await run(['commit', '-m', 'fixture']);
  await writeFile(target, 'dirty source'); await writeFile(path.join(root, 'packages/contracts/src/untracked.ts'), 'ignored');
  const state = newState(), first = await discover(config, state);
  assert.equal(first.added, 2); assert.equal((await source(config, first.commit, 'packages/contracts/src/renderer.ts')).content, original);
  assert.ok(!Object.values(state.tasks).some(item => item.file.endsWith('untracked.ts')));
  assert.equal((await discover(config, state)).added, 0);
  await writeFile(target, original + '\nexport const added = 121;'); await run(['add', 'packages/contracts/src/renderer.ts']); await run(['commit', '-m', 'change']);
  const second = await discover(config, state);
  assert.notEqual(second.commit, first.commit);
  const tasks = Object.values(state.tasks).filter(item => item.status === 'queued');
  assert.equal(tasks.length, 2); assert.ok(tasks.every(item => item.commit === second.commit));
});
test('Belege werden abgeglichen; erfundene Zeilen verworfen und unvollstaendige Antworten abgelehnt', () => {
  const task = { startLine: 41, endLine: 42 }, text = 'const value = 10;\nreturn value;';
  const value = { summary:'Kleine Pruefung', findings:[{line:41,evidence:'const value = 10;',description:'Kandidat',suggestion:'Pruefen'},{line:90,evidence:'invented quote',description:'Falsch',suggestion:'Falsch'}],testIdeas:[] };
  const answer = { done:true, done_reason:'stop', message:{content:JSON.stringify(value)},prompt_eval_count:12,eval_count:10 };
  const result = validateResponse(answer, task, text);
  assert.equal(result.findings.length, 1); assert.equal(result.rejected.length, 1);
  assert.throws(() => validateResponse({...answer,done_reason:'length'}, task, text));
  assert.throws(() => validateResponse({...answer,message:{content:'not json'}}, task, text));
});
test('Syntaxcheck fuehrt weder Quelltext noch Imports aus und prueft keine Teilstuecke', async t => {
  const root = await fixture(t), marker = path.join(root, 'must-not-exist.txt');
  const code = `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed');`;
  assert.equal((await syntaxCheck({file:'scripts/example.mjs',startLine:1}, code, true)).status, 'syntax_passed');
  await assert.rejects(readFile(marker));
  assert.equal((await syntaxCheck({file:'scripts/example.mjs',startLine:1}, 'function x(){', false)).status, 'not_run');
  assert.equal((await syntaxCheck({file:'scripts/example.mjs',startLine:1}, 'function x(){', true)).status, 'syntax_failed');
});
test('Dauerhafter Zustand nimmt unterbrochene Arbeit auf und bewahrt defekte Dateien', async t => {
  const root = await fixture(t), file = path.join(root, 'state.json'), state = newState();
  state.tasks.example = { status:'running' }; await atomicJson(file, state);
  assert.equal((await readState(file)).tasks.example.status, 'queued');
  await writeFile(file, 'corrupt'); await assert.rejects(readState(file)); assert.equal(await readFile(file,'utf8'), 'corrupt');
});
class FakeClient extends EventEmitter {
  constructor(options) { super(); this.options = options; this.info = {wid:{user:'4915112345678'}}; this.sent = []; }
  async initialize() { this.emit('ready'); }
  async getNumberId(number) { return {_serialized:`${number}@c.us`}; }
  async sendMessage(to, body) { this.sent.push({to,body}); return {id:{_serialized:'synthetic-id'},ack:1}; }
  async destroy() {}
}
const dependencies = {Client:FakeClient, LocalAuth:class {constructor(options){this.options=options;}},qrcode:{toDataURL:async()=> 'data:image/png;base64,'}};
test('WhatsApp bleibt auf ein Ziel begrenzt, serverbestaetigte Rueckmeldung wird nach Neustart nicht doppelt gesendet', async t => {
  const stateRoot = await fixture(t), config = {stateRoot,recipient:'+4915112345678'};
  const state = newState(), item = hash('synthetic-task'); enqueueFeedback(state,item,'Synthetischer Test'); enqueueFeedback(state,item,'Duplikat');
  const messenger = new WhatsAppFeedback(config,dependencies); await messenger.start();
  const connection = JSON.parse(await readFile(path.join(stateRoot,'connect.json'),'utf8'));
  assert.equal((await fetch(connection.url)).status,200); assert.equal((await fetch(new URL('/',connection.url))).status,404);
  assert.equal((await flushFeedback(state,messenger,async()=>{})).ready,true);
  assert.equal(state.outbox[item].status,'server_ack'); assert.equal(messenger.client.sent.length,1);
  assert.equal(messenger.client.sent[0].to,'4915112345678@c.us'); await messenger.close();
  state.outbox[item].status='pending';
  const recovered = new WhatsAppFeedback(config,dependencies); await recovered.start();
  assert.equal(JSON.parse(await readFile(path.join(stateRoot,'connect.json'),'utf8')).url,connection.url);
  await flushFeedback(state,recovered,async()=>{}); assert.equal(recovered.client.sent.length,0); await recovered.close();
});
test('Unklarer Versand nach Absturz blockiert neue Arbeit ohne automatisches Duplikat', async t => {
  const stateRoot = await fixture(t), item = hash('uncertain');
  await atomicJson(path.join(stateRoot,'whatsapp-journal.json'),{[item]:{status:'sending'}});
  const messenger = new WhatsAppFeedback({stateRoot,recipient:'+4915112345678'},dependencies); await messenger.start();
  const state = newState(); enqueueFeedback(state,item,'Test');
  assert.deepEqual(await flushFeedback(state,messenger,async()=>{}),{ready:false,status:'uncertain'});
  assert.equal(messenger.client.sent.length,0); await messenger.close();
});
test('Falsches WhatsApp-Absenderkonto startet keine Auftraege und sendet nichts', async t => {
  const stateRoot = await fixture(t), messenger = new WhatsAppFeedback({stateRoot,recipient:'+4915999999999'},dependencies);
  await messenger.start(); assert.equal(messenger.ready,false); assert.equal((await messenger.send({id:hash('wrong'),text:'Test'})).status,'pending');
  assert.equal(messenger.client.sent.length,0); await messenger.close();
});
test('Kurzzeitiger WhatsApp-Verbindungsfehler erhaelt Rueckmeldung und verschiebt den naechsten Auftrag', async () => {
  const state = newState(), id = hash('outage'); enqueueFeedback(state,id,'Test');
  let requests = 0, saves = 0;
  const messenger = { ready:true, status:'verbunden', send:async()=>{ requests++; throw new Error('network'); } };
  assert.deepEqual(await flushFeedback(state,messenger,async()=>{saves++;}),{ready:false,status:'retry_later'});
  assert.equal(state.outbox[id].status,'pending'); assert.equal(saves,1);
  await flushFeedback(state,messenger,async()=>{saves++;}); assert.equal(requests,1);
});
test('Ein belegtes Nachbarzitat bestaetigt keine falsche Zeilennummer', () => {
  const value = {summary:'Test',findings:[{line:1,evidence:'return value;',description:'Kandidat',suggestion:'Pruefen'}],testIdeas:[]};
  const result = validateResponse({done:true,message:{content:JSON.stringify(value)}},{startLine:1,endLine:2},'const value = 10;\nreturn value;');
  assert.equal(result.findings.length,0); assert.equal(result.rejected.length,1);
});
test('Nicht benoetigte ZIP-/FTP-Faehigkeiten enthalten keine Extraktion oder Netzwerkimplementierung', async () => {
  const require = createRequire(import.meta.url);
  const extraction = require('./no-archive-extraction/index.cjs');
  await assert.rejects(extraction('nonexistent-archive.zip', {dir:'nonexistent-output'}), /deaktiviert/);
  const {Client} = require('./no-ftp/index.cjs'); assert.throws(()=>new Client(), /deaktiviert/);
});
