import { useEffect, useRef, useState } from "react";
import {
  berlinLocalCandidates,
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

const conflictMessage =
  "Eine andere Person hat zwischenzeitlich gespeichert. Deine Eingaben bleiben erhalten. Entscheide beim betroffenen Eintrag, ob du deine Fassung beibehältst oder den aktuellen Stand übernimmst.";
const deleteConflictMessage =
  "Der Eintrag wurde zwischenzeitlich geändert und deshalb nicht gelöscht. Aktuellen Stand prüfen und bei Bedarf erneut löschen.";

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

  /**
   * Führt eine Änderung aus und gibt true zurück, wenn sie gespeichert wurde.
   * Bei 409 wird nur der Serverstand neu geladen; Formulare bleiben bestehen und
   * zeigen beim betroffenen Eintrag eine bewusste Auswahl.
   */
  async function change(
    action: () => Promise<Overview>,
    success: string,
    onConflict = conflictMessage,
  ) {
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
        setError(onConflict);
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
        onSave={(input, expectedRevision) =>
          change(
            () =>
              api<Overview>(base + "/settings", "PUT", {
                expectedRevision,
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
                key={c.id}
                contingent={c}
                busy={busy}
                onSave={(input, expectedRevision) =>
                  change(
                    () =>
                      api<Overview>(`/ticket-contingents/${c.id}`, "PATCH", {
                        expectedRevision,
                        ...input,
                      }),
                    `Kontingent „${input.name}“ gespeichert.`,
                  )
                }
                onDelete={(expectedRevision) =>
                  change(
                    () =>
                      api<Overview>(
                        `/ticket-contingents/${c.id}?expectedRevision=${expectedRevision}`,
                        "DELETE",
                      ),
                    `Kontingent „${c.name}“ gelöscht.`,
                    deleteConflictMessage,
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
                key={t.id}
                type={t}
                contingents={data.contingents}
                contingentName={contingentName}
                busy={busy}
                onSave={(input, expectedRevision) =>
                  change(
                    () =>
                      api<Overview>(`/ticket-types/${t.id}`, "PATCH", {
                        expectedRevision,
                        ...input,
                      }),
                    `Ticketart „${input.name}“ gespeichert.`,
                  )
                }
                onDelete={(expectedRevision) =>
                  change(
                    () =>
                      api<Overview>(
                        `/ticket-types/${t.id}?expectedRevision=${expectedRevision}`,
                        "DELETE",
                      ),
                    `Ticketart „${t.name}“ gelöscht.`,
                    deleteConflictMessage,
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

/** Bewusste Entscheidung nach einem Versionskonflikt; nichts wird still überschrieben. */
function ConflictChoice({
  current,
  onKeep,
  onTake,
}: {
  current: string;
  onKeep: () => void;
  onTake: () => void;
}) {
  return (
    <div className="callout" role="group" aria-label="Versionskonflikt">
      <p>
        Zwischenzeitlich gespeichert: <strong>{current}</strong>
      </p>
      <p className="muted">
        Deine Eingaben sind unverändert. Speichern ist erst nach deiner
        Entscheidung möglich.
      </p>
      <div className="ticket-actions">
        <button type="button" className="secondary" onClick={onKeep}>
          Meine Fassung beibehalten
        </button>
        <button type="button" className="secondary" onClick={onTake}>
          Aktuellen Stand übernehmen
        </button>
      </div>
    </div>
  );
}

const timeFields = [
  ["saleStartsAt", "Verkaufsbeginn"],
  ["saleEndsAt", "Verkaufsende"],
  ["admissionAt", "Einlass"],
  ["startsAt", "Veranstaltungsbeginn"],
] as const;
type TimeKey = (typeof timeFields)[number][0];
type DstChoice = "" | "first" | "second";

function settingsSummary(s: TicketSettings) {
  return `Verkauf ${formatBerlin(s.saleStartsAt)} bis ${formatBerlin(s.saleEndsAt)}, Einlass ${formatBerlin(s.admissionAt)}, Beginn ${formatBerlin(s.startsAt)}, höchstens ${s.maxTicketsPerOrder} je Bestellung`;
}

function SettingsForm({
  settings,
  busy,
  onSave,
}: {
  settings: TicketSettings;
  busy: boolean;
  onSave: (
    input: Omit<TicketSettings, "revision">,
    expectedRevision: number,
  ) => Promise<boolean>;
}) {
  const fromSettings = (s: TicketSettings) => ({
    saleStartsAt: isoToBerlinLocal(s.saleStartsAt),
    saleEndsAt: isoToBerlinLocal(s.saleEndsAt),
    admissionAt: isoToBerlinLocal(s.admissionAt),
    startsAt: isoToBerlinLocal(s.startsAt),
    maxTicketsPerOrder: String(s.maxTicketsPerOrder),
  });
  /** Bei doppelten Uhrzeiten die Auswahl passend zum gespeicherten Zeitpunkt vorbelegen. */
  const choicesFrom = (s: TicketSettings) =>
    Object.fromEntries(
      timeFields.map(([key]) => {
        const candidates = berlinLocalCandidates(isoToBerlinLocal(s[key]));
        const stored = s[key] ? new Date(s[key]!).toISOString() : "";
        const index = candidates.findIndex(
          (c) => new Date(c).getTime() === Date.parse(stored),
        );
        return [key, index === 0 ? "first" : index === 1 ? "second" : ""];
      }),
    ) as Record<TimeKey, DstChoice>;
  const [form, setForm] = useState(() => fromSettings(settings));
  const [choices, setChoices] = useState(() => choicesFrom(settings));
  const [base, setBase] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (dirty) return;
    setForm(fromSettings(settings));
    setChoices(choicesFrom(settings));
    setBase(settings);
  }, [settings.revision, dirty]);
  const conflict = dirty && settings.revision !== base.revision;
  const set = (key: keyof typeof form) => (value: string) => {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  };
  /** Zeitpunkt für das Speichern bestimmen; unveränderte Felder behalten ihren gespeicherten Zeitpunkt. */
  function instant(key: TimeKey, label: string): string | null | Error {
    const value = form[key];
    if (!value) return null;
    const candidates = berlinLocalCandidates(value);
    if (candidates.length === 0)
      return new Error(
        `${label}: Diese Uhrzeit gibt es wegen der Umstellung auf Sommerzeit nicht.`,
      );
    if (candidates.length === 2) {
      if (!choices[key])
        return new Error(
          `${label}: Diese Uhrzeit gibt es wegen der Umstellung auf Winterzeit doppelt. Bitte Sommer- oder Winterzeit wählen.`,
        );
      return candidates[choices[key] === "first" ? 0 : 1];
    }
    const original = base[key];
    if (original && value === isoToBerlinLocal(original)) return original;
    return candidates[0];
  }
  return (
    <section className="card" aria-label="Verkaufszeiten">
      <h2>Verkaufszeiten</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (conflict) return;
          const max = Number(form.maxTicketsPerOrder);
          if (!Number.isInteger(max) || max < 1 || max > 100) {
            setProblem("Tickets je Bestellung: ganze Zahl von 1 bis 100.");
            return;
          }
          const resolved = Object.fromEntries(
            timeFields.map(([key, label]) => [key, instant(key, label)]),
          ) as Record<TimeKey, string | null | Error>;
          const failure = Object.values(resolved).find(
            (v): v is Error => v instanceof Error,
          );
          if (failure) {
            setProblem(failure.message);
            return;
          }
          setProblem("");
          const value = (key: TimeKey) => resolved[key] as string | null;
          void onSave(
            {
              saleStartsAt: value("saleStartsAt"),
              saleEndsAt: value("saleEndsAt"),
              admissionAt: value("admissionAt"),
              startsAt: value("startsAt"),
              maxTicketsPerOrder: max,
            },
            base.revision,
          ).then((saved) => {
            if (saved) setDirty(false);
          });
        }}
      >
        <p className="muted">Alle Zeiten in deutscher Zeit (Europe/Berlin).</p>
        <div className="inline">
          {timeFields.map(([key, label]) => (
            <div key={key} className="ticket-time">
              <label>
                {label}
                <input
                  type="datetime-local"
                  value={form[key]}
                  onChange={(e) => set(key)(e.target.value)}
                />
              </label>
              {berlinLocalCandidates(form[key]).length === 2 && (
                <select
                  aria-label={`${label}: Zeitumstellung`}
                  value={choices[key]}
                  onChange={(e) => {
                    setDirty(true);
                    setChoices((current) => ({
                      ...current,
                      [key]: e.target.value as DstChoice,
                    }));
                  }}
                >
                  <option value="">Doppelte Uhrzeit – bitte wählen</option>
                  <option value="first">Erste: noch Sommerzeit (MESZ)</option>
                  <option value="second">Zweite: schon Winterzeit (MEZ)</option>
                </select>
              )}
            </div>
          ))}
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
        {conflict && (
          <ConflictChoice
            current={settingsSummary(settings)}
            onKeep={() => setBase(settings)}
            onTake={() => setDirty(false)}
          />
        )}
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <button disabled={busy || conflict}>Verkaufszeiten speichern</button>
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
  onSave: (
    input: ContingentInput,
    expectedRevision: number,
  ) => Promise<boolean>;
  onDelete: (expectedRevision: number) => Promise<boolean>;
}) {
  // Stand beim Beginn der Bearbeitung bzw. des Löschens; Grundlage für expectedRevision.
  const [editBase, setEditBase] = useState<TicketContingent | null>(null),
    [formKey, setFormKey] = useState(0),
    [confirmRevision, setConfirmRevision] = useState<number | null>(null);
  const conflict = !!editBase && editBase.revision !== contingent.revision;
  return (
    <li aria-label={`Kontingent ${contingent.name}`}>
      {editBase ? (
        <>
          <ContingentForm
            key={formKey}
            title={`Kontingent ${editBase.name} bearbeiten`}
            submitLabel="Kontingent speichern"
            initial={editBase}
            busy={busy || conflict}
            onSave={(input) =>
              onSave(input, editBase.revision).then((saved) => {
                if (saved) setEditBase(null);
                return saved;
              })
            }
            onCancel={() => setEditBase(null)}
          />
          {conflict && (
            <ConflictChoice
              current={`${contingent.name}, ${contingent.capacity} Plätze`}
              onKeep={() => setEditBase({ ...contingent, name: editBase.name })}
              onTake={() => {
                setEditBase(contingent);
                setFormKey((k) => k + 1);
              }}
            />
          )}
        </>
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
              onClick={() => setEditBase(contingent)}
            >
              Bearbeiten
            </button>
            {confirmRevision !== null ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onDelete(confirmRevision).then(() =>
                      setConfirmRevision(null),
                    )
                  }
                >
                  Endgültig löschen
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirmRevision(null)}
                >
                  Behalten
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirmRevision(contingent.revision)}
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
            aria-label="Kontingent"
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

function typeSummary(t: TicketType, contingentName: (id: string) => string) {
  return [
    t.name,
    formatCents(t.priceCents),
    "Kontingent " + contingentName(t.contingentId),
    t.typeLimit === null ? "ohne eigenes Limit" : "max. " + t.typeLimit,
    t.active ? "aktiv" : "inaktiv",
  ].join(", ");
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
  contingentName: (id: string) => string;
  busy: boolean;
  onSave: (input: TypeInput, expectedRevision: number) => Promise<boolean>;
  onDelete: (expectedRevision: number) => Promise<boolean>;
}) {
  const [editBase, setEditBase] = useState<TicketType | null>(null),
    [formKey, setFormKey] = useState(0),
    [confirmRevision, setConfirmRevision] = useState<number | null>(null);
  const conflict = !!editBase && editBase.revision !== type.revision;
  return (
    <li aria-label={`Ticketart ${type.name}`}>
      {editBase ? (
        <>
          <TypeForm
            key={formKey}
            title={`Ticketart ${editBase.name} bearbeiten`}
            submitLabel="Ticketart speichern"
            initial={editBase}
            contingents={contingents}
            busy={busy || conflict}
            onSave={(input) =>
              onSave(input, editBase.revision).then((saved) => {
                if (saved) setEditBase(null);
                return saved;
              })
            }
            onCancel={() => setEditBase(null)}
          />
          {conflict && (
            <ConflictChoice
              current={typeSummary(type, contingentName)}
              onKeep={() => setEditBase({ ...type, name: editBase.name })}
              onTake={() => {
                setEditBase(type);
                setFormKey((k) => k + 1);
              }}
            />
          )}
        </>
      ) : (
        <>
          <div className="ticket-row">
            <strong>{type.name}</strong>
            <span data-testid="ticket-price">
              {formatCents(type.priceCents)}
            </span>
            <span>Kontingent {contingentName(type.contingentId)}</span>
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
              onClick={() => setEditBase(type)}
            >
              Bearbeiten
            </button>
            {confirmRevision !== null ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onDelete(confirmRevision).then(() =>
                      setConfirmRevision(null),
                    )
                  }
                >
                  Endgültig löschen
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirmRevision(null)}
                >
                  Behalten
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirmRevision(type.revision)}
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
