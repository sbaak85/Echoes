import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ITEM_BY_ID, INITIAL_PLAYER_INVENTORY, calculateInventoryWeight, grantInventoryItem, normalizePlayerInventory } from "../app/item-database.ts";
import { backpackCapacity, canUpgradeBackpack, equipBackpack, normalizeBackpackInventory, normalizeEquippedBackpack, loadEquippedBackpack, saveEquippedBackpack } from "../app/inventory-capacity.ts";
import { createNewGameProgress } from "../app/new-game-reset.ts";
import { normalizeEchoesSaveData, applySaveDataToRuntimeStorage } from "../app/save-data.ts";

test("backpack catalog capacities, empty weights and individual stack limits", () => {
  for (const [id, capacity, weight] of [["T0011",10,.5],["T0012",30,.8],["T0013",50,1]]) {
    const item = ITEM_BY_ID.get(id);
    assert.equal(item.backpackCapacityKg, capacity);
    assert.equal(item.weight, weight);
    assert.equal(item.inventoryRules.stackSize, 1);
    assert.equal(item.usable, true);
    assert.equal(backpackCapacity(id), capacity);
    assert.equal(INITIAL_PLAYER_INVENTORY[id] ?? 0, 0);
  }
});

test("三款背包各有透明 280 圖示與 640 查看圖，並由 ItemDatabase 指向", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  for (const [id, stem] of [["T0011", "basic-backpack"], ["T0012", "survival-backpack"], ["T0013", "powered-backpack"]]) {
    assert.equal(ITEM_BY_ID.get(id)?.artworkStem, stem);
    for (const [kind, size] of [["icon", 280], ["inspect", 640]]) {
      const png = await readFile(new URL(`../public/ui/items/${stem}-${kind}-${size}.png`, import.meta.url));
      assert.equal(png.toString("ascii", 1, 4), "PNG");
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
      assert.equal(png[25], 6, "PNG 必須使用帶 alpha 的 RGBA 色版");
    }
  }
  assert.match(source, /ITEM_BY_ID\.get\(itemId\)\?\.artworkStem/);
  assert.match(source, /getInventoryItemArtworkPreview\(equippedBackpackItem\.id\)\?\.iconPath/);
  assert.match(source, /getInventoryItemArtworkPreview\(itemUseConfirmationItem\.id\)\?\.iconPath/);
});

test("new game equips a basic bag outside inventory", () => {
  const progress = createNewGameProgress();
  assert.equal(progress.equippedBackpack, "T0011");
  assert.equal(progress.inventory.T0011 ?? 0, 0);
});

test("背包只能逐階升級；升級材料消耗一個，固定裝備不回到一般背包", () => {
  const inventory = grantInventoryItem({ R0001: 2 }, "T0012", 2);
  const weight = calculateInventoryWeight(inventory);
  const result = equipBackpack(inventory, "T0012", "T0011");
  assert.equal(inventory.T0012, 1);
  assert.equal(result.equippedBackpack, "T0012");
  assert.deepEqual(result.inventory, { R0001: 2 });
  assert.ok(Math.abs(calculateInventoryWeight(result.inventory) - (weight - .8)) < 1e-9);
  assert.equal(canUpgradeBackpack("T0011", "T0012"), true);
  assert.equal(canUpgradeBackpack("T0012", "T0013"), true);
  assert.equal(canUpgradeBackpack("T0011", "T0013"), false);
  assert.equal(equipBackpack({ T0013: 1 }, "T0013", "T0011"), null);
  assert.deepEqual(equipBackpack({ T0013: 1 }, "T0013", "T0012"), { inventory: {}, equippedBackpack: "T0013" });
  assert.equal(equipBackpack({ T0012: 1 }, "T0012", "T0012"), null);
  assert.equal(equipBackpack({ T0011: 1 }, "T0011", "T0012"), null);
  assert.equal(equipBackpack({}, "T0013"), null);
  assert.equal(equipBackpack({ R0001: 1 }, "R0001"), null);
});

test("背包每款最多一個，裝備中及較低階背包不得再佔一般背包格", () => {
  const basicInventory = { R0001: 2 };
  assert.equal(grantInventoryItem(basicInventory, "T0011", 9), basicInventory);
  const withSurvival = grantInventoryItem(basicInventory, "T0012", 9);
  assert.equal(withSurvival.T0012, 1);
  assert.equal(grantInventoryItem(withSurvival, "T0012", 1), withSurvival);
  assert.equal(grantInventoryItem(withSurvival, "T0012", 1, "T0012"), withSurvival);
  assert.equal(grantInventoryItem(withSurvival, "T0013", 5, "T0012").T0013, 1);
  assert.deepEqual(normalizePlayerInventory({ T0011: 4, T0012: 3, T0013: 2, R0001: 2 }),
    { T0012: 1, T0013: 1, R0001: 2 });
  assert.deepEqual(normalizeBackpackInventory({ T0011: 4, T0012: 3, T0013: 2 }, "T0012"), { T0013: 1 });
  assert.deepEqual(normalizeBackpackInventory({ T0011: 4, T0012: 3, T0013: 2 }, "T0013"), {});
  assert.deepEqual(equipBackpack({ T0011: 1, T0012: 3, T0013: 2 }, "T0012", "T0011"),
    { equippedBackpack: "T0012", inventory: { T0013: 1 } });
});

