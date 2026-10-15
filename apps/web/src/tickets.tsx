import { useEffect, useRef, useState } from "react";
import {
  berlinLocalToIso,
  formatBerlin,
  formatCents,
  isoToBerlinLocal,
  parseEuroInput,
  type TicketContingent,
  type TicketReview,
  type TicketSettings,
  type TicketType,
} from "../../../packages/contracts/src/tickets.js";

type Overview = {
  settings: TicketSettings;
  contingents: TicketContingent[];
  types: TicketType[];
  review: TicketReview;
};
type Api = <T = any>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;

const errorCode = (e: unknown) =>
  (e as { data?: { error?: { code?: string } } })?.data?.error?.code;

/** S8-01: Ticketarten, Preise, Kontingente und Verkaufszeiten vorbereiten. Kein Verkauf. */
export function TicketPreparation({
  eventId,
  api,
}: {
  eventId: string;
  api: Api;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const alive = useRef(true);
  const base = `/events/${eventId}/tickets`;
  useEffect(() => {
    alive.current = true;
    api<Overview>(base)
      .then((next) => {
        if (alive.current) setData(next);
      })
      .catch((e: Error) => {
        if (alive.current) setError(e.message);
      });
    return () => {
      alive.current = false;
    };
  }, [base]);

  /** Führt eine Änderung aus. Gibt true zurück, wenn sie gespeichert wurde. */
  async function change(action: () => Promise<Overview>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await action();
      if (!alive.current) return false;
      setData(next);
      setNotice(success);
      return true;
    } catch (e) {
      if (!alive.current) return false;
      if (errorCode(e) === "REVISION_CONFLICT") {
        setError(
          "Eine andere Person hat zwischenzeitlich gespeichert. Der aktuelle Stand wurde geladen; deine Eingaben stehen noch im Formular. Prüfen und erneut speichern.",
        );
        try {
          const fresh = await api<Overview>(base);
          if (alive.current) setData(fresh);
        } catch {
          /* Fehlermeldung oben bleibt sichtbar. */
        }
      } else setError((e as Error).message);
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (!data)
    return (
      <section className="card" aria-label="Ticketvorbereitung">
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">Ticketvorbereitung wird geladen …</p>
        )}
      </section>
    );

  const contingentName = (id: string) =>
    data.contingents.find((c) => c.id === id)?.name ?? "unbekannt";

  return (
    <div className="tickets" aria-label="Ticketvorbereitung">
      <p className="banner" role="note">
        Vorbereitung – es findet noch kein Verkauf statt. Preise und Kontingente
        sind nur für Administration und Veranstaltungsleitung sichtbar.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}

      <SettingsForm
        settings={data.settings}
        busy={busy}
        onSave={(input) =>
          change(
            () =>
              api<Overview>(base + "/settings", "PUT", {
                expectedRevision: data.settings.revision,
                ...input,
              }),
            "Verkaufszeiten gespeichert.",
          )
        }
      />

      <section className="card" aria-label="Kontingente">
        <h2>Kontingente</h2>
        <p className="muted">
          Ein Kontingent ist ein gemeinsamer Platzbestand. Mehrere Ticketarten
          (z. B. Normal und Ermäßigt) können aus demselben Kontingent verkaufen,
          ohne dass Plätze doppelt gezählt werden.
        </p>
        {data.contingents.length === 0 ? (
          <p className="muted">Noch kein Kontingent angelegt.</p>
        ) : (
          <ul className="ticket-list">
            {data.contingents.map((c) => (
              <ContingentRow
                key={c.id + ":" + c.revision}
                contingent={c}
                busy={busy}
                onSave={(input) =>
                  change(
                    () =>
                      api<Overview>(`/ticket-contingents/${c.id}`, "PATCH", {
                        expectedRevision: c.revision,
                        ...input,
                      }),
                    `Kontingent „${input.name}“ gespeichert.`,
                  )
                }
                onDelete={() =>
                  change(
                    () =>
                      api<Overview>(
                        `/ticket-contingents/${c.id}?expectedRevision=${c.revision}`,
                        "DELETE",
                      ),
                    `Kontingent „${c.name}“ gelöscht.`,
                  )
                }
              />
            ))}
          </ul>
        )}
        <ContingentForm
          title="Kontingent anlegen"
          submitLabel="Kontingent anlegen"
          busy={busy}
          onSave={(input) =>
            change(
              () => api<Overview>(base + "/contingents", "POST", input),
              `Kontingent „${input.name}“ angelegt.`,
            )
          }
        />
      </section>

      <section className="card" aria-label="Ticketarten">
        <h2>Ticketarten</h2>
        {data.types.length === 0 ? (
          <p className="muted">Noch keine Ticketart angelegt.</p>
        ) : (
          <ul className="ticket-list">
            {data.types.map((t) => (
              <TypeRow
                key={t.id + ":" + t.revision}
                type={t}
                contingents={data.contingents}
                contingentName={contingentName(t.contingentId)}
                busy={busy}
                onSave={(input) =>
                  change(
                    () =>
                      api<Overview>(`/ticket-types/${t.id}`, "PATCH", {
                        expectedRevision: t.revision,
                        ...input,
                      }),
                    `Ticketart „${input.name}“ gespeichert.`,
                  )
                }
                onDelete={() =>
                  change(
                    () =>
                      api<Overview>(
                        `/ticket-types/${t.id}?expectedRevision=${t.revision}`,
                        "DELETE",
                      ),
                    `Ticketart „${t.name}“ gelöscht.`,
                  )
                }
              />
            ))}
          </ul>
        )}
        {data.contingents.length === 0 ? (
          <p className="muted">
            Lege zuerst ein Kontingent an. Jede Ticketart verkauft aus genau
            einem Kontingent.
          </p>
        ) : (
          <TypeForm
            title="Ticketart anlegen"
            submitLabel="Ticketart anlegen"
            contingents={data.contingents}
            busy={busy}
            onSave={(input) =>
              change(
                () => api<Overview>(base + "/types", "POST", input),
                `Ticketart „${input.name}“ angelegt.`,
              )
            }
          />
        )}
      </section>

      <Review review={data.review} settings={data.settings} />
    </div>
  );
}

