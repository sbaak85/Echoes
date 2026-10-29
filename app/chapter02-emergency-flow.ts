import type { ChapterFlowAction, ChapterFlowDefinition } from "./chapter-flow-manager";
import { STORY_CHAPTERS } from "./story-content.ts";
import { createStorySubtitleFlow, findStorySubtitleEventById } from "./story-subtitle-flow.ts";
import { RED_ALERT_STORY_FLAG } from "./red-alert-lighting.ts";
import { CHAPTER02_SHAKE_FLAG, CHAPTER02_SHAKE_STRONG_FLAG } from "./camera-shake.ts";

export const CHAPTER02_EMERGENCY_FLOW_ID = "chapter02-emergency-flow";
export const CHAPTER02_EMERGENCY_SUBTITLE_ID = "chapter02-Emergency";
export const CHAPTER02_EMERGENCY_DIALOGUE_ID = "chapter02-section-11";
/** BGM_CONTROL_RULES 的 event ID：黑畫面淡入的同時 main_BGM 淡出 */
export const CHAPTER02_EMERGENCY_BGM_EVENT_ID = "chapter02-emergency";
/** 警報聲：字幕出現後第幾毫秒播放（暫時硬寫） */
export const CHAPTER02_EMERGENCY_ALARM_EVENT = "chapter02EmergencyAlarm";
export const CHAPTER02_EMERGENCY_ALARM_DELAY_MS = 5000;

// QUEST_CH02_MAIN_004_OBJ_02（進入臥鋪睡一覺）核取後的演出。黑幕與字幕的時間全部讀
// chapter02-Emergency 的編輯器設定（含「字幕延遲」「字幕持續」）；這裡只額外加上：
// 黑畫面開始淡入的同時 main_BGM 淡出，以及字幕流程結束（含結束後等待）才播 chapter02-section-11。
export function createChapter02EmergencyFlow(): ChapterFlowDefinition {
  const found = findStorySubtitleEventById(STORY_CHAPTERS, CHAPTER02_EMERGENCY_SUBTITLE_ID);
  if (!found) throw new Error(`Missing subtitle event: ${CHAPTER02_EMERGENCY_SUBTITLE_ID}`);
  const base = createStorySubtitleFlow(found.chapterNumber, found.event, 1);
  const bgmFadeOut: ChapterFlowAction = { type: "bgmEvent", eventId: CHAPTER02_EMERGENCY_BGM_EVENT_ID };
  const playDialogue: ChapterFlowAction = { type: "playDialogue", dialogueId: CHAPTER02_EMERGENCY_DIALOGUE_ID };
  // 全黑時開啟船艙紅色警戒光照（在黑畫面後方烘焙，亮回來時已是紅色警戒），第二章期間維持
  const redAlertOn: ChapterFlowAction = { type: "setStoryFlag", flagId: RED_ALERT_STORY_FLAG, value: true };
  const insertBefore = (actions: ChapterFlowAction[], match: (action: ChapterFlowAction) => boolean, inserted: ChapterFlowAction, fromEnd = false) => {
    const index = fromEnd ? actions.findLastIndex(match) : actions.findIndex(match);
    return index < 0 ? [...actions, inserted] : [...actions.slice(0, index), inserted, ...actions.slice(index)];
  };
  const blackStarts = (action: ChapterFlowAction) =>
    action.type === "fadeToBlack" || action.type === "showBlackSubtitle" || action.type === "setBlack";
  const isUnlock = (action: ChapterFlowAction) => action.type === "unlockInput";
  // 鎖定輸入一路維持到警報對話開始
  const withBgm = insertBefore(base.actions, blackStarts, bgmFadeOut);
  const blackIndex = withBgm.findIndex(blackStarts);
  const withRedAlert = [...withBgm.slice(0, blackIndex + 1), redAlertOn, ...withBgm.slice(blackIndex + 1)];
  // 警報聲：字幕開始顯示後第 5 秒（不阻擋流程）
  const isSubtitle = (action: ChapterFlowAction) => action.type === "showCenteredText" || action.type === "showBlackSubtitle";
  const alarm: ChapterFlowAction = { type: "audioEvent", eventName: CHAPTER02_EMERGENCY_ALARM_EVENT, delayMs: CHAPTER02_EMERGENCY_ALARM_DELAY_MS };
  const withAlarm = insertBefore(withRedAlert, isSubtitle, alarm);
  // 鏡頭震動：黑畫面亮回後開始；section-11 播完後改成較強的震動
  const shakeOn: ChapterFlowAction = { type: "setStoryFlag", flagId: CHAPTER02_SHAKE_FLAG, value: true };
  const shakeStrong: ChapterFlowAction = { type: "setStoryFlag", flagId: CHAPTER02_SHAKE_STRONG_FLAG, value: true };
  const lightsBack = withAlarm.findLastIndex((action) => action.type === "fadeFromBlack" || action.type === "showBlackSubtitle");
  const withShake = [...withAlarm.slice(0, lightsBack + 1), shakeOn, ...withAlarm.slice(lightsBack + 1)];
  const unlockIndex = withShake.findLastIndex(isUnlock);
  const actions = unlockIndex < 0
    ? [...withShake, playDialogue, shakeStrong]
    : [...withShake.slice(0, unlockIndex), playDialogue, shakeStrong, ...withShake.slice(unlockIndex)];
  // 跳過字幕時：BGM 一樣保持淡出，畫面亮回後仍接上警報對話
  const skipBase = [bgmFadeOut, redAlertOn, ...(base.skipActions ?? []), shakeOn];
  const skipUnlock = skipBase.findLastIndex(isUnlock);
  const skipActions = skipUnlock < 0
    ? [...skipBase, playDialogue, shakeStrong]
    : [...skipBase.slice(0, skipUnlock), playDialogue, shakeStrong, ...skipBase.slice(skipUnlock)];
  return { ...base, id: CHAPTER02_EMERGENCY_FLOW_ID, actions, skipActions };
}
