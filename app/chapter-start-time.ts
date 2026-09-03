export type ChapterStartTimeMode = "inherit" | "elapsed" | "clock";

export type ChapterStartTimeConfiguration = {
  triggerType?: string;
  chapterStartTimeMode?: string;
  chapterStartElapsedMinutes?: number;
  chapterStartClockMinuteOfDay?: number;
};

const MINUTES_PER_DAY = 24 * 60;
const MAX_ELAPSED_MINUTES = 720 * 60;

function clampInteger(value: unknown, minimum: number, maximum: number) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return minimum;
  return Math.max(minimum, Math.min(maximum, numeric));
}

export function getChapterStartElapsedMinutes(
  currentGameMinutes: number,
  configuration: ChapterStartTimeConfiguration,
) {
  if (configuration.triggerType !== "chapterStart") return 0;

  if (configuration.chapterStartTimeMode === "elapsed") {
    return clampInteger(
      configuration.chapterStartElapsedMinutes,
      0,
      MAX_ELAPSED_MINUTES,
    );
  }

  if (configuration.chapterStartTimeMode === "clock") {
    const currentMinuteOfDay = (
      (Math.floor(Number(currentGameMinutes) || 0) % MINUTES_PER_DAY) +
      MINUTES_PER_DAY
    ) % MINUTES_PER_DAY;
    const targetMinuteOfDay = clampInteger(
      configuration.chapterStartClockMinuteOfDay,
      0,
      MINUTES_PER_DAY - 1,
    );
    return (
      targetMinuteOfDay - currentMinuteOfDay + MINUTES_PER_DAY
    ) % MINUTES_PER_DAY;
  }

  return 0;
}
