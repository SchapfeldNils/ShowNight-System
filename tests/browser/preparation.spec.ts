import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  createTarget,
  decryptSnapshot,
} from "../../packages/transfer/src/offline.js";
import { PackageStore } from "../../apps/local/src/store.js";
import { LocalAccounts } from "../../apps/local/src/accounts.js";
import { localServer } from "../../apps/local/src/server.js";
import { pair } from "../../apps/agent/src/identity.js";
import { startAgent } from "../../apps/agent/src/client.js";
import { baseCapabilities } from "../../apps/agent/src/diagnostics.js";
import { totp } from "../../apps/api/src/security.js";
test("S1: Browserablauf mit MFA, Event, Team, Showkopie, Upload, Konflikt und Manifest", async ({
  page,
  context,
}) => {
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
  // Full source UI export -> signed import -> local portal, with synthetic data.
  const target = createTarget(),
    targetPath = resolve(".local/browser-target.sntarget");
  await writeFile(targetPath, JSON.stringify(target.target), { mode: 0o600 });
  await page.getByLabel("Zielanfrage (.sntarget)").setInputFiles(targetPath);
  const authDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Verschlüsselten Anmeldestand herunterladen" })
    .click();
  await (await authDownload).saveAs("test-results/s3-browser.snauth");
  const trust = await context.request.get("/api/v1/offline/trust");
  expect(trust.ok()).toBeTruthy();
  const snapshot = decryptSnapshot(
    JSON.parse(await readFile("test-results/s3-browser.snauth", "utf8")),
    target.privateKey,
    target.target.targetId,
    await trust.json(),
  );
  const localRoot = await mkdtemp(join(tmpdir(), "shownight-offline-browser-")),
    pr = join(localRoot, "packages");
  await mkdir(pr);
  const packages = new PackageStore(pr),
    accounts = new LocalAccounts(localRoot, randomBytes(32).toString("hex"));
  await packages.importArchive(
    resolve("test-results/s3-browser-package.snpkg"),
  );
  accounts.importSnapshot(snapshot);
  // Browser contract uses localhost HTTP only in this isolated test. Native
  // Windows bundle tests separately validate the actual PFX HTTPS connection.
  const local = await localServer(
    accounts,
    packages,
    "http://localhost:3444",
    resolve("dist/server/web"),
  );
  await local.listen({ host: "127.0.0.1", port: 3444 });
  const localPage = await context.newPage();
  localPage.on("pageerror", (e) => errors.push(e.message));
  try {
    await localPage.goto("http://localhost:3444");
    await localPage
      .getByLabel("Benutzername", { exact: true })
      .fill(credentials.login);
    await localPage
      .getByLabel("Kennwort", { exact: true })
      .fill(credentials.password);
    await localPage
      .getByRole("button", { name: "Anmelden", exact: true })
      .click();
    await expect(
      localPage.getByRole("heading", { name: "Zusätzliche Bestätigung" }),
    ).toBeVisible();
    await localPage
      .getByLabel("Authenticator- oder Offline-Recoverycode")
      .fill(totp(secret));
    await localPage
      .getByRole("button", { name: "Bestätigen", exact: true })
      .click();
    await expect(
      localPage.getByRole("heading", {
        name: "Offline-Recoverycodes einmalig sichern",
      }),
    ).toBeVisible();
    await localPage
      .getByRole("button", { name: "Codes gesichert", exact: true })
      .click();
    await localPage
      .getByRole("button", { name: "Paket ansehen", exact: true })
      .click();
    await expect(
      localPage
        .getByRole("heading", { name: "Browser Musterabend", exact: true })
        .last(),
    ).toBeVisible();
    await expect(
      localPage.getByText("Originalfassung für die Veranstaltung"),
    ).toBeVisible();
    await localPage
      .getByLabel("Benutzername", { exact: true })
      .fill("offline.browser");
    await localPage
      .getByLabel("Name", { exact: true })
      .fill("Offline Musterkonto");
    await localPage
      .getByRole("button", { name: "Konto vorbereiten", exact: true })
      .click();
    await expect(
      localPage.getByText(/Persönlicher Einrichtungscode/),
    ).toBeVisible();
    await localPage
      .getByRole("button", { name: "Persönlich übernommen" })
      .click();
    await expect(
      localPage.getByText("Offline Musterkonto", { exact: true }),
    ).toBeVisible();
    const offlineUser = localPage
      .locator("li")
      .filter({ hasText: "Offline Musterkonto" });
    await offlineUser
      .getByRole("button", { name: "Für Veranstaltung sperren", exact: true })
      .click();
    await expect(
      offlineUser.getByText(/Für diese Veranstaltung gesperrt/),
    ).toBeVisible();
    await expect(
      localPage.getByText(/2 lokale Änderungen vorgemerkt/),
    ).toBeVisible();
    await localPage.screenshot({
      path: "test-results/s3-offline-server.png",
      fullPage: true,
    });
    await localPage.setViewportSize({ width: 390, height: 844 });
    expect(
      await localPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await localPage
      .getByRole("button", { name: "Abmelden", exact: true })
      .click();
    await expect(
      localPage.getByRole("heading", { name: "Lokal anmelden" }),
    ).toBeVisible();
  } finally {
    await localPage.close();
    await local.close();
    accounts.close();
    packages.close();
  }
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
  const identity = await pair("http://127.0.0.1:3000", code);
  // UI contract test; the actual HTTP probe is covered separately.
  let pluginAvailable = true;
  const agent = startAgent(
    identity,
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
  expect(errors).toEqual([]);
});