function SettingsForm({
  settings,
  busy,
  onSave,
}: {
  settings: TicketSettings;
  busy: boolean;
  onSave: (input: Omit<TicketSettings, "revision">) => Promise<boolean>;
}) {
  const fromSettings = (s: TicketSettings) => ({
    saleStartsAt: isoToBerlinLocal(s.saleStartsAt),
    saleEndsAt: isoToBerlinLocal(s.saleEndsAt),
    admissionAt: isoToBerlinLocal(s.admissionAt),
    startsAt: isoToBerlinLocal(s.startsAt),
    maxTicketsPerOrder: String(s.maxTicketsPerOrder),
  });
  const [form, setForm] = useState(() => fromSettings(settings));
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (!dirty) setForm(fromSettings(settings));
  }, [settings.revision]);
  const set = (key: keyof typeof form) => (value: string) => {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const time = (key: keyof typeof form, label: string) => (
    <label>
      {label}
      <input
        type="datetime-local"
        value={form[key]}
        onChange={(e) => set(key)(e.target.value)}
      />
    </label>
  );
  return (
    <section className="card" aria-label="Verkaufszeiten">
      <h2>Verkaufszeiten</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const max = Number(form.maxTicketsPerOrder);
          if (!Number.isInteger(max) || max < 1 || max > 100) {
            setProblem("Tickets je Bestellung: ganze Zahl von 1 bis 100.");
            return;
          }
          setProblem("");
          const instant = (value: string) =>
            value ? berlinLocalToIso(value) : null;
          void onSave({
            saleStartsAt: instant(form.saleStartsAt),
            saleEndsAt: instant(form.saleEndsAt),
            admissionAt: instant(form.admissionAt),
            startsAt: instant(form.startsAt),
            maxTicketsPerOrder: max,
          }).then((saved) => {
            if (saved) setDirty(false);
          });
        }}
      >
        <p className="muted">Alle Zeiten in deutscher Zeit (Europe/Berlin).</p>
        <div className="inline">
          {time("saleStartsAt", "Verkaufsbeginn")}
          {time("saleEndsAt", "Verkaufsende")}
        </div>
        <div className="inline">
          {time("admissionAt", "Einlass")}
          {time("startsAt", "Veranstaltungsbeginn")}
        </div>
        <label>
          Tickets je Bestellung höchstens
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={form.maxTicketsPerOrder}
            onChange={(e) => set("maxTicketsPerOrder")(e.target.value)}
          />
        </label>
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <button disabled={busy}>Verkaufszeiten speichern</button>
      </form>
    </section>
  );
}

