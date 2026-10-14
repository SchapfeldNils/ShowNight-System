import { useEffect, useRef, useState } from "react";
import type { WindowsIoReport } from "../../../packages/contracts/src/local-status.js";
import type { RendererReport } from "../../../packages/contracts/src/renderer.js";
import "./server-overview.css";

type Api = <T>(path: string, body?: unknown) => Promise<T>;
export type ServerStatus = {
  checkedAt: string;
  service: {
    origin: string;
    startedAt: string;
    tls: boolean;
    liveEnabled: false;
    mailEnabled: false;
  };
  preparation: { packages: number; accountSnapshotPrepared: boolean };
  renderer: RendererReport;
  io: WindowsIoReport;
};

const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Zeitpunkt nicht bestätigt"
    : parsed.toLocaleString("de-DE");
};

function DeviceList({
  title,
  direction,
  group,
}: {
  title: string;
  direction: string;
  group: WindowsIoReport["audioInputs"] | WindowsIoReport["displays"];
}) {
  const successful = group.status === "available";
  return (
    <article className="server-device-group">
      <div className="server-device-title">
        <h4>{title}</h4>
        <span className="server-tag">{direction}</span>
      </div>
      {!successful ? (
        <p className="muted">
          {group.status === "unsupported"
            ? "Erkennung hier noch nicht verfügbar."
            : "Erkennung fehlgeschlagen. Verfügbarkeit nicht bestätigt."}
        </p>
      ) : !group.items.length ? (
        <p className="muted">Keine Geräte von Windows gemeldet.</p>
      ) : (
        <ul className="server-device-list">
          {group.items.map((item, index) => (
            <li key={index}>
              <strong>{item.name}</strong>
              {"width" in item && item.width && item.height ? (
                <span>
                  {item.width} × {item.height} Pixel
                </span>
              ) : null}
              {"connector" in item && item.connector ? (
                <span>{item.connector}</span>
              ) : null}
              <span className="server-device-state">
                Von Windows erkannt · in ShowNight nicht angebunden
              </span>
            </li>
          ))}
        </ul>
      )}
      {group.truncated && (
        <p className="muted">
          Gekürzte Geräteliste · weitere Einträge vorhanden.
        </p>
      )}
    </article>
  );
}

