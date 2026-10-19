import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import Fastify from "fastify";
import staticFiles from "@fastify/static";
import {
  chromium,
  expect,
  type BrowserContext,
  type Browser,
} from "@playwright/test";
import type { ServerStatus } from "../apps/local-web/src/server-overview.js";
import type { TransferManifest } from "../packages/contracts/src/transfer.js";

// Isolated browser proof with synthetic API data. This proves rendering and
// request behavior, not Windows enumeration, actual authorization or hardware.
test("Lokale Serverübersicht: ehrliche Geräteanzeigen, manuelle Aktualisierung und Rollen", async (t) => {
  const app = Fastify({ logger: false });
  await app.register(staticFiles, { root: resolve("dist/server/web") });
  const origin = await app.listen({ host: "127.0.0.1", port: 0 });
  let browser: Browser;
  try {
    browser = await chromium.launch({
      ...(process.platform === "win32" ? { channel: "msedge" } : {}),
      headless: true,
    });
  } catch (error) {
    await app.close();
    throw error;
  }
  await mkdir("test-results", { recursive: true });
  const disabledRenderer = {
    availability: "disabled" as const,
    mode: "software-diagnostics" as const,
    physicalOutputEnabled: false as const,
    audioOutputEnabled: false as const,
    state: null,
  };
  const requests: {
    path: string;
    method: string;
    body?: unknown;
    csrf?: string;
  }[] = [];
  const eventId = "51ad0cfb-0cc6-459b-b811-e267f829c567";
  const packageId = "bfb4eb69-b549-4699-a527-79d6d34ded83";
  const accountPackage: TransferManifest = {
    schemaVersion: 1,
    id: packageId,
    eventId,
    createdAt: new Date().toISOString(),
    eventRevision: 1,
    event: {
      name: "Synthetische Kontenveranstaltung",
      date: null,
      location: "Test",
      modules: [],
    },
    shows: [],
    media: [],
    status: "valid",
    errors: [],
    liveActivationSupported: false,
  };
  let fail = false;
  let old = false;
  // Number of upcoming live snapshot reads that fail (Codex-Review #56).
  let liveSnapshotFailures = 0;
  // Synthetic live snapshot (Issue #45): one running rehearsal, simulated only.
  const runId = "6f0d5d55-8f1e-4c43-9f5e-3d1d1f0a0b01",
    cueA = "6f0d5d55-8f1e-4c43-9f5e-3d1d1f0a0b02",
    cueB = "6f0d5d55-8f1e-4c43-9f5e-3d1d1f0a0b03";
  const liveSnapshot = (rights = { view: true, operate: true, activate: true }) => ({
    protocolVersion: 1,
    authorityId: "local-server",
    authorityEpoch: "synthetic-epoch",
    sequence: 4,
    eventId,
    simulated: true,
    stand: {
      revision: 1,
      packageId,
      eventRevision: 1,
      activatedAt: new Date().toISOString(),
      activatedBy: "Synthetische Technik",
      previousPackageId: null,
      previousEventRevision: null,
    },
    runs: [
      {
        id: runId,
        showId: "6f0d5d55-8f1e-4c43-9f5e-3d1d1f0a0b04",
        showName: "Synthetische Show",
        kind: "probe",
        status: "running",
        liveRevision: 3,
        packageId,
        eventRevision: 1,
        cues: [
          { id: cueA, name: "Begrüßung", triggerHint: "Moderation bereit", enabled: true, sceneId: null, sceneName: null },
          { id: cueB, name: "Finale", triggerHint: "", enabled: true, sceneId: null, sceneName: null },
        ],
        nextCueId: cueA,
        nextBlocked: null,
        positionCueId: null,
        atEnd: false,
        output: null,
        createdAt: new Date().toISOString(),
        lastAction: null,
      },
    ],
    rights,
    history: [],
  });
  const status = (): ServerStatus => {
    const checkedAt = new Date(Date.now() - (old ? 60000 : 0)).toISOString();
    return {
      checkedAt,
      service: {
        origin: "https://localhost:3443",
        startedAt: new Date(Date.now() - 900000).toISOString(),
        tls: true,
        liveEnabled: false,
        mailEnabled: false,
      },
      preparation: { packages: 2, accountSnapshotPrepared: true },
      renderer: disabledRenderer,
      io: {
        checkedAt,
        platform: "win32",
        displays: {
          status: "available",
          items: [
            {
              name: "Synthetische Leinwand",
              width: 1920,
              height: 1080,
              connector: "HDMI",
            },
          ],
          truncated: false,
        },
        audioInputs: { status: "available", items: [], truncated: false },
        audioOutputs: { status: "error", items: [], truncated: false },
        cameras: { status: "unsupported", items: [], truncated: false },
        deviceActivationPerformed: false,
      },
    };
  };
  async function fixture(admin = true, eventAccounts = false) {
    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/local/**", async (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        "/api/local".length,
      );
      const method = route.request().method();
      requests.push({
        path,
        method,
        ...(method === "POST"
          ? {
              body: route.request().postDataJSON(),
              csrf: route.request().headers()["x-csrf-token"],
            }
          : {}),
      });
      const liveSnapshotRead =
        path === "/live/" + eventId && liveSnapshotFailures > 0;
      if (liveSnapshotRead) liveSnapshotFailures--;
      const body = liveSnapshotRead
        ? { error: { message: "Synthetischer Lesefehler" } }
        : path.startsWith("/live/")
        ? path.endsWith("/events")
          ? { epoch: "synthetic-epoch", snapshotRequired: false, events: [] }
          : path === "/live/commands"
            ? {
                commandId: (route.request().postDataJSON() as { commandId: string }).commandId,
                accepted: false,
                replayed: false,
                status: 409,
                code: "LIVE_REVISION",
                message: "Synthetische Ablehnung · Zustand neu laden",
                runId,
                liveRevision: 3,
                sequence: 4,
              }
            : liveSnapshot(
                admin
                  ? { view: true, operate: true, activate: true }
                  : { view: true, operate: false, activate: false },
              )
        : path === "/me"
          ? {
              id: "synthetic-admin",
              displayName: "Synthetisches Testkonto",
              admin,
              csrfToken: "synthetic-csrf",
              grants:
                eventAccounts && !admin
                  ? [{ eventId, roles: ["leitung"] }]
                  : [],
              preparedAt: new Date().toISOString(),
              pendingSync: 0,
            }
          : path === "/packages"
            ? eventAccounts
              ? [
                  {
                    id: packageId,
                    eventId,
                    name: accountPackage.event.name,
                    eventRevision: 1,
                    shows: 0,
                    media: 0,
                  },
                ]
              : []
            : eventAccounts && path === "/packages/" + packageId
              ? accountPackage
              : eventAccounts && path === "/events/" + eventId + "/users"
                ? method === "POST"
                  ? { invitationToken: "synthetic-offline-invitation" }
                  : []
                : path === "/renderer"
                  ? disabledRenderer
                  : path === "/server-status"
                    ? status()
                    : {
                        error: {
                          message: "Unzulässige synthetische Testanfrage",
                        },
                      };
      await route.fulfill({
        status:
          (path === "/server-status" && fail) || liveSnapshotRead
            ? 503
            : path === "/live/commands"
              ? 409
              : 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.goto(origin);
    return { context, page, errors };
  }
  try {
    await t.test(
      "Admin sieht Erkennung getrennt von aktiven Wegen; reine GET-Abfragen",
      async () => {
        requests.length = 0;
        const { context, page, errors } = await fixture();
        try {
          const overview = page.getByRole("region", {
            name: "Lokaler Server",
            exact: true,
          });
          await expect(overview).toBeVisible();
          await expect(
            overview.getByRole("heading", {
              name: "2 Inhaltspakete",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            overview.getByText("Synthetische Leinwand", { exact: true }),
          ).toBeVisible();
          await expect(
            overview.getByText(
              "Von Windows erkannt · in ShowNight nicht angebunden",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            overview.getByText(
              "Erkennung fehlgeschlagen. Verfügbarkeit nicht bestätigt.",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            overview.getByText("Keine Geräte von Windows gemeldet.", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            overview.getByText("Erkennung hier noch nicht verfügbar.", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            overview.getByText(
              "Noch nicht angebunden · keine physische Ausgabe",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            overview.getByRole("button", {
              name: "Status aktualisieren",
              exact: true,
            }),
          ).toBeEnabled();
          assert.equal(
            requests.filter((r) => r.path === "/server-status").length,
            1,
          );
          await page.waitForTimeout(1100);
          assert.equal(
            requests.filter((r) => r.path === "/server-status").length,
            1,
            "No background inventory polling",
          );
          await page.screenshot({
            path: "test-results/lokaler-server-uebersicht.png",
            fullPage: true,
          });
          await page.setViewportSize({ width: 390, height: 844 });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await page.screenshot({
            path: "test-results/lokaler-server-uebersicht-mobil.png",
            fullPage: true,
          });
          assert.equal(
            requests.every((r) => r.method === "GET"),
            true,
            "Viewing status never issues commands",
          );
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      },
    );
    await t.test(
      "Alter Stand und fehlgeschlagene Aktualisierung bleiben sichtbar unbestätigt",
      async () => {
        const { context, page, errors } = await fixture();
        try {
          const overview = page.getByRole("region", {
            name: "Lokaler Server",
            exact: true,
          });
          await expect(
            overview.getByText("Status gelesen · keine Geräte aktiviert.", {
              exact: false,
            }),
          ).toBeVisible();
          old = true;
          await overview
            .getByRole("button", { name: "Status aktualisieren", exact: true })
            .click();
          await expect(
            overview.getByText(/Stand älter als 30 Sekunden/),
          ).toBeVisible();
          await expect(
            overview.getByText("Zuletzt erreichbar", { exact: true }),
          ).toBeVisible();
          fail = true;
          await overview
            .getByRole("button", { name: "Status aktualisieren", exact: true })
            .click();
          await expect(
            overview.getByText(/Status nicht bestätigt\. Verbindung/),
          ).toBeVisible();
          await expect(
            overview.getByText(
              "Zuletzt bestätigter Stand · die folgenden Werte sind keine aktuelle Verfügbarkeitsbestätigung.",
              { exact: true },
            ),
          ).toBeVisible();
          fail = false;
          old = false;
          await overview
            .getByRole("button", { name: "Status aktualisieren", exact: true })
            .click();
          await expect(
            overview.getByText("Status gelesen · keine Geräte aktiviert.", {
              exact: false,
            }),
          ).toBeVisible();
          await expect(
            overview.getByText("Erreichbar", { exact: true }),
          ).toBeVisible();
          assert.deepEqual(errors, []);
        } finally {
          fail = false;
          old = false;
          await context.close();
        }
      },
    );
    await t.test(
      "Veranstaltungskonto fragt keine globale Server- oder Gerätediagnose ab",
      async () => {
        requests.length = 0;
        const { context, page, errors } = await fixture(false);
        try {
          await expect(
            page.getByRole("heading", {
              name: "Vorbereitete Pakete",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("region", { name: "Lokaler Server", exact: true }),
          ).toHaveCount(0);
          assert.equal(
            requests.some((r) =>
              ["/server-status", "/renderer"].includes(r.path),
            ),
            false,
          );
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      },
    );
    for (const admin of [false, true]) {
      await t.test(
        admin
          ? "Admin sieht Technik; normales Kontenformular sendet Mitglied an die ausgewählte Veranstaltung"
          : "Leitung sieht keine Technikrolle; normale Mitgliedseinrichtung bleibt möglich",
        async () => {
          requests.length = 0;
          const { context, page, errors } = await fixture(admin, true);
          try {
            await page
              .getByRole("button", { name: "Paket ansehen", exact: true })
              .click();
            const accounts = page.locator("section").filter({
              has: page.getByRole("heading", {
                name: "Lokale Veranstaltungskonten",
                exact: true,
              }),
            });
            await expect(accounts).toBeVisible();
            const role = accounts.getByRole("combobox", {
              name: "Veranstaltungsrolle",
              exact: true,
            });
            await expect(role).toHaveValue("mitglied");
            await expect(role.locator('option[value="technik"]')).toHaveCount(
              admin ? 1 : 0,
            );
            await expect(role.locator("option")).toHaveText(
              admin
                ? ["Mitglied", "Technik", "Live", "Leitung (MFA erforderlich)"]
                : ["Mitglied", "Live", "Leitung (MFA erforderlich)"],
            );
            await accounts
              .getByRole("textbox", { name: "Benutzername", exact: true })
              .fill("synthetic-member");
            await accounts
              .getByRole("textbox", { name: "Name", exact: true })
              .fill("Synthetisches Mitglied");
            await accounts
              .getByRole("button", { name: "Konto vorbereiten", exact: true })
              .click();
            await expect(
              accounts.getByText(
                "Persönlicher Einrichtungscode · 24 Stunden gültig",
                { exact: true },
              ),
            ).toBeVisible();
            const submits = requests.filter(
              (request) => request.method === "POST",
            );
            assert.equal(
              submits.length,
              1,
              "Ein Submit erzeugt genau eine Kontenanfrage",
            );
            assert.deepEqual(submits[0], {
              path: "/events/" + eventId + "/users",
              method: "POST",
              body: {
                login: "synthetic-member",
                displayName: "Synthetisches Mitglied",
                role: "mitglied",
              },
              csrf: "synthetic-csrf",
            });
            assert.ok(
              requests.some(
                (request) =>
                  request.method === "GET" &&
                  request.path === "/events/" + eventId + "/users",
              ),
            );
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        },
      );
    }
    await t.test(
      "Showablauf: Simulation sichtbar, GO sendet das gezeigte Ziel mit Revision, Ablehnung ohne Wiederholung",
      async () => {
        requests.length = 0;
        const { context, page, errors } = await fixture(true, true);
        try {
          const live = page.getByRole("region", { name: "Showablauf", exact: true });
          await expect(live.getByRole("note")).toContainText("SIMULATION");
          await expect(
            live.getByRole("region", { name: "Publikumsausgabe (Simulation)", exact: true }),
          ).toBeVisible();
          const go = live.getByRole("button", { name: "GO · Begrüßung", exact: true });
          await expect(go).toBeEnabled();
          await go.click();
          await expect(live.getByRole("alert")).toContainText("Synthetische Ablehnung");
          await page.waitForTimeout(1500);
          const commands = requests.filter((r) => r.path === "/live/commands");
          assert.equal(commands.length, 1, "Abgelehnte Befehle werden nie automatisch wiederholt");
          const body = commands[0].body as Record<string, unknown>;
          assert.equal(body.type, "cue.go");
          assert.equal(body.runId, runId);
          assert.equal(body.expectedLiveRevision, 3);
          assert.deepEqual(body.payload, { expectedNextCueId: cueA });
          assert.equal(body.protocolVersion, 1);
          assert.equal(commands[0].csrf, "synthetic-csrf");
          await page.setViewportSize({ width: 390, height: 844 });
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
          );
          await page.screenshot({ path: "test-results/lokaler-showablauf.png", fullPage: true });
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      },
    );
    await t.test(
      "Showablauf: nach fehlgeschlagenem ersten Lesen erholt sich die Ansicht selbst, ohne Befehle zu senden",
      async () => {
        requests.length = 0;
        liveSnapshotFailures = 2;
        const { context, page, errors } = await fixture(true, true);
        try {
          const live = page.getByRole("region", { name: "Showablauf", exact: true });
          await expect(live.getByRole("alert")).toContainText("Synthetischer Lesefehler");
          await expect(
            live.getByRole("button", { name: "GO · Begrüßung", exact: true }),
          ).toBeVisible({ timeout: 10000 });
          await expect(live.getByRole("alert")).toHaveCount(0);
          const snapshotReads = requests.filter((r) => r.path === "/live/" + eventId);
          assert.ok(snapshotReads.length >= 3, "erneute Snapshotabfragen");
          assert.equal(
            requests.filter((r) => r.method === "POST").length,
            0,
            "Lesen wiederholt nie einen Befehl",
          );
          assert.deepEqual(errors, []);
        } finally {
          liveSnapshotFailures = 0;
          await context.close();
        }
      },
    );
    await t.test(
      "Showablauf: Leitung ohne Live-/Technikrolle sieht den Ablauf, aber kein GO",
      async () => {
        const { context, page, errors } = await fixture(false, true);
        try {
          const live = page.getByRole("region", { name: "Showablauf", exact: true });
          await expect(live.getByText("Begrüßung", { exact: true }).first()).toBeVisible();
          await expect(live.getByRole("button", { name: /^GO/ })).toHaveCount(0);
          await expect(live.getByRole("button", { name: "Aktivierung vorbereiten" })).toHaveCount(0);
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      },
    );
  } finally {
    await browser.close();
    await app.close();
  }
});
