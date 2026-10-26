import { getStarCardsMatchWinner, type StarCardsMatchResult } from "./star-cards-game.ts";
import type { QuestRuntimeManager } from "./quest-runtime-manager.ts";

export const STAR_CARDS_INTERACTION_ID = "shipinterior-interaction-017";
/**
 * OBJ_03 完成後與歐文重玩星際牌的互動：互動對話用「對話選項」詢問要不要打，
 * 選「好啊」（continue）才開打；重玩只是娛樂，不推進任務、不播勝敗劇情。
 */
export const STAR_CARDS_REPLAY_INTERACTION_ID = "shipinterior-interaction-018";
export const STAR_CARDS_QUEST_ID = "QUEST_CH02_MAIN_003";
export const STAR_CARDS_OBJECTIVE_ID = "QUEST_CH02_MAIN_003_OBJ_03";
export const STAR_CARDS_TUTORIAL_STARTED_FLAG = "tutorial:star-cards:started:v1";
/** OBJ_03 期間第一次與歐文（017）互動時播放的開場劇情（只播一次，之後改播 017 自己的對話） */
export const STAR_CARDS_INTRO_DIALOGUE_ID = "chapter02-section-7";
export const STAR_CARDS_INTRO_PLAYED_FLAG = "dialogue:star-cards-intro:played:v1";

export type StarCardsInteractionPlan = "intro-then-match" | "dialogue-then-match" | "dialogue-only";

/**
 * 017 互動要做什麼：
 * - OBJ_03 進行中、開場劇情還沒播過 → 播 section-7，播完開打
 * - OBJ_03 進行中、已播過（例如中途退出後再挑戰）→ 播 017 自己的對話，播完開打
 * - 過了這個任務階段（含已完成）→ 只播 017 自己的對話，不開打
 */
export function getStarCardsInteractionPlan(
  objectiveInProgress: boolean,
  storyFlags: Readonly<Record<string, boolean>>,
): StarCardsInteractionPlan {
  if (!objectiveInProgress) return "dialogue-only";
  return storyFlags[STAR_CARDS_INTRO_PLAYED_FLAG] === true ? "dialogue-then-match" : "intro-then-match";
}

/** 與歐文（017）的整場對決結束、回到船艙後播放的劇情對話 */
export const STAR_CARDS_VICTORY_DIALOGUE_ID = "chapter02-section-8";
export const STAR_CARDS_DEFEAT_DIALOGUE_ID = "chapter02-section-9";

/**
 * 整場結束（含驟死賽決勝）後要播放的對話；只有從 017 歐文開打的正式對決才有，
 * 除錯／預覽開局、或比賽尚未分出勝負時回傳 null。
 */
export function getStarCardsPostMatchDialogueId(
  interactionId: string | undefined,
  result: StarCardsMatchResult,
): string | null {
  if (interactionId !== STAR_CARDS_INTERACTION_ID) return null;
  const winner = getStarCardsMatchWinner(result);
  if (winner === "player") return STAR_CARDS_VICTORY_DIALOGUE_ID;
  if (winner === "ai") return STAR_CARDS_DEFEAT_DIALOGUE_ID;
  return null;
}

/** Only the first real 017 launch in this save opts into the guided match. */
export function shouldStartStarCardsTutorial(
  interactionId: string | undefined,
  storyFlags: Readonly<Record<string, boolean>>,
): boolean {
  return interactionId === STAR_CARDS_INTERACTION_ID &&
    storyFlags[STAR_CARDS_TUTORIAL_STARTED_FLAG] !== true;
}

/**
 * 與歐文（017）打完一整場（任一方先拿 3 勝，包括驟死賽決勝）就完成 OBJ_03，勝負都算；
 * 中途退出不會回報結果，所以不算完成。
 */
export function completeStarCardsQuestMatch(
  manager: QuestRuntimeManager,
  interactionId: string | undefined,
  result: StarCardsMatchResult,
): boolean {
  if (interactionId !== STAR_CARDS_INTERACTION_ID || getStarCardsMatchWinner(result) === null ||
      !manager.isObjectiveInProgress(STAR_CARDS_QUEST_ID, STAR_CARDS_OBJECTIVE_ID)) return false;
  manager.handleEvent({ type: "puzzleCompleted", targetId: STAR_CARDS_INTERACTION_ID });
  return manager.getObjectiveProgress(STAR_CARDS_QUEST_ID, STAR_CARDS_OBJECTIVE_ID).completed;
}
