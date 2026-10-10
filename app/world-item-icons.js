// 世界掉落道具的 3D 箱體 Icon（烤漆金屬）。
// 由 output/item-icon-preview/boxes.html 定稿後移入，只保留烤漆金屬材質。
// 各類別一種形體、一種漆色；頂面（截角八面體為側面）刻道具符號，加金邊、邊緣光芒與指引光束。
// 箱體本身、符號光、邊緣光、光束都只在第一次用到時預先畫成圖（sprite），每幀只做圖片複製與少量動態光點。
import { ITEM_GLYPHS } from "./world-item-glyphs.js";

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const GOLD_TRIM = ["#f0d38c", "#b88a3c", "#6b4b18"];
/** 預先繪製的解析度倍率（遊戲鏡頭會放大，留餘裕避免模糊） */
const RENDER_SCALE = 3;
/** 箱體圖的範圍（世界單位）與原點（地面中心點） */
const BOX = 100, BOX_OX = 50, BOX_OY = 68;

// 類別 → 形體、發光色與漆色
const CATEGORIES = {
  tool: { shape: "cube", rgb: "255,196,110", tint: [156, 96, 46] },          // 橘色
  resource: { shape: "truncOcta", rgb: "120,200,255", tint: [70, 104, 148] }, // 藍色
  quest: { shape: "facet", rgb: "200,175,255", tint: [110, 82, 146] },       // 紫色
  food: { shape: "chamferCube", rgb: "150,230,140", tint: [78, 124, 70] },   // 綠色
  main: { shape: "facet", rgb: "255,220,130", tint: [150, 118, 56] },        // 金色
};
// 各形狀頂面的大約高度（世界單位），光束從這裡升起
const SHAPE_TOP = { cube: 19, chamferCube: 27, truncOcta: 25, facet: 29 };

// 目前繪製目標；預先繪製時切換到離屏畫布
let ctx = null;
let SURFACE_TINT = null;
let NO_SHADOW = false;

// ---------- 等角投影與向量 ----------
const P = (x, y, z) => [(x - y) * 0.866, (x + y) * 0.5 - z];
const VIEW = [1, 1, 1].map((v) => v / Math.sqrt(3));
const LIGHT3 = (() => { const l = [-0.35, 0.9, 1.25]; const n = Math.hypot(...l); return l.map((v) => v / n); })();
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm3 = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const LIGHT = (() => { const l = [-0.3, 1]; const n = Math.hypot(...l); return [l[0] / n, l[1] / n]; })();
const lit = (n) => Math.max(0.28, Math.min(1.05, 0.62 + 0.42 * (n[0] * LIGHT[0] + n[1] * LIGHT[1])));
function polyPath(points) { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...P(...p)) : ctx.moveTo(...P(...p))); ctx.closePath(); }

// ---------- 烤漆金屬材質 ----------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rgbStr = (c, alpha = 1) => `rgba(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")},${alpha})`;
const mulRgb = (c, k) => c.map((v) => v * k);
const PAINT_BASE = [150, 60, 40];

