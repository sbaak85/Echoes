export const PLAYER_INFO_FLOAT_MAX_ROWS = 4;
export const PLAYER_INFO_FLOAT_TOTAL_MS = 1200;
export const PLAYER_INFO_FLOAT_PUSH_MS = 180;
export const PLAYER_INFO_FLOAT_FORCED_EXIT_MS = 180;

export type PlayerInfoFloatTone = "positive" | "neutral";

export type PlayerInfoFloatSegment = {
  text: string;
  tone: PlayerInfoFloatTone;
};

export type PlayerInfoFloatEntry = {
  id: number;
  segments: PlayerInfoFloatSegment[];
  createdAt: number;
  stackLevel: number;
  previousStackLevel: number;
  pushedAt: number;
  forcedExitAt: number | null;
};

export type PlayerInfoFloatVisual = {
  entry: PlayerInfoFloatEntry;
  opacity: number;
  scale: number;
  yOffset: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
const easeInOutCubic = (value: number) => {
  const progress = clamp01(value);
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
};

function animatedStackLevel(entry: PlayerInfoFloatEntry, now: number) {
  const progress = easeOutCubic((now - entry.pushedAt) / PLAYER_INFO_FLOAT_PUSH_MS);
  return (
    entry.previousStackLevel +
    (entry.stackLevel - entry.previousStackLevel) * progress
  );
}

export function prunePlayerInfoFloats(
  entries: PlayerInfoFloatEntry[],
  now: number,
) {
  return entries.filter((entry) => {
    if (now - entry.createdAt >= PLAYER_INFO_FLOAT_TOTAL_MS) return false;
    return (
      entry.forcedExitAt === null ||
      now - entry.forcedExitAt < PLAYER_INFO_FLOAT_FORCED_EXIT_MS
    );
  });
}

export function enqueuePlayerInfoFloat(
  entries: PlayerInfoFloatEntry[],
  segments: PlayerInfoFloatSegment[],
  id: number,
  now: number,
) {
  const current = prunePlayerInfoFloats(entries, now);
  const active = current.filter((entry) => entry.forcedExitAt === null);
  const exiting = current.filter((entry) => entry.forcedExitAt !== null);

  const shifted = active.map((entry) => {
    const previousStackLevel = animatedStackLevel(entry, now);
    const stackLevel = entry.stackLevel + 1;
    return {
      ...entry,
      previousStackLevel,
      stackLevel,
      pushedAt: now,
      forcedExitAt:
        stackLevel >= PLAYER_INFO_FLOAT_MAX_ROWS ? now : entry.forcedExitAt,
    };
  });

  return [
    ...exiting,
    ...shifted,
    {
      id,
      segments,
      createdAt: now,
      stackLevel: 0,
      previousStackLevel: 0,
      pushedAt: now,
      forcedExitAt: null,
    },
  ];
}

export function getPlayerInfoFloatVisuals(
  entries: PlayerInfoFloatEntry[],
  now: number,
  rowHeight: number,
): PlayerInfoFloatVisual[] {
  return prunePlayerInfoFloats(entries, now).map((entry) => {
    const elapsed = Math.max(0, now - entry.createdAt);
    let opacity = 1;
    let scale = 1;
    let motionY = 0;

    if (elapsed < 500) {
      const progress = easeOutCubic(elapsed / 500);
      opacity = progress;
      scale = 0.84 + progress * 0.16;
      motionY = -8 * progress;
    } else if (elapsed < 700) {
      motionY = -8;
    } else {
      const progress = easeInOutCubic((elapsed - 700) / 500);
      opacity = 1 - progress;
      scale = 1 - progress * 0.08;
      motionY = -8 - 16 * progress;
    }

    if (entry.forcedExitAt !== null) {
      const forcedProgress = easeOutCubic(
        (now - entry.forcedExitAt) / PLAYER_INFO_FLOAT_FORCED_EXIT_MS,
      );
      opacity *= 1 - forcedProgress;
      motionY -= 8 * forcedProgress;
    }

    return {
      entry,
      opacity: clamp01(opacity),
      scale,
      yOffset: motionY - animatedStackLevel(entry, now) * rowHeight,
    };
  });
}
