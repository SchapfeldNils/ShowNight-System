#pragma once
#include <cmath>

// Native validation is independent of the TypeScript controller. Only the
// versioned, hashed private snapshot and UUID-derived image children are read.
class PackageComposition {
  static bool layerIdentifier(const json& value) {
    static const std::regex pattern("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",std::regex::icase);
    return value.is_string() && std::regex_match(value.get<std::string>(),pattern);
  }
  static bool hash(const json& value) {
    static const std::regex pattern("^[0-9a-f]{64}$");
    return value.is_string() && std::regex_match(value.get<std::string>(),pattern);
  }
  static uint64_t positive(const json& value,uint64_t maximum) {
    if (!value.is_number_unsigned()) throw std::runtime_error("INVALID");
    const auto n = value.get<uint64_t>();
    if (!n || n > maximum) throw std::runtime_error("INVALID");
    return n;
  }
  static double number(const json& value,double minimum,double maximum) {
    if (!value.is_number()) throw std::runtime_error("INVALID");
    const auto n = value.get<double>();
    if (!std::isfinite(n) || n < minimum || n > maximum) throw std::runtime_error("INVALID");
    return n;
  }
  static std::wstring wide(const json& value) {
    if (!value.is_string()) throw std::runtime_error("INVALID");
    const auto text = value.get<std::string>();
    if (text.empty()) return {};
    const int length = MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),nullptr,0);
    if (!length) throw std::runtime_error("INVALID");
    std::wstring result(length,L'\0');
    if (!MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),result.data(),length)) throw std::runtime_error("INVALID");
    return result;
  }
  static bool whitespace(wchar_t c) {
    return (c >= 9 && c <= 13) || c == 32 || c == 0xa0 || c == 0x1680 ||
      (c >= 0x2000 && c <= 0x200a) || c == 0x2028 || c == 0x2029 ||
      c == 0x202f || c == 0x205f || c == 0x3000 || c == 0xfeff;
  }
  static void label(const json& value) {
    const auto text = wide(value);
    size_t start = 0,end = text.size();
    while (start < end && whitespace(text[start])) ++start;
    while (end > start && whitespace(text[end-1])) --end;
    if (end-start < 1 || end-start > 200) throw std::runtime_error("INVALID");
  }
  static SkColor color(const json& value) {
    static const std::regex pattern("^#[0-9a-fA-F]{6}$");
    if (!value.is_string() || !std::regex_match(value.get<std::string>(),pattern)) throw std::runtime_error("INVALID");
    const auto n = std::stoul(value.get<std::string>().substr(1),nullptr,16);
    return SkColorSetRGB((n>>16)&255,(n>>8)&255,n&255);
  }
  static fs::path snapshotPath(const fs::path& folder,const json& descriptor) {
    exact(descriptor,{"inputId","packageId","sceneId","sceneRevision","manifestSha256","sha256","sizeBytes"});
    if (!identifier(descriptor.at("inputId")) || !identifier(descriptor.at("packageId")) ||
        !identifier(descriptor.at("sceneId")) || !hash(descriptor.at("manifestSha256")) || !hash(descriptor.at("sha256"))) throw std::runtime_error("INVALID");
    positive(descriptor.at("sizeBytes"),1024*1024);
    positive(descriptor.at("sceneRevision"),9007199254740991ULL);
    return folder/("scene-"+descriptor.at("inputId").get<std::string>()+".json");
  }
  std::map<std::string,std::shared_ptr<PackageInput>> inputs;
  std::map<std::string,sk_sp<SkImage>> images;
  json definition;
  ReadLock snapshot;
