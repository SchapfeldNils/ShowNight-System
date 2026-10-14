import { chromium, expect } from "@playwright/test";
import { resolve, join } from "node:path";
import type { LocalAccounts } from "../apps/local/src/accounts.js";
import type { PackageStore } from "../apps/local/src/store.js";
import type { RendererControl } from "../apps/local/src/renderer.js";
import type { TransferManifest } from "../packages/contracts/src/transfer.js";
import { localServer } from "../apps/local/src/server.js";

export async function rendererBrowserProof(
  accounts: LocalAccounts,
  packages: PackageStore,
  renderer: RendererControl,
  session: string,
  manifest: TransferManifest,
  output: string,
) {
  // Isolated localhost HTTP browser proof, like the existing preparation test.
  // Actual bundled HTTPS/hostname/CA validation is a separate native test.
  const origin = "http://localhost:3446";
  const app = await localServer(
    accounts,
    packages,
    origin,
    resolve("dist/server/web"),
    undefined,
    false,
    renderer,
  );
  await app.listen({ host: "127.0.0.1", port: 3446 });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await context.addCookies([
      {
        name: "sn_local_session",
        value: session,
        url: origin,
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
      },
    ]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await expect(
      page.getByRole("heading", { name: "Medienprozess · Softwarediagnose" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Paket ansehen", exact: true })
      .click();
    await page
      .getByLabel("Medium aus " + manifest.event.name)
      .selectOption(manifest.media[0].id);
    await page
      .getByRole("button", { name: "Paketmedium vorbereiten", exact: true })
      .click();
    const preview = page.getByRole("img", {
      name: "Diagnose-Vorschau aus dem nativen Medienprozess",
      exact: true,
    });
    const program = page.getByRole("img", {
      name: "Diagnose-Programm aus dem nativen Medienprozess",
      exact: true,
    });
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate(
          (n: HTMLImageElement) => n.complete && n.naturalWidth === 640,
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        program.evaluate(
          (n: HTMLImageElement) => n.complete && n.naturalWidth === 640,
        ),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Diagnosebild übernehmen", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Paketmedium vorbereiten",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.screenshot({
      path: join(output, "paketmedien-browser.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: join(output, "paketmedien-mobil.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
    await context.close();
  } finally {
    try {
      await browser?.close();
    } finally {
      await app.close();
    }
  }
}
