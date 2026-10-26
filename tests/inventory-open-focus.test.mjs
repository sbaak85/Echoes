import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../app/movement-lab.tsx', import.meta.url), 'utf8');
const start = source.indexOf('const setInventoryPanelOpen = (open: boolean, preserveSelection = false) => {');
const end = source.indexOf('\n  const setSpeedValue', start);
const openFunction = source.slice(start, end).replace('open: boolean', 'open');

function harness(mode, stacks) {
  const state = { category: 'tool', page: 3, selected: 88, equipped: true };
  const ctx = { state, stacks, Date, window: { clearTimeout() {} },
    settleNaturalSurvivalRef: { current() {} },
    clearInventoryHoverHint() {}, dismissTimeElapsedNotice() {},
    setInventoryGamepadMode(value) { state.mode = value; },
    setInventoryGamepadFocusValue(value) { state.focus = value; },
    setInventorySelectedActionValue(value) { state.action = value; },
    setInventoryMobileTab(value) { state.mobileTab = value; },
    setInventoryCategory(value) { state.category = value; },
    setInventoryPage(value) { state.page = value; },
    setSelectedEquippedBackpack(value) { state.equipped = value; },
    setSelectedInventoryIndex(value) { state.selected = value; },
    setInventoryContextMenu(value) { state.contextMenu = value; },
    setInventoryOpen(value) { state.open = value; },
    getOwnedItemStacks() { return stacks; },
    clearInventoryItemInspectImmediately() {}, setInventoryDrag() {},
    setBackpackDropTarget() {}, setHotbarDropTarget() {},
  };
  for (const name of ['powerPuzzleOpen','starCardsOpen','storyInputLocked','newPlayerTutorialOpen','inventoryOpen',
    'inventoryPointerEquipmentHover','inventoryCursorRearmRequired','inventoryDirectionRearmRequired']) ctx[name+'Ref'] = { current: false };
  for (const name of ['inventoryPointerItemIndex','pendingInventoryDrag','questRuntimeManager']) ctx[name+'Ref'] = { current: null };
  ctx.questPromptInputModeRef = { current: mode };
  ctx.inventoryGamepadModeRef = { current: 'cursor' };
  ctx.inventoryCategoryRef = { current: 'tool' };
  ctx.inventoryEquippedBackpackSelectedRef = { current: true };
  ctx.selectedInventoryIndexRef = { current: 88 };
  ctx.playerInventoryRef = { current: {} };
  runInNewContext(`${openFunction}\nthis.open = setInventoryPanelOpen;`, ctx);
  return { ctx, state };
}

test('every fresh inventory open selects first owned slot on all/page 1 for each input mode', () => {
  for (const mode of ['mouse', 'keyboard', 'gamepad', 'touch']) {
    const { ctx, state } = harness(mode, [{ databaseIndex: 17 }, { databaseIndex: 88 }]);
    ctx.open(true);
    assert.equal(state.selected, 17);
    assert.equal(ctx.selectedInventoryIndexRef.current, 17);
    assert.equal(state.category, 'all');
    assert.equal(ctx.inventoryCategoryRef.current, 'all');
    assert.equal(state.page, 0);
    assert.equal(state.equipped, false);
    assert.equal(state.focus, 'items');
    assert.equal(state.mode, mode === 'gamepad' ? 'dpad' : 'cursor');
    assert.equal(ctx.inventoryDirectionRearmRequiredRef.current, true);
    state.selected = ctx.selectedInventoryIndexRef.current = 88;
    ctx.open(true);
    assert.equal(state.selected, 88, 'already open must not reset an in-progress selection');
    ctx.open(false);
    ctx.open(true, true);
    assert.equal(state.selected, 88, 'returning from quick assignment preserves its item');
    ctx.open(false);
    ctx.open(true);
    assert.equal(state.selected, 17);
  }
});

test('empty inventory clears stale equipment/item selection; blocked opens do not reset it', () => {
  const { ctx, state } = harness('gamepad', []);
  ctx.storyInputLockedRef.current = true;
  ctx.open(true);
  assert.equal(state.selected, 88);
  ctx.storyInputLockedRef.current = false;
  ctx.open(true);
  assert.equal(state.selected, -1);
  assert.equal(state.equipped, false);
});
