import { CARDS, SLOTS, EMPTY, routeFor, insertCard, removeCard, swapDetachedCard, evaluate, advanceCharge } from './model.mjs';
import { installInput } from './input.mjs';
import { installCardDrag } from './drag.mjs';
import { embedded, initialOwner, notifyHost } from './host.mjs';
import { SUCCESS_MESSAGE, createCompletionSequence } from './completion.mjs';

const $ = id => document.getElementById(id);
const ns = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, parent) => {
  const element = document.createElementNS(ns, tag);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  parent?.append(element);
  return element;
};
let slots = EMPTY(), selected = null, moves = 0, complete = false, stableFor = 0, hintLevel = 0;
let soundEnabled = false, audio = null, lastTime = performance.now();
let drag = null;
let successLocked = false;
const consolePanel = document.querySelector('.console');
const successMessage = $('success-message');
successMessage.querySelector('p').textContent = SUCCESS_MESSAGE;
const completion = createCompletionSequence({
  present: ({ phase, opacity }) => {
    successMessage.hidden = phase === 'hidden';
    successMessage.dataset.phase = phase;
    successMessage.style.opacity = String(opacity);
  },
  finish: completedSlots => {
    notifyHost('complete', { slots: completedSlots });
    // Standalone previews remain playable after the same success presentation.
    if (!embedded) {
      successLocked = false; consolePanel.inert = false;
      render();
    }
  },
});
window.addEventListener('pagehide', () => {
  completion.cancel(); successLocked = false; consolePanel.inert = false;
});
const animations = [];
// Horizontal routing inside the existing portrait chassis and SVG viewport.
const nodeX = node => 46 + node * 59;
const nodeY = node => [78, 78, 102, 78, 126, 78, 98, 78][node];
const laneY = index => 150 + index * 70;
const pathData = (index, from, to) => {
  const start = nodeX(from), end = nodeX(to), lane = laneY(index), direction = Math.sign(to - from);
  return `M ${start} ${nodeY(from)} V ${lane - 10} Q ${start} ${lane} ${start + direction * 10} ${lane} H ${end - direction * 10} Q ${end} ${lane} ${end} ${lane - 10} V ${nodeY(to)}`;
};
// 一體式管線網路（2026-10-19）：由 SLOTS × CARDS 的所有可能路線，計算出共用的管段（直管與轉角），
// 合併成單一路徑繪製，重疊處就是同一根管子，不會有接縫；電流填色也沿用同一組管段即時計算。
const CORNER = 10, SAMPLE_STEP = 5, BLEND = 40;
const pieces = new Map();
const quadAt = (piece, t) => ({
  x: (1 - t) * (1 - t) * piece.p0.x + 2 * (1 - t) * t * piece.p1.x + t * t * piece.p2.x,
  y: (1 - t) * (1 - t) * piece.p0.y + 2 * (1 - t) * t * piece.p1.y + t * t * piece.p2.y,
});
const pointOf = (piece, t) => piece.kind === 'line'
  ? { x: piece.p0.x + (piece.p2.x - piece.p0.x) * t, y: piece.p0.y + (piece.p2.y - piece.p0.y) * t }
  : quadAt(piece, t);
