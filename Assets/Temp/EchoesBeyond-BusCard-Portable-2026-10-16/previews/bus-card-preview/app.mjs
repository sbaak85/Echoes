import { CARDS, SLOTS, EMPTY, routeFor, insertCard, removeCard, swapDetachedCard, evaluate, advanceCharge } from './model.mjs';
import { installInput } from './input.mjs';
import { installCardDrag } from './drag.mjs';

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
const animations = [];
const nodeX = node => 92 + node * 110;
const nodeY = 77;
const pathData = (index, from, to) => {
  const start = nodeX(from), end = nodeX(to), lane = 144 + index * 55;
  return `M ${start} ${nodeY} V ${lane - 10} Q ${start} ${lane} ${start + 10} ${lane} H ${end - 10} Q ${end} ${lane} ${end} ${lane - 10} V ${nodeY}`;
};
const labels = ['電源', '轉接', '盲端', '轉接', '轉接', '盲端', '引擎核心', '盲端'];
SLOTS.forEach((slot, index) => {
  const y = 144 + index * 55;
  svg('path', { d: pathData(index, slot.source, slot.source + 3), class: 'lane-base' }, $('channels'));
  const label = svg('text', { x: 19, y: y + 4, class: 'lane-label' }, $('channels'));
  label.textContent = `S${slot.id}`;
  [1, 2, 3].forEach(span => svg('circle', { cx: nodeX(slot.source + span), cy: y, r: 2, fill: '#617781' }, $('channels')));
  const button = document.createElement('button');
  button.id = `slot-${index}`; button.className = 'slot';
  button.addEventListener('click', () => useSlot(index));
  $('slots').append(button);
});
labels.forEach((label, index) => {
  const group = svg('g', { id: `node-${index}`, class: [2, 5, 7].includes(index) ? 'node-dead' : '' }, $('nodes'));
  const x = nodeX(index);
  svg('rect', { x:x-20, y:nodeY-20, width:40, height:40, rx:5, class:'terminal-base' }, group);
  svg('circle', { cx: x, cy: nodeY, r: index === 6 ? 14 : 10, class: 'node-outer' }, group);
  svg('circle', { cx: x, cy: nodeY, r: 4, class: 'node-inner' }, group);
  const number = svg('text', { x, y: 28, 'text-anchor': 'middle', class: 'node-label' }, group); number.textContent = `0${index}`;
  const caption = svg('text', { x, y: 46, 'text-anchor': 'middle', class: 'node-caption' }, group); caption.textContent = label;
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
function addFlow(index, cardId) {
  const route = routeFor(index, cardId), card = CARDS.find(item => item.id === cardId);
  const group = svg('g', { 'data-slot': index, 'data-card': cardId, 'data-flow-state': 'advancing' }, $('energy'));
  group.style.setProperty('--card-color', card.color);
  const d = pathData(index, route.from, route.to);
  svg('path', { d, class: 'route-shell' }, group);
  const tube = svg('path', { d, class: 'route-tube' }, group);
  const glow = svg('path', { d, class: 'route-glow' }, group);
  const fill = svg('path', { d, class: 'route-fill' }, group);
  const head = svg('circle', { r: 4, class: 'route-particle' }, group);
  const particles = Array.from({ length: 4 }, () => svg('circle', { r: 1.7, class: 'route-particle' }, group));
  const animation = { ...route, group, tube, glow, fill, head, particles, progress: 0, active: true, length: tube.getTotalLength() };
  animations.push(animation); drawFlow(animation, performance.now());
}
function retract(index) {
  animations.filter(animation => animation.slot === index && animation.active).forEach(animation => {
    animation.active = false; animation.group.dataset.flowState = 'retracting';
  });
}
function useSlot(index) {
  if (slots[index]) {
    const removed = slots[index]; retract(index); slots = removeCard(slots, index); selected = removed;
    moves++; tone('out');
  } else if (selected) {
    const card = selected, next = insertCard(slots, index, card);
    if (next === slots) return;
    slots = next; selected = null; addFlow(index, card); moves++; tone('in');
  } else {
    $('selection-message').textContent = '先選擇下方的匯流排卡，再點這個插槽。'; return;
  }
  complete = false; stableFor = 0; render();
}
function reset() {
  drag?.cancel();
  SLOTS.forEach((_, index) => retract(index));
  slots = EMPTY(); selected = null; moves = 0; complete = false; stableFor = 0; hintLevel = 0;
  $('hint-text').hidden = true; $('hint').textContent = '需要一點提示'; $('hint').setAttribute('aria-expanded', 'false');
  tone('out'); render();
}
$('reset').addEventListener('click', reset);
$('sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled; $('sound').textContent = `音效：${soundEnabled ? '開' : '關'}`;
  $('sound').setAttribute('aria-pressed', String(soundEnabled)); tone('select');
});
const hints = [
  '插槽的「入口」是起點；卡片的 1、2、3 節決定往後走多遠。只在編號接點串接，管道交叉處不導通。',
  '從 00 電源開始。02、05、07 是盲端；讓前一張卡的終點等於下一個已插卡插槽的入口。',
  '可以先試：短距 A 卡插 S01，從 00 接到 01。下一段需要入口 01 的插槽。',
  '一組完整配置：S01 放 A、S02 放 C、S03 放 B，S04 留空。路線為 00 → 01 → 03 → 06。',
];
$('hint').addEventListener('click', () => {
  if (hintLevel === hints.length) { hintLevel = 0; $('hint-text').hidden = true; $('hint').textContent = '需要一點提示'; $('hint').setAttribute('aria-expanded', 'false'); return; }
  $('hint-text').textContent = hints[hintLevel++]; $('hint-text').hidden = false;
  $('hint').textContent = hintLevel === hints.length ? '收起提示' : `下一個提示 · ${hintLevel} / ${hints.length}`;
  $('hint').setAttribute('aria-expanded', 'true');
});
const input = installInput({
  cancel: () => { drag?.cancel(); selected = null; render(); },
  onOwnerChange: owner => {
    const interruptedDrag = drag?.active && drag.owner !== owner;
    if (interruptedDrag) drag.cancel();
    $('input-help').textContent = owner === 'gamepad' ? '左搖桿 / 方向鍵選擇 · A 操作 · B 取消選卡' : owner === 'keyboard' ? '方向鍵 / Tab 選擇 · Enter / 空白鍵插拔 · Esc 取消' : owner === 'touch' ? '拖入插卡 · 拖出拔卡 · 拖到已插卡交換' : '拖入插卡 · 拖出拔卡 · 拖到已插卡交換 · Esc 取消';
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
    button.innerHTML = `<span class="slot-top"><span>SLOT ${slot.id}</span><span>入口 0${slot.source}</span></span><span class="socket-well" aria-hidden="true"><i></i></span><span class="socket-latch latch-left" aria-hidden="true"></span><span class="socket-latch latch-right" aria-hidden="true"></span>${card ? `<span class="installed-module" aria-hidden="true"><b>${card.id}</b></span>` : ''}<span class="card-grip" aria-hidden="true"></span><strong class="slot-title">${card ? `${card.id} · ${card.name}` : '空插槽'}</strong><span class="slot-info">${card ? `0${slot.source} → 0${slot.source + card.span}　${directional ? '確認拔除' : '拖出拔除'}` : selected ? `插入 ${selected} 卡` : '拖曳匯流排至此'}</span>`;
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
  if (!slots.some(Boolean) && !selected) $('selection-message').textContent = directional ? '選取下方卡片，再確認空插槽插入。' : '把下方卡片拖進空槽；拖出插槽即可拔除。';
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
  const key = JSON.stringify([slots, result.ready.length, complete, charging, retracting]);
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
  $('status').textContent = complete ? '檢查通過。三段電流已串接，引擎核心供能穩定。可拔卡觀察中斷，或重新測試。' : retracting && !slots.some(Boolean) ? '能量正在沿管道收回，等待下一次配置。' : charging ? '電流沿管道前進中，觀察各張卡最後停在哪個接點。' : result.complete ? '三段已接通，正在確認供能穩定…' : !slots.some(Boolean) ? '讓三張卡的管道首尾相接，將電流送至引擎核心。' : result.end === 6 ? '已到核心，但還需要三張卡完整串聯。試著接上缺少的那一段。' : result.ready.length ? `電源已接至 0${result.end}。${[2,5,7].includes(result.end) ? '這是盲端，請拔卡改換導通距離。' : '找入口相同的插槽，接續下一段。'}` : '目前只有局部通電。先讓入口 00 的插槽接上電源。';
  document.body.dataset.complete = String(complete);
}
function drawFlow(animation, now) {
  const visible = animation.length * animation.progress;
  for (const element of [animation.fill, animation.glow]) element.setAttribute('stroke-dasharray', `${visible} ${animation.length + 1}`);
  animation.group.dataset.progress = animation.progress.toFixed(3);
  animation.group.dataset.flowState = animation.active ? animation.progress >= 1 ? 'held' : 'advancing' : 'retracting';
  const opacity = animation.active ? 1 : Math.min(1, animation.progress * 5);
  animation.group.setAttribute('opacity', String(opacity));
  const point = animation.tube.getPointAtLength(visible);
  animation.head.setAttribute('cx', point.x); animation.head.setAttribute('cy', point.y);
  animation.head.setAttribute('opacity', animation.progress > 0 ? '1' : '0');
  animation.particles.forEach((particle, index) => {
    const fraction = ((now / 1700) + index / 4) % 1;
    const position = animation.tube.getPointAtLength(visible * (animation.active ? fraction : 1 - fraction));
    particle.setAttribute('cx', position.x); particle.setAttribute('cy', position.y);
    particle.setAttribute('opacity', animation.progress > .06 ? '.9' : '0');
  });
}
function frame(now) {
  const dt = Math.min(.05, (now - lastTime) / 1000); lastTime = now;
  for (let index = animations.length - 1; index >= 0; index--) {
    const animation = animations[index];
    animation.progress = advanceCharge(animation.progress, animation.active, dt, animation.active ? 1.15 + animation.length / 2500 : .85);
    drawFlow(animation, now);
    if (!animation.active && animation.progress === 0) { animation.group.remove(); animations.splice(index, 1); }
  }
  const result = connectedReady();
  if (result.complete && result.ready.length === 3) {
    stableFor += dt;
    if (!complete && stableFor >= .65) { complete = true; tone('complete'); }
  } else { stableFor = 0; complete = false; }
  updateReadout(); requestAnimationFrame(frame);
}
render(); requestAnimationFrame(frame);
