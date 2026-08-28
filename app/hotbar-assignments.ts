import {
  INITIAL_PLAYER_INVENTORY,
  ITEM_DEFINITIONS,
  resolveItemId,
  type PlayerInventory,
} from "./item-database.ts";

export const HOTBAR_SLOT_COUNT = 7;
export const HOTBAR_ASSIGNMENTS_STORAGE_KEY = "echoes:hotbar-assignments:v1";
export function createHotbarAssignmentsFromInventory(
  inventory: Readonly<PlayerInventory>,
): (string | null)[] {
  const ownedItemIds = ITEM_DEFINITIONS
    .filter((item) => (inventory[item.id] ?? 0) > 0)
    .map((item) => item.id)
    .slice(0, HOTBAR_SLOT_COUNT);
  return Array.from(
    { length: HOTBAR_SLOT_COUNT },
    (_, index) => ownedItemIds[index] ?? null,
  );
}

// New Game starts with only the items that actually exist in its inventory.
// Historical Debug assignments must never leak into a fresh hotbar.
export const DEFAULT_HOTBAR_ASSIGNMENTS: readonly (string | null)[] =
  createHotbarAssignmentsFromInventory(INITIAL_PLAYER_INVENTORY);

export type HotbarSelectionHintMode = "use" | "unavailable" | "unassigned";

export function getHotbarSelectionHintMode(
  itemId: string | null,
  itemCount: number,
): HotbarSelectionHintMode {
  if (!itemId) return "unassigned";
  return itemCount > 0 ? "use" : "unavailable";
}

export function normalizeHotbarAssignments(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_HOTBAR_ASSIGNMENTS];
  return Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => {
    const itemId = value[index];
    if (typeof itemId !== "string") return null;
    return resolveItemId(itemId);
  });
}

export function loadHotbarAssignments() {
  if (typeof window === "undefined") return [...DEFAULT_HOTBAR_ASSIGNMENTS];
  try {
    const stored = window.localStorage.getItem(HOTBAR_ASSIGNMENTS_STORAGE_KEY);
    return stored === null
      ? [...DEFAULT_HOTBAR_ASSIGNMENTS]
      : normalizeHotbarAssignments(JSON.parse(stored));
  } catch {
    return [...DEFAULT_HOTBAR_ASSIGNMENTS];
  }
}

export function saveHotbarAssignments(assignments: readonly (string | null)[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      HOTBAR_ASSIGNMENTS_STORAGE_KEY,
      JSON.stringify(normalizeHotbarAssignments(assignments)),
    );
  } catch {
    // 私密模式或禁止儲存時，至少保留本次工作階段中的指派結果。
  }
}

export function assignHotbarSlot(
  assignments: readonly (string | null)[],
  slotIndex: number,
  itemId: string | null,
) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= HOTBAR_SLOT_COUNT) {
    return normalizeHotbarAssignments(assignments);
  }
  const next = normalizeHotbarAssignments(assignments);
  next[slotIndex] = itemId === null ? null : resolveItemId(itemId);
  return next;
}
