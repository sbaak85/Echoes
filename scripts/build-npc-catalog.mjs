import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { trackBootShadowAnchors } from '../app/boot-shadow-tracking.ts';

// 建置 NPC 角色目錄（MapEditor 與遊戲共用）：
//   - 自動掃描 public/characters/idle/ 底下的角色資料夾（主角的 Transparent_570x720 除外）；
//   - 資料夾對應的英文 ID 與顯示名稱寫在 public/characters/npc-roster.json；
//     資料夾名稱本身就是小寫英文 ID 時可以不寫；
//   - 每個方向讀取圖片透明度，算出腳底錨點、可見身體範圍與雙腳接地點（腳底影子用）；
//   - 另外記錄主角站立圖「可見身高／裁切框高度」的比例，讓 NPC 在 100% 時與主角一樣高，
//     並且跟著主角的 size 設定一起縮放。
// 新增角色：把 8 方向站立圖放進 characters/idle/<資料夾>/，名冊加一行，再執行
//   node scripts/build-npc-catalog.mjs
const root = new URL('../', import.meta.url);
const IDLE_DIR = 'characters/idle';
const PLAYER_FOLDER = 'Transparent_570x720';
const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

function readRgba(png, label) {
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`Invalid PNG signature: ${label}`);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (width !== 570 || height !== 720 || png[24] !== 8 || png[25] !== 6 || png[28] !== 0) {
    throw new Error(`Character art must be 570x720 non-interlaced 8-bit RGBA PNGs: ${label}`);
  }
  const parts = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = width * 4;
  if (raw.length !== height * (stride + 1)) throw new Error(`Invalid PNG scanline length: ${label}`);
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const source = y * (stride + 1), filter = raw[source];
    if (filter > 4) throw new Error(`Invalid PNG scanline filter: ${label}`);
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

// 可見身體範圍＝不透明度 ≥ 128 的外框
function bodyBounds({ data, width, height }, label) {
  let left = width, top = height, right = -1, bottom = -1, transparent = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (!alpha) transparent++;
    if (alpha < 128) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (!transparent || right < left || bottom < top) throw new Error(`Missing character or transparency: ${label}`);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function geometry(file) {
  const png = readFileSync(new URL(`public/${file}`, root));
  const image = readRgba(png, file), { data, width, height } = image;
  const body = bodyBounds(image, file), bottom = body.y + body.height - 1;
  let footX = 0, count = 0;
  for (let y = Math.max(0, bottom - 7); y <= bottom; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] >= 128) { footX += x; count++; }
  }
  // 雙腳接地點：與主角同一套演算法，座標以可見身體範圍為基準（0–1）
  const columns = [];
  for (let x = body.x; x < body.x + body.width; x++) {
    for (let y = bottom; y >= body.y; y--) {
      if (data[(y * width + x) * 4 + 3] >= 128) { columns.push({ x: x - body.x, bottomY: y - body.y }); break; }
    }
  }
  const bootAnchors = trackBootShadowAnchors(columns, body.width, body.height)
    ?.map(anchor => Object.fromEntries(Object.entries(anchor).map(([key, value]) => [key, Number(value.toFixed(4))]))) ?? null;
  return { file, width, height, anchorX: Number((footX / count).toFixed(4)), anchorY: bottom + 1,
    bodyHeight: body.height, bodyBounds: body, bootAnchors,
    sha256: createHash('sha256').update(png).digest('hex') };
}

function directionFiles(folder) {
  const files = {};
  for (const name of readdirSync(new URL(`public/${IDLE_DIR}/${folder}/`, root))) {
    const match = name.match(/^\d+_(NE|NW|SE|SW|N|E|S|W)_.*\.png$/i);
    if (!match) continue;
    const direction = match[1].toUpperCase();
    if (files[direction]) throw new Error(`「${folder}」有兩張 ${direction} 方向的圖：${files[direction]}、${name}`);
    files[direction] = name;
  }
  const missing = DIRECTIONS.filter(direction => !files[direction]);
  if (missing.length) throw new Error(`「${folder}」缺少方向：${missing.join('、')}（檔名格式如 05_S_Front.png）`);
  return files;
}

// 主角的身高基準：遊戲把主角裁切框高度縮放成 size，可見身體只佔裁切框的一部分
function playerReference() {
  const config = readFileSync(new URL('app/player-visual-config.ts', root), 'utf8');
  const size = Number(config.match(/\bsize:\s*(\d+(?:\.\d+)?)/)?.[1]);
  if (!(size > 0)) throw new Error('Cannot read player size from app/player-visual-config.ts');
  const idle = JSON.parse(readFileSync(new URL('app/player-idle-assets.json', root), 'utf8'));
  const bodyRatio = {};
  for (const direction of DIRECTIONS) {
    const asset = idle[direction];
    const file = asset.source.replace(/^\.\//, '');
    const body = bodyBounds(readRgba(readFileSync(new URL(`public/${file}`, root)), file), file);
    bodyRatio[direction] = Number((body.height / asset.crop.height).toFixed(5));
  }
  return { size, bodyRatio };
}

const roster = JSON.parse(readFileSync(new URL(`public/characters/npc-roster.json`, root), 'utf8'));
if (roster.version !== 1 || !Array.isArray(roster.characters)) throw new Error('npc-roster.json 格式錯誤');
const folders = readdirSync(new URL(`public/${IDLE_DIR}/`, root))
  .filter(name => name !== PLAYER_FOLDER && statSync(new URL(`public/${IDLE_DIR}/${name}`, root)).isDirectory());
for (const entry of roster.characters) {
  if (!folders.includes(entry.folder)) throw new Error(`名冊裡的「${entry.folder}」在 ${IDLE_DIR}/ 找不到資料夾`);
}
const characters = folders.map(folder => {
  const entry = roster.characters.find(item => item.folder === folder);
  const id = entry?.id ?? folder, name = entry?.name ?? folder;
  if (!ID_PATTERN.test(id)) {
    throw new Error(`角色資料夾「${folder}」需要英文 ID：請在 public/characters/npc-roster.json 加上 { "folder": "${folder}", "id": "英文小寫ID", "name": "${folder}" }`);
  }
  const files = directionFiles(folder);
  return { id, name, folder, sprites: Object.fromEntries(DIRECTIONS.map(direction =>
    [direction, geometry(`${IDLE_DIR}/${folder}/${files[direction]}`)])) };
});
const duplicate = characters.find((character, index) => characters.findIndex(other => other.id === character.id) !== index);
if (duplicate) throw new Error(`角色 ID 重複：${duplicate.id}`);
// 依名冊順序排列，名冊外的角色接在後面
const order = id => { const index = roster.characters.findIndex(item => item.id === id); return index < 0 ? Infinity : index; };
characters.sort((a, b) => order(a.id) - order(b.id) || a.id.localeCompare(b.id));

const reference = playerReference();
const catalog = { version: 2, defaultHeight: reference.size, reference, characters };
writeFileSync(new URL('public/characters/npc-catalog.json', root), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Built ${characters.length} NPCs / ${characters.length * DIRECTIONS.length} sprites (${characters.map(c => `${c.name}=${c.id}`).join(', ')}).`);
