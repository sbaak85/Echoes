import assert from "node:assert/strict";
import test from "node:test";

import {
  getClampedInventoryCategoryIndex,
  getInventoryCategoryOffsetForBumper,
} from "../app/inventory-gamepad-control.ts";

test("背包 LB 向左、RB 向右切換道具類型頁籤", () => {
  assert.equal(getInventoryCategoryOffsetForBumper("LB"), -1);
  assert.equal(getInventoryCategoryOffsetForBumper("RB"), 1);
});

test("類型頁籤在範圍內移動，邊界不循環", () => {
  assert.equal(getClampedInventoryCategoryIndex(2, 5, -1), 1);
  assert.equal(getClampedInventoryCategoryIndex(2, 5, 1), 3);
  assert.equal(getClampedInventoryCategoryIndex(0, 5, -1), 0);
  assert.equal(getClampedInventoryCategoryIndex(4, 5, 1), 4);
});
