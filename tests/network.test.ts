import test from "node:test";
import assert from "node:assert/strict";
import { lanSetup, assignedAddress } from "../apps/local/src/network.js";

test("LAN-Konfiguration weist Wildcards, öffentliche/Loopback-Adressen und nicht kanonische Ziele ab", () => {
  for (const address of [
    "0.0.0.0",
    "127.0.0.1",
    "8.8.8.8",
    "169.254.1.2",
    "172.15.1.1",
    "172.32.1.1",
    "192.169.1.1",
    "::1",
    "localhost",
    "192.168.001.2",
    "10.1.2.256",
    "10.1.2.3:3443",
    "10.1.2.3&IPAddress=8.8.8.8",
    "10.1.2.3\n",
    "1e1.1.2.3",
  ]) {
    assert.equal(
      lanSetup.safeParse({ version: 1, address }).success,
      false,
      address,
    );
  }
  for (const address of [
    "10.1.2.3",
    "172.16.1.2",
    "172.31.1.2",
    "192.168.50.10",
  ])
    assert.equal(lanSetup.safeParse({ version: 1, address }).success, true);
  assert.equal(
    lanSetup.safeParse({
      version: 1,
      address: "10.1.2.3",
      origin: "http://example.org",
    }).success,
    false,
  );
  assert.equal(
    lanSetup.safeParse({ version: 2, address: "10.1.2.3" }).success,
    false,
  );
  assert.equal(assignedAddress("127.0.0.1"), true);
  assert.equal(assignedAddress("0.0.0.0"), false);
});