function orientFaces(faces) {
  const all = faces.flatMap((f) => f.pts);
  const center = all.reduce((s, p) => [s[0] + p[0] / all.length, s[1] + p[1] / all.length, s[2] + p[2] / all.length], [0, 0, 0]);
  for (const f of faces) {
    f.c = f.pts.reduce((s, p) => [s[0] + p[0] / f.pts.length, s[1] + p[1] / f.pts.length, s[2] + p[2] / f.pts.length], [0, 0, 0]);
    let n = cross3(sub3(f.pts[1], f.pts[0]), sub3(f.pts[2], f.pts[0]));
    const len = Math.hypot(...n) || 1; n = n.map((x) => x / len);
    if (dot3(n, sub3(f.c, center)) < 0) n = n.map((x) => -x);
    f.n = n; f.depth = dot3(f.c, VIEW);
  }
  return faces;
}
// 烤漆：飽和底色＋清漆高光，表面乾淨無磨損
function paintFace(f, info) {
  const tint = SURFACE_TINT || PAINT_BASE;
  const n = f.n, pts = f.pts;
  const diffuse = Math.max(0, dot3(n, LIGHT3));
  const half = norm3(add3(LIGHT3, VIEW));
  const specRaw = Math.max(0, dot3(n, half));
  const bounce = Math.max(0, -n[2]) * 0.12;
  const spec = (power, strength) => {
    const s = Math.pow(specRaw, power) * strength;
    if (s > 0.01) { polyPath(pts); ctx.fillStyle = rgbStr([255, 252, 245], Math.min(1, s)); ctx.fill(); }
  };
  const mean = (tint[0] + tint[1] + tint[2]) / 3;
  const vivid = tint.map((v) => ((v - mean) * 1.6 + mean) * 1.18);
  polyPath(pts); ctx.fillStyle = rgbStr(mulRgb(vivid, 0.36 + diffuse * 0.8 + bounce)); ctx.fill();
  // 清漆反射：朝上的面映出淡淡的天空
  const d = dot3(n, VIEW), rz = 2 * d * n[2] - VIEW[2];
  const sky = clamp01(rz * 0.8 + 0.3);
  if (sky > 0.05) { polyPath(pts); ctx.fillStyle = rgbStr([235, 242, 250], 0.2 * sky); ctx.fill(); }
  spec(45, 0.85);
  spec(8, 0.1);
  // 底部環境遮蔽
  if (f.c[2] < lerp(info.minZ, info.maxZ, 0.55)) {
    ctx.save(); polyPath(pts); ctx.clip();
    const ao = ctx.createLinearGradient(...P(0, 0, lerp(info.minZ, info.maxZ, 0.5)), ...P(0, 0, info.minZ));
    ao.addColorStop(0, "rgba(0,0,0,0)"); ao.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = ao; ctx.fillRect(-80, -100, 160, 160);
    ctx.restore();
  }
}
function paintEdges(visible) {
  ctx.save(); ctx.lineJoin = "round"; ctx.lineWidth = 0.55;
  for (const f of visible) {
    const facing = Math.max(0, dot3(f.n, LIGHT3));
    polyPath(f.pts); ctx.strokeStyle = `rgba(255,240,230,${0.1 + 0.35 * facing})`; ctx.stroke();
  }
  ctx.restore();
}
// 背面剔除、由後往前上色
function renderFaces(faces) {
  const all = faces.flatMap((f) => f.pts);
  const info = { minZ: Math.min(...all.map((p) => p[2])), maxZ: Math.max(...all.map((p) => p[2])) };
  for (const f of faces) if (f.depth === undefined) f.depth = dot3(f.c, VIEW);
  const visible = faces.filter((f) => dot3(f.n, VIEW) > 0.02).sort((a, b) => a.depth - b.depth);
  for (const f of visible) paintFace(f, info);
  paintEdges(visible);
  return visible;
}

