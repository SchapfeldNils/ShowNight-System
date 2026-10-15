import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fixture } from "../fixture.js";
import { totp } from "../../apps/api/src/security.js";
import { workerTick } from "../../apps/api/src/worker.js";

// Issue #44 Paket 1: Mausbedienung, Ebenenliste, Rückgängig/Wiederholen,
// Medien per Ziehen und Prüfübersicht im Browserentwurf. Keine Liveausgabe.
test("Szeneneditor: Ebenen mit Maus, Tastatur und Medienleiste gestalten", async ({
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const f = await fixture(55462);
  f.cfg.origin = "http://localhost:3006";
  f.cfg.PUBLIC_BASE_URL = f.cfg.origin;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const field = (label: string) =>
    page
      .getByRole("complementary", { name: "Eigenschaften", exact: true })
      .getByLabel(label, { exact: true });
  const num = async (label: string) => Number(await field(label).inputValue());
  const layerNames = () =>
    page
      .getByRole("complementary", { name: "Ebenen", exact: true })
      .locator(".layer-select > span:last-child")
      .allInnerTexts();
  const saved = () =>
    expect(page.getByText(/Server gespeichert · Szenenrevision/)).toBeVisible();
  const centre = async (page: Page, selector: string) => {
    const box = (await page.locator(selector).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  try {
    await f.app.listen({ host: "127.0.0.1", port: 3006 });
    await page.setViewportSize({ width: 1400, height: 1000 });
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
      .fill("Synthetische Szeneneditorprobe");
    await page
      .getByRole("button", { name: "Show anlegen", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: "synthetisch.png",
      mimeType: "image/png",
      buffer: f.demoPng,
    });
    await expect(
      page.getByText("Original gespeichert. Analyse läuft im Worker."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Szene anlegen", exact: true }).click();
    await page
      .getByRole("button", { name: "Szene bearbeiten", exact: true })
      .click();
    // The media strip belongs to the editor; wait for the worker check there.
    await expect
      .poll(async () => {
        await workerTick(f.db, f.cfg);
        return page
          .getByRole("button", { name: /synthetisch\.png · bereit/ })
          .count();
      }, { timeout: 30000, intervals: [500, 1000, 2000] })
      .toBe(1);
    await page
      .getByRole("button", { name: "Rechteck hinzufügen", exact: true })
      .click();
    expect(await layerNames()).toEqual(["Rechteck 1"]);
    const start = { x: await num("X"), y: await num("Y") };

    // Mouse move on the canvas: values follow, one undo step restores.
    const from = await centre(page, '.scene-hit[data-layer="Rechteck 1"]');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y + 30, { steps: 6 });
    await page.mouse.up();
    const moved = { x: await num("X"), y: await num("Y") };
    expect(moved.x).toBeGreaterThan(start.x + 50);
    expect(moved.y).toBeGreaterThan(start.y + 20);
    await page.keyboard.press("Control+z");
    expect({ x: await num("X"), y: await num("Y") }).toEqual(start);
    await page.keyboard.press("Control+y");
    expect({ x: await num("X"), y: await num("Y") }).toEqual(moved);
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("ArrowDown");
    expect(await num("X")).toBe(moved.x + 10);
    expect(await num("Y")).toBe(moved.y + 1);

    // Resize with the corner handle.
    const width = await num("Breite");
    const handle = await centre(page, ".scene-handle");
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 50, handle.y + 20, { steps: 6 });
    await page.mouse.up();
    expect(await num("Breite")).toBeGreaterThan(width + 40);

    // Drag a checked image from the media strip onto the canvas.
    await page
      .getByRole("button", { name: /synthetisch\.png · bereit/ })
      .dragTo(page.locator(".scene-stage .scene-sketch"), {
        targetPosition: { x: 120, y: 80 },
      });
    expect(await layerNames()).toEqual(["Bild 1", "Rechteck 1"]);
    await expect(page.locator(".scene-stage .scene-sketch image")).toHaveCount(
      1,
    );
    await expect(field("Bildanpassung")).toHaveValue("contain");
    await field("Ebenenname").fill("Synthetisches Logo");
    await page.getByLabel("Sichtbar: Synthetisches Logo").uncheck();
    await expect(page.locator(".scene-stage .scene-sketch image")).toHaveCount(
      0,
    );
    await page
      .getByRole("button", {
        name: "Synthetisches Logo weiter nach hinten",
        exact: true,
      })
      .click();
    expect(await layerNames()).toEqual(["Rechteck 1", "Synthetisches Logo"]);

    // Check overview shows problems while editing.
    await page
      .getByRole("button", { name: "Text hinzufügen", exact: true })
      .click();
    await field("Ebenentext").fill("");
    const checks = page.getByRole("region", {
      name: "Prüfübersicht der Szene",
      exact: true,
    });
    await expect(checks.getByText("Hinweis: Text 1: Text ist leer.")).toBeVisible();
    await field("Ebenentext").fill("ShowNight · synthetischer Titel");
    await expect(
      checks.getByText("Keine Auffälligkeiten im Browserentwurf."),
    ).toBeVisible();
    await saved();

    // Panels can be hidden for more space; large mode leaves with Escape.
    await page.getByRole("button", { name: "Ebenenliste", exact: true }).click();
    await expect(
      page.getByRole("complementary", { name: "Ebenen", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Ebenenliste", exact: true }).click();
    await page
      .getByRole("button", { name: "Große Arbeitsfläche", exact: true })
      .click();
    await expect(page.locator(".scene-editor-large")).toHaveCount(1);
    await mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/s3-szeneneditor-gross.png" });
    await page.locator(".scene-stage").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".scene-editor-large")).toHaveCount(0);
    await page.screenshot({
      path: "test-results/s3-szeneneditor.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1400, height: 1000 });

    const final = { x: await num("X"), y: await num("Y") };
    await page
      .getByRole("button", { name: "Speichern und freigeben", exact: true })
      .click();
    await expect(
      page.getByText("Gespeichert · Bearbeitung freigegeben", { exact: true }),
    ).toBeVisible();

    // The saved server state contains the editor result.
    await page.reload();
    await page.getByRole("button", { name: "Shows", exact: true }).click();
    await page
      .locator(".show-row")
      .filter({ hasText: "Synthetische Szeneneditorprobe" })
      .getByRole("button", { name: "Arbeitsfläche öffnen", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Szene ansehen", exact: true })
      .selectOption({ label: "Neue Szene" });
    expect(await layerNames()).toEqual([
      "Text 1",
      "Rechteck 1",
      "Synthetisches Logo",
    ]);
    await expect(field("Ebenentext")).toHaveValue(
      "ShowNight · synthetischer Titel",
    );
    await expect(field("Ebenentext")).toBeDisabled();
    expect({ x: await num("X"), y: await num("Y") }).toEqual(final);
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank").catch(() => {});
    for (const socket of f.app.websocketServer.clients) socket.terminate();
    f.app.server.closeAllConnections();
    await f.close();
  }
});
