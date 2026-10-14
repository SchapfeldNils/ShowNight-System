// Test-only subprocess interception: stop after an actual encrypted stream write
// has reached disk, before the stream can finish or publish its final archive.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

process.once(
  "message",
  async ({ source, config, archive, password, failDuringStream }) => {
    const createReadStream = fs.createReadStream;
    let configReads = 0;
    fs.createReadStream = function (...args) {
      if (String(args[0]) === config && ++configReads === 2 && failDuringStream)
        throw new Error("Synthetic streaming source failure");
      return createReadStream(...args);
    };
    const createWriteStream = fs.createWriteStream;
    fs.createWriteStream = function (...args) {
      const stream = createWriteStream(...args);
      const write = stream._write;
      let first = true;
      stream._write = function (chunk, encoding, callback) {
        write.call(this, chunk, encoding, (error) => {
          if (error || !first) return callback(error);
          first = false;
          process.once("message", () => callback());
          process.send({ state: "stream-blocked", path: String(args[0]) });
        });
      };
      return stream;
    };
    syncBuiltinESMExports();
    try {
      const { sealBackup } = await import("../scripts/backup-vault.mjs");
      await sealBackup(source, config, archive, password);
      process.disconnect();
    } catch (error) {
      process.send({ state: "failed", code: error.code ?? error.name });
      process.exitCode = 1;
      process.disconnect();
    }
  },
);
