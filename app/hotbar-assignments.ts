import { ITEM_BY_ID } from "./item-database.ts";

export const HOTBAR_SLOT_COUNT = 7;
export const HOTBAR_ASSIGNMENTS_STORAGE_KEY = "echoes:hotbar-assignments:v1";
export const DEFAULT_HOTBAR_ASSIGNMENTS: readonly (string | null)[] = [
  "medkit",
  "water-bottle",
  "emergency-ration",
  "lantern",
  "crystal-shard",
  "utility-rope",
  "navigation-data",
];

export function normalizeHotbarAssignments(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_HOTBAR_ASSIGNMENTS];
  return Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => {
    const itemId = value[index];
    return typeof itemId === "string" && ITEM_BY_ID.has(itemId)
      ? itemId
      : null;
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
  next[slotIndex] = itemId !== null && ITEM_BY_ID.has(itemId) ? itemId : null;
  return next;
}
