import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("Options 方向捲動保留虛擬游標位置且不露出中央實體游標", async () => {
  const source = await readFile(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("const activateOptionsDpadMode =");
  const end = source.indexOf("const activateInventoryDpadMode =", start);
  const optionsDpadMode = source.slice(start, end);
  assert.match(optionsDpadMode, /virtualCursorVisible = true/);
  assert.match(optionsDpadMode, /activateGamepadCursor\(\)/);
  assert.doesNotMatch(optionsDpadMode, /virtualCursor\.(?:x|y)\s*=/);
  assert.doesNotMatch(optionsDpadMode, /deactivateGamepadCursor\(\)/);
});

test("Options 阻擋型確認框優先取得 A 鍵，不讓停在框外的虛擬游標吃掉輸入", async () => {
  const source = await readFile(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const optionsBranchStart = source.indexOf("} else if (optionsMenuOpen) {");
  const optionsBranchEnd = source.indexOf("} else if (newPlayerTutorialMenuOpen) {", optionsBranchStart);
  const optionsBranch = source.slice(optionsBranchStart, optionsBranchEnd);
  const modalPriority = optionsBranch.indexOf("saveDataDialogRef.current || restartConfirmationOpenRef.current");
  const cursorFallback = optionsBranch.indexOf("shouldUseOptionsCursor(optionsGamepadModeRef.current)");
  assert.notEqual(modalPriority, -1);
  assert.notEqual(cursorFallback, -1);
  assert.ok(modalPriority < cursorFallback);
  assert.match(optionsBranch, /saveDataDialogRef\.current \|\| restartConfirmationOpenRef\.current[\s\S]*activateOptionsMenuSelection\(\)/);
});
