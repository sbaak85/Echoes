export const CARDS = [
  { id: 'A', name: '短距匯流排', span: 1, color: '#f3bc68', rgb: '243,188,104' },
  { id: 'B', name: '中距匯流排', span: 2, color: '#5fdbc8', rgb: '95,219,200' },
  { id: 'C', name: '長距匯流排', span: 3, color: '#b9a0ff', rgb: '185,160,255' },
];
export const SLOTS = [
  { id: '01', source: 0, direction: 1 }, { id: '02', source: 3, direction: 1 },
  { id: '03', source: 7, direction: -1 }, { id: '04', source: 4, direction: 1 },
];
export const EMPTY = () => [null, null, null, null];
export const routeFor = (slotIndex, cardId) => {
  const card = CARDS.find(item => item.id === cardId);
  const slot = SLOTS[slotIndex];
  return card && slot ? { slot: slotIndex, card: cardId, from: slot.source, to: slot.source + slot.direction * card.span } : null;
};
export function insertCard(slots, slotIndex, cardId) {
  if (!SLOTS[slotIndex] || slots[slotIndex] || slots.includes(cardId) || !CARDS.some(card => card.id === cardId)) return slots;
  return slots.map((value, index) => index === slotIndex ? cardId : value);
}
export function removeCard(slots, slotIndex) {
  return slots.map((value, index) => index === slotIndex ? null : value);
}
export function swapDetachedCard(slots, sourceSlot, targetSlot, cardId) {
  if (!Number.isInteger(sourceSlot) || !Number.isInteger(targetSlot) ||
      !SLOTS[sourceSlot] || !SLOTS[targetSlot] || sourceSlot === targetSlot ||
      slots[sourceSlot] !== null || !CARDS.some(card => card.id === slots[targetSlot]) ||
      slots.includes(cardId) || !CARDS.some(card => card.id === cardId)) return slots;
  const displaced = slots[targetSlot];
  return slots.map((value, index) => index === sourceSlot ? displaced : index === targetSlot ? cardId : value);
}
export function evaluate(slots) {
  const routes = slots.map((card, index) => routeFor(index, card)).filter(Boolean);
  const chain = [];
  let node = 0;
  for (let i = 0; i < 3; i++) {
    const next = routes.find(route => route.from === node);
    if (!next) break;
    chain.push(next);
    node = next.to;
  }
  return { routes, chain, end: node, complete: node === 6 && chain.length === 3 && routes.length === 3 };
}
export function advanceCharge(progress, energized, seconds, duration = 1.25) {
  return Math.max(0, Math.min(1, progress + (energized ? 1 : -1) * Math.max(0, seconds) / duration));
}
