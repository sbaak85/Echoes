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
};

export type StorySubtitleChapter = {
  chapterNumber: number;
  subtitleEvents: readonly StorySubtitleEventDefinition[];
};

export const STORY_SUBTITLE_COMPLETION_PREFIX = "story-subtitle";
export const STORY_SUBTITLE_SKIP_FADE_MS = 1000;

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
  const subtitleAction: Extract<
    ChapterFlowAction,
    { type: "showBlackSubtitle" }
  > = {
    type: "showBlackSubtitle",
    lines: configuredLines.map((line) => line.text),
    fadeInMs: Math.max(0, event.fadeInMs),
    holdMs: Math.max(0, event.holdMs),
    fadeOutMs: Math.max(0, event.fadeOutMs),
    keepBlack: event.keepBlack,
  };
  if (event.lines?.length) {
    subtitleAction.fontSizesPx = configuredLines.map(
      (line) => line.fontSizePx ?? 34,
    );
  }
  actions.push(subtitleAction);
  if (event.delayAfterMs > 0) {
    actions.push({ type: "wait", durationMs: event.delayAfterMs });
  }
  if (!event.keepBlack && event.lockInput) actions.push({ type: "unlockInput" });

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
    keepBlackAfterComplete: event.keepBlack,
    actions,
    skipActions,
  };
}
