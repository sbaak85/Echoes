import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getDpadToggleValue,
  shouldOptionsCursorTakeControl,
  shouldUseOptionsCursor,
} from "../app/options-gamepad-control.ts";

test("Options 高度跟隨可見視窗的 80%，手機斷點不覆蓋，內容內部捲動", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const dialogRules = [...css.matchAll(/\.options-dialog\s*\{([^}]+)\}/g)].map(match => match[1]);
  assert.match(dialogRules[0], /height:\s*80vh;\s*height:\s*80dvh;/);
  assert.match(dialogRules[0], /grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/);
  assert.match(dialogRules[0], /min-height:\s*0;/);
  assert.match(dialogRules[0], /max-height:\s*none;/);
  for (const rule of dialogRules.slice(1)) {
    assert.doesNotMatch(rule, /(?:^|[;\s])height\s*:/);
  }
  assert.match(css, /\.options-overlay\s*\{[^}]*place-items:\s*center;/);
  assert.match(css, /\.options-content\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/);
});

test("進階第一項為重新開始，畫面與方向導航順序一致且保留確認", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const items = source.slice(source.indexOf("const OPTIONS_TAB_ITEMS:"), source.indexOf("const COMPASS_DIRECTIONS:"));
  assert.match(items, /advanced:\s*\[\s*"restart-game",\s*"day-night-effect"/);
  const content = source.slice(source.indexOf('{optionsTab === "advanced" ? ('), source.indexOf('<footer className="options-footer">'));
  assert.equal((content.match(/className="restart-game-option"/g) ?? []).length, 1);
  assert.ok(content.indexOf('className="restart-game-option"') < content.indexOf('className="toggle-button"'));
  assert.match(content, /className="restart-game-option"[\s\S]*?openRestartConfirmation\(\)/);
});

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
  assert.match(optionsDpadMode, /activateDirectionalCursor\(\)/);
  assert.doesNotMatch(optionsDpadMode, /virtualCursorVisible = true/);
  assert.doesNotMatch(optionsDpadMode, /virtualCursor\.(?:x|y)\s*=/);
  assert.doesNotMatch(optionsDpadMode, /deactivateGamepadCursor\(\)/);
});

test("Options 阻擋型確認框遵循最後操作方式，游標未命中時由目前選取項接手 A", async () => {
  const source = await readFile(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const optionsBranchStart = source.indexOf("} else if (optionsMenuOpen) {");
  const optionsBranchEnd = source.indexOf("} else if (newPlayerTutorialMenuOpen) {", optionsBranchStart);
  const optionsBranch = source.slice(optionsBranchStart, optionsBranchEnd);
  assert.match(
    optionsBranch,
    /shouldUseOptionsCursor\(optionsGamepadModeRef\.current\)[\s\S]*const cursorResult = activateVirtualCursorUi\(\)[\s\S]*cursorResult !== "activated"[\s\S]*saveDataDialogRef\.current \|\| restartConfirmationOpenRef\.current[\s\S]*activateOptionsMenuSelection\(\)/,
  );
  assert.match(
    optionsBranch,
    /cursorResult !== "activated"/,
  );

  const cursorActivationStart = source.indexOf("const activateVirtualCursorUi =");
  const cursorActivationEnd = source.indexOf("const getVirtualCursorInventoryIndex =", cursorActivationStart);
  const cursorActivation = source.slice(cursorActivationStart, cursorActivationEnd);
  assert.match(cursorActivation, /\.options-overlay/);
  assert.match(cursorActivation, /\? "blocked"\s*:\s*"none"/);
});
