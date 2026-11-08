// Draws the app icon as 32x32 pixel art and saves build/icon.png at 512x512.
// electron-builder turns this PNG into the Windows .ico for the app and installer.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const N = 32, SCALE = 16;
const px = Array.from({ length: N * N }, () => null);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < N && j < N) px[j * N + i] = hex(c); };

// rounded badge: wood frame, sky and grass
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const cx = Math.min(x, N - 1 - x), cy = Math.min(y, N - 1 - y);
  if (cx + cy < 3) continue; // cut corners
  px[y * N + x] = hex('#3e220f');
}
rect(2, 2, 28, 20, '#8fd3f4');
rect(2, 2, 28, 6, '#a8e0f8');
rect(2, 22, 28, 8, '#79c465');
rect(2, 22, 28, 1, '#58a54a');
for (const [x, y] of [[5, 25], [9, 27], [24, 26], [27, 24], [20, 28]]) rect(x, y, 1, 1, '#9ad87e');
// cloud
rect(5, 6, 6, 2, '#ffffff'); rect(6, 5, 3, 1, '#ffffff');
// building: walls, door, windows
rect(8, 15, 16, 9, '#f4ead4'); rect(8, 15, 16, 1, '#d8c8a8'); rect(23, 15, 1, 9, '#d8c8a8');
rect(14, 18, 4, 6, '#8a5a30'); rect(15, 19, 2, 2, '#a87040'); rect(17, 21, 1, 1, '#f0d060');
rect(10, 17, 3, 3, '#5a3a22'); rect(10, 17, 3, 3, '#9fd6f6'); rect(10, 17, 1, 1, '#ffffff');
rect(19, 17, 3, 3, '#9fd6f6'); rect(19, 17, 1, 1, '#ffffff');
rect(8, 24, 16, 1, '#9a8a74');
// roof
const roof = [[14, 18], [13, 19], [12, 20], [11, 21], [10, 22], [9, 23]];
roof.forEach(([a, b], i) => rect(a, 9 + i, b - a + 1, 1, i % 2 ? '#c04a3c' : '#d05a48'));
rect(7, 15, 18, 1, '#a03a30'); rect(14, 9, 5, 1, '#ea8a72');
// sign
rect(13, 13, 6, 2, '#f8f0d8'); rect(14, 13, 4, 1, '#c8a060');
// gold coin
rect(23, 3, 5, 1, '#b07a10'); rect(22, 4, 7, 5, '#b07a10'); rect(23, 9, 5, 1, '#b07a10');
rect(23, 4, 5, 5, '#f0c030'); rect(23, 4, 2, 2, '#fff6b0'); rect(25, 5, 1, 3, '#b07a10');
// little character in front
rect(26, 20, 3, 2, '#d84040'); rect(26, 22, 3, 2, '#f8d0a8'); rect(26, 22, 1, 1, '#1c1c28'); rect(28, 22, 1, 1, '#1c1c28');
rect(26, 24, 3, 3, '#3070c8'); rect(26, 27, 1, 1, '#2a2a2a'); rect(28, 27, 1, 1, '#2a2a2a');

// scale up and encode PNG
const W = N * SCALE;
const raw = Buffer.alloc((W * 4 + 1) * W);
for (let y = 0; y < W; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const c = px[Math.floor(y / SCALE) * N + Math.floor(x / SCALE)] || [0, 0, 0, 0];
    c.forEach((v, k) => { raw[y * (W * 4 + 1) + 1 + x * 4 + k] = v; });
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('icon written:', out, png.length, 'bytes');
