import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../app/movement-lab.tsx', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('  const updateQuickAssign ='), source.indexOf('  const activateHotbarItem ='));
function harness(slots) {
  const state = { inventoryOpen: true, saved: 0, audio: [] };
  const quickAssignRef = { current: null };
  const hotbarAssignmentsRef = { current: [...slots] };
  const playerInventoryRef = { current: { item: 2 } };
  const scope = { quickAssignRef, hotbarAssignmentsRef, playerInventoryRef,
    quickAssignDirectionRef: { current: 0 }, quickAssignCursorRef: { current: false }, activeHotbarSlotRef: { current: 0 }, HOTBAR_SLOT_COUNT: 7,
    setQuickAssign: () => {}, setInventoryPanelOpen: value => state.inventoryOpen = value,
    setInventoryContextMenu: () => {}, hideHotbarSelectionHint: () => {}, setActiveHotbarSlot: () => {},
    setHotbarSlotAssignment: (index, id) => { hotbarAssignmentsRef.current[index] = id; state.saved++; },
    playOneShotAudio: eventName => state.audio.push(eventName),
  };
  const js = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const actions = new Function(...Object.keys(scope), js + '; return {beginQuickAssign,confirmQuickAssign,moveQuickAssign,updateQuickAssign};')(...Object.values(scope));
  return { ...actions, state, quickAssignRef, hotbarAssignmentsRef, playerInventoryRef };
}
test('快捷 closes inventory, selects first empty slot, and waits for confirmation before saving', () => {
  const h = harness(['old', null, null, null, null, null, null]);
  h.beginQuickAssign('item');
  assert.equal(h.state.inventoryOpen, false);
  assert.equal(h.quickAssignRef.current.slotIndex, 1);
  assert.equal(h.state.saved, 0);
  h.confirmQuickAssign(); h.confirmQuickAssign();
  assert.equal(h.hotbarAssignmentsRef.current[1], 'item');
  assert.equal(h.state.saved, 1);
  assert.deepEqual(h.state.audio, ['hotbarItemAssigned']);
});
test('full toolbar starts at first slot, wraps, and cancellation preserves every assignment', () => {
  const slots = ['1','2','3','4','5','6','7']; const h = harness(slots);
  h.beginQuickAssign('item'); assert.equal(h.quickAssignRef.current.slotIndex, 0);
  h.moveQuickAssign(-1, 0); assert.equal(h.quickAssignRef.current.slotIndex, 6);
  h.moveQuickAssign(0, 1); h.confirmQuickAssign();
  assert.deepEqual(h.hotbarAssignmentsRef.current, slots); assert.equal(h.state.saved, 0);
  assert.deepEqual(h.state.audio, []);
});
test('replacement changes only selected slot; disappearing inventory cannot assign a missing item', () => {
  const h = harness(['1','2','3','4','5','6','7']); h.beginQuickAssign('item');
  h.moveQuickAssign(1,0); h.confirmQuickAssign();
  assert.deepEqual(h.hotbarAssignmentsRef.current, ['1','item','3','4','5','6','7']);
  h.beginQuickAssign('item'); h.playerInventoryRef.current.item = 0; h.confirmQuickAssign();
  assert.equal(h.state.saved,1);
  assert.deepEqual(h.state.audio, ['hotbarItemAssigned']);
});
