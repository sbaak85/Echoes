const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const point = (x, y) => ({ x, y });

function split(curve, t) {
  const a = lerp(curve[0], curve[1], t), b = lerp(curve[1], curve[2], t), c = lerp(curve[2], curve[3], t);
  const d = lerp(a, b, t), e = lerp(b, c, t);
  return [curve[0], a, d, lerp(d, e, t)];
}

// Convert the approved C/S/Q artwork to exact cubic curves once. The lookup
// table maps growth distance to curve time without DOM geometry reads per frame.
export function createVineGeometry(path) {
  const tokens = path.match(/[MCSQ]|-?\d+(?:\.\d+)?/g);
  const curves = [], table = [];
  let i = 0, current, control, length = 0;
  const readPoint = () => point(Number(tokens[i++]), Number(tokens[i++]));
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === 'M') { current = readPoint(); control = null; continue; }
    let c1, c2, end;
    if (command === 'C') { c1 = readPoint(); c2 = readPoint(); end = readPoint(); }
    else if (command === 'S') { c1 = control ? point(2 * current.x - control.x, 2 * current.y - control.y) : current; c2 = readPoint(); end = readPoint(); }
    else if (command === 'Q') { const q = readPoint(); end = readPoint(); c1 = lerp(current, q, 2 / 3); c2 = lerp(end, q, 2 / 3); }
    else throw new Error(`Unsupported vine path command: ${command}`);
    const curve = [current, c1, c2, end], index = curves.length;
    curves.push(curve);
    let previous = current;
    table.push({ length, index, t: 0 });
    for (let sample = 1; sample <= 64; sample++) {
      const t = sample / 64, next = split(curve, t)[3];
      length += Math.hypot(next.x - previous.x, next.y - previous.y);
      table.push({ length, index, t }); previous = next;
    }
    current = end; control = command === 'Q' ? null : c2;
  }
  return { curves, table, length };
}

export function vineGeometryAtReach(geometry, reach) {
  const distance = Math.max(0, Math.min(1, reach)) * geometry.length;
  const { table, curves } = geometry;
  let lo = 0, hi = table.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (table[mid].length < distance) lo = mid + 1; else hi = mid; }
  const upper = table[lo], lower = table[Math.max(0, lo - 1)];
  const span = upper.length - lower.length;
  const startT = lower.index === upper.index ? lower.t : 0;
  const t = span > 0 ? startT + (upper.t - startT) * (distance - lower.length) / span : upper.t;
  const partial = split(curves[upper.index], t);
  const visible = curves.slice(0, upper.index).concat([partial]);
  let tip = partial[3];
  const tangent = t > 0 ? point(tip.x - partial[2].x, tip.y - partial[2].y) : point(curves[0][1].x - curves[0][0].x, curves[0][1].y - curves[0][0].y);
  if (reach > 1) {
    const unit = Math.hypot(tangent.x, tangent.y) || 1;
    const end = point(tip.x + (reach - 1) * 1100 * tangent.x / unit, tip.y + (reach - 1) * 1100 * tangent.y / unit);
    visible.push([tip, lerp(tip, end, 1 / 3), lerp(tip, end, 2 / 3), end]); tip = end;
  }
  return { curves: visible, tip, tangent };
}

export const smoothVineProgress = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
