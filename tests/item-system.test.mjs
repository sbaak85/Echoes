import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_PLAYER_INVENTORY,
  ITEM_DATABASE,
  ITEM_DATABASE_CAPACITY,
  ITEM_DEFINITIONS,
  getItemDebugSpawnDelivery,
  getOwnedItemStacks,
  grantInventoryItem,
  loadPlayerInventory,
  normalizePlayerInventory,
  parseDebugItemSpawnCommand,
  removeInventoryItem,
  resolveItemId,
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

test("Debug 道具生成指令支援 ID、數量與生成去向", () => {
  assert.deepEqual(parseDebugItemSpawnCommand("R0004 3"), {
    itemId: "R0004",
    quantity: 3,
  });
  assert.deepEqual(parseDebugItemSpawnCommand("T0005"), {
    itemId: "T0005",
    quantity: 1,
  });
  assert.equal(parseDebugItemSpawnCommand("T0005 0"), null);
  assert.equal(parseDebugItemSpawnCommand("T0005 three"), null);

  const inventoryItem = ITEM_DEFINITIONS.find(
    (item) => item.id === "M0001",
  );
  const worldItem = ITEM_DEFINITIONS.find(
    (item) => item.id === "R0004",
  );
  assert.equal(getItemDebugSpawnDelivery(inventoryItem), "inventory");
  assert.equal(getItemDebugSpawnDelivery(worldItem), "world");
});

test("中央道具資料庫固定保留 100 欄，現有 28 項道具都有分類流水號與英文名稱", () => {
  assert.equal(validateItemDatabase(), true);
  assert.equal(ITEM_DATABASE.length, ITEM_DATABASE_CAPACITY);
  assert.equal(ITEM_DATABASE_CAPACITY, 100);
  assert.equal(ITEM_DEFINITIONS.length, 28);
  ITEM_DEFINITIONS.forEach((item) => {
    assert.match(item.id, /^[RTQM]\d{4}$/);
    assert.ok(item.englishName.length > 0);
  });
  assert.deepEqual(
    ITEM_DATABASE.map((slot) => slot.slot),
    Array.from({ length: 100 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    ["R0013", "R0014", "R0015"].map((id) => {
      const item = ITEM_DEFINITIONS.find((entry) => entry.id === id);
      return [item?.id, item?.name, item?.category, item?.usable];
    }),
    [
      ["R0013", "通訊陣列面板", "resource", false],
      ["R0014", "量子傳輸器", "resource", false],
      ["R0015", "校正元件", "resource", false],
    ],
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
    ITEM_DEFINITIONS.find((item) => item.id === "R0001")
      ?.inventoryRules,
    { transferable: true, discardable: true, stackSize: 99 },
  );
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "Q0001")
      ?.inventoryRules,
    { transferable: false, discardable: false, stackSize: 1 },
  );
});

test("每項道具都有生存影響欄位，五種消耗品使用正確設定", () => {
  ITEM_DEFINITIONS.forEach((item) => {
    assert.equal(typeof item.survivalEffects, "object");
  });
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "R0004")?.survivalEffects,
    { thirst: 30 },
  );
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "R0005")?.survivalEffects,
    { stamina: 30, hunger: 50 },
  );
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "R0006")?.survivalEffects,
    { hunger: 10, thirst: 10 },
  );
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "R0012")?.survivalEffects,
    { stamina: 20, hunger: 50, thirst: 40 },
  );
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "R0100")?.survivalEffects,
    { stamina: 100, hunger: 100, thirst: 100, spirit: 100 },
  );
});

test("全回復測試道具會將四項生存計量恢復至100並消耗一個", () => {
  const survival = createInitialSurvivalState();
  survival.values = { stamina: 1, hunger: 20, thirst: 45, spirit: 70 };
  const result = useSurvivalInventoryItem({ R0100: 100 }, survival, "R0100");
  assert.equal(result.status, "success");
  assert.deepEqual(result.survival.values, {
    stamina: 100,
    hunger: 100,
    thirst: 100,
    spirit: 100,
  });
  assert.equal(result.inventory.R0100, 99);
});