export function ServerOverview({ api }: { api: Api }) {
  const currentApi = useRef(api);
  currentApi.current = api;
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const [report, setReport] = useState<ServerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const refresh = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const next = await currentApi.current<ServerStatus>("/server-status");
      if (mounted.current) {
        setReport(next);
        setError(false);
        setNow(Date.now());
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);

  const checked = report ? Date.parse(report.checkedAt) : NaN;
  const stale =
    !!report && (!Number.isFinite(checked) || now - checked > 30000);
  const current = !!report && !error && !stale;
  const rendererReady = report?.renderer.availability === "available";
  const rendererMediaError = report?.renderer.state?.mediaError === true;
  return (
    <section
      className="server-overview"
      aria-labelledby="server-overview-title"
    >
      <div className="server-overview-heading">
        <div>
          <p className="eyebrow">DIESER RECHNER · SYSTEMADMINISTRATION</p>
          <h2 id="server-overview-title">Lokaler Server</h2>
          <p className="muted">
            Einrichtung, Dienst und verfügbare Schnittstellen an einem Ort.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? "Status wird geprüft …" : "Status aktualisieren"}
        </button>
      </div>
      <div className="server-mode">
        <span className="server-mode-dot" aria-hidden="true" />
        <strong>Vorbereitungsmodus</strong>
        <span>Keine Live- oder Geräteausgabe · Mail aus</span>
      </div>
      <p className="server-freshness" role="status">
        {error
          ? "Status nicht bestätigt. Verbindung und Anmeldung prüfen, dann bewusst aktualisieren."
          : !report
            ? "Serverstatus wird gelesen."
            : stale
              ? "Stand älter als 30 Sekunden · bei Bedarf Status aktualisieren."
              : "Status gelesen · keine Geräte aktiviert."}
        {report && <> Letzte erfolgreiche Abfrage: {date(report.checkedAt)}.</>}
      </p>
      {report && (
        <div
          className={
            !current ? "server-report server-report-stale" : "server-report"
          }
        >
          {!current && (
            <p className="server-status-warning">
              Zuletzt bestätigter Stand · die folgenden Werte sind keine
              aktuelle Verfügbarkeitsbestätigung.
            </p>
          )}
          <div className="server-status-grid">
            <article className="server-status-card">
              <p className="server-card-label">BEDIENZUGANG</p>
              <h3>
                {report.service.tls ? "HTTPS-Dienst" : "Testdienst ohne HTTPS"}
              </h3>
              <p className="server-card-value">
                {current ? "Erreichbar" : "Zuletzt erreichbar"}
              </p>
              <p className="server-origin">{report.service.origin}</p>
              <small>Gestartet: {date(report.service.startedAt)}</small>
            </article>
            <article className="server-status-card">
              <p className="server-card-label">VORBEREITUNG</p>
              <h3>{report.preparation.packages} Inhaltspakete</h3>
              <p>
                {report.preparation.accountSnapshotPrepared
                  ? "Anmeldestand importiert"
                  : "Anmeldestand nicht bestätigt"}
              </p>
              <small>Importierte Inhalte aktivieren keinen Showbetrieb.</small>
            </article>
            <article className="server-status-card">
              <p className="server-card-label">MEDIENPROZESS</p>
              <h3>
                {rendererMediaError
                  ? "Medienfehler gemeldet"
                  : rendererReady
                    ? "Softwarediagnose"
                    : report.renderer.availability === "disabled"
                      ? "Nicht gestartet"
                      : "Nicht erreichbar"}
              </h3>
              <p>
                {rendererMediaError
                  ? "Diagnosezustand prüfen"
                  : rendererReady
                    ? "Native Diagnosebilder verfügbar"
                    : "Keine Diagnosebilder bestätigt"}
              </p>
              <small>Bildschirm- und Tonausgabe bleiben aus.</small>
            </article>
          </div>
          <div className="server-interfaces">
            <h3>Ein- und Ausgänge</h3>
            <p className="muted">
              Windows-Erkennung, ShowNight-Anbindung und tatsächliche Nutzung
              sind getrennte Zustände.
            </p>
            <div className="server-table-wrap">
              <table>
                <caption className="server-sr-only">
                  Von ShowNight bereitgestellte Schnittstellen im zuletzt
                  abgefragten Stand
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Weg</th>
                    <th scope="col">Richtung</th>
                    <th scope="col">ShowNight-Stand</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Browserbedienung</th>
                    <td data-label="Richtung">Eingang</td>
                    <td data-label="Stand">
                      {current
                        ? "Dienst erreichbar · Anmeldung erforderlich"
                        : "Dienst zuletzt erreichbar · Anmeldung erforderlich"}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Inhaltspaket</th>
                    <td data-label="Richtung">Eingang</td>
                    <td data-label="Stand">
                      Geprüfter Dateiimport über das lokale Startwerkzeug
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Diagnose-Vorschau und -Programm</th>
                    <td data-label="Richtung">Ausgang</td>
                    <td data-label="Stand">
                      {rendererMediaError
                        ? "Medienfehler · Diagnosezustand prüfen"
                        : rendererReady
                          ? "Manuell abrufbare PNG-Standbilder · kein Videostream"
                          : "Medienprozess nicht bestätigt"}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Leinwand / Bühnenmonitor</th>
                    <td data-label="Richtung">Ausgang</td>
                    <td data-label="Stand">
                      Noch nicht angebunden · keine physische Ausgabe
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Publikumston / Vorhören</th>
                    <td data-label="Richtung">Ausgang</td>
                    <td data-label="Stand">Noch nicht angebunden · Ton aus</td>
                  </tr>
                  <tr>
                    <th scope="row">Kamera / Audioaufnahme</th>
                    <td data-label="Richtung">Eingang</td>
                    <td data-label="Stand">
                      Noch kein nutzbarer Aufnahmeadapter
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Programmausgabestream</th>
                    <td data-label="Richtung">Ausgang</td>
                    <td data-label="Stand">Noch nicht verfügbar</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="server-hardware">
            <h3>Von Windows gemeldete Geräte</h3>
            <p className="muted">
              Erkennung vom {date(report.io.checkedAt)}. Die Abfrage spielt
              nichts ab, öffnet keine Kamera und ordnet keine Geräte zu. Eine
              Erkennung ersetzt keinen Funktionstest.
            </p>
            <div className="server-device-grid">
              <DeviceList
                title="Bildschirme"
                direction="Ausgang"
                group={report.io.displays}
              />
              <DeviceList
                title="Audioausgänge"
                direction="Ausgang"
                group={report.io.audioOutputs}
              />
              <DeviceList
                title="Audioeingänge"
                direction="Eingang"
                group={report.io.audioInputs}
              />
              <DeviceList
                title="Kameras"
                direction="Eingang"
                group={report.io.cameras}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
