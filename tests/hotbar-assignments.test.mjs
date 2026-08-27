import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  DEFAULT_HOTBAR_ASSIGNMENTS,
  HOTBAR_ASSIGNMENTS_STORAGE_KEY,
  HOTBAR_SLOT_COUNT,
  assignHotbarSlot,
  getHotbarSelectionHintMode,
  loadHotbarAssignments,
  normalizeHotbarAssignments,
  saveHotbarAssignments,
} from "../app/hotbar-assignments.ts";

const styles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

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
    "T0005",
    "R0004",
    "R0005",
    "T0006",
    "R0001",
    "T0001",
    "Q0001",
  ]);
});

test("道具可指派、覆蓋及移除快捷格，不會改變背包資料", () => {
  const inventory = { R0004: 3, R0006: 2 };
  let assignments = normalizeHotbarAssignments(DEFAULT_HOTBAR_ASSIGNMENTS);
  assignments = assignHotbarSlot(assignments, 0, "R0006");
  assert.equal(assignments[0], "R0006");
  assignments = assignHotbarSlot(assignments, 0, null);
  assert.equal(assignments[0], null);
  assert.deepEqual(inventory, { R0004: 3, R0006: 2 });
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
    const saved = assignHotbarSlot(assignments, 3, "R0004");
    saveHotbarAssignments(saved);
    assert.equal(values.has(HOTBAR_ASSIGNMENTS_STORAGE_KEY), true);
    assert.deepEqual(loadHotbarAssignments(), saved);
  } finally {
    delete globalThis.window;
  }
});

test("快捷格沒有庫存時顯示暫無此道具，不顯示Y鍵使用提示", () => {
  assert.equal(getHotbarSelectionHintMode("R0004", 3), "use");
  assert.equal(getHotbarSelectionHintMode("R0004", 0), "unavailable");
  assert.equal(getHotbarSelectionHintMode(null, 0), "unassigned");
});

test("快捷格編號與數量放大且不使用左上角三角填色底", () => {
  assert.match(
    styles,
    /\.hotbar-key,\s*\.hotbar-count\s*\{[\s\S]*?font-size:\s*14px;[\s\S]*?font-weight:\s*700;/,
  );
  assert.doesNotMatch(styles, /\.hotbar-slot\.is-selected \.hotbar-key/);
  assert.doesNotMatch(styles, /clip-path:\s*polygon\(0 0, 100% 0, 0 100%\)/);
  assert.match(
    styles,
    /\.hotbar-count\s*\{[\s\S]*?right:\s*5px;[\s\S]*?bottom:\s*5px;/,
  );
});

test("舊版英文道具 ID 會自動遷移成新版分類流水號", () => {
  assert.deepEqual(
    normalizeHotbarAssignments(["medkit", "water-bottle", "time-crystal"]),
    ["T0005", "R0004", "M0001", null, null, null, null],
  );
});
