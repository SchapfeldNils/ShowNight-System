import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fixture } from "../fixture.js";
import { totp } from "../../apps/api/src/security.js";

test("S8-01: Leitung bereitet Verkaufszeiten, Kontingente und Ticketarten vor – ohne Verkauf", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const f = await fixture(55459);
  f.cfg.origin = "http://localhost:3004";
  f.cfg.PUBLIC_BASE_URL = f.cfg.origin;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let other: Page | undefined;
  /** Synthetischer API-Aufruf aus dem angemeldeten Fenster, mit dessen CSRF-Token. */
  const call = (window: Page, path: string, method = "GET", body?: unknown) =>
    window.evaluate(
      async ({ path, method, body }) => {
        const me = await (await fetch("/api/v1/me")).json();
        const response = await fetch("/api/v1" + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": me.csrfToken,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: response.status, json: await response.json() };
      },
      { path, method, body },
    );
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

    // Review #49: echte Konflikte zwischen zwei Fenstern, ohne Mock und mit tatsächlicher Revisionsänderung.
    other = await context.newPage();
    other.setDefaultTimeout(15000);
    other.on("pageerror", (error) => errors.push(error.message));
    await other.setViewportSize({ width: 1280, height: 900 });
    await other.goto(f.cfg.origin);
    await openTickets(other);
    const otherRegion = (name: string) =>
      other!.getByRole("region", { name, exact: true });
    const save = (scope: ReturnType<Page["getByRole"]>, name: string) =>
      scope.getByRole("button", { name, exact: true }).click();

    const normalRow = list.getByRole("listitem", {
      name: "Ticketart Normal",
      exact: true,
    });
    await normalRow
      .getByRole("button", { name: "Bearbeiten", exact: true })
      .click();
    const mine = form("Ticketart Normal bearbeiten");
    await mine.getByLabel("Preis in Euro", { exact: true }).fill("16");
    await otherRegion("Ticketarten")
      .getByRole("listitem", { name: "Ticketart Normal", exact: true })
      .getByRole("button", { name: "Bearbeiten", exact: true })
      .click();
    const theirs = other.getByRole("form", {
      name: "Ticketart Normal bearbeiten",
      exact: true,
    });
    await theirs.getByLabel("Preis in Euro", { exact: true }).fill("17");
    await save(theirs, "Ticketart speichern");
    await expect(
      other.getByText("Ticketart „Normal“ gespeichert."),
    ).toBeVisible();
    await save(mine, "Ticketart speichern");
    await expect(page.getByRole("alert")).toContainText(
      "Deine Eingaben bleiben erhalten",
    );
    await expect(mine.getByLabel("Preis in Euro", { exact: true })).toHaveValue(
      "16",
    );
    const typeChoice = normalRow.getByRole("group", {
      name: "Versionskonflikt",
      exact: true,
    });
    await expect(typeChoice).toContainText("17,00 €");
    await expect(
      mine.getByRole("button", { name: "Ticketart speichern", exact: true }),
    ).toBeDisabled();
    await typeChoice
      .getByRole("button", { name: "Meine Fassung beibehalten", exact: true })
      .click();
    await save(mine, "Ticketart speichern");
    await expect(
      page.getByText("Ticketart „Normal“ gespeichert."),
    ).toBeVisible();
    await expect(normalRow.getByTestId("ticket-price")).toHaveText("16,00 €");

    await times
      .getByLabel("Tickets je Bestellung höchstens", { exact: true })
      .fill("6");
    const otherTimes = otherRegion("Verkaufszeiten");
    await otherTimes
      .getByLabel("Tickets je Bestellung höchstens", { exact: true })
      .fill("5");
    await save(otherTimes, "Verkaufszeiten speichern");
    await expect(other.getByText("Verkaufszeiten gespeichert.")).toBeVisible();
    await save(times, "Verkaufszeiten speichern");
    await expect(page.getByRole("alert")).toContainText(
      "Deine Eingaben bleiben erhalten",
    );
    await expect(
      times.getByLabel("Tickets je Bestellung höchstens", { exact: true }),
    ).toHaveValue("6");
    const settingsChoice = times.getByRole("group", {
      name: "Versionskonflikt",
      exact: true,
    });
    await expect(settingsChoice).toContainText("höchstens 5 je Bestellung");
    await settingsChoice
      .getByRole("button", { name: "Aktuellen Stand übernehmen", exact: true })
      .click();
    await expect(
      times.getByLabel("Tickets je Bestellung höchstens", { exact: true }),
    ).toHaveValue("5");
    console.log("Ticketprobe: echte Zwei-Fenster-Konflikte bestanden");

    await page.reload();
    await openTickets(page);
    await expect(
      region("Verkaufszeiten").getByLabel("Verkaufsbeginn", { exact: true }),
    ).toHaveValue("2026-10-01T10:00");
    await expect(
      region("Verkaufszeiten").getByLabel("Tickets je Bestellung höchstens", {
        exact: true,
      }),
    ).toHaveValue("5");
    await expect(region("Ticketarten").getByRole("listitem")).toHaveCount(3);
    await expect(
      region("Ticketarten")
        .getByRole("listitem", { name: "Ticketart Ermäßigt", exact: true })
        .getByTestId("ticket-price"),
    ).toHaveText("9,50 €");
    console.log("Ticketprobe: Neuladen erhält den Stand");

    // Review #49: doppelte Uhrzeit bleibt beim unveränderten Speichern exakt erhalten, Lücke wird abgelehnt.
    const events = (await call(page, "/events")).json as any[];
    const eventId = events.find(
      (e) => e.name === "Synthetische Ticketnacht",
    ).id;
    const ticketsPath = `/events/${eventId}/tickets`;
    const stored = (await call(page, ticketsPath)).json.settings;
    const ambiguous = await call(page, ticketsPath + "/settings", "PUT", {
      expectedRevision: stored.revision,
      saleStartsAt: stored.saleStartsAt,
      saleEndsAt: stored.saleEndsAt,
      maxTicketsPerOrder: stored.maxTicketsPerOrder,
      admissionAt: "2026-10-25T00:30:00.000Z",
      startsAt: stored.startsAt,
    });
    expect(ambiguous.status).toBe(200);
    await page.reload();
    await openTickets(page);
    const dst = region("Verkaufszeiten");
    await expect(dst.getByLabel("Einlass", { exact: true })).toHaveValue(
      "2026-10-25T02:30",
    );
    await expect(
      dst.getByRole("combobox", {
        name: "Einlass: Zeitumstellung",
        exact: true,
      }),
    ).toHaveValue("first");
    await dst
      .getByLabel("Tickets je Bestellung höchstens", { exact: true })
      .fill("7");
    await save(dst, "Verkaufszeiten speichern");
    await expect(page.getByText("Verkaufszeiten gespeichert.")).toBeVisible();
    const unchanged = (await call(page, ticketsPath)).json.settings;
    expect(unchanged.admissionAt).toBe("2026-10-25T00:30:00.000Z");
    expect(unchanged.maxTicketsPerOrder).toBe(7);
    await dst
      .getByLabel("Verkaufsbeginn", { exact: true })
      .fill("2027-03-28T02:30");
    await save(dst, "Verkaufszeiten speichern");
    await expect(dst.getByRole("alert")).toContainText(
      "wegen der Umstellung auf Sommerzeit nicht",
    );
    expect((await call(page, ticketsPath)).json.settings.revision).toBe(
      unchanged.revision,
    );
    console.log("Ticketprobe: Zeitumstellung bestanden");

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
    await other?.close().catch(() => {});
    for (const socket of f.app.websocketServer.clients) socket.terminate();
    f.app.server.closeAllConnections();
    await f.close();
  }
});
