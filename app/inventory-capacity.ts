import { ITEM_BY_ID, removeInventoryItem, type PlayerInventory } from "./item-database.ts";
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
/** An equipped bag is outside inventory. Replacing it destroys the old equipment, never returns it. */
export function equipBackpack(inventory: PlayerInventory, id: string) {
  if (!ITEM_BY_ID.get(id)?.backpackCapacityKg || (inventory[id] ?? 0) < 1) return null;
  return { inventory: removeInventoryItem(inventory, id, 1), equippedBackpack: id };
}
