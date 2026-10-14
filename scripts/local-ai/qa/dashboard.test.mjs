import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDashboard,plainArea,plainSuggestion} from './dashboard.mjs';
import {newState} from './core.mjs';
test('GitHub-Issue bleibt als Beschreibung erkennbar und wird getrennt von PR-Code angezeigt',()=>{
  const state=newState();state.github={scannedAt:'2026-10-14T19:00:00Z',openPRs:11,openIssues:10};
  state.tasks.issue={status:'done',sourceKind:'github-issue',number:42,file:'GitHub-Issue-42.md',commit:'a'.repeat(64),startLine:1,endLine:3,completedAt:'2026-10-14T19:00:00Z',result:{summary:'Offene Frage',findings:[],testIdeas:[]}};
  const html=renderDashboard(state,{phase:'wartezeit'});assert.ok(html.includes('GitHub-Issue #42'));assert.ok(html.includes('kein Fehler im Programm'));assert.ok(html.includes('11 offene PRs'));assert.ok(html.includes('Alle 15 Minuten'));
});
test('Verständliche Übersicht erklärt geleistete Arbeit ohne ungeprüfte Vorschläge als echte Fehler darzustellen',()=>{
  const state=newState();state.tasks.first={status:'done',file:'packages/contracts/src/renderer.ts',commit:'a'.repeat(40),startLine:1,endLine:96,completedAt:'2026-10-14T19:00:00Z',result:{summary:'Ein Abschnitt gelesen',findings:[{line:20,description:'Dokumentation fehlt',suggestion:'Kommentar ergänzen',evidence:'sizeBytes: schema'}],testIdeas:[{line:20,idea:'rendererMediaLimit testen',evidence:'sizeBytes: schema'}],tokens:{input:1500,output:500}}};
  state.outbox.a={status:'delivered',messageId:'real-id'};state.outbox.b={status:'delivered'};
  const html=renderDashboard(state,{phase:'wartezeit',notificationStatus:'verbunden',dailyTaskLimit:120,dayTasks:1},'2026-10-14T19:00:00Z');
  assert.ok(html.includes('Spielregeln für die Bildausgabe'));assert.ok(html.includes('Vermutung, noch zu prüfen'));
  assert.ok(html.includes('zu große Datei'));assert.ok(html.includes('1 / 120'));
  assert.ok(html.includes('<div class="big">1</div><div>WhatsApp-Nachrichten zugestellt'));
  assert.ok(html.includes('Dieser Prüfhelfer ändert keinen Programmcode'));
  assert.ok(html.includes('Die Idee allein ist noch kein Testergebnis'));
});
test('Modelltext kann keine HTML- oder Skriptinhalte in die private Übersicht einschleusen',()=>{
  const state=newState();state.tasks.x={status:'done',file:'docs/entwicklung/protokoll.md',completedAt:'2026-10-14T19:00:00Z',result:{summary:'<script>alert("x")</script>',findings:[{description:'<img src=x onerror=alert(1)>',suggestion:'<b>test</b>',evidence:'</code><script>bad</script>',line:1}],testIdeas:[]}};
  const html=renderDashboard(state,{phase:'pausiert'});
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;script&gt;'));
});
test('Leerer Zustand bleibt verständlich und die Themenzuordnung erfindet keine ausgeführten Tests',()=>{
  const html=renderDashboard(newState(),{phase:'wartet_auf_whatsapp'});
  assert.ok(html.includes('Noch kein Auftrag abgeschlossen'));assert.ok(html.includes('wartet auf WhatsApp'));
  assert.ok(plainArea('tests/some-test.mjs').why.includes('noch nicht'));
  assert.ok(plainSuggestion('Unbekannte Sache','test').includes('Details'));
});
