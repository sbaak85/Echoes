import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getClampedInventoryCategoryIndex,
  getInventoryCategoryOffsetForBumper,
  getVirtualCursorInventoryItemAction,
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

test("背包固定使用全部、食物、資源、工具、任務道具五個頁籤", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("const INVENTORY_CATEGORIES");
  const end = source.indexOf("const DEFAULT_SELECTED_INVENTORY_INDEX", start);
  const categories = source.slice(start, end);

  assert.match(categories, /\{ id: "all", label: "全部" \}/);
  assert.match(categories, /\{ id: "food", label: "食物" \}/);
  assert.match(categories, /\{ id: "resource", label: "資源" \}/);
  assert.match(categories, /\{ id: "tool", label: "工具" \}/);
  assert.match(categories, /\{ id: "quest", label: "任務道具" \}/);
  assert.doesNotMatch(categories, /label: "主線道具"/);
  assert.match(categories, /category === "main" \? "quest" : category/);
});

test("虛擬游標第一次點道具只選定，再點同一道具才使用", () => {
  assert.equal(getVirtualCursorInventoryItemAction(2, 5), "select");
  assert.equal(getVirtualCursorInventoryItemAction(5, 5), "use");
  assert.equal(getVirtualCursorInventoryItemAction(5, 2), "select");
});

test("背包十字鍵選取只移動選定框，不顯示真實游標或重設虛擬游標", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("const activateInventoryDpadMode =");
  const end = source.indexOf("const activatePowerPuzzleDpadMode =", start);
  const inventoryDpadMode = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "應能找到背包方向選取模式");
  assert.match(inventoryDpadMode, /inventoryGamepadModeRef\.current = "dpad"/);
  assert.match(inventoryDpadMode, /virtualCursorVisible = true/);
  assert.match(inventoryDpadMode, /activateGamepadCursor\(\)/);
  assert.doesNotMatch(inventoryDpadMode, /virtualCursor\.(?:x|y)\s*=/);
  assert.doesNotMatch(inventoryDpadMode, /deactivateGamepadCursor\(\)/);
});

test("對話與背包同時開啟時，手把 B 會先關閉背包", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const backInputStart = source.indexOf("const backJustPressed");
  const skipHoldStart = source.indexOf("if (", backInputStart);
  const skipHoldEnd = source.indexOf("beginStorySkipHold", skipHoldStart);
  const skipHoldGuard = source.slice(skipHoldStart, skipHoldEnd);
  const backPriorityStart = source.indexOf(
    "if (itemUseConfirmationMenuOpen && backJustPressed)",
  );
  const dialogueGuardStart = source.indexOf(
    "!dialoguePlaybackRef.current",
    backPriorityStart,
  );
  const backPrioritySource = source.slice(backPriorityStart, dialogueGuardStart);

  assert.ok(backInputStart >= 0, "應能找到手把 B 鍵的邊緣判斷");
  assert.ok(skipHoldStart >= 0, "應能找到對話長按略過的 B 鍵判斷");
  assert.match(skipHoldGuard, /storyFlowActiveRef\.current/);
  assert.match(skipHoldGuard, /!inventoryOpenRef\.current/);
  assert.match(
    backPrioritySource,
    /else if \(inventoryOpenRef\.current && backJustPressed\) \{[\s\S]*setInventoryPanelOpen\(false\)/,
  );
});

test("背包與阻擋型介面開啟時，虛擬游標不會命中後方世界物件", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const guardStart = source.indexOf("const isWorldInteractionBlockedByUi");
  const guardEnd = source.indexOf("const canUseQuestSkipHotkey", guardStart);
  const guardSource = source.slice(guardStart, guardEnd);
  const activationStart = source.indexOf("const activateBestInteraction");
  const activationEnd = source.indexOf("mobileInteractionActionRef.current", activationStart);
  const activationSource = source.slice(activationStart, activationEnd);
  const promptStart = source.indexOf("const drawInteractionPrompts");
  const promptEnd = source.indexOf("const updateFootstepAudio", promptStart);
  const promptSource = source.slice(promptStart, promptEnd);

  assert.ok(guardStart >= 0, "應有統一的世界互動 UI 阻擋條件");
  assert.match(guardSource, /inventoryOpenRef\.current/);
  assert.match(guardSource, /newPlayerTutorialOpenRef\.current/);
  assert.match(guardSource, /optionsOpenRef\.current/);
  assert.match(guardSource, /itemUseConfirmationOpenRef\.current/);
  assert.match(guardSource, /powerPuzzleOpenRef\.current/);
  assert.match(guardSource, /weldingPuzzleOpenRef\.current/);
  assert.match(
    activationSource,
    /if \(isWorldInteractionBlockedByUi\(\)\) return;/,
  );
  assert.match(
    promptSource,
    /if \(isWorldInteractionBlockedByUi\(\)\) \{[\s\S]*activePromptOwner = null;[\s\S]*return;/,
  );
  assert.ok(
    promptSource.indexOf("isWorldInteractionBlockedByUi()") <
      promptSource.indexOf("findInteractableAt("),
    "應先阻擋 UI，再進行虛擬游標的世界物件命中測試",
  );
});

