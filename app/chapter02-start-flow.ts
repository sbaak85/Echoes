import type { ChapterFlowAction, ChapterFlowDefinition } from "./chapter-flow-manager";
import { STORY_CHAPTERS } from "./story-content.ts";

export const CHAPTER02_START_FLOW_ID = "chapter02-start-flow";
export const CHAPTER02_START_DIALOGUE_ID = "chapter02-start";

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
    // The shared dialogue completion listener grants the quest exactly once.
    { type: "unlockInput" },
  ];
  return { id: CHAPTER02_START_FLOW_ID, chapter: 2, once: true,
    actions: [...actions, ...finish],
    // Skipping subtitles must still finish the briefing before the first quest is granted.
    skipActions: [{ type: "setBlack", visible: true }, ...finish] };
}
