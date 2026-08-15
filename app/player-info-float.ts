export const PLAYER_INFO_FLOAT_MAX_ROWS = 4;
export const PLAYER_INFO_FLOAT_TOTAL_MS = 1200;
export const PLAYER_INFO_FLOAT_PUSH_MS = 180;
export const PLAYER_INFO_FLOAT_FORCED_EXIT_MS = 180;

export type PlayerInfoFloatTone =
  | "positive"
  | "neutral"
  | "stamina"
  | "hunger"
  | "thirst"
  | "spirit";

export const PLAYER_INFO_FLOAT_TONE_COLORS: Record<
  PlayerInfoFloatTone,
  string
> = {
  positive: "#76f09a",
  neutral: "#f4fbff",
  stamina: "#63df88",
  hunger: "#f0a953",
  thirst: "#59c9ed",
  spirit: "#b478e6",
};

export function getPlayerInfoFloatToneColor(tone: PlayerInfoFloatTone) {
  return PLAYER_INFO_FLOAT_TONE_COLORS[tone];
}

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

export type PlayerInfoFloatMotionConfig = {
  enterMs: number;
  holdMs: number;
  exitMs: number;
  enterDistance: number;
  exitDistance: number;
};

export const DEFAULT_PLAYER_INFO_FLOAT_MOTION: PlayerInfoFloatMotionConfig = {
  enterMs: 500,
  holdMs: 200,
  exitMs: 500,
  enterDistance: 8,
  exitDistance: 16,
};

export function getPlayerInfoFloatTotalMs(
  motion: PlayerInfoFloatMotionConfig = DEFAULT_PLAYER_INFO_FLOAT_MOTION,
) {
  return motion.enterMs + motion.holdMs + motion.exitMs;
}

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
  totalMs = PLAYER_INFO_FLOAT_TOTAL_MS,
) {
  return entries.filter((entry) => {
    if (now - entry.createdAt >= totalMs) return false;
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
  motion: PlayerInfoFloatMotionConfig = DEFAULT_PLAYER_INFO_FLOAT_MOTION,
): PlayerInfoFloatVisual[] {
  const totalMs = getPlayerInfoFloatTotalMs(motion);
  const holdUntil = motion.enterMs + motion.holdMs;
  return prunePlayerInfoFloats(entries, now, totalMs).map((entry) => {
    const elapsed = Math.max(0, now - entry.createdAt);
    let opacity = 1;
    let scale = 1;
    let motionY = 0;

    if (elapsed < motion.enterMs) {
      const progress = easeOutCubic(elapsed / motion.enterMs);
      opacity = progress;
      scale = 0.84 + progress * 0.16;
      motionY = -motion.enterDistance * progress;
    } else if (elapsed < holdUntil) {
      motionY = -motion.enterDistance;
    } else {
      const progress = easeInOutCubic(
        (elapsed - holdUntil) / motion.exitMs,
      );
      opacity = 1 - progress;
      scale = 1 - progress * 0.08;
      motionY =
        -motion.enterDistance - motion.exitDistance * progress;
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
