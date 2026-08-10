/**
 * Generates the PWA icon set into public/icons/.
 *
 * Written as a tiny software rasterizer + PNG encoder rather than pulling in
 * sharp/canvas: SPEC §0 rule 1 says every dependency has to earn its place,
 * and an image toolchain that exists only to draw one speech bubble does not.
 * Outputs are committed, so this runs on demand (`npm run icons`), not in CI.
 *
 * Usage: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BRAND = [15, 118, 110, 255]; // teal-700
const INK = [250, 250, 249, 255]; // stone-50
const TRANSPARENT = [0, 0, 0, 0];

// ---------------------------------------------------------------- png encoding

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** @param {Uint8Array} rgba row-major RGBA, `size * size * 4` bytes */
const encodePng = (rgba, size) => {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// -------------------------------------------------------------------- geometry

const inRoundedRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const inTriangle = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = sign(x, y, ax, ay, bx, by);
  const d2 = sign(x, y, bx, by, cx, cy);
  const d3 = sign(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

// ----------------------------------------------------------------------- paint

/**
 * A speech bubble with three dots: "someone is about to say something in a
 * language you are learning". Reads at 48px, which is the size that matters.
 *
 * @param {number} size
 * @param {{ bgRadius: number, contentScale: number }} opts
 */
const paint = (size, { bgRadius, contentScale }) => {
  const SS = 4; // 4x4 supersampling — cheap, and these render once
  const rgba = new Uint8Array(size * size * 4);

  const bubbleW = size * contentScale;
  const bubbleH = bubbleW * 0.76;
  const cx = size / 2;
  const cy = size / 2 - size * 0.035;
  const bx0 = cx - bubbleW / 2;
  const bx1 = cx + bubbleW / 2;
  const by0 = cy - bubbleH / 2;
  const by1 = cy + bubbleH / 2;
  const tail = [
    [cx - bubbleW * 0.26, by1 - 1],
    [cx - bubbleW * 0.02, by1 - 1],
    [cx - bubbleW * 0.3, by1 + bubbleH * 0.42],
  ];
  const dotR = bubbleH * 0.105;
  const dots = [-1, 0, 1].map((i) => [cx + i * bubbleW * 0.23, cy]);

  const colorAt = (x, y) => {
    for (const [dx, dy] of dots) if (inCircle(x, y, dx, dy, dotR)) return BRAND;
    if (inRoundedRect(x, y, bx0, by0, bx1, by1, bubbleH * 0.3)) return INK;
    if (inTriangle(x, y, ...tail)) return INK;
    if (bgRadius === 0 || inRoundedRect(x, y, 0, 0, size - 1, size - 1, bgRadius)) return BRAND;
    return TRANSPARENT;
  };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS);
          const alpha = c[3] / 255;
          r += c[0] * alpha;
          g += c[1] * alpha;
          b += c[2] * alpha;
          a += c[3];
        }
      }
      const samples = SS * SS;
      const coverage = a / samples / 255;
      const offset = (py * size + px) * 4;
      // Un-premultiply so edge pixels keep the shape's colour, not a dark halo.
      rgba[offset] = coverage > 0 ? Math.round(r / samples / coverage) : 0;
      rgba[offset + 1] = coverage > 0 ? Math.round(g / samples / coverage) : 0;
      rgba[offset + 2] = coverage > 0 ? Math.round(b / samples / coverage) : 0;
      rgba[offset + 3] = Math.round(a / samples);
    }
  }
  return encodePng(rgba, size);
};

// ------------------------------------------------------------------------ main

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="LinguaKu">
  <rect width="512" height="512" rx="113" fill="#0f766e"/>
  <path d="M113 158a29 29 0 0 1 29-29h228a29 29 0 0 1 29 29v106a29 29 0 0 1-29 29H231l-53 62v-62h-36a29 29 0 0 1-29-29z" fill="#fafaf9"/>
  <g fill="#0f766e">
    <circle cx="190" cy="211" r="21"/><circle cx="256" cy="211" r="21"/><circle cx="322" cy="211" r="21"/>
  </g>
</svg>
`;

mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
  ['icon-192.png', paint(192, { bgRadius: 192 * 0.22, contentScale: 0.58 })],
  ['icon-512.png', paint(512, { bgRadius: 512 * 0.22, contentScale: 0.58 })],
  // Maskable: full bleed, content inside the 80% safe zone.
  ['icon-maskable-512.png', paint(512, { bgRadius: 0, contentScale: 0.44 })],
  ['apple-touch-icon.png', paint(180, { bgRadius: 0, contentScale: 0.58 })],
  ['favicon.svg', Buffer.from(FAVICON_SVG, 'utf8')],
];

for (const [name, buffer] of outputs) {
  writeFileSync(join(OUT_DIR, name), buffer);
  console.log(`${name.padEnd(24)} ${(buffer.length / 1024).toFixed(1)} KB`);
}
