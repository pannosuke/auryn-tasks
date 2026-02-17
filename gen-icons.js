/**
 * Generates minimal valid PNG icons for the PWA.
 * Creates solid purple square PNGs without external dependencies.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function makePNG(size) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: width, height, bit depth 8, color type 2 (RGB), etc.
  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    // CRC over type + data
    const crcBuf = Buffer.concat([typeBytes, data]);
    const crc = crc32(crcBuf);
    const crcBytes = Buffer.alloc(4);
    crcBytes.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBytes, data, crcBytes]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data: each row = filter byte (0) + RGB pixels
  // Purple: #7c3aed = 124, 58, 237
  const R = 0x7c, G = 0x3a, B = 0xed;
  const rowSize = 1 + size * 3;
  const raw = Buffer.alloc(size * rowSize);
  for (let y = 0; y < size; y++) {
    const off = y * rowSize;
    raw[off] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      raw[off + 1 + x * 3 + 0] = R;
      raw[off + 1 + x * 3 + 1] = G;
      raw[off + 1 + x * 3 + 2] = B;
    }
  }

  const compressed = zlib.deflateSync(raw);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, iend]);
}

// CRC32 table
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const publicDir = path.join(__dirname, 'public');
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), makePNG(192));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), makePNG(512));
console.log('Icons generated: icon-192.png and icon-512.png');
