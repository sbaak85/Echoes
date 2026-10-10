// 世界掉落道具的刻印符號（以 item-database.ts 的 englishName 為鍵）。
// 由 output/item-icon-preview/glyphs.js 定稿後移入。
// 座標：單位方格 −1..1，y 向下，圖形主軸朝上；每個函式只建立路徑（不 beginPath、不描邊）。
const GTAU = Math.PI * 2;
const G = {
  circle(g, x, y, r) { g.moveTo(x + r, y); g.arc(x, y, r, 0, GTAU); },
  line(g, x1, y1, x2, y2) { g.moveTo(x1, y1); g.lineTo(x2, y2); },
  poly(g, pts, closed = true) { pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); if (closed) g.closePath(); },
  rrect(g, x, y, w, h, r) { g.moveTo(x + r, y); g.roundRect(x, y, w, h, r); },
  ellipse(g, x, y, rx, ry, rot = 0) { g.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); g.ellipse(x, y, rx, ry, rot, 0, GTAU); },
  regular(g, n, r, rot = 0, cx = 0, cy = 0) { G.poly(g, Array.from({ length: n }, (_, i) => { const a = rot + i * GTAU / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; })); },
  star4(g, x, y, r) { G.poly(g, [[x, y - r], [x + r * 0.25, y - r * 0.25], [x + r, y], [x + r * 0.25, y + r * 0.25], [x, y + r], [x - r * 0.25, y + r * 0.25], [x - r, y], [x - r * 0.25, y - r * 0.25]]); },
  wave(g, x1, x2, y, amp, waves = 2) {
    const steps = 24; g.moveTo(x1, y);
    for (let i = 1; i <= steps; i++) { const t = i / steps; g.lineTo(x1 + (x2 - x1) * t, y + Math.sin(t * waves * GTAU) * amp); }
  },
  steam(g, xs, y0, y1) { for (const x of xs) { g.moveTo(x, y0); g.bezierCurveTo(x - 0.12, y0 - (y0 - y1) * 0.35, x + 0.12, y0 - (y0 - y1) * 0.65, x, y1); } },
  bowl(g, y = -0.05) { g.moveTo(-0.85, y); g.lineTo(0.85, y); g.quadraticCurveTo(0.8, 0.75, 0, 0.8); g.quadraticCurveTo(-0.8, 0.75, -0.85, y); G.line(g, -0.3, 0.92, 0.3, 0.92); },
  egg(g, s = 1, cy = 0) { g.moveTo(0, cy - 0.9 * s); g.bezierCurveTo(0.65 * s, cy - 0.9 * s, 0.75 * s, cy + 0.85 * s, 0, cy + 0.88 * s); g.bezierCurveTo(-0.75 * s, cy + 0.85 * s, -0.65 * s, cy - 0.9 * s, 0, cy - 0.9 * s); },
  mushroom(g, s = 1, cx = 0, cy = 0) {
    g.moveTo(cx - 0.85 * s, cy); g.quadraticCurveTo(cx, cy - 1.1 * s, cx + 0.85 * s, cy); g.closePath();
    G.rrect(g, cx - 0.22 * s, cy, 0.44 * s, 0.85 * s, 0.12 * s);
  },
  bolt(g, s = 1, cx = 0, cy = 0) { G.poly(g, [[0.1, -0.55], [-0.25, 0.05], [0, 0.05], [-0.1, 0.55], [0.25, -0.1], [0, -0.1]].map(([x, y]) => [cx + x * s, cy + y * s])); },
  backpack(g) {
    G.rrect(g, -0.6, -0.6, 1.2, 1.5, 0.25);
    g.moveTo(-0.25, -0.6); g.quadraticCurveTo(-0.25, -0.92, 0, -0.92); g.quadraticCurveTo(0.25, -0.92, 0.25, -0.6);
    G.rrect(g, -0.35, 0.2, 0.7, 0.45, 0.08);
  },
  drop(g, s = 1, cx = 0, cy = 0) { g.moveTo(cx, cy - 0.5 * s); g.bezierCurveTo(cx + 0.35 * s, cy - 0.05 * s, cx + 0.28 * s, cy + 0.35 * s, cx, cy + 0.35 * s); g.bezierCurveTo(cx - 0.28 * s, cy + 0.35 * s, cx - 0.35 * s, cy - 0.05 * s, cx, cy - 0.5 * s); },
};