// ---------- 金邊（貼在面上的金屬帶＋內收細亮線） ----------
// 環狀頂點中，把連續的「朝前邊」串成折線；全部朝前時回傳一條封閉路徑
function frontRuns(count, isFrontEdge) {
  const front = Array.from({ length: count }, (_, i) => isFrontEdge(i));
  if (front.every(Boolean)) return [{ indices: Array.from({ length: count }, (_, i) => i), closed: true }];
  const runs = [];
  for (let i = 0; i < count; i++) {
    if (!front[i] || front[(i - 1 + count) % count]) continue;
    const indices = [i];
    let k = i;
    while (front[k % count]) { indices.push((k + 1) % count); k++; }
    runs.push({ indices, closed: false });
  }
  return runs;
}
function goldBandOnFace(pts, isEdge, width = 1.25) {
  const n = pts.length;
  const c = pts.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
  const inr = Math.min(...pts.map((p, i) => {
    const e = sub3(pts[(i + 1) % n], p);
    return Math.hypot(...cross3(e, sub3(c, p))) / Math.hypot(...e);
  }));
  const toward = (p, k) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k, c[2] + (p[2] - c[2]) * k];
  const inner = pts.map((p) => toward(p, 1 - width / inr));
  for (let i = 0; i < n; i++) {
    if (!isEdge(i)) continue;
    const j = (i + 1) % n, a = pts[i], b = pts[j], ai = inner[i], bi = inner[j];
    polyPath([a, b, bi, ai]);
    const mo = P(...scale3(add3(a, b), 0.5)), mi = P(...scale3(add3(ai, bi), 0.5));
    const grad = ctx.createLinearGradient(mo[0], mo[1] - 1, mi[0], mi[1] + 1);
    grad.addColorStop(0, GOLD_TRIM[0]); grad.addColorStop(0.55, GOLD_TRIM[1]); grad.addColorStop(1, GOLD_TRIM[2]);
    ctx.fillStyle = grad; ctx.fill();
  }
  const glint = pts.map((p) => toward(p, 1 - 0.22 / inr));
  ctx.save(); ctx.lineCap = "butt"; ctx.lineJoin = "miter";
  ctx.beginPath();
  for (const run of frontRuns(n, isEdge)) {
    run.indices.forEach((k, idx) => idx ? ctx.lineTo(...P(...glint[k])) : ctx.moveTo(...P(...glint[k])));
    if (run.closed) ctx.closePath();
  }
  ctx.strokeStyle = "rgba(255,240,200,0.55)"; ctx.lineWidth = 0.35; ctx.stroke();
  ctx.restore();
}

// ---------- 立方體（工具）：前方三個角有 L 形金屬包角 ----------
function prism(poly, h) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  if (!NO_SHADOW) {
    ctx.save(); ctx.filter = "blur(2.5px)"; ctx.fillStyle = "rgba(0,0,0,0.42)";
    for (let k = 0; k <= 6; k++) { const s = k * 1.3; polyPath(poly.map(([x, y]) => [x + s, y + s * 0.25, 0])); ctx.fill(); }
    ctx.filter = "blur(1px)"; ctx.fillStyle = "rgba(0,0,0,0.55)"; polyPath(poly.map(([x, y]) => [x * 1.03, y * 1.03, 0])); ctx.fill();
    ctx.restore();
  }
  const faces = poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return { pts: [[...a, 0], [...b, 0], [...b, h], [...a, h]] }; });
  faces.push({ pts: poly.map(([x, y]) => [x, y, h]) });
  faces.push({ pts: [...poly].reverse().map(([x, y]) => [x, y, 0]) });
  renderFaces(orientFaces(faces));
  const unit = (dx, dy) => { const d = Math.hypot(dx, dy); return [dx / d, dy / d]; };
  const inward = (a, b) => {
    const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]);
    let n = [-uy, ux];
    if ((cx - (a[0] + b[0]) / 2) * n[0] + (cy - (a[1] + b[1]) / 2) * n[1] < 0) n = [uy, -ux];
    return n;
  };
  const W = 1.25; // 金屬片寬度（世界單位）
  poly.forEach((v, i) => {
    const prev = poly[(i - 1 + poly.length) % poly.length], next = poly[(i + 1) % poly.length];
    if ((v[0] - cx) + (v[1] - cy) <= -0.5) return; // 只畫朝前的角
    const L = Math.min(3.8, Math.hypot(next[0] - v[0], next[1] - v[1]) * 0.28);
    const up = unit(prev[0] - v[0], prev[1] - v[1]), un = unit(next[0] - v[0], next[1] - v[1]);
    const np = inward(v, prev), nn = inward(v, next);
    const sinT = Math.abs(up[0] * un[1] - up[1] * un[0]) || 1;
    const innerCorner = [v[0] + (up[0] + un[0]) * W / sinT, v[1] + (up[1] + un[1]) * W / sinT];
    const A = [v[0] + up[0] * L, v[1] + up[1] * L], C = [v[0] + un[0] * L, v[1] + un[1] * L];
    const topBand = [A, v, C, [C[0] + nn[0] * W, C[1] + nn[1] * W], innerCorner, [A[0] + np[0] * W, A[1] + np[1] * W]];
    polyPath(topBand.map(([x, y]) => [x, y, h]));
    const [tx0, ty0] = P(v[0], v[1], h), [tx1, ty1] = P(innerCorner[0], innerCorner[1], h);
    const topGrad = ctx.createLinearGradient(tx0, ty0 - 2, tx1, ty1 + 2);
    topGrad.addColorStop(0, GOLD_TRIM[0]); topGrad.addColorStop(0.55, GOLD_TRIM[1]); topGrad.addColorStop(1, GOLD_TRIM[2]);
    ctx.fillStyle = topGrad; ctx.fill();
    for (const [dir, other] of [[up, prev], [un, next]]) {
      const nOut = (() => { const n = [-(other[1] - v[1]), other[0] - v[0]]; const mx = (v[0] + other[0]) / 2 - cx, my = (v[1] + other[1]) / 2 - cy; return n[0] * mx + n[1] * my < 0 ? [-n[0], -n[1]] : n; })();
      const nUnit = unit(...nOut);
      if (nUnit[0] + nUnit[1] <= 0.02) continue; // 背面不畫
      polyPath([[v[0], v[1], h], [v[0], v[1], h - L], [v[0] + dir[0] * W, v[1] + dir[1] * W, h - L], [v[0] + dir[0] * W, v[1] + dir[1] * W, h]]);
      const b = lit(nUnit);
      const sideGrad = ctx.createLinearGradient(...P(v[0], v[1], h), ...P(v[0], v[1], h - L));
      sideGrad.addColorStop(0, b > 0.8 ? GOLD_TRIM[0] : GOLD_TRIM[1]); sideGrad.addColorStop(1, b > 0.8 ? GOLD_TRIM[1] : GOLD_TRIM[2]);
      ctx.fillStyle = sideGrad; ctx.fill();
    }
    ctx.save(); ctx.lineCap = "butt"; ctx.lineJoin = "miter";
    const k = 0.22; // 亮線往面內收，避免壓在外輪廓上
    ctx.beginPath(); ctx.moveTo(...P(A[0] + np[0] * k, A[1] + np[1] * k, h));
    ctx.lineTo(...P(v[0] + (up[0] + un[0]) * k / sinT, v[1] + (up[1] + un[1]) * k / sinT, h));
    ctx.lineTo(...P(C[0] + nn[0] * k, C[1] + nn[1] * k, h));
    ctx.strokeStyle = "rgba(255,240,200,0.55)"; ctx.lineWidth = 0.35; ctx.stroke();
    ctx.restore();
  });
  const r = Math.min(...poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1];
    return Math.abs((cx - p[0]) * ey - (cy - p[1]) * ex) / Math.hypot(ex, ey);
  }));
  return { top: P(cx, cy, h), radius: r };
}

