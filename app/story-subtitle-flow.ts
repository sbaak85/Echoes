import type {
  ChapterFlowAction,
  ChapterFlowDefinition,
} from "./chapter-flow-manager";

export type StorySubtitleTriggerType =
  | "chapterStart"
  | "afterDialogue"
  | "storyEvent"
  | "elapsedDays"
  | "manual";

export type StorySubtitleEventDefinition = {
  id: string;
  name: string;
  text: string;
  lines?: readonly {
    text: string;
    fontSizePx: number;
  }[];
  triggerType: StorySubtitleTriggerType | string;
  triggerValue: string;
  triggerCount: number;
  delayBeforeMs: number;
  fadeInMs: number;
  holdMs: number;
  fadeOutMs: number;
  delayAfterMs: number;
  keepBlack: boolean;
  lockInput: boolean;
  chapterStartTimeMode?: "inherit" | "elapsed" | "clock" | string;
  chapterStartElapsedMinutes?: number;
  chapterStartClockMinuteOfDay?: number;
};

export type StorySubtitleChapter = {
  chapterNumber: number;
  subtitleEvents: readonly StorySubtitleEventDefinition[];
};

export const STORY_SUBTITLE_COMPLETION_PREFIX = "story-subtitle";
export const STORY_SUBTITLE_SKIP_FADE_MS = 1000;
export const CHAPTER03_END_SUBTITLE_EVENT_ID = "chapter03-End";
export const CHAPTER04_ENTRY_SAVE_CHECKPOINT_ID = "chapter04-entry-save";

export function getChapterOpenScriptId(chapterNumber: number) {
  const safeChapterNumber = Math.max(0, Math.floor(chapterNumber));
  return `chapter${String(safeChapterNumber).padStart(2, "0")}-Open`;
}

export function findStorySubtitleEventById(
  chapters: readonly StorySubtitleChapter[],
  eventId: string,
) {
  for (const chapter of chapters) {
    const event = chapter.subtitleEvents.find((candidate) => candidate.id === eventId);
    if (event) return { chapterNumber: chapter.chapterNumber, event };
  }
  return null;
}

export function findStorySubtitleEvents(
  chapters: readonly StorySubtitleChapter[],
  triggerType: StorySubtitleTriggerType,
  triggerValue: string,
) {
  return chapters.flatMap((chapter) =>
    chapter.subtitleEvents
      .filter(
        (event) =>
          event.triggerType === triggerType &&
          event.triggerValue === triggerValue,
      )
      .map((event) => ({ chapterNumber: chapter.chapterNumber, event })),
  );
}

export function getStorySubtitleCompletedCount(
  completedEventIds: readonly string[],
  eventId: string,
) {
  const prefix = `${STORY_SUBTITLE_COMPLETION_PREFIX}:${eventId}:`;
  return completedEventIds.filter((completedId) => completedId.startsWith(prefix)).length;
}

export function createStorySubtitleFlow(
  chapterNumber: number,
  event: StorySubtitleEventDefinition,
  occurrence: number,
  options: { blackAlreadyVisible?: boolean } = {},
): ChapterFlowDefinition {
  const configuredLines = event.lines?.length
    ? event.lines.map((line) => ({
        text: line.text,
        fontSizePx: Math.max(8, Math.min(120, Math.round(line.fontSizePx))),
      }))
    : event.text.replace(/\r\n/g, "\n").split("\n").map((text) => ({
        text,
        fontSizePx: undefined,
      }));
  const actions: ChapterFlowAction[] = [];
  if (event.lockInput) actions.push({ type: "lockInput" });
  if (event.delayBeforeMs > 0) {
    actions.push({ type: "wait", durationMs: event.delayBeforeMs });
  }
  const handsOffBlackAfterSave = event.id === CHAPTER03_END_SUBTITLE_EVENT_ID;
  const keepBlackAfterComplete = event.keepBlack || handsOffBlackAfterSave;
  const subtitleAction: Extract<
    ChapterFlowAction,
    { type: "showBlackSubtitle" }
  > = {
    type: "showBlackSubtitle",
    lines: configuredLines.map((line) => line.text),
    fadeInMs: Math.max(0, event.fadeInMs),
    holdMs: Math.max(0, event.holdMs),
    fadeOutMs: Math.max(0, event.fadeOutMs),
    keepBlack: keepBlackAfterComplete,
    fadeOnly: true,
  };
  if (options.blackAlreadyVisible) subtitleAction.blackAlreadyVisible = true;
  if (event.lines?.length) {
    subtitleAction.fontSizesPx = configuredLines.map(
      (line) => line.fontSizePx ?? 34,
    );
  }
  if (handsOffBlackAfterSave) {
    subtitleAction.afterSubtitleFadeOutCheckpointId =
      CHAPTER04_ENTRY_SAVE_CHECKPOINT_ID;
  }
  actions.push(subtitleAction);
  if (event.delayAfterMs > 0) {
    actions.push({ type: "wait", durationMs: event.delayAfterMs });
  }
  if (!keepBlackAfterComplete && event.lockInput) {
    actions.push({ type: "unlockInput" });
  }

  const skipActions: ChapterFlowAction[] = [{ type: "setBlack", visible: true }];
  if (!event.keepBlack) {
    skipActions.push({
      type: "fadeFromBlack",
      durationMs: STORY_SUBTITLE_SKIP_FADE_MS,
    });
    if (event.lockInput) skipActions.push({ type: "unlockInput" });
  }

  return {
    id: `${STORY_SUBTITLE_COMPLETION_PREFIX}:${event.id}:${occurrence}`,
    chapter: chapterNumber,
    once: true,
    keepBlackAfterComplete,
    actions,
    skipActions,
  };
}
