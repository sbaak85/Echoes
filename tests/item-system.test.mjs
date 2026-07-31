import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_PLAYER_INVENTORY,
  ITEM_DATABASE,
  ITEM_DATABASE_CAPACITY,
  ITEM_DEFINITIONS,
  getOwnedItemStacks,
  grantInventoryItem,
  loadPlayerInventory,
  normalizePlayerInventory,
  removeInventoryItem,
  savePlayerInventory,
  useSurvivalInventoryItem,
  validateItemDatabase,
} from "../app/item-database.ts";
import { createInitialSurvivalState } from "../app/survival-manager.ts";
import {
  WORLD_ITEM_PLACEMENTS,
  loadCollectedWorldItemIds,
  loadDroppedWorldItems,
  normalizeDroppedWorldItems,
  saveCollectedWorldItemIds,
  saveDroppedWorldItems,
} from "../app/world-item-placements.ts";

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

test("中央道具資料庫固定保留 100 欄，現有 23 項道具都有唯一欄位", () => {
  assert.equal(validateItemDatabase(), true);
  assert.equal(ITEM_DATABASE.length, ITEM_DATABASE_CAPACITY);
  assert.equal(ITEM_DATABASE_CAPACITY, 100);
  assert.equal(ITEM_DEFINITIONS.length, 23);
  assert.deepEqual(
    ITEM_DATABASE.map((slot) => slot.slot),
    Array.from({ length: 100 }, (_, index) => index + 1),
  );
});

test("每項道具都有轉移、丟棄與每格堆疊量標籤", () => {
  ITEM_DEFINITIONS.forEach((item) => {
    assert.equal(typeof item.inventoryRules.transferable, "boolean");
    assert.equal(typeof item.inventoryRules.discardable, "boolean");
    assert.equal(
      Number.isInteger(item.inventoryRules.stackSize) &&
        item.inventoryRules.stackSize > 0,
      true,
    );
  });
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "crystal-shard")
      ?.inventoryRules,
    { transferable: true, discardable: true, stackSize: 99 },
  );
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "navigation-data")
      ?.inventoryRules,
    { transferable: false, discardable: false, stackSize: 1 },
  );
});

test("每項道具都有生存影響欄位，三種消耗品使用正確設定", () => {
  ITEM_DEFINITIONS.forEach((item) => {
    assert.equal(typeof item.survivalEffects, "object");
  });
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "water-bottle")?.survivalEffects,
    { thirst: 30 },
  );
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "emergency-ration")?.survivalEffects,
    { hunger: 50 },
  );
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "alien-spore")?.survivalEffects,
    { hunger: 10, thirst: 10 },
  );
});

test("成功使用生存道具會套用效果並消耗一個", () => {
  const survival = createInitialSurvivalState();
  survival.values.thirst = 45;
  const result = useSurvivalInventoryItem(
    { "water-bottle": 2 },
    survival,
    "water-bottle",
  );
  assert.equal(result.status, "success");
  assert.equal(result.survival.values.thirst, 75);
  assert.equal(result.inventory["water-bottle"], 1);
});

test("回復目標已滿時無法使用且不消耗道具，未設定效果也維持不可用", () => {
  const fullResult = useSurvivalInventoryItem(
    { "water-bottle": 2 },
    createInitialSurvivalState(),
    "water-bottle",
  );
  assert.equal(fullResult.status, "full");
  assert.equal(fullResult.inventory["water-bottle"], 2);

  const unconfiguredResult = useSurvivalInventoryItem(
    { medkit: 2 },
    createInitialSurvivalState(),
    "medkit",
  );
  assert.equal(unconfiguredResult.status, "not-configured");
  assert.equal(unconfiguredResult.inventory.medkit, 2);
});

test("多項回復只要至少一項未滿即可使用並各自封頂", () => {
  const survival = createInitialSurvivalState();
  survival.values.thirst = 94;
  const result = useSurvivalInventoryItem(
    { "alien-spore": 1 },
    survival,
    "alien-spore",
  );
  assert.equal(result.status, "success");
  assert.equal(result.survival.values.hunger, 100);
  assert.equal(result.survival.values.thirst, 100);
  assert.equal("alien-spore" in result.inventory, false);
});

test("玩家背包只回傳真正持有的道具", () => {
  const ownedStacks = getOwnedItemStacks(INITIAL_PLAYER_INVENTORY);
  const ownedIds = ownedStacks.map((stack) => stack.definition.id);

  assert.equal(ownedStacks.length, 6);
  assert.equal(ownedIds.includes("crystal-shard"), false);
  assert.equal(ownedIds.includes("metal-parts"), false);
  assert.equal(ownedIds.includes("medkit"), true);
  assert.equal(
    ownedStacks.find((stack) => stack.definition.id === "medkit")?.count,
    2,
  );
});

