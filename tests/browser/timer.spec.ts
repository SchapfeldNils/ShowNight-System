import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fixture } from "../fixture.js";
import { totp } from "../../apps/api/src/security.js";

test("Bühnenmonitor: gespeicherter Entwurf und unabhängige persönliche Proben ohne Liveausgabe", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const f = await fixture(55456);
  f.cfg.origin = "http://localhost:3003";
  f.cfg.PUBLIC_BASE_URL = f.cfg.origin;
  const errors: string[] = [];
  const other = await context.newPage();
  for (const window of [page, other])
    window.on("pageerror", (error) => errors.push(error.message));
  const preparation = (window: Page) =>
    window.getByRole("region", {
      name: "Bühnenmonitor vorbereiten",
      exact: true,
    });
  const preview = (window: Page) =>
    window.getByRole("region", {
      name: "Persönliche Bühnenmonitorprobe",
      exact: true,
    });
  const value = (window: Page) => preview(window).getByTestId("timer-value");
  const openShow = async (window: Page) => {
    await window.getByRole("button", { name: "Shows", exact: true }).click();
    await window
      .locator(".show-row")
      .filter({ hasText: "Synthetische Bühnenmonitorprobe" })
      .getByRole("button", { name: "Arbeitsfläche öffnen", exact: true })
      .click();
    await expect(preparation(window)).toBeVisible();
  };
  const freeze = async (window: Page) => {
    await window.clock.install();
    await window.clock.pauseAt(new Date(Date.now() + 1000));
  };
  try {
    await f.app.listen({ host: "127.0.0.1", port: 3003 });
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
    await page.getByRole("button", { name: "Shows", exact: true }).click();
    await page
      .getByLabel("Name der Show", { exact: true })
      .fill("Synthetische Bühnenmonitorprobe");
    await page
      .getByRole("button", { name: "Show anlegen", exact: true })
      .click();
    const form = preparation(page);
    await expect(form).toBeVisible();
    await form
      .getByLabel("Timerart", { exact: true })
      .selectOption("countdown");
    await form.getByLabel("Dauer in Sekunden", { exact: true }).fill("2");
    await form.getByLabel("Warnung ab Sekunden", { exact: true }).fill("1");
    await form
      .getByLabel("Hinweistext", { exact: true })
      .fill("Synthetischer Hinweis eins");
    await form
      .getByLabel("Hinweisablauf in Sekunden", { exact: true })
      .fill("2");
    await form
      .getByLabel("Hinweisanzeige", { exact: true })
      .selectOption("replace");
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/shows/") &&
        response.request().method() === "PUT",
    );
    await form
      .getByRole("button", { name: "Monitorentwurf speichern", exact: true })
      .click();
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await openShow(page);
    await expect(
      preparation(page).getByLabel("Dauer in Sekunden", { exact: true }),
    ).toHaveValue("2");
    await expect(
      preparation(page).getByLabel("Hinweistext", { exact: true }),
    ).toHaveValue("Synthetischer Hinweis eins");
    await expect(
      preparation(page).getByLabel("Hinweisablauf in Sekunden", {
        exact: true,
      }),
    ).toHaveValue("2");
    await other.goto(f.cfg.origin);
    await openShow(other);
    await freeze(page);
    await freeze(other);
    await preparation(page)
      .getByRole("button", { name: "Vorschau starten", exact: true })
      .click();
    await preparation(other)
      .getByRole("button", { name: "Vorschau starten", exact: true })
      .click();
    await preparation(other)
      .getByRole("button", { name: "Vorschau pausieren", exact: true })
      .click();
    const initial = await value(page).innerText();
    await page.clock.runFor(1000);
    await preparation(page)
      .getByRole("button", { name: "Vorschau pausieren", exact: true })
      .click();
    const paused = await value(page).innerText();
    expect(paused).not.toBe(initial);
    await page.clock.runFor(3000);
    await expect(value(page)).toHaveText(paused);
    await expect(value(other)).toHaveText(initial);
    await preparation(page)
      .getByRole("button", { name: "Vorschau fortsetzen", exact: true })
      .click();
    await page.clock.runFor(2000);
    await expect(preview(page).getByText(/^Überziehung ·/)).toBeVisible();
    await expect(value(other)).toHaveText(initial);
    await preparation(page)
      .getByRole("button", { name: "Vorschau pausieren", exact: true })
      .click();
    const overtime = await value(page).innerText();
    await preparation(page)
      .getByRole("button", { name: "Zeitkorrektur +30 Sekunden", exact: true })
      .click();
    await expect(value(page)).not.toHaveText(overtime);
    await preparation(page)
      .getByRole("button", { name: "Zeitkorrektur −30 Sekunden", exact: true })
      .click();
    await expect(value(page)).toHaveText(overtime);
    await preparation(page)
      .getByRole("button", { name: "Vorschau zurücksetzen", exact: true })
      .click();
    await expect(value(page)).toHaveText(initial);
    await expect(preview(page).getByText(/^Überziehung ·/)).toHaveCount(0);
    await preparation(page)
      .getByRole("button", { name: "Hinweis anzeigen", exact: true })
      .click();
    await expect(
      preview(page).getByText("Synthetischer Hinweis eins", { exact: true }),
    ).toBeVisible();
    await preparation(page)
      .getByLabel("Hinweistext", { exact: true })
      .fill("Synthetischer Ersatzhinweis");
    await preparation(page)
      .getByRole("button", { name: "Hinweis anzeigen", exact: true })
      .click();
    // Running rehearsal keeps its last-start snapshot despite draft edits.
    await expect(
      preview(page).getByText("Synthetischer Hinweis eins", { exact: true }),
    ).toBeVisible();
    await expect(
      preview(page).getByText("Synthetischer Ersatzhinweis", { exact: true }),
    ).toHaveCount(0);
    await preparation(page)
      .getByRole("button", { name: "Vorschau starten", exact: true })
      .click();
    await preparation(page)
      .getByRole("button", { name: "Hinweis anzeigen", exact: true })
      .click();
    await expect(
      preview(page).getByText("Synthetischer Ersatzhinweis", { exact: true }),
    ).toBeVisible();
    await expect(value(page)).toHaveCount(0);
    await expect(
      preview(other).getByText("Synthetischer Ersatzhinweis", { exact: true }),
    ).toHaveCount(0);
    await page.clock.runFor(2200);
    await expect(
      preview(page).getByText("Synthetischer Ersatzhinweis", { exact: true }),
    ).toHaveCount(0);
    await expect(value(page)).toBeVisible();
    await expect(value(page)).toHaveText(/^−/);
    await preparation(page)
      .getByRole("button", { name: "Hinweis anzeigen", exact: true })
      .click();
    await preparation(page)
      .getByRole("button", { name: "Hinweis ausblenden", exact: true })
      .click();
    await expect(
      preview(page).getByText("Synthetischer Ersatzhinweis", { exact: true }),
    ).toHaveCount(0);
    await mkdir(".local", { recursive: true });
    await preview(page).screenshot({ path: ".local/timer-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await preparation(page).screenshot({ path: ".local/timer-mobil.png" });
    // A failed save remains an unsaved draft; no automatic command replay.
    let rejectedSaves = 0;
    await page.route("**/api/v1/shows/*/timer-preparation", async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      rejectedSaves++;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "REVISION_CONFLICT",
            message: "Synthetischer Speicherkonflikt",
          },
        }),
      });
    });
    await preparation(page)
      .getByRole("button", { name: "Monitorentwurf speichern", exact: true })
      .click();
    await expect(
      page.getByText("Synthetischer Speicherkonflikt", { exact: true }),
    ).toBeVisible();
    await page.clock.runFor(2000);
    expect(rejectedSaves).toBe(1);
    await page.unroute("**/api/v1/shows/*/timer-preparation");
    await page.reload();
    await openShow(page);
    await expect(
      preparation(page).getByLabel("Hinweistext", { exact: true }),
    ).toHaveValue("Synthetischer Hinweis eins");
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    await other.close();
    for (const socket of f.app.websocketServer.clients) socket.terminate();
    f.app.server.closeAllConnections();
    await f.close();
  }
});
