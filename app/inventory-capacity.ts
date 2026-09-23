import { ITEM_BY_ID, normalizePlayerInventory, removeInventoryItem, type PlayerInventory } from "./item-database.ts";
export const DEFAULT_BACKPACK_ID = "T0011";
export const DEFAULT_BACKPACK_CAPACITY_KG = 10;
export const BACKPACK_EQUIPMENT_STORAGE_KEY = "echoes:backpack-equipment:v1";
export function normalizeEquippedBackpack(value: unknown): string {
  return typeof value === "string" && ITEM_BY_ID.get(value)?.backpackCapacityKg
    ? value : DEFAULT_BACKPACK_ID;
}
export function backpackCapacity(id: unknown): number {
  return ITEM_BY_ID.get(normalizeEquippedBackpack(id))!.backpackCapacityKg!;
}
/** Equipped packs include every lower tier, so those parts never occupy an inventory slot. */
export function normalizeBackpackInventory(inventory: PlayerInventory, equippedId: string): PlayerInventory {
  const next = normalizePlayerInventory(inventory);
  const equippedCapacity = backpackCapacity(equippedId);
  for (const [itemId, count] of Object.entries(next)) {
    const capacity = ITEM_BY_ID.get(itemId)?.backpackCapacityKg;
    if (capacity && (capacity <= equippedCapacity || count <= 0)) delete next[itemId];
  }
  return next;
}
export function loadEquippedBackpack(): string {
  try {
    return normalizeEquippedBackpack(typeof window === "undefined"
      ? null : window.localStorage.getItem(BACKPACK_EQUIPMENT_STORAGE_KEY));
  } catch {
    return DEFAULT_BACKPACK_ID;
  }
}
export function saveEquippedBackpack(id: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BACKPACK_EQUIPMENT_STORAGE_KEY, normalizeEquippedBackpack(id));
  }
}
const BACKPACK_UPGRADE_PATH = ["T0011", "T0012", "T0013"] as const;

/** The fixed equipment slot advances one tier at a time; upgrade parts live in inventory until consumed. */
export function canUpgradeBackpack(equippedId: string, upgradeId: string): boolean {
  const currentIndex = BACKPACK_UPGRADE_PATH.indexOf(equippedId as typeof BACKPACK_UPGRADE_PATH[number]);
  return currentIndex >= 0 && BACKPACK_UPGRADE_PATH[currentIndex + 1] === upgradeId;
}

export function equipBackpack(inventory: PlayerInventory, id: string, equippedId = DEFAULT_BACKPACK_ID) {
  if (!canUpgradeBackpack(equippedId, id) || (inventory[id] ?? 0) < 1) return null;
  return { inventory: normalizeBackpackInventory(removeInventoryItem(inventory, id, 1), id), equippedBackpack: id };
}
