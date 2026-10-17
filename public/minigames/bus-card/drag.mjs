import { swapDetachedCard } from './model.mjs';

export function moveDrag(session, x, y) {
  const started = session.started || Math.hypot(x - session.startX, y - session.startY) >= session.threshold;
  const rect = session.sourceRect;
  const outside = x < rect.left - 4 || x > rect.right + 4 || y < rect.top - 4 || y > rect.bottom + 4;
  const detachNow = started && session.sourceSlot !== null && !session.detached && outside;
  return { ...session, started, detached: session.detached || detachNow, detachNow };
}
export function dropIntent(session, targetSlot, slots) {
  if (!session.started) return { type: 'click' };
  if (session.sourceSlot !== null && !session.detached) return { type: 'stay' };
  if (targetSlot !== null && slots[targetSlot] === null) return { type: 'insert', slot: targetSlot };
  if (session.detached && swapDetachedCard(slots, session.sourceSlot, targetSlot, session.card) !== slots) return { type: 'swap', slot: targetSlot };
  return { type: 'return', blocked: targetSlot !== null };
}

export function installCardDrag({ cards, readSlots, snapshot, onStart, onDetach, onDrop, onCancel }) {
  let session = null, ghost = null, suppressClick = false;
  const body = document.body;
  const clearTargets = () => document.querySelectorAll('.drop-ready,.drop-swap,.drop-blocked,.drag-origin,.drawer-ready').forEach(element => element.classList.remove('drop-ready','drop-swap','drop-blocked','drag-origin','drawer-ready'));
  const pointSlot = (x, y) => {
    const slot = document.elementFromPoint(x, y)?.closest('.slot');
    return slot ? Number(slot.id.split('-')[1]) : null;
  };
  function cleanup() {
    const previous = session;
    session = null;
    ghost?.remove(); ghost = null;
    clearTargets(); delete body.dataset.dragging;
    if (previous?.element.hasPointerCapture?.(previous.pointerId)) previous.element.releasePointerCapture(previous.pointerId);
    return previous;
  }
  function cancel() {
    if (!session) return;
    const previous = cleanup();
    suppressClick = true;
    if (previous.started) onCancel(previous);
  }
  function makeGhost() {
    const card = cards.find(item => item.id === session.card);
    ghost = document.createElement('div');
    ghost.className = 'drag-card'; ghost.setAttribute('aria-hidden','true');
    ghost.style.setProperty('--card-color',card.color); ghost.style.setProperty('--card-rgb',card.rgb);
    ghost.innerHTML = `<span class="card-chip">${card.id}</span><span><strong>${card.name}</strong><small>${card.span} 節導通距離</small><span class="drag-caption">拖到空槽後放開</span></span><i class="drag-pins"></i>`;
    body.append(ghost);
    session.element.classList.add('drag-origin'); body.dataset.dragging = session.card;
    document.getElementById(`card-${session.card}`).classList.add('drag-origin');
  }
  function position(x, y) {
    const touch = session.pointerType !== 'mouse';
    ghost.style.left = `${x}px`; ghost.style.top = `${y}px`;
    ghost.style.transform = `translate(-50%,${touch ? '-115%' : '-55%'}) rotate(-3deg)`;
    document.querySelectorAll('.drop-ready,.drop-swap,.drop-blocked').forEach(element => element.classList.remove('drop-ready','drop-swap','drop-blocked'));
    const target = pointSlot(x,y), slots = readSlots();
    const swap = dropIntent(session,target,slots).type === 'swap';
    const free = target !== null && (slots[target] === null || (target === session.sourceSlot && !session.detached));
    if (target !== null) document.getElementById(`slot-${target}`).classList.add(swap ? 'drop-swap' : free ? 'drop-ready' : 'drop-blocked');
    document.querySelector('.card-drawer').classList.toggle('drawer-ready', target === null);
    ghost.classList.toggle('over-slot',free || swap); ghost.classList.toggle('swapping',swap); ghost.classList.toggle('blocked',target !== null && !free && !swap);
    ghost.querySelector('.drag-caption').textContent = swap ? `放開交換 ${session.card} / ${slots[target]} 卡 · SLOT ${String(session.sourceSlot+1).padStart(2,'0')} 與 ${String(target+1).padStart(2,'0')}` : free ? `放開插入 SLOT ${String(target+1).padStart(2,'0')}` : target !== null ? '插槽已佔用 · 放開退回卡片架' : session.sourceSlot !== null && session.detached ? '已拔除 · 可換槽、交換或放回卡片架' : '拖到空槽後放開';
  }
  function update(event) {
    if (!session || event.pointerId !== session.pointerId) return;
    const wasStarted = session.started;
    session = moveDrag(session,event.clientX,event.clientY);
    if (!session.started) return;
    event.preventDefault();
    if (!wasStarted) { onStart(session); makeGhost(); }
    if (session.detachNow) onDetach(session);
    position(event.clientX,event.clientY);
  }
  document.addEventListener('pointerdown', event => {
    if (session) return;
    suppressClick = false;
    if (event.button !== 0 || event.isPrimary === false) return;
    const element = event.target.closest('.bus-card,.slot');
    if (!element || element.disabled) return;
    const sourceSlot = element.classList.contains('slot') ? Number(element.id.split('-')[1]) : null;
    const card = sourceSlot === null ? element.id.slice(5) : readSlots()[sourceSlot];
    if (!card) return;
    session = { card, sourceSlot, sourceRect: element.getBoundingClientRect(), startX:event.clientX, startY:event.clientY, threshold:event.pointerType==='mouse'?7:11, pointerId:event.pointerId, pointerType:event.pointerType, element, started:false, detached:false, before:snapshot() };
    element.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => update(event), {passive:false});
  document.addEventListener('pointerup', event => {
    if (!session || event.pointerId !== session.pointerId) return;
    update(event);
    const intent = dropIntent(session,pointSlot(event.clientX,event.clientY),readSlots());
    const previous = cleanup();
    if (intent.type === 'click') return;
    event.preventDefault(); suppressClick = true;
    onDrop(previous,intent);
  });
  document.addEventListener('click', event => {
    if (suppressClick && event.detail !== 0) { suppressClick=false; event.preventDefault(); event.stopImmediatePropagation(); }
  },true);
  document.addEventListener('dragstart', event => { if (event.target.closest('.bus-card,.slot')) event.preventDefault(); });
  document.addEventListener('pointercancel', event => { if (session?.pointerId===event.pointerId) cancel(); });
  document.addEventListener('lostpointercapture', event => { if (session?.pointerId===event.pointerId) cancel(); });
  window.addEventListener('blur',cancel);
  document.addEventListener('visibilitychange',()=>{if(document.hidden) cancel();});
  return { cancel, get active(){return !!session;}, get owner(){return session?.pointerType==='mouse'?'mouse':'touch';} };
}
