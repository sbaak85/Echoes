import { getStarCardsMatchWinner, type StarCardsMatchResult } from "./star-cards-game.ts";
import type { QuestRuntimeManager } from "./quest-runtime-manager.ts";

export const STAR_CARDS_INTERACTION_ID = "shipinterior-interaction-017";
export const STAR_CARDS_QUEST_ID = "QUEST_CH02_MAIN_003";
export const STAR_CARDS_OBJECTIVE_ID = "QUEST_CH02_MAIN_003_OBJ_03";
export const STAR_CARDS_TUTORIAL_STARTED_FLAG = "tutorial:star-cards:started:v1";

/** Only the first real 017 launch in this save opts into the guided match. */
export function shouldStartStarCardsTutorial(
  interactionId: string | undefined,
  storyFlags: Readonly<Record<string, boolean>>,
): boolean {
  return interactionId === STAR_CARDS_INTERACTION_ID &&
    storyFlags[STAR_CARDS_TUTORIAL_STARTED_FLAG] !== true;
}

export function completeStarCardsQuestMatch(
  manager: QuestRuntimeManager,
  interactionId: string | undefined,
  result: StarCardsMatchResult,
): boolean {
  if (interactionId !== STAR_CARDS_INTERACTION_ID || getStarCardsMatchWinner(result) !== "player" ||
      !manager.isObjectiveInProgress(STAR_CARDS_QUEST_ID, STAR_CARDS_OBJECTIVE_ID)) return false;
  manager.handleEvent({ type: "puzzleCompleted", targetId: STAR_CARDS_INTERACTION_ID });
  return manager.getObjectiveProgress(STAR_CARDS_QUEST_ID, STAR_CARDS_OBJECTIVE_ID).completed;
}
