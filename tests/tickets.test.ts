import test from "node:test";
import assert from "node:assert/strict";
import {
  berlinLocalToIso,
  contingentPatch,
  defaultTicketSettings,
  formatBerlin,
  formatCents,
  isoToBerlinLocal,
  parseEuroInput,
  reviewTickets,
  ticketSettingsInput,
  ticketTypeCreate,
  ticketTypePatch,
  type TicketType,
} from "../packages/contracts/src/tickets.js";

test("Preise: ganze Cent formatieren und deutsche Eingaben lesen", () => {
  assert.equal(formatCents(1250), "12,50 €");
  assert.equal(formatCents(0), "0,00 €");
  assert.equal(formatCents(5), "0,05 €");
  assert.equal(formatCents(123456789), "1.234.567,89 €");
  for (const [input, cents] of [
    ["12,50", 1250],
    ["12.50", 1250],
    ["12,5", 1250],
    ["12", 1200],
    [" 7 € ", 700],
    ["1.234,5 €", 123450],
    ["1.234", 123400],
    ["0", 0],
  ] as const)
    assert.equal(parseEuroInput(input), cents, input);
  for (const invalid of ["", "abc", "-3", "12,555", "1,2,3", "12 50"])
    assert.equal(parseEuroInput(invalid), null, invalid);
});

test("Zeiten: Wandzeit Europe/Berlin unabhängig von der Rechnerzeitzone", () => {
  assert.equal(
    berlinLocalToIso("2026-11-14T19:00"),
    "2026-11-14T18:00:00.000Z",
  );
  assert.equal(
    berlinLocalToIso("2026-07-01T12:00"),
    "2026-07-01T10:00:00.000Z",
  );
  assert.equal(berlinLocalToIso("14.11.2026 19:00"), null);
  assert.equal(
    isoToBerlinLocal("2026-11-14T18:00:00.000Z"),
    "2026-11-14T19:00",
  );
  assert.equal(isoToBerlinLocal("2026-07-01T10:00:00Z"), "2026-07-01T12:00");
  assert.equal(isoToBerlinLocal(null), "");
  assert.equal(
    formatBerlin("2026-11-14T18:00:00.000Z"),
    "14.11.2026, 19:00 Uhr",
  );
  assert.equal(formatBerlin(null), "offen");
  for (const local of [
    "2026-01-01T00:00",
    "2026-03-29T03:15",
    "2026-12-31T23:59",
  ])
    assert.equal(isoToBerlinLocal(berlinLocalToIso(local)), local);
});

test("Verträge: Zeitreihenfolge, strikte Felder und Patch ohne Defaults", () => {
  const settings = {
    expectedRevision: 0,
    saleStartsAt: "2026-10-01T08:00:00.000Z",
    saleEndsAt: "2026-11-14T17:00:00.000Z",
    maxTicketsPerOrder: 8,
    admissionAt: "2026-11-14T17:00:00.000Z",
    startsAt: "2026-11-14T18:00:00.000Z",
  };
  assert.equal(ticketSettingsInput.safeParse(settings).success, true);
  for (const invalid of [
    { ...settings, saleEndsAt: settings.saleStartsAt },
    { ...settings, startsAt: "2026-11-14T16:59:00.000Z" },
    { ...settings, maxTicketsPerOrder: 0 },
    { ...settings, maxTicketsPerOrder: 2.5 },
    { ...settings, saleStartsAt: "morgen" },
    { ...settings, published: true },
  ])
    assert.equal(ticketSettingsInput.safeParse(invalid).success, false);
  assert.equal(
    ticketSettingsInput.safeParse({
      ...settings,
      saleStartsAt: null,
      saleEndsAt: null,
      admissionAt: null,
      startsAt: null,
    }).success,
    true,
  );
  const created = ticketTypeCreate.parse({
    contingentId: "6f1c1f43-3a5b-4c5d-9e8f-0a1b2c3d4e5f",
    name: "Normal",
    priceCents: 1500,
  });
  assert.equal(created.active, true);
  assert.equal(created.typeLimit, null);
  assert.equal(
    ticketTypeCreate.safeParse({ ...created, priceCents: 12.5 }).success,
    false,
  );
  assert.equal(
    ticketTypeCreate.safeParse({ ...created, priceCents: -1 }).success,
    false,
  );
  assert.deepEqual(
    ticketTypePatch.parse({ expectedRevision: 2, name: "Neu" }),
    {
      expectedRevision: 2,
      name: "Neu",
    },
  );
  assert.deepEqual(
    contingentPatch.parse({ expectedRevision: 1, capacity: 5 }),
    {
      expectedRevision: 1,
      capacity: 5,
    },
  );
});

test("Prüfansicht: nicht blockierende Hinweise und Kontingentsummen", () => {
  const type = (over: Partial<TicketType>): TicketType => ({
    id: "t",
    contingentId: "saal",
    name: "Normal",
    publicDescription: "",
    priceCents: 1500,
    typeLimit: null,
    discountHint: "",
    requiresPurchaseConfirmation: false,
    requiresAdmissionProof: false,
    active: true,
    sort: 0,
    revision: 1,
    ...over,
  });
  const empty = reviewTickets({
    settings: defaultTicketSettings,
    contingents: [],
    types: [],
  });
  assert.deepEqual(
    empty.hints.map((h) => h.code),
    ["NO_ACTIVE_TYPE", "SALE_TIMES_MISSING"],
  );
  const review = reviewTickets({
    settings: {
      ...defaultTicketSettings,
      saleStartsAt: "2026-10-01T08:00:00.000Z",
      saleEndsAt: "2026-11-14T20:00:00.000Z",
      startsAt: "2026-11-14T18:00:00.000Z",
    },
    contingents: [
      { id: "saal", name: "Saal", capacity: 300, sort: 0, revision: 1 },
      { id: "empore", name: "Empore", capacity: 40, sort: 1, revision: 1 },
    ],
    types: [
      type({ id: "normal", typeLimit: 250 }),
      type({
        id: "ermaessigt",
        name: "Ermäßigt",
        typeLimit: 400,
        priceCents: 0,
      }),
      type({ id: "alt", name: "Alt", active: false, priceCents: 0 }),
    ],
  });
  assert.equal(review.totalCapacity, 340);
  assert.deepEqual(review.contingents, [
    {
      id: "saal",
      name: "Saal",
      capacity: 300,
      activeTypes: 2,
      typeLimitSum: 650,
    },
    {
      id: "empore",
      name: "Empore",
      capacity: 40,
      activeTypes: 0,
      typeLimitSum: 0,
    },
  ]);
  assert.deepEqual(
    review.hints.map((h) => [h.code, h.refId ?? null]),
    [
      ["CONTINGENT_UNUSED", "empore"],
      ["TYPE_LIMIT_ABOVE_CAPACITY", "ermaessigt"],
      ["SALE_ENDS_AFTER_START", null],
      ["FREE_TICKET", "ermaessigt"],
    ],
  );
});
