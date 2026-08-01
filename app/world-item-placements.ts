import { resolveItemId } from "./item-database.ts";

export type WorldItemPlacement = {
  id: string;
  sceneId: string;
  itemId: string;
  quantity: number;
  position: { x: number; y: number };
  interactionPoint: {
    x: number;
    y: number;
    facing: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  };
  pickRadius: number;
  activationDistance: number;
};

export type DroppedWorldItem = WorldItemPlacement & {
  createdFromInventory: boolean;
};

/**
 * 場景上的可拾取道具配置。
 * id 是一次性拾取紀錄鍵；已發布後不可任意更名。
 */
export const WORLD_ITEM_PLACEMENTS: readonly WorldItemPlacement[] = [
  {
    id: "map-test01-blue-crystal-shard-001",
    sceneId: "map_test01",
    itemId: "R0001",
    quantity: 1,
    position: { x: 735, y: 670 },
    interactionPoint: { x: 700, y: 682, facing: "E" },
    pickRadius: 30,
    activationDistance: 52,
  },
];

export const COLLECTED_WORLD_ITEMS_STORAGE_KEY =
  "echoes:collected-world-items:v1";
export const DROPPED_WORLD_ITEMS_STORAGE_KEY =
  "echoes:dropped-world-items:v1";

export function loadCollectedWorldItemIds() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const saved = window.localStorage.getItem(
      COLLECTED_WORLD_ITEMS_STORAGE_KEY,
    );
    const values = saved ? JSON.parse(saved) : [];
    return new Set(
      Array.isArray(values)
        ? values.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

export function saveCollectedWorldItemIds(ids: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    COLLECTED_WORLD_ITEMS_STORAGE_KEY,
    JSON.stringify(Array.from(ids)),
  );
}

export function normalizeDroppedWorldItems(value: unknown): DroppedWorldItem[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Partial<DroppedWorldItem>;
    if (
      typeof candidate.id !== "string" ||
      candidate.id.length === 0 ||
      seenIds.has(candidate.id) ||
      typeof candidate.sceneId !== "string" ||
      typeof candidate.itemId !== "string" ||
      !Number.isFinite(candidate.quantity) ||
      !candidate.position ||
      !Number.isFinite(candidate.position.x) ||
      !Number.isFinite(candidate.position.y) ||
      !candidate.interactionPoint ||
      !Number.isFinite(candidate.interactionPoint.x) ||
      !Number.isFinite(candidate.interactionPoint.y)
    ) {
      return [];
    }
    const itemId = resolveItemId(candidate.itemId);
    if (!itemId) return [];
    const quantity = Math.max(1, Math.floor(candidate.quantity ?? 1));
    seenIds.add(candidate.id);
    return [{
      id: candidate.id,
      sceneId: candidate.sceneId,
      itemId,
      quantity,
      position: {
        x: candidate.position.x,
        y: candidate.position.y,
      },
      interactionPoint: {
        x: candidate.interactionPoint.x,
        y: candidate.interactionPoint.y,
        facing: candidate.interactionPoint.facing ?? "S",
      },
      pickRadius: Math.max(1, candidate.pickRadius ?? 26),
      activationDistance: Math.max(1, candidate.activationDistance ?? 48),
      createdFromInventory: candidate.createdFromInventory === true,
    }];
  });
}

export function loadDroppedWorldItems(): DroppedWorldItem[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(DROPPED_WORLD_ITEMS_STORAGE_KEY);
    return saved ? normalizeDroppedWorldItems(JSON.parse(saved)) : [];
  } catch {
    return [];
  }
}

export function saveDroppedWorldItems(items: readonly DroppedWorldItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    DROPPED_WORLD_ITEMS_STORAGE_KEY,
    JSON.stringify(normalizeDroppedWorldItems(items)),
  );
}