function addPiece(key, kind, p0, p1, p2) {
  const piece = { key, kind, p0, p1, p2 };
  if (kind === 'line') piece.length = Math.hypot(p2.x - p0.x, p2.y - p0.y);
  else {
    // 轉角以累計長度表把「沿管長度」換算成曲線參數 t
    piece.table = [0];
    let previous = p0;
    for (let step = 1; step <= 48; step++) {
      const point = quadAt(piece, step / 48);
      piece.table.push(piece.table[step - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
      previous = point;
    }
    piece.length = piece.table[48];
  }
  pieces.set(key, piece);
}
function paramAt(piece, s) {
  if (piece.kind === 'line') return Math.max(0, Math.min(1, s / piece.length));
  const table = piece.table;
  if (s <= 0) return 0;
  if (s >= piece.length) return 1;
  let step = 1;
  while (table[step] < s) step++;
  return (step - 1 + (s - table[step - 1]) / (table[step] - table[step - 1])) / 48;
}
const tangentOf = (piece, t) => {
  const x = piece.kind === 'line' ? piece.p2.x - piece.p0.x : (1 - t) * (piece.p1.x - piece.p0.x) + t * (piece.p2.x - piece.p1.x);
  const y = piece.kind === 'line' ? piece.p2.y - piece.p0.y : (1 - t) * (piece.p1.y - piece.p0.y) + t * (piece.p2.y - piece.p1.y);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};
const fixed = value => value.toFixed(2);
// 管段中 [s0, s1] 的子路徑；兩端沿切線多延伸一點點，讓相鄰管段的填色互相壓住、不露細縫
function piecePath(piece, s0, s1, extend = 0) {
  const t0 = paramAt(piece, s0), t1 = paramAt(piece, s1), a = pointOf(piece, t0), b = pointOf(piece, t1);
  const ta = tangentOf(piece, t0), tb = tangentOf(piece, t1);
  let d = extend ? `M ${fixed(a.x - ta.x * extend)} ${fixed(a.y - ta.y * extend)} L ${fixed(a.x)} ${fixed(a.y)}` : `M ${fixed(a.x)} ${fixed(a.y)}`;
  if (piece.kind === 'line') d += ` L ${fixed(b.x)} ${fixed(b.y)}`;
  else {
    // 二次貝茲曲線 [t0, t1] 子段的控制點（blossom）
    const k0 = (1 - t0) * (1 - t1), k1 = (1 - t0) * t1 + t0 * (1 - t1), k2 = t0 * t1;
    const cx = k0 * piece.p0.x + k1 * piece.p1.x + k2 * piece.p2.x, cy = k0 * piece.p0.y + k1 * piece.p1.y + k2 * piece.p2.y;
    d += ` Q ${fixed(cx)} ${fixed(cy)} ${fixed(b.x)} ${fixed(b.y)}`;
  }
  if (extend) d += ` L ${fixed(b.x + tb.x * extend)} ${fixed(b.y + tb.y * extend)}`;
  return d;
}
const lanesAt = node => SLOTS.flatMap((slot, index) => {
  const distance = (node - slot.source) * slot.direction;
  return distance >= 0 && distance <= 3 ? [index] : [];
});
const riserStops = node => [...new Set([nodeY(node), ...lanesAt(node).map(index => laneY(index) - CORNER)])].sort((a, b) => a - b);
const laneStops = index => {
  const { source, direction } = SLOTS[index];
  return [nodeX(source) + direction * CORNER, ...[1, 2, 3].map(span => nodeX(source + direction * span) - direction * CORNER)];
};
for (let node = 0; node < 8; node++) {
  const x = nodeX(node), stops = riserStops(node);
  stops.slice(0, -1).forEach((y, step) => addPiece(`V${node}:${y}`, 'line', { x, y }, null, { x, y: stops[step + 1] }));
}
SLOTS.forEach((slot, index) => {
  const y = laneY(index), xs = nodeX(slot.source), stops = laneStops(index);
  addPiece(`S${index}`, 'quad', { x: xs, y: y - CORNER }, { x: xs, y }, { x: xs + slot.direction * CORNER, y });
  stops.slice(0, -1).forEach((x, step) => addPiece(`H${index}:${x}`, 'line', { x, y }, null, { x: stops[step + 1], y }));
  [1, 2, 3].forEach(span => {
    const xe = nodeX(slot.source + slot.direction * span);
    addPiece(`E${index}:${span}`, 'quad', { x: xe - slot.direction * CORNER, y }, { x: xe, y }, { x: xe, y: y - CORNER });
  });
});
// 每條可能路線＝依序經過的管段與方向（1 為管段原方向，-1 為反向），以及各管段的起點距離
const networkRoutes = new Map();
SLOTS.forEach((slot, index) => CARDS.forEach(card => {
  const { to } = routeFor(index, card.id), bottom = laneY(index) - CORNER, list = [];
  riserStops(slot.source).filter(y => y < bottom).forEach(y => list.push([pieces.get(`V${slot.source}:${y}`), 1]));
  list.push([pieces.get(`S${index}`), 1]);
  laneStops(index).slice(0, card.span).forEach(x => list.push([pieces.get(`H${index}:${x}`), 1]));
  list.push([pieces.get(`E${index}:${card.span}`), 1]);
  riserStops(to).filter(y => y < bottom).reverse().forEach(y => list.push([pieces.get(`V${to}:${y}`), -1]));
  let offset = 0;
  const entries = list.map(([piece, dir]) => { const entry = { piece, dir, offset }; offset += piece.length; return entry; });
  networkRoutes.set(`${index}:${card.id}`, { entries, length: offset });
}));
// 管線本體：所有管段合成一條路徑，依序畫陰影、管殼、管壁、內孔
const pipeD = [...pieces.values()].map(piece => piecePath(piece, 0, piece.length)).join(' ');
// 管路交點的接頭框：放在管線與電流上方（節點下方），遮住管子的轉角與交叉；
// 框中央的小視窗會依通過的電流顏色亮起（updateField）
const flangeLayer = svg('g', { id: 'flanges' });
$('energy').after(flangeLayer);
const flanges = [];
SLOTS.forEach((slot, index) => [0, 1, 2, 3].forEach(span => {
  const x = nodeX(slot.source + slot.direction * span), y = laneY(index);
  if (flanges.some(flange => flange.x === x && flange.y === y)) return;
  const group = svg('g', { class: 'pipe-flange' }, flangeLayer);
  const halo = svg('circle', { cx: x, cy: y, r: 19, class: 'flange-halo', opacity: 0 }, group);
  svg('rect', { x: x - 9, y: y - 9, width: 18, height: 18, rx: 3, class: 'flange-body' }, group);
  // 通電時整個框填滿電流色，中央視窗再燒成白熱色
  const fill = svg('rect', { x: x - 9, y: y - 9, width: 18, height: 18, rx: 3, class: 'flange-fill', opacity: 0 }, group);
  svg('rect', { x: x - 3.5, y: y - 3.5, width: 7, height: 7, rx: 1.5, class: 'flange-window' }, group);
  const light = svg('rect', { x: x - 4, y: y - 4, width: 8, height: 8, rx: 1.8, class: 'flange-light', opacity: 0 }, group);
  [[-5.6, -5.6], [5.6, -5.6], [-5.6, 5.6], [5.6, 5.6]].forEach(([dx, dy]) => svg('circle', { cx: x + dx, cy: y + dy, r: .9, class: 'flange-bolt' }, group));
  flanges.push({ x, y, halo, fill, light, color: '', level: '' });
}));
svg('path', { d: pipeD, class: 'pipe-shadow', transform: 'translate(1.2 2.4)' }, $('channels'));
['pipe-shell', 'pipe-wall', 'pipe-bore'].forEach(className => svg('path', { d: pipeD, class: className }, $('channels')));
const labels = Array.from({ length: 8 }, (_, node) => node === 0 ? '電源' : node === 6 ? '引擎核心' : SLOTS.some(slot => slot.source === node) ? '轉接' : '盲端');
const nodeGlows = [];
SLOTS.forEach((slot, index) => {
  const y = laneY(index);
  const label = svg('text', { x: 7, y: y + 4, class: 'lane-label' }, $('channels'));
  label.textContent = `S${slot.id}`;
  const button = document.createElement('button');
  button.id = `slot-${index}`; button.className = 'slot';
  button.addEventListener('click', () => useSlot(index));
  $('slots').append(button);
});
labels.forEach((label, index) => {
  const group = svg('g', { id: `node-${index}`, class: label === '盲端' ? 'node-dead' : '' }, $('nodes'));
  const x = nodeX(index), y = nodeY(index);
  // 通電光暈（2026-10-19）：顏色與亮度由 updateField 依最近的電流即時設定；光暈在端子底座後方，光環與亮芯疊在上方
  const halo = svg('circle', { cx:x, cy:y, r:27, class:'node-halo', opacity:0 }, group);
  svg('rect', { x:x-18, y:y-18, width:36, height:36, rx:5, class:'terminal-base' }, group);
  const outline = svg('rect', { x:x-18, y:y-18, width:36, height:36, rx:5, class:'node-frame-glow', opacity:0 }, group);
  svg('circle', { cx:x, cy:y, r:index===6?14:10, class:'node-outer' }, group);
  const ring = svg('circle', { cx:x, cy:y, r:index===6?14:10, class:'node-ring', opacity:0 }, group);
  svg('circle', { cx:x, cy:y, r:4, class:'node-inner' }, group);
  const core = svg('circle', { cx:x, cy:y, r:index===6?6:4.6, class:'node-core', opacity:0 }, group);
  nodeGlows[index] = { x, y, halo, outline, ring, core, color: '', level: '' };
  const number = svg('text', { x, y:29, 'text-anchor':'middle', class:'node-label' }, group); number.textContent = `0${index}`;
  const caption = svg('text', { x, y:47, 'text-anchor':'middle', class:'node-caption' }, group); caption.textContent = label;
});
CARDS.forEach(card => {
  const button = document.createElement('button');
  button.id = `card-${card.id}`; button.className = 'bus-card';
  button.style.setProperty('--card-color', card.color); button.style.setProperty('--card-rgb', card.rgb);
  button.innerHTML = `<span class="card-chip" aria-hidden="true">${card.id}</span><span><strong class="card-name">${card.name}</strong><span class="card-spec">${card.span} 節導通距離 / BUS-${card.id}</span><span class="card-state"></span></span>`;
  button.addEventListener('click', () => { selected = selected === card.id ? null : card.id; tone('select'); render(); });
  $('cards').append(button);
});
for (let i = 0; i < 3; i++) {
  const step = document.createElement('div'); step.className = 'step'; step.id = `step-${i}`;
  step.innerHTML = `<span class="step-index">0${i + 1}</span><span class="step-label">等待串接</span>`;
  $('steps').append(step);
}

function tone(kind) {
  if (!soundEnabled) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const notes = kind === 'complete' ? [440, 554, 660] : [kind === 'out' ? 175 : kind === 'in' ? 330 : 250];
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const start = audio.currentTime + index * .12;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.065, start + .02);
      gain.gain.exponentialRampToValueAtTime(.001, start + .2);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .22);
    });
  } catch { soundEnabled = false; $('sound').textContent = '音效：無法使用'; }
}
// 電流視覺（2026-10-17 寫實化）：導管內的電漿分層發光（外擴柔光／管內光暈／主體／白熱細芯），
// 兩層不規則亮紋以不同速度流動、細長光粒、輕微不規則閃動、接通後偶發的細小電弧、
// 充能前端熱點與往後噴的火花、抵達終點時的接點閃光。
// 充能進度改用遮罩顯示（route-reveal），各發光層自己的 stroke-dasharray 留給流動亮紋使用。
// 充能／收回時間、進度、完成判定與資料屬性（data-progress／data-flow-state）維持原狀。
let flowSerial = 0;
const MOTE_COUNT = 7, SPARK_POOL = 14;
function addFlow(index, cardId) {
  const route = routeFor(index, cardId), card = CARDS.find(item => item.id === cardId);
  const group = svg('g', { 'data-slot': index, 'data-card': cardId, 'data-flow-state': 'advancing' }, $('energy'));
  group.style.setProperty('--card-color', card.color);
  group.style.setProperty('--card-rgb', card.rgb);
  // 管殼與彩色填色改由共用管線網路與填色場（updateField）負責；這裡只留各股電流自己的白熱亮紋與粒子
  const d = pathData(index, route.from, route.to);
  const tube = svg('path', { d, class: 'route-tube' }, group);
  const maskId = `flow-reveal-${++flowSerial}`;
  const mask = svg('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: -40, y: -40, width: 570, height: 510 }, group);
  const reveal = svg('path', { d, class: 'route-reveal' }, mask);
  const energy = svg('g', { class: 'route-energy', mask: `url(#${maskId})` }, group);
  const wave = svg('path', { d, class: 'route-wave' }, energy);
  const surge = svg('path', { d, class: 'route-surge' }, energy);
  const ripple = svg('path', { d, class: 'route-ripple' }, energy);
  const core = svg('path', { d, class: 'route-core' }, energy);
  const filament = svg('polyline', { class: 'route-filament', points: '' }, energy);
  const motes = Array.from({ length: MOTE_COUNT }, (_, mote) => ({
    element: svg('line', { class: 'route-mote' }, energy),
    speed: .38 + Math.random() * .5, offset: mote / MOTE_COUNT + Math.random() * .08, twinkle: Math.random() * 6.28,
  }));
  const sparkLayer = svg('g', { class: 'route-sparks' }, group);
  const sparks = Array.from({ length: SPARK_POOL }, () => ({ element: svg('line', { class: 'route-spark-line', opacity: 0 }, sparkLayer), life: 0 }));
  const head = svg('g', { class: 'route-head' }, group);
  const headHalo = svg('circle', { r: 9, class: 'route-head-halo' }, head);
  svg('circle', { r: 2.4, class: 'route-head-core' }, head);
  const flash = svg('circle', { r: 6, class: 'route-flash', opacity: 0 }, group);
  const animation = {
    ...route, network: networkRoutes.get(`${index}:${cardId}`), rgb: card.rgb.split(',').map(Number),
    group, tube, reveal, wave, surge, ripple, core, filament, motes, sparks, head, headHalo, flash,
    progress: 0, active: true, length: tube.getTotalLength(), seed: Math.random() * 100,
    lastNow: null, sparkDebt: 0, arcUntil: 0, nextArc: 0, flashAge: -1, arrived: false,
  };
  animations.push(animation); drawFlow(animation, performance.now());
}
function retract(index) {
  animations.filter(animation => animation.slot === index && animation.active).forEach(animation => {
    animation.active = false; animation.group.dataset.flowState = 'retracting';
  });
}
function useSlot(index) {
  if (successLocked) return;
  if (slots[index]) {
    const removed = slots[index]; retract(index); slots = removeCard(slots, index); selected = removed;
    moves++; tone('out');
  } else if (selected) {
    const card = selected, next = insertCard(slots, index, card);
    if (next === slots) return;
    slots = next; selected = null; addFlow(index, card); moves++; tone('in');
  } else {
    $('selection-message').textContent = '先選擇卡架中的匯流排卡，再點這個插槽。'; return;
  }
  complete = false; stableFor = 0; render();
}
function reset() {
  if (successLocked) return;
  completion.cancel();
  drag?.cancel();
  SLOTS.forEach((_, index) => retract(index));
  slots = EMPTY(); selected = null; moves = 0; complete = false; stableFor = 0; hintLevel = 0;
  $('hint-text').hidden = true; $('hint').textContent = '需要一點提示'; $('hint').setAttribute('aria-expanded', 'false');
  tone('out'); render();
}
$('reset').addEventListener('click', reset);
$('exit').addEventListener('click', () => { if (!successLocked) notifyHost('cancel'); });
$('sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled; $('sound').textContent = `音效：${soundEnabled ? '開' : '關'}`;
  $('sound').setAttribute('aria-pressed', String(soundEnabled)); tone('select');
});
const hints = [
  '插槽的「入口」是起點；卡片決定導通 1、2、3 節。S03 從 07 反向導通；其餘往編號較大處。只在編號接點串接。',
  '從 00 電源開始。01、02、05 是盲端；讓前一張卡的終點等於下一個已插卡插槽的入口。',
  '可以先試：長距 C 卡插 S01，從 00 接到 03。下一段需要入口 03 的插槽。',
  '完整配置：S01 放 C、S02 放 A、S03 留空、S04 放 B。路線為 00 → 03 → 04 → 06。',
];
$('hint').addEventListener('click', () => {
  if (hintLevel === hints.length) { hintLevel = 0; $('hint-text').hidden = true; $('hint').textContent = '需要一點提示'; $('hint').setAttribute('aria-expanded', 'false'); return; }
  $('hint-text').textContent = hints[hintLevel++]; $('hint-text').hidden = false;
  $('hint').textContent = hintLevel === hints.length ? '收起提示' : `下一個提示 · ${hintLevel} / ${hints.length}`;
  $('hint').setAttribute('aria-expanded', 'true');
});
const input = installInput({
  initialOwner,
  isLocked: () => successLocked,
  cancel: () => { if (successLocked) return; if (drag?.active || selected) { drag?.cancel(); selected = null; render(); } else notifyHost('cancel'); },
  onOwnerChange: owner => {
    notifyHost('owner', { owner });
    const interruptedDrag = drag?.active && drag.owner !== owner;
    if (interruptedDrag) drag.cancel();
    $('input-help').textContent = owner === 'gamepad' ? '左搖桿 / 方向鍵選擇 · A 操作 · B 取消選卡／返回船艙' : owner === 'keyboard' ? '方向鍵 / Tab 選擇 · Enter / 空白鍵插拔 · Esc 取消選卡／返回船艙' : owner === 'touch' ? '拖入插卡 · 拖出拔卡 · 互拖交換 · 返回船艙可退出' : '拖入插卡 · 拖出拔卡 · 互拖交換 · Esc 取消選卡／返回船艙';
    queueMicrotask(render);
    return interruptedDrag;
  },
});
function physicalFeedback(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  element.addEventListener('animationend', () => element.classList.remove(className), {once:true});
}
drag = installCardDrag({
  cards: CARDS, readSlots: () => slots,
  snapshot: () => ({ selected, moves }),
  onStart: () => { selected = null; render(); },
  onDetach: session => {
    retract(session.sourceSlot); slots = removeCard(slots,session.sourceSlot);
    moves++; complete = false; stableFor = 0; tone('out'); render();
  },
  onDrop: (session,intent) => {
    selected = null;
    if (intent.type === 'insert') {
      const next = insertCard(slots,intent.slot,session.card);
      if (next !== slots) { slots = next; addFlow(intent.slot,session.card); moves++; complete = false; stableFor = 0; tone('in'); }
      render(); physicalFeedback($(`slot-${intent.slot}`),'seating');
    } else if (intent.type === 'swap') {
      const displaced = slots[intent.slot];
      const next = swapDetachedCard(slots,session.sourceSlot,intent.slot,session.card);
      if (next !== slots) {
        retract(intent.slot); slots = next;
        addFlow(intent.slot,session.card); addFlow(session.sourceSlot,displaced);
        moves += 3; complete = false; stableFor = 0; tone('in');
        render();
        physicalFeedback($(`slot-${intent.slot}`),'seating');
        physicalFeedback($(`slot-${session.sourceSlot}`),'seating');
        $('selection-message').textContent = `${session.card} 與 ${displaced} 卡已交換位置，電流依新插槽重新導通。`;
      }
    } else {
      render();
      if (intent.type === 'return') {
        physicalFeedback($(`card-${session.card}`),'returning');
        $('selection-message').textContent = intent.blocked ? '插槽已佔用，卡片已退回卡片架。' : '卡片已放回卡片架，可再次拖入空槽。';
      }
    }
  },
  onCancel: session => {
    if (session.detached && slots[session.sourceSlot] === null && !slots.includes(session.card)) {
      slots = insertCard(slots,session.sourceSlot,session.card); addFlow(session.sourceSlot,session.card);
      moves = session.before.moves; complete = false; stableFor = 0;
    }
    selected = session.before.selected; render();
    $('selection-message').textContent = '已取消拖曳，卡片返回原位。';
  },
});
function render() {
  const directional = ['keyboard','gamepad'].includes(document.body.dataset.owner);
  SLOTS.forEach((slot, index) => {
    const button = $(`slot-${index}`), card = CARDS.find(item => item.id === slots[index]);
    button.classList.toggle('occupied', !!card); button.classList.toggle('can-insert', !!selected && !card);
    button.style.setProperty('--card-color', card?.color || '#d0e0d3'); button.style.setProperty('--card-rgb', card?.rgb || '208,224,211');
    button.innerHTML = `<span class="slot-top"><span>SLOT ${slot.id}</span><span>${slot.direction < 0 ? '反向入口' : '入口'} 0${slot.source}</span></span><span class="socket-well" aria-hidden="true"><i></i></span><span class="socket-latch latch-left" aria-hidden="true"></span><span class="socket-latch latch-right" aria-hidden="true"></span>${card ? `<span class="installed-module" aria-hidden="true"><b>${card.id}</b></span>` : ''}<span class="card-grip" aria-hidden="true"></span><strong class="slot-title">${card ? `${card.id} · ${card.name}` : '空插槽'}</strong><span class="slot-info">${card ? `0${slot.source} → 0${routeFor(index, card.id).to}　${directional ? '確認拔除' : '拖出拔除'}` : selected ? `插入 ${selected} 卡` : '拖曳匯流排至此'}</span>`;
    button.setAttribute('aria-label', `插槽 ${slot.id}，入口 0${slot.source}，${card ? `${card.id} 卡，拖出或確認拔除` : selected ? `插入 ${selected} 卡` : '空槽'}`);
    button.dataset.card = card?.id || '';
  });
  CARDS.forEach(card => {
    const button = $(`card-${card.id}`), index = slots.indexOf(card.id);
    button.disabled = index !== -1; button.classList.toggle('selected', selected === card.id);
    button.setAttribute('aria-pressed', String(selected === card.id));
    button.setAttribute('aria-label', `${card.id} 卡，${card.name}，導通 ${card.span} 節`);
    button.querySelector('.card-state').textContent = index !== -1 ? `已插入 SLOT ${SLOTS[index].id}` : selected === card.id ? '已選取 · 確認空槽插入' : directional ? '確認選取' : '按住拖入插槽';
  });
  $('insert-count').textContent = `${slots.filter(Boolean).length} / 3 CARDS`;
  $('selection-message').textContent = selected ? `已選取 ${selected} 卡。確認空插槽插入，或取消選卡。` : directional ? '選取已插入的卡並確認，即可拔除。' : '拖到另一張已插入的卡，放開交換；拖到空槽移動，拖到外面拔除。';
  if (!slots.some(Boolean) && !selected) $('selection-message').textContent = directional ? '選取卡架中的卡片，再確認空插槽插入。' : '把卡架中的卡片拖進空槽；拖出插槽即可拔除。';
  $('moves').textContent = String(moves).padStart(2, '0');
  document.body.dataset.complete = String(complete);
  input.refresh(); updateReadout();
}
let readoutKey = '';
function connectedReady() {
  const result = evaluate(slots), ready = [];
  for (const route of result.chain) {
    if (!animations.some(animation => animation.active && animation.slot === route.slot && animation.progress >= .999)) break;
    ready.push(route);
  }
  return { ...result, ready };
}
function updateReadout() {
  const result = connectedReady();
  const charging = animations.some(animation => animation.active && animation.progress < 1);
  const retracting = animations.some(animation => !animation.active);
  const key = JSON.stringify([slots, result.ready.length, complete, charging, retracting, successLocked]);
  if (readoutKey === key) return;
  readoutKey = key;
  $('chain-count').textContent = result.ready.length;
  for (let index = 0; index < 3; index++) {
    const step = $(`step-${index}`), route = result.ready[index];
    step.classList.toggle('connected', !!route);
    step.querySelector('.step-label').textContent = route ? `0${route.from} → 0${route.to}　${route.card} 卡` : '等待串接';
  }
  const lit = new Set([0]); result.ready.forEach(route => { lit.add(route.from); lit.add(route.to); });
  labels.forEach((_, index) => $(`node-${index}`).classList.toggle('node-lit', lit.has(index)));
  $('core-widget').classList.toggle('live', complete);
  $('core-state').textContent = complete ? '導通完成' : result.complete ? '穩定檢測中' : '等待供能';
  $('status').classList.toggle('complete', complete);
  $('status').textContent = complete ? (successLocked ? '檢查通過，正在完成負載更新。' : '檢查通過。三段電流已串接，引擎核心供能穩定。可拔卡觀察中斷，或重新測試。') : retracting && !slots.some(Boolean) ? '能量正在沿管道收回，等待下一次配置。' : charging ? '電流沿管道前進中，觀察各張卡最後停在哪個接點。' : result.complete ? '三段已接通，正在確認供能穩定…' : !slots.some(Boolean) ? '讓三張卡的管道首尾相接，將電流送至引擎核心。' : result.end === 6 ? '已到核心，但還需要三張卡完整串聯。試著接上缺少的那一段。' : result.ready.length ? `電源已接至 0${result.end}。${labels[result.end] === '盲端' ? '這是盲端，請拔卡改換導通距離。' : '找入口相同的插槽，接續下一段。'}` : '目前只有局部通電。先讓入口 00 的插槽接上電源。';
  document.body.dataset.complete = String(complete);
}
const pointAt = (animation, distance) => animation.tube.getPointAtLength(Math.max(0, Math.min(animation.length, distance)));
function drawFlow(animation, now) {
  const dt = animation.lastNow === null ? 0 : Math.min(.05, Math.max(0, (now - animation.lastNow) / 1000));
  animation.lastNow = now;
  const t = now / 1000, visible = animation.length * animation.progress;
  const held = animation.active && animation.progress >= 1;
  const moving = animation.progress > 0 && !held;
  animation.reveal.setAttribute('stroke-dasharray', `${visible} ${animation.length + 1}`);
  animation.group.dataset.progress = animation.progress.toFixed(3);
  animation.group.dataset.flowState = animation.active ? held ? 'held' : 'advancing' : 'retracting';
  animation.group.setAttribute('opacity', String(animation.active ? 1 : Math.min(1, animation.progress * 5)));

  // 流動亮紋：慢速寬能量波＋兩層不規則段落，以不同速度沿管線前進（收回時反向）
  const direction = animation.active ? -1 : 1;
  animation.wave.setAttribute('stroke-dashoffset', ((direction * t * 48 + animation.seed * 13) % 1000).toFixed(1));
  animation.surge.setAttribute('stroke-dashoffset', ((direction * t * 92) % 1000).toFixed(1));
  animation.ripple.setAttribute('stroke-dashoffset', ((direction * t * 205 + animation.seed * 7) % 1000).toFixed(1));

  // 不規則閃動：兩組正弦加少量雜訊，幅度很小，避免像在閃爍警示
  const s = animation.seed;
  const flicker = .9 + .055 * Math.sin(t * 21.7 + s) + .035 * Math.sin(t * 57.3 + s * 2.3) + (Math.random() - .5) * .05;
  animation.flicker = flicker;
  animation.core.style.opacity = (.86 * (.94 + (flicker - .9) * .8)).toFixed(3);

  // 光粒：細長亮點沿已充能段流動，各自速度與閃爍不同
  const moteOn = animation.progress > .06;
  for (const mote of animation.motes) {
    if (!moteOn) { mote.element.setAttribute('opacity', '0'); continue; }
    const fraction = ((t * mote.speed * 200 / Math.max(80, visible)) + mote.offset) % 1;
    const along = visible * (animation.active ? fraction : 1 - fraction);
    // 尾巴落在移動方向的後方：充能時在前進方向之後，收回時在反方向之後
    const tip = pointAt(animation, along), tail = pointAt(animation, along + direction * (5 + mote.speed * 7));
    mote.element.setAttribute('x1', tail.x.toFixed(1)); mote.element.setAttribute('y1', tail.y.toFixed(1));
    mote.element.setAttribute('x2', tip.x.toFixed(1)); mote.element.setAttribute('y2', tip.y.toFixed(1));
    const edgeFade = Math.min(1, along / 18, (visible - along) / 18);
    mote.element.setAttribute('opacity', Math.max(0, edgeFade * (.45 + .45 * Math.sin(t * 9 + mote.twinkle))).toFixed(2));
  }

  // 前端熱點：充能或收回途中才顯示，停住後交給接點閃光
  const headPoint = pointAt(animation, visible);
  animation.head.setAttribute('transform', `translate(${headPoint.x.toFixed(1)} ${headPoint.y.toFixed(1)})`);
  animation.head.setAttribute('opacity', moving ? '1' : '0');
  animation.headHalo.setAttribute('r', (8.5 + Math.sin(t * 31 + s) * 1.2).toFixed(2));

  // 火花：前端移動時往後方與兩側噴出，短暫淡出
  if (moving) {
    const behind = pointAt(animation, visible - 4 * (animation.active ? 1 : -1));
    const tx = headPoint.x - behind.x, ty = headPoint.y - behind.y, norm = Math.hypot(tx, ty) || 1;
    animation.sparkDebt += dt * 34;
    while (animation.sparkDebt >= 1) {
      animation.sparkDebt--;
      const spark = animation.sparks.find(item => item.life <= 0);
      if (!spark) break;
      const spread = (Math.random() - .5) * 2.4, speed = 40 + Math.random() * 70;
      spark.x = headPoint.x; spark.y = headPoint.y;
      spark.vx = (-tx / norm * Math.cos(spread) - ty / norm * Math.sin(spread)) * speed;
      spark.vy = (-ty / norm * Math.cos(spread) + tx / norm * Math.sin(spread)) * speed;
      spark.life = spark.maxLife = .18 + Math.random() * .22;
    }
  }
  for (const spark of animation.sparks) {
    if (spark.life <= 0) continue;
    spark.life -= dt; spark.x += spark.vx * dt; spark.y += spark.vy * dt; spark.vx *= .9; spark.vy *= .9;
    const fade = Math.max(0, spark.life / spark.maxLife);
    spark.element.setAttribute('x1', spark.x.toFixed(1)); spark.element.setAttribute('y1', spark.y.toFixed(1));
    spark.element.setAttribute('x2', (spark.x - spark.vx * .035).toFixed(1)); spark.element.setAttribute('y2', (spark.y - spark.vy * .035).toFixed(1));
    spark.element.setAttribute('opacity', (fade * .95).toFixed(2));
  }

  // 細小電弧：接通後偶爾在管內一小段竄出鋸齒狀細絲，持續約 0.1 秒
  if (held && now >= animation.nextArc) {
    const center = animation.length * (.08 + Math.random() * .84), span = 18 + Math.random() * 18, points = [];
    for (let step = -span / 2; step <= span / 2; step += 3) {
      const a = pointAt(animation, center + step), b = pointAt(animation, center + step + 1);
      const nx = -(b.y - a.y), ny = b.x - a.x, len = Math.hypot(nx, ny) || 1, jitter = (Math.random() - .5) * 4.2;
      points.push(`${(a.x + nx / len * jitter).toFixed(1)},${(a.y + ny / len * jitter).toFixed(1)}`);
    }
    animation.filament.setAttribute('points', points.join(' '));
    animation.arcUntil = now + 70 + Math.random() * 70;
    animation.nextArc = now + 380 + Math.random() * 900;
  }
  animation.filament.setAttribute('opacity', held && now < animation.arcUntil ? (.65 + Math.random() * .35).toFixed(2) : '0');

  // 接點閃光：第一次充滿時，在終點擴散一圈光環
  if (held && !animation.arrived) { animation.arrived = true; animation.flashAge = 0; }
  if (!held && animation.progress < 1) animation.arrived = false;
  if (animation.flashAge >= 0) {
    animation.flashAge += dt;
    const k = animation.flashAge / .55;
    if (k >= 1) { animation.flashAge = -1; animation.flash.setAttribute('opacity', '0'); }
    else {
      const end = pointAt(animation, animation.length);
      animation.flash.setAttribute('cx', end.x.toFixed(1)); animation.flash.setAttribute('cy', end.y.toFixed(1));
      animation.flash.setAttribute('r', (6 + k * 15).toFixed(1));
      animation.flash.setAttribute('opacity', ((1 - k) * .9).toFixed(2));
    }
  }
}
// 電流填色場（2026-10-19）：彩色的電漿層（外擴柔光／管內光暈／主體）不再每股電流各畫一條，
// 而是整個管線網路共用一份、每幀即時計算。每段管子沿管長每 5px 取一個取樣點：
//   - 每股電流已充能到的取樣點權重為 1；
//   - 尚未被它覆蓋、但沿管線距離 40px 內的點，權重依距離平滑遞減；
//   - 取樣點顏色＝各股電流顏色依權重在線性光空間混合。
// 因此兩股電流共用的管段是兩色融合，往各自的管段延伸時再漸層回原色；距離沿管線計算，
// 只是在交叉處擦身而過、彼此不相通的管子不會互相染色。拔卡收回時覆蓋範圍縮小，漸層也跟著即時退回。
const fieldLayer = svg('g', { id: 'field' });
$('energy').before(fieldLayer);
// 節點固定在最上層：管線、填色場、各股電流的亮紋與火花都在節點底下
$('circuit').append($('nodes'));
const fieldDefs = svg('defs', {}, fieldLayer);
const fieldGroups = ['field-glass', 'field-bloom', 'field-fill'].map(className => svg('g', { class: `field-layer ${className}` }, fieldLayer));
const toLinear = value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; };
const toSrgb = value => Math.round(255 * Math.max(0, Math.min(1, value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055)));
// 取樣點：管段端點以座標合併，讓相接的管段共用同一個點，沿管線的距離才連得起來
let sampleCount = 0;
const endpointIds = new Map(), adjacency = [];
const endpointId = point => {
  const key = `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  if (!endpointIds.has(key)) endpointIds.set(key, sampleCount++);
  return endpointIds.get(key);
};
let gradientSerial = 0;
for (const piece of pieces.values()) {
  const count = Math.max(2, Math.ceil(piece.length / SAMPLE_STEP) + 1);
  const chordX = piece.p2.x - piece.p0.x, chordY = piece.p2.y - piece.p0.y, chord = chordX * chordX + chordY * chordY;
  piece.gradient = svg('linearGradient', {
    id: `field-gradient-${++gradientSerial}`, gradientUnits: 'userSpaceOnUse',
    x1: piece.p0.x, y1: piece.p0.y, x2: piece.p2.x, y2: piece.p2.y,
  }, fieldDefs);
  piece.samples = Array.from({ length: count }, (_, step) => {
    const s = piece.length * step / (count - 1), point = pointOf(piece, paramAt(piece, s));
    const id = step === 0 ? endpointId(piece.p0) : step === count - 1 ? endpointId(piece.p2) : sampleCount++;
    // 漸層沿弦方向：取樣點投影到弦上的比例就是 stop 位置（直管即沿管比例，轉角則單調遞增）
    const offset = ((point.x - piece.p0.x) * chordX + (point.y - piece.p0.y) * chordY) / chord;
    const stop = svg('stop', { offset: Math.max(0, Math.min(1, offset)).toFixed(4), 'stop-color': '#000' }, piece.gradient);
    return { s, id, stop, color: '', opacity: '' };
  });
  piece.samples.slice(1).forEach((sample, step) => {
    const previous = piece.samples[step], gap = sample.s - previous.s;
    (adjacency[sample.id] ||= []).push([previous.id, gap]);
    (adjacency[previous.id] ||= []).push([sample.id, gap]);
  });
  piece.paths = fieldGroups.map(group => svg('path', { d: '', stroke: `url(#${piece.gradient.id})` }, group));
  piece.d = '';
}
// 每個取樣點沿管線 40px 內的鄰點與權重（餘弦平滑遞減），只在載入時算一次
const neighbors = Array.from({ length: sampleCount }, (_, start) => {
  const distance = new Map([[start, 0]]), done = new Set(), queue = [start], list = [];
  while (queue.length) {
    let best = 0;
    for (let index = 1; index < queue.length; index++) if (distance.get(queue[index]) < distance.get(queue[best])) best = index;
    const id = queue.splice(best, 1)[0];
    if (done.has(id)) continue;
    done.add(id);
    const d = distance.get(id);
    list.push([id, .5 + .5 * Math.cos(Math.PI * d / BLEND)]);
    for (const [next, gap] of adjacency[id] || []) {
      const nd = d + gap;
      if (nd < BLEND && nd < (distance.get(next) ?? Infinity)) { distance.set(next, nd); queue.push(next); }
    }
  }
  return list;
});
// 每個接頭框蓋住的取樣點（框內 ±9px），用來判斷有沒有電流穿過這個接頭
const framedSamples = [...pieces.values()].flatMap(piece => piece.samples.map(sample => ({ id: sample.id, point: pointOf(piece, paramAt(piece, sample.s)) })));
flanges.forEach(flange => {
  flange.ids = [...new Set(framedSamples.filter(({ point }) => Math.abs(point.x - flange.x) <= 9 && Math.abs(point.y - flange.y) <= 9).map(sample => sample.id))];
});
const glowColors = (r, g, b) => [
  `rgb(${toSrgb(r)},${toSrgb(g)},${toSrgb(b)})`,
  `rgb(${toSrgb(r + (1 - r) * .35)},${toSrgb(g + (1 - g) * .35)},${toSrgb(b + (1 - b) * .35)})`,
];
function updateField(now) {
  const flows = animations.filter(animation => animation.progress > 0).map(animation => ({
    animation, covered: new Uint8Array(sampleCount),
    rgb: animation.rgb.map(toLinear), fade: animation.active ? 1 : Math.min(1, animation.progress * 5),
  }));
  // 1. 每股電流目前充能到的範圍：記下每段管子被覆蓋的區間，並標記覆蓋到的取樣點
  const intervals = new Map();
  for (const flow of flows) {
    const reach = flow.animation.progress * flow.animation.network.length;
    for (const { piece, dir, offset } of flow.animation.network.entries) {
      const local = reach - offset;
      if (local <= 0) break;
      const covered = Math.min(piece.length, local);
      (intervals.get(piece) || intervals.set(piece, []).get(piece)).push(dir > 0 ? [0, covered] : [piece.length - covered, piece.length]);
      for (const sample of piece.samples) if ((dir > 0 ? sample.s : piece.length - sample.s) <= covered + .01) flow.covered[sample.id] = 1;
    }
  }
  // 2. 有電的管段：畫出覆蓋區間，並依取樣點重算漸層顏色
  const cache = new Map();
  const colorAt = id => {
    if (cache.has(id)) return cache.get(id);
    let total = 0, r = 0, g = 0, b = 0, opacity = 0;
    for (const flow of flows) {
      let weight = 0;
      for (const [other, value] of neighbors[id]) if (value > weight && flow.covered[other]) weight = value;
      if (!weight) continue;
      total += weight; r += weight * flow.rgb[0]; g += weight * flow.rgb[1]; b += weight * flow.rgb[2];
      opacity = Math.max(opacity, flow.fade);
    }
    const result = total ? { color: `rgb(${toSrgb(r / total)},${toSrgb(g / total)},${toSrgb(b / total)})`, opacity: opacity.toFixed(3) } : null;
    cache.set(id, result);
    return result;
  };
  for (const piece of pieces.values()) {
    const ranges = (intervals.get(piece) || []).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1] + .5) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }
    const d = merged.filter(([s0, s1]) => s1 - s0 > .05).map(([s0, s1]) => piecePath(piece, s0, s1, .6)).join(' ');
    if (d !== piece.d) { piece.d = d; piece.paths.forEach(path => path.setAttribute('d', d)); }
    if (!d) continue;
    let fallback = null;
    const values = piece.samples.map(sample => colorAt(sample.id));
    values.forEach((value, index) => { if (value) fallback = value; else values[index] = fallback; });
    for (let index = values.length - 1; index >= 0; index--) { if (values[index]) fallback = values[index]; else values[index] = fallback; }
    piece.samples.forEach((sample, index) => {
      const value = values[index];
      if (!value) return;
      if (sample.color !== value.color) { sample.color = value.color; sample.stop.setAttribute('stop-color', value.color); }
      if (sample.opacity !== value.opacity) { sample.opacity = value.opacity; sample.stop.setAttribute('stop-opacity', value.opacity); }
    });
  }
  // 外擴柔光跟著各股電流的不規則閃動一起輕微起伏
  const flicker = flows.length ? flows.reduce((sum, flow) => sum + (flow.animation.flicker ?? .9), 0) / flows.length : .9;
  fieldGroups[1].style.opacity = (.55 * flicker).toFixed(3);
  // 3. 節點亮起：看節點（立管頂端）沿管線 40px 內有哪些電流，越近越亮；
  //    權重取平方，顏色會明顯偏向最靠近的那股電流，兩股同時接到節點時才是兩色融合
  for (const glow of nodeGlows) {
    const id = endpointIds.get(`${glow.x.toFixed(1)},${glow.y.toFixed(1)}`);
    let total = 0, r = 0, g = 0, b = 0, level = 0;
    for (const flow of flows) {
      let weight = 0;
      for (const [other, value] of neighbors[id] || []) if (value > weight && flow.covered[other]) weight = value;
      if (!weight) continue;
      const bias = weight * weight * flow.fade;
      total += bias; r += bias * flow.rgb[0]; g += bias * flow.rgb[1]; b += bias * flow.rgb[2];
      level = Math.max(level, weight * flow.fade);
    }
    const levelText = level.toFixed(3);
    if (total) {
      const [lr, lg, lb] = [r / total, g / total, b / total];
      const color = `rgb(${toSrgb(lr)},${toSrgb(lg)},${toSrgb(lb)})`;
      if (color !== glow.color) {
        glow.color = color;
        // 亮芯：同色但往白色推，看起來是被電流燒亮的接點
        const hot = `rgb(${toSrgb(lr + (1 - lr) * .35)},${toSrgb(lg + (1 - lg) * .35)},${toSrgb(lb + (1 - lb) * .35)})`;
        glow.halo.setAttribute('fill', color); glow.outline.setAttribute('stroke', color);
        glow.ring.setAttribute('stroke', color); glow.core.setAttribute('fill', hot);
      }
    }
    if (levelText !== glow.level) {
      glow.level = levelText;
      glow.outline.setAttribute('opacity', (level * .95).toFixed(3));
      glow.ring.setAttribute('opacity', levelText);
      glow.core.setAttribute('opacity', levelText);
    }
    glow.halo.setAttribute('opacity', (level * .95 * (.92 + (flicker - .9) * 1.4)).toFixed(3));
  }
  // 4. 接頭框：每股電流只看「它自己穿過這個框的那一段」走了多少，走過一半就全亮；
  //    交叉處框內還有別的管子，不再拿整個框的取樣點當分母，轉角接頭才不會只亮一點點
  for (const flange of flanges) {
    let total = 0, r = 0, g = 0, b = 0, level = 0;
    for (const flow of flows) {
      const network = flow.animation.network;
      network.flangeIds ||= new Map();
      if (!network.flangeIds.has(flange)) {
        const own = new Set(network.entries.flatMap(({ piece }) => piece.samples.map(sample => sample.id)));
        network.flangeIds.set(flange, flange.ids.filter(id => own.has(id)));
      }
      const ids = network.flangeIds.get(flange);
      if (!ids.length) continue;
      const share = ids.reduce((sum, id) => sum + flow.covered[id], 0) / ids.length;
      if (!share) continue;
      const weight = share * flow.fade;
      total += weight; r += weight * flow.rgb[0]; g += weight * flow.rgb[1]; b += weight * flow.rgb[2];
      level = Math.max(level, Math.min(1, share * 2) * flow.fade);
    }
    if (total) {
      const [color, hot] = glowColors(r / total, g / total, b / total);
      if (color !== flange.color) {
        flange.color = color;
        flange.halo.setAttribute('fill', color); flange.fill.setAttribute('fill', color); flange.light.setAttribute('fill', hot);
      }
    }
    const levelText = level.toFixed(3);
    if (levelText !== flange.level) {
      flange.level = levelText;
      flange.fill.setAttribute('opacity', (level * .82).toFixed(3));
      flange.light.setAttribute('opacity', levelText);
    }
    flange.halo.setAttribute('opacity', (level * (.92 + (flicker - .9) * 1.4)).toFixed(3));
  }
}
function frame(now) {
  const dt = Math.min(.05, (now - lastTime) / 1000); lastTime = now;
  for (let index = animations.length - 1; index >= 0; index--) {
    const animation = animations[index];
    animation.progress = advanceCharge(animation.progress, animation.active, dt, animation.active ? 1.15 + animation.length / 2500 : .85);
    drawFlow(animation, now);
    if (!animation.active && animation.progress === 0) { animation.group.remove(); animations.splice(index, 1); }
  }
  updateField(now);
  const result = connectedReady();
  if (result.complete && result.ready.length === 3) {
    stableFor += dt;
    if (!complete && stableFor >= .65) {
      drag?.cancel(); selected = null;
      complete = true; successLocked = true; consolePanel.inert = true;
      tone('complete'); render();
      completion.start(now, slots);
    }
  } else { stableFor = 0; complete = false; }
  completion.tick(now);
  updateReadout(); requestAnimationFrame(frame);
}
render(); requestAnimationFrame(frame);
