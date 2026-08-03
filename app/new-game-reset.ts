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

export type NewGameProgress = {
  survival: SurvivalGameState;
  interactionUsage: InteractionUsageState;
  inventory: PlayerInventory;
  collectedWorldItemIds: Set<string>;
  droppedWorldItems: [];
  itemPointProgress: ItemPointProgress;
  hotbarAssignments: (string | null)[];
  story: StoryProgress;
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
  };
}

export function resetStoredNewGameProgress(): NewGameProgress {
  const progress = createNewGameProgress();
  saveSurvivalState(progress.survival);
  saveInteractionUsageState(progress.interactionUsage);
  savePlayerInventory(progress.inventory);
  saveCollectedWorldItemIds(progress.collectedWorldItemIds);
  saveDroppedWorldItems(progress.droppedWorldItems);
  saveItemPointProgress(progress.itemPointProgress);
  saveHotbarAssignments(progress.hotbarAssignments);
  saveStoryProgress(progress.story);
  saveQuestSaveData({ schemaVersion: 1, quests: {} });
  return progress;
}
