export type StoryProgress = {
  currentChapter: number;
};

export const STORY_PROGRESS_STORAGE_KEY = "echoes:story-progress:v1";

export function createInitialStoryProgress(): StoryProgress {
  return { currentChapter: 1 };
}

export function normalizeStoryProgress(value: unknown): StoryProgress {
  const initial = createInitialStoryProgress();
  if (!value || typeof value !== "object" || Array.isArray(value)) return initial;
  const chapter = Number((value as Partial<StoryProgress>).currentChapter);
  return {
    currentChapter: Number.isFinite(chapter)
      ? Math.min(99, Math.max(1, Math.floor(chapter)))
      : initial.currentChapter,
  };
}

export function loadStoryProgress(): StoryProgress {
  if (typeof window === "undefined") return createInitialStoryProgress();
  try {
    const saved = window.localStorage.getItem(STORY_PROGRESS_STORAGE_KEY);
    return saved === null
      ? createInitialStoryProgress()
      : normalizeStoryProgress(JSON.parse(saved));
  } catch {
    return createInitialStoryProgress();
  }
}

export function saveStoryProgress(progress: StoryProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORY_PROGRESS_STORAGE_KEY,
    JSON.stringify(normalizeStoryProgress(progress)),
  );
}
