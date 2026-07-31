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
  createInitialStoryProgress,
  saveStoryProgress,
  type StoryProgress,
} from "./story-progress.ts";

export type NewGameProgress = {
  survival: SurvivalGameState;
  interactionUsage: InteractionUsageState;
  inventory: PlayerInventory;
  collectedWorldItemIds: Set<string>;
  droppedWorldItems: [];
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
  saveHotbarAssignments(progress.hotbarAssignments);
  saveStoryProgress(progress.story);
  return progress;
}
