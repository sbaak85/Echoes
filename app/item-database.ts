import {
  applySurvivalEffects,
  canApplySurvivalEffects,
  hasConfiguredSurvivalEffects,
  type SurvivalEffects,
  type SurvivalGameState,
} from "./survival-manager.ts";

export type ItemCategory = "resource" | "tool" | "quest" | "main";

export type ItemDebugSpawnDelivery = "world" | "inventory";

export type ItemInventoryRules = {
  transferable: boolean;
  discardable: boolean;
  stackSize: number;
};

export type ItemDefinition = {
  id: string;
  englishName: string;
  name: string;
  symbol: string;
  category: ItemCategory;
  description: string;
  weight: number;
  usable: boolean;
  useMode?: "direct" | "interaction";
  survivalEffects: SurvivalEffects;
  inventoryRules: ItemInventoryRules;
  debugSpawnDelivery?: ItemDebugSpawnDelivery;
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
      id: "R0001",
      englishName: "crystal-shard",
      name: "藍色晶體碎片",
      symbol: "◆",
      category: "resource",
      description: "帶有微弱共振反應的晶體碎片，可作為能源與精密裝置的材料。",
      weight: 0.2,
      usable: true,
      useMode: "interaction",
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 2,
    item: {
      id: "R0002",
      englishName: "metal-parts",
      name: "金屬零件",
      symbol: "⚙",
      category: "resource",
      description: "從舊設備拆下的通用機械零件。",
      weight: 0.4,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 3,
    item: {
      id: "R0003",
      englishName: "fiber-bundle",
      name: "纖維束",
      symbol: "≋",
      category: "resource",
      description: "耐磨且富有韌性的植物纖維。",
      weight: 0.15,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 4,
    item: {
      id: "R0004",
      englishName: "water-bottle",
      name: "淨水瓶",
      symbol: "◉",
      category: "resource",
      description: "經過濾的飲用水，可恢復口渴數值。",
      weight: 0.8,
      usable: true,
      survivalEffects: { thirst: 30 },
      inventoryRules: { transferable: true, discardable: true, stackSize: 20 },
    },
  },
  {
    slot: 5,
    item: {
      id: "R0005",
      englishName: "emergency-ration",
      name: "緊急口糧",
      symbol: "▰",
      category: "resource",
      description: "便於攜帶的高熱量壓縮食品。",
      weight: 0.35,
      usable: true,
      survivalEffects: { stamina: 30, hunger: 50 },
      inventoryRules: { transferable: true, discardable: true, stackSize: 20 },
    },
  },
  {
    slot: 6,
    item: {
      id: "R0006",
      englishName: "alien-spore",
      name: "外星種子",
      symbol: "✺",
      category: "resource",
      description: "來源不明的活性種子，仍在緩慢脈動。",
      weight: 0.1,
      usable: true,
      survivalEffects: { hunger: 10, thirst: 10 },
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 7,
    item: {
      id: "T0001",
      englishName: "utility-rope",
      name: "繩索",
      symbol: "∞",
      category: "tool",
      description: "可用於攀爬、固定與臨時修繕。",
      weight: 0.7,
      usable: true,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 10 },
    },
  },
  {
    slot: 8,
    item: {
      id: "T0002",
      englishName: "scanner-parts",
      name: "掃描器零件",
      symbol: "◫",
      category: "tool",
      description: "適用於便攜掃描器的替換模組。",
      weight: 0.3,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 30 },
    },
  },
  {
    slot: 9,
    item: {
      id: "T0003",
      englishName: "repair-kit",
      name: "多功能工具箱",
      symbol: "⌘",
      category: "tool",
      description: "整合維修、拆裝與現場調整用途的多功能工具箱。",
      weight: 1.8,
      usable: true,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 5 },
    },
  },
  {
    slot: 10,
    item: {
      id: "T0004",
      englishName: "tracking-module",
      name: "訊號模組",
      symbol: "◈",
      category: "tool",
      description: "能夠標定近距離異常訊號來源。",
      weight: 0.25,
      usable: true,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 10 },
    },
  },
  {
    slot: 11,
    item: {
      id: "M0001",
      englishName: "time-crystal",
      name: "時間定位晶體",
      symbol: "♢",
      category: "main",
      description: "內部封存著扭曲的時間共振頻率，似乎能標記並導引過去的特定位置。",
      weight: 0.8,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: false, discardable: false, stackSize: 1 },
      debugSpawnDelivery: "inventory",
    },
  },
  {
    slot: 12,
    item: {
      id: "Q0001",
      englishName: "navigation-data",
      name: "飛船導航資料",
      symbol: "▤",
      category: "quest",
      description: "從墜落飛船中取出的導航資料。",
      weight: 0.2,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: false, discardable: false, stackSize: 1 },
    },
  },
  {
    slot: 13,
    item: {
      id: "Q0002",
      englishName: "memory-charm",
      name: "遺留下的記憶物",
      symbol: "◍",
      category: "quest",
      description: "一件承載著陌生記憶的隨身物品。",
      weight: 0.1,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: false, discardable: false, stackSize: 20 },
    },
  },
  {
    slot: 14,
    item: {
      id: "Q0003",
      englishName: "ancient-plate",
      name: "古代符號板",
      symbol: "▥",
      category: "quest",
      description: "刻著尚未解讀符號的古老金屬板。",
      weight: 0.6,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: false, discardable: false, stackSize: 5 },
    },
  },
  {
    slot: 15,
    item: {
      id: "T0005",
      englishName: "medkit",
      name: "醫療包",
      symbol: "+",
      category: "tool",
      description: "包含基礎止血與傷口處理用品。",
      weight: 1.1,
      usable: true,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 10 },
    },
  },
  {
    slot: 16,
    item: {
      id: "T0006",
      englishName: "lantern",
      name: "照明燈",
      symbol: "✦",
      category: "tool",
      description: "適合遺跡探索的耐用照明設備。",
      weight: 0.9,
      usable: true,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 5 },
    },
  },
  {
    slot: 17,
    item: {
      id: "R0007",
      englishName: "battery",
      name: "電池組",
      symbol: "▣",
      category: "resource",
      description: "可為小型電子設備供電。",
      weight: 0.5,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 40 },
    },
  },
  {
    slot: 18,
    item: {
      id: "R0008",
      englishName: "energy-cell",
      name: "能量單元",
      symbol: "●",
      category: "resource",
      description: "具高密度儲能能力的標準單元。",
      weight: 0.45,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 40 },
    },
  },
  {
    slot: 19,
    item: {
      id: "R0009",
      englishName: "metal-scrap",
      name: "金屬碎片",
      symbol: "⬟",
      category: "resource",
      description: "可重新熔製利用的金屬廢料。",
      weight: 0.2,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 20,
    item: {
      id: "R0010",
      englishName: "synthetic-cloth",
      name: "合成布料",
      symbol: "▧",
      category: "resource",
      description: "輕薄且防水的合成纖維布。",
      weight: 0.18,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 21,
    item: {
      id: "Q0004",
      englishName: "ruin-key",
      name: "遺跡鑰匙",
      symbol: "⚿",
      category: "quest",
      description: "刻有古代紋路的沉重鑰匙，可開啟特定遺跡機關。",
      weight: 0.3,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: false, discardable: false, stackSize: 10 },
    },
  },
  {
    slot: 22,
    item: {
      id: "R0011",
      englishName: "transistor",
      name: "電晶體",
      symbol: "⌁",
      category: "resource",
      description: "修復通訊與控制設備所需的電子元件。",
      weight: 0.05,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 99 },
    },
  },
  {
    slot: 23,
    item: {
      id: "T0007",
      englishName: "welding-tool",
      name: "銲槍工具",
      symbol: "⌐",
      category: "tool",
      description: "用於金屬構件與線路接點修復的便攜銲接工具。",
      weight: 1.4,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 1 },
    },
  },
  {
    slot: 24,
    item: {
      id: "R0012",
      englishName: "alien-fruit",
      name: "外星果實",
      symbol: "⬢",
      category: "resource",
      description: "富含水分與高能量養分的異星果實，可同時恢復體力、飢餓與口渴。",
      weight: 0.3,
      usable: true,
      survivalEffects: { stamina: 20, hunger: 50, thirst: 40 },
      inventoryRules: { transferable: true, discardable: true, stackSize: 20 },
    },
  },
  {
    slot: 25,
    item: {
      id: "R0100",
      englishName: "full-recovery-test-item",
      name: "全回復道具（測試用）",
      symbol: "✚",
      category: "resource",
      description: "測試用全回復道具，使用後會將四項生存計量恢復至上限。",
      weight: 0.0,
      usable: true,
      survivalEffects: {
        stamina: 100,
        hunger: 100,
        thirst: 100,
        spirit: 100,
      },
      inventoryRules: { transferable: true, discardable: true, stackSize: 999 },
    },
  },
  {
    slot: 26,
    item: {
      id: "R0013",
      englishName: "communication-array-panel",
      name: "通訊陣列面板",
      symbol: "▤",
      category: "resource",
      description: "通訊陣列使用的模組化控制面板，可用於修復訊號接收與傳輸設備。",
      weight: 1.2,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 10 },
    },
  },
  {
    slot: 27,
    item: {
      id: "R0014",
      englishName: "quantum-transmitter",
      name: "量子傳輸器",
      symbol: "⌬",
      category: "resource",
      description: "能維持短距離量子訊號同步的精密傳輸模組。",
      weight: 0.8,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 10 },
    },
  },
  {
    slot: 28,
    item: {
      id: "R0015",
      englishName: "calibration-component",
      name: "校正元件",
      symbol: "◈",
      category: "resource",
      description: "用於校正精密儀器讀值與訊號偏差的標準元件。",
      weight: 0.25,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 20 },
    },
  },
  {
    slot: 29,
    item: {
      id: "T0008",
      englishName: "digging-shovel",
      name: "挖掘鏟",
      symbol: "♠",
      category: "tool",
      description: "適合挖掘土壤、清理碎石與翻找埋藏物的耐用工具。",
      weight: 1.6,
      usable: false,
      survivalEffects: {},
      inventoryRules: { transferable: true, discardable: true, stackSize: 1 },
    },
  },
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

