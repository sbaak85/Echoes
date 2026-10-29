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
  /** 黑畫面完全淡入後延遲多久才顯示字幕（只在 subtitleDurationMs > 0 時使用）。 */
  subtitleDelayMs?: number;
  /** 字幕顯示多久（含字幕自身淡入淡出），與黑畫面停留分開；0／未設定 = 字幕跟著黑畫面一起淡入淡出。 */
  subtitleDurationMs?: number;
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
/** 「先全黑」模式下，字幕自身淡入與淡出各多久（最多佔字幕持續時間的一半）。 */
export const STORY_SUBTITLE_TEXT_FADE_MS = 1000;
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
  const subtitleDurationMs = Math.max(0, event.subtitleDurationMs ?? 0);
  if (subtitleDurationMs > 0 && !handsOffBlackAfterSave) {
    // 先全黑：黑幕淡入 → 字幕延遲 → 字幕（自身淡入、顯示、淡出）→ 黑幕停留到期（從全黑起算，
    // 且不早於字幕結束）→ 黑幕淡出。
    const subtitleDelayMs = Math.max(0, event.subtitleDelayMs ?? 0);
    const textFadeMs = Math.min(STORY_SUBTITLE_TEXT_FADE_MS, Math.floor(subtitleDurationMs / 2));
    if (options.blackAlreadyVisible) actions.push({ type: "setBlack", visible: true });
    else actions.push({ type: "fadeToBlack", durationMs: Math.max(0, event.fadeInMs) });
    if (subtitleDelayMs > 0) actions.push({ type: "wait", durationMs: subtitleDelayMs });
    actions.push({
      type: "showCenteredText",
      lines: configuredLines.map((line) => line.text),
      ...(event.lines?.length ? { fontSizesPx: configuredLines.map((line) => line.fontSizePx ?? 34) } : {}),
      fadeInMs: textFadeMs,
      holdMs: subtitleDurationMs - textFadeMs * 2,
      fadeOutMs: textFadeMs,
      fadeOnly: true,
    });
    const remainingHoldMs = Math.max(0, event.holdMs) - subtitleDelayMs - subtitleDurationMs;
    if (remainingHoldMs > 0) actions.push({ type: "wait", durationMs: remainingHoldMs });
    if (!keepBlackAfterComplete) {
      actions.push({ type: "fadeFromBlack", durationMs: Math.max(0, event.fadeOutMs) });
    }
  } else {
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
  }
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
