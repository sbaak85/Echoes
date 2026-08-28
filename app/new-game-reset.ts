import {
  INITIAL_PLAYER_INVENTORY,
  savePlayerInventory,
  type PlayerInventory,
} from "./item-database.ts";
import {
  DEFAULT_HOTBAR_ASSIGNMENTS,
  saveHotbarAssignments,
} from "./hotbar-assignments.ts";
import {
  createInitialSurvivalState,
  createInteractionUsageState,
  saveInteractionUsageState,
  saveSurvivalState,
  type InteractionUsageState,
  type SurvivalGameState,
} from "./survival-manager.ts";
import {
  saveCollectedWorldItemIds,
  saveDroppedWorldItems,
} from "./world-item-placements.ts";
import {
  createInitialItemPointProgress,
  saveItemPointProgress,
  type ItemPointProgress,
} from "./item-point-manager.ts";
import {
  createInitialStoryProgress,
  saveStoryProgress,
  type StoryProgress,
} from "./story-progress.ts";
import { saveQuestSaveData } from "./quest-runtime-manager.ts";
import {
  createInitialCampPowerState,
  saveCampPowerState,
  type CampPowerState,
} from "./camp-power-manager.ts";

export const NEW_GAME_RESET_PENDING_STORAGE_KEY =
  "echoes:new-game-reset-pending:v1";

export function markNewGameResetPending(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NEW_GAME_RESET_PENDING_STORAGE_KEY, "1");
}

export function isNewGameResetPending(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NEW_GAME_RESET_PENDING_STORAGE_KEY) === "1";
}

export function clearNewGameResetPending(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(NEW_GAME_RESET_PENDING_STORAGE_KEY);
}

export type NewGameProgress = {
  survival: SurvivalGameState;
  interactionUsage: InteractionUsageState;
  inventory: PlayerInventory;
  collectedWorldItemIds: Set<string>;
  droppedWorldItems: [];
  itemPointProgress: ItemPointProgress;
  hotbarAssignments: (string | null)[];
  story: StoryProgress;
  campPower: CampPowerState;
};

export function createNewGameProgress(): NewGameProgress {
  const survival = createInitialSurvivalState();
  return {
    survival,
    interactionUsage: createInteractionUsageState(survival.gameMinutes),
    inventory: { ...INITIAL_PLAYER_INVENTORY },
    collectedWorldItemIds: new Set<string>(),
    droppedWorldItems: [],
    itemPointProgress: createInitialItemPointProgress(),
    hotbarAssignments: [...DEFAULT_HOTBAR_ASSIGNMENTS],
    story: createInitialStoryProgress(),
    campPower: createInitialCampPowerState(survival.gameMinutes),
  };
}

export function resetStoredNewGameProgress(): NewGameProgress {
  // This marker prevents a stale portable autosave from being applied during
  // the reload that completes New Game. It is cleared only after a fresh
  // autosave has been written successfully.
  markNewGameResetPending();
  const progress = createNewGameProgress();
  saveSurvivalState(progress.survival);
  saveInteractionUsageState(progress.interactionUsage);
  savePlayerInventory(progress.inventory);
  saveCollectedWorldItemIds(progress.collectedWorldItemIds);
  saveDroppedWorldItems(progress.droppedWorldItems);
  saveItemPointProgress(progress.itemPointProgress);
  saveHotbarAssignments(progress.hotbarAssignments);
  saveStoryProgress(progress.story);
  saveCampPowerState(progress.campPower);
  saveQuestSaveData({ schemaVersion: 1, quests: {} });
  return progress;
}
