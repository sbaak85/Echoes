import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  clearNewGameResetPending,
  createNewGameProgress,
  isNewGameResetPending,
  NEW_GAME_RESET_PENDING_STORAGE_KEY,
  resetStoredNewGameProgress,
} from "../app/new-game-reset.ts";
import { DEFAULT_HOTBAR_ASSIGNMENTS } from "../app/hotbar-assignments.ts";
import { INITIAL_PLAYER_INVENTORY } from "../app/item-database.ts";
import {
  CAMP_POWER_INITIAL_VALUE,
  CAMP_POWER_STORAGE_KEY,
} from "../app/camp-power-manager.ts";

test("新遊戲進度回到第三章第 3 天 06:00 與完整生存值", () => {
  const progress = createNewGameProgress();
  assert.equal(progress.survival.gameMinutes, 360);
  assert.deepEqual(progress.survival.values, {
    stamina: 100,
    hunger: 100,
    thirst: 100,
    spirit: 100,
  });
  assert.equal(progress.survival.gameOverReason, null);
  assert.deepEqual(progress.interactionUsage.counts, {});
  assert.deepEqual(progress.interactionUsage.completedOnceIds, []);
  assert.equal(progress.campPower.current, CAMP_POWER_INITIAL_VALUE);
  assert.equal(progress.campPower.dailyConsumptionEnabled, false);
});

test("新遊戲會重建初始資源並清空場景進度", () => {
  const progress = createNewGameProgress();
  assert.deepEqual(progress.inventory, INITIAL_PLAYER_INVENTORY);
  assert.deepEqual(progress.hotbarAssignments, DEFAULT_HOTBAR_ASSIGNMENTS);
  assert.equal(progress.collectedWorldItemIds.size, 0);
  assert.deepEqual(progress.droppedWorldItems, []);
  assert.deepEqual(progress.story, {
    currentChapter: 3,
    completedEventIds: [],
    storyFlags: {},
  });
});

test("重新開始只覆寫遊戲進度儲存，不清除 Options 偏好", () => {
  const values = new Map([["echoes:interaction-key", "f"]]);
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  };

  try {
    resetStoredNewGameProgress();
    assert.equal(values.get("echoes:interaction-key"), "f");
    assert.equal(values.get(NEW_GAME_RESET_PENDING_STORAGE_KEY), "1");
    assert.equal(isNewGameResetPending(), true);
    assert.deepEqual(
      JSON.parse(values.get("echoes:player-inventory:v1")),
      INITIAL_PLAYER_INVENTORY,
    );
    assert.deepEqual(
      JSON.parse(values.get("echoes:collected-world-items:v1")),
      [],
    );
    assert.deepEqual(
      JSON.parse(values.get("echoes:dropped-world-items:v1")),
      [],
    );
    assert.deepEqual(JSON.parse(values.get(CAMP_POWER_STORAGE_KEY)), {
      current: CAMP_POWER_INITIAL_VALUE,
      dailyConsumptionEnabled: false,
      lastProcessedCycle: 0,
    });
    clearNewGameResetPending();
    assert.equal(isNewGameResetPending(), false);
    assert.equal(values.has(NEW_GAME_RESET_PENDING_STORAGE_KEY), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("重新開始會阻擋舊 AUTO 回灌，並讓全新進度排在舊存檔工作之後寫入", async () => {
  const source = await readFile(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const hydrationSource = source.slice(
    source.indexOf("const hydrationTimer ="),
    source.indexOf("const loadedInventory =", source.indexOf("const hydrationTimer =")),
  );
  assert.match(
    hydrationSource,
    /isNewGameResetPending\(\)[\s\S]*\{ save: null, backend: "browser-session" as const \}[\s\S]*readSaveDataSlot\("autosave"\)/,
  );

  const restartSource = source.slice(
    source.indexOf("const confirmRestartNewGame ="),
    source.indexOf("const handleStoryPointerDownCapture", source.indexOf("const confirmRestartNewGame =")),
  );
  assert.match(restartSource, /portableSaveHydratedRef\.current = false/);
  assert.match(restartSource, /window\.clearTimeout\(portableAutosaveTimerRef\.current\)/);
  assert.match(
    restartSource,
    /portableSaveWriteRef\.current = portableSaveWriteRef\.current\.then\([\s\S]*writeFreshNewGame[\s\S]*writeFreshNewGame[\s\S]*await portableSaveWriteRef\.current[\s\S]*clearNewGameResetPending\(\)/,
  );
  assert.match(
    source,
    /queuePortableSaveWrite\("autosave", "auto"\)[\s\S]{0,180}if \(backend\) clearNewGameResetPending\(\)/,
  );
});