/** 舊版英文代號仍保留為英文名稱與存檔遷移別名。 */
export const LEGACY_ITEM_ID_TO_CURRENT_ID = Object.freeze(
  Object.fromEntries(
    ITEM_DEFINITIONS.map((item) => [item.englishName.toLowerCase(), item.id]),
  ) as Readonly<Record<string, string>>,
);

export function resolveItemId(itemId: string): string | null {
  const normalizedId = itemId.trim().toUpperCase();
  if (ITEM_BY_ID.has(normalizedId)) return normalizedId;
  return LEGACY_ITEM_ID_TO_CURRENT_ID[itemId.trim().toLowerCase()] ?? null;
}

export type DebugItemSpawnCommand = {
  itemId: string;
  quantity: number;
};

export function parseDebugItemSpawnCommand(
  command: string,
): DebugItemSpawnCommand | null {
  const match = command.trim().match(/^(\S+)(?:\s+(\d+))?$/);
  if (!match) return null;
  const quantity = match[2] === undefined ? 1 : Number(match[2]);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
    return null;
  }
  return {
    itemId: resolveItemId(match[1]) ?? match[1].toUpperCase(),
    quantity,
  };
}

export function isDebugGrantAllItemsCommand(command: string) {
  return /^item\s+all$/i.test(command.trim());
}