// ---------- 多面球體（任務／主線） ----------
function facetSphere(R) {
  const N = 8, rot = Math.PI / 8;
  const mid = Math.acos(0.3);
  const thetas = [0.62, mid, Math.PI - mid, 2.3, 2.62];
  const ring = (theta) => Array.from({ length: N }, (_, i) => {
    const a = rot + i * TAU / N;
    return [Math.cos(a) * R * Math.sin(theta), Math.sin(a) * R * Math.sin(theta), R + R * Math.cos(theta)];
  });
  const rings = thetas.map(ring);
  const faces = [{ pts: rings[0] }, { pts: [...rings[rings.length - 1]].reverse() }];
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      faces.push({ pts: [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]] });
    }
  }
  if (!NO_SHADOW) {
    ctx.save(); ctx.filter = "blur(2.5px)"; ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath(); ctx.ellipse(R * 0.35, 0, R * 1.08, R * 0.38, 0, 0, TAU); ctx.fill();
    ctx.filter = "blur(1px)"; ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.ellipse(0, -0.5, R * 0.55, R * 0.2, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  renderFaces(orientFaces(faces));
  const topRing = rings[0];
  goldBandOnFace(topRing, (i) => { const a = topRing[i], b = topRing[(i + 1) % N]; return (a[0] + b[0]) / 2 + (a[1] + b[1]) / 2 > 0; }, 0.72);
  return { top: P(0, 0, R + R * Math.cos(thetas[0])), radius: R * Math.sin(thetas[0]) * Math.cos(Math.PI / N) };
}

// ---------- 凸多面體網格（倒角立方體、截角八面體） ----------
function hullFaces(vertices, normals) {
  return normals.map((n) => {
    const d = Math.max(...vertices.map((v) => dot3(v, n)));
    const pts = vertices.filter((v) => Math.abs(dot3(v, n) - d) < Math.max(1e-6, Math.abs(d)) * 1e-3);
    const c = pts.reduce((s, p) => add3(s, scale3(p, 1 / pts.length)), [0, 0, 0]);
    const u = norm3(sub3(pts[0], c)), w = cross3(n, u);
    pts.sort((p, q) => Math.atan2(dot3(sub3(p, c), w), dot3(sub3(p, c), u)) - Math.atan2(dot3(sub3(q, c), w), dot3(sub3(q, c), u)));
    return { pts };
  });
}
const signs = (v) => {
  let out = [[]];
  for (const x of v) { const next = []; for (const o of out) { next.push([...o, x]); if (x !== 0) next.push([...o, -x]); } out = next; }
  return out;
};
const permutations = (v) => [[v[0], v[1], v[2]], [v[0], v[2], v[1]], [v[1], v[0], v[2]], [v[1], v[2], v[0]], [v[2], v[0], v[1]], [v[2], v[1], v[0]]];
const uniquePoints = (points) => {
  const seen = new Set(); return points.filter((p) => { const k = p.map((v) => v.toFixed(4)).join(","); if (seen.has(k)) return false; seen.add(k); return true; });
};
function placeOnGround(faces, k = 1) {
  const minZ = Math.min(...faces.flatMap((f) => f.pts.map((p) => p[2])));
  return faces.map((f) => ({ pts: f.pts.map(([x, y, z]) => [x * k, y * k, (z - minZ) * k]) }));
}
function alignToZ(faces, v) {
  const a = norm3(v), axis = cross3(a, [0, 0, 1]), sinA = Math.hypot(...axis), cosA = a[2];
  if (sinA < 1e-9) return faces;
  const k = scale3(axis, 1 / sinA);
  const rot = (p) => add3(add3(scale3(p, cosA), scale3(cross3(k, p), sinA)), scale3(k, dot3(k, p) * (1 - cosA)));
  return faces.map((f) => ({ pts: f.pts.map(rot) }));
}
function rotateZ(faces, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return faces.map((f) => ({ pts: f.pts.map(([x, y, z]) => [x * c - y * s, x * s + y * c, z]) }));
}
const MESHES = {
  chamferCube: () => {
    const a = 11, b = 7.0, verts = uniquePoints(permutations([a, b, b]).flatMap(signs));
    const normals = [...signs([1, 0, 0]), ...signs([0, 1, 0]), ...signs([0, 0, 1]),
      ...uniquePoints(permutations([1, 1, 0]).flatMap(signs)).map(norm3), ...signs([1, 1, 1]).map(norm3)];
    // 倒角削掉了等角視角下的輪廓角，放大 1.22 倍讓畫面寬度與立方體相同（38 px）
    return placeOnGround(hullFaces(verts, normals), 1.22);
  },
  truncOcta: () => {
    const verts = uniquePoints(permutations([0, 1, 2]).flatMap(signs));
    const normals = [...signs([1, 0, 0]), ...signs([0, 1, 0]), ...signs([0, 0, 1]), ...signs([1, 1, 1]).map(norm3)];
    return placeOnGround(rotateZ(alignToZ(hullFaces(verts, normals), [1, 1, 1]), Math.PI / 6), 6.2);
  },
};
function convexHull2(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function meshShadow(faces) {
  if (NO_SHADOW) return;
  const foot = convexHull2(faces.flatMap((f) => f.pts).filter((p) => p[2] < 1.6).map((p) => [p[0], p[1]]));
  if (foot.length < 3) return;
  ctx.save(); ctx.filter = "blur(2.5px)"; ctx.fillStyle = "rgba(0,0,0,0.42)";
  for (let k = 0; k <= 6; k++) { const s = k * 1.3; polyPath(foot.map(([x, y]) => [x + s, y + s * 0.25, 0])); ctx.fill(); }
  ctx.filter = "blur(1px)"; ctx.fillStyle = "rgba(0,0,0,0.55)"; polyPath(foot.map(([x, y]) => [x * 1.03, y * 1.03, 0])); ctx.fill();
  ctx.restore();
}
// 頂面加金邊；glyphFace 為 "side" 時符號改刻在最正對鏡頭的側面（金邊仍在頂面）
function drawMesh(faces, opts = {}) {
  meshShadow(faces);
  const visible = renderFaces(orientFaces(faces));
  const rimFace = visible.filter((f) => f.n[2] > 0.985).sort((a, b) => b.c[2] - a.c[2])[0];
  let sideFace = null;
  if (opts.glyphFace === "side") {
    const sides = visible.filter((f) => Math.abs(f.n[2]) < 0.6);
    const hexes = sides.filter((f) => f.pts.length >= 6);
    sideFace = (hexes.length ? hexes : sides).sort((a, b) => dot3(b.n, VIEW) - dot3(a.n, VIEW))[0] || null;
  }
  const top = sideFace || rimFace;
  if (!top) return { top: [0, 0], radius: 4 };
  if (rimFace) {
    const rc = rimFace.c, rp = rimFace.pts;
    goldBandOnFace(rp, (i) => { const a = rp[i], b = rp[(i + 1) % rp.length]; return (a[0] + b[0]) / 2 + (a[1] + b[1]) / 2 > rc[0] + rc[1]; }, 0.75);
  }
  const c = top.c;
  if (sideFace) {
    const n = sideFace.n;
    const up = norm3([-n[2] * n[0], -n[2] * n[1], 1 - n[2] * n[2]]);
    const right = norm3(cross3(up, n));
    const o = P(...c), sr = P(...add3(c, right)), sd = P(...add3(c, scale3(up, -1)));
    let e1 = [sr[0] - o[0], sr[1] - o[1]]; const e2 = [sd[0] - o[0], sd[1] - o[1]];
    if (e1[0] * e2[1] - e1[1] * e2[0] < 0) e1 = [-e1[0], -e1[1]]; // 避免左右鏡像
    const r3 = Math.min(...sideFace.pts.map((p, i) => {
      const e = sub3(sideFace.pts[(i + 1) % sideFace.pts.length], p);
      return Math.hypot(...cross3(e, sub3(c, p))) / Math.hypot(...e);
    }));
    return { top: o, radius: r3, axes: [e1, e2] };
  }
  const r = Math.min(...top.pts.map((p, i) => {
    const q = top.pts[(i + 1) % top.pts.length], ex = q[0] - p[0], ey = q[1] - p[1];
    return Math.abs((c[0] - p[0]) * ey - (c[1] - p[1]) * ex) / Math.hypot(ex, ey);
  }));
  return { top: P(...c), radius: r };
}

const SHAPES = {
  cube: () => prism([[-11, -11], [11, -11], [11, 11], [-11, 11]], 18),
  chamferCube: () => drawMesh(MESHES.chamferCube()),
  truncOcta: () => drawMesh(MESHES.truncOcta(), { glyphFace: "side" }),
  facet: () => facetSphere(14.5),
};

// ---------- 刻印符號 ----------
// layer "base"：暗色凹槽＋受光邊＋細白核心線；layer "glow"：類別色微光（每幀以明滅透明度疊加）
function engrave(glyph, info, rgb, layer) {
  const g = info.radius * 0.62, axes = info.axes;
  const [e1x, e1y] = axes ? [axes[0][0] * g, axes[0][1] * g] : P(g, 0, 0);
  const [e2x, e2y] = axes ? [axes[1][0] * g, axes[1][1] * g] : P(0, g, 0);
  ctx.save(); ctx.translate(info.top[0], info.top[1]); ctx.transform(e1x, e1y, e2x, e2y, 0, 0);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const run = () => { ctx.beginPath(); glyph(ctx); };
  if (layer === "base") {
    ctx.save(); ctx.translate(0, 0.07); run(); ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 0.15; ctx.stroke(); ctx.restore();
    run(); ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 0.18; ctx.stroke();
    run(); ctx.strokeStyle = "rgba(255,252,240,0.85)"; ctx.lineWidth = 0.035; ctx.stroke();
  } else {
    ctx.shadowColor = `rgba(${rgb},0.9)`; ctx.shadowBlur = 5 * RENDER_SCALE;
    run(); ctx.strokeStyle = `rgba(${rgb},0.95)`; ctx.lineWidth = 0.09; ctx.stroke();
  }
  ctx.restore();
}

// ---------- 預先繪製 ----------
function makeCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w); canvas.height = Math.ceil(h);
  return canvas;
}
function renderInto(canvas, draw) {
  const previous = ctx;
  ctx = canvas.getContext("2d");
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, BOX_OX * RENDER_SCALE, BOX_OY * RENDER_SCALE);
  try { return draw(); } finally { ctx = previous; }
}
const SPRITES = new Map();
function getItemSprites(item) {
  const cached = SPRITES.get(item.id);
  if (cached !== undefined) return cached;
  const cat = CATEGORIES[item.category];
  const glyph = ITEM_GLYPHS[item.englishName];
  if (!cat || typeof document === "undefined") { SPRITES.set(item.id, null); return null; }
  const size = BOX * RENDER_SCALE;
  const base = makeCanvas(size, size), glow = makeCanvas(size, size), body = makeCanvas(size, size), edge = makeCanvas(size, size);
  SURFACE_TINT = cat.tint;
  try {
    // 本體＋接地陰影＋符號凹槽
    renderInto(base, () => { const info = SHAPES[cat.shape](); if (glyph) engrave(glyph, info, cat.rgb, "base"); return info; });
    // 符號微光（只需要位置，畫一次本體取得刻印位置，再清掉）
    renderInto(glow, () => {
      const info = SHAPES[cat.shape]();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, size, size);
      ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, BOX_OX * RENDER_SCALE, BOX_OY * RENDER_SCALE);
      if (glyph) engrave(glyph, info, cat.rgb, "glow");
    });
    // 邊緣光芒：本體輪廓模糊、染上類別色，再挖掉本體
    NO_SHADOW = true;
    try { renderInto(body, () => SHAPES[cat.shape]()); } finally { NO_SHADOW = false; }
  } finally { SURFACE_TINT = null; }
  const g = edge.getContext("2d");
  g.filter = `blur(${5 * RENDER_SCALE}px)`; g.drawImage(body, 0, 0); g.drawImage(body, 0, 0);
  g.filter = `blur(${2.4 * RENDER_SCALE}px)`; g.drawImage(body, 0, 0);
  g.filter = "none";
  g.globalCompositeOperation = "source-in"; g.fillStyle = `rgba(${cat.rgb},1)`; g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = "destination-out"; g.drawImage(body, 0, 0);
  const sprites = { base, glow, edge, beam: getBeamSprite(cat.rgb), rgb: cat.rgb, top: SHAPE_TOP[cat.shape] ?? 20 };
  SPRITES.set(item.id, sprites);
  return sprites;
}

