// 序章：章節選單選「序章」後播放的純劇情畫面（不載入地圖）。
//   1. 黑畫面白字幕：序章資料中 triggerType = chapterStart 的字幕依序播放（prologue-Open、prologue-opening-card）
//   2. 對話框＋插圖：序章的對話段落依序播放；每張插圖對應 1～2 段對話（PROLOGUE_ILLUSTRATIONS）
//   3. 「序章結束」字幕（prologue-End，規格同 chapter02-End，黑畫面保持）→ 進入第二章
// 文案在 ChapterScriptEditor 的【序章】分頁編輯；插圖換圖時直接覆蓋同名 PNG。
import type { InteractionDialogueScript } from "./interaction-flow";
import type { StorySubtitleEventDefinition } from "./story-subtitle-flow";

export const PROLOGUE_CHAPTER_ID = "prologue";
export const PROLOGUE_END_SUBTITLE_EVENT_ID = "prologue-End";
/** 序章結束後進入的章節 */
export const PROLOGUE_NEXT_CHAPTER = 2;
/** 插圖淡入／淡出（毫秒）：淡入沿用互動插圖的 500ms 進場 */
export const PROLOGUE_ILLUSTRATION_FADE_IN_MS = 500;
export const PROLOGUE_ILLUSTRATION_FADE_OUT_MS = 500;
/** 換插圖之間、以及最後一張插圖淡出到「序章結束」字幕之間的全黑停頓 */
export const PROLOGUE_SCENE_GAP_MS = 400;

/** 插圖與對話段落的對應（public 底下的路徑）。段落沒列在這裡時沿用前一張插圖 */
export const PROLOGUE_ILLUSTRATIONS: readonly { imagePath: string; sectionIds: readonly string[] }[] = [
  { imagePath: "ui/interaction-illustrations/序章_地球赤道極光_v1.png", sectionIds: ["prologue-section-1", "prologue-section-2"] },
  { imagePath: "ui/interaction-illustrations/序章_高維航道_3D插圖_v1.png", sectionIds: ["prologue-section-3", "prologue-section-4"] },
  { imagePath: "ui/interaction-illustrations/序章_伊薩卡號_整備啟航_v1.png", sectionIds: ["prologue-section-5", "prologue-section-6"] },
  { imagePath: "ui/interaction-illustrations/序章_曲速航程_重新設計_v2.png", sectionIds: ["prologue-section-7", "prologue-section-8"] },
  { imagePath: "ui/interaction-illustrations/序章_殖民地_重新設計_v2.png", sectionIds: ["prologue-section-9"] },
  // 伊薩卡號面向鏡頭駛離地球軌道，身後是地球與軌道設施
  { imagePath: "ui/interaction-illustrations/序章_伊薩卡號_駛離地球軌道_v1.png", sectionIds: ["prologue-section-10"] },
];

type PrologueChapterData = {
  id: string;
  subtitleEvents: readonly StorySubtitleEventDefinition[];
  dialogueSections: readonly { id: string; dialogue: InteractionDialogueScript }[];
};

export type PrologueStep =
  | { kind: "subtitle"; event: StorySubtitleEventDefinition }
  | { kind: "scene"; imagePath: string; dialogues: readonly { id: string; dialogue: InteractionDialogueScript }[] };

export type PrologueSequence = { steps: PrologueStep[]; end: StorySubtitleEventDefinition | null };

/** 依劇情資料排出序章的播放順序：開場字幕 → 每張插圖與其對話段落；結束字幕另外回傳 */
export function resolvePrologueSequence(chapters: readonly PrologueChapterData[]): PrologueSequence {
  const chapter = chapters.find((item) => item.id === PROLOGUE_CHAPTER_ID);
  if (!chapter) return { steps: [], end: null };
  const steps: PrologueStep[] = chapter.subtitleEvents
    .filter((event) => event.triggerType === "chapterStart")
    .map((event) => ({ kind: "subtitle" as const, event }));
  let current: Extract<PrologueStep, { kind: "scene" }> | null = null;
  for (const section of chapter.dialogueSections) {
    const mapped = PROLOGUE_ILLUSTRATIONS.find((item) => item.sectionIds.includes(section.id))?.imagePath;
    const imagePath: string = mapped ?? current?.imagePath ?? PROLOGUE_ILLUSTRATIONS[0]?.imagePath ?? "";
    if (!current || current.imagePath !== imagePath) {
      current = { kind: "scene", imagePath, dialogues: [] };
      steps.push(current);
    }
    (current.dialogues as { id: string; dialogue: InteractionDialogueScript }[]).push(section);
  }
  const end = chapter.subtitleEvents.find((event) => event.id === PROLOGUE_END_SUBTITLE_EVENT_ID) ?? null;
  return { steps, end };
}

/** 黑畫面字幕的時間軸（毫秒）：與遊戲內 showBlackSubtitle 相同，字幕淡入 → 停留 → 淡出，黑畫面不動 */
export function getPrologueSubtitleTiming(event: StorySubtitleEventDefinition) {
  const fadeInMs = Math.max(0, event.fadeInMs);
  const holdMs = Math.max(0, event.holdMs);
  const fadeOutMs = Math.max(0, event.fadeOutMs);
  return {
    delayBeforeMs: Math.max(0, event.delayBeforeMs),
    fadeInMs,
    holdMs,
    fadeOutMs,
    delayAfterMs: Math.max(0, event.delayAfterMs),
    lines: event.lines?.length
      ? event.lines.map((line) => ({ text: line.text, fontSizePx: line.fontSizePx }))
      : event.text.replace(/\r\n/g, "\n").split("\n").map((text) => ({ text, fontSizePx: undefined as number | undefined })),
  };
}
