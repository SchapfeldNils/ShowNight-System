import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import Fastify from "fastify";
import staticFiles from "@fastify/static";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import type { MonitorTimer, MonitorView } from "../packages/contracts/src/live.js";

// Live-Bühnenmonitor (Issue #41): isolated browser proof with a synthetic API.
// It proves rendering, clock offset, reconnect and request behavior, not a
// physical stage monitor or tablet (#46).
const eventId = "51ad0cfb-0cc6-459b-b811-e267f829c567";
const token = "A".repeat(20) + "b_-" + "9".repeat(20);
const showId = "6f0d5d55-8f1e-4c43-9f5e-3d1d1f0a0b04";

test("Bühnenmonitor im Browser: Serverzeit, Hinweise, Ausfallmeldung, Widerruf", async (t) => {
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
  // The synthetic server clock runs one hour ahead of the browser; a correct
  // display depends on the measured offset, not on the browser clock.
  const SKEW = 3600_000;
  const serverNow = () => Date.now() + SKEW;
  const timer = (over: Partial<MonitorTimer> = {}): MonitorTimer => ({
    showId,
    showName: "Synthetische Show",
    draftRevision: 2,
    mode: "countdown",
    targetAt: null,
    initialMs: 60_000,
    valueMs: 60_000,
    anchorAt: new Date(serverNow() - 10_000).toISOString(),
    started: true,
    warningSeconds: 10,
    normalColor: "#cded84",
    warningColor: "#ffcf66",
    overrunColor: "#ff727c",
    showOverrun: true,
    ...over,
  });
  let state: Omit<MonitorView, "serverTime"> = {
    protocolVersion: 1,
    simulated: true,
    revision: 3,
    timer: timer(),
    hint: null,
  };
  let mode: "ok" | "down" | "revoked" = "ok";
  const requests: { path: string; method: string; link?: string; url: string }[] = [];
  async function open(path: string, viewport = { width: 1920, height: 1080 }) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/local/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice("/api/local".length);
      requests.push({
        path,
        method: route.request().method(),
        link: route.request().headers()["x-monitor-link"],
        url: route.request().url(),
      });
      if (mode === "down") return route.abort("connectionreset");
      const allowed =
        (path === "/monitor-display" &&
          route.request().headers()["x-monitor-link"] === token) ||
        path === "/monitor/" + eventId;
      if (mode === "revoked" || !allowed)
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "Anzeige-Link ungültig, abgelaufen oder widerrufen." },
          }),
        });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...state, serverTime: new Date(serverNow()).toISOString() }),
      });
    });
    await page.goto(origin + path);
    return { context, page, errors };
  }
  const digits = (page: Page) => page.getByRole("status", { name: "Timer" }).or(page.locator("output.stage-digits"));
  const seconds = async (page: Page) => {
    const text = (await digits(page).textContent()) ?? "";
    const m = /^(−?)(\d{2}):(\d{2})$/.exec(text.trim());
    assert.ok(m, "Zeitformat: " + text);
    return (m[1] ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  };
  try {
    await t.test("Anzeige-Link: Zeit nach Serveruhr, läuft weiter, Token nur im Header", async () => {
      requests.length = 0;
      mode = "ok";
      state = { ...state, timer: timer(), hint: null };
      const { context, page, errors } = await open("/#/anzeige/" + token);
      try {
        await expect(digits(page)).toBeVisible();
        const first = await seconds(page);
        assert.ok(first >= 48 && first <= 50, "Serveranker minus 10 s, trotz Uhrversatz: " + first);
        await page.waitForTimeout(2200);
        const later = await seconds(page);
        assert.ok(first - later >= 1 && first - later <= 3, `zählt weiter: ${first} → ${later}`);
        assert.ok(requests.length >= 2, "pollt");
        assert.ok(requests.every((r) => r.method === "GET"), "nur lesend");
        assert.ok(requests.every((r) => r.path === "/monitor-display" && r.link === token));
        assert.ok(requests.every((r) => !r.url.includes(token)), "Token nie in der URL");
        await expect(page.getByText("Bühnenmonitor im Browser · nur Timer und Hinweise")).toBeVisible();
        await page.screenshot({ path: "test-results/buehnenmonitor-monitor.png" });
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    });

    await t.test("Hinweise neben oder anstelle des Timers, Ablauf, Warn- und Überziehungsfarbe", async () => {
      mode = "ok";
      state = {
        ...state,
        timer: timer({ valueMs: 5_000, anchorAt: new Date(serverNow()).toISOString() }),
        hint: {
          text: "Noch 2 Minuten",
          layout: "alongside",
          shownAt: new Date(serverNow()).toISOString(),
          expiresAt: null,
        },
      };
      const { context, page } = await open("/#/anzeige/" + token, { width: 768, height: 1024 });
      try {
        await expect(page.getByText("Noch 2 Minuten")).toBeVisible();
        await expect(digits(page)).toBeVisible();
        const warn = await page.locator(".stage-page > .stage-monitor").evaluate((e) => getComputedStyle(e).color);
        assert.equal(warn, "rgb(255, 207, 102)", "Warnfarbe");
        await expect(page.getByText("Überziehung")).toBeVisible({ timeout: 8000 });
        const over = await page.locator(".stage-page > .stage-monitor").evaluate((e) => getComputedStyle(e).color);
        assert.equal(over, "rgb(255, 114, 124)", "Überziehungsfarbe");
        assert.ok((await seconds(page)) < 0, "Überziehung negativ");
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          "Tablet ohne waagerechtes Scrollen",
        );
        await page.screenshot({ path: "test-results/buehnenmonitor-tablet.png" });
        state = {
          ...state,
          hint: {
            text: "Bitte zum Ende kommen",
            layout: "replace",
            shownAt: new Date(serverNow()).toISOString(),
            expiresAt: new Date(serverNow() + 1500).toISOString(),
          },
        };
        await expect(page.getByText("Bitte zum Ende kommen")).toBeVisible();
        await expect(digits(page)).toHaveCount(0);
        // Expiry is evaluated with server time even if no new poll arrives.
        mode = "down";
        await expect(page.getByText("Bitte zum Ende kommen")).toHaveCount(0, { timeout: 4000 });
        await expect(digits(page)).toBeVisible();
      } finally {
        await context.close();
      }
    });

    await t.test("Ausfall: kompakte Meldung mit letztem Stand, Wiederverbinden, Widerruf trennt", async () => {
      mode = "ok";
      state = { ...state, timer: timer(), hint: null };
      const { context, page } = await open("/#/anzeige/" + token, { width: 1280, height: 720 });
      try {
        await expect(digits(page)).toBeVisible();
        mode = "down";
        const alert = page.getByRole("alert");
        await expect(alert).toContainText("Verbindung unterbrochen · letzter Stand", { timeout: 6000 });
        await expect(digits(page)).toBeVisible();
        await page.screenshot({ path: "test-results/buehnenmonitor-ausfall.png" });
        mode = "ok";
        await expect(alert).toHaveCount(0, { timeout: 4000 });
        mode = "revoked";
        await expect(page.getByText("Anzeige-Link ungültig, abgelaufen oder widerrufen.")).toBeVisible({ timeout: 4000 });
        await expect(digits(page)).toHaveCount(0);
      } finally {
        await context.close();
      }
    });

    await t.test("Angemeldete Monitorseite und ungültiger Link", async () => {
      requests.length = 0;
      mode = "ok";
      state = { ...state, timer: timer({ mode: "elapsed", valueMs: 0, initialMs: 0, anchorAt: null, started: false }) };
      const { context, page } = await open("/#/monitor/" + eventId);
      try {
        await expect(digits(page)).toHaveText("00:00");
        await expect(page.getByText("Bereit")).toBeVisible();
        assert.ok(requests.some((r) => r.path === "/monitor/" + eventId && !r.link));
        await page.goto(origin + "/#/anzeige/" + "B".repeat(43));
        await expect(page.getByText("Anzeige-Link ungültig, abgelaufen oder widerrufen.")).toBeVisible();
      } finally {
        await context.close();
      }
    });

    await t.test("Regieansicht: Timer laden mit Monitorrevision, Hinweis, Anzeige-Link einmalig", async () => {
      const packageId = "bfb4eb69-b549-4699-a527-79d6d34ded83";
      const posted: { path: string; body: any; csrf?: string }[] = [];
      let revision = 7;
      const monitorState = () => ({
        revision,
        timer: revision > 7 ? timer({ anchorAt: null, started: false, valueMs: 900_000, initialMs: 900_000 }) : null,
        hint: null,
        lastAction: null,
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/local/**", async (route) => {
        const path = new URL(route.request().url()).pathname.slice("/api/local".length);
        const method = route.request().method();
        const body = method === "POST" ? route.request().postDataJSON() : undefined;
        if (method === "POST")
          posted.push({ path, body, csrf: route.request().headers()["x-csrf-token"] });
        const json = (data: unknown, status = 200) =>
          route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
        if (path === "/me")
          return json({
            id: "synthetic-live",
            displayName: "Synthetische Regie",
            admin: false,
            csrfToken: "synthetic-csrf",
            grants: [{ eventId, roles: ["live"] }],
            preparedAt: new Date().toISOString(),
            pendingSync: 0,
          });
        if (path === "/packages")
          return json([{ id: packageId, eventId, name: "Synthetischer Abend", eventRevision: 1, shows: 1, media: 0 }]);
        if (path === "/packages/" + packageId)
          return json({
            schemaVersion: 3,
            id: packageId,
            eventId,
            createdAt: new Date().toISOString(),
            eventRevision: 1,
            event: { name: "Synthetischer Abend", date: null, location: "", modules: [] },
            shows: [{ id: showId, name: "Synthetische Show", description: "", revision: 1, sourceShowId: null, sourceRevision: null, cues: [] }],
            media: [],
            status: "valid",
            errors: [],
            liveActivationSupported: false,
            timers: [{ showId, revision: 2, preset: { mode: "countdown", durationSeconds: 900, warningSeconds: 120, normalColor: "#cded84", warningColor: "#ffcf66", overrunColor: "#ff727c", showOverrun: true, hintText: "Noch 2 Minuten", hintLayout: "alongside", hintExpirySeconds: 30 } }],
          });
        if (path === "/live/" + eventId)
          return json({
            protocolVersion: 1,
            authorityId: "local-server",
            authorityEpoch: "synthetic-epoch",
            sequence: 1,
            eventId,
            simulated: true,
            stand: { revision: 1, packageId, eventRevision: 1, activatedAt: new Date().toISOString(), activatedBy: "Technik", previousPackageId: null, previousEventRevision: null },
            runs: [],
            monitor: monitorState(),
            serverTime: new Date(serverNow()).toISOString(),
            rights: { view: true, operate: true, activate: false },
            history: [],
          });
        if (path === "/live/" + eventId + "/events")
          return json({ epoch: "synthetic-epoch", snapshotRequired: false, events: [] });
        if (path === "/live/commands") {
          revision++;
          return json({ commandId: body.commandId, accepted: true, replayed: false, status: 200, code: "OK", message: "Synthetisch ausgeführt", runId: null, liveRevision: null, monitorRevision: revision, sequence: 2 });
        }
        if (path === "/live/" + eventId + "/monitor-links")
          return json(
            method === "POST"
              ? { id: "6f0d5d55-8f1e-4c43-9f5e-3d1d1f0a0b09", label: body.label, createdAt: new Date().toISOString(), createdBy: "Synthetische Regie", expiresAt: null, token }
              : [],
          );
        return json({ error: { message: "Unzulässige synthetische Testanfrage" } }, 404);
      });
      try {
        await page.goto(origin);
        const monitor = page.getByRole("article", { name: "Bühnenmonitor" });
        await expect(monitor).toBeVisible();
        await expect(monitor.getByText("Kein Timer und kein Hinweis")).toBeVisible();
        await monitor.getByLabel("Show für Timer").selectOption(showId);
        await expect(monitor.getByLabel("Hinweistext")).toHaveValue("Noch 2 Minuten");
        await monitor.getByRole("button", { name: "Timer laden" }).click();
        await expect(monitor.getByRole("button", { name: "Start", exact: true })).toBeVisible();
        const load = posted.find((p) => p.body?.type === "timer.load")!;
        assert.equal(load.body.expectedMonitorRevision, 7);
        assert.deepEqual(load.body.payload, { showId });
        assert.equal(load.csrf, "synthetic-csrf");
        assert.equal("runId" in load.body, false, "keine Liverevision eines Durchlaufs");
        await monitor.getByRole("button", { name: "Start", exact: true }).click();
        await expect.poll(() => posted.filter((p) => p.body?.type === "timer.start").length).toBe(1);
        assert.equal(posted.find((p) => p.body?.type === "timer.start")!.body.expectedMonitorRevision, 8);
        // Loading again asks before replacing the shown timer.
        await monitor.getByRole("button", { name: "Timer laden" }).click();
        await expect(monitor.getByRole("group", { name: "Timer ersetzen" })).toBeVisible();
        await monitor.getByRole("button", { name: "Abbrechen" }).click();
        await monitor.getByRole("button", { name: "Bitte zum Ende kommen" }).click();
        await monitor.getByLabel("Hinweisanzeige").selectOption("replace");
        await monitor.getByRole("button", { name: "Hinweis anzeigen" }).click();
        await expect.poll(() => posted.filter((p) => p.body?.type === "hint.show").length).toBe(1);
        assert.deepEqual(posted.find((p) => p.body?.type === "hint.show")!.body.payload, {
          text: "Bitte zum Ende kommen",
          layout: "replace",
          expirySeconds: 30,
        });
        await monitor.getByText("Anzeige-Links für Tablets").click();
        await monitor.getByLabel("Bezeichnung des Anzeige-Links").fill("Tablet Bühne");
        await monitor.getByLabel("Gültigkeit").selectOption("");
        await monitor.getByRole("button", { name: "Anzeige-Link erstellen" }).click();
        await expect(monitor.getByText(origin + "/#/anzeige/" + token)).toBeVisible();
        assert.deepEqual(posted.find((p) => p.path.endsWith("/monitor-links"))!.body, { label: "Tablet Bühne", validHours: null });
        await page.screenshot({ path: "test-results/buehnenmonitor-regie.png", fullPage: true });
        const commands = posted.filter((p) => p.path === "/live/commands").length;
        await page.waitForTimeout(1500);
        assert.equal(posted.filter((p) => p.path === "/live/commands").length, commands, "keine automatische Wiederholung");
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    });
  } finally {
    await browser.close();
    await app.close();
  }
});
