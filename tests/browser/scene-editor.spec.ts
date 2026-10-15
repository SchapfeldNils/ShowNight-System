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
    // Mouse coordinates are viewport-relative: bring the canvas into view first.
    await page
      .locator(".scene-stage .scene-sketch")
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
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
    await expect.poll(() => num("X")).toBeGreaterThan(start.x + 50);
    await expect.poll(() => num("Y")).toBeGreaterThan(start.y + 20);
    const moved = { x: await num("X"), y: await num("Y") };
    const position = async () => ({ x: await num("X"), y: await num("Y") });
    await page.keyboard.press("Control+z");
    await expect.poll(position).toEqual(start);
    await page.keyboard.press("Control+y");
    await expect.poll(position).toEqual(moved);
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("ArrowDown");
    await expect.poll(position).toEqual({ x: moved.x + 10, y: moved.y + 1 });

    // Resize with the corner handle.
    const width = await num("Breite");
    const handle = await centre(page, ".scene-handle");
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 50, handle.y + 20, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => num("Breite")).toBeGreaterThan(width + 40);

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
    // Partial input is not clamped while typing ("2" on the way to "24").
    await field("Schriftgröße").selectText();
    await field("Schriftgröße").pressSequentially("24");
    await expect(field("Schriftgröße")).toHaveValue("24");
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
    await expect
      .poll(async () => ({ x: await num("X"), y: await num("Y") }))
      .toEqual(final);

    // Codex-Review PR #55, Befund 2: Mausgesten runden nur die Komponente,
    // die sie verändern. Gebrochene Werte bleiben exakt erhalten.
    await page
      .getByRole("button", { name: "Szene bearbeiten", exact: true })
      .click();
    await expect(field("Ebenentext")).toBeEnabled();
    await field("Breite").fill("100.5");
    await field("Höhe").fill("50.4");
    await field("X").fill("300.5");
    await field("Y").fill("200.25");
    await expect.poll(() => num("Höhe")).toBe(50.4);
    const textHit = '.scene-hit[data-layer="Text 1"]';
    const t0 = await centre(page, textHit);
    await page.mouse.move(t0.x, t0.y);
    await page.mouse.down();
    await page.mouse.move(t0.x + 40, t0.y + 25, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => num("X")).not.toBe(300.5);
    expect(await field("Breite").inputValue()).toBe("100.5");
    expect(await field("Höhe").inputValue()).toBe("50.4");
    await field("X").fill("300.5");
    await field("Y").fill("200.25");
    await expect.poll(() => num("Y")).toBe(200.25);
    const h0 = await centre(page, ".scene-handle");
    await page.mouse.move(h0.x, h0.y);
    await page.mouse.down();
    await page.mouse.move(h0.x + 30, h0.y + 15, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => num("Breite")).toBeGreaterThan(110);
    expect(await field("X").inputValue()).toBe("300.5");
    expect(await field("Y").inputValue()).toBe("200.25");
    const kept = {
      x: await field("X").inputValue(),
      y: await field("Y").inputValue(),
      w: await field("Breite").inputValue(),
      h: await field("Höhe").inputValue(),
    };
    await saved();

    // Codex-Review PR #55, Befund 1: Während die Freigabe auf die
    // Lease-Antwort wartet, sind keine Entwurfsänderungen möglich.
    let releaseDelayed = 0;
    await page.route("**/api/v1/scenes/*/lease", async (route) => {
      if (route.request().method() === "DELETE") {
        releaseDelayed++;
        await new Promise((r) => setTimeout(r, 2500));
      }
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Speichern und freigeben", exact: true })
      .click();
    await expect(
      page.getByText("Freigabe läuft · Änderungen bis zum Abschluss gesperrt"),
    ).toBeVisible();
    const media = page.getByRole("button", { name: /synthetisch\.png · bereit/ });
    await expect(media).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Text hinzufügen", exact: true }),
    ).toBeDisabled();
    await expect(field("Ebenentext")).toBeDisabled();
    // Even a forced event must not change the draft.
    await media.dispatchEvent("click");
    await page.locator(".scene-stage").focus();
    await page.keyboard.press("Delete");
    expect(await layerNames()).toEqual([
      "Text 1",
      "Rechteck 1",
      "Synthetisches Logo",
    ]);
    await expect(
      page.getByText("Gespeichert · Bearbeitung freigegeben", { exact: true }),
    ).toBeVisible();
    expect(releaseDelayed).toBe(1);
    await page.unroute("**/api/v1/scenes/*/lease");
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
    await expect
      .poll(async () => ({
        x: await field("X").inputValue(),
        y: await field("Y").inputValue(),
        w: await field("Breite").inputValue(),
        h: await field("Höhe").inputValue(),
      }))
      .toEqual(kept);
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank").catch(() => {});
    for (const socket of f.app.websocketServer.clients) socket.terminate();
    f.app.server.closeAllConnections();
    await f.close();
  }
});
