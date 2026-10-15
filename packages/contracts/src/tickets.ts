import { z } from "zod";

/**
 * S8-01 Ticketvorbereitung: Ticketarten, Preise, Kontingente und Verkaufszeiten.
 * Reine Vorbereitung. Kein Bestand, keine Bestellung, kein Verkauf.
 */

const uuid = z.uuid();
const label = z.string().trim().min(1).max(120);
const instant = z.iso.datetime({ offset: true }).nullable();
const revision = z.int().positive();

export const ticketSettingsInput = z
  .strictObject({
    expectedRevision: z.int().min(0),
    saleStartsAt: instant,
    saleEndsAt: instant,
    maxTicketsPerOrder: z.int().min(1).max(100),
    admissionAt: instant,
    startsAt: instant,
  })
  .superRefine((value, context) => {
    if (
      value.saleStartsAt &&
      value.saleEndsAt &&
      Date.parse(value.saleEndsAt) <= Date.parse(value.saleStartsAt)
    )
      context.addIssue({
        code: "custom",
        path: ["saleEndsAt"],
        message: "Verkaufsende muss nach dem Verkaufsbeginn liegen.",
      });
    if (
      value.admissionAt &&
      value.startsAt &&
      Date.parse(value.startsAt) < Date.parse(value.admissionAt)
    )
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "Veranstaltungsbeginn darf nicht vor dem Einlass liegen.",
      });
  });
export type TicketSettingsInput = z.infer<typeof ticketSettingsInput>;

const contingentFields = {
  name: label,
  capacity: z.int().min(0).max(100000),
  sort: z.int().min(0).max(10000),
};
export const contingentCreate = z.strictObject({
  ...contingentFields,
  sort: contingentFields.sort.default(0),
});
// Patch-Schemas bewusst ohne Defaults: fehlende Felder bleiben unverändert.
export const contingentPatch = z.strictObject({
  expectedRevision: revision,
  name: contingentFields.name.optional(),
  capacity: contingentFields.capacity.optional(),
  sort: contingentFields.sort.optional(),
});

const typeFields = {
  contingentId: uuid,
  name: label,
  publicDescription: z.string().trim().max(1000),
  priceCents: z.int().min(0).max(1000000),
  typeLimit: z.int().min(1).max(100000).nullable(),
  discountHint: z.string().trim().max(500),
  requiresPurchaseConfirmation: z.boolean(),
  requiresAdmissionProof: z.boolean(),
  active: z.boolean(),
  sort: z.int().min(0).max(10000),
};
export const ticketTypeCreate = z.strictObject({
  contingentId: typeFields.contingentId,
  name: typeFields.name,
  publicDescription: typeFields.publicDescription.default(""),
  priceCents: typeFields.priceCents,
  typeLimit: typeFields.typeLimit.default(null),
  discountHint: typeFields.discountHint.default(""),
  requiresPurchaseConfirmation:
    typeFields.requiresPurchaseConfirmation.default(false),
  requiresAdmissionProof: typeFields.requiresAdmissionProof.default(false),
  active: typeFields.active.default(true),
  sort: typeFields.sort.default(0),
});
export const ticketTypePatch = z.strictObject({
  expectedRevision: revision,
  contingentId: typeFields.contingentId.optional(),
  name: typeFields.name.optional(),
  publicDescription: typeFields.publicDescription.optional(),
  priceCents: typeFields.priceCents.optional(),
  typeLimit: typeFields.typeLimit.optional(),
  discountHint: typeFields.discountHint.optional(),
  requiresPurchaseConfirmation:
    typeFields.requiresPurchaseConfirmation.optional(),
  requiresAdmissionProof: typeFields.requiresAdmissionProof.optional(),
  active: typeFields.active.optional(),
  sort: typeFields.sort.optional(),
});

export type TicketSettings = {
  revision: number;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  maxTicketsPerOrder: number;
  admissionAt: string | null;
  startsAt: string | null;
};
export type TicketContingent = {
  id: string;
  name: string;
  capacity: number;
  sort: number;
  revision: number;
};
export type TicketType = {
  id: string;
  contingentId: string;
  name: string;
  publicDescription: string;
  priceCents: number;
  typeLimit: number | null;
  discountHint: string;
  requiresPurchaseConfirmation: boolean;
  requiresAdmissionProof: boolean;
  active: boolean;
  sort: number;
  revision: number;
};
export const defaultTicketSettings: TicketSettings = {
  revision: 0,
  saleStartsAt: null,
  saleEndsAt: null,
  maxTicketsPerOrder: 10,
  admissionAt: null,
  startsAt: null,
};

export type TicketHintCode =
  | "NO_ACTIVE_TYPE"
  | "CONTINGENT_UNUSED"
  | "TYPE_LIMIT_ABOVE_CAPACITY"
  | "SALE_TIMES_MISSING"
  | "SALE_ENDS_AFTER_START"
  | "FREE_TICKET";