// 指引光束（柔光＋核心線）：預先畫成圖，原點在光束底部
const BEAM_L = 44, BEAM_W = 40, BEAM_H = 56, BEAM_OY = 50;
const BEAM_SPRITES = new Map();
function getBeamSprite(rgb) {
  if (BEAM_SPRITES.has(rgb)) return BEAM_SPRITES.get(rgb);
  const s = RENDER_SCALE, canvas = makeCanvas(BEAM_W * s, BEAM_H * s), g = canvas.getContext("2d");
  const x = BEAM_W / 2 * s, baseY = BEAM_OY * s, L = BEAM_L * s, baseW = 26 * s, tipW = 2.6 * s;
  g.filter = `blur(${2 * s}px)`;
  g.beginPath();
  g.moveTo(x - baseW / 2, baseY);
  g.quadraticCurveTo(x - tipW * 2, baseY - L * 0.32, x - tipW, baseY - L);
  g.lineTo(x + tipW, baseY - L);
  g.quadraticCurveTo(x + tipW * 2, baseY - L * 0.32, x + baseW / 2, baseY);
  g.closePath();
  const outer = g.createLinearGradient(0, baseY, 0, baseY - L);
  outer.addColorStop(0, `rgba(${rgb},0.5)`); outer.addColorStop(0.35, `rgba(${rgb},0.22)`); outer.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = outer; g.fill();
  g.filter = `blur(${0.5 * s}px)`;
  const core = g.createLinearGradient(0, baseY, 0, baseY - L * 0.9);
  core.addColorStop(0, "rgba(255,255,250,0.75)"); core.addColorStop(0.5, `rgba(${rgb},0.45)`); core.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = core; g.fillRect(x - 1.2 * s, baseY - L * 0.9, 2.4 * s, L * 0.9);
  g.filter = "none";
  const gather = g.createRadialGradient(x, baseY, 0, x, baseY, baseW * 0.6);
  gather.addColorStop(0, "rgba(255,255,245,0.35)"); gather.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gather; g.beginPath(); g.ellipse(x, baseY, baseW * 0.6, baseW * 0.3, 0, 0, TAU); g.fill();
  BEAM_SPRITES.set(rgb, canvas);
  return canvas;
}

