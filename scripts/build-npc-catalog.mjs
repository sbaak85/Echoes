import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// The four approved sprite sets are 8-bit, non-interlaced RGBA PNGs.
// Read their alpha offline so editor and browser share identical foot anchors.
const root = new URL('../', import.meta.url);
const characters = [['captain', '艦長'], ['ian', '伊恩'], ['rena', '蕾娜'], ['owen', '歐文']];
const files = {
  N: '01_N_Back.png', NE: '02_NE_BackRight.png', E: '03_E_Right.png',
  SE: '04_SE_FrontRight.png', S: '05_S_Front.png', SW: '06_SW_FrontLeft.png',
  W: '07_W_Left.png', NW: '08_NW_BackLeft.png',
};

function readRgba(png) {
  if (!png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid PNG signature');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (width !== 570 || height !== 720 || png[24] !== 8 || png[25] !== 6 || png[28] !== 0) {
    throw new Error('NPC assets must be 570x720 non-interlaced 8-bit RGBA PNGs');
  }
  const parts = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = width * 4;
  if (raw.length !== height * (stride + 1)) throw new Error('Invalid PNG scanline length');
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const source = y * (stride + 1), filter = raw[source];
    if (filter > 4) throw new Error('Invalid PNG scanline filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= 4 ? data[i - 4] : 0;
      const b = y ? data[i - stride] : 0, c = y && x >= 4 ? data[i - stride - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b :
        filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      data[i] = (raw[source + 1 + x] + predictor) & 255;
    }
  }
  return { data, width, height };
}

function geometry(file) {
  const png = readFileSync(new URL(`public/${file}`, root));
  const { data, width, height } = readRgba(png);
  let left = width, top = height, right = -1, bottom = -1, transparent = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (!alpha) transparent++;
    if (alpha < 128) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (!transparent || right < left || bottom < top) throw new Error(`Missing character or transparency: ${file}`);
  let footX = 0, count = 0;
  for (let y = Math.max(0, bottom - 7); y <= bottom; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] >= 128) { footX += x; count++; }
  }
  return { file, width, height, anchorX: Number((footX / count).toFixed(4)), anchorY: bottom + 1,
    bodyHeight: bottom - top + 1,
    bodyBounds: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 },
    sha256: createHash('sha256').update(png).digest('hex') };
}

const catalog = { version: 1, defaultHeight: 152, characters: characters.map(([id, name]) => ({
  id, name, sprites: Object.fromEntries(Object.entries(files).map(([direction, nameOfFile]) =>
    [direction, geometry(`characters/idle/${name}/${nameOfFile}`)])),
})) };
writeFileSync(new URL('public/characters/npc-catalog.json', root), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Built ${catalog.characters.length} NPCs / 32 sprites with validated alpha and foot anchors.`);
