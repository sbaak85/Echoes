import type { QuestRuntimeManager } from "./quest-runtime-manager.ts";
import {
  normalizePhototropicState,
  PLANT_QUEST_ID,
  PLANT_OBJECTIVE_ID,
  PLANT_PUZZLE_ID,
  type PhototropicState,
} from "./phototropic-puzzle.ts";

/** Accept only the persisted, validated success state, not a dismissed UI or clear-looking draft. */
export function completePhototropicQuestObjective(
  manager: QuestRuntimeManager | null,
  state: PhototropicState,
) {
  if (!manager || !normalizePhototropicState(state).solved ||
      !manager.isObjectiveInProgress(PLANT_QUEST_ID, PLANT_OBJECTIVE_ID)) return false;
  const before = manager.getObjectiveProgress(PLANT_QUEST_ID, PLANT_OBJECTIVE_ID).completed;
  manager.handleEvent({
    type: "puzzleCompleted", targetId: PLANT_PUZZLE_ID,
    eventId: `puzzleCompleted:${PLANT_PUZZLE_ID}`,
  });
  return !before && manager.getObjectiveProgress(PLANT_QUEST_ID, PLANT_OBJECTIVE_ID).completed;
}