test("有大圖素材的道具分離使用 280 Icon 與 640 查看圖，且 PNG 都保留透明色版", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const artworkStart = source.indexOf("const INVENTORY_ITEM_ARTWORK_PREVIEWS");
  const artworkEnd = source.indexOf("function getInventoryDisplayCategory", artworkStart);
  const artworkSource = source.slice(artworkStart, artworkEnd);

  assert.ok(artworkStart >= 0 && artworkEnd > artworkStart);
  const artworkEntries = [
    ["R0001", "crystal-shard"],
    ["R0002", "metal-parts"],
    ["R0003", "fiber-bundle"],
    ["R0004", "water-bottle"],
    ["R0005", "emergency-ration"],
    ["R0006", "alien-spore"],
    ["R0007", "battery"],
    ["R0009", "metal-scrap"],
    ["R0010", "synthetic-cloth"],
    ["R0012", "alien-fruit"],
    ["R0013", "communication-array-panel"],
    ["R0014", "quantum-transmitter"],
    ["R0015", "calibration-component"],
    ["R0016", "mental-focus-stimulant"],
    ["R0017", "invigorating-supply-drink"],
    ["T0001", "utility-rope"],
    ["T0003", "repair-kit"],
    ["T0005", "medkit"],
    ["T0006", "lantern"],
    ["T0007", "welding-tool"],
    ["T0008", "digging-shovel"],
    ["T0009", "multifunction-folding-knife"],
    ["T0010", "sharp-metal-fragment"],
    ["Q0001", "navigation-data"],
    ["Q0002", "memory-charm"],
    ["Q0003", "ancient-plate"],
    ["Q0004", "ruin-key"],
    ["M0001", "time-crystal"],
  ];

  for (const [itemId, stem] of artworkEntries) {
    assert.match(
      artworkSource,
      new RegExp(`${itemId}:[\\s\\S]*${stem}-icon-280\\.png`),
    );
    assert.match(
      artworkSource,
      new RegExp(`${itemId}:[\\s\\S]*${stem}-inspect-640\\.png`),
    );
  }
  assert.match(source, /inventory-feature-art[\s\S]*\.inspectPath/);
  assert.match(source, /inventory-item-icon[\s\S]*\.iconPath/);

  const assertTransparentPngSize = (relativePath, expectedSize) => {
    const png = readFileSync(new URL(relativePath, import.meta.url));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), expectedSize);
    assert.equal(png.readUInt32BE(20), expectedSize);
    assert.equal(png[25], 6, "PNG 必須是帶 alpha 的 RGBA 色版");
  };

  for (const [, stem] of artworkEntries) {
    assertTransparentPngSize(`../public/ui/items/${stem}-icon-280.png`, 280);
    assertTransparentPngSize(`../public/ui/items/${stem}-inspect-640.png`, 640);
  }
});

test("道具查看層以 0.2 秒淡入淡出、80% 黑底與模糊阻擋背後操作", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(source, /inventoryItemInspectOpenRef\.current/);
  assert.match(source, /closeInventoryItemInspect/);
  assert.match(source, /aria-label={`關閉\$\{inventoryItemInspect\.itemName\}查看大圖`}/);
  assert.match(source, /inventoryItemInspectOpenRef\.current \|\|/);
  assert.match(source, /inventoryItemInspectMenuOpen[\s\S]*confirmPressed/);
  assert.match(css, /\.inventory-item-inspect-overlay \{[\s\S]*rgba\(0, 0, 0, 0\.8\)/);
  assert.match(css, /\.inventory-item-inspect-overlay \{[\s\S]*backdrop-filter: blur\(12px\)/);
  assert.match(css, /inventory-item-inspect-fade-in 200ms/);
  assert.match(css, /inventory-item-inspect-fade-out 200ms/);
  assert.match(css, /width: min\(640px, 78vw\)/);
  assert.match(css, /height: min\(640px, 78vh\)/);
});
