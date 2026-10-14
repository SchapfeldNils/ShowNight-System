import { test, expect } from "@playwright/test";
import { fixture } from "../fixture.js";
import { totp } from "../../apps/api/src/security.js";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";

test("Onlinekonto: sichtbares Abmelden, Passwortwechsel und erneute Admin-MFA", async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await fixture(55444);
  f.cfg.origin = "http://localhost:3001";
  f.cfg.PUBLIC_BASE_URL = f.cfg.origin;
  const next = randomBytes(20).toString("hex");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let changes = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/account/password")) changes++;
  });
  const login = async (password: string) => {
    await page.getByLabel("Benutzername", { exact: true }).fill("admin");
    await page.getByLabel("Kennwort", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  };
  try {
    await f.app.listen({ host: "127.0.0.1", port: 3001 });
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto(f.cfg.origin);
    await login(f.adminPassword);
    await expect(
      page.getByText("MFA einrichten", { exact: true }),
    ).toBeVisible();
    const secret = await page.locator("code.secret").innerText();
    await page
      .getByLabel("Authenticator-Code oder Wiederherstellungscode")
      .fill(totp(secret));
    await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
    const recovery = (await page.locator("pre").innerText())
      .trim()
      .split(/\s+/);
    await page
      .getByRole("button", { name: "Codes gesichert · Weiter" })
      .click();
    await expect(
      page.getByRole("button", { name: "Abmelden", exact: true }),
    ).toBeInViewport();
    await page.getByRole("button", { name: "Mein Konto", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Mein Konto", exact: true }),
    ).toBeVisible();
    await mkdir("test-results/online-account", { recursive: true });
    await page.screenshot({
      path: "test-results/online-account/desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Du bist abgemeldet.");
    await page.reload();
    await expect(
      page.getByLabel("Benutzername", { exact: true }),
    ).toBeVisible();
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name === "sn_session",
      ),
    ).toBe(false);
    await login(f.adminPassword);
    await page
      .getByLabel("Authenticator-Code oder Wiederherstellungscode")
      .fill(recovery[0]);
    await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
    await page.getByRole("button", { name: "Mein Konto", exact: true }).click();
    await page
      .getByLabel("Aktuelles Passwort", { exact: true })
      .fill("synthetic-wrong-password");
    await page.getByLabel("Neues Passwort", { exact: true }).fill(next);
    await page
      .getByLabel("Neues Passwort wiederholen", { exact: true })
      .fill(next + "-different");
    await page
      .getByRole("button", { name: "Passwort ändern", exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      "Die neuen Passwörter stimmen nicht überein.",
    );
    expect(changes).toBe(0);
    await page
      .getByLabel("Neues Passwort wiederholen", { exact: true })
      .fill(next);
    await page
      .getByRole("button", { name: "Passwort ändern", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("fehlgeschlagen");
    await page
      .getByLabel("Aktuelles Passwort", { exact: true })
      .fill(f.adminPassword);
    await page
      .getByRole("button", { name: "Passwort ändern", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Passwort geändert. Bitte melde dich mit deinem neuen Passwort erneut an.",
    );
    await expect(page.getByLabel("Kennwort", { exact: true })).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Mein Konto", exact: true }),
    ).toHaveCount(0);
    await login(f.adminPassword);
    await expect(page.getByRole("alert")).toContainText("fehlgeschlagen");
    await login(next);
    await expect(page.getByText("MFA einrichten", { exact: true })).toHaveCount(
      0,
    );
    await page
      .getByLabel("Authenticator-Code oder Wiederherstellungscode")
      .fill(recovery[1]);
    await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Mein Konto", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Abmelden", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByLabel("Aktuelles Passwort", { exact: true }),
    ).toHaveValue("");
    await page.screenshot({
      path: "test-results/online-account/mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await page.reload();
    await expect(
      page.getByLabel("Benutzername", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    for (const socket of f.app.websocketServer.clients) socket.terminate();
    f.app.server.closeAllConnections();
    await f.close();
  }
});
