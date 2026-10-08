// Phototropic vines, drawn on one Canvas 2D per side.
// Each frame clears and redraws: stems are vector ribbons; leaves, pods and glows are
// sprites pre-rendered once, so a frame is mostly image copies (60 FPS where the old
// SVG renderer dropped to ~40-50 while the vines moved).
// Two woody tea-brown vines with rough bark and small thorns; three young vines with
// green/teal/violet gradients, several leaf shapes, coiled tendrils and a few glowing
// pods, tuned to the 趨光植物背景 artwork.
// Contract (unchanged from the SVG version): createPlantVines(hostL, hostR) returns
// { update(left, right, seconds, dt, growth) -> { L, R } motion, dispose() }.
import { createVineGeometry, vineGeometryAtReach, smoothVineProgress } from './phototropic-vine-geometry.js';

const STEMS = [
  'M -90 450 C 105 388 130 70 339 112 S 602 176 738 68 Q 804 11 929 88',
  'M -100 402 C 129 430 205 252 372 230 S 688 288 875 170 Q 950 120 1010 194',
  'M -80 498 C 167 441 238 389 414 344 S 694 356 814 295 Q 893 249 980 313',
  'M -50 470 C 153 407 208 483 377 452 S 634 420 771 447 Q 892 469 952 392',
  'M -110 218 C 47 162 184 244 297 176 S 525 49 661 104 Q 774 144 848 49',
];
// Two thick woody vines; three younger vines tinted teal, violet and green.
const STEM_STYLE = [
  { kind: 'wood', width: 32, tone: 1 },
  { kind: 'young', tint: 'teal', width: 13, tone: 1 },
  { kind: 'wood', width: 26, tone: 0 },
  { kind: 'young', tint: 'violet', width: 11, tone: 0 },
  { kind: 'young', tint: 'green', width: 9.5, tone: 0 },
];
// Per-side variations: the right half's teal vine uses the green/violet gradient.
const SIDE_STYLE = { L: {}, R: { 1: { tint: 'violet' } } };
// Only a few pods for the whole scene, near the screen edges. Stems enter the visible
// frame at roughly 30% of their length (roots sit off-screen), hence .32-.4.
const POD_LAYOUT = {
  L: [{ stem: 0, fraction: .34, color: 'amber' }, { stem: 2, fraction: .4, color: 'violet' }],
  R: [{ stem: 0, fraction: .36, color: 'amber' }],
};
// Gradient stops along a stem: [offset, colour]. The violet vine stays green and only
// blushes violet around a couple of nodes.
const YOUNG = {
  teal: { stops: [[0, '#34503a'], [.55, '#2c5f55'], [1, '#2a6f6c']], light: 'rgba(160,226,206,.36)', twig: '#4f7562', tendril: '#6fa190', node: 'cyan' },
  violet: {
    stops: [[0, '#465f39'], [.3, '#4f6a3c'], [.36, '#5c5470'], [.42, '#76489e'], [.48, '#5a5868'], [.55, '#557040'],
      [.73, '#5b7542'], [.79, '#6e4a96'], [.85, '#5e5a64'], [.91, '#62793f'], [1, '#6c8644']],
    light: 'rgba(204,224,160,.38)', twig: '#5f7048', tendril: '#86906a', node: 'violet',
  },
  green: { stops: [[0, '#4b6838'], [.55, '#5f7d40'], [1, '#79964a']], light: 'rgba(200,222,150,.40)', twig: '#667553', tendril: '#839769', node: 'cyan' },
};
// Tea-brown bark, mottled darker/lighter along the trunk, greening toward the tip.
const WOOD = { stops: [[0, '#3b281c'], [.18, '#5a3e2b'], [.3, '#4a3324'], [.45, '#67472f'], [.6, '#553a28'], [.78, '#634a33'], [1, '#524a38']], twig: '#5b5240', tendril: '#7f8a5c', node: 'amber' };
const LEAVES_PER_STEM = 10, LEAF_SPACING = .72 / (LEAVES_PER_STEM - 1);
const VIEW = { x0: -170, y0: -150, x1: 1410, y1: 690 };
const SAMPLES = 160, SPRITE_SCALE = 3, MAX_PIXEL_RATIO = 2, MAX_CANVAS_PIXELS = 4.5e6, DEG = Math.PI / 180;
const LEAF_BOX = { x: -8, y: -64, w: 144, h: 94 };
const SHADOW_BOX = { x: -20, y: -76, w: 168, h: 118 };
const POD_BOX = { x: -20, y: -24, w: 40, h: 48 };