type ContingentInput = { name: string; capacity: number };
function ContingentForm({
  title,
  submitLabel,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  initial?: TicketContingent;
  busy: boolean;
  onSave: (input: ContingentInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? ""),
    [capacity, setCapacity] = useState(initial ? String(initial.capacity) : ""),
    [problem, setProblem] = useState("");
  return (
    <form
      aria-label={title}
      className="ticket-form"
      onSubmit={(e) => {
        e.preventDefault();
        const value = Number(capacity);
        if (!name.trim()) return setProblem("Bitte einen Namen angeben.");
        if (capacity.trim() === "" || !Number.isInteger(value) || value < 0)
          return setProblem("Kapazität: ganze Zahl ab 0.");
        setProblem("");
        void onSave({ name: name.trim(), capacity: value }).then((saved) => {
          if (saved && !initial) {
            setName("");
            setCapacity("");
          }
        });
      }}
    >
      {!initial && <h3>{title}</h3>}
      <div className="inline">
        <label>
          Name des Kontingents
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Kapazität
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
      </div>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="ticket-actions">
        <button disabled={busy}>{submitLabel}</button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}

function ContingentRow({
  contingent,
  busy,
  onSave,
  onDelete,
}: {
  contingent: TicketContingent;
  busy: boolean;
  onSave: (input: ContingentInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false),
    [confirming, setConfirming] = useState(false);
  return (
    <li aria-label={`Kontingent ${contingent.name}`}>
      {editing ? (
        <ContingentForm
          title={`Kontingent ${contingent.name} bearbeiten`}
          submitLabel="Kontingent speichern"
          initial={contingent}
          busy={busy}
          onSave={onSave}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="ticket-row">
            <strong>{contingent.name}</strong>
            <span>{contingent.capacity} Plätze</span>
          </div>
          <div className="ticket-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(true)}
            >
              Bearbeiten
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onDelete().then(() => setConfirming(false))
                  }
                >
                  Endgültig löschen
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirming(false)}
                >
                  Behalten
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirming(true)}
              >
                Löschen
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

type TypeInput = Omit<TicketType, "id" | "revision" | "sort">;
function TypeForm({
  title,
  submitLabel,
  initial,
  contingents,
  busy,
  onSave,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  initial?: TicketType;
  contingents: TicketContingent[];
  busy: boolean;
  onSave: (input: TypeInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const empty = {
    name: "",
    price: "",
    contingentId: contingents[0]?.id ?? "",
    limit: "",
    publicDescription: "",
    discountHint: "",
    requiresPurchaseConfirmation: false,
    requiresAdmissionProof: false,
    active: true,
  };
  const [form, setForm] = useState(() =>
    initial
      ? {
          name: initial.name,
          price: formatCents(initial.priceCents).replace(/\s*€$/, ""),
          contingentId: initial.contingentId,
          limit: initial.typeLimit === null ? "" : String(initial.typeLimit),
          publicDescription: initial.publicDescription,
          discountHint: initial.discountHint,
          requiresPurchaseConfirmation: initial.requiresPurchaseConfirmation,
          requiresAdmissionProof: initial.requiresAdmissionProof,
          active: initial.active,
        }
      : empty,
  );
  const [problem, setProblem] = useState("");
  const field =
    <K extends keyof typeof form>(key: K) =>
    (value: (typeof form)[K]) =>
      setForm((current) => ({ ...current, [key]: value }));
  const contingentKnown = contingents.some((c) => c.id === form.contingentId);
  return (
    <form
      aria-label={title}
      className="ticket-form"
      onSubmit={(e) => {
        e.preventDefault();
        const priceCents = parseEuroInput(form.price);
        const limit = form.limit.trim() === "" ? null : Number(form.limit);
        if (!form.name.trim()) return setProblem("Bitte einen Namen angeben.");
        if (priceCents === null)
          return setProblem("Preis bitte als Eurobetrag angeben, z. B. 12,50.");
        if (limit !== null && (!Number.isInteger(limit) || limit < 1))
          return setProblem(
            "Höchstzahl: leer lassen oder ganze Zahl ab 1 angeben.",
          );
        if (!contingentKnown)
          return setProblem("Bitte ein Kontingent auswählen.");
        setProblem("");
        void onSave({
          name: form.name.trim(),
          priceCents,
          contingentId: form.contingentId,
          typeLimit: limit,
          publicDescription: form.publicDescription.trim(),
          discountHint: form.discountHint.trim(),
          requiresPurchaseConfirmation: form.requiresPurchaseConfirmation,
          requiresAdmissionProof: form.requiresAdmissionProof,
          active: form.active,
        }).then((saved) => {
          if (saved && !initial) setForm(empty);
        });
      }}
    >
      {!initial && <h3>{title}</h3>}
      <div className="inline">
        <label>
          Name der Ticketart
          <input
            value={form.name}
            onChange={(e) => field("name")(e.target.value)}
          />
        </label>
        <label>
          Preis in Euro
          <input
            inputMode="decimal"
            placeholder="12,50"
            value={form.price}
            onChange={(e) => field("price")(e.target.value)}
          />
        </label>
      </div>
      <div className="inline">
        <label>
          Kontingent
          <select
            value={form.contingentId}
            onChange={(e) => field("contingentId")(e.target.value)}
          >
            {!contingentKnown && <option value="">Bitte wählen</option>}
            {contingents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.capacity})
              </option>
            ))}
          </select>
        </label>
        <label>
          Höchstzahl dieser Ticketart (optional)
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={form.limit}
            onChange={(e) => field("limit")(e.target.value)}
          />
        </label>
      </div>
      <label>
        Öffentliche Beschreibung
        <textarea
          maxLength={1000}
          value={form.publicDescription}
          onChange={(e) => field("publicDescription")(e.target.value)}
        />
      </label>
      <label>
        Ermäßigungshinweis
        <input
          maxLength={500}
          value={form.discountHint}
          onChange={(e) => field("discountHint")(e.target.value)}
        />
      </label>
      <div className="checks">
        <label>
          <input
            type="checkbox"
            checked={form.requiresPurchaseConfirmation}
            onChange={(e) =>
              field("requiresPurchaseConfirmation")(e.target.checked)
            }
          />
          Bestätigung beim Kauf verlangen
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.requiresAdmissionProof}
            onChange={(e) => field("requiresAdmissionProof")(e.target.checked)}
          />
          Nachweis beim Einlass verlangen
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => field("active")(e.target.checked)}
          />
          Aktiv
        </label>
      </div>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="ticket-actions">
        <button disabled={busy}>{submitLabel}</button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}

function TypeRow({
  type,
  contingents,
  contingentName,
  busy,
  onSave,
  onDelete,
}: {
  type: TicketType;
  contingents: TicketContingent[];
  contingentName: string;
  busy: boolean;
  onSave: (input: TypeInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false),
    [confirming, setConfirming] = useState(false);
  return (
    <li aria-label={`Ticketart ${type.name}`}>
      {editing ? (
        <TypeForm
          title={`Ticketart ${type.name} bearbeiten`}
          submitLabel="Ticketart speichern"
          initial={type}
          contingents={contingents}
          busy={busy}
          onSave={onSave}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="ticket-row">
            <strong>{type.name}</strong>
            <span data-testid="ticket-price">
              {formatCents(type.priceCents)}
            </span>
            <span>Kontingent {contingentName}</span>
            {type.typeLimit !== null && <span>max. {type.typeLimit}</span>}
            {!type.active && <span className="badge">inaktiv</span>}
          </div>
          {(type.discountHint ||
            type.requiresPurchaseConfirmation ||
            type.requiresAdmissionProof) && (
            <p className="muted">
              {[
                type.discountHint,
                type.requiresPurchaseConfirmation && "Bestätigung beim Kauf",
                type.requiresAdmissionProof && "Nachweis beim Einlass",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <div className="ticket-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(true)}
            >
              Bearbeiten
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onDelete().then(() => setConfirming(false))
                  }
                >
                  Endgültig löschen
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirming(false)}
                >
                  Behalten
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirming(true)}
              >
                Löschen
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function Review({
  review,
  settings,
}: {
  review: TicketReview;
  settings: TicketSettings;
}) {
  return (
    <section className="card" aria-label="Vorbereitung prüfen">
      <h2>Vorbereitung prüfen</h2>
      <p className="muted">
        Prüft nur die Vorbereitung. Es wird nichts veröffentlicht und kein
        Bestand angelegt.
      </p>
      <dl className="ticket-summary">
        <dt>Verkauf</dt>
        <dd>
          {formatBerlin(settings.saleStartsAt)} bis{" "}
          {formatBerlin(settings.saleEndsAt)}
        </dd>
        <dt>Einlass / Beginn</dt>
        <dd>
          {formatBerlin(settings.admissionAt)} /{" "}
          {formatBerlin(settings.startsAt)}
        </dd>
        <dt>Gesamtkapazität</dt>
        <dd data-testid="ticket-total-capacity">{review.totalCapacity}</dd>
      </dl>
      {review.contingents.length > 0 && (
        <ul className="ticket-list">
          {review.contingents.map((c) => (
            <li key={c.id}>
              <div className="ticket-row">
                <strong>{c.name}</strong>
                <span>{c.capacity} Plätze</span>
                <span>
                  {c.activeTypes} aktive Ticketart
                  {c.activeTypes === 1 ? "" : "en"}
                </span>
                {c.activeTypes > 0 && (
                  <span>
                    Einzellimits:{" "}
                    {c.typeLimitSum === null
                      ? "nicht alle begrenzt"
                      : c.typeLimitSum}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {review.hints.length === 0 ? (
        <p className="success" role="status">
          Keine Auffälligkeiten gefunden.
        </p>
      ) : (
        <ul aria-label="Hinweise zur Vorbereitung">
          {review.hints.map((h, i) => (
            <li key={h.code + ":" + (h.refId ?? i)}>{h.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
