import test from "node:test";
import assert from "node:assert/strict";
import { createWindowsIoProvider } from "../apps/local/src/windows-io.js";
import { windowsIoReport } from "../packages/contracts/src/local-status.js";

const group = () => ({ status: "available", items: [], truncated: false });
const fixture = () => ({
  displays: {
    ...group(),
    items: [
      { name: "Testanzeige", width: 1920, height: 1080, connector: "HDMI" },
    ],
  },
  audioInputs: group(),
  audioOutputs: { ...group(), items: [{ name: "Testlautsprecher" }] },
});

test("Inventar teilt laufende Proben, cached 30 Sekunden und schützt den Cache vor Mutation", async () => {
  let time = 1800000000000,
    calls = 0;
  let release!: (value: unknown) => void;
  const provider = createWindowsIoProvider({
    platform: "win32",
    now: () => time,
    probe: () => {
      calls++;
      return calls === 1
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve(fixture());
    },
  });
  const first = provider(),
    second = provider();
  assert.equal(calls, 1);
  release(fixture());
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b);
  a.displays.items[0].name = "verändert";
  assert.equal((await provider()).displays.items[0].name, "Testanzeige");
  time += 29999;
  await provider();
  assert.equal(calls, 1);
  time += 1;
  await provider();
  assert.equal(calls, 2);
});

test("Erfolgreiche leere Listen, Kategoriefehler und Kamera-Unterstützung bleiben unterscheidbar", async () => {
  const result = await createWindowsIoProvider({
    platform: "win32",
    probe: async () => ({
      ...fixture(),
      audioInputs: { status: "error", items: [], truncated: false },
    }),
  })();
  assert.equal(result.displays.status, "available");
  assert.equal(result.audioInputs.status, "error");
  assert.equal(result.cameras.status, "unsupported");
  assert.equal(result.deviceActivationPerformed, false);
});

test("Unbekannte Plattform führt keine Windows-Probe aus", async () => {
  const result = await createWindowsIoProvider({
    platform: "linux",
    probe: async () => {
      throw new Error("Nicht aufrufen");
    },
  })();
  assert.equal(result.platform, "unsupported");
  assert.equal(result.displays.status, "unsupported");
});

test("Fehler, Privatfelder und übergroße Probeergebnisse verlassen den Adapter nicht", async () => {
  for (const probe of [
    async () => {
      throw new Error("privates Gerät / privater Pfad");
    },
    async () => ({ ...fixture(), privatePath: "C:/Benutzer/Privat" }),
    async () => ({
      ...fixture(),
      audioOutputs: {
        ...group(),
        items: [{ name: "x", endpointId: "privat" }],
      },
    }),
    async () => ({
      ...fixture(),
      audioInputs: { ...group(), items: Array(65).fill({ name: "x" }) },
    }),
  ]) {
    const result = await createWindowsIoProvider({
      platform: "win32",
      probe,
    })();
    assert.equal(result.displays.status, "error");
    assert.doesNotMatch(JSON.stringify(result), /privat|Benutzer|endpointId/);
  }
});

test("Ergebnisse erlauben keine Geräteaktivierung und halten explizite Grenzen ein", () => {
  const value = {
    ...fixture(),
    checkedAt: new Date().toISOString(),
    platform: "win32",
    cameras: { status: "unsupported", items: [], truncated: false },
    deviceActivationPerformed: false,
  };
  assert.equal(windowsIoReport.safeParse(value).success, true);
  assert.equal(
    windowsIoReport.safeParse({ ...value, deviceActivationPerformed: true })
      .success,
    false,
  );
  assert.equal(
    windowsIoReport.safeParse({
      ...value,
      displays: {
        ...group(),
        items: [
          { name: "x".repeat(161), width: null, height: null, connector: null },
        ],
      },
    }).success,
    false,
  );
});