public:
  json descriptor;
  PackageComposition(const fs::path& folder,const json& value)
    :snapshot(snapshotPath(folder,value)),descriptor(value) {
    const auto bytes = readVerified(snapshot,value.at("sizeBytes").get<uint64_t>(),value.at("sha256").get<std::string>());
    std::map<int,std::set<std::string>> objectKeys;
    const auto data = json::parse(bytes.begin(),bytes.end(),[&](int depth,json::parse_event_t event,json& parsed) {
      if (depth > 16) throw std::runtime_error("INVALID");
      if (event == json::parse_event_t::object_start) objectKeys[depth+1].clear();
      else if (event == json::parse_event_t::key && !objectKeys[depth].insert(parsed.get<std::string>()).second) throw std::runtime_error("INVALID");
      else if (event == json::parse_event_t::object_end) objectKeys.erase(depth+1);
      return true;
    });
    exact(data,{"schemaVersion","scene","images"});
    if (!data.at("schemaVersion").is_number_unsigned() || data.at("schemaVersion") != 1 ||
        !data.at("images").is_array() || data.at("images").size() > 64) throw std::runtime_error("INVALID");
    const auto& scene = data.at("scene");
    exact(scene,{"id","showId","revision","definition"});
    if (!identifier(scene.at("id")) || !identifier(scene.at("showId")) ||
        scene.at("id") != value.at("sceneId") || scene.at("revision") != value.at("sceneRevision")) throw std::runtime_error("INVALID");
    positive(scene.at("revision"),9007199254740991ULL);
    definition = scene.at("definition");
    exact(definition,{"name","logicalWidth","logicalHeight","background","layers"});
    label(definition.at("name"));
    positive(definition.at("logicalWidth"),4096); positive(definition.at("logicalHeight"),4096);
    color(definition.at("background"));
    if (!definition.at("layers").is_array() || definition.at("layers").size() > 64) throw std::runtime_error("INVALID");
    std::set<std::string> layerIds,referenced;
    for (const auto& layer : definition.at("layers")) {
      const auto kind = layer.at("kind").get<std::string>();
      std::set<std::string> fields = {"id","name","x","y","width","height","opacity","visible","kind"};
      if (kind == "rectangle") fields.insert("color");
      else if (kind == "text") { fields.insert("text"); fields.insert("fontSize"); fields.insert("color"); }
      else if (kind == "image") { fields.insert("mediaId"); fields.insert("fit"); }
      else throw std::runtime_error("INVALID");
      exact(layer,fields);
      if (!layerIdentifier(layer.at("id")) || !layerIds.insert(layer.at("id").get<std::string>()).second || !layer.at("visible").is_boolean()) throw std::runtime_error("INVALID");
      label(layer.at("name"));
      number(layer.at("x"),-8192,8192); number(layer.at("y"),-8192,8192);
      number(layer.at("width"),1,8192); number(layer.at("height"),1,8192); number(layer.at("opacity"),0,1);
      if (kind == "rectangle" || kind == "text") color(layer.at("color"));
      if (kind == "text") {
        if (wide(layer.at("text")).size() > 2000) throw std::runtime_error("INVALID");
        number(layer.at("fontSize"),6,300);
      } else if (kind == "image") {
        if (!identifier(layer.at("mediaId")) || (layer.at("fit") != "contain" && layer.at("fit") != "cover")) throw std::runtime_error("INVALID");
        referenced.insert(layer.at("mediaId").get<std::string>());
      }
    }
    uint64_t rawBytes = 0;
    std::set<std::string> imageIds,inputIds;
    // Validate the complete raw budget and reference set before opening/allocating images.
    for (const auto& media : data.at("images")) {
      PackageInput::inputPath(folder,media);
      if ((media.at("mime") != "image/png" && media.at("mime") != "image/jpeg") ||
          media.at("packageId") != value.at("packageId") || media.at("manifestSha256") != value.at("manifestSha256") ||
          !imageIds.insert(media.at("mediaId").get<std::string>()).second ||
          !inputIds.insert(media.at("inputId").get<std::string>()).second) throw std::runtime_error("INVALID");
      rawBytes += media.at("sizeBytes").get<uint64_t>();
      if (rawBytes > 64*1024*1024) throw std::runtime_error("MEDIA");
    }
    if (imageIds != referenced) throw std::runtime_error("INVALID");
    uint64_t remainingPixels = 16777216;
    for (const auto& media : data.at("images")) {
      auto input = std::make_shared<PackageInput>(folder,media);
      auto image = input->decodeImage(remainingPixels);
      if (!image) throw std::runtime_error("MEDIA");
      const auto id = media.at("mediaId").get<std::string>();
      inputs.emplace(id,std::move(input)); images.emplace(id,std::move(image));
    }
  }
  void paint(SkCanvas* canvas,const sk_sp<SkTypeface>& typeface) const {
    const float logicalWidth = definition.at("logicalWidth").get<float>(),logicalHeight = definition.at("logicalHeight").get<float>();
    const float scale = std::min(width/logicalWidth,height/logicalHeight);
    canvas->save();
    canvas->translate((width-logicalWidth*scale)/2,(height-logicalHeight*scale)/2);
    canvas->scale(scale,scale);
    canvas->clipRect(SkRect::MakeWH(logicalWidth,logicalHeight));
    SkPaint background; background.setColor(color(definition.at("background")));
    canvas->drawRect(SkRect::MakeWH(logicalWidth,logicalHeight),background);
    for (const auto& layer : definition.at("layers")) {
      if (!layer.at("visible").get<bool>() || layer.at("opacity").get<float>() == 0) continue;
      const auto kind = layer.at("kind").get<std::string>();
      const float x=layer.at("x").get<float>(),y=layer.at("y").get<float>(),w=layer.at("width").get<float>(),h=layer.at("height").get<float>();
      const auto box = SkRect::MakeXYWH(x,y,w,h);
      canvas->save(); canvas->clipRect(box);
      SkPaint paint; paint.setAntiAlias(true);
      if (kind != "image") paint.setColor(color(layer.at("color")));
      paint.setAlphaf(layer.at("opacity").get<float>());
      if (kind == "rectangle") canvas->drawRect(box,paint);
      else if (kind == "image") {
        const auto& image = images.at(layer.at("mediaId").get<std::string>());
        const float fit = layer.at("fit") == "cover" ? std::max(w/image->width(),h/image->height()) : std::min(w/image->width(),h/image->height());
        const float iw=image->width()*fit,ih=image->height()*fit;
        canvas->drawImageRect(image,SkRect::MakeXYWH(x+(w-iw)/2,y+(h-ih)/2,iw,ih),SkSamplingOptions(SkFilterMode::kLinear),&paint);
      } else {
        SkFont font(typeface,layer.at("fontSize").get<float>());
        SkFontMetrics metrics{}; font.getMetrics(&metrics);
        const float advance = metrics.fDescent-metrics.fAscent+metrics.fLeading;
        float baseline = y-metrics.fAscent;
        auto text = layer.at("text").get<std::string>();
        // Explicit CR/LF line breaks. Long lines and overflow are clipped to the box.
        size_t start = 0;
        while (start <= text.size() && baseline+metrics.fAscent < y+h) {
          const auto end = text.find_first_of("\r\n",start);
          const auto count = (end == std::string::npos ? text.size() : end)-start;
          canvas->drawSimpleText(text.data()+start,count,SkTextEncoding::kUTF8,x,baseline,font,paint);
          if (end == std::string::npos) break;
          start = end+1; if (text[end] == '\r' && start < text.size() && text[start] == '\n') ++start;
          baseline += advance;
        }
      }
      canvas->restore();
    }
    canvas->restore();
  }
};