// Leaf shapes: base at the origin, tip toward +x, same orientation as the original.
const SHAPES = {
  lance: { d: 'M 0 0 C 14 -9 21 -33 52 -44 C 81 -53 100 -40 122 -42 C 104 -24 90 7 59 10 C 33 12 13 4 0 0 Z', ctrl: { x: 62, y: -24 }, tip: { x: 120, y: -42 }, veins: 7, reach: 15 },
  heart: { d: 'M 0 0 C -4 -20 16 -38 42 -36 C 64 -34 90 -44 118 -46 C 104 -24 96 4 68 16 C 44 26 10 20 0 0 Z', ctrl: { x: 60, y: -18 }, tip: { x: 116, y: -45 }, veins: 6, reach: 21 },
  slender: { d: 'M 0 0 C 26 -12 58 -30 130 -38 C 98 -20 62 -2 30 4 C 16 6 6 4 0 0 Z', ctrl: { x: 66, y: -20 }, tip: { x: 128, y: -37 }, veins: 9, reach: 8 },
  round: { d: 'M 0 0 C 6 -30 38 -56 76 -52 C 104 -48 120 -32 122 -27 C 106 -6 82 18 46 16 C 22 14 6 8 0 0 Z', ctrl: { x: 60, y: -22 }, tip: { x: 120, y: -28 }, veins: 6, reach: 22 },
};
const SCHEMES = {
  jungle: { stops: ['#0f3326', '#2f6142', '#6f9150', '#b2c77e'], rim: 'rgba(196,216,142,.55)', margin: 'rgba(200,232,150,.16)', vein: 'rgba(214,232,170,.34)' },
  teal: { stops: ['#0b302f', '#1f5f57', '#4b9a7e', '#a8d6b6'], rim: 'rgba(170,230,210,.5)', margin: 'rgba(150,240,220,.16)', vein: 'rgba(190,240,222,.32)' },
  dusk: { stops: ['#13301f', '#345f3c', '#5f8247', '#9fb070'], rim: 'rgba(206,150,255,.62)', margin: 'rgba(190,120,255,.30)', vein: 'rgba(214,190,240,.32)' },
  violet: { stops: ['#24123a', '#55307c', '#9563c2', '#e2bcff'], rim: 'rgba(236,200,255,.6)', margin: 'rgba(230,180,255,.32)', vein: 'rgba(246,220,255,.42)', dots: 'rgba(255,236,255,.95)', glow: 'rgba(214,150,255,.9)' },
  glow: { stops: ['#0b2a33', '#1b5a68', '#46aab2', '#c6f4ee'], rim: 'rgba(190,255,246,.6)', margin: 'rgba(150,255,240,.30)', vein: 'rgba(220,255,250,.40)', dots: 'rgba(230,255,252,.95)', glow: 'rgba(120,240,230,.9)' },
};
// Leaf variety per vine: [shape, scheme, weight].
const LEAF_MIX = {
  wood: [['heart', 'jungle', 4], ['lance', 'jungle', 3], ['round', 'dusk', 2], ['lance', 'teal', 1]],
  teal: [['lance', 'teal', 4], ['slender', 'teal', 2], ['round', 'glow', 2], ['heart', 'jungle', 2]],
  // Mostly green; violet leaves are an occasional accent.
  violet: [['lance', 'jungle', 4], ['heart', 'jungle', 3], ['lance', 'dusk', 2], ['round', 'violet', 1]],
  green: [['lance', 'jungle', 4], ['heart', 'jungle', 3], ['slender', 'teal', 2], ['round', 'dusk', 1]],
};
const POD_COLORS = {
  amber: { stops: ['rgba(255,244,214,.98)', 'rgba(255,198,120,.82)', 'rgba(206,116,52,.62)', 'rgba(86,38,18,.72)'], line: 'rgba(255,226,176,.55)', halo: [255, 186, 96] },
  cyan: { stops: ['rgba(226,255,250,.98)', 'rgba(126,232,218,.8)', 'rgba(40,142,138,.6)', 'rgba(12,54,56,.72)'], line: 'rgba(200,255,246,.5)', halo: [96, 236, 222] },
  violet: { stops: ['rgba(248,230,255,.98)', 'rgba(198,146,240,.8)', 'rgba(112,60,160,.62)', 'rgba(42,18,64,.74)'], line: 'rgba(240,210,255,.5)', halo: [196, 128, 255] },
};
const LEAF_TONES = [0, .3];

function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (rng, mix) => { const total = mix.reduce((n, m) => n + m[2], 0); let r = rng() * total; for (const m of mix) { r -= m[2]; if (r <= 0) return m; } return mix[0]; };

function sprite(box, draw, scale = SPRITE_SCALE) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(box.w * scale); cv.height = Math.ceil(box.h * scale);
  const x = cv.getContext('2d'); x.scale(scale, scale); x.translate(-box.x, -box.y); draw(x);
  return cv;
}
const quad = (p0, c, p2, t) => { const u = 1 - t; return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y }; };
const quadTangent = (p0, c, p2, t) => ({ x: 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p2.x - c.x), y: 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p2.y - c.y) });

