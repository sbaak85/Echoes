import {
  normalizePlayerInventory,
  savePlayerInventory,
  type PlayerInventory,
} from "./item-database.ts";
import {
  normalizeSurvivalState,
  saveSurvivalState,
  normalizeInteractionUsageState,
  saveInteractionUsageState,
  type InteractionUsageState,
  type SurvivalGameState,
} from "./survival-manager.ts";
import {
  normalizeStoryProgress,
  saveStoryProgress,
  type StoryProgress,
} from "./story-progress.ts";
import { saveQuestSaveData, type QuestSaveData } from "./quest-runtime-manager.ts";
import {
  normalizeCampPowerState,
  saveCampPowerState,
  type CampPowerState,
} from "./camp-power-manager.ts";
import {
  normalizeItemPointProgress,
  saveItemPointProgress,
  type ItemPointProgress,
} from "./item-point-manager.ts";
import {
  normalizeDroppedWorldItems,
  saveCollectedWorldItemIds,
  saveDroppedWorldItems,
  type DroppedWorldItem,
} from "./world-item-placements.ts";

export const SAVE_DATA_FORMAT = "EchoesSaveData" as const;
export const SAVE_DATA_SCHEMA_VERSION = 1 as const;
export const SAVE_DATA_MANUAL_SLOT_COUNT = 25;
export const SAVE_DATA_SCENE_STORAGE_KEY = "echoes:save-data:scene-id:v1";
const SESSION_PREFIX = "echoes:portable-save:v1:";

export type SaveDataSlotId = "autosave" | `slot-${string}`;
export type SaveDataBackend = "local-files" | "browser-session";

export type SaveDataSummary = {
  chapterId: string;
  chapterName: string;
  questId: string;
  questName: string;
  stageId: string;
  stageName: string;
};

export type EchoesSaveData = {
  format: typeof SAVE_DATA_FORMAT;
  schemaVersion: typeof SAVE_DATA_SCHEMA_VERSION;
  savedAt: string;
  slotKind: "auto" | "manual";
  summary: SaveDataSummary;
  progress: {
    /** Save the scene, but deliberately never save player coordinates/facing. */
    sceneId: string;
    survival: SurvivalGameState;
    inventory: PlayerInventory;
    quest: QuestSaveData;
    story: StoryProgress;
    campPower: CampPowerState;
    interactionUsage: InteractionUsageState;
    itemPointProgress: ItemPointProgress;
    collectedWorldItemIds: string[];
    /** Includes sceneId plus exact world and interaction-point coordinates. */
    droppedWorldItems: DroppedWorldItem[];
  };
};

export type SaveDataSlotSummary = {
  slotId: SaveDataSlotId;
  exists: boolean;
  savedAt?: string;
  summary?: SaveDataSummary;
  backend: SaveDataBackend;
  corrupted?: boolean;
};

export function getManualSaveSlotId(index: number): SaveDataSlotId {
  const safeIndex = Math.min(SAVE_DATA_MANUAL_SLOT_COUNT, Math.max(1, Math.floor(index)));
  return `slot-${String(safeIndex).padStart(2, "0")}`;
}

export function isSaveDataSlotId(value: unknown): value is SaveDataSlotId {
  return value === "autosave" || (
    typeof value === "string" && /^slot-(?:0[1-9]|1[0-9]|2[0-5])$/.test(value)
  );
}

export function normalizeEchoesSaveData(value: unknown): EchoesSaveData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EchoesSaveData>;
  if (
    candidate.format !== SAVE_DATA_FORMAT ||
    candidate.schemaVersion !== SAVE_DATA_SCHEMA_VERSION ||
    !candidate.progress || typeof candidate.progress !== "object" ||
    !candidate.summary || typeof candidate.summary !== "object"
  ) return null;
  const progress = candidate.progress as EchoesSaveData["progress"];
  const sceneId = typeof progress.sceneId === "string" ? progress.sceneId.trim() : "";
  const quest = progress.quest;
  if (!sceneId || !quest || quest.schemaVersion !== 1 || typeof quest.quests !== "object") return null;
  const survival = normalizeSurvivalState(progress.survival);
  return {
    format: SAVE_DATA_FORMAT,
    schemaVersion: SAVE_DATA_SCHEMA_VERSION,
    savedAt: typeof candidate.savedAt === "string" && candidate.savedAt
      ? candidate.savedAt : new Date(0).toISOString(),
    slotKind: candidate.slotKind === "auto" ? "auto" : "manual",
    summary: {
      chapterId: String(candidate.summary.chapterId ?? ""),
      chapterName: String(candidate.summary.chapterName ?? ""),
      questId: String(candidate.summary.questId ?? ""),
      questName: String(candidate.summary.questName ?? ""),
      stageId: String(candidate.summary.stageId ?? ""),
      stageName: String(candidate.summary.stageName ?? ""),
    },
    progress: {
      sceneId,
      survival,
      inventory: normalizePlayerInventory(progress.inventory),
      quest,
      story: normalizeStoryProgress(progress.story),
      campPower: normalizeCampPowerState(progress.campPower, survival.gameMinutes),
      interactionUsage: normalizeInteractionUsageState(progress.interactionUsage, survival.gameMinutes),
      itemPointProgress: normalizeItemPointProgress(progress.itemPointProgress),
      collectedWorldItemIds: Array.isArray(progress.collectedWorldItemIds)
        ? [...new Set(progress.collectedWorldItemIds.filter(
            (id): id is string => typeof id === "string" && id.trim().length > 0,
          ))] : [],
      droppedWorldItems: normalizeDroppedWorldItems(progress.droppedWorldItems),
    },
  };
}

