import type { CraftingResult } from "./crafting-recipes.ts";
import type { QuestRuntimeManager } from "./quest-runtime-manager.ts";
import {
  STARSHIP_CRAFTING_TUTORIAL_QUEST,
  STARSHIP_CRAFTING_TUTORIAL_OBJECTIVE,
  STARSHIP_CRAFTING_TUTORIAL_RECIPE,
} from "./starship-crafting-tutorial.ts";

export const STARSHIP_CRAFTING_TUTORIAL_INTERACTION = "scene3-interaction-029";
export const STARSHIP_CRAFTING_QUANTITY_OBJECTIVE = "QUEST_CH04_MAIN_001_OBJ_18";
export const STARSHIP_CRAFTING_TUTORIAL_PROGRESS_TARGET = "chapter04-crafting-tutorial-completed";
export const STARSHIP_CRAFTING_QUANTITY_PROGRESS_TARGET = "chapter04-glow-stick-crafted";

/** Called only by the full tutorial's acknowledgement, or a restored v2 completion. */
export function completeStarshipCraftingTutorialObjective(
  manager: QuestRuntimeManager | null,
  interactionId: string | null,
  tutorialCompleted: boolean,
) {
  if (!manager || !tutorialCompleted || interactionId !== STARSHIP_CRAFTING_TUTORIAL_INTERACTION ||
      !manager.isObjectiveInProgress(STARSHIP_CRAFTING_TUTORIAL_QUEST, STARSHIP_CRAFTING_TUTORIAL_OBJECTIVE)) return false;
  const before = manager.getObjectiveProgress(STARSHIP_CRAFTING_TUTORIAL_QUEST, STARSHIP_CRAFTING_TUTORIAL_OBJECTIVE).currentAmount;
  manager.handleEvent({
    type: "customQuestProgressAdded", targetId: STARSHIP_CRAFTING_TUTORIAL_PROGRESS_TARGET, amount: 1,
    eventId: `tutorial-completed:${STARSHIP_CRAFTING_TUTORIAL_PROGRESS_TARGET}`,
  });
  return manager.getObjectiveProgress(STARSHIP_CRAFTING_TUTORIAL_QUEST, STARSHIP_CRAFTING_TUTORIAL_OBJECTIVE).currentAmount > before;
}

/** Transaction IDs must be unique across reloads, not just menu/session counters. */
export function publishSuccessfulCraftQuestProgress(
  manager: QuestRuntimeManager | null,
  result: CraftingResult,
  transactionId: string,
) {
  if (!manager || !result.ok || !Number.isSafeInteger(result.quantity) || result.quantity < 1 || !transactionId.trim()) return false;
  const countsGlowStick = result.itemId === STARSHIP_CRAFTING_TUTORIAL_RECIPE &&
    manager.isObjectiveInProgress(STARSHIP_CRAFTING_TUTORIAL_QUEST, STARSHIP_CRAFTING_QUANTITY_OBJECTIVE);
  // Preserve generic acquisition objectives without letting pickup/inventory events
  // satisfy the separate craft-only counter. Distinct IDs keep deduplication independent.
  manager.handleEvent({
    type: "itemCollected", targetId: result.itemId, amount: result.quantity,
    eventId: `${transactionId}:acquisition`,
  });
  if (countsGlowStick) manager.handleEvent({
    type: "customQuestProgressAdded", targetId: STARSHIP_CRAFTING_QUANTITY_PROGRESS_TARGET, amount: result.quantity,
    eventId: `${transactionId}:glow-stick-progress`,
  });
  return true;
}
