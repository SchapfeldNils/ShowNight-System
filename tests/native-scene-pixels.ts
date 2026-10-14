import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; ++bit)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const header = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, checksum]);
}
export function scenePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; ++y)
    for (let x = 0; x < width; ++x)
      rows.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Decode the actual native Skia PNG, including all five PNG row filters. Tests
// inspect native output pixels, rather than comparing a browser approximation.
export function scenePixels(png: Buffer) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let width = 0,
    height = 0,
    channels = 0;
  const compressed: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at),
      type = png.toString("ascii", at + 4, at + 8),
      data = png.subarray(at + 8, at + 8 + length);
    assert.equal(
      png.readUInt32BE(at + 8 + length),
      crc32(png.subarray(at + 4, at + 8 + length)),
    );
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      assert.equal(data[12], 0);
      assert.ok(data[9] === 2 || data[9] === 6);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === "IDAT") compressed.push(data);
    at += length + 12;
  }
  const source = inflateSync(Buffer.concat(compressed)),
    stride = width * channels;
  assert.equal(source.length, (stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; ++y) {
    const filter = source[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; ++x) {
      const at = y * stride + x,
        left = x >= channels ? pixels[at - channels] : 0,
        above = y ? pixels[at - stride] : 0,
        upperLeft = y && x >= channels ? pixels[at - stride - channels] : 0;
      const delta =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paeth(left, above, upperLeft);
      pixels[at] = (source[y * (stride + 1) + 1 + x] + delta) & 255;
    }
  }
  return {
    width,
    height,
    at(x: number, y: number) {
      assert.ok(x >= 0 && x < width && y >= 0 && y < height);
      const at = (y * width + x) * channels;
      return [
        pixels[at],
        pixels[at + 1],
        pixels[at + 2],
        channels === 4 ? pixels[at + 3] : 255,
      ];
    },
  };
}
