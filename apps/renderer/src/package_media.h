#pragma once
#include <wincodec.h>
#include <wrl/client.h>

// Only UUID-derived children of the controller's private session directory.
// Keep a no-write/no-delete shared handle for the entire scene lifetime.
class ReadLock {
  HANDLE handle = INVALID_HANDLE_VALUE;
public:
  explicit ReadLock(const fs::path& path) {
    handle = CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,
      FILE_ATTRIBUTE_NORMAL|FILE_FLAG_OPEN_REPARSE_POINT,nullptr);
    if (handle == INVALID_HANDLE_VALUE) throw std::runtime_error("MEDIA");
  }
  ~ReadLock() { if (handle != INVALID_HANDLE_VALUE) CloseHandle(handle); }
  ReadLock(const ReadLock&) = delete;
  HANDLE get() const { return handle; }
};
std::vector<unsigned char> readVerified(ReadLock& file,uint64_t expectedSize,const std::string& expectedSha) {
  BY_HANDLE_FILE_INFORMATION info{};
  LARGE_INTEGER length{};
  if (!GetFileInformationByHandle(file.get(),&info) ||
      (info.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT)) ||
      !GetFileSizeEx(file.get(),&length) || length.QuadPart < 0 ||
      static_cast<uint64_t>(length.QuadPart) != expectedSize)
    throw std::runtime_error("MEDIA");
  std::vector<unsigned char> bytes(static_cast<size_t>(expectedSize));
  size_t offset = 0;
  while (offset < bytes.size()) {
    DWORD n = 0;
    if (!ReadFile(file.get(),bytes.data()+offset,
        static_cast<DWORD>(std::min<size_t>(65536,bytes.size()-offset)),&n,nullptr) || !n)
      throw std::runtime_error("MEDIA");
    offset += n;
  }
  auto checksum = g_checksum_new(G_CHECKSUM_SHA256);
  if (!checksum) throw std::runtime_error("MEDIA");
  g_checksum_update(checksum,bytes.data(),bytes.size());
  const std::string digest = g_checksum_get_string(checksum);
  g_checksum_free(checksum);
  if (digest != expectedSha) throw std::runtime_error("MEDIA");
  return bytes;
}
class PackageInput {
public:
  static fs::path inputPath(const fs::path& folder,const json& media) {
    exact(media,{"inputId","packageId","mediaId","manifestSha256","sha256","mime","sizeBytes"});
    static const std::regex sha("^[0-9a-f]{64}$");
    if (!identifier(media.at("inputId")) || !identifier(media.at("packageId")) ||
        !identifier(media.at("mediaId")) || !media.at("sha256").is_string() ||
        !media.at("manifestSha256").is_string() ||
        !std::regex_match(media.at("sha256").get<std::string>(),sha) ||
        !std::regex_match(media.at("manifestSha256").get<std::string>(),sha) ||
        !media.at("sizeBytes").is_number_unsigned() ||
        media.at("sizeBytes").get<uint64_t>() == 0 ||
        media.at("sizeBytes").get<uint64_t>() > 32*1024*1024)
      throw std::runtime_error("INVALID");
    const std::string mime = media.at("mime");
    if (mime != "image/png" && mime != "image/jpeg" && mime != "video/webm") throw std::runtime_error("INVALID");
    return folder/("input-"+media.at("inputId").get<std::string>()+(mime == "image/png" ? ".png" : mime == "image/jpeg" ? ".jpg" : ".webm"));
  }
public:
  json media;
  fs::path path;
  ReadLock file;
  std::vector<unsigned char> bytes;
  PackageInput(const fs::path& folder,const json& descriptor)
    :media(descriptor),path(inputPath(folder,descriptor)),file(path) {
    bytes = readVerified(file,media.at("sizeBytes").get<uint64_t>(),media.at("sha256").get<std::string>());
    const unsigned char png[] = {137,80,78,71,13,10,26,10};
    const unsigned char webm[] = {26,69,223,163};
    if (media.at("mime") == "image/png") {
      if (bytes.size() < 33 || memcmp(bytes.data(),png,8) ||
          bytes[8] || bytes[9] || bytes[10] || bytes[11] != 13 ||
          memcmp(bytes.data()+12,"IHDR",4)) throw std::runtime_error("MEDIA");
      auto big32 = [&](size_t n) { return (uint32_t(bytes[n])<<24)|(uint32_t(bytes[n+1])<<16)|
        (uint32_t(bytes[n+2])<<8)|uint32_t(bytes[n+3]); };
      uint32_t w = big32(16),h = big32(20);
      if (!w || !h || w > 4096 || h > 4096 || uint64_t(w)*h > 16777216)
        throw std::runtime_error("MEDIA");
    } else if (media.at("mime") == "image/jpeg") {
      if (bytes.size() < 4 || bytes[0] != 0xff || bytes[1] != 0xd8 || bytes[2] != 0xff)
        throw std::runtime_error("MEDIA");
    } else {
      if (bytes.size() < 4 || memcmp(bytes.data(),webm,4)) throw std::runtime_error("MEDIA");
      bytes.clear(); bytes.shrink_to_fit();
    }
  }
  sk_sp<SkImage> decodeImage(uint64_t& remainingPixels) {
    if (media.at("mime") != "image/png" && media.at("mime") != "image/jpeg") throw std::runtime_error("MEDIA");
    struct Apartment {
      HRESULT hr = CoInitializeEx(nullptr,COINIT_MULTITHREADED);
      ~Apartment() { if (SUCCEEDED(hr)) CoUninitialize(); }
    } apartment;
    if (FAILED(apartment.hr) && apartment.hr != RPC_E_CHANGED_MODE) throw std::runtime_error("MEDIA");
    using Microsoft::WRL::ComPtr;
    auto check = [](HRESULT hr) { if (FAILED(hr)) throw std::runtime_error("MEDIA"); };
    ComPtr<IWICImagingFactory> factory;
    check(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)));
    ComPtr<IWICStream> stream;
    check(factory->CreateStream(&stream));
    check(stream->InitializeFromMemory(bytes.data(),static_cast<DWORD>(bytes.size())));
    // Instantiate the Windows PNG/JPEG decoder explicitly; no generic codec/plugin
    // selection and no filename/URI passed to a decoder.
    ComPtr<IWICBitmapDecoder> decoder;
    check(factory->CreateDecoder(media.at("mime") == "image/png" ? GUID_ContainerFormatPng : GUID_ContainerFormatJpeg,&GUID_VendorMicrosoft,&decoder));
    check(decoder->Initialize(stream.Get(),WICDecodeMetadataCacheOnDemand));
    UINT count = 0;
    check(decoder->GetFrameCount(&count));
    if (count != 1) throw std::runtime_error("MEDIA");
    ComPtr<IWICBitmapFrameDecode> frame;
    check(decoder->GetFrame(0,&frame));
    UINT w = 0,h = 0;
    check(frame->GetSize(&w,&h));
    const uint64_t pixelCount = uint64_t(w)*h;
    if (!w || !h || w > 4096 || h > 4096 || pixelCount > remainingPixels || pixelCount > 16777216) throw std::runtime_error("MEDIA");
    // Check the complete remaining scene budget before any decoded pixel allocation.
    remainingPixels -= pixelCount;
    ComPtr<IWICFormatConverter> converter;
    check(factory->CreateFormatConverter(&converter));
    check(converter->Initialize(frame.Get(),GUID_WICPixelFormat32bppPBGRA,WICBitmapDitherTypeNone,
      nullptr,0,WICBitmapPaletteTypeCustom));
    auto pixels = SkData::MakeUninitialized(static_cast<size_t>(pixelCount)*4);
    if (!pixels) throw std::runtime_error("MEDIA");
    check(converter->CopyPixels(nullptr,w*4,static_cast<UINT>(pixels->size()),static_cast<BYTE*>(pixels->writable_data())));
    return SkImages::RasterFromData(SkImageInfo::Make(w,h,kBGRA_8888_SkColorType,kPremul_SkAlphaType),
      std::move(pixels),w*4);
  }
};
