// 第二章任務 6 STAGE_01：拾取迴路模組（Q0005）時 OBJ_02 立即打勾（任務資料的 collectItem 目標），
// 0.5 秒後播 chapter02-section-16（墜落倒數不會停，之後照常倒數）：line-003 鏡頭震動、line-011 黑畫面淡入並保持到播完（再停 2 秒後淡出）。
// OBJ 失敗與之後的 section-17 寫在任務資料（QuestEditor「6. 失敗設定」）：
// OBJ_01（劇情控制）與 OBJ_02 都設「對話播完後失敗：chapter02-section-16」、延遲 4.5 秒
// （= 黑畫面停 2 秒 + 淡出 1.5 秒 + 亮回後 1 秒）；OBJ_01 失敗 3 秒後播 chapter02-section-17。
// 互動多邊形 025 自己的互動對話照舊，拾取道具後才接 section-16。
import type { ChapterFlowDefinition } from "./chapter-flow-manager.ts";

export const CHAPTER02_CIRCUIT_ITEM_ID = "Q0005";
export const CHAPTER02_CIRCUIT_DIALOGUE = "chapter02-section-16";
export const CHAPTER02_CIRCUIT_QUEST_ID = "QUEST_CH02_MAIN_006";
export const CHAPTER02_CIRCUIT_STAGE_ID = "QUEST_CH02_MAIN_006_STAGE_01";
/** 拾取 Q0005 即完成（任務資料 targetId = Q0005） */
export const CHAPTER02_CIRCUIT_COLLECT_OBJECTIVE_ID = "QUEST_CH02_MAIN_006_OBJ_02";
/** 拾取成功到 section-16 開始播放的延遲 */
export const CHAPTER02_CIRCUIT_DIALOGUE_DELAY_MS = 500;
/** 播到這句時鏡頭震動（CHAPTER02_CIRCUIT_SHAKE） */
export const CHAPTER02_CIRCUIT_SHAKE_LINE_ID = "chapter02-section-16-line-003";
/**
 * 播到這句時黑畫面淡入 1 秒 → 保持全黑直到 section-16 全部播完 → 再停 2 秒 → 淡出 1.5 秒
 * （流程進行中對話框疊在黑畫面上方繼續播）
 */
export const CHAPTER02_CIRCUIT_BLACKOUT_LINE_ID = "chapter02-section-16-line-011";
/** 播到這句（撕裂聲）時播放船體破損音效 */
export const CHAPTER02_CIRCUIT_HULL_BREACH_LINE_ID = "chapter02-section-16-line-009";
/**
 * 同時觸發；各支的延遲寫在 AudioEventManager 的 delaySeconds：
 * hull_ruptu 0 秒（音量 50、淡入 20%／淡出 10%），breac_1／2／4 於 0.1／0.8／1.1 秒（音量 30／20／20、淡入淡出各 10%）
 */
export const CHAPTER02_CIRCUIT_HULL_BREACH_AUDIO_EVENTS = [
  "chapter02HullRupture",
  "chapter02HullBreach1",
  "chapter02HullBreach2",
  "chapter02HullBreach4",
] as const;
/** section-17 播完後（第二章）BGM 換成 Cosmic Trajectory2 循環：以 BGM 特殊事件表示，讀檔／跳關依對話紀錄恢復 */
export const CHAPTER02_FOLLOW_UP_BGM_DIALOGUE = "chapter02-section-17";
export const CHAPTER02_FOLLOW_UP_BGM_EVENT_ID = "chapter02-section-17-completed";
/** section-16 各句開始時要播的音效（音量、延遲、淡入淡出寫在 AudioEventManager） */
export const CHAPTER02_CIRCUIT_LINE_AUDIO_EVENTS: Readonly<Record<string, readonly string[]>> = {
  // agonizing_metal：音量 50、淡入淡出各 10%
  "chapter02-section-16-line-005": ["chapter02MetalGroan"],
  // Slow_agonizing_metal：音量 50、淡入淡出各 10%
  "chapter02-section-16-line-008": ["chapter02MetalGroanSlow"],
  [CHAPTER02_CIRCUIT_HULL_BREACH_LINE_ID]: CHAPTER02_CIRCUIT_HULL_BREACH_AUDIO_EVENTS,
};
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

/** section-16 播完（黑畫面中）時，墜落倒數超過 02:00 就直接跳到 02:00 繼續倒數；不到 2 分鐘則不動 */
export const CHAPTER02_CIRCUIT_COUNTDOWN_CAP_MS = 2 * 60 * 1000;

export function capChapter02CountdownAfterCircuit(remainingMs: number) {
  return Math.min(remainingMs, CHAPTER02_CIRCUIT_COUNTDOWN_CAP_MS);
}

type CircuitQuestState = {
  isQuestAtStage(questId: string, stageId: string): boolean;
  hasDialogueCompleted(dialogueId: string): boolean;
};

/** 拾取時或讀檔時：仍在 STAGE_01、身上有 Q0005、section-16 還沒播完（中斷或讀檔）就播。 */
export function shouldPlayChapter02CircuitDialogue(
  quest: CircuitQuestState,
  hasCircuitItem: boolean,
): boolean {
  return hasCircuitItem &&
    quest.isQuestAtStage(CHAPTER02_CIRCUIT_QUEST_ID, CHAPTER02_CIRCUIT_STAGE_ID) &&
    !quest.hasDialogueCompleted(CHAPTER02_CIRCUIT_DIALOGUE);
}
