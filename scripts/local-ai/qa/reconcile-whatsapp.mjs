// Read-only delivery reconciliation in the configured own chat. Never sends.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { atomicJson, hash } from './core.mjs';
import { messageId as idFor } from './notifications.mjs';
const root = process.argv[2];
if (!root || !path.isAbsolute(root)) throw new Error('Absoluter installierter QA-Pfad erforderlich.');
const config = JSON.parse(await readFile(path.join(root,'config.json'),'utf8'));
const stateRoot = path.join(root,'state');
try { await readFile(path.join(stateRoot,'worker.lock')); throw new Error('Zuerst eigenen QA-Dienst stoppen.'); }
catch(error) { if(error.code !== 'ENOENT') throw error; }
const state = JSON.parse(await readFile(path.join(stateRoot,'state.json'),'utf8'));
const journalFile = path.join(stateRoot,'whatsapp-journal.json');
const journal = JSON.parse(await readFile(journalFile,'utf8'));
const require = createRequire(path.join(root,'package.json'));
const {Client,LocalAuth} = require('whatsapp-web.js');
const client = new Client({authStrategy:new LocalAuth({clientId:'shownight-qa',dataPath:path.join(stateRoot,'whatsapp-auth')}),puppeteer:{headless:true,executablePath:config.chromePath},webVersionCache:{type:'none'}});
let timer;
try {
  await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(new Error('WhatsApp-Abgleich nicht rechtzeitig bereit.')),60000);
    client.once('ready',resolve); client.once('auth_failure',()=>reject(new Error('WhatsApp-Anmeldung fehlgeschlagen.')));
    client.once('qr',()=>reject(new Error('Sitzung muss zuerst am Handy verknuepft werden.')));
    client.initialize().catch(()=>reject(new Error('WhatsApp-Abgleich startet nicht.')));
  });
  clearTimeout(timer);
  const own = client.info?.wid;
  if(own?.user !== config.recipient.slice(1) || own?._serialized !== `${config.recipient.slice(1)}@c.us`) throw new Error('Eigenes Konto nicht bestaetigt.');
  const chat = await client.getChatById(own._serialized);
  const messages = await chat.fetchMessages({limit:50,fromMe:true});
  const results=[];
  for(const item of Object.values(state.outbox)) {
    if(!journal[item.id]) continue;
    const expected=`${item.text}\nBericht-ID: ${item.id.slice(0,12)}`;
    const match=messages.find(message=>message.fromMe && message.body===expected);
    if(!match) {results.push({reportId:item.id.slice(0,12),found:false});continue;}
    const messageId=idFor(match);
    const result={reportId:item.id.slice(0,12),found:true,idType:typeof match.id,idFields:typeof match.id==='object'?Object.keys(match.id??{}):[],hasMessageId:typeof messageId==='string' && messageId.length>0,ack:match.ack};
    if(result.hasMessageId && match.ack>=1) {
      const confirmed=await client.getMessageById(messageId);
      if(confirmed?.body===expected && confirmed.fromMe && confirmed.ack>=1) {
        const entry=journal[item.id]; entry.messageId=messageId;entry.ack=confirmed.ack;entry.status=confirmed.ack>=2?'delivered':'server_ack';delete entry.error;
        entry.reconciledAt=new Date().toISOString(); item.status=entry.status;item.messageId=messageId;item.sentAt=entry.reconciledAt;delete item.error;
        result.reconciled=true;result.messageIdHash=hash(messageId).slice(0,12);
      }
    }
    results.push(result);
  }
  await atomicJson(journalFile,journal);await atomicJson(path.join(stateRoot,'state.json'),state);
  await atomicJson(path.join(stateRoot,'whatsapp-reconciliation.json'),{date:new Date().toISOString(),results});
  console.log(JSON.stringify({kind:'own-chat-read-only-reconciliation',results}));
} finally {clearTimeout(timer);await client.destroy().catch(()=>{});}