export function getItemDebugSpawnDelivery(
  item: Pick<ItemDefinition, "debugSpawnDelivery">,
): ItemDebugSpawnDelivery {
  return item.debugSpawnDelivery === "inventory" ? "inventory" : "world";
}

export type PlayerInventory = Record<string, number>;
export type OwnedItemStack = {
  databaseIndex: number;
  definition: ItemDefinition;
  count: number;
};

export type SurvivalItemUseResult = {
  status: "success" | "not-owned" | "not-configured" | "interaction-only" | "full";
  inventory: PlayerInventory;
  survival: SurvivalGameState;
  item: ItemDefinition | null;
};

const INITIAL_PLAYER_INVENTORY_OVERRIDES: Readonly<PlayerInventory> = {
  R0005: 2,
  T0005: 1,
};

export const INITIAL_PLAYER_INVENTORY: Readonly<PlayerInventory> =
  Object.freeze(
    ITEM_DEFINITIONS.reduce<PlayerInventory>((inventory, item) => {
      const count = INITIAL_PLAYER_INVENTORY_OVERRIDES[item.id] ?? 0;
      if (count > 0) inventory[item.id] = count;
      return inventory;
    }, {}),
  );

export const PLAYER_INVENTORY_STORAGE_KEY = "echoes:player-inventory:v1";

