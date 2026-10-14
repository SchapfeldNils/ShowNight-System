import { test, expect, type WebSocketRoute } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pair } from "../../apps/agent/src/identity.js";
import { startAgent } from "../../apps/agent/src/client.js";
import { baseCapabilities } from "../../apps/agent/src/diagnostics.js";
import { totp } from "../../apps/api/src/security.js";
test("S1: Browserablauf mit MFA, Event, Team, Showkopie, Upload, Konflikt und Manifest", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const statusSockets: WebSocketRoute[] = [];
  await page.routeWebSocket("**/api/v1/status/ws", (socket) => {
    statusSockets.push(socket);
    if (statusSockets.length === 1) {
      socket.close({
        code: 1011,
        reason: "Synthetischer anfänglicher Verbindungsfehler",
      });
    } else socket.connectToServer();
  });
  const credentials = JSON.parse(
    await readFile(".local/browser-credentials.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("Benutzername", { exact: true })
    .fill(credentials.login);
  await page.getByLabel("Kennwort", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByText("MFA einrichten", { exact: true })).toBeVisible();
  const secret = await page.locator("code.secret").innerText();
  await page
    .getByLabel("Authenticator-Code oder Wiederherstellungscode")
    .fill(totp(secret));
  await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
  await page.getByRole("button", { name: "Codes gesichert · Weiter" }).click();
  await expect(
    page.getByRole("heading", { name: "Übersicht", exact: true }),
  ).toBeVisible();
  const disconnected = page.getByText(/Statusverbindung unterbrochen/);
  await expect.poll(() => statusSockets.length).toBe(2);
  await expect(disconnected).toHaveCount(0);
  statusSockets[1].close({ code: 1011, reason: "Synthetischer Serverausfall" });
  await expect(disconnected).toBeVisible();
  const identity = await (await context.request.get("/api/v1/me")).json();
  const newEvent = await context.request.post("/api/v1/events", {
    headers: {
      origin: "http://localhost:3000",
      "x-csrf-token": identity.csrfToken,
    },
    data: { name: "Stand nach Wiederverbindung" },
  });
  expect(newEvent.ok()).toBe(true);
  await expect(
    page.getByLabel("Veranstaltung wechseln").locator("option", {
      hasText: "Stand nach Wiederverbindung",
    }),
  ).toHaveCount(1);
  await expect.poll(() => statusSockets.length).toBe(3);
  await expect(disconnected).toHaveCount(0);
  await page.getByLabel("Name der Veranstaltung").fill("Browser Musterabend");
  await page
    .getByRole("button", { name: "Veranstaltung anlegen", exact: true })
    .click();
  await expect(
    page.getByText("Datum offen – für Terminplanung später ergänzen."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Teams & Rechte", exact: true })
    .click();
  await page.getByLabel("Neues Team", { exact: true }).fill("Browser Showteam");
  await page.getByRole("button", { name: "Team anlegen und zuordnen" }).click();
  await expect(
    page.locator(".team-row strong").filter({ hasText: "Browser Showteam" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Shows", exact: true }).click();
  await page
    .getByLabel("Name der Show", { exact: true })
    .fill("Browser Sternlicht");
  await page.getByRole("button", { name: "Show anlegen", exact: true }).click();
  await page
    .getByLabel("Beschreibung", { exact: true })
    .fill("Originalfassung für die Veranstaltung");
  await page.locator("input[type=file]").setInputFiles({
    name: "synthetisch.png",
    mimeType: "image/png",
    buffer: Buffer.from(credentials.png, "base64"),
  });
  await expect(
    page.getByText("Original gespeichert. Analyse läuft im Worker."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Einsatz hinzufügen" }).click();
  await page.getByLabel("Einsatzname", { exact: true }).fill("Begrüßung");
  await page
    .getByLabel("Auslösehinweis", { exact: true })
    .fill("Moderation bereit");
  await page.getByLabel("Medienreferenz hinzufügen").selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Show speichern", exact: true })
    .click();
  await expect(page.getByLabel("Beschreibung", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Als Eventkopie aufnehmen" }).click();
  await expect(
    page.getByText(
      "Eigenständige Eventkopie aufgenommen. Spätere Quellenänderungen werden nicht automatisch übernommen.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Medien", exact: true }).click();
  await expect(page.getByText("Geprüft", { exact: true })).toBeVisible();
  await expect(page.locator('img[alt="synthetisch.png"]')).toBeVisible();
  await page.getByRole("button", { name: "Übersicht", exact: true }).click();
  await page.getByRole("button", { name: "Paketmanifest erzeugen" }).click();
  await expect(page.getByText("Manifest vollständig geprüft")).toBeVisible();
  const packageDownload = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Paket mit Medien herunterladen" })
    .click();
  const downloaded = await packageDownload;
  expect(downloaded.suggestedFilename()).toMatch(
    /^shownight-[0-9a-f-]+\.snpkg$/,
  );
  await downloaded.saveAs("test-results/s3-browser-package.snpkg");
  await page.screenshot({
    path: "test-results/s1-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("Veranstaltung wechseln", { exact: true })
    .selectOption("");
  await page.getByRole("button", { name: "Shows", exact: true }).click();
  await page.getByRole("button", { name: "Arbeitsfläche öffnen" }).click();
  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: "Shows", exact: true }).click();
  await second.getByRole("button", { name: "Arbeitsfläche öffnen" }).click();
  await second
    .getByLabel("Beschreibung", { exact: true })
    .fill("Andere Person hat gespeichert");
  await second
    .getByRole("button", { name: "Show speichern", exact: true })
    .click();
  await expect(second.getByLabel("Beschreibung", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Beschreibung", { exact: true })
    .fill("Meine konkurrierende Fassung");
  await page
    .getByRole("button", { name: "Show speichern", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Versionskonflikt" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText(/Andere Person hat gespeichert/),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText(/Meine konkurrierende Fassung/),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/s1-konflikt.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Aktuelle Fassung übernehmen" })
    .click();
  await page
    .getByLabel("Veranstaltung wechseln", { exact: true })
    .selectOption({ label: "Browser Musterabend" });
  await page.getByRole("button", { name: "Shows", exact: true }).click();
  await page
    .locator("section.card")
    .filter({
      has: page.getByRole("heading", { name: "Shows in dieser Veranstaltung" }),
    })
    .getByRole("button", { name: "Arbeitsfläche öffnen" })
    .first()
    .click();
  await expect(page.getByLabel("Beschreibung", { exact: true })).toHaveValue(
    "Originalfassung für die Veranstaltung",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Übersicht", exact: true }).click();
  await page.screenshot({ path: "test-results/s1-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await second.close();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Diagnose", exact: true }).click();
  await page
    .getByLabel("Gerätename", { exact: true })
    .fill("Browser-Testagent");
  await page.getByLabel("Geräteprofil", { exact: true }).selectOption("main");
  await page
    .getByRole("button", { name: "Paarungscode erstellen", exact: true })
    .click();
  const code = await page.locator(".callout code").innerText();
  const agentIdentity = await pair("http://127.0.0.1:3000", code);
  // UI contract test; the actual HTTP probe is covered separately.
  let pluginAvailable = true;
  const agent = startAgent(
    agentIdentity,
    await mkdtemp(join(tmpdir(), "shownight-browser-agent-")),
    undefined,
    async () =>
      baseCapabilities.map((c) =>
        c.name === "VirtualDJ-Leseabfrage"
          ? {
              ...c,
              name: "VirtualDJ-Leseabfrage (Vertragstest)",
              source: "agent",
              availability: pluginAvailable ? "available" : "unavailable",
              observedAt: new Date().toISOString(),
            }
          : c,
      ),
  );
  try {
    await page.getByRole("button", { name: "Code ausblenden" }).click();
    const device = page
      .locator("article.callout")
      .filter({ hasText: "Browser-Testagent" });
    await expect(device.getByText("Verbunden", { exact: true })).toBeVisible({
      timeout: 12000,
    });
    await device
      .getByRole("button", { name: "Verbindung prüfen", exact: true })
      .click();
    await expect(device.getByText(/Diagnose abgeschlossen/)).toBeVisible({
      timeout: 12000,
    });
    await expect(
      device.getByText(/VirtualDJ-Leseabfrage \(Vertragstest\): Verfügbar/),
    ).toBeVisible();
    pluginAvailable = false;
    await expect(
      device.getByText(
        /VirtualDJ-Leseabfrage \(Vertragstest\): Leseprüfung nicht bestätigt/,
      ),
    ).toBeVisible({ timeout: 15000 });
    pluginAvailable = true;
    await expect(
      device.getByText(/VirtualDJ-Leseabfrage \(Vertragstest\): Verfügbar/),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: "test-results/s2-agent-connected.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await device
      .getByRole("button", { name: "Geräteidentität widerrufen" })
      .click();
    await expect(device.getByText("Widerrufen", { exact: true })).toBeVisible();
    await expect(
      device.getByText(
        /VirtualDJ-Leseabfrage \(Vertragstest\): Letzte Meldung – aktuell ungeprüft/,
      ),
    ).toBeVisible();
    await expect(
      device.getByRole("button", { name: "Verbindung prüfen", exact: true }),
    ).toBeDisabled();
  } finally {
    agent.stop();
  }
  // Session revocation closes the live socket and must stop automatic retries.
  const logout = await context.request.post("/api/v1/auth/logout", {
    headers: {
      origin: "http://localhost:3000",
      "x-csrf-token": identity.csrfToken,
    },
  });
  expect(logout.ok()).toBe(true);
  await expect(page.getByLabel("Benutzername", { exact: true })).toBeVisible({
    timeout: 12000,
  });
  const connectionsAfterLogout = statusSockets.length;
  await page.waitForTimeout(2200);
  expect(statusSockets.length).toBe(connectionsAfterLogout);
  expect(errors).toEqual([]);
});
