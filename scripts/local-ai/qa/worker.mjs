import { readFile, writeFile, mkdir, open, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, git, source, chunks, readState, atomicJson, discover, nextTask, requestFor, validateResponse, syntaxCheck, enqueueFeedback, feedback, report } from './core.mjs';
import { WhatsAppFeedback, flushFeedback } from './notifications.mjs';
import { discoverGitHub, githubSource } from './github.mjs';

const runtime = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(runtime, 'config.json'), 'utf8'));
config.stateRoot = path.join(runtime, 'state');
await mkdir(config.stateRoot, { recursive: true });
const stateFile = path.join(config.stateRoot, 'state.json');
let state, messenger, bridge, stopping = false;
const status = { phase: 'starting', pid: process.pid, startedAt: new Date().toISOString(), notificationStatus: 'starting' };
const file = name => path.join(config.stateRoot, name);
const save = () => atomicJson(stateFile, state);
async function publish() {
  status.updatedAt = new Date().toISOString(); status.notificationStatus = messenger?.status ?? 'nicht verbunden';
  status.queued = Object.values(state.tasks).filter(t => t.status === 'queued').length;
  status.done = Object.values(state.tasks).filter(t => t.status === 'done').length;
  status.failed = Object.values(state.tasks).filter(t => t.status === 'failed').length;
  status.modelCalls = state.modelCalls;
  await atomicJson(file('status.json'), status);
  await writeFile(file('Bericht.md'), report(state, status), 'utf8');
}
async function control() {
  try { return JSON.parse(await readFile(file('control.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { action: 'run' }; throw new Error('Steuerdatei defekt.'); }
}
function cancel() { stopping = true; bridge?.kill(); }
process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
async function ask(task, text) {
  await atomicJson(file('request.json'), requestFor(task, text));
  await rm(file('response.json'), { force: true });
  return new Promise((resolve, reject) => {
    bridge = spawn(config.powerShellPath, ['-NoProfile', '-File', path.join(runtime, 'Invoke-ShowNightQARequest.ps1'), '-RequestPath', file('request.json'), '-ResponsePath', file('response.json')], { windowsHide: true, stdio: 'ignore' });
    const timer = setInterval(() => {
      control().then(value => { if (value.action === 'stop') cancel(); }).catch(() => cancel());
    }, 1000);
    const deadline = setTimeout(() => bridge?.kill(), 190000);
    bridge.once('error', error => { clearInterval(timer); clearTimeout(deadline); bridge = null; reject(error); });
    bridge.once('close', async code => {
      clearInterval(timer); clearTimeout(deadline); bridge = null;
      if (code === 75) { resolve({ busy: true }); return; }
      if (code !== 0) { reject(new Error(stopping ? 'Auftrag beim Stoppen unterbrochen.' : 'Lokaler Modellaufruf fehlgeschlagen.')); return; }
      try { resolve(JSON.parse((await readFile(file('response.json'), 'utf8')).replace(/^\uFEFF/, ''))); } catch { reject(new Error('Modellantwortdatei unlesbar.')); }
    });
  });
}
async function perform(task) {
  if (!task.sourceKind) {
    const currentBlob = (await git(config, ['rev-parse', `HEAD:${task.file}`])).trim();
    if (currentBlob !== task.blob) { task.status = 'stale'; await save(); return; }
  }
  let read;
  try { read = task.sourceKind ? await githubSource(config, task) : await source(config, task.commit, task.file); }
  catch (error) {
    if (!task.sourceKind) throw error;
    task.nextAttempt = Date.now() + 900000; status.githubError = 'GitHub-Stand nicht erreichbar; spaeter erneut lesen.'; await save(); return;
  }
  if (read.skip) { task.status = 'stale'; await save(); return; }
  const piece = read.piece ?? chunks(read.content).find(p => p.startLine === task.startLine && p.contentHash === task.contentHash);
  if (!piece) throw new Error('Quellausschnitt stimmt nicht mehr mit dem Auftrag ueberein.');
  task.status = 'running'; task.startedAt = new Date().toISOString();
  status.phase = 'prueft'; status.currentTask = { file: task.file, startLine: task.startLine, endLine: task.endLine };
  await save(); await publish();
  let counted = false;
  try {
    const answer = await ask(task, piece.text);
    if (answer.busy) { task.status = 'queued'; task.nextAttempt = Date.now() + 60000; return; }
    task.attempts++; counted = true; state.modelCalls++;
    state.inputTokens += Number(answer.prompt_eval_count) || 0; state.outputTokens += Number(answer.eval_count) || 0;
    task.result = validateResponse(answer, task, piece.text);
    task.syntax = task.sourceKind ? { status: 'not_run', reason: 'GitHub-Inhalte nur gelesen.' } : await syntaxCheck(task, piece.text, piece.startLine === 1 && piece.endLine === read.content.replace(/\r\n/g, '\n').split('\n').length);
    if (task.sourceKind) {
      try { task.freshness = (await githubSource(config, task)).skip ? 'changed' : 'verified'; }
      catch { task.freshness = 'not_verified'; }
    }
    task.status = 'done'; task.completedAt = new Date().toISOString();
    enqueueFeedback(state, task.id, feedback(task));
  } catch (error) {
    if (stopping) { task.status = 'queued'; task.nextAttempt = 0; return; }
    if (!counted) task.attempts++;
    task.error = error.message;
    // Avoid unbounded retries of malformed/hallucinated answers.
    task.status = task.attempts < 2 ? 'queued' : 'failed'; task.nextAttempt = Date.now() + 300000;
    enqueueFeedback(state, hash(`${task.id}:attempt:${task.attempts}`), feedback(task));
  } finally { delete status.currentTask; await save(); await publish(); }
}

let lock;
try {
  try { lock = await open(file('worker.lock'), 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = JSON.parse(await readFile(file('worker.lock'), 'utf8'));
    let alive = true; try { process.kill(owner.pid, 0); } catch (error) { alive = error.code !== 'ESRCH'; }
    if (alive) throw new Error('QA-Dienst oder alter Prozess lebt bereits; keine zweite Instanz.');
    await rm(file('worker.lock')); lock = await open(file('worker.lock'), 'wx');
  }
  await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: status.startedAt })); await lock.sync();
  state = await readState(stateFile);
  if (!Number.isInteger(config.dailyTaskLimit) || config.dailyTaskLimit < 1 || config.dailyTaskLimit > 120) throw new Error('Ungueltiges Tageslimit.');
  if (!Number.isInteger(config.scanIntervalSeconds) || config.scanIntervalSeconds < 60 || config.scanIntervalSeconds > 86400) throw new Error('Ungueltiges Suchintervall.');
  messenger = new WhatsAppFeedback(config); await messenger.start();
  // A stable setup report is the first actual WhatsApp message after QR linking.
  enqueueFeedback(state, hash('shownight-qa-setup-v1'), 'ShowNight – lokale KI eingerichtet. Ich pruefe gespeicherte Quelltextstaende auf der lokalen GPU und sende nach jedem Auftrag eine Rueckmeldung. Ergebnisse bleiben ungeprueft; Code wird nicht automatisch geaendert.');
  await save();
  if (config.githubEnabled && (!config.ghPath || !Number.isInteger(config.githubIntervalSeconds) || config.githubIntervalSeconds < 300)) throw new Error('GitHub-Konfiguration ungueltig.');
  let nextScan = 0, nextGitHubScan = 0, nextCycle = 0, cycleTasks = 0;
  while (!stopping) {
    const command = await control();
    if (command.action === 'stop') break;
    const notifications = await flushFeedback(state, messenger, save);
    if (command.action === 'pause') status.phase = 'pausiert';
    else if (!notifications.ready) status.phase = ['uncertain', 'failed'].includes(notifications.status) ? 'versand_unklar' : 'wartet_auf_whatsapp';
    else {
      if (Date.now() >= nextScan || (command.scanId && command.scanId !== status.scanId)) {
        status.phase = 'sucht_auftraege'; await publish();
        const found = await discover(config, state); status.commit = found.commit; status.scanId = command.scanId;
        nextScan = Date.now() + config.scanIntervalSeconds * 1000; await save();
      }
      if (config.githubEnabled && (Date.now() >= nextGitHubScan || (command.scanId && command.scanId !== status.githubScanId))) {
        try {
          await discoverGitHub(config, state); delete status.githubError;
          status.github = state.github; status.githubScanId = command.scanId;
        } catch { status.githubError = 'GitHub-Abruf fehlgeschlagen; vorhandene lokale Aufgaben laufen weiter.'; }
        nextGitHubScan = Date.now() + config.githubIntervalSeconds * 1000; await save();
      }
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
      if (state.day !== day) { state.day = day; state.dayTasks = 0; await save(); }
      if (Date.now() >= nextCycle) { cycleTasks = 0; nextCycle = Date.now() + config.scanIntervalSeconds * 1000; }
      const eligible = config.githubEnabled ? state : { tasks: Object.fromEntries(Object.entries(state.tasks).filter(([, t]) => !t.sourceKind)) };
      let task = nextTask(eligible);
      // Alternate the two GitHub input types instead of exhausting all Issues first.
      if (task?.sourceKind === 'github-issue' && state.lastSourceKind === 'github-issue') {
        task = nextTask({ tasks: Object.fromEntries(Object.entries(state.tasks).filter(([, t]) => t.sourceKind === 'github-pr')) }) ?? task;
      }
      if (state.dayTasks >= config.dailyTaskLimit) status.phase = 'tageslimit';
      else if (cycleTasks >= 2) status.phase = 'wartezeit';
      else if (!task) status.phase = 'wartet_auf_aenderungen';
      else {
        const before = task.attempts;
        try { await perform(task); } catch { task.status = 'failed'; task.error = 'Quellstand konnte nicht gelesen werden.'; enqueueFeedback(state, task.id, feedback(task)); }
        if (task.status === 'done') state.lastSourceKind = task.sourceKind ?? 'local';
        if (task.attempts > before || task.status === 'failed') { state.dayTasks++; cycleTasks++; }
        await save();
      }
    }
    status.requestedAction = command.action; status.notificationGate = notifications.status; status.dailyTaskLimit = config.dailyTaskLimit; status.dayTasks = state.dayTasks ?? 0;
    await publish();
    for (let i = 0; i < 5 && !stopping; i++) { await new Promise(resolve => setTimeout(resolve, 1000)); if ((await control()).action === 'stop') stopping = true; }
  }
} catch (error) {
  status.phase = 'fehler'; status.error = error.message.includes('QA-') || error.message.includes('Zustand') || error.message.includes('Versandjournal') ? error.message : 'Dienststart oder Lauf fehlgeschlagen; privaten Bestand pruefen.';
  if (state) { await save().catch(() => {}); await publish().catch(() => {}); }
  else if (lock) await atomicJson(file('status.json'), status).catch(() => {});
  process.exitCode = 1;
} finally {
  if (lock) {
    bridge?.kill();
    if (messenger) {
      let closeTimer;
      await Promise.race([messenger.close(), new Promise(resolve => { closeTimer = setTimeout(resolve, 10000); })]).catch(() => {});
      clearTimeout(closeTimer);
    }
    if (state && status.phase !== 'fehler') { status.phase = 'gestoppt'; await save(); await publish(); }
    await lock.close(); await rm(file('worker.lock'), { force: true });
  }
  process.exit(process.exitCode ?? 0);
}
