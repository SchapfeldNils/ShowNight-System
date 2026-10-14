import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { allowedPath, chunks, hash, sensitive, LIMITS, POLICY } from './core.mjs';
const exec = promisify(execFile);
export const REPOSITORY = 'SchapfeldNils/ShowNight-System';
const base = `repos/${REPOSITORY}`;
const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const number = value => Number.isSafeInteger(value) && value > 0;
// Fixed GET endpoints only. Never use model text, URLs or repository names as commands.
export async function githubAPI(config, endpoint) {
  if (!endpoint.startsWith(`${base}/`) || /[\r\n\0]/.test(endpoint) || !config.ghPath) throw new Error('GitHub-Abfrage nicht zugelassen.');
  const { stdout } = await exec(config.ghPath, ['api', '--hostname', 'github.com', '--method', 'GET', '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', endpoint], { timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  return JSON.parse(stdout);
}
export function changedRanges(patch) {
  return [...String(patch ?? '').matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map(m => ({ start: Math.max(1, Number(m[1]) - 3), end: Number(m[1]) + Math.max(1, Number(m[2] ?? 1)) + 3 }));
}
function add(state, metadata, text, ranges) {
  if (sensitive(text) || text.includes('\0') || Buffer.byteLength(text) > LIMITS.fileBytes) return 0;
  const pieces = chunks(text).filter(p => !ranges || ranges.some(r => p.startLine <= r.end && p.endLine >= r.start)).slice(0, 2);
  let count = 0;
  for (const piece of pieces) {
    const id = hash(`${POLICY}\ngithub-v1\n${metadata.sourceKind}\n${metadata.number}\n${metadata.commit}\n${metadata.file}\n${piece.startLine}\n${piece.contentHash}`);
    if (state.tasks[id] || Object.keys(state.tasks).length >= LIMITS.tasks) continue;
    state.tasks[id] = { ...metadata, ...piece, id, sourceText: piece.text, text: undefined, status: 'queued', attempts: 0, nextAttempt: 0, priority: metadata.sourceKind === 'github-issue' ? 2100 : 2000, discoveredAt: new Date().toISOString() };
    count++;
  }
  return count;
}
export async function discoverGitHub(config, state, api = endpoint => githubAPI(config, endpoint)) {
  // Snapshot failure leaves prior tasks intact; never interpret a failed request as closure.
  const pulls = await api(`${base}/pulls?state=open&sort=updated&direction=desc&per_page=100`);
  const issues = await api(`${base}/issues?state=open&sort=updated&direction=desc&per_page=100`);
  if (!Array.isArray(pulls) || !Array.isArray(issues)) throw new Error('GitHub-Liste ungueltig.');
  const previous = state.github?.views ?? {}, views = {}, observations = [];
  let added = 0;
  for (const pr of pulls.slice(0, 15)) {
    if (!number(pr.number) || !sha(pr.head?.sha)) continue;
    const key = `pr:${pr.number}`, revision = pr.head.sha;
    views[key] = revision;
    if (previous[key] === revision) continue;
    // Only this repository's heads; fork sources are left for explicit developer review.
    if (pr.head.repo?.full_name !== REPOSITORY) { observations.push({ key, reason: 'Fork nicht automatisch gelesen.' }); continue; }
    const files = await api(`${base}/pulls/${pr.number}/files?per_page=100`);
    if (!Array.isArray(files)) throw new Error('GitHub-Dateiliste ungueltig.');
    let read = 0;
    for (const file of files) {
      if (read >= 3) break;
      if (!allowedPath(file.filename) || !sha(file.sha) || file.status === 'removed') continue;
      const ranges = changedRanges(file.patch);
      if (!ranges.length) continue;
      const encoded = file.filename.split('/').map(encodeURIComponent).join('/');
      const blob = await api(`${base}/contents/${encoded}?ref=${revision}`);
      if (blob.type !== 'file' || blob.sha !== file.sha || blob.encoding !== 'base64' || !Number.isSafeInteger(blob.size) || blob.size > LIMITS.fileBytes || blob.size < 0 || typeof blob.content !== 'string') continue;
      const bytes = Buffer.from(blob.content, 'base64');
      if (bytes.length !== blob.size) continue;
      // Verify the actual Git object, not merely the API metadata.
      const { createHash } = await import('node:crypto');
      if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== file.sha) continue;
      added += add(state, { sourceKind: 'github-pr', number: pr.number, sourceURL: `https://github.com/${REPOSITORY}/pull/${pr.number}`, file: file.filename, blob: file.sha, commit: revision, githubKey: key }, bytes.toString('utf8'), ranges);
      read++;
    }
    observations.push({ key, reason: `Begrenzte Vorpruefung: ${read} Dateien, hoechstens zwei Ausschnitte je Datei; keine vollstaendige PR-Freigabe.` });
  }
  for (const issue of issues.filter(i => !i.pull_request).slice(0, 15)) {
    if (!number(issue.number) || typeof issue.title !== 'string' || (issue.body != null && typeof issue.body !== 'string')) continue;
    const text = `Titel: ${issue.title}\n\n${issue.body ?? ''}`.replace(/\r\n/g, '\n');
    const key = `issue:${issue.number}`, revision = hash(`${issue.updated_at}\n${text}`);
    views[key] = revision;
    if (previous[key] === revision) continue;
    if (text.length > 12000) { observations.push({ key, reason: 'Issue-Beschreibung zu lang; explizite Pruefung erforderlich.' }); continue; }
    added += add(state, { sourceKind: 'github-issue', number: issue.number, sourceURL: `https://github.com/${REPOSITORY}/issues/${issue.number}`, file: `GitHub-Issue-${issue.number}.md`, blob: hash(text), commit: revision, updatedAt: issue.updated_at, githubKey: key }, text);
  }
  for (const task of Object.values(state.tasks)) {
    if (!task.githubKey || !['queued', 'running'].includes(task.status)) continue;
    // Entries beyond the scan cap are not known to be closed. Preflight checks them individually.
    if (views[task.githubKey] && views[task.githubKey] !== task.commit) task.status = 'stale';
  }
  state.github = { views, observations, scannedAt: new Date().toISOString(), added, openPRs: pulls.length, openIssues: issues.filter(i => !i.pull_request).length, scope: 'Maximal 15 PRs und 15 Issues je Abruf, je PR drei Dateien und je Datei zwei Ausschnitte; keine Kommentare.' };
  return state.github;
}
export async function githubSource(config, task, api = endpoint => githubAPI(config, endpoint)) {
  if (!number(task.number) || !['github-pr', 'github-issue'].includes(task.sourceKind) || typeof task.sourceText !== 'string' || hash(task.sourceText) !== task.contentHash || sensitive(task.sourceText)) throw new Error('Privater GitHub-Auftrag ungueltig.');
  const view = await api(`${base}/${task.sourceKind === 'github-pr' ? 'pulls' : 'issues'}/${task.number}`);
  if (view.state !== 'open') return { skip: 'closed' };
  if (task.sourceKind === 'github-pr') {
    if (!allowedPath(task.file) || !sha(task.commit) || view.head?.sha !== task.commit || view.head?.repo?.full_name !== REPOSITORY) return { skip: 'changed' };
  } else {
    const text = `Titel: ${view.title}\n\n${view.body ?? ''}`.replace(/\r\n/g, '\n');
    if (hash(`${view.updated_at}\n${text}`) !== task.commit) return { skip: 'changed' };
  }
  return { content: task.sourceText, piece: { text: task.sourceText, startLine: task.startLine, endLine: task.endLine, contentHash: task.contentHash } };
}