export const ITEM_GLYPHS = {
  // ---------- 資源素材 ----------
  "crystal-shard": (g) => { G.poly(g, [[0, -1], [0.55, -0.35], [0.35, 0.9], [-0.35, 0.9], [-0.55, -0.35]]); G.line(g, -0.55, -0.35, 0.55, -0.35); G.poly(g, [[0, -1], [-0.15, -0.35], [0, 0.9]], false); G.poly(g, [[0, -1], [0.15, -0.35], [0, 0.9]], false); },
  "metal-parts": (g) => { G.regular(g, 6, 0.85, Math.PI / 6); G.circle(g, 0, 0, 0.36); },
  "fiber-bundle": (g) => { for (const k of [-0.35, 0, 0.35]) { g.moveTo(k - 0.1, -0.9); g.quadraticCurveTo(k + 0.25, 0, k - 0.05, 0.9); } G.rrect(g, -0.55, -0.12, 1.1, 0.24, 0.08); },
  "battery": (g) => { G.rrect(g, -0.45, -0.8, 0.9, 1.65, 0.1); G.rrect(g, -0.18, -0.95, 0.36, 0.15, 0.04); G.line(g, 0, -0.4, 0, 0); G.line(g, -0.2, -0.2, 0.2, -0.2); G.line(g, -0.2, 0.45, 0.2, 0.45); },
  "energy-cell": (g) => { G.regular(g, 6, 0.88, 0); G.bolt(g, 1.1); },
  "metal-scrap": (g) => { G.poly(g, [[-0.8, 0.4], [-0.3, -0.65], [0, 0.2]]); G.poly(g, [[0.05, 0.75], [0.3, -0.25], [0.82, 0.5]]); G.poly(g, [[-0.25, 0.55], [0.05, 0.35], [-0.08, 0.9]]); },
  "synthetic-cloth": (g) => { g.moveTo(-0.85, -0.45); g.quadraticCurveTo(-0.4, -0.65, 0, -0.45); g.quadraticCurveTo(0.4, -0.25, 0.85, -0.45); g.lineTo(0.85, 0.5); g.quadraticCurveTo(0.4, 0.7, 0, 0.5); g.quadraticCurveTo(-0.4, 0.3, -0.85, 0.5); g.closePath(); g.moveTo(-0.85, 0.02); g.quadraticCurveTo(-0.4, -0.18, 0, 0.02); g.quadraticCurveTo(0.4, 0.22, 0.85, 0.02); },
  "transistor": (g) => { g.moveTo(-0.55, 0.15); g.lineTo(-0.55, 0); g.arc(0, 0, 0.55, Math.PI, 0); g.lineTo(0.55, 0.15); g.closePath(); for (const x of [-0.3, 0, 0.3]) G.line(g, x, 0.15, x, 0.95); },
  "adhesive-rubber": (g) => {
    // 一團黏膠被左右拉開：兩端膠團、中間拉長變細的黏絲、往下滴的一滴
    g.moveTo(-0.3, -0.12); g.bezierCurveTo(-0.55, -0.45, -0.92, -0.3, -0.88, 0.08);
    g.bezierCurveTo(-0.85, 0.45, -0.5, 0.52, -0.3, 0.3);
    g.quadraticCurveTo(0, 0.12, 0.3, 0.2);
    g.bezierCurveTo(0.5, 0.42, 0.9, 0.3, 0.88, -0.08);
    g.bezierCurveTo(0.85, -0.45, 0.5, -0.5, 0.3, -0.25);
    g.quadraticCurveTo(0, -0.02, -0.3, -0.12);
    g.closePath();
    G.drop(g, 0.38, 0, 0.62);
  },
  "toughened-vine-bark": (g) => { for (const o of [-0.18, 0.18]) { g.moveTo(-0.25 + o, -0.95); g.quadraticCurveTo(0.45 + o, -0.3, -0.05 + o, 0.2); g.quadraticCurveTo(-0.5 + o, 0.6, 0.2 + o, 0.95); } g.moveTo(0.3, -0.25); g.quadraticCurveTo(0.75, -0.45, 0.8, -0.05); g.quadraticCurveTo(0.5, 0.05, 0.3, -0.25); },
  "luminescent-sac": (g) => {
    // 頂端開口的囊體，光點從開口往上溢出
    g.moveTo(-0.26, -0.48); g.bezierCurveTo(-0.82, -0.25, -0.78, 0.72, 0, 0.92); g.bezierCurveTo(0.78, 0.72, 0.82, -0.25, 0.26, -0.48);
    G.ellipse(g, 0, -0.5, 0.26, 0.08);
    g.moveTo(-0.12, -0.42); g.quadraticCurveTo(-0.45, 0.2, -0.22, 0.82);
    g.moveTo(0.12, -0.42); g.quadraticCurveTo(0.45, 0.2, 0.22, 0.82);
    for (const [x, y, r] of [[0, -0.72, 0.06], [-0.18, -0.85, 0.05], [0.2, -0.88, 0.055], [0.02, -1.0, 0.045], [-0.38, -0.98, 0.035], [0.4, -1.02, 0.035]]) G.circle(g, x, y, r);
  },
  "phase-conductor": (g) => { G.rrect(g, -0.2, -0.95, 0.4, 1.9, 0.1); G.wave(g, -0.9, 0.9, -0.3, 0.18, 1.5); G.wave(g, -0.9, 0.9, 0.3, -0.18, 1.5); },
  "heat-fused-ceramic-shard": (g) => { G.poly(g, [[-0.75, 0.65], [-0.45, -0.55], [0.5, -0.45], [0.78, 0.6]]); for (const x of [-0.3, 0, 0.3]) { g.moveTo(x, 0.35); g.quadraticCurveTo(x + 0.12, 0.15, x, -0.05); g.quadraticCurveTo(x - 0.12, -0.2, x, -0.3); } },
  "plain-grass-stem": (g) => { g.moveTo(0, 0.95); g.quadraticCurveTo(-0.1, 0, -0.5, -0.85); g.moveTo(0, 0.95); g.lineTo(0.02, -0.95); g.moveTo(0, 0.95); g.quadraticCurveTo(0.15, 0, 0.5, -0.75); G.line(g, -0.22, -0.2, -0.05, -0.25); G.line(g, 0.02, -0.4, 0.17, -0.45); },
  "soft-core-moss": (g) => { G.circle(g, -0.45, 0.12, 0.38); G.circle(g, 0, -0.18, 0.42); G.circle(g, 0.45, 0.12, 0.38); G.line(g, -0.9, 0.55, 0.9, 0.55); },
  "sodium-chloride-crystal-salt": (g) => { G.rrect(g, -0.78, 0.05, 0.6, 0.6, 0.05); G.rrect(g, 0.18, 0.05, 0.6, 0.6, 0.05); G.rrect(g, -0.3, -0.65, 0.6, 0.6, 0.05); },
  "sweet-leaf": (g) => { g.moveTo(-0.7, 0.7); g.quadraticCurveTo(-0.7, -0.6, 0.75, -0.75); g.quadraticCurveTo(0.6, 0.65, -0.7, 0.7); G.line(g, -0.7, 0.7, 0.35, -0.35); G.star4(g, 0.6, 0.5, 0.25); },
  "nutrient-gel": (g) => {
    // 透明保鮮盒裝著膠狀液體，下方墊金屬托盤
    G.rrect(g, -0.92, 0.55, 1.84, 0.3, 0.08);
    G.rrect(g, -0.68, 0.65, 0.44, 0.1, 0.04); G.rrect(g, 0.24, 0.65, 0.44, 0.1, 0.04);
    G.rrect(g, -0.76, -0.45, 1.52, 1.0, 0.12);
    G.rrect(g, -0.84, -0.68, 1.68, 0.26, 0.09);
    G.rrect(g, -0.62, -0.62, 1.24, 0.13, 0.05);
    G.wave(g, -0.76, 0.76, -0.14, 0.05, 2);
    for (const [x, y, r] of [[-0.35, 0.18, 0.07], [0.3, 0.28, 0.05], [0.08, 0.02, 0.04], [0.48, 0.06, 0.035]]) G.circle(g, x, y, r);
  },
  "concentrated-sauce-packet": (g) => { G.poly(g, [[-0.6, -0.6], [-0.45, -0.75], [-0.3, -0.6], [-0.15, -0.75], [0, -0.6], [0.15, -0.75], [0.3, -0.6], [0.45, -0.75], [0.6, -0.6], [0.6, 0.85], [-0.6, 0.85]]); G.drop(g, 0.85, 0, 0.15); },
  "dried-starch-block": (g) => { G.rrect(g, -0.85, -0.45, 1.7, 0.9, 0.1); for (const [x, y] of [[-0.45, -0.1], [0, 0.15], [0.45, -0.1], [-0.2, -0.22], [0.25, 0.2]]) G.circle(g, x, y, 0.06); },
  "vacuum-dried-seeds": (g) => { G.poly(g, [[-0.6, -0.85], [0.6, -0.85], [0.72, 0.9], [-0.72, 0.9]]); G.line(g, -0.62, -0.62, 0.62, -0.62); for (const [x, y, r] of [[-0.25, 0.1, 0.4], [0.2, 0.35, -0.5], [0, -0.2, 0.2], [0.3, -0.05, 0.9]]) G.ellipse(g, x, y, 0.15, 0.08, r); },
  "cultured-meat-powder": (g) => { G.ellipse(g, -0.15, -0.2, 0.55, 0.45, -0.6); G.line(g, 0.22, 0.22, 0.6, 0.6); G.circle(g, 0.7, 0.55, 0.12); G.circle(g, 0.55, 0.72, 0.12); },
  "egg-powder": (g) => { G.egg(g, 0.95); G.circle(g, 0, 0.18, 0.22); },
  "fermentation-powder": (g) => { G.poly(g, [[-0.2, -0.9], [-0.2, -0.35], [-0.72, 0.85], [0.72, 0.85], [0.2, -0.35], [0.2, -0.9]], false); G.line(g, -0.72, 0.85, 0.72, 0.85); G.circle(g, -0.15, 0.45, 0.12); G.circle(g, 0.2, 0.22, 0.09); G.circle(g, 0.08, 0.65, 0.07); },
  "rock-mushroom": (g) => { G.mushroom(g, 1, 0, 0); G.circle(g, -0.35, -0.35, 0.08); G.circle(g, 0.25, -0.5, 0.07); },
  "curled-tender-shoots": (g) => {
    g.moveTo(0, 0.95); g.quadraticCurveTo(0.05, 0.25, 0.32, -0.4);
    const turns = 2.2, steps = 60;
    for (let i = 0; i <= steps; i++) { const a = -i / steps * turns * Math.PI; const r = 0.32 * (1 - i / steps * 0.85); g.lineTo(Math.cos(a) * r, -0.4 + Math.sin(a) * r); }
  },
  "empty-test-tube": (g) => { g.moveTo(-0.25, -0.9); g.lineTo(-0.25, 0.6); g.arc(0, 0.6, 0.25, Math.PI, 0, true); g.lineTo(0.25, -0.9); G.line(g, -0.36, -0.9, 0.36, -0.9); },

  // ---------- 食物 ----------
  "water-bottle": (g) => { G.rrect(g, -0.18, -0.95, 0.36, 0.2, 0.04); g.moveTo(-0.18, -0.75); g.quadraticCurveTo(-0.55, -0.6, -0.55, -0.25); g.lineTo(-0.55, 0.8); g.quadraticCurveTo(-0.55, 0.95, -0.4, 0.95); g.lineTo(0.4, 0.95); g.quadraticCurveTo(0.55, 0.95, 0.55, 0.8); g.lineTo(0.55, -0.25); g.quadraticCurveTo(0.55, -0.6, 0.18, -0.75); G.drop(g, 0.75, 0, 0.25); },
  "emergency-ration": (g) => {
    // 口糧包：上下兩端是鋸齒狀的易撕封口，內側壓封線＋餐具圖示
    const teeth = 6, x0 = -0.6, x1 = 0.6, step = (x1 - x0) / teeth;
    const outline = [];
    for (let i = 0; i <= teeth * 2; i++) outline.push([x0 + step * i / 2, i % 2 ? -0.94 : -0.82]);
    for (let i = teeth * 2; i >= 0; i--) outline.push([x0 + step * i / 2, i % 2 ? 0.94 : 0.82]);
    G.poly(g, outline);
    G.line(g, -0.6, -0.66, 0.6, -0.66); G.line(g, -0.6, 0.66, 0.6, 0.66);
    // 叉子
    for (const x of [-0.31, -0.2, -0.09]) G.line(g, x, -0.48, x, -0.24);
    g.moveTo(-0.31, -0.24); g.quadraticCurveTo(-0.31, -0.08, -0.2, -0.06); g.quadraticCurveTo(-0.09, -0.08, -0.09, -0.24);
    G.line(g, -0.2, -0.06, -0.2, 0.48);
    // 湯匙
    G.ellipse(g, 0.22, -0.3, 0.11, 0.18);
    G.line(g, 0.22, -0.12, 0.22, 0.48);
  },
  "alien-spore": (g) => { G.circle(g, 0, 0.15, 0.55); for (const [x, y] of [[-0.2, 0.05], [0.15, 0.3], [0.08, -0.12]]) G.circle(g, x, y, 0.07); g.moveTo(0.05, -0.4); g.quadraticCurveTo(0.12, -0.75, 0.38, -0.85); g.moveTo(-0.3, -0.3); g.quadraticCurveTo(-0.55, -0.65, -0.75, -0.55); },
  "alien-fruit": (g) => { G.circle(g, 0, 0.18, 0.72); g.moveTo(0, -0.54); g.quadraticCurveTo(0.05, -0.8, 0.18, -0.95); g.moveTo(0.12, -0.78); g.quadraticCurveTo(0.55, -1.05, 0.85, -0.7); g.quadraticCurveTo(0.5, -0.55, 0.12, -0.78); g.moveTo(-0.25, -0.35); g.quadraticCurveTo(-0.1, 0.18, -0.3, 0.7); },
  "full-recovery-test-item": (g) => { g.moveTo(0, 0.82); g.bezierCurveTo(-0.95, 0.1, -0.6, -0.75, 0, -0.35); g.bezierCurveTo(0.6, -0.75, 0.95, 0.1, 0, 0.82); G.line(g, 0, -0.08, 0, 0.38); G.line(g, -0.22, 0.15, 0.22, 0.15); },
  "mental-focus-stimulant": (g) => { G.rrect(g, -0.3, -0.5, 0.6, 1.35, 0.12); G.rrect(g, -0.36, -0.78, 0.72, 0.26, 0.05); G.line(g, -0.3, 0.1, 0.3, 0.1); G.star4(g, 0.62, -0.62, 0.28); },
  "invigorating-supply-drink": (g) => { G.rrect(g, -0.45, -0.8, 0.9, 1.65, 0.12); G.line(g, -0.45, -0.58, 0.45, -0.58); G.line(g, -0.45, 0.62, 0.45, 0.62); G.bolt(g, 0.85, 0, 0.03); },
  "mixed-meat-mash": (g) => { G.bowl(g); G.steam(g, [-0.35, 0, 0.35], -0.2, -0.9); },
  "rock-mushroom-chowder": (g) => { G.bowl(g, 0.05); G.mushroom(g, 0.42, 0, -0.38); },
  "salt-roasted-rock-mushroom": (g) => { G.mushroom(g, 0.8, -0.05, 0.05); for (const [x, y] of [[0.55, -0.7], [0.75, -0.45], [0.48, -0.35]]) G.rrect(g, x - 0.06, y - 0.06, 0.12, 0.12, 0.02); },
  "salted-soft-eggs": (g) => { G.egg(g, 0.9, 0.05); G.circle(g, 0, 0.22, 0.3); G.line(g, -0.55, -0.15, 0.55, -0.15); },
  "starch-flatbread": (g) => { G.ellipse(g, 0, 0, 0.88, 0.62); G.line(g, -0.4, -0.25, 0.4, 0.25); G.line(g, -0.4, 0.25, 0.4, -0.25); G.line(g, -0.55, 0, 0.55, 0); },
  "roasted-seed-crisps": (g) => { G.ellipse(g, -0.3, 0.25, 0.48, 0.3, -0.4); G.ellipse(g, 0.3, 0.2, 0.48, 0.3, 0.4); G.ellipse(g, 0, -0.35, 0.48, 0.3, 0); },
  "sweet-stewed-fruit": (g) => { G.rrect(g, -0.7, -0.15, 1.4, 0.95, 0.15); G.line(g, -0.88, 0.05, -0.7, 0.05); G.line(g, 0.7, 0.05, 0.88, 0.05); G.circle(g, -0.2, -0.45, 0.25); G.circle(g, 0.25, -0.42, 0.2); },
  "shoot-and-seed-salad": (g) => { G.ellipse(g, 0, 0.45, 0.9, 0.35); for (const x of [-0.3, 0, 0.3]) { g.moveTo(x, 0.35); g.quadraticCurveTo(x - 0.05, -0.2, x + 0.2, -0.55); } G.circle(g, 0.45, 0.3, 0.08); G.circle(g, -0.5, 0.35, 0.08); },
  "moss-algae-thick-soup": (g) => { G.bowl(g); G.wave(g, -0.65, 0.65, 0.2, 0.08, 2); G.steam(g, [-0.2, 0.2], -0.2, -0.85); },
  "sweet-seed-energy-bar": (g) => { G.rrect(g, -0.88, -0.3, 1.76, 0.6, 0.15); G.line(g, -0.6, -0.3, -0.6, 0.3); G.line(g, 0.6, -0.3, 0.6, 0.3); for (const [x, y] of [[-0.25, -0.05], [0.05, 0.1], [0.3, -0.08]]) G.ellipse(g, x, y, 0.1, 0.06, 0.5); G.star4(g, 0.55, -0.65, 0.22); },
  "grass-stem-tea": (g) => { G.poly(g, [[-0.62, -0.25], [0.5, -0.25], [0.4, 0.8], [-0.52, 0.8]]); g.moveTo(0.48, -0.05); g.arc(0.55, 0.2, 0.25, -Math.PI / 2, Math.PI / 2); G.steam(g, [-0.3, 0.05], -0.35, -0.95); },
  "mixed-compressed-ration-bar": (g) => { G.rrect(g, -0.85, -0.6, 1.7, 0.5, 0.08); G.rrect(g, -0.85, 0.05, 1.7, 0.5, 0.08); G.line(g, -0.2, -0.6, -0.2, 0.55); G.line(g, 0.2, -0.6, 0.2, 0.55); },

  // ---------- 工具 ----------
  "utility-rope": (g) => {
    // 收攏成束的登山繩：上下各三層繩圈從中間束帶展開，外圈帶編織紋；束帶分三節、有指示燈
    const bandTop = -0.12, bandBottom = 0.12;
    // 繩圈在束帶處被勒緊（窄），往兩端蓬開（寬）
    for (let k = 0; k < 3; k++) {
      const ab = 0.12 + k * 0.1, ae = 0.24 + k * 0.13, reach = 0.8 + k * 0.07;
      for (const dir of [-1, 1]) {
        const y0 = dir < 0 ? bandTop : bandBottom, yc = dir * (reach - ae);
        g.moveTo(-ab, y0);
        g.bezierCurveTo(-ab, y0 + dir * 0.18, -ae, yc - dir * 0.14, -ae, yc);
        g.arc(0, yc, ae, Math.PI, 0, dir > 0);
        g.bezierCurveTo(ae, yc - dir * 0.14, ab, y0 + dir * 0.18, ab, y0);
      }
    }
    // 外圈的編織斜紋
    const outer = 0.5, reachO = 0.94;
    for (const dir of [-1, 1]) {
      const yc = dir * (reachO - outer);
      for (let i = 1; i < 8; i++) {
        const t = Math.PI * i / 8, ang = dir < 0 ? Math.PI + t : Math.PI - t;
        const x = Math.cos(ang) * outer, y = yc + Math.sin(ang) * outer;
        const nx = Math.cos(ang), ny = Math.sin(ang);
        G.line(g, x - nx * 0.05 - ny * 0.04, y - ny * 0.05 + nx * 0.04, x + nx * 0.05 + ny * 0.04, y + ny * 0.05 - nx * 0.04);
      }
    }
    // 中間束帶：一條簡潔的窄帶
    G.rrect(g, -0.44, bandTop, 0.88, bandBottom - bandTop, 0.05);
  },
  "scanner-parts": (g) => { G.rrect(g, -0.5, -0.1, 1, 0.75, 0.1); for (const x of [-0.3, 0, 0.3]) G.line(g, x, 0.65, x, 0.88); g.moveTo(-0.4, -0.3); g.arc(0, -0.1, 0.45, Math.PI * 1.15, Math.PI * 1.85); g.moveTo(-0.65, -0.55); g.arc(0, -0.1, 0.78, Math.PI * 1.2, Math.PI * 1.8); },
  "repair-kit": (g) => { G.rrect(g, -0.85, -0.3, 1.7, 1.1, 0.1); G.poly(g, [[-0.35, -0.3], [-0.35, -0.62], [0.35, -0.62], [0.35, -0.3]], false); G.line(g, -0.85, 0.08, 0.85, 0.08); G.rrect(g, -0.12, 0, 0.24, 0.16, 0.03); },
  "tracking-module": (g) => { G.circle(g, 0, 0.4, 0.12); g.moveTo(-0.36, 0.13); g.arc(0, 0.4, 0.45, Math.PI * 1.2, Math.PI * 1.8); g.moveTo(-0.66, -0.06); g.arc(0, 0.4, 0.8, Math.PI * 1.22, Math.PI * 1.78); G.line(g, 0, 0.52, 0, 0.95); },
  "medkit": (g) => { G.rrect(g, -0.85, -0.85, 1.7, 1.7, 0.2); G.poly(g, [[-0.18, -0.55], [0.18, -0.55], [0.18, -0.18], [0.55, -0.18], [0.55, 0.18], [0.18, 0.18], [0.18, 0.55], [-0.18, 0.55], [-0.18, 0.18], [-0.55, 0.18], [-0.55, -0.18], [-0.18, -0.18]]); },
  "lantern": (g) => { G.rrect(g, -0.28, -1.0, 0.56, 2.0, 0.16); G.line(g, -0.28, -0.6, 0.28, -0.6); G.line(g, -0.28, 0.6, 0.28, 0.6); },
  "welding-tool": (g) => { G.rrect(g, -0.18, 0.1, 0.36, 0.85, 0.1); G.line(g, 0, 0.1, 0, -0.42); g.moveTo(0, -0.42); g.quadraticCurveTo(0, -0.68, 0.3, -0.72); G.line(g, 0.55, -0.85, 0.72, -0.98); G.line(g, 0.6, -0.68, 0.85, -0.66); G.line(g, 0.5, -0.55, 0.62, -0.4); },
  "digging-shovel": (g) => { G.rrect(g, -0.22, -1.0, 0.44, 0.18, 0.06); G.line(g, 0, -0.82, 0, 0.18); g.moveTo(-0.38, 0.18); g.lineTo(0.38, 0.18); g.lineTo(0.38, 0.52); g.quadraticCurveTo(0.3, 0.85, 0, 0.98); g.quadraticCurveTo(-0.3, 0.85, -0.38, 0.52); g.closePath(); },
  "multifunction-folding-knife": (g) => {
    // 戶外刀：直刀背、往上收成銳利尖端的弧形刃口（落尖型），刃口斜磨線、護手、握柄與鉚釘
    g.moveTo(-0.17, 0.06); g.lineTo(-0.17, -0.5);
    g.quadraticCurveTo(-0.16, -0.8, 0.0, -1.0);
    g.quadraticCurveTo(0.26, -0.68, 0.23, -0.28);
    g.lineTo(0.21, 0.06); g.closePath();
    g.moveTo(0.11, -0.12); g.quadraticCurveTo(0.12, -0.6, -0.01, -0.86);
    G.rrect(g, -0.32, 0.06, 0.66, 0.09, 0.03);
    G.rrect(g, -0.16, 0.15, 0.34, 0.78, 0.13);
    G.circle(g, 0.01, 0.36, 0.04); G.circle(g, 0.01, 0.6, 0.04); G.circle(g, 0.01, 0.82, 0.05);
  },
  "sharp-metal-fragment": (g) => { G.poly(g, [[-0.6, 0.85], [-0.12, -0.95], [0.65, 0.6]]); G.line(g, -0.02, -0.55, 0.42, 0.42); },
  "basic-backpack": (g) => { G.backpack(g); },
  "survival-backpack": (g) => { G.backpack(g); G.rrect(g, -0.85, -0.15, 0.25, 0.7, 0.06); G.rrect(g, 0.6, -0.15, 0.25, 0.7, 0.06); G.ellipse(g, 0, -0.68, 0.5, 0.12); },
  "powered-backpack": (g) => { G.backpack(g); G.bolt(g, 0.7, 0, -0.18); G.line(g, -0.85, -0.4, -0.85, 0.7); G.line(g, 0.85, -0.4, 0.85, 0.7); },
  "faint-torch": (g) => { G.rrect(g, -0.12, -0.12, 0.24, 1.07, 0.06); g.moveTo(0, -0.95); g.bezierCurveTo(0.42, -0.6, 0.26, -0.18, 0, -0.18); g.bezierCurveTo(-0.26, -0.18, -0.42, -0.6, 0, -0.95); g.moveTo(0, -0.62); g.quadraticCurveTo(0.14, -0.42, 0, -0.32); g.quadraticCurveTo(-0.14, -0.42, 0, -0.62); },

  // ---------- 任務／主線 ----------
  "time-crystal": (g) => { G.poly(g, [[0, -1], [0.7, 0], [0, 1], [-0.7, 0]]); G.poly(g, [[-0.28, -0.45], [0.28, -0.45], [-0.28, 0.45], [0.28, 0.45]]); },
  "navigation-data": (g) => {
    // 三折展開的地圖：摺痕＋虛線航線＋定位標記
    G.poly(g, [[-0.88, -0.58], [-0.3, -0.76], [0.3, -0.58], [0.88, -0.76], [0.88, 0.62], [0.3, 0.8], [-0.3, 0.62], [-0.88, 0.8]]);
    G.line(g, -0.3, -0.76, -0.3, 0.62); G.line(g, 0.3, -0.58, 0.3, 0.8);
    const route = (t) => { const u = 1 - t; return [u * u * -0.62 + 2 * u * t * -0.05 + t * t * 0.42, u * u * 0.5 + 2 * u * t * -0.55 + t * t * 0.12]; };
    for (let i = 0; i < 6; i++) { const [x1, y1] = route(i / 6), [x2, y2] = route(i / 6 + 0.09); G.line(g, x1, y1, x2, y2); }
    G.circle(g, 0.6, -0.24, 0.14); G.poly(g, [[0.49, -0.16], [0.6, 0.1], [0.71, -0.16]], false); G.circle(g, 0.6, -0.24, 0.04);
  },
  "memory-charm": (g) => {
    // 一本舊日記：封面＋左側書背、右側與下方露出的書頁、封面徽記與標題線、垂出的書籤絲帶
    G.rrect(g, -0.6, -0.88, 1.18, 1.68, 0.08);
    G.line(g, -0.4, -0.88, -0.4, 0.8);
    g.moveTo(0.58, -0.8); g.lineTo(0.68, -0.8); g.lineTo(0.68, 0.88); g.lineTo(-0.5, 0.88); g.lineTo(-0.5, 0.8);
    G.circle(g, 0.09, -0.22, 0.22); G.star4(g, 0.09, -0.22, 0.13);
    G.line(g, -0.15, 0.22, 0.33, 0.22); G.line(g, -0.08, 0.38, 0.26, 0.38);
    G.poly(g, [[0.32, 0.88], [0.32, 1.0], [0.4, 0.93], [0.48, 1.0], [0.48, 0.88]], false);
  },
  "ancient-plate": (g) => { G.rrect(g, -0.65, -0.92, 1.3, 1.84, 0.15); G.line(g, -0.35, -0.58, 0.35, -0.58); G.poly(g, [[-0.35, 0.02], [-0.12, -0.22], [0.1, 0.02], [0.35, -0.22]], false); G.circle(g, -0.15, 0.48, 0.15); G.poly(g, [[0.15, 0.35], [0.38, 0.6], [0.15, 0.6]]); },
  "ruin-key": (g) => { G.circle(g, 0, -0.6, 0.36); G.line(g, 0, -0.24, 0, 0.92); G.line(g, 0, 0.5, 0.3, 0.5); G.line(g, 0, 0.78, 0.3, 0.78); },
  "communication-array-panel": (g) => {
    // 正向朝上的碟型天線：左右對稱的碟面、垂直饋源與底座、上方對稱訊號弧
    g.moveTo(-0.75, -0.2); g.ellipse(0, -0.2, 0.75, 0.34, 0, Math.PI, 0, true); g.closePath();
    G.line(g, 0, 0.14, 0, -0.6); G.circle(g, 0, -0.68, 0.08);
    G.line(g, 0, 0.14, 0, 0.62); G.poly(g, [[-0.4, 0.92], [0.4, 0.92], [0.18, 0.62], [-0.18, 0.62]]);
    for (const r of [0.24, 0.42]) { const a0 = -Math.PI * 0.78, a1 = -Math.PI * 0.22; g.moveTo(Math.cos(a0) * r, -0.68 + Math.sin(a0) * r); g.arc(0, -0.68, r, a0, a1); }
  },
  "quantum-transmitter": (g) => { for (const r of [0, Math.PI / 3, -Math.PI / 3]) G.ellipse(g, 0, 0, 0.88, 0.3, r); G.circle(g, 0, 0, 0.12); },
  "calibration-component": (g) => { g.moveTo(-0.82, 0.3); g.arc(0, 0.3, 0.82, Math.PI, 0); g.lineTo(-0.82, 0.3); for (let i = 0; i <= 4; i++) { const a = Math.PI + i * Math.PI / 4; G.line(g, Math.cos(a) * 0.62, 0.3 + Math.sin(a) * 0.62, Math.cos(a) * 0.76, 0.3 + Math.sin(a) * 0.76); } G.line(g, 0, 0.3, 0.42, -0.2); G.circle(g, 0, 0.3, 0.07); },
};

