import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  open,
  readFile,
  mkdir,
  unlink,
  rmdir,
  link,
} from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const magic = Buffer.from("SNBACKUP1\n");
const names = ["database.dump", "media.tar", "SHA256SUMS", "stack.env"];
const headerSize = magic.length + 32 + 12;
const derive = (password, salt) => {
  if (
    typeof password !== "string" ||
    password.length < 20 ||
    Buffer.byteLength(password) > 256
  )
    throw new Error(
      "Separates Sicherungskennwort mit 20 bis 256 Zeichen/Bytes erforderlich.",
    );
  return scryptSync(password, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
};
async function regular(path) {
  const info = await lstat(path);
  if (!info.isFile() || !Number.isSafeInteger(info.size))
    throw new Error("Reguläre Datei erforderlich.");
  return info;
}
async function hashFile(path) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}
// CurrentUser + SYSTEM, without DPAPI: decryption remains portable to a new user.
async function privateDirectory(path) {
  if (process.platform !== "win32") return;
  await new Promise((resolvePromise, reject) => {
    const script =
      "$ErrorActionPreference='Stop';$path=[Console]::In.ReadToEnd();$me=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetOwner($me);$acl.SetAccessRuleProtection($true,$false);foreach($sid in @($me,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))};$dir=New-Object IO.DirectoryInfo($path);$dir.SetAccessControl($acl);";
    const child = spawn(
      join(
        process.env.SystemRoot ?? "C:/Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        windowsHide: true,
        stdio: ["pipe", "ignore", "ignore"],
        env: {
          ...process.env,
          PSModulePath: join(
            process.env.SystemRoot ?? "C:/Windows",
            "System32/WindowsPowerShell/v1.0/Modules",
          ),
        },
      },
    );
    const timer = setTimeout(() => child.kill(), 10000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Private Verzeichnisrechte nicht verfügbar."));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolvePromise()
        : reject(new Error("Private Verzeichnisrechte nicht bestätigt."));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(path);
  });
}

export async function sealBackup(source, configFile, destination, password) {
  destination = resolve(destination);
  const files = names.map((name) =>
    name === "stack.env" ? resolve(configFile) : join(resolve(source), name),
  );
  const entries = [];
  for (let i = 0; i < files.length; i++)
    entries.push({
      name: names[i],
      size: (await regular(files[i])).size,
      sha256: await hashFile(files[i]),
    });
  const checksumFile = await readFile(files[2], "utf8");
  for (const entry of entries.slice(0, 2))
    if (!checksumFile.split(/\r?\n/).includes(entry.sha256 + "  " + entry.name))
      throw new Error("Backup-Prüfsummen stimmen nicht.");
  const salt = randomBytes(32),
    iv = randomBytes(12),
    key = derive(password, salt);
  const header = Buffer.concat([magic, salt, iv]);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  const manifest = Buffer.from(JSON.stringify({ version: 1, entries }));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(manifest.length);
  // Same directory/filesystem: only publish a complete, synced archive. An
  // exclusive hard link preserves an existing destination, including symlinks.
  const temporary = destination + ".partial-" + randomBytes(16).toString("hex");
  let output,
    ownedTemporary = false;
  try {
    output = await open(temporary, "wx", 0o600);
    ownedTemporary = true;
    await output.writeFile(header);
    async function* content() {
      yield length;
      yield manifest;
      for (let i = 0; i < files.length; i++) {
        const hash = createHash("sha256");
        let size = 0;
        for await (const chunk of createReadStream(files[i])) {
          hash.update(chunk);
          size += chunk.length;
          yield chunk;
        }
        if (
          size !== entries[i].size ||
          hash.digest("hex") !== entries[i].sha256
        )
          throw new Error("Quelldatei während Sicherung verändert.");
      }
    }
    await pipeline(
      Readable.from(content()),
      cipher,
      createWriteStream(temporary, {
        fd: output.fd,
        start: headerSize,
        autoClose: false,
      }),
    );
    await output.write(cipher.getAuthTag(), 0, 16, (await output.stat()).size);
    await output.sync();
    await output.close();
    output = undefined;
    await link(temporary, destination);
  } finally {
    key.fill(0);
    try {
      await output?.close();
    } finally {
      if (ownedTemporary) await unlink(temporary);
    }
  }
  return {
    format: "SNBACKUP1",
    files: names.length,
    sha256: await hashFile(destination),
  };
}

export async function openBackup(archive, destination, password) {
  archive = resolve(archive);
  destination = resolve(destination);
  const size = (await regular(archive)).size;
  if (size < headerSize + 16 + 4)
    throw new Error("Sicherungsdatei unvollständig.");
  const input = await open(archive, "r");
  const header = Buffer.alloc(headerSize),
    tag = Buffer.alloc(16);
  try {
    await input.read(header, 0, header.length, 0);
    await input.read(tag, 0, 16, size - 16);
  } finally {
    await input.close();
  }
  if (!header.subarray(0, magic.length).equals(magic))
    throw new Error("Unbekanntes Sicherungsformat.");
  const key = derive(
    password,
    header.subarray(magic.length, magic.length + 32),
  );
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(-12));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  let created = false;
  const payload = join(destination, ".payload");
  try {
    // Mark ownership immediately after mkdir, including ACL setup failure.
    await mkdir(destination, { mode: 0o700 });
    created = true;
    await privateDirectory(destination);
    await pipeline(
      createReadStream(archive, { start: headerSize, end: size - 17 }),
      decipher,
      createWriteStream(payload, { flags: "wx", mode: 0o600 }),
    );
    const plain = await open(payload, "r");
    let entries, offset;
    try {
      const n = Buffer.alloc(4);
      await plain.read(n, 0, 4, 0);
      const count = n.readUInt32BE();
      if (count < 1 || count > 16384)
        throw new Error("Ungültiges Sicherungsmanifest.");
      const bytes = Buffer.alloc(count);
      await plain.read(bytes, 0, count, 4);
      const manifest = JSON.parse(bytes.toString("utf8"));
      entries = manifest.entries;
      if (
        manifest.version !== 1 ||
        !Array.isArray(entries) ||
        entries.length !== names.length
      )
        throw new Error("Ungültiges Sicherungsmanifest.");
      offset = 4 + count;
      for (let i = 0; i < names.length; i++) {
        const entry = entries[i];
        if (
          entry.name !== names[i] ||
          !Number.isSafeInteger(entry.size) ||
          entry.size < 0 ||
          !/^[a-f0-9]{64}$/.test(entry.sha256)
        )
          throw new Error("Ungültiger Sicherungseintrag.");
        offset += entry.size;
        if (!Number.isSafeInteger(offset))
          throw new Error("Sicherungsgröße unzulässig.");
      }
      if (offset !== (await plain.stat()).size)
        throw new Error("Sicherungsgröße widersprüchlich.");
      offset = 4 + count;
    } finally {
      await plain.close();
    }
    for (const entry of entries) {
      const file = join(destination, entry.name);
      if (entry.size)
        await pipeline(
          createReadStream(payload, {
            start: offset,
            end: offset + entry.size - 1,
          }),
          createWriteStream(file, { flags: "wx", mode: 0o600 }),
        );
      else {
        const empty = await open(file, "wx", 0o600);
        await empty.close();
      }
      if ((await hashFile(file)) !== entry.sha256)
        throw new Error("Wiederherstellungsprüfsumme falsch.");
      offset += entry.size;
    }
    await unlink(payload);
    return {
      authenticated: true,
      files: names.length,
      productionRestored: false,
    };
  } catch (error) {
    if (created) {
      // Fixed owned filenames only; no recursive removal or manifest paths.
      for (const name of [".payload", ...names])
        await unlink(join(destination, name)).catch(() => {});
      await rmdir(destination).catch(() => {});
    }
    throw error;
  } finally {
    key.fill(0);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [mode, source, destination, configFile] = process.argv.slice(2);
    if (
      !source ||
      !destination ||
      !["seal", "open"].includes(mode) ||
      (mode === "seal" && !configFile)
    )
      throw new Error();
    let bytes = Buffer.alloc(0);
    for await (const chunk of process.stdin) {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length > 258) throw new Error();
    }
    const password = bytes.toString("utf8").replace(/\r?\n$/, "");
    bytes.fill(0);
    const result =
      mode === "seal"
        ? await sealBackup(source, configFile, destination, password)
        : await openBackup(source, destination, password);
    console.log(JSON.stringify(result));
  } catch {
    console.error(
      "Sicherung fehlgeschlagen. Modus seal <Backupordner> <neue .snbackup-Datei> <private stack.env> oder open <.snbackup-Datei> <neuer privater Ordner>. Separates Kennwort ausschließlich über Standardeingabe. Dateien, Kennwort und freien Speicher prüfen; keine Geheimnisse veröffentlichen.",
    );
    process.exitCode = 1;
  }
}