export function normalizePlayerInventory(value: unknown): PlayerInventory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const inventory: PlayerInventory = {};
  Object.entries(value).forEach(([itemId, rawCount]) => {
    const currentItemId = resolveItemId(itemId);
    if (!currentItemId || typeof rawCount !== "number") return;
    const count = Math.max(0, Math.floor(rawCount));
    if (count > 0) {
      inventory[currentItemId] = (inventory[currentItemId] ?? 0) + count;
    }
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

export function grantAllInventoryItems(
  inventory: PlayerInventory,
): PlayerInventory {
  return ITEM_DEFINITIONS.reduce<PlayerInventory>(
    (nextInventory, item) =>
      grantInventoryItem(nextInventory, item.id, 1),
    inventory,
  );
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

export function useSurvivalInventoryItem(
  inventory: PlayerInventory,
  survival: SurvivalGameState,
  itemId: string,
): SurvivalItemUseResult {
  const item = ITEM_BY_ID.get(itemId) ?? null;
  if (!item || (inventory[itemId] ?? 0) <= 0) {
    return { status: "not-owned", inventory, survival, item };
  }
  if (item.useMode === "interaction") {
    return { status: "interaction-only", inventory, survival, item };
  }
  if (!item.usable || !hasConfiguredSurvivalEffects(item.survivalEffects)) {
    return { status: "not-configured", inventory, survival, item };
  }
  if (!canApplySurvivalEffects(survival.values, item.survivalEffects)) {
    return { status: "full", inventory, survival, item };
  }
  return {
    status: "success",
    inventory: removeInventoryItem(inventory, item.id, 1),
    survival: applySurvivalEffects(survival, item.survivalEffects),
    item,
  };
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
  const englishNames = new Set<string>();
  const categoryPrefixes: Readonly<Record<ItemCategory, string>> = {
    resource: "R",
    tool: "T",
    quest: "Q",
    main: "M",
  };
  ITEM_DATABASE.forEach((slot, index) => {
    if (slot.slot !== index + 1) {
      throw new Error(`Item database slot ${index + 1} is out of order.`);
    }
    if (!slot.item) return;
    if (itemIds.has(slot.item.id)) {
      throw new Error(`Duplicate item id: ${slot.item.id}`);
    }
    const englishName = slot.item.englishName.trim().toLowerCase();
    if (
      !new RegExp(`^${categoryPrefixes[slot.item.category]}\\d{4}$`).test(
        slot.item.id,
      ) ||
      !englishName ||
      englishNames.has(englishName)
    ) {
      throw new Error(`Invalid item identity: ${slot.item.id}`);
    }
    if (
      slot.item.weight < 0 ||
      slot.item.inventoryRules.stackSize < 1 ||
      Object.values(slot.item.survivalEffects).some(
        (value) => !Number.isFinite(value) || Math.abs(value) > 100,
      )
    ) {
      throw new Error(`Invalid item parameters: ${slot.item.id}`);
    }
    itemIds.add(slot.item.id);
    englishNames.add(englishName);
  });
  return true;
}

validateItemDatabase();
