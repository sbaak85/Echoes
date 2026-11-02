// 第二章任務 6 STAGE_01：拾取迴路模組（Q0005）時 OBJ_02 立即打勾（任務資料的 collectItem 目標），
// 0.5 秒後播 chapter02-section-16（開始播放時墜落倒數停止）：line-003 鏡頭震動、line-011 黑畫面淡入並保持到播完（再停 2 秒後淡出）；
// 黑畫面淡出結束 1 秒後 OBJ_01（未完成）與 OBJ_02（已打勾）都改成失敗：核取框打叉、整項變紅再變灰，
// 之後一直保持打叉變灰（存在任務存檔中）。
// 互動多邊形 025 自己的互動對話照舊，拾取道具後才接 section-16。
import type { ChapterFlowDefinition } from "./chapter-flow-manager.ts";

export const CHAPTER02_CIRCUIT_ITEM_ID = "Q0005";
export const CHAPTER02_CIRCUIT_DIALOGUE = "chapter02-section-16";
export const CHAPTER02_CIRCUIT_QUEST_ID = "QUEST_CH02_MAIN_006";
export const CHAPTER02_CIRCUIT_STAGE_ID = "QUEST_CH02_MAIN_006_STAGE_01";
/** 拾取 Q0005 即完成（任務資料 targetId = Q0005） */
export const CHAPTER02_CIRCUIT_COLLECT_OBJECTIVE_ID = "QUEST_CH02_MAIN_006_OBJ_02";
/** 已打勾的 OBJ_02 也一起改成失敗 */
export const CHAPTER02_CIRCUIT_FAILED_OBJECTIVE_IDS = [
  "QUEST_CH02_MAIN_006_OBJ_01",
  "QUEST_CH02_MAIN_006_OBJ_02",
] as const;
/** 拾取成功到 section-16 開始播放的延遲 */
export const CHAPTER02_CIRCUIT_DIALOGUE_DELAY_MS = 500;
/** line-011 黑畫面淡出結束到 OBJ 失敗的延遲（沒有黑畫面時從 section-16 播完起算） */
export const CHAPTER02_CIRCUIT_FAIL_DELAY_MS = 1000;
/** 播到這句時鏡頭震動（CHAPTER02_CIRCUIT_SHAKE） */
export const CHAPTER02_CIRCUIT_SHAKE_LINE_ID = "chapter02-section-16-line-003";
/**
 * 播到這句時黑畫面淡入 1 秒 → 保持全黑直到 section-16 全部播完 → 再停 2 秒 → 淡出 1.5 秒
 * （流程進行中對話框疊在黑畫面上方繼續播）
 */
export const CHAPTER02_CIRCUIT_BLACKOUT_LINE_ID = "chapter02-section-16-line-011";
export const CHAPTER02_CIRCUIT_BLACKOUT_FLOW: ChapterFlowDefinition = {
  id: "chapter02-section-16-blackout",
  chapter: 2,
  actions: [
    { type: "fadeToBlack", durationMs: 1000 },
    { type: "waitForDialogueEnd" },
    { type: "wait", durationMs: 2000 },
    { type: "fadeFromBlack", durationMs: 1500 },
  ],
};

type CircuitQuestState = {
  isQuestAtStage(questId: string, stageId: string): boolean;
  hasDialogueCompleted(dialogueId: string): boolean;
};

/**
 * 拾取時或讀檔時該做什麼：section-16 已播完（例如播完後 1 秒內讀檔）直接補上失敗；
 * 身上有 Q0005 但 section-16 沒播完（中斷或讀檔）就播。
 */
export function resolveChapter02CircuitStep(
  quest: CircuitQuestState,
  hasCircuitItem: boolean,
): "none" | "playDialogue" | "failObjectives" {
  if (!quest.isQuestAtStage(CHAPTER02_CIRCUIT_QUEST_ID, CHAPTER02_CIRCUIT_STAGE_ID)) return "none";
  if (quest.hasDialogueCompleted(CHAPTER02_CIRCUIT_DIALOGUE)) return "failObjectives";
  return hasCircuitItem ? "playDialogue" : "none";
}
