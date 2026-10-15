import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fixture } from "../fixture.js";
import { totp } from "../../apps/api/src/security.js";

test("S8-01: Leitung bereitet Verkaufszeiten, Kontingente und Ticketarten vor – ohne Verkauf", async ({
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const f = await fixture(55459);
  f.cfg.origin = "http://localhost:3004";
  f.cfg.PUBLIC_BASE_URL = f.cfg.origin;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const region = (name: string) =>
    page.getByRole("region", { name, exact: true });
  const form = (name: string) => page.getByRole("form", { name, exact: true });
  const openTickets = async (window: Page) => {
    await window
      .getByRole("combobox", { name: "Veranstaltung wechseln", exact: true })
      .selectOption({ label: "Synthetische Ticketnacht" });
    await window.getByRole("button", { name: "Tickets", exact: true }).click();
    await expect(
      window.getByRole("region", { name: "Verkaufszeiten", exact: true }),
    ).toBeVisible();
  };
  try {
    await f.app.listen({ host: "127.0.0.1", port: 3004 });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(f.cfg.origin);
    await page.getByLabel("Benutzername", { exact: true }).fill("admin");
    await page.getByLabel("Kennwort", { exact: true }).fill(f.adminPassword);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    const secret = await page.locator("code.secret").innerText();
    await page
      .getByLabel("Authenticator-Code oder Wiederherstellungscode")
      .fill(totp(secret));
    await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
    await page
      .getByRole("button", { name: "Codes gesichert · Weiter" })
      .click();
    await page
      .getByLabel("Name der Veranstaltung", { exact: true })
      .fill("Synthetische Ticketnacht");
    await page
      .getByRole("button", { name: "Veranstaltung anlegen", exact: true })
      .click();
    await page.getByRole("button", { name: "Tickets", exact: true }).click();
    await expect(
      page.getByText("Vorbereitung – es findet noch kein Verkauf statt.", {
        exact: false,
      }),
    ).toBeVisible();
    console.log("Ticketprobe: Bereich geöffnet");

    const times = region("Verkaufszeiten");
    await times
      .getByLabel("Verkaufsbeginn", { exact: true })
      .fill("2026-10-01T10:00");
    await times
      .getByLabel("Verkaufsende", { exact: true })
      .fill("2026-11-14T18:00");
    await times.getByLabel("Einlass", { exact: true }).fill("2026-11-14T18:00");
    await times
      .getByLabel("Veranstaltungsbeginn", { exact: true })
      .fill("2026-11-14T19:00");
    await times
      .getByLabel("Tickets je Bestellung höchstens", { exact: true })
      .fill("8");
    await times
      .getByRole("button", { name: "Verkaufszeiten speichern", exact: true })
      .click();
    await expect(page.getByText("Verkaufszeiten gespeichert.")).toBeVisible();

    for (const [name, capacity] of [
      ["Saal", "300"],
      ["Empore", "40"],
    ]) {
      const create = form("Kontingent anlegen");
      await create
        .getByLabel("Name des Kontingents", { exact: true })
        .fill(name);
      await create.getByLabel("Kapazität", { exact: true }).fill(capacity);
      await create
        .getByRole("button", { name: "Kontingent anlegen", exact: true })
        .click();
      await expect(
        page.getByText(`Kontingent „${name}“ angelegt.`),
      ).toBeVisible();
    }
    console.log("Ticketprobe: Kontingente angelegt");

    const types: [string, string, string, string, boolean][] = [
      ["Normal", "15", "Saal (300)", "", false],
      ["Ermäßigt", "0", "Saal (300)", "400", true],
      ["Empore", "12,50", "Empore (40)", "", false],
    ];
    for (const [name, price, contingent, limit, confirm] of types) {
      const create = form("Ticketart anlegen");
      await create.getByLabel("Name der Ticketart", { exact: true }).fill(name);
      await create.getByLabel("Preis in Euro", { exact: true }).fill(price);
      await create
        .getByLabel("Kontingent", { exact: true })
        .selectOption({ label: contingent });
      await create
        .getByLabel("Höchstzahl dieser Ticketart (optional)", { exact: true })
        .fill(limit);
      if (confirm)
        await create
          .getByLabel("Bestätigung beim Kauf verlangen", { exact: true })
          .check();
      await create
        .getByRole("button", { name: "Ticketart anlegen", exact: true })
        .click();
      await expect(
        page.getByText(`Ticketart „${name}“ angelegt.`),
      ).toBeVisible();
    }
    const list = region("Ticketarten");
    await expect(
      list
        .getByRole("listitem", { name: "Ticketart Empore", exact: true })
        .getByTestId("ticket-price"),
    ).toHaveText("12,50 €");
    await expect(
      list
        .getByRole("listitem", { name: "Ticketart Normal", exact: true })
        .getByTestId("ticket-price"),
    ).toHaveText("15,00 €");
    console.log("Ticketprobe: Ticketarten angelegt");

    const review = region("Vorbereitung prüfen");
    await expect(review.getByTestId("ticket-total-capacity")).toHaveText("340");
    const hints = review.getByRole("list", {
      name: "Hinweise zur Vorbereitung",
      exact: true,
    });
    await expect(hints.getByRole("listitem")).toHaveCount(2);
    await expect(hints).toContainText("Ermäßigt“ erlaubt 400 Tickets");
    await expect(hints).toContainText("Ermäßigt“ kostet 0 €");
    await expect(review).toContainText("01.10.2026, 10:00 Uhr");

    // Bearbeiten beseitigt beide Hinweise.
    const reduced = list.getByRole("listitem", {
      name: "Ticketart Ermäßigt",
      exact: true,
    });
    await reduced
      .getByRole("button", { name: "Bearbeiten", exact: true })
      .click();
    const edit = form("Ticketart Ermäßigt bearbeiten");
    await edit.getByLabel("Preis in Euro", { exact: true }).fill("9,50");
    await edit
      .getByLabel("Höchstzahl dieser Ticketart (optional)", { exact: true })
      .fill("100");
    await edit
      .getByRole("button", { name: "Ticketart speichern", exact: true })
      .click();
    await expect(
      page.getByText("Ticketart „Ermäßigt“ gespeichert."),
    ).toBeVisible();
    await expect(
      review.getByText("Keine Auffälligkeiten gefunden.", { exact: true }),
    ).toBeVisible();

    // Kontingent mit Ticketarten bleibt geschützt.
    const empore = region("Kontingente").getByRole("listitem", {
      name: "Kontingent Empore",
      exact: true,
    });
    await empore.getByRole("button", { name: "Löschen", exact: true }).click();
    await empore
      .getByRole("button", { name: "Endgültig löschen", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Das Kontingent wird von 1 Ticketart verwendet.",
    );
    console.log("Ticketprobe: Bearbeitung und Löschschutz bestanden");

    // Ein Konflikt überschreibt nichts und erhält die Eingabe.
    let rejected = 0;
    await page.route("**/api/v1/events/*/tickets/settings", async (route) => {
      rejected++;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "REVISION_CONFLICT",
            message: "Synthetischer Konflikt",
          },
        }),
      });
    });
    await times
      .getByLabel("Tickets je Bestellung höchstens", { exact: true })
      .fill("6");
    await times
      .getByRole("button", { name: "Verkaufszeiten speichern", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "deine Eingaben stehen noch im Formular",
    );
    await expect(
      times.getByLabel("Tickets je Bestellung höchstens", { exact: true }),
    ).toHaveValue("6");
    expect(rejected).toBe(1);
    await page.unroute("**/api/v1/events/*/tickets/settings");

    await page.reload();
    await openTickets(page);
    await expect(
      region("Verkaufszeiten").getByLabel("Verkaufsbeginn", { exact: true }),
    ).toHaveValue("2026-10-01T10:00");
    await expect(
      region("Verkaufszeiten").getByLabel("Tickets je Bestellung höchstens", {
        exact: true,
      }),
    ).toHaveValue("8");
    await expect(region("Ticketarten").getByRole("listitem")).toHaveCount(3);
    await expect(
      region("Ticketarten")
        .getByRole("listitem", { name: "Ticketart Ermäßigt", exact: true })
        .getByTestId("ticket-price"),
    ).toHaveText("9,50 €");
    console.log("Ticketprobe: Neuladen erhält den Stand");

    await mkdir(".local", { recursive: true });
    await page.screenshot({
      path: ".local/tickets-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll("body *")]
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: String(element.className),
            right: bounds.right,
          };
        })
        .filter((element) => element.right > innerWidth + 1)
        .slice(0, 16),
    }));
    console.log("Ticketprobe Mobilgeometrie: " + JSON.stringify(geometry));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: ".local/tickets-mobil.png", fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank").catch(() => {});
    for (const socket of f.app.websocketServer.clients) socket.terminate();
    f.app.server.closeAllConnections();
    await f.close();
  }
});
