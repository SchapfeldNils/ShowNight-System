import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  cp,
  readdir,
  lstat,
  rename,
  unlink,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import ffmpeg from "ffmpeg-static";
if (process.platform !== "win32")
  throw new Error("Windows-MSVC-Build erforderlich.");
const work = resolve(".local/renderer-build"),
  out = resolve("dist/renderer-windows");
const skiaRevision = "f9b0d17912fad78861ad343797db3f33084c19cc";
const jsonHash =
  "aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63";
const gstVersion = "1.28.8",
  gstName = "gstreamer-1.0-msvc-x86_64-" + gstVersion + ".exe";
const gstUrl =
  "https://gstreamer.freedesktop.org/pkg/windows/" +
  gstVersion +
  "/msvc/" +
  gstName;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(work, { recursive: true });
await mkdir(out, { recursive: true });
async function download(url, path, expected) {
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {}
  if (!bytes || (expected && hash(bytes) !== expected)) {
    console.log("Download prüfen: " + url);
    if (expected && url.endsWith(".exe")) {
      const temporary = path + ".download";
      try {
        command("curl.exe", [
          "--http1.1",
          "--location",
          "--fail",
          "--retry",
          "5",
          "--retry-all-errors",
          "--retry-delay",
          "3",
          "--connect-timeout",
          "30",
          "--max-time",
          "600",
          "--output",
          temporary,
          url,
        ]);
        const archive = await readFile(temporary);
        if (hash(archive) !== expected)
          throw new Error("SDK-SHA256 stimmt nicht.");
        await rename(temporary, path);
        return archive;
      } finally {
        await unlink(temporary).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
      }
    }
    for (let attempt = 0; attempt < 3; ++attempt) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        bytes = Buffer.from(await r.arrayBuffer());
        if (expected && hash(bytes) !== expected)
          throw new Error("SHA256 stimmt nicht.");
        await writeFile(path, bytes);
        return bytes;
      } catch (e) {
        if (attempt === 2) throw e;
        await pause(3000);
      }
    }
  }
  return bytes;
}
function command(exe, args, cwd = work) {
  execFileSync(exe, args, {
    cwd,
    windowsHide: true,
    stdio: "inherit",
    timeout: 1200000,
  });
}
async function checkout(url, sha, folder) {
  await mkdir(folder, { recursive: true });
  if (!(await lstat(join(folder, ".git")).catch(() => null))) {
    command("git", ["init", folder]);
    command("git", ["-C", folder, "remote", "add", "origin", url]);
    command("git", ["-C", folder, "fetch", "--depth=1", "origin", sha]);
    command("git", ["-C", folder, "checkout", "--detach", "FETCH_HEAD"]);
  }
  const actual = execFileSync("git", ["-C", folder, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  if (actual !== sha) throw new Error("Quellstand passt nicht zum Build.");
}
const gstHashBytes = await download(
  gstUrl + ".sha256sum",
  join(work, "gst.sha256sum"),
);
const gstHash = gstHashBytes.toString("utf8").match(/^[a-f0-9]{64}(?=\s)/)?.[0];
if (!gstHash) throw new Error("Offizielle GStreamer-Prüfsumme fehlt.");
console.log("Offizieller GStreamer-SDK-SHA256: " + gstHash);
const installer = join(work, gstName);
await download(gstUrl, installer, gstHash);
const gst = join(work, "gst");
if (
  !(await lstat(join(gst, "include/gstreamer-1.0/gst/gst.h")).catch(() => null))
)
  command(installer, [
    "/VERYSILENT",
    "/SUPPRESSMSGBOXES",
    "/NORESTART",
    "/SP-",
    "/CURRENTUSER",
    "/NOICONS",
    "/TYPE=devel",
    "/DIR=" + gst,
    "/LOG=" + join(work, "gst-install.log"),
  ]);
const skia = join(work, "skia");
await checkout("https://skia.googlesource.com/skia", skiaRevision, skia);
await checkout(
  "https://skia.googlesource.com/third_party/libpng.git",
  "d5515b5b8be3901aac04e5bd8bd5c89f287bcd33",
  join(skia, "third_party/externals/libpng"),
);
await checkout(
  "https://chromium.googlesource.com/chromium/src/third_party/zlib",
  "646b7f569718921d7d4b5b8e22572ff6c76f2596",
  join(skia, "third_party/externals/zlib"),
);
command("python", ["bin/fetch-gn"], skia);
const args = [
  "is_official_build=true",
  "is_debug=false",
  "is_component_build=false",
  "is_trivial_abi=false",
  "skia_enable_ganesh=false",
  "skia_enable_graphite=false",
  "skia_use_partition_alloc=false",
  "skia_enable_tools=false",
  "skia_enable_pdf=false",
  "skia_enable_skottie=false",
  "skia_enable_svg=false",
  "skia_use_icu=false",
  "skia_use_harfbuzz=false",
  "skia_use_expat=false",
  "skia_use_lua=false",
  "skia_use_libpng_decode=false",
  "skia_use_libpng_encode=true",
  "skia_use_system_libpng=false",
  "skia_use_zlib=true",
  "skia_use_system_zlib=false",
  "skia_use_wuffs=false",
  "skia_use_libjpeg_turbo_decode=false",
  "skia_use_libjpeg_turbo_encode=false",
  "skia_use_libwebp_decode=false",
  "skia_use_libwebp_encode=false",
  "skia_use_piex=false",
  "skia_use_freetype=false",
  "skia_use_fontconfig=false",
  "skia_use_xps=false",
  'extra_cflags=["/MD"]',
  'target_cpu="x64"',
].join(" ");
command(
  join(skia, "bin/gn.exe"),
  ["gen", "out/ShowNight", "--args=" + args],
  skia,
);
command("ninja", ["-C", "out/ShowNight", "-j", "4", "skia"], skia);
const jsonInclude = join(work, "json/nlohmann");
await mkdir(jsonInclude, { recursive: true });
await download(
  "https://raw.githubusercontent.com/nlohmann/json/v3.12.0/single_include/nlohmann/json.hpp",
  join(jsonInclude, "json.hpp"),
  jsonHash,
);
const build = join(work, "native");
command("cmake", [
  "-S",
  resolve("apps/renderer"),
  "-B",
  build,
  "-G",
  "Ninja",
  "-DCMAKE_BUILD_TYPE=Release",
  "-DSKIA_ROOT=" + skia,
  "-DGSTREAMER_ROOT=" + gst,
  "-DJSON_INCLUDE=" + join(work, "json"),
  "-DSKIA_REVISION=" + skiaRevision,
]);
command("cmake", ["--build", build, "--parallel", "4"]);
await copyFile(
  join(build, "bin/shownight-renderer.exe"),
  join(out, "shownight-renderer.exe"),
);
await mkdir(join(out, "bin"), { recursive: true });
await mkdir(join(out, "plugins"), { recursive: true });
const plugins = [
  "gstcoreelements.dll",
  "gstapp.dll",
  "gstvideoconvertscale.dll",
  "gstmatroska.dll",
  "gstvpx.dll",
  "gsttypefindfunctions.dll",
];
for (const file of plugins)
  await copyFile(
    join(gst, "lib/gstreamer-1.0", file),
    join(out, "plugins", file),
  );
// Copy the actual PE dependency closure, not every codec/library in the SDK.
// Windows system DLLs and the free VC++ Redistributable are prerequisites.
const libraries = new Map(
  (await readdir(join(gst, "bin")))
    .filter((f) => f.endsWith(".dll"))
    .map((f) => [f.toLowerCase(), f]),
);
const inspect = [
    join(out, "shownight-renderer.exe"),
    ...plugins.map((f) => join(out, "plugins", f)),
  ],
  copied = new Set();
for (let i = 0; i < inspect.length; ++i) {
  const text = execFileSync("dumpbin.exe", ["/DEPENDENTS", inspect[i]], {
    encoding: "utf8",
    windowsHide: true,
  });
  for (const match of text.matchAll(/^\s+([A-Za-z0-9_.-]+\.dll)\s*$/gim)) {
    const name = libraries.get(match[1].toLowerCase());
    if (name && !copied.has(name)) {
      copied.add(name);
      const file = join(out, "bin", name);
      await copyFile(join(gst, "bin", name), file);
      inspect.push(file);
    }
  }
}
await mkdir(join(out, "assets"), { recursive: true });
const image = Buffer.alloc(64 * 64 * 4);
for (let y = 0; y < 64; ++y)
  for (let x = 0; x < 64; ++x) {
    const i = (y * 64 + x) * 4;
    image[i] = 220;
    image[i + 1] = y * 4;
    image[i + 2] = x * 4;
    image[i + 3] = 255;
  }
await writeFile(join(out, "assets/bild-64x64.bgra"), image);
command(ffmpeg, [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=320x180:rate=25",
  "-t",
  "4",
  "-an",
  "-c:v",
  "libvpx",
  "-b:v",
  "250k",
  "-threads",
  "1",
  join(out, "assets/test.webm"),
]);
const licenses = join(out, "licenses");
await mkdir(licenses, { recursive: true });
await copyFile(join(skia, "LICENSE"), join(licenses, "Skia-LICENSE"));
await copyFile(
  join(skia, "third_party/externals/libpng/LICENSE"),
  join(licenses, "libpng-LICENSE"),
);
await copyFile(
  join(skia, "third_party/externals/zlib/LICENSE"),
  join(licenses, "zlib-LICENSE"),
);
await download(
  "https://raw.githubusercontent.com/nlohmann/json/v3.12.0/LICENSE.MIT",
  join(licenses, "nlohmann-LICENSE"),
);
await cp(join(gst, "share/licenses"), join(licenses, "gstreamer-sdk"), {
  recursive: true,
});
await cp(resolve("apps/renderer"), join(out, "source"), { recursive: true });
await copyFile(
  resolve("scripts/renderer-build.mjs"),
  join(out, "source/renderer-build.mjs"),
);
await writeFile(
  join(out, "versions.json"),
  JSON.stringify(
    {
      mode: "software-diagnostics",
      skiaRevision,
      gstreamerVersion: gstVersion,
      gstreamerUrl: gstUrl,
      gstreamerSha256: gstHash,
      jsonVersion: "3.12.0",
      jsonSha256: jsonHash,
      skiaArgs: args,
      plugins,
      physicalOutputEnabled: false,
      audioOutputEnabled: false,
    },
    null,
    2,
  ),
);
const files = {};
for (const sub of ["", "bin", "plugins", "assets"])
  for (const name of await readdir(join(out, sub))) {
    const path = join(out, sub, name);
    if (
      (await lstat(path)).isFile() &&
      (sub || name === "shownight-renderer.exe")
    )
      files[(sub ? sub + "/" : "") + name] = hash(await readFile(path));
  }
await writeFile(
  join(out, "integrity.json"),
  JSON.stringify({ version: 1, files }, null, 2),
);
console.log(
  "Native Windows-Renderer gebaut; Quellen, SDK-SHA256, Assets und Softwaremodus dokumentiert.",
);