function makeLeafSprite(shape, scheme, tone) {
  return sprite(LEAF_BOX, x => {
    const leaf = new Path2D(shape.d), base = { x: 1, y: 0 };
    const body = x.createLinearGradient(0, 12, shape.tip.x * .85, shape.tip.y - 12);
    scheme.stops.forEach((c, i) => body.addColorStop([0, .42, .74, 1][i], c));
    x.fillStyle = body; x.fill(leaf);
    x.save(); x.clip(leaf);
    // Lower half in the leaf's own shadow: reads as a folded midrib.
    x.fillStyle = 'rgba(2,16,12,.32)';
    x.fill(new Path2D(`M -8 4 L ${base.x} ${base.y} Q ${shape.ctrl.x} ${shape.ctrl.y} ${shape.tip.x + 4} ${shape.tip.y} L ${shape.tip.x + 10} 40 L -8 40 Z`));
    const mid = quad(base, shape.ctrl, shape.tip, .5);
    const sheen = x.createRadialGradient(mid.x, mid.y - 8, 1, mid.x, mid.y - 8, 48);
    sheen.addColorStop(0, 'rgba(236,255,214,.22)'); sheen.addColorStop(1, 'rgba(236,255,214,0)');
    x.fillStyle = sheen; x.fillRect(LEAF_BOX.x, LEAF_BOX.y, LEAF_BOX.w, LEAF_BOX.h);
    x.strokeStyle = scheme.margin; x.lineWidth = 6; x.stroke(leaf);
    x.lineCap = 'round';
    const dots = [];
    for (let i = 1; i <= shape.veins; i++) {
      const t = i / (shape.veins + 1.4), p = quad(base, shape.ctrl, shape.tip, t), d = quadTangent(base, shape.ctrl, shape.tip, t);
      const len = Math.hypot(d.x, d.y), tx = d.x / len, ty = d.y / len, nx = ty, ny = -tx, reach = (1 - t * .55) * shape.reach;
      for (const sign of [1, -1]) {
        const ex = p.x + tx * reach * .9 + nx * reach * sign, ey = p.y + ty * reach * .9 + ny * reach * sign;
        x.beginPath(); x.moveTo(p.x, p.y);
        x.quadraticCurveTo(p.x + tx * 7 + nx * reach * .45 * sign, p.y + ty * 7 + ny * reach * .45 * sign, ex, ey);
        x.strokeStyle = sign > 0 ? scheme.vein : 'rgba(150,190,140,.2)'; x.lineWidth = .6; x.stroke();
        if (scheme.dots && i % 2 === 1) dots.push([p.x + (ex - p.x) * .7, p.y + (ey - p.y) * .7]);
      }
    }
    const midrib = new Path2D(`M 1 0 Q ${shape.ctrl.x} ${shape.ctrl.y} ${shape.tip.x} ${shape.tip.y}`);
    x.strokeStyle = 'rgba(16,30,22,.35)'; x.lineWidth = 2.2; x.stroke(midrib);
    x.strokeStyle = scheme.dots ? 'rgba(250,230,255,.75)' : 'rgba(222,238,180,.7)'; x.lineWidth = 1.1; x.stroke(midrib);
    // Bioluminescent specks (baked; the glow is free at runtime).
    if (scheme.dots) {
      x.shadowColor = scheme.glow; x.shadowBlur = 4 * SPRITE_SCALE; x.fillStyle = scheme.dots;
      for (const [px, py] of dots) { x.beginPath(); x.arc(px, py, 1.15, 0, Math.PI * 2); x.fill(); }
      x.shadowBlur = 0;
    }
    if (tone > 0) { x.fillStyle = `rgba(3,10,12,${tone})`; x.fillRect(LEAF_BOX.x, LEAF_BOX.y, LEAF_BOX.w, LEAF_BOX.h); }
    x.restore();
    x.strokeStyle = scheme.rim; x.globalAlpha = 1 - tone; x.lineWidth = .8; x.stroke(leaf);
  });
}
function makeShadowSprite(shape) {
  return sprite(SHADOW_BOX, x => {
    if ('filter' in x) x.filter = `blur(${3.4 * SPRITE_SCALE}px)`;
    x.fillStyle = 'rgba(0,6,6,.55)'; x.fill(new Path2D(shape.d));
  });
}
function makePodSprite(color) {
  return sprite(POD_BOX, x => {
    const rx = 12, ry = 15;
    const g = x.createRadialGradient(-4, -5, 1, 0, 0, ry * 1.05);
    color.stops.forEach((c, i) => g.addColorStop([0, .35, .75, 1][i], c));
    x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); x.fill();
    // Lattice of meridians and rings, like the orbs in the background.
    x.save(); x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); x.clip();
    x.strokeStyle = color.line; x.lineWidth = .7;
    for (const k of [-.66, -.33, 0, .33, .66]) { x.beginPath(); x.ellipse(0, 0, Math.abs(k) * rx + .5, ry, 0, k < 0 ? Math.PI / 2 : -Math.PI / 2, k < 0 ? Math.PI * 1.5 : Math.PI / 2); x.stroke(); }
    for (const k of [-.5, 0, .5]) { x.beginPath(); x.ellipse(0, k * ry, rx * Math.sqrt(1 - k * k), 2.2, 0, 0, Math.PI * 2); x.stroke(); }
    const core = x.createRadialGradient(0, 2, 0, 0, 2, 7); core.addColorStop(0, 'rgba(255,255,240,.95)'); core.addColorStop(1, 'rgba(255,255,240,0)');
    x.fillStyle = core; x.fillRect(-rx, -ry, rx * 2, ry * 2);
    x.restore();
    x.strokeStyle = 'rgba(40,20,10,.55)'; x.lineWidth = .9; x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(-4.5, -7, 2.4, 3.6, -.5, 0, Math.PI * 2); x.fill();
    // Calyx where the stalk joins.
    x.fillStyle = '#2b2a1c'; x.beginPath(); x.moveTo(-5, -ry + 2); x.quadraticCurveTo(0, -ry - 5, 5, -ry + 2); x.quadraticCurveTo(0, -ry + 5, -5, -ry + 2); x.fill();
  }, 4);
}
function makeHaloSprite([r, g, b]) {
  const size = 96, cv = document.createElement('canvas'); cv.width = cv.height = size;
  const x = cv.getContext('2d'), grad = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},.85)`); grad.addColorStop(.25, `rgba(${r},${g},${b},.38)`);
  grad.addColorStop(.6, `rgba(${r},${g},${b},.1)`); grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad; x.fillRect(0, 0, size, size);
  return cv;
}
// Coiled tendril in local space (u along the launch direction, v sideways).
const COIL = (() => { const pts = []; for (let a = 0; a <= 1.0001; a += .04) { const th = a * 3.4 * Math.PI, r = 13 * (1 - a * .78); pts.push([26 * a + r * Math.sin(th), -r * (1 - Math.cos(th)) * .9]); } return pts; })();

export function createPlantVines(hostL, hostR) {
  const leafSprites = {}, shadowSprites = {};
  for (const [shapeName, shape] of Object.entries(SHAPES)) {
    shadowSprites[shapeName] = makeShadowSprite(shape);
    for (const mix of Object.values(LEAF_MIX)) for (const [s, scheme] of mix) {
      if (s !== shapeName) continue;
      const key = `${s}:${scheme}`;
      if (!leafSprites[key]) leafSprites[key] = LEAF_TONES.map(tone => makeLeafSprite(shape, SCHEMES[scheme], tone));
    }
  }
  const podSprites = Object.fromEntries(Object.entries(POD_COLORS).map(([k, c]) => [k, makePodSprite(c)]));
  const haloSprites = Object.fromEntries(Object.entries(POD_COLORS).map(([k, c]) => [k, makeHaloSprite(c.halo)]));
  const sides = [buildSide('L', hostL), buildSide('R', hostR)];
  const observer = new ResizeObserver(() => sides.forEach(side => { side.dirty = true; }));
  sides.forEach(side => observer.observe(side.host));

  function buildSide(side, host) {
    host.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.className = 'vine-art'; canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;pointer-events:none';
    host.append(canvas);
    const rng = random(side === 'L' ? 812 : 1973), art = random(side === 'L' ? 4421 : 9377);
    const rigs = STEMS.map((d, i) => {
      const style = { ...STEM_STYLE[i], ...SIDE_STYLE[side][i] }, geometry = createVineGeometry(d);
      const sx = new Float32Array(SAMPLES + 1), sy = new Float32Array(SAMPLES + 1);
      for (let k = 0; k <= SAMPLES; k++) { const p = vineGeometryAtReach(geometry, k / SAMPLES).tip; sx[k] = p.x; sy[k] = p.y; }
      const end = vineGeometryAtReach(geometry, 1).tangent, endLength = Math.hypot(end.x, end.y) || 1;
      const mix = LEAF_MIX[style.kind === 'wood' ? 'wood' : style.tint];
      const leaves = [];
      for (let j = 0; j < LEAVES_PER_STEM; j++) {
        // Same core rng order as the SVG renderer keeps the leaf layout comparable.
        const flip = j % 2 === 0, category = rng();
        const size = (category < .3 ? .22 + rng() * .13 : category < .75 ? .43 + rng() * .2 : .78 + rng() * .24) * (j >= LEAVES_PER_STEM - 3 ? .82 : 1);
        const offset = (flip ? -18 : 52) + rng() * 26, phase = rng() * 6.28;
        const swayDuration = 4 + rng() * 4, swayDelay = rng() * 9, swayDeg = 2 + rng() * 3;
        const [shape, scheme] = pick(art, mix), [extraShape, extraScheme] = pick(art, mix);
        leaves.push({ fraction: .14 + j * LEAF_SPACING, flip, size: size * (.9 + art() * .25), offset, phase, swayDuration, swayDelay, swayDeg,
          key: `${shape}:${scheme}`, shape, extraKey: `${extraShape}:${extraScheme}`, extra: j % 3 === 1, tendril: j % 4 === 0, coil: style.kind === 'young' && j % 4 === 2 });
      }
      const pods = POD_LAYOUT[side].filter(p => p.stem === i)
        .map(p => ({ fraction: p.fraction, color: p.color, size: 1.45 + art() * .55, stalk: 22 + art() * 14, phase: art() * 6.28 }));
      const thorns = [];
      if (style.kind === 'wood' || style.tint === 'violet') {
        // Woody vines: many small prickles; the violet vine keeps a few fine ones.
        const density = style.kind === 'wood' ? .016 : .06;
        for (let f = .06; f < .96; f += density * (.6 + art() * .9)) thorns.push({ fraction: f, side: art() < .5 ? -1 : 1, length: (style.kind === 'wood' ? 6 : 5) * (.65 + art() * .7), lean: .45 + art() * .55 });
      }
      const capacity = Math.ceil(SAMPLES * 1.25) + 4;
      // Bark detail, precomputed once per woody vine: a ragged silhouette, short fissures
      // and light fibre flecks across the trunk, plus a few knots.
      const rough = new Float32Array(capacity), cracks = [], knots = [];
      if (style.kind === 'wood') {
        let walk = .5;
        for (let k = 0; k < capacity; k++) { walk = clamp(walk + (art() - .5) * .55, 0, 1); rough[k] = walk * .6 + art() * .4; }
        for (let m = 0; m < 340; m++) {
          const light = art() < .3, c0 = light ? -.42 + art() * .4 : -.44 + art() * .88;
          cracks.push({ k: Math.floor(art() * (SAMPLES - 6)), span: 1 + Math.floor(art() * (light ? 2 : 5)), c0, c1: c0 + (art() - .5) * .14, light, width: light ? .55 + art() * .35 : .6 + art() * .8 });
        }
        for (let m = 0; m < 3; m++) knots.push({ k: Math.floor((.18 + m * .26 + art() * .1) * SAMPLES), c: (art() - .5) * .4, size: .22 + art() * .1 });
      }
      return {
        index: i, style, geometry, length: geometry.length, sx, sy, endX: end.x / endLength, endY: end.y / endLength,
        rootX: sx[0], rootY: sy[0], leaves, pods, thorns, rough, cracks, knots, palette: style.kind === 'wood' ? WOOD : YOUNG[style.tint],
        swayDeg: (i % 2 ? -.45 : .6) * (style.kind === 'wood' ? .6 : 1), swayDuration: 7 + i * 1.3, swayDelay: i * 1.7, wrapPhase: art() * 6.28,
        px: new Float32Array(capacity), py: new Float32Array(capacity), pw: new Float32Array(capacity),
        nx: new Float32Array(capacity), ny: new Float32Array(capacity),
        previous: 0, energy: 0, motionReach: undefined,
      };
    });
    return { side, host, canvas, ctx: canvas.getContext('2d'), rigs, dirty: true, k: 1, glows: [] };
  }

  function resize(side) {
    const w = side.host.clientWidth, h = side.host.clientHeight;
    const s = Math.min(w / 1000, h / 520), ox = (w - 1000 * s) / 2, oy = (h - 520 * s) / 2;
    const cssW = (VIEW.x1 - VIEW.x0) * s, cssH = (VIEW.y1 - VIEW.y0) * s;
    // Sharp on HiDPI screens, but each side's backing store stays within a pixel budget.
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, cssW * cssH)));
    Object.assign(side.canvas.style, { left: `${ox + VIEW.x0 * s}px`, top: `${oy + VIEW.y0 * s}px`, width: `${cssW}px`, height: `${cssH}px` });
    side.canvas.width = Math.max(1, Math.round(cssW * ratio)); side.canvas.height = Math.max(1, Math.round(cssH * ratio));
    side.k = side.canvas.width / (VIEW.x1 - VIEW.x0);
    side.dirty = false;
  }

  let PX = 0, PY = 0;
  function pointAt(rig, f) {
    if (f >= 1) { const e = (f - 1) * 1100; PX = rig.sx[SAMPLES] + rig.endX * e; PY = rig.sy[SAMPLES] + rig.endY * e; return; }
    const at = Math.max(0, f) * SAMPLES, k = Math.min(SAMPLES - 1, at | 0), t = at - k;
    PX = rig.sx[k] + (rig.sx[k + 1] - rig.sx[k]) * t; PY = rig.sy[k] + (rig.sy[k + 1] - rig.sy[k]) * t;
  }
  // `ragged` > 0 roughens the silhouette with the vine's precomputed bark noise.
  function ribbon(ctx, rig, n, center, half, add, ragged = 0) {
    const { px, py, pw, nx, ny, rough } = rig;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const o = pw[k] * center - (pw[k] * half + add + rough[k] * ragged);
      if (k) ctx.lineTo(px[k] + nx[k] * o, py[k] + ny[k] * o); else ctx.moveTo(px[k] + nx[k] * o, py[k] + ny[k] * o);
    }
    for (let k = n - 1; k >= 0; k--) { const o = pw[k] * center + (pw[k] * half + add + rough[(k + 7) % rough.length] * ragged); ctx.lineTo(px[k] + nx[k] * o, py[k] + ny[k] * o); }
    ctx.closePath();
  }
  function offsetLine(ctx, rig, n, center, wave = 0, frequency = 0, phase = 0) {
    const { px, py, pw, nx, ny } = rig;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const o = pw[k] * (center + (wave ? Math.sin(k * frequency + phase) * wave : 0));
      if (k) ctx.lineTo(px[k] + nx[k] * o, py[k] + ny[k] * o); else ctx.moveTo(px[k] + nx[k] * o, py[k] + ny[k] * o);
    }
  }

  function drawStem(ctx, rig, n) {
    const { style, palette, px, py, pw, nx, ny } = rig, wood = style.kind === 'wood';
    // Anchored to the full-length stem, so colour bands stay on their nodes while it retracts.
    const along = ctx.createLinearGradient(px[0], py[0], rig.sx[SAMPLES], rig.sy[SAMPLES]);
    palette.stops.forEach(([offset, color]) => along.addColorStop(offset, color));
    ctx.translate(3, 9); ribbon(ctx, rig, n, .15, .5, 7); ctx.fillStyle = 'rgba(0,8,6,.14)'; ctx.fill();
    ribbon(ctx, rig, n, .15, .5, 3); ctx.fillStyle = 'rgba(0,8,6,.24)'; ctx.fill(); ctx.translate(-3, -9);
    ribbon(ctx, rig, n, 0, .5, wood ? 3 : 2.6, wood ? 1.9 : 0); ctx.fillStyle = wood ? 'rgba(18,10,6,.92)' : 'rgba(6,22,20,.88)'; ctx.fill();
    ribbon(ctx, rig, n, 0, .5, 0, wood ? 1.1 : 0); ctx.fillStyle = along; ctx.fill();
    ribbon(ctx, rig, n, .27, .23, 0); ctx.fillStyle = wood ? 'rgba(14,7,4,.5)' : 'rgba(6,18,14,.42)'; ctx.fill();
    ribbon(ctx, rig, n, -.23, .13, 0); ctx.fillStyle = wood ? 'rgba(204,156,112,.30)' : palette.light; ctx.fill();
    ribbon(ctx, rig, n, -.33, .03, .25); ctx.fillStyle = wood ? 'rgba(244,210,172,.22)' : 'rgba(230,240,214,.26)'; ctx.fill();
    if (wood) {
      // Bark: many fine broken ridges along the grain.
      ctx.lineWidth = .8; ctx.strokeStyle = 'rgba(24,12,6,.62)';
      [[-.36, [9, 5, 15, 7]], [-.2, [13, 6, 7, 4]], [-.05, [6, 4, 18, 8]], [.1, [15, 7, 9, 5]], [.25, [7, 5, 12, 6]], [.38, [11, 6, 6, 4]]]
        .forEach(([c, dash]) => { ctx.setLineDash(dash); offsetLine(ctx, rig, n, c); ctx.stroke(); });
      ctx.setLineDash([5, 11, 9, 16]); offsetLine(ctx, rig, n, -.28); ctx.strokeStyle = 'rgba(222,178,134,.22)'; ctx.lineWidth = .6; ctx.stroke();
      ctx.setLineDash([]);
      // Short fissures (dark) and worn fibre flecks (light), fixed to the trunk.
      const dark = new Path2D(), light = new Path2D(), darkThick = new Path2D();
      for (const c of rig.cracks) {
        const a = c.k, b = c.k + c.span;
        if (b >= n) continue;
        const o0 = pw[a] * c.c0, o1 = pw[b] * c.c1, path = c.light ? light : c.width > 1 ? darkThick : dark;
        path.moveTo(px[a] + nx[a] * o0, py[a] + ny[a] * o0); path.lineTo(px[b] + nx[b] * o1, py[b] + ny[b] * o1);
      }
      ctx.strokeStyle = 'rgba(18,9,4,.82)'; ctx.lineWidth = .75; ctx.stroke(dark);
      ctx.lineWidth = 1.4; ctx.stroke(darkThick);
      ctx.strokeStyle = 'rgba(230,190,146,.34)'; ctx.lineWidth = .6; ctx.stroke(light);
      // A faint twist in the grain (kept subtle so the trunk doesn't read as rope).
      ctx.beginPath();
      for (let k = 3; k + 3 < n; k += 6) {
        const a = -.46 * pw[k], b = .46 * pw[k + 3];
        ctx.moveTo(px[k] + nx[k] * a, py[k] + ny[k] * a);
        ctx.quadraticCurveTo(px[k + 2], py[k + 2], px[k + 3] + nx[k + 3] * b, py[k + 3] + ny[k + 3] * b);
      }
      ctx.strokeStyle = 'rgba(30,16,9,.16)'; ctx.lineWidth = 1.1; ctx.stroke();
      // Knots: a dark socket with a lit upper rim.
      for (const knot of rig.knots) {
        if (knot.k >= n - 2) continue;
        const o = pw[knot.k] * knot.c, x = px[knot.k] + nx[knot.k] * o, y = py[knot.k] + ny[knot.k] * o;
        const r = pw[knot.k] * knot.size, angle = Math.atan2(ny[knot.k], nx[knot.k]) + Math.PI / 2;
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r, angle, 0, Math.PI * 2); ctx.fillStyle = 'rgba(26,13,7,.75)'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r, angle, Math.PI, Math.PI * 2); ctx.strokeStyle = 'rgba(214,170,124,.35)'; ctx.lineWidth = .8; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x, y + r * .15, r * .6, r * .38, angle, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,4,2,.8)'; ctx.fill();
      }
      // A thin young vine spirals around the woody trunk.
      offsetLine(ctx, rig, n, 0, .55, .21, rig.wrapPhase); ctx.strokeStyle = '#4e6a3c'; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.strokeStyle = 'rgba(196,224,150,.32)'; ctx.lineWidth = .8; ctx.stroke();
    } else {
      ctx.lineWidth = .9; ctx.setLineDash([2, 21, 3, 15]);
      offsetLine(ctx, rig, n, .08); ctx.strokeStyle = 'rgba(16,26,20,.42)'; ctx.stroke();
      ctx.setLineDash([1, 17, 2, 24]); offsetLine(ctx, rig, n, -.12); ctx.strokeStyle = 'rgba(214,226,190,.18)'; ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawSide(side, left, right, seconds, dt, growth) {
    if (side.dirty) resize(side);
    const { ctx, canvas, k } = side, ox = -VIEW.x0 * k, oy = -VIEW.y0 * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let motion = 0;
    const glows = side.glows; glows.length = 0;
    const placeSprite = (image, box, X, Y, angle, sx, sy) => {
      const c = Math.cos(angle) * k, s = Math.sin(angle) * k;
      ctx.setTransform(c * sx, s * sx, -s * sy, c * sy, X * k + ox, Y * k + oy);
      ctx.drawImage(image, box.x, box.y, box.w, box.h);
    };
    for (const rig of side.rigs) {
      const displacement = side.side === 'L' ? left : -right;
      rig.energy += (Math.min(1, Math.abs(displacement - rig.previous) / Math.max(dt, .001) / 24) - rig.energy) * (1 - Math.exp(-dt * 5));
      rig.previous = displacement;
      const energy = rig.energy, reach = clamp(1 + displacement * .012, 0, 1.25) * clamp(growth, 0, 1);
      // Vine audio follows only puzzle-driven movement (growth/retraction and the motion
      // wave), never the idle sway, so a resting plant stays silent.
      if (dt > 0 && rig.motionReach !== undefined) motion = Math.max(motion, Math.abs(reach - rig.motionReach) / dt, energy * .012);
      rig.motionReach = reach;
      if (reach <= .0005) continue;
      const { style, palette } = rig, wood = style.kind === 'wood', tone = style.tone;
      const rot = rig.swayDeg * DEG * -Math.cos(Math.PI * (seconds + rig.swayDelay) / rig.swayDuration);
      const cr = Math.cos(rot), sr = Math.sin(rot), i = rig.index, waveAmp = wood ? .5 : 1;
      const warp = () => {
        const u = clamp(PX / 1010, 0, 1);
        const y = PY + (Math.sin(u * 8 - seconds * 2 + i) * energy * 3 + Math.sin(u * 5.5 - seconds * 1.15 + i * 1.7) * .9) * u * waveAmp;
        const dx = PX - rig.rootX, dy = y - rig.rootY;
        PX = rig.rootX + dx * cr - dy * sr; PY = rig.rootY + dx * sr + dy * cr;
      };
      const step = 1 / SAMPLES, { px, py, pw, nx, ny } = rig;
      let n = 0;
      for (let f = 0; ; f += step) {
        const last = f >= reach, ff = last ? reach : f;
        pointAt(rig, ff); warp(); px[n] = PX; py[n] = PY;
        const taper = smoothVineProgress((reach - ff) * rig.length / (wood ? 120 : 80));
        pw[n] = style.width * (wood ? 1.22 - .55 * Math.min(ff, 1.2) : 1.1 - .5 * Math.min(ff, 1.2)) * (.18 + .82 * taper);
        n++;
        if (last) break;
      }
      if (n < 2) continue;
      for (let j = 0; j < n; j++) {
        const a = Math.max(0, j - 1), b = Math.min(n - 1, j + 1), tx = px[b] - px[a], ty = py[b] - py[a], len = Math.hypot(tx, ty) || 1;
        nx[j] = -ty / len; ny[j] = tx / len;
      }
      const tipX = px[n - 1], tipY = py[n - 1];

      drawStem(ctx, rig, n);

      // Thorns lean toward the growing tip.
      if (rig.thorns.length) {
        const thorns = new Path2D(), shine = new Path2D();
        for (const t of rig.thorns) {
          if (t.fraction > reach - .03) continue;
          const kk = Math.min(n - 1, Math.round(t.fraction * SAMPLES)), tx = ny[kk], ty = -nx[kk];
          const ox2 = nx[kk] * t.side, oy2 = ny[kk] * t.side, half = pw[kk] * .46;
          const bx = px[kk] + ox2 * half, by = py[kk] + oy2 * half;
          const dx = ox2 * (1 - t.lean * .5) + tx * t.lean, dy = oy2 * (1 - t.lean * .5) + ty * t.lean, dl = Math.hypot(dx, dy);
          const ex = bx + dx / dl * t.length, ey = by + dy / dl * t.length, bw = t.length * .32;
          thorns.moveTo(bx - tx * bw, by - ty * bw); thorns.quadraticCurveTo(bx + dx / dl * t.length * .5, by + dy / dl * t.length * .5, ex, ey);
          thorns.lineTo(bx + tx * bw, by + ty * bw); thorns.closePath();
          shine.moveTo(bx - tx * bw * .3, by - ty * bw * .3); shine.lineTo(ex, ey);
        }
        ctx.fillStyle = wood ? '#2a1910' : '#26301f'; ctx.fill(thorns);
        ctx.strokeStyle = wood ? 'rgba(232,196,150,.45)' : 'rgba(206,224,170,.3)'; ctx.lineWidth = .55; ctx.stroke(shine);
      }

      const twigs = new Path2D(), tendrils = new Path2D(), drawn = [];
      for (const leaf of rig.leaves) {
        const emerge = smoothVineProgress((reach - leaf.fraction) / .055);
        if (emerge <= 0) continue;
        pointAt(rig, leaf.fraction); warp(); const x = PX, y = PY;
        pointAt(rig, leaf.fraction + 2 / rig.length); warp();
        const o = Math.atan2(PY - y, PX - x) + (leaf.offset + (1 - emerge) * 35 + energy * Math.sin(seconds * 2 + leaf.phase) * 3) * DEG;
        const c = Math.cos(o), s = Math.sin(o), tw = (u, v) => [x + u * c - v * s, y + u * s + v * c];
        const t0 = tw(0, 0), t1 = tw(12, leaf.flip ? -7 : 7), t2 = tw(28, 0);
        twigs.moveTo(t0[0], t0[1]); twigs.quadraticCurveTo(t1[0], t1[1], t2[0], t2[1]);
        if (leaf.tendril) {
          const q = [[0, 0], [18, -22], [58, -23], [61, -8], [64, 7], [44, 15], [40, 1], [37, -7], [48, -12], [52, -6]].map(([u, v]) => tw(u, v));
          tendrils.moveTo(q[0][0], q[0][1]);
          for (let m = 1; m < q.length; m += 3) tendrils.bezierCurveTo(q[m][0], q[m][1], q[m + 1][0], q[m + 1][1], q[m + 2][0], q[m + 2][1]);
          // Faint nodes only on the young vines; woody vines keep their light for the pods.
          if (!wood) { const g = tw(5, -4); glows.push(g[0], g[1], emerge * .45, leaf.phase, palette.node, 5); }
        }
        if (leaf.coil) {
          // Coiled tendril launched from the opposite side of the leaf.
          const cc = Math.cos(o + Math.PI * .62), ss = Math.sin(o + Math.PI * .62), coil = Math.sin(seconds * 1.4 + leaf.phase) * .12;
          COIL.forEach(([u, v], m) => { const vv = v * (1 + coil * m / COIL.length); const X = x + u * cc - vv * ss, Y = y + u * ss + vv * cc; if (m) tendrils.lineTo(X, Y); else tendrils.moveTo(X, Y); });
        }
        const leafSway = leaf.swayDeg * DEG * -Math.cos(Math.PI * (seconds + leaf.swayDelay) / leaf.swayDuration);
        drawn.push(leaf, x + 24 * c, y + 24 * s, o + leafSway, x, y, o, emerge);
      }
      ctx.lineWidth = 2.2; ctx.strokeStyle = palette.twig; ctx.stroke(twigs);
      for (let m = 0; m < drawn.length; m += 8) {
        const leaf = drawn[m];
        ctx.globalAlpha = drawn[m + 7] * .8;
        placeSprite(shadowSprites[leaf.shape], SHADOW_BOX, drawn[m + 1] + 3, drawn[m + 2] + 7, drawn[m + 3], leaf.size, leaf.flip ? leaf.size : -leaf.size);
      }
      for (let m = 0; m < drawn.length; m += 8) {
        const leaf = drawn[m], emerge = drawn[m + 7];
        ctx.globalAlpha = emerge;
        placeSprite(leafSprites[leaf.key][tone], LEAF_BOX, drawn[m + 1], drawn[m + 2], drawn[m + 3], leaf.size, leaf.flip ? leaf.size : -leaf.size);
        if (leaf.extra) {
          ctx.globalAlpha = emerge * .94;
          placeSprite(leafSprites[leaf.extraKey][tone], LEAF_BOX, drawn[m + 4], drawn[m + 5], drawn[m + 6] - 58 * DEG, leaf.size * .54, leaf.size * .54);
        }
      }
      ctx.globalAlpha = 1; ctx.setTransform(k, 0, 0, k, ox, oy);
      const a = Math.atan2(tipY - py[n - 2], tipX - px[n - 2]), c = Math.cos(a), s = Math.sin(a), curl = energy * Math.sin(seconds * 3 + i) * 5;
      const tt = (u, v) => [tipX + u * c - v * s, tipY + u * s + v * c];
      const p0 = tt(-12, 0), p1 = tt(12, -18 - curl), p2 = tt(24, -6), p3 = tt(31, 12 + curl), p4 = tt(10, 13);
      tendrils.moveTo(p0[0], p0[1]); tendrils.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); tendrils.quadraticCurveTo(p3[0], p3[1], p4[0], p4[1]);
      ctx.lineWidth = 1.7; ctx.strokeStyle = palette.tendril; ctx.globalAlpha = .9; ctx.stroke(tendrils); ctx.globalAlpha = 1;

      // Glowing pods hang from short stalks and swing gently.
      for (const pod of rig.pods) {
        const emerge = smoothVineProgress((reach - pod.fraction) / .06);
        if (emerge <= 0) continue;
        const kk = Math.min(n - 1, Math.round(pod.fraction * SAMPLES)), side2 = ny[kk] >= 0 ? 1 : -1;
        const bx = px[kk] + nx[kk] * side2 * pw[kk] * .45, by = py[kk] + ny[kk] * side2 * pw[kk] * .45;
        const swing = Math.sin(seconds * 1.1 + pod.phase) * 6 * DEG + energy * Math.sin(seconds * 3 + pod.phase) * 8 * DEG;
        const L = pod.stalk * emerge, ex = bx + Math.sin(swing) * L, ey = by + Math.cos(swing) * L;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.sin(swing) * L * .2 + 4, by + L * .5, ex, ey);
        ctx.strokeStyle = palette.twig; ctx.lineWidth = 1.8; ctx.stroke();
        // The pod hangs along the stalk's swing direction, its top at the stalk end.
        const scale = pod.size * emerge, cx = ex + Math.sin(swing) * 13 * scale, cy = ey + Math.cos(swing) * 13 * scale;
        ctx.globalAlpha = emerge;
        placeSprite(podSprites[pod.color], POD_BOX, cx, cy, -swing, scale, scale);
        ctx.globalAlpha = 1; ctx.setTransform(k, 0, 0, k, ox, oy);
        glows.push(cx, cy, emerge * .85, pod.phase, pod.color, 30 * pod.size);
      }
    }
    // Additive light: pods and nodes breathe slowly.
    ctx.globalCompositeOperation = 'lighter';
    for (let m = 0; m < glows.length; m += 6) {
      const breathe = .5 + .5 * Math.sin(seconds * 1.25 + glows[m + 3]);
      ctx.globalAlpha = glows[m + 2] * (.35 + .4 * breathe);
      const r = glows[m + 5] * (.9 + .15 * breathe);
      ctx.drawImage(haloSprites[glows[m + 4]], glows[m] - r, glows[m + 1] - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    return motion;
  }

  function update(left, right, seconds, dt, growth = 1) {
    return { L: drawSide(sides[0], left, right, seconds, dt, growth), R: drawSide(sides[1], left, right, seconds, dt, growth) };
  }
  return { update, dispose() { observer.disconnect(); hostL.replaceChildren(); hostR.replaceChildren(); } };
}