test("外星果實會恢復體力20、飢餓50、口渴40並消耗一個", () => {
  const survival = createInitialSurvivalState();
  survival.values.stamina = 50;
  survival.values.hunger = 30;
  survival.values.thirst = 20;
  const result = useSurvivalInventoryItem({ R0012: 2 }, survival, "R0012");
  assert.equal(result.status, "success");
  assert.deepEqual(result.survival.values, {
    stamina: 70,
    hunger: 80,
    thirst: 60,
    spirit: 100,
  });
  assert.equal(result.inventory.R0012, 1);
});

test("舊版英文 ID 會轉換成新版分類流水號，數量相同時合併", () => {
  assert.equal(resolveItemId("crystal-shard"), "R0001");
  assert.equal(resolveItemId("r0004"), "R0004");
  assert.deepEqual(
    normalizePlayerInventory({
      "water-bottle": 2,
      R0004: 3,
      medkit: 2,
    }),
    { R0004: 5, T0005: 2 },
  );
});

test("成功使用生存道具會套用效果並消耗一個", () => {
  const survival = createInitialSurvivalState();
  survival.values.thirst = 45;
  const result = useSurvivalInventoryItem(
    { "R0004": 2 },
    survival,
    "R0004",
  );
  assert.equal(result.status, "success");
  assert.equal(result.survival.values.thirst, 75);
  assert.equal(result.inventory["R0004"], 1);
});

test("緊急口糧同時恢復體力 30 與飢餓 50", () => {
  const survival = createInitialSurvivalState();
  survival.values.stamina = 40;
  survival.values.hunger = 30;
  const result = useSurvivalInventoryItem(
    { "R0005": 2 },
    survival,
    "R0005",
  );
  assert.equal(result.status, "success");
  assert.equal(result.survival.values.stamina, 70);
  assert.equal(result.survival.values.hunger, 80);
  assert.equal(result.inventory["R0005"], 1);
});

test("回復目標已滿時無法使用且不消耗道具，未設定效果也維持不可用", () => {
  for (const itemId of [
    "R0004",
    "R0005",
    "R0006",
    "R0012",
    "R0100",
  ]) {
    const fullResult = useSurvivalInventoryItem(
      { [itemId]: 2 },
      createInitialSurvivalState(),
      itemId,
    );
    assert.equal(fullResult.status, "full", itemId);
    assert.equal(fullResult.inventory[itemId], 2, itemId);
  }

  const unconfiguredResult = useSurvivalInventoryItem(
    { T0005: 2 },
    createInitialSurvivalState(),
    "T0005",
  );
  assert.equal(unconfiguredResult.status, "not-configured");
  assert.equal(unconfiguredResult.inventory.T0005, 2);
});

test("複數回復道具只要任一目標未滿仍可使用，並且不會超過100", () => {
  const rationSurvival = createInitialSurvivalState();
  rationSurvival.values.stamina = 99;
  const rationResult = useSurvivalInventoryItem(
    { "R0005": 2 },
    rationSurvival,
    "R0005",
  );
  assert.equal(rationResult.status, "success");
  assert.equal(rationResult.survival.values.stamina, 100);
  assert.equal(rationResult.survival.values.hunger, 100);
  assert.equal(rationResult.inventory["R0005"], 1);

  const sporeSurvival = createInitialSurvivalState();
  sporeSurvival.values.thirst = 99;
  const sporeResult = useSurvivalInventoryItem(
    { "R0006": 2 },
    sporeSurvival,
    "R0006",
  );
  assert.equal(sporeResult.status, "success");
  assert.equal(sporeResult.survival.values.hunger, 100);
  assert.equal(sporeResult.survival.values.thirst, 100);
  assert.equal(sporeResult.inventory["R0006"], 1);
});

