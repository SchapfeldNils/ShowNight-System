import { useEffect, useRef, useState } from "react";
import type {
  RendererAction,
  RendererReport,
  RendererState,
} from "../../../packages/contracts/src/renderer.js";
type Api = <T>(path: string, body?: unknown) => Promise<T>;
export function RendererPanel({ api }: { api: Api }) {
  const currentApi = useRef(api);
  currentApi.current = api;
  const [report, setReport] = useState<RendererReport | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pictures, setPictures] = useState<string[]>([]);
  const urls = useRef<string[]>([]);
  const clearPictures = () => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
    setPictures([]);
  };
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const value = await currentApi.current<RendererReport>("/renderer");
        if (mounted) {
          setReport(value);
          if (value.availability !== "available") clearPictures();
        }
      } catch (e) {
        if (mounted) {
          setError((e as Error).message);
          setReport(null);
          clearPictures();
        }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);
  const state = report?.availability === "available" ? report.state : null;
  const images = async () => {
    const next: string[] = [];
    try {
      for (const channel of ["preview", "program"]) {
        const r = await fetch("/api/local/renderer/frames/" + channel, {
          cache: "no-store",
        });
        if (!r.ok)
          throw new Error(
            "Diagnosebild nicht bestätigt. Anmeldung und Rendererstatus prüfen.",
          );
        next.push(URL.createObjectURL(await r.blob()));
      }
      clearPictures();
      urls.current = next;
      setPictures(next);
    } catch (e) {
      for (const url of next) URL.revokeObjectURL(url);
      throw e;
    }
  };
  const run = async (action: RendererAction) => {
    setBusy(true);
    setError("");
    try {
      await currentApi.current<RendererState>("/renderer/test", action);
      setReport(await currentApi.current<RendererReport>("/renderer"));
      await images();
    } catch (e) {
      setError((e as Error).message);
      clearPictures();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="renderer-panel">
      <h2>Medienprozess · Softwarediagnose</h2>
      <p>
        Nur synthetische Testszene · Bildschirm- und Tonausgabe aus. Diese
        Bilder entstehen im nativen Medienprozess; Gerätefunktion und Leistung
        bleiben ungeprüft.
      </p>
      <p role="status">
        {!report
          ? "Status wird geprüft."
          : report.availability === "disabled"
            ? "Medienprozess für diesen Start nicht aktiviert."
            : report.availability === "unavailable"
              ? "Medienprozess nicht bestätigt. Keine Befehle automatisch wiederholen."
              : state?.mediaError
                ? "Medienfehler: Diagnosezustand prüfen."
                : "Medienprozess verbunden · Diagnose bereit."}
      </p>
      {report?.availability === "disabled" && (
        <p>
          Für die Softwarediagnose das Renderer-Paket mit
          „Server-Mit-Renderer-Start.cmd“ starten.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {state && (
        <>
          <p>
            Diagnoserevision {state.revision} · Vorschau:{" "}
            {state.preview
              ? state.preview.kind === "video"
                ? "Video mit Grafik"
                : "Bild, Text und Form"
              : "Leer"}{" "}
            · Programm:{" "}
            {state.program
              ? state.program.kind === "video"
                ? "Video mit Grafik"
                : "Bild, Text und Form"
              : "Sicherer Hintergrund"}
          </p>
          <div className="row">
            <button
              disabled={busy}
              onClick={() =>
                void run({
                  commandId: crypto.randomUUID(),
                  expectedRevision: state.revision,
                  action: "prepare",
                  scene: "grafik",
                })
              }
            >
              Bild/Text vorbereiten
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run({
                  commandId: crypto.randomUUID(),
                  expectedRevision: state.revision,
                  action: "prepare",
                  scene: "video",
                })
              }
            >
              Testvideo vorbereiten
            </button>
            <button
              disabled={busy || !state.preview}
              onClick={() =>
                state.preview &&
                void run({
                  commandId: crypto.randomUUID(),
                  expectedRevision: state.revision,
                  action: "take",
                  expectedSceneId: state.preview.id,
                })
              }
            >
              Diagnosebild übernehmen
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run({
                  commandId: crypto.randomUUID(),
                  expectedRevision: state.revision,
                  action: "clear",
                })
              }
            >
              Diagnosezustand leeren
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void images()
                  .catch((e) => {
                    setError(e.message);
                    clearPictures();
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Diagnosebilder aktualisieren
            </button>
          </div>
          <div className="renderer-images">
            {["Diagnose-Vorschau", "Diagnose-Programm"].map((label, index) => (
              <figure key={label}>
                <figcaption>{label}</figcaption>
                {pictures[index] ? (
                  <img
                    src={pictures[index]}
                    alt={label + " aus dem nativen Medienprozess"}
                  />
                ) : (
                  <p>Noch kein Diagnosebild abgerufen.</p>
                )}
              </figure>
            ))}
          </div>
          <p>
            640 × 360 · manuell abgerufenes Standbild, kein Videostream.
            Vorbereiten verändert das Diagnose-Programm nicht. Ein
            Diagnosebefehl ist kein Show-GO und aktiviert kein
            Veranstaltungspaket.
          </p>
        </>
      )}
    </section>
  );
}
