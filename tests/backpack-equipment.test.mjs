import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ITEM_BY_ID, INITIAL_PLAYER_INVENTORY, calculateInventoryWeight, grantInventoryItem } from "../app/item-database.ts";
import { backpackCapacity, equipBackpack, normalizeEquippedBackpack, loadEquippedBackpack, saveEquippedBackpack } from "../app/inventory-capacity.ts";
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

test("new game equips a basic bag outside inventory", () => {
  const progress = createNewGameProgress();
  assert.equal(progress.equippedBackpack, "T0011");
  assert.equal(progress.inventory.T0011 ?? 0, 0);
});

test("declining retains bag and its weight; equipping consumes one and never returns old equipment", () => {
  const inventory = grantInventoryItem({ R0001: 2 }, "T0012", 2);
  const weight = calculateInventoryWeight(inventory);
  const result = equipBackpack(inventory, "T0012");
  assert.equal(inventory.T0012, 2);
  assert.equal(result.equippedBackpack, "T0012");
  assert.deepEqual(result.inventory, { R0001: 2, T0012: 1 });
  assert.ok(Math.abs(calculateInventoryWeight(result.inventory) - (weight - .8)) < 1e-9);
  assert.equal(equipBackpack({}, "T0013"), null);
  assert.equal(equipBackpack({ R0001: 1 }, "R0001"), null);
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
    const normalized = normalizeEchoesSaveData(save);
    assert.equal(normalized.progress.equippedBackpack, "T0012");
    applySaveDataToRuntimeStorage(normalized);
    assert.equal(loadEquippedBackpack(), "T0012");
    delete save.progress.equippedBackpack;
    assert.equal(normalizeEchoesSaveData(save).progress.equippedBackpack, "T0011");
  } finally { delete globalThis.window; }
});

test("runtime uses equipment capacity, persisted save and existing blocking confirmation", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /backpackCapacity\(equippedBackpack\)/);
  assert.match(source, /equippedBackpack: equippedBackpackRef.current/);
  assert.match(source, /itemUseConfirmationOpenRef.current = true/);
  assert.match(source, /openItemUseConfirmation\(id, -1\)/);
  assert.doesNotMatch(source, /DEFAULT_BACKPACK_CAPACITY_KG/);
});
