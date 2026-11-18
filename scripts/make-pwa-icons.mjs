/** Deterministic code-native PNG icons from the 8x8 pixel-art favicon (no image tools, no network). Run: node scripts/make-pwa-icons.mjs */
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
const BG = [0x2f, 0x6f, 0x73], HEAD = [0xf6, 0xd3, 0xb3], BODY = [0xd9, 0x77, 0x4f];
const art = (x, y) => (x >= 2 && x < 6 && y >= 1 && y < 4 ? HEAD : x >= 1 && x < 7 && y >= 4 && y < 8 ? BODY : null);
function png(size, scale) {
  const cell = Math.floor((size * scale) / 8), art0 = Math.floor((size - cell * 8) / 2), raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - art0) / cell), gy = Math.floor((y - art0) / cell), c = (gx >= 0 && gy >= 0 && gx < 8 && gy < 8 ? art(gx, gy) : null) ?? BG, o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0); return Buffer.concat([len, t, data, crc]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync('public/icons', { recursive: true });
// "any" icons fill the canvas; the maskable icon keeps the art inside the central safe zone (80% circle) with full-bleed background.
for (const [name, size, scale] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, 0.6], ['apple-touch-icon.png', 180, 1]]) writeFileSync(`public/icons/${name}`, png(size, scale));
console.log('wrote public/icons');
