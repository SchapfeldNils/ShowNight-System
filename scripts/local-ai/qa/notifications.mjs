import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicJson, sensitive } from './core.mjs';
import { renderDashboard } from './dashboard.mjs';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
export function messageId(message) {
  const id = typeof message?.id === 'string' ? message.id : message?.id?._serialized ?? message?.id?.$1;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
export function diagnostic(error) {
  const text = String(error?.message ?? 'Unbekannter Versandfehler.').replace(/\+?\d{7,}/g, '[Nummer]').replace(/\r?\n/g, ' ').slice(0, 500);
  return sensitive(text) ? 'Geschuetzter Fehlertext ausgeblendet.' : text;
}
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('WhatsApp antwortet nicht rechtzeitig.')), 20000); })]); }
  finally { clearTimeout(timer); }
}
export class WhatsAppFeedback {
  constructor(config, dependencies = null) {
    this.config = config; this.dependencies = dependencies;
    this.status = 'starting'; this.ready = false; this.journal = {}; this.qrImage = null;
    this.saves = Promise.resolve();
  }
  async persist() {
    // Separate journal: acknowledgement events never race with the task-state writer.
    this.saves = this.saves.then(() => atomicJson(path.join(this.config.stateRoot, 'whatsapp-journal.json'), this.journal));
    return this.saves;
  }
  async start() {
    const config = this.config;
    if (!/^\+[1-9]\d{7,14}$/.test(config.recipient ?? '')) throw new Error('Privates WhatsApp-Ziel fehlt.');
    try { this.journal = JSON.parse(await readFile(path.join(config.stateRoot, 'whatsapp-journal.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Versandjournal defekt; Bestand bleibt erhalten.'); }
    for (const entry of Object.values(this.journal)) if (entry.status === 'sending') entry.status = 'uncertain';
    const require = createRequire(import.meta.url);
    const { Client, LocalAuth, qrcode } = this.dependencies ?? { ...require('whatsapp-web.js'), qrcode: require('qrcode') };
    this.client = new Client({ authStrategy: new LocalAuth({ clientId: 'shownight-qa', dataPath: path.join(config.stateRoot, 'whatsapp-auth') }),
      puppeteer: { headless: true, ...(config.chromePath ? { executablePath: config.chromePath } : {}) },
      webVersionCache: { type: 'none' }, qrMaxRetries: 0 });
    let pairing;
    try { pairing = JSON.parse(await readFile(path.join(config.stateRoot, 'pairing.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Privater Verknuepfungspfad defekt.'); }
    const saved = pairing ? /^http:\/\/127\.0\.0\.1:(\d{1,5})\/([0-9a-f]{48})$/.exec(pairing.url) : null;
    if (pairing && (!saved || Number(saved[1]) < 1024 || Number(saved[1]) > 65535)) throw new Error('Privater Verknuepfungspfad ungueltig.');
    const secret = saved?.[2] ?? randomBytes(24).toString('hex');
    this.server = createServer(async (request, response) => {
      if (request.method !== 'GET' || ![`/${secret}`, `/${secret}/bericht`].includes(request.url)) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' });
      if (request.url === `/${secret}/bericht`) {
        try {
          const [state, status] = await Promise.all([readFile(path.join(config.stateRoot,'state.json'),'utf8').then(JSON.parse),readFile(path.join(config.stateRoot,'status.json'),'utf8').then(JSON.parse)]);
          const html = renderDashboard(state,status);
          await writeFile(path.join(config.stateRoot,'Uebersicht.html'),html,'utf8');
          response.end(html);
        } catch { response.end('<!doctype html><html lang="de"><meta charset="utf-8"><title>ShowNight</title><h1>Die Übersicht ist noch nicht bereit.</h1><p>Bitte in wenigen Sekunden aktualisieren.</p></html>'); }
        return;
      }
      const image = this.qrImage ? `<img width="300" height="300" src="${this.qrImage}" alt="WhatsApp-Verknuepfungscode">` : '';
      response.end(`<!doctype html><html lang="de"><meta charset="utf-8"><meta http-equiv="refresh" content="8"><title>ShowNight – WhatsApp verbinden</title><style>body{font:18px system-ui;max-width:720px;margin:40px auto;padding:20px;background:#111;color:#eee}img{background:white;padding:16px}strong{color:#ffce79}</style><h1>Lokale KI: WhatsApp verbinden</h1><p>Status: ${this.status}</p><p><strong>Diese kostenlose Verbindung ist inoffiziell. Die Bibliothek warnt vor moeglichen WhatsApp-Kontosperren. Scanne nur, wenn du diesen Weg nutzen moechtest.</strong></p><p>WhatsApp am Handy → Einstellungen → Verknuepfte Geraete → Geraet hinzufuegen. Verbinde dein eigenes Konto, an das auch die Berichte gehen sollen.</p>${image}<p>Es werden nur ShowNight-Pruefberichte an das fest konfigurierte Ziel gesendet. Eingehende Nachrichten starten keine Auftraege. Die Sitzung wird lokal ausserhalb OneDrive gespeichert und kann am Handy wieder getrennt werden.</p></html>`);
    });
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(saved ? Number(saved[1]) : 0, '127.0.0.1', resolve); });
    const connection = { url: `http://127.0.0.1:${this.server.address().port}/${secret}` };
    await atomicJson(path.join(config.stateRoot, 'connect.json'), connection);
    await atomicJson(path.join(config.stateRoot, 'pairing.json'), connection);
    this.client.on('qr', qr => {
      this.ready = false; this.status = 'QR-Code am Handy scannen';
      qrcode.toDataURL(qr, { margin: 2, width: 400 }).then(image => { this.qrImage = image; }).catch(() => { this.status = 'QR-Darstellung fehlgeschlagen'; });
    });
    this.client.on('ready', () => {
      if (this.client.info?.wid?.user !== config.recipient.slice(1)) {
        this.ready = false; this.status = 'Falsches Absenderkonto; Versand gesperrt'; this.qrImage = null; return;
      }
      this.ready = true; this.qrImage = null; this.status = 'verbunden';
    });
    this.client.on('auth_failure', () => { this.ready = false; this.status = 'Anmeldung fehlgeschlagen'; this.qrImage = null; });
    this.client.on('disconnected', () => { this.ready = false; this.status = 'getrennt; Dienst neu starten und verbinden'; this.qrImage = null; });
    this.client.on('message_ack', (message, ack) => {
      const id = messageId(message);
      if (!id) return;
      const entry = Object.values(this.journal).find(item => item.messageId && item.messageId === id);
      if (!entry) return;
      entry.ack = ack;
      if (ack >= 1) entry.status = ack >= 2 ? 'delivered' : 'server_ack';
      if (ack < 0) entry.status = 'failed';
      this.persist().catch(() => { this.ready = false; this.status = 'Versandjournal nicht speicherbar'; });
    });
    this.client.initialize().catch(() => { this.ready = false; this.status = 'WhatsApp-Web-Start fehlgeschlagen'; });
  }
  async send(item) {
    let entry = this.journal[item.id];
    if (entry && ['server_ack', 'delivered'].includes(entry.status)) return entry;
    if (!this.ready) return { status: 'pending' };
    if (entry?.status === 'uncertain' || entry?.status === 'failed') return entry;
    if (!entry) {
      // The only permitted recipient is the already authenticated own account.
      // No second network lookup is needed for the personal self chat.
      const destination = this.client.info?.wid;
      if (destination?.user !== this.config.recipient.slice(1) || destination?._serialized !== `${this.config.recipient.slice(1)}@c.us`) throw new Error('Eigenes WhatsApp-Ziel nicht bestaetigt.');
      entry = this.journal[item.id] = { status: 'sending', createdAt: new Date().toISOString() };
      await this.persist();
      try {
        const message = await bounded(this.client.sendMessage(destination._serialized, `${item.text}\nBericht-ID: ${item.id.slice(0, 12)}`, { sendSeen: false, linkPreview: false }));
        const id = messageId(message);
        if (!id) throw new Error('Kein Nachrichtenbeleg.');
        entry.messageId = id; entry.ack = message.ack;
        entry.status = message.ack >= 2 ? 'delivered' : message.ack >= 1 ? 'server_ack' : 'awaiting_ack';
        await this.persist();
      } catch (error) { entry.status = 'uncertain'; entry.error = diagnostic(error); await this.persist(); return entry; }
    }
    if (entry.status === 'awaiting_ack' && entry.messageId) {
      try {
        const message = await bounded(this.client.getMessageById(entry.messageId));
        if (message?.ack >= 1) { entry.ack = message.ack; entry.status = message.ack >= 2 ? 'delivered' : 'server_ack'; await this.persist(); }
      } catch {}
    }
    return entry;
  }
  async close() {
    this.ready = false;
    await this.client?.destroy().catch(() => {});
    await this.saves.catch(() => {});
    await new Promise(resolve => this.server ? this.server.close(resolve) : resolve());
    await rm(path.join(this.config.stateRoot, 'connect.json'), { force: true });
  }
}

export async function flushFeedback(state, messenger, persist) {
  for (const item of Object.values(state.outbox)) {
    if (item.status !== 'pending') continue;
    if ((item.nextAttempt ?? 0) > Date.now()) return { ready:false, status:'retry_later' };
    let outcome;
    try { outcome = await messenger.send(item); }
    catch (error) {
      item.nextAttempt = Date.now() + 60000; item.attempts++; item.error = diagnostic(error);
      await persist(); return { ready:false, status:'retry_later' };
    }
    if (['server_ack', 'delivered'].includes(outcome.status)) {
      item.status = outcome.status; item.messageId = outcome.messageId; item.sentAt = new Date().toISOString();
      await persist();
    } else return { ready: false, status: outcome.status };
    await wait(300);
  }
  return { ready: messenger.ready, status: messenger.status };
}
