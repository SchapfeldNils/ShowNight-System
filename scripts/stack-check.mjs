#!/usr/bin/env node
// Vorprüfung vor jeder Sicherung (Issue #3, Erkenntnis aus #53/#59):
// Die private stack.env muss exakt zum laufenden Stack passen. Sonst würde der
// Neustart in deploy/backup.sh (`compose up -d --wait app worker`) Container mit
// anderer Konfiguration neu erzeugen – bei falschem DB_VOLUME_NAME auf einem
// leeren Volume. Prüft je Dienst den Compose-Konfigurations-Hash und, weil der
// Hash nur Schlüssel bzw. Referenzen enthält, zusätzlich die aufgelösten
// Volume-Namen, Netzwerknamen und die Image-ID hinter der Image-Referenz.
// Liest nur; stoppt, startet oder ändert nichts.
// Aufruf: node scripts/stack-check.mjs <stack.env> <compose.yaml> [dienst ...]
import { execFileSync } from "node:child_process";

const [envFile, composeFile, ...requested] = process.argv.slice(2);
if (!envFile || !composeFile) {
  process.stderr.write(
    "Aufruf: node scripts/stack-check.mjs <stack.env> <compose.yaml> [dienst ...]\n",
  );
  process.exit(2);
}
const services = requested.length ? requested : ["postgres", "app", "worker"];
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
const compose = (args) =>
  docker(["compose", "--env-file", envFile, "-f", composeFile, ...args]);
const problems = [];
try {
  const config = JSON.parse(compose(["config", "--format", "json"]));
  const hashes = new Map(
    compose(["config", "--hash", services.join(",")])
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length === 2)
      .map(([name, hash]) => [name, hash]),
  );
  for (const service of services) {
    const definition = config.services?.[service];
    if (!definition) {
      problems.push(`${service}: in der Konfiguration nicht vorhanden.`);
      continue;
    }
    const expectedVolumes = (definition.volumes ?? [])
      .filter((v) => v.type === "volume" && v.source)
      .map((v) => config.volumes?.[v.source]?.name ?? v.source)
      .sort();
    const ids = compose(["ps", "-q", service])
      .split(/\r?\n/)
      .map((id) => id.trim())
      .filter(Boolean);
    if (!ids.length) {
      problems.push(`${service}: kein laufender Container gefunden.`);
      continue;
    }
    const expectedHash = hashes.get(service);
    if (!expectedHash) problems.push(`${service}: kein Konfigurations-Hash ermittelbar.`);
    // The hash only contains the image reference. Compose additionally recreates
    // a container whose image differs from what the reference resolves to now
    // (e.g. after `docker load` of the same tag), so compare the image IDs.
    let expectedImage = null;
    if (definition.image) {
      try {
        expectedImage =
          JSON.parse(docker(["image", "inspect", definition.image]))[0]?.Id ?? null;
      } catch {
        expectedImage = null;
      }
      if (!expectedImage)
        problems.push(`${service}: Image ${definition.image} ist lokal nicht vorhanden.`);
    }
    // The hash only contains logical network keys; the resolved names come from
    // the top-level definition (e.g. PROXY_NETWORK_NAME for the external proxy).
    const expectedNetworks = definition.network_mode
      ? null
      : Object.keys(definition.networks ?? { default: null })
          .map((key) => config.networks?.[key]?.name ?? key)
          .sort();
    for (const info of JSON.parse(docker(["inspect", ...ids]))) {
      if (expectedImage && info?.Image !== expectedImage)
        problems.push(
          `${service}: laufender Container nutzt ein anderes Image als ${definition.image} jetzt bezeichnet (Neustart würde ihn neu erzeugen).`,
        );
      if (expectedNetworks) {
        const attached = Object.keys(info?.NetworkSettings?.Networks ?? {}).sort();
        if (JSON.stringify(attached) !== JSON.stringify(expectedNetworks))
          problems.push(
            `${service}: verbundene Netzwerke (${attached.join(", ") || "keine"}) passen nicht zur stack.env (${expectedNetworks.join(", ")}).`,
          );
      }
      const label = info?.Config?.Labels?.["com.docker.compose.config-hash"];
      if (expectedHash && label !== expectedHash)
        problems.push(
          `${service}: Konfiguration der stack.env weicht vom laufenden Container ab (Neustart würde ihn neu erzeugen).`,
        );
      const mounted = (info?.Mounts ?? [])
        .filter((m) => m.Type === "volume")
        .map((m) => m.Name)
        .sort();
      if (JSON.stringify(mounted) !== JSON.stringify(expectedVolumes))
        problems.push(
          `${service}: eingebundene Volumes (${mounted.join(", ") || "keine"}) passen nicht zur stack.env (${expectedVolumes.join(", ") || "keine"}).`,
        );
    }
  }
} catch (error) {
  problems.push(
    "Vorprüfung nicht ausführbar: " +
      String(error?.stderr || error?.message || error)
        .split(/\r?\n/)[0]
        .replace(/[A-Za-z0-9+/=_-]{32,}/g, "[REDACTED]")
        .slice(0, 300),
  );
}
if (problems.length) {
  process.stderr.write(
    "Keine Sicherung: stack.env passt nicht zum laufenden Stack.\n" +
      problems.map((p) => "- " + p).join("\n") +
      "\n",
  );
  process.exit(1);
}
process.stdout.write(
  `Vorprüfung bestanden: ${services.join(", ")} passen zur stack.env.\n`,
);
