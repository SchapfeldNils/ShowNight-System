import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { fixture } from "../fixture.js";
import { totp } from "../../apps/api/src/security.js";

// Q1a: Bibliothek, Frage und Runde über die Weboberfläche, nur synthetische Daten.
test("Quiz Q1a: Bibliothek anlegen, Frage speichern und als festen Stand in eine Runde übernehmen", async ({
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const f = await fixture(55463);
  f.cfg.origin = "http://localhost:3007";
  f.cfg.PUBLIC_BASE_URL = f.cfg.origin;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const eventId = randomUUID(),
      showId = randomUUID();
    await f.db.query(
      `INSERT INTO events(id,name,modules,created_by,updated_by)
       SELECT $1,'Synthetischer Quizabend','["organisation","shows","spiele","technik"]',id,id FROM users WHERE login='admin'`,
      [eventId],
    );
    await f.db.query(
      "INSERT INTO grants(event_id,user_id,role) SELECT $1,id,'leitung' FROM users WHERE login='admin'",
      [eventId],
    );
    await f.db.query(
      "INSERT INTO shows(id,event_id,name,created_by,updated_by) SELECT $1,$2,'Synthetische Quizshow',id,id FROM users WHERE login='admin'",
      [showId, eventId],
    );
    await f.app.listen({ host: "127.0.0.1", port: 3007 });
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
      .getByLabel("Veranstaltung wechseln", { exact: true })
      .selectOption({ label: "Synthetischer Quizabend" });
    await page.getByRole("button", { name: "Quiz", exact: true }).click();

    await page.getByLabel("Neue Bibliothek", { exact: true }).fill("Hauptquiz");
    await page
      .getByLabel("Quizshow", { exact: true })
      .selectOption({ label: "Synthetische Quizshow" });
    await page
      .getByRole("button", { name: "Bibliothek anlegen", exact: true })
      .click();
    const library = page.getByRole("region", { name: "Bibliothek Hauptquiz" });
    await expect(library).toBeVisible();
    await library
      .getByRole("button", { name: "Neue Frage", exact: true })
      .click();
    const form = library.getByRole("form", { name: "Frage bearbeiten" });
    // Ohne richtige Antwort lehnt die Prüfung ab, bevor etwas gespeichert wird.
    await form
      .getByRole("textbox", { name: "Frage", exact: true })
      .fill("Welche Farbe hat der synthetische Vorhang?");
    await form.getByLabel("Antwort A", { exact: true }).fill("Rot");
    await form.getByLabel("Antwort B", { exact: true }).fill("Blau");
    await form.getByRole("button", { name: "Frage speichern" }).click();
    await expect(form.getByRole("alert")).toContainText("Bitte prüfen");
    await form.getByLabel("Antwort B ist richtig", { exact: true }).check();
    await form.getByRole("button", { name: "Frage speichern" }).click();
    await expect(library.getByRole("status")).toHaveText("Frage gespeichert.");
    await expect(library).toContainText("Lösung: Blau · Fassung 1");

    await page
      .getByLabel("Show", { exact: true })
      .selectOption({ label: "Synthetische Quizshow" });
    const rounds = page.getByRole("region", { name: "Quizrunden" });
    await rounds.getByLabel("Neue Runde", { exact: true }).fill("Runde 1");
    await rounds.getByRole("button", { name: "Runde anlegen" }).click();
    const round = rounds.getByRole("article", { name: "Runde Runde 1" });
    await expect(round).toBeVisible();
    await expect(
      round.getByLabel("Antwortfrist der Runde (Sekunden)", { exact: true }),
    ).toHaveValue("30");
    await round
      .getByLabel("Frage hinzufügen", { exact: true })
      .selectOption({ index: 1 });
    await round
      .getByRole("button", { name: "Hinzufügen", exact: true })
      .click();
    await round
      .getByLabel("Antwortfrist der Runde (Sekunden)", { exact: true })
      .fill("45");
    await round
      .getByLabel("Frist für Welche Farbe hat der synthetische Vorhang?", {
        exact: true,
      })
      .fill("90");
    await round.getByRole("button", { name: "Runde speichern" }).click();
    await expect(rounds.getByRole("status")).toHaveText("Runde gespeichert.");

    // Neu laden: der feste Stand ist gespeichert.
    await page.reload();
    await page
      .getByLabel("Veranstaltung wechseln", { exact: true })
      .selectOption({ label: "Synthetischer Quizabend" });
    await page.getByRole("button", { name: "Quiz", exact: true }).click();
    await page
      .getByLabel("Show", { exact: true })
      .selectOption({ label: "Synthetische Quizshow" });
    const saved = page.getByRole("article", { name: "Runde Runde 1" });
    await expect(saved).toContainText(
      "Welche Farbe hat der synthetische Vorhang?",
    );
    await expect(saved).toContainText("Fassung 1");
    await expect(
      saved.getByLabel("Antwortfrist der Runde (Sekunden)", { exact: true }),
    ).toHaveValue("45");
    await expect(
      saved.getByLabel("Frist für Welche Farbe hat der synthetische Vorhang?", {
        exact: true,
      }),
    ).toHaveValue("90");
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank").catch(() => {});
    for (const socket of f.app.websocketServer.clients) socket.terminate();
    f.app.server.closeAllConnections();
    await f.close();
  }
});
