import assert from "node:assert/strict";
import test from "node:test";

import {
  createNewGameProgress,
  resetStoredNewGameProgress,
} from "../app/new-game-reset.ts";
import { DEFAULT_HOTBAR_ASSIGNMENTS } from "../app/hotbar-assignments.ts";
import { INITIAL_PLAYER_INVENTORY } from "../app/item-database.ts";

test("新遊戲進度回到第一天 06:00 與完整生存值", () => {
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
});

test("新遊戲會重建初始資源並清空場景進度", () => {
  const progress = createNewGameProgress();
  assert.deepEqual(progress.inventory, INITIAL_PLAYER_INVENTORY);
  assert.deepEqual(progress.hotbarAssignments, DEFAULT_HOTBAR_ASSIGNMENTS);
  assert.equal(progress.collectedWorldItemIds.size, 0);
  assert.deepEqual(progress.droppedWorldItems, []);
  assert.deepEqual(progress.story, { currentChapter: 1 });
});

test("重新開始只覆寫遊戲進度儲存，不清除 Options 偏好", () => {
  const values = new Map([["echoes:interaction-key", "f"]]);
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  };

  try {
    resetStoredNewGameProgress();
    assert.equal(values.get("echoes:interaction-key"), "f");
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
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
