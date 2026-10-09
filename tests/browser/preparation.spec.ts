import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
  await page
    .locator("input[type=file]")
    .setInputFiles({
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
  expect(errors).toEqual([]);
});
