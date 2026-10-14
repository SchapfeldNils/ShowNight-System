#include <windows.h>
#include <sddl.h>
#include <gst/gst.h>
#include <gst/app/gstappsink.h>
#include <gst/video/video.h>
#include <nlohmann/json.hpp>
#include "include/core/SkCanvas.h"
#include "include/core/SkData.h"
#include "include/core/SkFont.h"
#include "include/core/SkFontMgr.h"
#include "include/core/SkImage.h"
#include "include/core/SkImageInfo.h"
#include "include/core/SkPaint.h"
#include "include/core/SkPixmap.h"
#include "include/core/SkSamplingOptions.h"
#include "include/core/SkStream.h"
#include "include/core/SkSurface.h"
#include "include/encode/SkPngEncoder.h"
#include "include/ports/SkTypeface_win.h"
#include <atomic>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <regex>
#include <set>
#include <string>
#include <thread>
#include <vector>
using json = nlohmann::json;
namespace fs = std::filesystem;
constexpr int width = 640, height = 360;
constexpr size_t messageLimit = 16384;
std::atomic<bool> stopping{false};
const std::regex uuid("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
std::string utf8(const std::wstring& s) {
  int n = WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,s.data(),static_cast<int>(s.size()),nullptr,0,nullptr,nullptr);
  if (!n) throw std::runtime_error("UTF8");
  std::string out(n,'\0');
  WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,s.data(),static_cast<int>(s.size()),out.data(),n,nullptr,nullptr); return out;
}
std::wstring environment(const wchar_t* key) {
  DWORD size = GetEnvironmentVariableW(key,nullptr,0);
  if (!size || size > 32768) throw std::runtime_error("ENV");
  std::wstring out(size,L'\0');
  DWORD n = GetEnvironmentVariableW(key,out.data(),size);
  if (!n || n >= size) throw std::runtime_error("ENV");
  out.resize(n); return out;
}
void exact(const json& j,const std::set<std::string>& keys) {
  if (!j.is_object() || j.size() != keys.size()) throw std::runtime_error("INVALID");
  for (const auto& item : j.items()) if (!keys.contains(item.key())) throw std::runtime_error("INVALID");
}
bool identifier(const json& j) { return j.is_string() && std::regex_match(j.get<std::string>(),uuid); }
bool equalToken(const std::string& a,const std::string& b) {
  if (a.size() != 64 || b.size() != 64) return false;
  unsigned char v = 0; for (size_t i = 0;i < 64;++i) v |= static_cast<unsigned char>(a[i]^b[i]); return v == 0;
}
std::string gstVersion() {
  guint a,b,c,d; gst_version(&a,&b,&c,&d);
  return std::to_string(a)+"."+std::to_string(b)+"."+std::to_string(c);
}

