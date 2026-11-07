import type { ChapterFlowAction, ChapterFlowDefinition } from "./chapter-flow-manager";
import { STORY_CHAPTERS } from "./story-content.ts";

export const CHAPTER02_START_FLOW_ID = "chapter02-start-flow";
export const CHAPTER02_START_DIALOGUE_ID = "chapter02-start";

/**
 * 晨間簡報（chapter02-start）播完後：黑畫面淡入 0.8 秒 → 全黑時開啟旗標、停 0.3 秒 → 淡出 1 秒。
 * 旗標開啟後 4 名 NPC 改站到 ship_interior 的 TeleportPoint（briefing-done-*）；
 * 簡報期間的站位就是 MapEditor 裡 NPC 本身的位置。
 */
export const CHAPTER02_BRIEFING_DONE_FLAG = "chapter02-briefing-done";
export const CHAPTER02_BRIEFING_DONE_POINTS: Readonly<Record<string, string>> = {
  "npc-captain": "briefing-done-captain",
  "npc-ian": "briefing-done-ian",
  "npc-rena": "briefing-done-rena",
  "npc-owen": "briefing-done-owen",
};
export const CHAPTER02_BRIEFING_DONE_BLACKOUT = { fadeInMs: 800, holdMs: 300, fadeOutMs: 1000 } as const;

/** 簡報結束後 NPC 應站的位置與面向；找不到對應的 TeleportPoint 就維持原位（回傳 null）。 */
export function resolveChapter02BriefingDonePlacement(
  npcId: string,
  teleportPoints: readonly { id: string; x: number; y: number; facing?: string }[],
): { x: number; y: number; facing: string } | null {
  const pointId = CHAPTER02_BRIEFING_DONE_POINTS[npcId];
  if (!pointId) return null;
  const point = teleportPoints.find((candidate) => candidate.id.toLocaleLowerCase() === pointId);
  return point ? { x: point.x, y: point.y, facing: point.facing ?? "S" } : null;
}

// Read timings and text from the editor's data; keep choreography outside its generated file.
export function createChapter02StartFlow(): ChapterFlowDefinition {
  const chapter = STORY_CHAPTERS.find((entry) => entry.chapterNumber === 2)!;
  const actions: ChapterFlowAction[] = [
    { type: "lockInput" }, { type: "setBlack", visible: true },
  ];
  for (const id of ["chapter02-Open", "chapter02-opening-card"]) {
    const event = chapter.subtitleEvents.find((entry) => entry.id === id);
    if (!event) throw new Error(`Missing opening subtitle: ${id}`);
    if (event.delayBeforeMs) actions.push({ type: "wait", durationMs: event.delayBeforeMs });
    actions.push({
      type: "showCenteredText",
      lines: event.lines.map((line) => line.text),
      fontSizesPx: event.lines.map((line) => line.fontSizePx),
      fadeInMs: event.fadeInMs, holdMs: event.holdMs, fadeOutMs: event.fadeOutMs,
      fadeOnly: true,
      ...(id === "chapter02-opening-card" ? { holdSkipConfirmAfterMs: 2000 } : {}),
    });
    if (event.delayAfterMs) actions.push({ type: "wait", durationMs: event.delayAfterMs });
  }
  const finish: ChapterFlowAction[] = [
    { type: "fadeFromBlack", durationMs: 1000 },
    { type: "lockInput" },
    { type: "wait", durationMs: 1000 },
    { type: "playDialogue", dialogueId: CHAPTER02_START_DIALOGUE_ID, requireCompleted: true },
    // 簡報播完：黑畫面中把 4 名 NPC 換到簡報後的站位
    { type: "fadeToBlack", durationMs: CHAPTER02_BRIEFING_DONE_BLACKOUT.fadeInMs },
    { type: "setStoryFlag", flagId: CHAPTER02_BRIEFING_DONE_FLAG, value: true },
    { type: "wait", durationMs: CHAPTER02_BRIEFING_DONE_BLACKOUT.holdMs },
    { type: "fadeFromBlack", durationMs: CHAPTER02_BRIEFING_DONE_BLACKOUT.fadeOutMs },
    // The shared dialogue completion listener grants the quest exactly once.
    { type: "unlockInput" },
  ];
  return { id: CHAPTER02_START_FLOW_ID, chapter: 2, once: true,
    actions: [...actions, ...finish],
    // Skipping subtitles must still finish the briefing before the first quest is granted.
    skipActions: [{ type: "setBlack", visible: true }, ...finish] };
}