/**
 * 在目前的變換下（原點＝道具接地中心點，單位＝世界像素）畫出道具箱體。
 * @param {CanvasRenderingContext2D} target
 * @param {{ id: string, englishName: string, category: string }} item
 * @param {number} time 動畫時間（毫秒）
 * @param {number} phase 讓不同道具的明滅錯開（毫秒）
 * @param {number} highlight 互動目標強度 0..1（游標指向或角色進入互動距離時為 1）：控制外光暈與光束動態
 * @returns {boolean} 該道具是否有箱體 Icon
 */
export function drawWorldItemIcon(target, item, time, phase = 0, highlight = 0) {
  const sprites = getItemSprites(item);
  if (!sprites) return false;
  const t = time + phase;
  // 非互動目標時光束靜止（不明滅、無流動光點）；成為互動目標時才動起來
  const active = Math.min(1, Math.max(0, highlight));
  const beamPulse = 0.8 + Math.sin(t / 2400) * 0.2 * active;
  const glowPulse = 0.75 + Math.sin(t / 1100) * 0.25;
  const glyphPulse = 0.7 + Math.sin(t / 1100) * 0.2;
  const baseY = -sprites.top * 0.8;
  target.save();
  // 光束先畫在物件後方：物件會擋住光束下段，看起來像從頂部升起
  target.globalCompositeOperation = "lighter";
  target.globalAlpha = beamPulse;
  target.drawImage(sprites.beam, -BEAM_W / 2, baseY - BEAM_OY, BEAM_W, BEAM_H);
  target.globalAlpha = 1;
  for (let i = 0; i < 3 && active > 0.001; i++) {
    const p = (t / 5000 + i / 3) % 1;
    const py = baseY - p * BEAM_L * 0.95, alpha = Math.sin(p * Math.PI) * 0.8 * active;
    const g = target.createRadialGradient(0, py, 0, 0, py, 3.6);
    g.addColorStop(0, `rgba(255,255,250,${alpha})`); g.addColorStop(1, `rgba(${sprites.rgb},0)`);
    target.fillStyle = g; target.beginPath(); target.ellipse(0, py, 2, 3.6, 0, 0, TAU); target.fill();
  }
  target.globalCompositeOperation = "source-over";
  target.drawImage(sprites.base, -BOX_OX, -BOX_OY, BOX, BOX);
  target.globalCompositeOperation = "lighter";
  target.globalAlpha = 0.55 + glyphPulse * 0.4;
  target.drawImage(sprites.glow, -BOX_OX, -BOX_OY, BOX, BOX);
  if (active > 0.001) {
    target.globalAlpha = active * 0.85 * glowPulse;
    target.drawImage(sprites.edge, -BOX_OX, -BOX_OY, BOX, BOX);
  }
  target.restore();
  return true;
}
