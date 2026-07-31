export type ItemCategory = "resource" | "tool" | "quest" | "main";

export type ItemInventoryRules = {
  transferable: boolean;
  discardable: boolean;
  stackSize: number;
};

export type ItemDefinition = {
  id: string;
  name: string;
  symbol: string;
  category: ItemCategory;
  description: string;
  weight: number;
  usable: boolean;
  inventoryRules: ItemInventoryRules;
};

export type ItemDatabaseSlot = {
  slot: number;
  item: ItemDefinition | null;
};

/**
 * Echoes 全遊戲道具資料庫。
 *
 * - 固定保留 100 個管理欄位。
 * - 一個道具只能登記一次，id 日後不可任意更名。
 * - 空欄位以 item: null 保留，新增道具時直接填入。
 * - 玩家持有數量不寫在這裡；數量由 PlayerInventory 另外保存。
 */
export const ITEM_DATABASE: readonly ItemDatabaseSlot[] = [
  {
    slot: 1,
    item: {
      id: "crystal-shard",
      name: "藍色晶體碎片",
      symbol: "◆",
      category: "resource",
      description: "帶有微弱共振反應的晶體碎片，可作為能源與精密裝置的材料。",
      weight: 0.2,
      usable: false,
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 2,
    item: {
      id: "metal-parts",
      name: "金屬零件",
      symbol: "⚙",
      category: "resource",
      description: "從舊設備拆下的通用機械零件。",
      weight: 0.4,
      usable: false,
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 3,
    item: {
      id: "fiber-bundle",
      name: "纖維束",
      symbol: "≋",
      category: "resource",
      description: "耐磨且富有韌性的植物纖維。",
      weight: 0.15,
      usable: false,
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 4,
    item: {
      id: "water-bottle",
      name: "淨水瓶",
      symbol: "◉",
      category: "resource",
      description: "經過濾的飲用水，可恢復口渴數值。",
      weight: 0.8,
      usable: true,
      inventoryRules: { transferable: true, discardable: true, stackSize: 20 },
    },
  },
  {
    slot: 5,
    item: {
      id: "emergency-ration",
      name: "緊急口糧",
      symbol: "▰",
      category: "resource",
      description: "便於攜帶的高熱量壓縮食品。",
      weight: 0.35,
      usable: true,
      inventoryRules: { transferable: true, discardable: true, stackSize: 20 },
    },
  },
  {
    slot: 6,
    item: {
      id: "alien-spore",
      name: "外星種子",
      symbol: "✺",
      category: "resource",
      description: "來源不明的活性種子，仍在緩慢脈動。",
      weight: 0.1,
      usable: false,
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 7,
    item: {
      id: "utility-rope",
      name: "繩索",
      symbol: "∞",
      category: "tool",
      description: "可用於攀爬、固定與臨時修繕。",
      weight: 0.7,
      usable: true,
      inventoryRules: { transferable: true, discardable: true, stackSize: 10 },
    },
  },
  {
    slot: 8,
    item: {
      id: "scanner-parts",
      name: "掃描器零件",
      symbol: "◫",
      category: "tool",
      description: "適用於便攜掃描器的替換模組。",
      weight: 0.3,
      usable: false,
      inventoryRules: { transferable: true, discardable: true, stackSize: 30 },
    },
  },
  {
    slot: 9,
    item: {
      id: "repair-kit",
      name: "修理工具",
      symbol: "⌘",
      category: "tool",
      description: "維修野外設備使用的基礎工具組。",
      weight: 1.8,
      usable: true,
      inventoryRules: { transferable: true, discardable: true, stackSize: 5 },
    },
  },
  {
    slot: 10,
    item: {
      id: "tracking-module",
      name: "訊號模組",
      symbol: "◈",
      category: "tool",
      description: "能夠標定近距離異常訊號來源。",
      weight: 0.25,
      usable: true,
      inventoryRules: { transferable: true, discardable: true, stackSize: 10 },
    },
  },
  {
    slot: 11,
    item: {
      id: "time-crystal",
      name: "時間定位晶體",
      symbol: "♢",
      category: "main",
      description: "內部封存著扭曲的時間共振頻率，似乎能標記並導引過去的特定位置。",
      weight: 0.8,
      usable: false,
      inventoryRules: { transferable: false, discardable: false, stackSize: 1 },
    },
  },
  {
    slot: 12,
    item: {
      id: "navigation-data",
      name: "飛船導航資料",
      symbol: "▤",
      category: "quest",
      description: "從墜落飛船中取出的導航資料。",
      weight: 0.2,
      usable: false,
      inventoryRules: { transferable: false, discardable: false, stackSize: 1 },
    },
  },
  {
    slot: 13,
    item: {
      id: "memory-charm",
      name: "遺留下的記憶物",
      symbol: "◍",
      category: "quest",
      description: "一件承載著陌生記憶的隨身物品。",
      weight: 0.1,
      usable: false,
      inventoryRules: { transferable: false, discardable: false, stackSize: 20 },
    },
  },
  {
    slot: 14,
    item: {
      id: "ancient-plate",
      name: "古代符號板",
      symbol: "▥",
      category: "quest",
      description: "刻著尚未解讀符號的古老金屬板。",
      weight: 0.6,
      usable: false,
      inventoryRules: { transferable: false, discardable: false, stackSize: 5 },
    },
  },
  {
    slot: 15,
    item: {
      id: "medkit",
      name: "醫療包",
      symbol: "+",
      category: "tool",
      description: "包含基礎止血與傷口處理用品。",
      weight: 1.1,
      usable: true,
      inventoryRules: { transferable: true, discardable: true, stackSize: 10 },
    },
  },
  {
    slot: 16,
    item: {
      id: "lantern",
      name: "照明燈",
      symbol: "✦",
      category: "tool",
      description: "適合遺跡探索的耐用照明設備。",
      weight: 0.9,
      usable: true,
      inventoryRules: { transferable: true, discardable: true, stackSize: 5 },
    },
  },
  {
    slot: 17,
    item: {
      id: "battery",
      name: "電池組",
      symbol: "▣",
      category: "resource",
      description: "可為小型電子設備供電。",
      weight: 0.5,
      usable: false,
      inventoryRules: { transferable: true, discardable: true, stackSize: 40 },
    },
  },
  {
    slot: 18,
    item: {
      id: "energy-cell",
      name: "能量單元",
      symbol: "●",
      category: "resource",
      description: "具高密度儲能能力的標準單元。",
      weight: 0.45,
      usable: false,
      inventoryRules: { transferable: true, discardable: true, stackSize: 40 },
    },
  },
  {
    slot: 19,
    item: {
      id: "metal-scrap",
      name: "金屬碎片",
      symbol: "⬟",
      category: "resource",
      description: "可重新熔製利用的金屬廢料。",
      weight: 0.2,
      usable: false,
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 20,
    item: {
      id: "synthetic-cloth",
      name: "合成布料",
      symbol: "▧",
      category: "resource",
      description: "輕薄且防水的合成纖維布。",
      weight: 0.18,
      usable: false,
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  { slot: 21, item: null },
  { slot: 22, item: null },
  { slot: 23, item: null },
  { slot: 24, item: null },
  { slot: 25, item: null },
  { slot: 26, item: null },
  { slot: 27, item: null },
  { slot: 28, item: null },
  { slot: 29, item: null },
  { slot: 30, item: null },
  { slot: 31, item: null },
  { slot: 32, item: null },
  { slot: 33, item: null },
  { slot: 34, item: null },
  { slot: 35, item: null },
  { slot: 36, item: null },
  { slot: 37, item: null },
  { slot: 38, item: null },
  { slot: 39, item: null },
  { slot: 40, item: null },
  { slot: 41, item: null },
  { slot: 42, item: null },
  { slot: 43, item: null },
  { slot: 44, item: null },
  { slot: 45, item: null },
  { slot: 46, item: null },
  { slot: 47, item: null },
  { slot: 48, item: null },
  { slot: 49, item: null },
  { slot: 50, item: null },
  { slot: 51, item: null },
  { slot: 52, item: null },
  { slot: 53, item: null },
  { slot: 54, item: null },
  { slot: 55, item: null },
  { slot: 56, item: null },
  { slot: 57, item: null },
  { slot: 58, item: null },
  { slot: 59, item: null },
  { slot: 60, item: null },
  { slot: 61, item: null },
  { slot: 62, item: null },
  { slot: 63, item: null },
  { slot: 64, item: null },
  { slot: 65, item: null },
  { slot: 66, item: null },
  { slot: 67, item: null },
  { slot: 68, item: null },
  { slot: 69, item: null },
  { slot: 70, item: null },
  { slot: 71, item: null },
  { slot: 72, item: null },
  { slot: 73, item: null },
  { slot: 74, item: null },
  { slot: 75, item: null },
  { slot: 76, item: null },
  { slot: 77, item: null },
  { slot: 78, item: null },
  { slot: 79, item: null },
  { slot: 80, item: null },
  { slot: 81, item: null },
  { slot: 82, item: null },
  { slot: 83, item: null },
  { slot: 84, item: null },
  { slot: 85, item: null },
  { slot: 86, item: null },
  { slot: 87, item: null },
  { slot: 88, item: null },
  { slot: 89, item: null },
  { slot: 90, item: null },
  { slot: 91, item: null },
  { slot: 92, item: null },
  { slot: 93, item: null },
  { slot: 94, item: null },
  { slot: 95, item: null },
  { slot: 96, item: null },
  { slot: 97, item: null },
  { slot: 98, item: null },
  { slot: 99, item: null },
  { slot: 100, item: null },
];

export const ITEM_DATABASE_CAPACITY = 100;
export const ITEM_DEFINITIONS = ITEM_DATABASE.flatMap((slot) =>
  slot.item ? [slot.item] : [],
);
export const ITEM_BY_ID = new Map(
  ITEM_DEFINITIONS.map((item) => [item.id, item]),
);

export type PlayerInventory = Record<string, number>;
export type OwnedItemStack = {
  databaseIndex: number;
  definition: ItemDefinition;
  count: number;
};

export const INITIAL_PLAYER_INVENTORY: Readonly<PlayerInventory> = {
  medkit: 2,
  "water-bottle": 3,
  "emergency-ration": 4,
  "utility-rope": 1,
  lantern: 1,
  "navigation-data": 1,
};

export const PLAYER_INVENTORY_STORAGE_KEY = "echoes:player-inventory:v1";

export function normalizePlayerInventory(value: unknown): PlayerInventory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const inventory: PlayerInventory = {};
  Object.entries(value).forEach(([itemId, rawCount]) => {
    if (!ITEM_BY_ID.has(itemId) || typeof rawCount !== "number") return;
    const count = Math.max(0, Math.floor(rawCount));
    if (count > 0) inventory[itemId] = count;
  });
  return inventory;
}

export function loadPlayerInventory(): PlayerInventory {
  if (typeof window === "undefined") return { ...INITIAL_PLAYER_INVENTORY };
  try {
    const saved = window.localStorage.getItem(PLAYER_INVENTORY_STORAGE_KEY);
    if (saved === null) return { ...INITIAL_PLAYER_INVENTORY };
    return normalizePlayerInventory(JSON.parse(saved));
  } catch {
    return { ...INITIAL_PLAYER_INVENTORY };
  }
}

export function savePlayerInventory(inventory: PlayerInventory) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PLAYER_INVENTORY_STORAGE_KEY,
    JSON.stringify(normalizePlayerInventory(inventory)),
  );
}

export function grantInventoryItem(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
): PlayerInventory {
  const definition = ITEM_BY_ID.get(itemId);
  if (!definition) throw new Error(`Unknown item id: ${itemId}`);
  const grantedQuantity = Math.max(0, Math.floor(quantity));
  if (grantedQuantity === 0) return inventory;
  return {
    ...inventory,
    [itemId]: (inventory[itemId] ?? 0) + grantedQuantity,
  };
}

export function removeInventoryItem(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
): PlayerInventory {
  if (!ITEM_BY_ID.has(itemId)) throw new Error(`Unknown item id: ${itemId}`);
  const removedQuantity = Math.max(0, Math.floor(quantity));
  const currentQuantity = inventory[itemId] ?? 0;
  if (removedQuantity === 0 || currentQuantity < removedQuantity) {
    return inventory;
  }

  const nextInventory = { ...inventory };
  const nextQuantity = currentQuantity - removedQuantity;
  if (nextQuantity > 0) nextInventory[itemId] = nextQuantity;
  else delete nextInventory[itemId];
  return nextInventory;
}

export function getOwnedItemStacks(
  inventory: PlayerInventory,
): OwnedItemStack[] {
  return ITEM_DATABASE.flatMap((slot, databaseIndex) => {
    if (!slot.item) return [];
    const count = inventory[slot.item.id] ?? 0;
    return count > 0
      ? [{ databaseIndex, definition: slot.item, count }]
      : [];
  });
}

export function calculateInventoryWeight(inventory: PlayerInventory) {
  return getOwnedItemStacks(inventory).reduce(
    (total, stack) => total + stack.definition.weight * stack.count,
    0,
  );
}

export function validateItemDatabase() {
  if (ITEM_DATABASE.length !== ITEM_DATABASE_CAPACITY) {
    throw new Error(
      `Item database must contain ${ITEM_DATABASE_CAPACITY} slots.`,
    );
  }
  const itemIds = new Set<string>();
  ITEM_DATABASE.forEach((slot, index) => {
    if (slot.slot !== index + 1) {
      throw new Error(`Item database slot ${index + 1} is out of order.`);
    }
    if (!slot.item) return;
    if (itemIds.has(slot.item.id)) {
      throw new Error(`Duplicate item id: ${slot.item.id}`);
    }
    if (
      slot.item.weight < 0 ||
      slot.item.inventoryRules.stackSize < 1
    ) {
      throw new Error(`Invalid item parameters: ${slot.item.id}`);
    }
    itemIds.add(slot.item.id);
  });
  return true;
}

validateItemDatabase();
