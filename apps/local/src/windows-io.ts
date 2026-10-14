import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  windowsIoReport,
  type WindowsIoReport,
} from "../../../packages/contracts/src/local-status.js";

// Fixed, bundled source: stdin is this constant, never request data. Windows APIs
// enumerate metadata only; no streams, devices, mixers or renderer are activated.
const source = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace ShowNightInventory {
  [StructLayout(LayoutKind.Sequential)] struct Luid { public uint Low; public int High; }
  [StructLayout(LayoutKind.Sequential)] struct SourceInfo { public Luid Adapter; public uint Id,Mode,Flags; }
  [StructLayout(LayoutKind.Sequential)] struct Rational { public uint Numerator,Denominator; }
  [StructLayout(LayoutKind.Sequential)] struct TargetInfo {
    public Luid Adapter; public uint Id,Mode,Technology,Rotation,Scaling;
    public Rational Refresh; public uint ScanLine;
    [MarshalAs(UnmanagedType.Bool)] public bool Available; public uint Flags;
  }
  [StructLayout(LayoutKind.Sequential)] struct PathInfo { public SourceInfo Source; public TargetInfo Target; public uint Flags; }
  [StructLayout(LayoutKind.Explicit,Size=64)] struct ModeInfo {
    [FieldOffset(0)] public uint Type; [FieldOffset(4)] public uint Id;
    // DISPLAYCONFIG_TARGET_MODE.targetVideoSignalInfo.activeSize; do not
    // mistake a cloned desktop's source dimensions for each target signal.
    [FieldOffset(40)] public uint Width; [FieldOffset(44)] public uint Height;
  }
  [StructLayout(LayoutKind.Sequential)] struct Header { public uint Type,Size; public Luid Adapter; public uint Id; }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct TargetName {
    public Header Header; public uint Flags,Technology; public ushort Manufacturer,Product; public uint Connector;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=64)] public string Name;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)] public string PrivatePath;
  }
  [StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid Format; public uint Id; }
  [StructLayout(LayoutKind.Explicit,Size=24)] struct Variant {
    [FieldOffset(0)] public ushort Type; [FieldOffset(8)] public IntPtr Text;
  }
  [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface Enumerator {
    [PreserveSig] int EnumAudioEndpoints(int direction,uint states,out DeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int direction,int role,out Device device);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id,out Device device);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr callback);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr callback);
  }
  [ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface DeviceCollection {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index,out Device device);
  }
  [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface Device {
    [PreserveSig] int Activate(ref Guid iid,uint context,IntPtr activation,out IntPtr result);
    [PreserveSig] int OpenPropertyStore(uint access,out Properties properties);
    [PreserveSig] int GetId(out IntPtr id);
    [PreserveSig] int GetState(out uint state);
  }
  [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface Properties {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetAt(uint index,out PropertyKey key);
    [PreserveSig] int GetValue(ref PropertyKey key,out Variant value);
    [PreserveSig] int SetValue(ref PropertyKey key,ref Variant value);
    [PreserveSig] int Commit();
  }
  public static class Probe {
    [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags,out uint paths,out uint modes);
    [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags,ref uint paths,[In,Out] PathInfo[] pathArray,ref uint modes,[In,Out] ModeInfo[] modeArray,IntPtr topology);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int DisplayConfigGetDeviceInfo(ref TargetName name);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref Variant value);
    static void Check(int code) { if(code<0) Marshal.ThrowExceptionForHR(code); }
    static void Release(object value) { if(value!=null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }
    static string Clean(string value,string fallback) {
      if(String.IsNullOrWhiteSpace(value)) return fallback;
      var chars=new List<char>();
      foreach(char c in value) if(!Char.IsControl(c) && c!='\u202a' && c!='\u202b' && c!='\u202c' && c!='\u202d' && c!='\u202e' && c!='\u2066' && c!='\u2067' && c!='\u2068' && c!='\u2069') { chars.Add(c); if(chars.Count==160) break; }
      string result=new String(chars.ToArray()).Trim(); return result.Length==0 ? fallback : result;
    }
    static Dictionary<string,object> Group(string status,List<object> items,bool truncated) {
      return new Dictionary<string,object>{{"status",status},{"items",items.ToArray()},{"truncated",truncated}};
    }
    static string Connector(uint value) {
      switch(value) {
        case 0:return "VGA";case 1:return "S-Video";case 2:return "Composite";case 3:return "Component";
        case 4:return "DVI";case 5:return "HDMI";case 6:return "LVDS";
        case 10:return "DisplayPort (extern)";case 11:return "DisplayPort (intern)";
        case 12:return "UDI (extern)";case 13:return "UDI (intern)";
        case 15:return "Miracast";case 16:return "Indirekt (kabelgebunden)";
        case 17:return "Indirekt (virtuell)";case 0x80000000:return "Intern";default:return null;
      }
    }
    static Dictionary<string,object> Displays() {
      var items=new List<object>();
      try {
        if(Marshal.SizeOf(typeof(PathInfo))!=72 || Marshal.SizeOf(typeof(ModeInfo))!=64 || Marshal.SizeOf(typeof(TargetName))!=420) throw new Exception();
        for(int retry=0;retry<3;retry++) {
          uint count,modes; if(GetDisplayConfigBufferSizes(2,out count,out modes)!=0 || count>512 || modes>1024) throw new Exception();
          var paths=new PathInfo[count];var modeArray=new ModeInfo[modes];
          int code=QueryDisplayConfig(2,ref count,paths,ref modes,modeArray,IntPtr.Zero);
          if(code==122) continue; if(code!=0) throw new Exception();
          for(int i=0;i<count && i<64;i++) {
            var path=paths[i]; var target=new TargetName();
            target.Header=new Header{Type=2,Size=420,Adapter=path.Target.Adapter,Id=path.Target.Id};
            bool named=DisplayConfigGetDeviceInfo(ref target)==0;
            uint? width=null,height=null;
            if(path.Target.Mode<modes && modeArray[path.Target.Mode].Type==2) {
              var mode=modeArray[path.Target.Mode];
              if(mode.Width>0 && mode.Width<=65536 && mode.Height>0 && mode.Height<=65536) {width=mode.Width;height=mode.Height;}
            }
            items.Add(new Dictionary<string,object>{{"name",Clean(named?target.Name:null,"Anzeige "+(i+1))},{"width",width},{"height",height},{"connector",Connector(path.Target.Technology)}});
          }
          return Group("available",items,count>64);
        }
        throw new Exception();
      } catch { return Group("error",new List<object>(),false); }
    }
    static Dictionary<string,object> Audio(int direction) {
      var items=new List<object>(); Enumerator enumerator=null;DeviceCollection collection=null;
      try {
        enumerator=(Enumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
        Check(enumerator.EnumAudioEndpoints(direction,1,out collection));
        uint count; Check(collection.GetCount(out count));
        var key=new PropertyKey{Format=new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"),Id=14};
        for(uint i=0;i<count && i<64;i++) {
          Device device=null;Properties properties=null;var value=new Variant();
          try {
            Check(collection.Item(i,out device));Check(device.OpenPropertyStore(0,out properties));Check(properties.GetValue(ref key,out value));
            string name=value.Type==31 && value.Text!=IntPtr.Zero ? Marshal.PtrToStringUni(value.Text) : null;
            items.Add(new Dictionary<string,object>{{"name",Clean(name,(direction==0?"Audioausgang ":"Audioeingang ")+(i+1))}});
          } finally { PropVariantClear(ref value);Release(properties);Release(device); }
        }
        return Group("available",items,count>64);
      } catch { return Group("error",new List<object>(),false); }
      finally { Release(collection);Release(enumerator); }
    }
    public static object Read() {
      return new Dictionary<string,object>{{"displays",Displays()},{"audioInputs",Audio(1)},{"audioOutputs",Audio(0)}};
    }
  }
}`;

const bootstrap =
  "$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.Encoding]::UTF8;[Console]::OutputEncoding=[Text.Encoding]::UTF8;$source=[Console]::In.ReadToEnd();Add-Type -TypeDefinition $source;[ShowNightInventory.Probe]::Read()|ConvertTo-Json -Depth 8 -Compress";

function runProbe(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      join(
        process.env.SystemRoot ?? "C:/Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(bootstrap, "utf16le").toString("base64"),
      ],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PSModulePath: join(
            process.env.SystemRoot ?? "C:/Windows",
            "System32/WindowsPowerShell/v1.0/Modules",
          ),
        },
      },
    );
    let bytes = 0;
    const chunks: Buffer[] = [];
    let failed = false;
    const fail = () => {
      if (failed) return;
      failed = true;
      child.kill();
      reject(new Error("Inventarisierung nicht verfügbar."));
    };
    const timeout = setTimeout(fail, 12000);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 128 * 1024) return fail();
      chunks.push(chunk);
    });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", fail);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (failed) return;
      if (code !== 0) return fail();
      try {
        resolve(
          JSON.parse(
            Buffer.concat(chunks)
              .toString("utf8")
              .replace(/^\uFEFF/, "")
              .trim(),
          ),
        );
      } catch {
        fail();
      }
    });
    child.stdin.end(source);
  });
}

type Options = {
  platform?: string;
  now?: () => number;
  probe?: () => Promise<unknown>;
};
export function unavailableWindowsIo(): WindowsIoReport {
  const group = { status: "error" as const, items: [], truncated: false };
  return windowsIoReport.parse({
    checkedAt: new Date().toISOString(),
    platform: process.platform === "win32" ? "win32" : "unsupported",
    displays: group,
    audioInputs: group,
    audioOutputs: group,
    cameras: { status: "unsupported", items: [], truncated: false },
    deviceActivationPerformed: false,
  });
}
export function createWindowsIoProvider(
  options: Options = {},
): () => Promise<WindowsIoReport> {
  const platform = options.platform ?? process.platform,
    now = options.now ?? Date.now;
  let cached: WindowsIoReport | undefined,
    expiresAt = 0,
    pending: Promise<WindowsIoReport> | undefined;
  async function check(): Promise<WindowsIoReport> {
    const unsupported = platform !== "win32";
    let groups: unknown;
    try {
      if (!unsupported) groups = await (options.probe ?? runProbe)();
    } catch {
      /* Generic category errors only. */
    }
    const group = {
      status: unsupported ? "unsupported" : "error",
      items: [],
      truncated: false,
    };
    const base = {
      checkedAt: new Date(now()).toISOString(),
      platform: unsupported ? "unsupported" : "win32",
      displays: group,
      audioInputs: group,
      audioOutputs: group,
      cameras: { status: "unsupported", items: [], truncated: false },
      deviceActivationPerformed: false,
    };
    const parsed = windowsIoReport.safeParse({
      ...base,
      ...(groups && typeof groups === "object" ? groups : {}),
    });
    return parsed.success ? parsed.data : windowsIoReport.parse(base);
  }
  return async () => {
    if (cached && now() < expiresAt) return structuredClone(cached);
    pending ??= check()
      .then((result) => {
        cached = result;
        expiresAt = now() + 30000;
        return result;
      })
      .finally(() => {
        pending = undefined;
      });
    return structuredClone(await pending);
  };
}
