// PNG read and write for a mini-pylon snapshot: 8-bit RGB out, and 8-bit
// RGB or RGBA in. No other image tool.
import { deflateSync, inflateSync, crc32 } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const head = Buffer.from(type);
  const body = Buffer.concat([head, data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
  return out;
}

// Throws `not a PNG` unless the buffer starts with the signature and an IHDR.
export function pngSize(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const length = bytes.readUInt32BE(8);
  const type = bytes.subarray(12, 16).toString('ascii');
  if (type !== 'IHDR' || length < 8) throw new Error('not a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// Filter 0 on every row. Throws, naming the size, when rgb is not width × height × 3 bytes.
export function encodePng(width, height, rgb) {
  const bytes = Buffer.isBuffer(rgb) ? rgb : Buffer.from(rgb);
  const need = width * height * 3;
  if (bytes.length !== need) throw new Error(`rgb is ${bytes.length} bytes, not ${width}×${height}×3`);
  const stride = width * 3;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0;
    bytes.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// 8-bit RGB (type 2) or RGBA (type 6), not interlaced. Anything else throws,
// naming the depth and type. pixels is width × height × channels bytes.
export function decodePng(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('PNG depth unknown type unknown is not 8-bit RGB or RGBA');
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  let sawHeader = false;
  const idat = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (offset + 12 + length > bytes.length) throw new Error('PNG depth unknown type unknown is not 8-bit RGB or RGBA');
    const kind = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (kind === 'IHDR') {
      sawHeader = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
  }
  const channels = type === 2 ? 3 : type === 6 ? 4 : 0;
  if (!sawHeader || depth !== 8 || channels === 0 || interlace !== 0) {
    throw new Error(`PNG depth ${depth} type ${type} is not 8-bit RGB or RGBA`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let src = 0;
  let above = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const recon = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? recon[x - channels] : 0;
      const up = above[x];
      const upLeft = x >= channels ? above[x - channels] : 0;
      const sample = raw[src++];
      let value;
      if (filter === 0) value = sample;
      else if (filter === 1) value = sample + left;
      else if (filter === 2) value = sample + up;
      else if (filter === 3) value = sample + Math.floor((left + up) / 2);
      else if (filter === 4) value = sample + paeth(left, up, upLeft);
      else throw new Error(`PNG depth ${depth} type ${type} is not 8-bit RGB or RGBA`);
      recon[x] = value & 0xff;
    }
    recon.copy(pixels, y * stride);
    above = recon;
  }
  return { width, height, channels, pixels };
}
