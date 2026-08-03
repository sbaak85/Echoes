export type StoryProgress = {
  currentChapter: number;
  completedEventIds: string[];
  storyFlags: Record<string, boolean>;
};

// v2 introduces chapter-flow completion flags and starts map_test01 at Chapter 3.
// A new key prevents the earlier placeholder Chapter 1 save from suppressing
// the first Chapter 3 opening sequence after this upgrade.
export const STORY_PROGRESS_STORAGE_KEY = "echoes:story-progress:v2";

export function createInitialStoryProgress(): StoryProgress {
  return { currentChapter: 3, completedEventIds: [], storyFlags: {} };
}

export function normalizeStoryProgress(value: unknown): StoryProgress {
  const initial = createInitialStoryProgress();
  if (!value || typeof value !== "object" || Array.isArray(value)) return initial;
  const chapter = Number((value as Partial<StoryProgress>).currentChapter);
  const completedEventIds = Array.isArray(
    (value as Partial<StoryProgress>).completedEventIds,
  )
    ? [...new Set(
        (value as Partial<StoryProgress>).completedEventIds!.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        ),
      )]
    : [];
  const rawFlags = (value as Partial<StoryProgress>).storyFlags;
  const storyFlags = rawFlags && typeof rawFlags === "object" && !Array.isArray(rawFlags)
    ? Object.fromEntries(
        Object.entries(rawFlags).filter((entry): entry is [string, boolean] =>
          typeof entry[1] === "boolean"),
      )
    : {};
  return {
    currentChapter: Number.isFinite(chapter)
      ? Math.min(99, Math.max(1, Math.floor(chapter)))
      : initial.currentChapter,
    completedEventIds,
    storyFlags,
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