test("不合法、未知或數量為零的道具不會混入玩家狀態", () => {
  assert.deepEqual(
    normalizePlayerInventory({
      medkit: 2.9,
      battery: 0,
      "unknown-item": 99,
      lantern: -2,
      "water-bottle": "3",
    }),
    { medkit: 2 },
  );
});

test("藍色晶體拾取後由 0 變 1，玩家數量與場景拾取狀態都能保存", () => {
  installMemoryLocalStorage();
  try {
    const placement = WORLD_ITEM_PLACEMENTS.find(
      (entry) => entry.itemId === "crystal-shard",
    );
    assert.ok(placement);
    assert.equal(placement.quantity, 1);

    const initialInventory = loadPlayerInventory();
    assert.equal(initialInventory["crystal-shard"] ?? 0, 0);

    const pickedInventory = grantInventoryItem(
      initialInventory,
      placement.itemId,
      placement.quantity,
    );
    const collectedIds = new Set([placement.id]);
    savePlayerInventory(pickedInventory);
    saveCollectedWorldItemIds(collectedIds);

    const restoredInventory = loadPlayerInventory();
    const restoredCollectedIds = loadCollectedWorldItemIds();
    assert.equal(restoredInventory["crystal-shard"], 1);
    assert.equal(
      getOwnedItemStacks(restoredInventory).find(
        (stack) => stack.definition.id === "crystal-shard",
      )?.count,
      1,
    );
    assert.equal(restoredCollectedIds.has(placement.id), true);
  } finally {
    delete globalThis.window;
  }
});

test("同一道具可逐次丟棄、歸零移除，再逐個拾回並保存", () => {
  installMemoryLocalStorage();
  try {
    let inventory = { medkit: 2 };
    const droppedItems = normalizeDroppedWorldItems([
      {
        id: "test-drop-medkit-001",
        sceneId: "map_test01",
        itemId: "medkit",
        quantity: 1,
        position: { x: 700, y: 700 },
        interactionPoint: { x: 670, y: 700, facing: "E" },
        pickRadius: 26,
        activationDistance: 48,
        createdFromInventory: true,
      },
      {
        id: "test-drop-medkit-002",
        sceneId: "map_test01",
        itemId: "medkit",
        quantity: 1,
        position: { x: 730, y: 700 },
        interactionPoint: { x: 700, y: 700, facing: "E" },
        pickRadius: 26,
        activationDistance: 48,
        createdFromInventory: true,
      },
    ]);

    inventory = removeInventoryItem(inventory, "medkit", 1);
    assert.equal(inventory.medkit, 1);
    inventory = removeInventoryItem(inventory, "medkit", 1);
    assert.equal("medkit" in inventory, false);
    assert.equal(getOwnedItemStacks(inventory).length, 0);

    savePlayerInventory(inventory);
    saveDroppedWorldItems(droppedItems);
    assert.equal(loadDroppedWorldItems().length, 2);

    inventory = grantInventoryItem(inventory, "medkit", 1);
    const afterFirstPickup = droppedItems.filter(
      (item) => item.id !== "test-drop-medkit-001",
    );
    savePlayerInventory(inventory);
    saveDroppedWorldItems(afterFirstPickup);
    assert.equal(loadPlayerInventory().medkit, 1);
    assert.equal(loadDroppedWorldItems().length, 1);

    inventory = grantInventoryItem(inventory, "medkit", 1);
    savePlayerInventory(inventory);
    saveDroppedWorldItems([]);
    assert.equal(loadPlayerInventory().medkit, 2);
    assert.equal(loadDroppedWorldItems().length, 0);
  } finally {
    delete globalThis.window;
  }
});

test("互動後生成在場上的道具堆疊會保留來源與數量", () => {
  installMemoryLocalStorage();
  try {
    const rewardItems = normalizeDroppedWorldItems([
      {
        id: "interaction-reward:map_test01:gather-001:1",
        sceneId: "map_test01",
        itemId: "metal-parts",
        quantity: 4,
        position: { x: 760, y: 710 },
        interactionPoint: { x: 726, y: 710, facing: "E" },
        pickRadius: 26,
        activationDistance: 48,
        createdFromInventory: false,
      },
    ]);
    saveDroppedWorldItems(rewardItems);
    const restored = loadDroppedWorldItems();
    assert.equal(restored.length, 1);
    assert.equal(restored[0].quantity, 4);
    assert.equal(restored[0].createdFromInventory, false);
  } finally {
    delete globalThis.window;
  }
});
