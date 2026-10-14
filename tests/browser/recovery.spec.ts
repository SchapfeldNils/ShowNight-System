import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { fixture } from "../fixture.js";
import { totp } from "../../apps/api/src/security.js";

// Even on failure, synthetic MFA secrets, recovery codes and link tokens stay
// in RAM/test DB and never enter screenshots or traces.
test.use({ screenshot: "off", trace: "off", video: "off" });

test("Online-E-Mail: Bestätigung und Passwortreset im Browser bei ausgeschaltetem Versand", async ({
  page,
}) => {
  test.setTimeout(150000);
  const f = await fixture(55447);
  f.cfg.origin = "http://localhost:3002";
  f.cfg.PUBLIC_BASE_URL = f.cfg.origin;
  const email = "synthetic-recovery@example.test";
  const nextPassword = randomBytes(24).toString("hex");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  const signIn = async (password: string) => {
    await page.getByLabel("Benutzername", { exact: true }).fill("admin");
    await page.getByLabel("Kennwort", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  };
  async function followSyntheticMail(fragment: string) {
    const jobs = (
      await f.db.query(
        "SELECT body,delivery_mode FROM mail_jobs WHERE recipient=$1 ORDER BY created_at DESC",
        [email],
      )
    ).rows;
    const mail = jobs.find((job) => job.body.includes(fragment));
    // Avoid assertion diagnostics containing the secret-bearing job itself.
    expect(Boolean(mail)).toBe(true);
    expect(mail.delivery_mode).toBe("test");
    const token = mail.body.split(fragment)[1].match(/^[A-Za-z0-9_-]+/)?.[0];
    expect(Boolean(token)).toBe(true);
    await page.evaluate((value) => {
      location.hash = value;
    }, fragment + token);
    await expect
      .poll(() => page.evaluate(() => location.hash.length === 0))
      .toBe(true);
  }
  try {
    await f.app.listen({ host: "127.0.0.1", port: 3002 });
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto(f.cfg.origin);
    await signIn(f.adminPassword);
    await expect(
      page.getByText("MFA einrichten", { exact: true }),
    ).toBeVisible();
    const secret = await page.locator("code.secret").innerText();
    await page
      .getByLabel("Authenticator-Code oder Wiederherstellungscode")
      .fill(totp(secret));
    await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
    const recoveryCode = (await page.locator("pre").innerText())
      .trim()
      .split(/\s+/)[0];
    await page
      .getByRole("button", { name: "Codes gesichert · Weiter" })
      .click();
    await page.getByRole("button", { name: "Mein Konto", exact: true }).click();
    await expect(
      page.getByText("Noch keine bestätigte E-Mail-Adresse hinterlegt.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("E-Mail-Adresse", { exact: true }).fill(email);
    await page
      .getByLabel("Aktuelles Passwort für E-Mail-Bestätigung", { exact: true })
      .fill(f.adminPassword);
    await page
      .getByRole("button", { name: "Bestätigungsmail anfordern", exact: true })
      .click();
    await expect(
      page.getByText(
        "Mailversand ist hier deaktiviert. Es wurde keine echte Bestätigungsmail versendet.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Bestätigung ausstehend: " + email, { exact: true }),
    ).toBeVisible();
    await followSyntheticMail("#email-bestaetigen=");
    await expect(
      page.getByRole("heading", {
        name: "E-Mail-Adresse bestätigen",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "E-Mail-Adresse bestätigen", exact: true })
      .click();
    await expect(
      page.getByText("Bestätigte Adresse: " + email, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await expect(
      page.getByLabel("Benutzername", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Passwort vergessen?", exact: true })
      .click();
    await page
      .getByLabel("E-Mail-Adresse oder Benutzername", { exact: true })
      .fill(email);
    const requested = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/auth/password/request") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Link anfordern", exact: true })
      .click();
    expect((await requested).status()).toBe(202);
    await expect(
      page.getByText(
        "Mailversand ist hier deaktiviert. Es wurde keine echte E-Mail versendet.",
        { exact: true },
      ),
    ).toBeVisible();
    await followSyntheticMail("#passwort-zuruecksetzen=");
    await expect(
      page.getByRole("heading", { name: "Neues Passwort setzen", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Neues Passwort", { exact: true }).fill(nextPassword);
    await page
      .getByLabel("Neues Passwort wiederholen", { exact: true })
      .fill(nextPassword);
    await page
      .getByRole("button", { name: "Neues Passwort speichern", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Passwort zurückgesetzt.",
    );
    await expect(page.getByLabel("Kennwort", { exact: true })).toHaveValue("");
    await signIn(f.adminPassword);
    await expect(page.getByRole("alert")).toContainText("fehlgeschlagen");
    await signIn(nextPassword);
    await expect(page.getByText("MFA einrichten", { exact: true })).toHaveCount(
      0,
    );
    await page
      .getByLabel("Authenticator-Code oder Wiederherstellungscode")
      .fill(recoveryCode);
    await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
    await page.getByRole("button", { name: "Mein Konto", exact: true }).click();
    await expect(
      page.getByText("Bestätigte Adresse: " + email, { exact: true }),
    ).toBeVisible();
    expect(
      (
        await f.db.query(
          "SELECT 1 FROM mail_jobs WHERE delivery_mode <> 'test'",
        )
      ).rowCount,
    ).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    for (const socket of f.app.websocketServer.clients) socket.terminate();
    f.app.server.closeAllConnections();
    await f.close();
  }
});