// No physical video/audio sink: the only endpoint is an in-process appsink.
class Video {
  GstElement* pipeline = nullptr;
  GstAppSink* sink = nullptr;
public:
  std::vector<unsigned char> pixels;
  uint64_t frames = 0;
  bool error = false;
  explicit Video(const fs::path& file) {
    GError* e = nullptr;
    pipeline = gst_parse_launch("filesrc name=source ! matroskademux ! vp8dec ! videoconvert ! video/x-raw,format=BGRA,width=320,height=180 ! appsink name=frames sync=true max-buffers=1 drop=true",&e);
    if (e || !pipeline) { if (e) g_error_free(e); if (pipeline) gst_object_unref(pipeline); pipeline = nullptr; throw std::runtime_error("MEDIA"); }
    auto source = gst_bin_get_by_name(GST_BIN(pipeline),"source");
    std::string location = utf8(file.wstring());
    g_object_set(source,"location",location.c_str(),nullptr); gst_object_unref(source);
    sink = GST_APP_SINK(gst_bin_get_by_name(GST_BIN(pipeline),"frames"));
    if (!sink || gst_element_set_state(pipeline,GST_STATE_PLAYING) == GST_STATE_CHANGE_FAILURE) { cleanup(); throw std::runtime_error("MEDIA"); }
    auto sample = gst_app_sink_try_pull_sample(sink,3*GST_SECOND);
    if (!sample) { cleanup(); throw std::runtime_error("MEDIA"); }
    try { accept(sample); } catch (...) { gst_sample_unref(sample); cleanup(); throw; }
    gst_sample_unref(sample);
  }
  ~Video() { cleanup(); }
  Video(const Video&) = delete;
  Video& operator=(const Video&) = delete;
  void cleanup() {
    if (pipeline) gst_element_set_state(pipeline,GST_STATE_NULL);
    if (sink) { gst_object_unref(sink); sink = nullptr; }
    if (pipeline) { gst_object_unref(pipeline); pipeline = nullptr; }
  }
  void accept(GstSample* sample) {
    GstVideoInfo info; gst_video_info_init(&info);
    if (!gst_video_info_from_caps(&info,gst_sample_get_caps(sample)) || GST_VIDEO_INFO_FORMAT(&info) != GST_VIDEO_FORMAT_BGRA || GST_VIDEO_INFO_WIDTH(&info) != 320 || GST_VIDEO_INFO_HEIGHT(&info) != 180) throw std::runtime_error("MEDIA");
    GstVideoFrame frame{};
    if (!gst_video_frame_map(&frame,&info,gst_sample_get_buffer(sample),GST_MAP_READ)) throw std::runtime_error("MEDIA");
    auto stride = GST_VIDEO_FRAME_PLANE_STRIDE(&frame,0);
    auto data = static_cast<const unsigned char*>(GST_VIDEO_FRAME_PLANE_DATA(&frame,0));
    if (stride < 320*4) { gst_video_frame_unmap(&frame); throw std::runtime_error("MEDIA"); }
    pixels.resize(320*180*4);
    for (int row = 0;row < 180;++row) memcpy(pixels.data()+row*320*4,data+row*stride,320*4);
    gst_video_frame_unmap(&frame); ++frames;
  }
  void tick() {
    if (error) return;
    auto sample = gst_app_sink_try_pull_sample(sink,0);
    if (sample) { try { accept(sample); } catch (...) { error = true; } gst_sample_unref(sample); }
    auto bus = gst_element_get_bus(pipeline);
    auto msg = gst_bus_pop_filtered(bus,static_cast<GstMessageType>(GST_MESSAGE_ERROR|GST_MESSAGE_EOS));
    if (msg) {
      if (GST_MESSAGE_TYPE(msg) == GST_MESSAGE_ERROR) error = true;
      else if (!gst_element_seek_simple(pipeline,GST_FORMAT_TIME,static_cast<GstSeekFlags>(GST_SEEK_FLAG_FLUSH|GST_SEEK_FLAG_KEY_UNIT),0)) error = true;
      gst_message_unref(msg);
    }
    gst_object_unref(bus);
  }
};
struct Scene {
  std::string id,kind;
  std::unique_ptr<Video> video;
  json state() const { return {{"id",id},{"kind",kind},{"videoFrames",video ? video->frames : 0}}; }
};
class Renderer {
  std::mutex mutex;
  std::string epoch;
  fs::path assets,frames;
  uint64_t revision = 0;
  std::unique_ptr<Scene> preview,program;
  std::map<std::string,std::pair<std::string,json>> receipts;
  sk_sp<SkTypeface> font;
  sk_sp<SkImage> image;
  std::thread clock;
  json stateUnlocked() const {
    return {{"protocolVersion",1},{"epoch",epoch},{"revision",revision},{"mode","software-diagnostics"},
      {"width",width},{"height",height},{"physicalOutputEnabled",false},{"audioOutputEnabled",false},
      {"preview",preview ? preview->state() : json(nullptr)},{"program",program ? program->state() : json(nullptr)},
      {"mediaError",(preview && preview->video && preview->video->error)||(program && program->video && program->video->error)},
      {"gstreamerVersion",gstVersion()},{"skiaRevision",SKIA_REVISION}};
  }
  std::unique_ptr<Scene> makeScene(const std::string& id,const std::string& kind) {
    auto scene = std::make_unique<Scene>(); scene->id = id; scene->kind = kind;
    if (kind == "video") scene->video = std::make_unique<Video>(assets/"test.webm"); return scene;
  }
  void paint(const Scene* scene,const fs::path& file) {
    auto surface = SkSurfaces::Raster(SkImageInfo::MakeN32Premul(width,height));
    if (!surface) throw std::runtime_error("MEDIA");
    auto canvas = surface->getCanvas();
    canvas->clear(scene ? SkColorSetRGB(17,27,44) : SK_ColorBLACK);
    SkPaint p; p.setAntiAlias(true);
    if (scene) {
      if (scene->video && !scene->video->pixels.empty()) {
        auto data = SkData::MakeWithCopy(scene->video->pixels.data(),scene->video->pixels.size());
        auto videoImage = SkImages::RasterFromData(SkImageInfo::Make(320,180,kBGRA_8888_SkColorType,kOpaque_SkAlphaType),data,320*4);
        canvas->drawImageRect(videoImage,SkRect::MakeXYWH(40,80,560,220),SkSamplingOptions(SkFilterMode::kLinear));
      } else { p.setColor(SkColorSetRGB(21,144,158)); canvas->drawRoundRect(SkRect::MakeXYWH(40,80,560,220),18,18,p); }
      canvas->drawImageRect(image,SkRect::MakeXYWH(52,96,96,96),SkSamplingOptions(SkFilterMode::kNearest));
      p.setColor(SK_ColorWHITE);
      SkFont title(font,28),body(font,20);
      const char* text = scene->kind == "video" ? "ShowNight - Video und Grafik" : "ShowNight - Bild, Text und Form";
      canvas->drawSimpleText(text,strlen(text),SkTextEncoding::kUTF8,40,48,title,p);
      const char* sub = "Synthetische Testszene"; canvas->drawSimpleText(sub,strlen(sub),SkTextEncoding::kUTF8,168,134,body,p);
    }
    p.setColor(SkColorSetRGB(250,193,60)); SkFont footer(font,15);
    const char* mark = "SOFTWAREDIAGNOSE - KEINE BILDSCHIRM-/TONAUSGABE";
    canvas->drawSimpleText(mark,strlen(mark),SkTextEncoding::kUTF8,12,344,footer,p);
    SkPixmap pixels; if (!surface->peekPixels(&pixels)) throw std::runtime_error("MEDIA");
    SkFILEWStream output(utf8(file.wstring()).c_str());
    SkPngEncoder::Options options; options.fZLibLevel = 1;
    if (!output.isValid() || !SkPngEncoder::Encode(&output,pixels,options)) throw std::runtime_error("MEDIA");
  }
public:
  Renderer(std::string epoch,fs::path assets,fs::path frames):epoch(std::move(epoch)),assets(std::move(assets)),frames(std::move(frames)) {
    auto fm = SkFontMgr_New_DirectWrite(); if (!fm) throw std::runtime_error("MEDIA");
    font = fm->matchFamilyStyle("Arial",SkFontStyle::Normal()); if (!font) throw std::runtime_error("MEDIA");
    std::ifstream input(this->assets/"bild-64x64.bgra",std::ios::binary);
    std::vector<unsigned char> bytes(64*64*4); input.read(reinterpret_cast<char*>(bytes.data()),static_cast<std::streamsize>(bytes.size()));
    if (!input || input.peek() != EOF) throw std::runtime_error("MEDIA");
    image = SkImages::RasterFromData(SkImageInfo::Make(64,64,kBGRA_8888_SkColorType,kOpaque_SkAlphaType),SkData::MakeWithCopy(bytes.data(),bytes.size()),64*4);
    if (!image) throw std::runtime_error("MEDIA");
    clock = std::thread([this] { while (!stopping) {
      { std::lock_guard guard(mutex); if (preview && preview->video) preview->video->tick(); if (program && program->video) program->video->tick(); }
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    } });
  }
  ~Renderer() { stopping = true; if (clock.joinable()) clock.join(); }
  json state() { std::lock_guard guard(mutex); return stateUnlocked(); }
  json execute(const json& r) {
    std::lock_guard guard(mutex);
    const std::string type = r.value("type",""),requestId = r.value("requestId","");
    if (r.value("protocolVersion",0) != 1 || r.value("epoch","") != epoch || !identifier(r.at("requestId"))) throw std::runtime_error("INVALID");
    auto reply = [&](const char* result,const char* code) { return json{{"protocolVersion",1},{"epoch",epoch},{"requestId",requestId},{"result",result},{"code",code},{"state",stateUnlocked()}}; };
    if (type == "query") { exact(r,{"protocolVersion","epoch","requestId","type"}); return reply("completed","OK"); }
    if (type == "frame") {
      exact(r,{"protocolVersion","epoch","requestId","type","channel"});
      const std::string channel = r.at("channel");
      if (channel != "preview" && channel != "program") throw std::runtime_error("INVALID");
      paint(channel == "preview" ? preview.get() : program.get(),frames/(channel+"-"+requestId+".png"));
      return reply("completed","OK");
    }
    if (type == "shutdown") { exact(r,{"protocolVersion","epoch","requestId","type"}); stopping = true; return reply("completed","OK"); }
    exact(r,{"protocolVersion","epoch","requestId","type","command"});
    const auto& c = r.at("command"); const std::string action = c.value("action","");
    if (action == "prepare") {
      exact(c,{"commandId","expectedRevision","action","scene"});
      const std::string kind = c.at("scene"); if (kind != "grafik" && kind != "video") throw std::runtime_error("INVALID");
    } else if (action == "take") { exact(c,{"commandId","expectedRevision","action","expectedSceneId"}); if (!identifier(c.at("expectedSceneId"))) throw std::runtime_error("INVALID"); }
    else if (action == "clear") exact(c,{"commandId","expectedRevision","action"});
    else throw std::runtime_error("INVALID");
    if (type != "command" || !identifier(c.at("commandId")) || !c.at("expectedRevision").is_number_unsigned()) throw std::runtime_error("INVALID");
    const std::string id = c.at("commandId"),fingerprint = c.dump();
    auto previous = receipts.find(id);
    if (previous != receipts.end()) {
      if (previous->second.first != fingerprint) return reply("conflict","COMMAND_ID");
      auto out = previous->second.second; out["requestId"] = requestId; return out;
    }
    if (receipts.size() >= 1024 || revision >= 9007199254740990ULL) return reply("failed","LIMIT");
    json out;
    if (c.at("expectedRevision").get<uint64_t>() != revision) out = reply("conflict","REVISION");
    else if (action == "take" && (!preview || preview->id != c.at("expectedSceneId").get<std::string>())) out = reply("conflict","SCENE");
    else {
      try {
        if (action == "prepare") preview = makeScene(id,c.at("scene").get<std::string>());
        else if (action == "take") program = makeScene(preview->id,preview->kind);
        else { preview.reset(); program.reset(); }
        ++revision; out = reply("completed","OK");
      } catch (...) { out = reply("failed","MEDIA"); }
    }
    receipts.emplace(id,std::make_pair(fingerprint,out)); return out;
  }
};
class Security {
  PSECURITY_DESCRIPTOR descriptor = nullptr;
public:
  SECURITY_ATTRIBUTES attributes{sizeof(SECURITY_ATTRIBUTES),nullptr,FALSE};
  Security() {
    HANDLE token = nullptr; if (!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&token)) throw std::runtime_error("ACL");
    DWORD length = 0; GetTokenInformation(token,TokenUser,nullptr,0,&length);
    std::vector<unsigned char> buffer(length);
    if (!GetTokenInformation(token,TokenUser,buffer.data(),length,&length)) { CloseHandle(token); throw std::runtime_error("ACL"); }
    CloseHandle(token);
    LPWSTR sid = nullptr;
    if (!ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER*>(buffer.data())->User.Sid,&sid)) throw std::runtime_error("ACL");
    std::wstring sddl = L"D:P(A;;GA;;;SY)(A;;GA;;;" + std::wstring(sid) + L")"; LocalFree(sid);
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(),SDDL_REVISION_1,&descriptor,nullptr)) throw std::runtime_error("ACL");
    attributes.lpSecurityDescriptor = descriptor;
  }
  ~Security() { if (descriptor) LocalFree(descriptor); }
};
bool waitIO(HANDLE pipe,OVERLAPPED& o,DWORD& done,DWORD timeout) {
  if (WaitForSingleObject(o.hEvent,timeout) != WAIT_OBJECT_0) {
    CancelIoEx(pipe,&o); GetOverlappedResult(pipe,&o,&done,TRUE); return false;
  }
  return GetOverlappedResult(pipe,&o,&done,FALSE) != FALSE;
}
bool readMessage(HANDLE pipe,std::string& value) {
  std::vector<char> bytes(messageLimit+1);
  OVERLAPPED o{}; o.hEvent = CreateEventW(nullptr,TRUE,FALSE,nullptr); if (!o.hEvent) return false;
  DWORD n = 0; bool ok = ReadFile(pipe,bytes.data(),static_cast<DWORD>(bytes.size()),&n,&o) != FALSE;
  if (!ok && GetLastError() == ERROR_IO_PENDING) ok = waitIO(pipe,o,n,5000);
  CloseHandle(o.hEvent); if (!ok || n == 0 || n > messageLimit) return false;
  value.assign(bytes.data(),n); if (value.back() != '\n') return false; value.pop_back(); return true;
}
bool writeMessage(HANDLE pipe,const json& j) {
  const std::string value = j.dump()+"\n"; if (value.size() > messageLimit) return false;
  OVERLAPPED o{}; o.hEvent = CreateEventW(nullptr,TRUE,FALSE,nullptr); if (!o.hEvent) return false;
  DWORD n = 0; bool ok = WriteFile(pipe,value.data(),static_cast<DWORD>(value.size()),&n,&o) != FALSE;
  if (!ok && GetLastError() == ERROR_IO_PENDING) ok = waitIO(pipe,o,n,3000);
  CloseHandle(o.hEvent); return ok && n == value.size();
}
int wmain() {
  try {
    const auto epoch = utf8(environment(L"SHOWNIGHT_RENDERER_EPOCH")),token = utf8(environment(L"SHOWNIGHT_RENDERER_TOKEN"));
    if (!std::regex_match(epoch,uuid) || !std::regex_match(token,std::regex("^[0-9a-f]{64}$"))) return 2;
    auto frames = fs::path(environment(L"SHOWNIGHT_RENDERER_FRAMES"));
    if (!frames.is_absolute() || !fs::is_directory(frames)) return 2;
    wchar_t module[32768]; DWORD size = GetModuleFileNameW(nullptr,module,32768); if (!size || size >= 32768) return 2;
    fs::path root = fs::path(std::wstring(module,size)).parent_path();
    SetDllDirectoryW((root/L"bin").c_str());
    SetEnvironmentVariableW(L"GST_PLUGIN_PATH_1_0",L"");
    SetEnvironmentVariableW(L"GST_PLUGIN_SYSTEM_PATH_1_0",(root/L"plugins").c_str());
    SetEnvironmentVariableW(L"GST_REGISTRY_1_0",(frames/L"gst-registry.bin").c_str());
    SetEnvironmentVariableW(L"GST_REGISTRY_FORK",L"no");
    int argc = 0; char** argv = nullptr; gst_init(&argc,&argv);
    Renderer renderer(epoch,root/"assets",frames); Security security;
    std::wstring pipeName = L"\\\\.\\pipe\\ShowNight-Renderer-" + std::wstring(epoch.begin(),epoch.end());
    HANDLE pipe = CreateNamedPipeW(pipeName.c_str(),PIPE_ACCESS_DUPLEX|FILE_FLAG_OVERLAPPED|FILE_FLAG_FIRST_PIPE_INSTANCE,
      PIPE_TYPE_MESSAGE|PIPE_READMODE_MESSAGE|PIPE_WAIT|PIPE_REJECT_REMOTE_CLIENTS,1,static_cast<DWORD>(messageLimit+1),static_cast<DWORD>(messageLimit+1),1000,&security.attributes);
    if (pipe == INVALID_HANDLE_VALUE) return 2;
    std::cout << "ShowNight Renderer: Softwarediagnose, Bild-/Tonausgabe aus." << std::endl;
    while (!stopping) {
      OVERLAPPED c{}; c.hEvent = CreateEventW(nullptr,TRUE,FALSE,nullptr); DWORD unused = 0;
      bool connected = ConnectNamedPipe(pipe,&c) != FALSE;
      if (!connected) { auto e = GetLastError(); if (e == ERROR_PIPE_CONNECTED) connected = true; else if (e == ERROR_IO_PENDING) connected = waitIO(pipe,c,unused,1000); }
      CloseHandle(c.hEvent); if (!connected) { DisconnectNamedPipe(pipe); continue; }
      try {
        std::string value; if (!readMessage(pipe,value)) throw std::runtime_error("INVALID");
        const auto hello = json::parse(value); exact(hello,{"protocolVersion","epoch","type","token"});
        if (hello.value("protocolVersion",0) != 1 || hello.value("epoch","") != epoch || hello.value("type","") != "hello" || !equalToken(hello.value("token",""),token)) throw std::runtime_error("INVALID");
        if (!writeMessage(pipe,{{"protocolVersion",1},{"epoch",epoch},{"type","hello"},{"state",renderer.state()}})) throw std::runtime_error("IO");
        while (!stopping && readMessage(pipe,value)) {
          auto result = renderer.execute(json::parse(value)); if (!writeMessage(pipe,result)) break;
        }
      } catch (...) { /* Do not echo input, tokens, paths or library error text. */ }
      DisconnectNamedPipe(pipe);
    }
    CloseHandle(pipe); return 0;
  } catch (...) { std::cerr << "Renderer nicht bereit; Paket, lokale Rechte und Medien prüfen." << std::endl; return 1; }
}