function sessionKey(slotId: SaveDataSlotId) { return `${SESSION_PREFIX}${slotId}`; }

function readSessionSlot(slotId: SaveDataSlotId): EchoesSaveData | null {
  try {
    const raw = window.sessionStorage.getItem(sessionKey(slotId));
    return raw ? normalizeEchoesSaveData(JSON.parse(raw)) : null;
  } catch { return null; }
}

function listSessionSlots(): SaveDataSlotSummary[] {
  const slotIds: SaveDataSlotId[] = ["autosave", ...Array.from(
    { length: SAVE_DATA_MANUAL_SLOT_COUNT }, (_, index) => getManualSaveSlotId(index + 1),
  )];
  return slotIds.map((slotId) => {
    const save = readSessionSlot(slotId);
    return {
      slotId,
      exists: save !== null,
      ...(save ? { savedAt: save.savedAt, summary: save.summary } : {}),
      backend: "browser-session" as const,
    };
  });
}

async function fetchLocalSaveDataApi(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    return null;
  }
}

function isJsonResponse(response: Response) {
  return response.headers.get("content-type")?.toLowerCase().includes("application/json") === true;
}

async function createSaveDataApiError(operation: string, response: Response) {
  let detail = "";
  if (isJsonResponse(response)) {
    try {
      const body = await response.clone().json() as { error?: unknown; detail?: unknown };
      detail = String(body.detail || body.error || "");
    } catch {
      // Preserve the HTTP status when the response body itself is malformed.
    }
  }
  return new Error(`save-data-${operation}-${response.status}${detail ? `:${detail}` : ""}`);
}

export async function listSaveDataSlots(): Promise<SaveDataSlotSummary[]> {
  const response = await fetchLocalSaveDataApi("/api/save-data", { cache: "no-store" });
  if (!response || response.status === 404 || response.status === 405 || !isJsonResponse(response)) {
    return listSessionSlots();
  }
  if (!response.ok) throw await createSaveDataApiError("list", response);
  try {
    const body = await response.json() as { slots?: SaveDataSlotSummary[] };
    if (!Array.isArray(body.slots)) throw new Error("save-data-list-invalid");
    return body.slots.map((slot) => ({ ...slot, backend: "local-files" }));
  } catch (error) {
    if (error instanceof SyntaxError) return listSessionSlots();
    throw error;
  }
}

export async function readSaveDataSlot(slotId: SaveDataSlotId) {
  const response = await fetchLocalSaveDataApi(
    `/api/save-data?slot=${encodeURIComponent(slotId)}`,
    { cache: "no-store" },
  );
  if (!response || response.status === 405 || !isJsonResponse(response)) {
    return { save: readSessionSlot(slotId), backend: "browser-session" as const };
  }
  if (response.status === 404) {
    try {
      const body = await response.clone().json() as { error?: unknown };
      if (body.error === "empty-slot") return { save: null, backend: "local-files" as const };
    } catch {
      // A static host can return a non-API 404 response; use its browser session.
    }
    return { save: readSessionSlot(slotId), backend: "browser-session" as const };
  }
  if (!response.ok) throw await createSaveDataApiError("read", response);
  try {
    const body = await response.json() as { save?: unknown };
    const save = normalizeEchoesSaveData(body.save);
    if (!save) throw new Error("save-data-read-invalid");
    return { save, backend: "local-files" as const };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { save: readSessionSlot(slotId), backend: "browser-session" as const };
    }
    throw error;
  }
}

export async function writeSaveDataSlot(slotId: SaveDataSlotId, save: EchoesSaveData) {
  const normalized = normalizeEchoesSaveData(save);
  if (!normalized) throw new Error("save-data-write-invalid");
  const response = await fetchLocalSaveDataApi("/api/save-data", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotId, save: normalized }),
  });
  if (!response || response.status === 404 || response.status === 405 || !isJsonResponse(response)) {
    window.sessionStorage.setItem(sessionKey(slotId), JSON.stringify(normalized));
    return "browser-session" as const;
  }
  if (!response.ok) throw await createSaveDataApiError("write", response);
  return "local-files" as const;
}

export async function deleteSaveDataSlot(slotId: SaveDataSlotId) {
  if (slotId === "autosave") throw new Error("autosave-cannot-be-deleted");
  const response = await fetchLocalSaveDataApi(
    `/api/save-data?slot=${encodeURIComponent(slotId)}`,
    { method: "DELETE" },
  );
  if (!response || response.status === 404 || response.status === 405 || !isJsonResponse(response)) {
    window.sessionStorage.removeItem(sessionKey(slotId));
    return "browser-session" as const;
  }
  if (!response.ok) throw await createSaveDataApiError("delete", response);
  return "local-files" as const;
}

export function applySaveDataToRuntimeStorage(save: EchoesSaveData) {
  const normalized = normalizeEchoesSaveData(save);
  if (!normalized) throw new Error("save-data-apply-invalid");
  const { progress } = normalized;
  saveSurvivalState(progress.survival);
  savePlayerInventory(progress.inventory);
  saveQuestSaveData(progress.quest);
  saveStoryProgress(progress.story);
  saveCampPowerState(progress.campPower);
  saveInteractionUsageState(progress.interactionUsage);
  saveItemPointProgress(progress.itemPointProgress);
  saveCollectedWorldItemIds(new Set(progress.collectedWorldItemIds));
  saveDroppedWorldItems(progress.droppedWorldItems);
  window.localStorage.setItem(SAVE_DATA_SCENE_STORAGE_KEY, progress.sceneId);
}

