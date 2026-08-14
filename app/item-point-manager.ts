import { getInteractionCycle } from "./survival-manager.ts";

export type ItemPointSpawnPolicy = "once" | "daily" | "sceneEntry";
export type ItemPointSpawnStageMode = "CurrentStageOnly" | "UnlockFromStage";

export type ItemPointSpawnRequirement = {
  questId: string;
  stageId: string;
  stageMode: ItemPointSpawnStageMode;
};

export type ItemPointStageQuery = {
  isQuestAtStage: (questId: string, stageId: string) => boolean;
  hasQuestReachedStage: (questId: string, stageId: string) => boolean;
};

export type SceneItemPoint = {
  sceneId: string;
  id: string;
  label: string;
  x: number;
  y: number;
  itemId: string;
  quantity: number;
  spawnPolicy: ItemPointSpawnPolicy;
  showOnMinimap: boolean;
  spawnRequirement?: ItemPointSpawnRequirement;
};

export type ItemPointProgress = {
  onceCollectedIds: string[];
  dailyCollectedCycles: Record<string, number>;
};

export const ITEM_POINT_PROGRESS_STORAGE_KEY = "echoes:item-point-progress:v1";

export function createInitialItemPointProgress(): ItemPointProgress {
  return { onceCollectedIds: [], dailyCollectedCycles: {} };
}

export function normalizeSceneItemPoints(
  value: unknown,
  resolveItemId: (itemId: string) => string | null,
  sceneId = "unknown-scene",
): SceneItemPoint[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  return value.flatMap((raw): SceneItemPoint[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const candidate = raw as Partial<SceneItemPoint>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const itemId = typeof candidate.itemId === "string"
      ? resolveItemId(candidate.itemId)
      : null;
    const x = Number(candidate.x);
    const y = Number(candidate.y);
    if (!id || seenIds.has(id) || !itemId || !Number.isFinite(x) || !Number.isFinite(y)) {
      return [];
    }
    seenIds.add(id);
    const spawnRequirement = normalizeSpawnRequirement(candidate.spawnRequirement);
    return [{
      sceneId: sceneId.trim() || "unknown-scene",
      id,
      label:
        typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label.trim()
          : id,
      x,
      y,
      itemId,
      quantity: Math.min(99, Math.max(1, Math.floor(Number(candidate.quantity) || 1))),
      spawnPolicy:
        candidate.spawnPolicy === "daily" || candidate.spawnPolicy === "sceneEntry"
          ? candidate.spawnPolicy
          : "once",
      showOnMinimap: candidate.showOnMinimap === true,
      ...(spawnRequirement ? { spawnRequirement } : {}),
    }];
  });
}

export function getItemPointProgressId(itemPoint: SceneItemPoint) {
  return `${itemPoint.sceneId}:${itemPoint.id}`;
}

function normalizeSpawnRequirement(value: unknown): ItemPointSpawnRequirement | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ItemPointSpawnRequirement>;
  const questId = typeof candidate.questId === "string" ? candidate.questId.trim() : "";
  const stageId = typeof candidate.stageId === "string" ? candidate.stageId.trim() : "";
  if (!questId || !stageId) return undefined;
  return {
    questId,
    stageId,
    stageMode: candidate.stageMode === "UnlockFromStage"
      ? "UnlockFromStage"
      : "CurrentStageOnly",
  };
}

export function normalizeItemPointProgress(value: unknown): ItemPointProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createInitialItemPointProgress();
  }
  const candidate = value as Partial<ItemPointProgress>;
  const onceCollectedIds = Array.isArray(candidate.onceCollectedIds)
    ? [...new Set(candidate.onceCollectedIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      ))]
    : [];
  const dailyCollectedCycles = Object.fromEntries(
    Object.entries(candidate.dailyCollectedCycles ?? {}).flatMap(([id, cycle]) => {
      const normalized = Math.floor(Number(cycle));
      return id.trim() && Number.isFinite(normalized) ? [[id, normalized]] : [];
    }),
  );
  return { onceCollectedIds, dailyCollectedCycles };
}

export function loadItemPointProgress(): ItemPointProgress {
  if (typeof window === "undefined") return createInitialItemPointProgress();
  try {
    const stored = window.localStorage.getItem(ITEM_POINT_PROGRESS_STORAGE_KEY);
    return stored
      ? normalizeItemPointProgress(JSON.parse(stored))
      : createInitialItemPointProgress();
  } catch {
    return createInitialItemPointProgress();
  }
}

export function saveItemPointProgress(progress: ItemPointProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ITEM_POINT_PROGRESS_STORAGE_KEY,
    JSON.stringify(normalizeItemPointProgress(progress)),
  );
}

export function isItemPointAvailable(
  itemPoint: SceneItemPoint,
  progress: ItemPointProgress,
  gameMinutes: number,
  sceneEntryCollectedIds: ReadonlySet<string>,
  stageQuery?: ItemPointStageQuery | null,
) {
  const progressId = getItemPointProgressId(itemPoint);
  const requirement = itemPoint.spawnRequirement;
  if (requirement) {
    if (!stageQuery) return false;
    const stageEligible = requirement.stageMode === "UnlockFromStage"
      ? stageQuery.hasQuestReachedStage(requirement.questId, requirement.stageId)
      : stageQuery.isQuestAtStage(requirement.questId, requirement.stageId);
    if (!stageEligible) return false;
  }
  if (itemPoint.spawnPolicy === "sceneEntry") {
    return !sceneEntryCollectedIds.has(progressId);
  }
  if (itemPoint.spawnPolicy === "daily") {
    return progress.dailyCollectedCycles[progressId] !== getInteractionCycle(gameMinutes);
  }
  return !progress.onceCollectedIds.includes(progressId);
}

export function recordItemPointCollected(
  itemPoint: SceneItemPoint,
  progress: ItemPointProgress,
  gameMinutes: number,
  sceneEntryCollectedIds: Set<string>,
): ItemPointProgress {
  const progressId = getItemPointProgressId(itemPoint);
  if (itemPoint.spawnPolicy === "sceneEntry") {
    sceneEntryCollectedIds.add(progressId);
    return progress;
  }
  if (itemPoint.spawnPolicy === "daily") {
    return {
      ...progress,
      dailyCollectedCycles: {
        ...progress.dailyCollectedCycles,
        [progressId]: getInteractionCycle(gameMinutes),
      },
    };
  }
  if (progress.onceCollectedIds.includes(progressId)) return progress;
  return {
    ...progress,
    onceCollectedIds: [...progress.onceCollectedIds, progressId],
  };
}
