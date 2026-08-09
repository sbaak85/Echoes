import assert from "node:assert/strict";
import test from "node:test";

import {
  getDpadToggleValue,
  shouldOptionsCursorTakeControl,
  shouldUseOptionsCursor,
} from "../app/options-gamepad-control.ts";

test("Options 開關使用十字鍵左 OFF、右 ON", () => {
  assert.equal(getDpadToggleValue(-1), false);
  assert.equal(getDpadToggleValue(1), true);
  assert.equal(getDpadToggleValue(0), null);
});

test("Options A 鍵只依最後取得操作權的輸入模式決定目標", () => {
  assert.equal(shouldUseOptionsCursor("cursor"), true);
  assert.equal(shouldUseOptionsCursor("dpad"), false);
});

test("Options 十字鍵模式不會被右搖桿微幅漂移搶回操作權", () => {
  assert.equal(shouldOptionsCursorTakeControl("dpad", 0.1), false);
  assert.equal(shouldOptionsCursorTakeControl("dpad", 0.44), false);
  assert.equal(shouldOptionsCursorTakeControl("dpad", 0.45), true);
  assert.equal(shouldOptionsCursorTakeControl("cursor", 0.01), true);
});
