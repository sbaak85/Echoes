import type { StoryProgress } from "./story-progress";

export const CHAPTER04_NUMBER = 4;
export const CHAPTER04_ID = "chapter04";
export const CHAPTER04_NAME = "第四章";
export const CHAPTER04_ENTERED_FLAG_ID = "chapter04-entered";

export function createChapter04EntryStoryProgress(
  current: StoryProgress,
  chapter03EndFlowId: string,
): StoryProgress {
  const completedEventIds = chapter03EndFlowId &&
    !current.completedEventIds.includes(chapter03EndFlowId)
    ? [...current.completedEventIds, chapter03EndFlowId]
    : [...current.completedEventIds];
  return {
    currentChapter: CHAPTER04_NUMBER,
    completedEventIds,
    storyFlags: {
      ...current.storyFlags,
      [CHAPTER04_ENTERED_FLAG_ID]: true,
    },
  };
}
