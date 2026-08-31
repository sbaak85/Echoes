import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  INITIAL_PLAYER_INVENTORY,
  isDebugGrantAllItemsCommand,
  ITEM_DATABASE,
  ITEM_DATABASE_CAPACITY,
  ITEM_DEFINITIONS,
  getItemDebugSpawnDelivery,
  getOwnedItemStacks,
  grantAllInventoryItems,
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

test("MapEditor 道具選項與遊戲 Item 資料庫同步", async () => {
  const sceneModelsSource = await readFile(
    new URL("../MapEditor/SceneModels.cs", import.meta.url),
    "utf8",
  );
  const catalogStart = sceneModelsSource.indexOf(
    "public static class ItemCatalog",
  );
  const catalogEnd = sceneModelsSource.indexOf(
    "public sealed record QuestStageCatalogEntry",
    catalogStart,
  );

  assert.notEqual(catalogStart, -1, "找不到 MapEditor ItemCatalog");
  assert.notEqual(catalogEnd, -1, "找不到 MapEditor ItemCatalog 結尾");

  const editorItems = [
    ...sceneModelsSource.slice(catalogStart, catalogEnd).matchAll(
      /new\("([A-Z]\d{4})", "([^"]+)"\)/g,
    ),
  ]
    .map((match) => ({ id: match[1], name: match[2] }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const gameItems = ITEM_DEFINITIONS.map(({ id, name }) => ({ id, name })).sort(
    (left, right) => left.id.localeCompare(right.id),
  );

  assert.deepEqual(editorItems, gameItems);
});

test("Debug 道具生成指令支援 ID、數量與生成去向", () => {
  assert.equal(isDebugGrantAllItemsCommand("Item All"), true);
  assert.equal(isDebugGrantAllItemsCommand(" item   all "), true);
  assert.equal(isDebugGrantAllItemsCommand("Item All 2"), false);
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

test("Item All 會將道具清單中的每種道具各加入背包一個", () => {
  const inventory = grantAllInventoryItems({ R0005: 2 });
  assert.equal(Object.keys(inventory).length, ITEM_DEFINITIONS.length);
  ITEM_DEFINITIONS.forEach((item) => {
    assert.equal(inventory[item.id], item.id === "R0005" ? 3 : 1);
  });
});

test("中央道具資料庫固定保留 100 欄，現有 33 項道具都有分類流水號與英文名稱", () => {
  assert.equal(validateItemDatabase(), true);
  assert.equal(ITEM_DATABASE.length, ITEM_DATABASE_CAPACITY);
  assert.equal(ITEM_DATABASE_CAPACITY, 100);
  assert.equal(ITEM_DEFINITIONS.length, 33);
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
      ["R0013", "通訊陣列面板", "quest", false],
      ["R0014", "量子傳輸器", "quest", false],
      ["R0015", "校正元件", "quest", false],
    ],
  );
  assert.deepEqual(
    ["T0003", "T0008", "T0009", "T0010"].map((id) => {
      const item = ITEM_DEFINITIONS.find((entry) => entry.id === id);
      return [item?.id, item?.englishName, item?.name, item?.category];
    }),
    [
      ["T0003", "repair-kit", "多功能工具箱", "tool"],
      ["T0008", "digging-shovel", "挖掘鏟", "tool"],
      ["T0009", "multifunction-folding-knife", "多功能折刀", "tool"],
      ["T0010", "sharp-metal-fragment", "鋒利的金屬片", "tool"],
    ],
  );
});

test("所有可恢復生存數值的食品保持原 ItemID 並歸入食物類別", () => {
  const foodItems = ITEM_DEFINITIONS.filter(
    (item) => Object.keys(item.survivalEffects).length > 0,
  );
  assert.deepEqual(
    foodItems.map((item) => item.id),
    ["R0004", "R0005", "R0006", "R0012", "R0100", "R0016", "R0017"],
  );
  assert.ok(foodItems.every((item) => item.category === "food"));
});

test("多功能工具箱設定為確認打開後在地面生成一個現有銲槍工具", () => {
  const repairKit = ITEM_DEFINITIONS.find((item) => item.id === "T0003");
  const weldingTool = ITEM_DEFINITIONS.find((item) => item.id === "T0007");

  assert.equal(repairKit?.name, "多功能工具箱");
  assert.equal(weldingTool?.name, "銲槍工具");
  assert.deepEqual(repairKit?.useAction, {
    type: "grant-items",
    verb: "打開",
    consumeQuantity: 1,
    rewards: [{ itemId: "T0007", quantity: 1, delivery: "world" }],
  });
});

test("金屬零件設定為確認拆解後在地面生成三個金屬碎片", () => {
  const metalParts = ITEM_DEFINITIONS.find((item) => item.id === "R0002");
  const metalScrap = ITEM_DEFINITIONS.find((item) => item.id === "R0009");

  assert.equal(metalParts?.name, "金屬零件");
  assert.equal(metalParts?.usable, true);
  assert.equal(metalScrap?.name, "金屬碎片");
  assert.equal(
    metalScrap?.description,
    "可重新融製的金屬廢料，焊接過程中可用來當作助焊劑使用。",
  );
  assert.deepEqual(metalParts?.useAction, {
    type: "grant-items",
    verb: "拆解",
    consumeQuantity: 1,
    rewards: [{ itemId: "R0009", quantity: 3, delivery: "world" }],
  });
});

test("藍色晶體碎片標記為裝置互動使用，不會被玩家直接吃掉", () => {
  const crystal = ITEM_DEFINITIONS.find((item) => item.id === "R0001");
  assert.equal(crystal?.usable, true);
  assert.equal(crystal?.useMode, "interaction");
  const result = useSurvivalInventoryItem(
    { R0001: 1 },
    createInitialSurvivalState(),
    "R0001",
  );
  assert.equal(result.status, "interaction-only");
  assert.equal(result.inventory.R0001, 1);
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

test("每項道具都有生存影響欄位，七種消耗品使用正確設定", () => {
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
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "R0016")?.survivalEffects,
    { stamina: 20, spirit: 50 },
  );
  assert.deepEqual(
    ITEM_DEFINITIONS.find((item) => item.id === "R0017")?.survivalEffects,
    { thirst: 20, spirit: 20 },
  );
});

test("精神專注劑與提神補給飲料可直接使用並正確恢復生存值", () => {
  const focusState = createInitialSurvivalState();
  focusState.values.stamina = 35;
  focusState.values.spirit = 20;
  const focusResult = useSurvivalInventoryItem(
    { R0016: 1 },
    focusState,
    "R0016",
  );
  assert.equal(focusResult.status, "success");
  assert.equal(focusResult.survival.values.stamina, 55);
  assert.equal(focusResult.survival.values.spirit, 70);
  assert.equal("R0016" in focusResult.inventory, false);

  const drinkState = createInitialSurvivalState();
  drinkState.values.thirst = 45;
  drinkState.values.spirit = 60;
  const drinkResult = useSurvivalInventoryItem(
    { R0017: 1 },
    drinkState,
    "R0017",
  );
  assert.equal(drinkResult.status, "success");
  assert.equal(drinkResult.survival.values.thirst, 65);
  assert.equal(drinkResult.survival.values.spirit, 80);
  assert.equal("R0017" in drinkResult.inventory, false);
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

test("重新開始時只預設持有 2 個緊急口糧與 1 個醫療包", () => {
  const ownedStacks = getOwnedItemStacks(INITIAL_PLAYER_INVENTORY);
  assert.equal(ownedStacks.length, 2);
  assert.deepEqual(INITIAL_PLAYER_INVENTORY, {
    R0005: 2,
    T0005: 1,
  });
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
