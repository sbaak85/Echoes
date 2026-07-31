import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HOTBAR_ASSIGNMENTS,
  HOTBAR_ASSIGNMENTS_STORAGE_KEY,
  HOTBAR_SLOT_COUNT,
  assignHotbarSlot,
  loadHotbarAssignments,
  normalizeHotbarAssignments,
  saveHotbarAssignments,
} from "../app/hotbar-assignments.ts";

function installMemoryLocalStorage() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
    },
  };
  return values;
}

test("快捷工具列固定七格並保留目前預設指派", () => {
  assert.equal(HOTBAR_SLOT_COUNT, 7);
  assert.equal(DEFAULT_HOTBAR_ASSIGNMENTS.length, 7);
  assert.deepEqual(normalizeHotbarAssignments(undefined), [
    "medkit",
    "water-bottle",
    "emergency-ration",
    "lantern",
    "crystal-shard",
    "utility-rope",
    "navigation-data",
  ]);
});

test("道具可指派、覆蓋及移除快捷格，不會改變背包資料", () => {
  const inventory = { "water-bottle": 3, "alien-spore": 2 };
  let assignments = normalizeHotbarAssignments(DEFAULT_HOTBAR_ASSIGNMENTS);
  assignments = assignHotbarSlot(assignments, 0, "alien-spore");
  assert.equal(assignments[0], "alien-spore");
  assignments = assignHotbarSlot(assignments, 0, null);
  assert.equal(assignments[0], null);
  assert.deepEqual(inventory, { "water-bottle": 3, "alien-spore": 2 });
});

test("未知道具不會進入快捷格，七格指派可保存與讀回", () => {
  const values = installMemoryLocalStorage();
  try {
    const assignments = assignHotbarSlot(
      DEFAULT_HOTBAR_ASSIGNMENTS,
      3,
      "unknown-item",
    );
    assert.equal(assignments[3], null);
    const saved = assignHotbarSlot(assignments, 3, "water-bottle");
    saveHotbarAssignments(saved);
    assert.equal(values.has(HOTBAR_ASSIGNMENTS_STORAGE_KEY), true);
    assert.deepEqual(loadHotbarAssignments(), saved);
  } finally {
    delete globalThis.window;
  }
});
