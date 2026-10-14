import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { discoverGitHub, githubSource, githubAPI, REPOSITORY } from './github.mjs';
import { newState, requestFor } from './core.mjs';
const base=`repos/${REPOSITORY}`;
const content='export const value = 1;\n', bytes=Buffer.from(content);
const blob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const pr={number:20,state:'open',head:{sha:'a'.repeat(40),repo:{full_name:REPOSITORY}}};
const issue={number:21,state:'open',title:'Validierung',body:'Bitte Eingabegrenzen pruefen.',updated_at:'2026-10-14T10:00:00Z'};
function api(overrides={}) {
  const responses={
    [`${base}/pulls?state=open&sort=updated&direction=desc&per_page=100`]:[pr],
    [`${base}/issues?state=open&sort=updated&direction=desc&per_page=100`]:[issue,{...pr,pull_request:{url:'ignored'}}],
    [`${base}/pulls/20/files?per_page=100`]:[{filename:'scripts/test.mjs',sha:blob,status:'modified',patch:'@@ -1 +1 @@\n-export const value = 0;\n+export const value = 1;'}],
    [`${base}/contents/scripts/test.mjs?ref=${pr.head.sha}`]:{type:'file',sha:blob,encoding:'base64',size:bytes.length,content:bytes.toString('base64')},
    [`${base}/pulls/20`]:pr,[`${base}/issues/21`]:issue,...overrides
  };
  return async endpoint=>{ assert.ok(Object.hasOwn(responses,endpoint),endpoint); return responses[endpoint]; };
}
test('PR und Issue erzeugen getrennte, deduplizierte lokale Aufgaben mit festem Stand',async()=>{
  const state=newState();await discoverGitHub({},state,api());
  const tasks=Object.values(state.tasks);assert.equal(tasks.length,2);
  assert.equal(tasks.find(t=>t.sourceKind==='github-pr').blob,blob);
  const task=tasks.find(t=>t.sourceKind==='github-issue');
  assert.match(requestFor(task,task.sourceText).user,/KEIN Quellcode/);
  assert.equal((await githubSource({},task,api())).content,task.sourceText);
  await discoverGitHub({},state,api());assert.equal(Object.keys(state.tasks).length,2);
});
test('Manipulierte Blob-Daten, Symlinks und fremde Forks werden nicht dem Modell gegeben',async()=>{
  for(const value of [{type:'symlink'},{content:Buffer.from('arbitrary text').toString('base64')},{sha:'b'.repeat(40)}]) {
    const endpoint=`${base}/contents/scripts/test.mjs?ref=${pr.head.sha}`;
    const state=newState();const original=await api()(endpoint);
    await discoverGitHub({},state,api({[endpoint]:{...original,...value}}));
    assert.ok(!Object.values(state.tasks).some(t=>t.sourceKind==='github-pr'));
  }
  const state=newState();await discoverGitHub({},state,api({[`${base}/pulls?state=open&sort=updated&direction=desc&per_page=100`]:[{...pr,head:{...pr.head,repo:{full_name:'other/repo'}}}]}));
  assert.equal(Object.values(state.tasks).filter(t=>t.sourceKind==='github-pr').length,0);
});
test('Vor Berechnung geaenderte oder geschlossene Inhalte werden verworfen; Cache wird geprueft',async()=>{
  const state=newState();await discoverGitHub({},state,api());
  const task=Object.values(state.tasks).find(t=>t.sourceKind==='github-pr');
  assert.equal((await githubSource({},task,api({[`${base}/pulls/20`]:{...pr,state:'closed'}}))).skip,'closed');
  assert.equal((await githubSource({},task,api({[`${base}/pulls/20`]:{...pr,head:{...pr.head,sha:'b'.repeat(40)}}}))).skip,'changed');
  await assert.rejects(githubSource({}, {...task,sourceText:'tampered'},api()),/ungueltig/);
  const issueTask=Object.values(state.tasks).find(t=>t.sourceKind==='github-issue');
  assert.equal((await githubSource({},issueTask,api({[`${base}/issues/21`]:{...issue,body:'changed'}}))).skip,'changed');
});
test('Abrufausfall zerstoert keine Warteschlange; Geheimnisse und grosse Issue-Beschreibungen abgewiesen',async()=>{
  const state=newState();await discoverGitHub({},state,api());const before=JSON.stringify(state);
  await assert.rejects(discoverGitHub({},state,async()=>{throw new Error('offline');}));assert.equal(JSON.stringify(state),before);
  for(const body of ['-----BEGIN RSA PRIVATE KEY-----','x'.repeat(12001)]) {
    const next=newState();await discoverGitHub({},next,api({[`${base}/issues?state=open&sort=updated&direction=desc&per_page=100`]:[{...issue,body}]}));
    assert.ok(!Object.values(next.tasks).some(t=>t.sourceKind==='github-issue'));
  }
  await assert.rejects(githubAPI({ghPath:'unused'},'repos/other/repo/issues'),/nicht zugelassen/);
});
