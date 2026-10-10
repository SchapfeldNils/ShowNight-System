import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  agentProfile,
  type AgentIdentity,
} from "../../../packages/contracts/src/agent.js";
export function serverAddress(value: string) {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    !(
      u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
    )
  )
    throw new Error(
      "HTTPS-Serveradresse ohne Pfad erforderlich; HTTP nur am lokalen Loopback.",
    );
  return u.origin;
}
const identitySchema = z
  .object({
    server: z.string().transform(serverAddress),
    deviceId: z.uuid(),
    profile: agentProfile,
    credential: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export function powershell(script: string, input: string): Promise<string> {
  if (process.platform !== "win32")
    throw new Error("Diese Identitätsablage benötigt Windows DPAPI.");
  return new Promise((resolve, reject) => {
    const p = spawn(
      join(
        process.env.SystemRoot ?? "C:/Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(
          "$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.Encoding]::UTF8;[Console]::OutputEncoding=[Text.Encoding]::UTF8;" +
            script,
          "utf16le",
        ).toString("base64"),
      ],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        // A parent PowerShell 7 process may export its incompatible module path.
        // This helper deliberately runs the built-in Windows PowerShell 5.1.
        env: {
          ...process.env,
          PSModulePath: join(
            process.env.SystemRoot ?? "C:/Windows",
            "System32/WindowsPowerShell/v1.0/Modules",
          ),
        },
      },
    );
    let output = "";
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error("Windows-Schlüsselablage antwortet nicht."));
    }, 10000);
    p.stdout.on("data", (b) => {
      output += b.toString();
      if (output.length > 20000) p.kill();
    });
    p.stderr.resume();
    p.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Windows-Schlüsselablage nicht verfügbar."));
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output.trim())
        : reject(new Error("Windows-Schlüsselablage fehlgeschlagen."));
    });
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}
export async function protectBytes(value: Buffer) {
  return powershell(
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Security');$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))",
    value.toString("base64"),
  );
}
export async function unprotectBytes(value: string) {
  const plain = await powershell(
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Security');$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))",
    value,
  );
  return Buffer.from(plain, "base64");
}
export async function secureDirectory(dir: string) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const script = `$path=[Console]::In.ReadToEnd();$me=[Security.Principal.WindowsIdentity]::GetCurrent().User;
    $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetOwner($me);$acl.SetAccessRuleProtection($true,$false);
    foreach($sid in @($me,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
      $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)
    };$directory=New-Object IO.DirectoryInfo($path);$directory.SetAccessControl($acl);
    $actual=$directory.GetAccessControl();[Console]::WriteLine($actual.GetOwner([Security.Principal.SecurityIdentifier]).Value);
    foreach($entry in $actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
      [Console]::WriteLine($entry.IdentityReference.Value+':'+$entry.IsInherited.ToString()+':'+$entry.FileSystemRights.ToString()+':'+$entry.AccessControlType.ToString())
    }`;
  return powershell(script, dir);
}
export async function saveIdentity(dir: string, identity: AgentIdentity) {
  const value = identitySchema.parse(identity);
  const encrypted = await powershell(
    `[void][Reflection.Assembly]::LoadWithPartialName('System.Security');$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());
    [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))`,
    Buffer.from(JSON.stringify(value)).toString("base64"),
  );
  await writeFile(join(dir, "identity.dpapi"), encrypted, {
    flag: "wx",
    mode: 0o600,
  });
}
export async function loadIdentity(dir: string): Promise<AgentIdentity> {
  const encrypted = await readFile(join(dir, "identity.dpapi"), "utf8");
  const value = await powershell(
    `[void][Reflection.Assembly]::LoadWithPartialName('System.Security');$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());
    [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))`,
    encrypted,
  );
  return identitySchema.parse(
    JSON.parse(Buffer.from(value, "base64").toString("utf8")),
  );
}
export async function pair(
  server: string,
  code: string,
): Promise<AgentIdentity> {
  server = serverAddress(server);
  const response = await fetch(server + "/api/agent/v1/pair", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, protocolVersion: 1 }),
  });
  if (!response.ok)
    throw new Error(
      "Paarung fehlgeschlagen (HTTP " +
        response.status +
        "). Neuen Code und Serveradresse prüfen.",
    );
  const result = z
    .object({
      deviceId: z.uuid(),
      profile: agentProfile,
      credential: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      protocolVersion: z.literal(1),
    })
    .strict()
    .parse(await response.json());
  return identitySchema.parse({
    server,
    deviceId: result.deviceId,
    profile: result.profile,
    credential: result.credential,
  });
}