export type TicketHint = {
  code: TicketHintCode;
  message: string;
  refId?: string;
};
export type ContingentSummary = {
  id: string;
  name: string;
  capacity: number;
  activeTypes: number;
  /** Summe der Einzellimits aktiver Ticketarten; null, sobald eine aktive Art kein eigenes Limit hat. */
  typeLimitSum: number | null;
};
export type TicketReview = {
  totalCapacity: number;
  contingents: ContingentSummary[];
  hints: TicketHint[];
};

/** Vorbereitungsprüfung. Alle Hinweise sind bewusst nicht blockierend. */
export function reviewTickets(data: {
  settings: TicketSettings;
  contingents: TicketContingent[];
  types: TicketType[];
}): TicketReview {
  const hints: TicketHint[] = [];
  const active = data.types.filter((t) => t.active);
  if (!active.length)
    hints.push({
      code: "NO_ACTIVE_TYPE",
      message: "Es gibt noch keine aktive Ticketart.",
    });
  const contingents = data.contingents.map((c) => {
    const own = active.filter((t) => t.contingentId === c.id);
    const limits = own.map((t) => t.typeLimit);
    return {
      id: c.id,
      name: c.name,
      capacity: c.capacity,
      activeTypes: own.length,
      typeLimitSum: limits.every((l) => l !== null)
        ? limits.reduce<number>((sum, l) => sum + (l ?? 0), 0)
        : null,
    };
  });
  for (const c of contingents)
    if (!data.types.some((t) => t.contingentId === c.id))
      hints.push({
        code: "CONTINGENT_UNUSED",
        message: `Kontingent „${c.name}“ hat keine Ticketart.`,
        refId: c.id,
      });
  const capacity = new Map(data.contingents.map((c) => [c.id, c]));
  for (const t of data.types) {
    const c = capacity.get(t.contingentId);
    if (c && t.typeLimit !== null && t.typeLimit > c.capacity)
      hints.push({
        code: "TYPE_LIMIT_ABOVE_CAPACITY",
        message: `Ticketart „${t.name}“ erlaubt ${t.typeLimit} Tickets, Kontingent „${c.name}“ hat nur ${c.capacity} Plätze.`,
        refId: t.id,
      });
  }
  const s = data.settings;
  if (!s.saleStartsAt || !s.saleEndsAt)
    hints.push({
      code: "SALE_TIMES_MISSING",
      message: "Verkaufsbeginn oder Verkaufsende ist noch nicht festgelegt.",
    });
  if (
    s.saleEndsAt &&
    s.startsAt &&
    Date.parse(s.saleEndsAt) > Date.parse(s.startsAt)
  )
    hints.push({
      code: "SALE_ENDS_AFTER_START",
      message:
        "Das Verkaufsende liegt nach dem Veranstaltungsbeginn. Abendkasse bewusst so geplant?",
    });
  for (const t of active)
    if (t.priceCents === 0)
      hints.push({
        code: "FREE_TICKET",
        message: `Ticketart „${t.name}“ kostet 0 €. Bewusst als Freikarte geplant?`,
        refId: t.id,
      });
  return {
    totalCapacity: data.contingents.reduce((sum, c) => sum + c.capacity, 0),
    contingents,
    hints,
  };
}

/** 1250 → „12,50 €“. Ausschließlich ganzzahlige Cent, keine Gleitkommarechnung. */
export function formatCents(cents: number) {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const euros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (
    (negative ? "−" : "") +
    euros +
    "," +
    String(abs % 100).padStart(2, "0") +
    " €"
  );
}

/** „12,50“, „12.50“, „12“, „1.234,5 €“ → Cent; ungültig → null. */
export function parseEuroInput(text: string): number | null {
  let value = text.trim().replace(/\s*€$/, "");
  if (!value || /\s/.test(value)) return null;
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, "");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

const berlin = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
function berlinParts(ms: number) {
  const parts = Object.fromEntries(
    berlin.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}
function berlinOffset(ms: number) {
  const p = berlinParts(ms);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    Math.floor(ms / 1000) * 1000
  );
}

/** Wandzeit in Europe/Berlin („2026-11-14T19:00“) → ISO-Zeitpunkt in UTC. */
export function berlinLocalToIso(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - berlinOffset(wall);
  utc = wall - berlinOffset(utc);
  return new Date(utc).toISOString();
}

/** ISO-Zeitpunkt → Wandzeit in Europe/Berlin für <input type="datetime-local">. */
export function isoToBerlinLocal(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const p = berlinParts(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}`;
}

/** Anzeige „14.11.2026, 19:00 Uhr“ in Europe/Berlin. */
export function formatBerlin(iso: string | null): string {
  if (!iso) return "offen";
  const local = isoToBerlinLocal(iso);
  if (!local) return "offen";
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}, ${time} Uhr`;
}