test("多項回復只要至少一項未滿即可使用並各自封頂", () => {
  const survival = createInitialSurvivalState();
  survival.values.thirst = 94;
  const result = useSurvivalInventoryItem(
    { "R0006": 1 },
    survival,
    "R0006",
  );
  assert.equal(result.status, "success");
  assert.equal(result.survival.values.hunger, 100);
  assert.equal(result.survival.values.thirst, 100);
  assert.equal("R0006" in result.inventory, false);
});

test("重新開始時所有已登記道具至少各有一個，既有複數數量保持不變", () => {
  const ownedStacks = getOwnedItemStacks(INITIAL_PLAYER_INVENTORY);
  const ownedIds = ownedStacks.map((stack) => stack.definition.id);

  assert.equal(ownedStacks.length, ITEM_DEFINITIONS.length);
  assert.deepEqual(
    [...ownedIds].sort(),
    ITEM_DEFINITIONS.map((item) => item.id).sort(),
  );
  ownedStacks.forEach((stack) => assert.ok(stack.count >= 1));
  assert.equal(
    ownedStacks.find((stack) => stack.definition.id === "T0005")?.count,
    2,
  );
  assert.equal(INITIAL_PLAYER_INVENTORY["R0004"], 3);
  assert.equal(INITIAL_PLAYER_INVENTORY["R0005"], 4);
  assert.equal(INITIAL_PLAYER_INVENTORY.R0100, 100);
});

test("不合法、未知或數量為零的道具不會混入玩家狀態", () => {
  assert.deepEqual(
    normalizePlayerInventory({
      T0005: 2.9,
      R0007: 0,
      "unknown-item": 99,
      T0006: -2,
      "R0004": "3",
    }),
    { T0005: 2 },
  );
});

test("重新開始時不在場上預置測試用藍色晶體碎片", () => {
  assert.equal(
    WORLD_ITEM_PLACEMENTS.some((entry) => entry.itemId === "R0001"),
    false,
  );
});

test("同一道具可逐次丟棄、歸零移除，再逐個拾回並保存", () => {
  installMemoryLocalStorage();
  try {
    let inventory = { T0005: 2 };
    const droppedItems = normalizeDroppedWorldItems([
      {
        id: "test-drop-T0005-001",
        sceneId: "map_test01",
        itemId: "T0005",
        quantity: 1,
        position: { x: 700, y: 700 },
        interactionPoint: { x: 670, y: 700, facing: "E" },
        pickRadius: 26,
        activationDistance: 48,
        createdFromInventory: true,
      },
      {
        id: "test-drop-T0005-002",
        sceneId: "map_test01",
        itemId: "T0005",
        quantity: 1,
        position: { x: 730, y: 700 },
        interactionPoint: { x: 700, y: 700, facing: "E" },
        pickRadius: 26,
        activationDistance: 48,
        createdFromInventory: true,
      },
    ]);

    inventory = removeInventoryItem(inventory, "T0005", 1);
    assert.equal(inventory.T0005, 1);
    inventory = removeInventoryItem(inventory, "T0005", 1);
    assert.equal("T0005" in inventory, false);
    assert.equal(getOwnedItemStacks(inventory).length, 0);

    savePlayerInventory(inventory);
    saveDroppedWorldItems(droppedItems);
    assert.equal(loadDroppedWorldItems().length, 2);

    inventory = grantInventoryItem(inventory, "T0005", 1);
    const afterFirstPickup = droppedItems.filter(
      (item) => item.id !== "test-drop-T0005-001",
    );
    savePlayerInventory(inventory);
    saveDroppedWorldItems(afterFirstPickup);
    assert.equal(loadPlayerInventory().T0005, 1);
    assert.equal(loadDroppedWorldItems().length, 1);

    inventory = grantInventoryItem(inventory, "T0005", 1);
    savePlayerInventory(inventory);
    saveDroppedWorldItems([]);
    assert.equal(loadPlayerInventory().T0005, 2);
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
        itemId: "R0002",
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
