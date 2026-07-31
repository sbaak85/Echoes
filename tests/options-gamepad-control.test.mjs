import assert from "node:assert/strict";
import test from "node:test";

import {
  getDpadToggleValue,
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
