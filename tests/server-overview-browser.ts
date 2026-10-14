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
  const requests: { path: string; method: string }[] = [];
  let fail = false;
  let old = false;
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
  async function fixture(admin = true) {
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
      requests.push({ path, method: route.request().method() });
      const body =
        path === "/me"
          ? {
              id: "synthetic-admin",
              displayName: "Synthetisches Testkonto",
              admin,
              csrfToken: "synthetic-csrf",
              grants: [],
              preparedAt: new Date().toISOString(),
              pendingSync: 0,
            }
          : path === "/packages"
            ? []
            : path === "/renderer"
              ? disabledRenderer
              : path === "/server-status"
                ? status()
                : {
                    error: { message: "Unzulässige synthetische Testanfrage" },
                  };
      await route.fulfill({
        status: path === "/server-status" && fail ? 503 : 200,
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
  } finally {
    await browser.close();
    await app.close();
  }
});