test("old and invalid equipment falls back to basic; portable save round-trips equipment", () => {
  const values = new Map();
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) } };
  try {
    for (const value of [undefined, null, "bad", "T0001"]) assert.equal(normalizeEquippedBackpack(value), "T0011");
    saveEquippedBackpack("T0013");
    assert.equal(loadEquippedBackpack(), "T0013");
    const save = { format:"EchoesSaveData",schemaVersion:1,savedAt:new Date().toISOString(),slotKind:"manual",summary:{},progress:{...createNewGameProgress(),sceneId:"Scene_3",quest:{schemaVersion:1,quests:{}}} };
    save.progress.equippedBackpack = "T0012";
    save.progress.inventory = { T0011: 3, T0012: 2, T0013: 4 };
    const normalized = normalizeEchoesSaveData(save);
    assert.equal(normalized.progress.equippedBackpack, "T0012");
    assert.deepEqual(normalized.progress.inventory, { T0013: 1 });
    applySaveDataToRuntimeStorage(normalized);
    assert.equal(loadEquippedBackpack(), "T0012");
    delete save.progress.equippedBackpack;
    assert.equal(normalizeEchoesSaveData(save).progress.equippedBackpack, "T0011");
    assert.deepEqual(normalizeEchoesSaveData(save).progress.inventory, { T0012: 1, T0013: 1 });
  } finally { delete globalThis.window; }
});

test("runtime uses equipment capacity, persisted save and existing blocking confirmation", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /backpackCapacity\(equippedBackpack\)/);
  assert.match(source, /equippedBackpack: equippedBackpackRef.current/);
  assert.match(source, /itemUseConfirmationOpenRef.current = true/);
  assert.match(source, /openItemUseConfirmation\(id, -1\)/);
  assert.match(source, /canUpgradeBackpack\(equippedBackpackRef\.current, id\)/);
  assert.match(source, /data-inventory-equipment="true"/);
  assert.match(source, /selectedEquippedBackpack && equippedBackpackItem\s*\? \{ \.\.\.equippedBackpackItem, count: 1 \}/);
  assert.doesNotMatch(source, /DEFAULT_BACKPACK_CAPACITY_KG/);
});

test("背包升級確認視窗以名稱與容量呈現，不影響一般道具的數量", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /label: equippedBackpackItem\.name\.replace\(\/\^\\d\+kg\\s\*\/, ""\)/);
  assert.match(source, /label: itemUseConfirmationItem\.name\.replace\(\/\^\\d\+kg\\s\*\/, ""\)/);
  assert.match(source, /quantityLabel: `\$\{equippedBackpackItem\.backpackCapacityKg\}kg`/);
  assert.match(source, /quantityLabel: `\$\{itemUseConfirmationItem\.backpackCapacityKg\}kg`/);
  assert.match(source, /const quantityLabel = entry\.quantityLabel \?\? `×\$\{quantity\}`/);
  assert.match(source, /升級後會改裝此背包，將與舊背包整合並提升負重能力。/);
  assert.match(source, /可暫不升級，新背包會先存放在背包格並佔用\$\{itemUseConfirmationItem\.weight\.toFixed\(1\)\}kg重量。/);
  assert.match(source, /是否升級成「\{itemUseConfirmationItem\.name\}」\?/);
  assert.doesNotMatch(source, /是否使用「\{itemUseConfirmationItem\.name\}」升級/);
  assert.doesNotMatch(source, /className="backpack-equipment-comparison"/);
});

test("背包裝備格只顯示圖示，仍可點選查看資訊", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/backpack-container.css", import.meta.url), "utf8");
  const slot = source.match(/<button\s+className=\{`inventory-item inventory-backpack-equipment[\s\S]*?<\/button>/)?.[0];
  assert.ok(slot);
  assert.match(slot, /aria-label=\{`已裝備背包：/);
  assert.match(slot, /onClick=\{selectEquippedBackpack\}/);
  assert.match(slot, /<span className="inventory-item-icon"/);
  assert.doesNotMatch(slot, /inventory-item-caption|inventory-equipment-status|inventory-item-kind/);
  assert.match(styles, /\.inventory-dialog \.inventory-backpack-equipment\{[^}]*left:0;top:calc\(50% - 42px\);width:60px;height:60px/);
  assert.doesNotMatch(source, /<h4>分類統計<\/h4>/);
  assert.match(source, /<section className="inventory-category-stats">[\s\S]*?\["food", "resource", "tool", "quest"\]/);
});

test("已裝備背包可從選中欄位查看大圖，手把 A 也能進入查看操作", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const inspectButton = source.match(/<button\s+type="button"\s+data-inventory-action="inspect"[\s\S]*?<\/button>/)?.[0];
  assert.ok(inspectButton);
  assert.match(inspectButton, /disabled=\{!getInventoryItemArtworkPreview\(selectedInventoryItem\.id\)\}/);
  assert.match(inspectButton, /onClick=\{\(\) => openInventoryItemInspect\(selectedInventoryItem\)\}/);
  assert.match(source, /if \(inventoryEquippedBackpackSelectedRef\.current\) \{[\s\S]*?setInventorySelectedActionValue\("inspect"\);[\s\S]*?setInventoryGamepadFocusValue\("actions"\);/);
  assert.match(source, /imagePath: artwork\.inspectPath/);
});
