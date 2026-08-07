import {
  GAME_START_TIME_MINUTES,
  type SurvivalGameState,
} from "./survival-manager.ts";

type Rgb = readonly [red: number, green: number, blue: number];

type DayNightKeyframe = {
  minute: number;
  top: Rgb;
  topAlpha: number;
  middle: Rgb;
  middleAlpha: number;
  bottom: Rgb;
  bottomAlpha: number;
  glow: Rgb;
  glowAlpha: number;
  vignetteAlpha: number;
};

export type DayNightVisual = {
  minuteOfDay: number;
  top: string;
  middle: string;
  bottom: string;
  glow: string;
  glowXPercent: number;
  glowYPercent: number;
  vignetteAlpha: number;
};

export type DebugTimeCommand = {
  hour: number;
  minute: number;
  minuteOfDay: number;
  label: string;
};

const MINUTES_PER_DAY = 24 * 60;
export const DAY_NIGHT_EFFECT_STORAGE_KEY = "echoes:day-night-effect-enabled:v1";

type DayNightPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

const MIDNIGHT: Omit<DayNightKeyframe, "minute"> = {
  top: [3, 8, 31],
  topAlpha: 0.62,
  middle: [7, 24, 52],
  middleAlpha: 0.46,
  bottom: [8, 31, 48],
  bottomAlpha: 0.34,
  glow: [85, 132, 178],
  glowAlpha: 0.02,
  vignetteAlpha: 0.34,
};

const DAY_NIGHT_KEYFRAMES: readonly DayNightKeyframe[] = [
  { minute: 0, ...MIDNIGHT },
  {
    minute: 5 * 60,
    top: [6, 18, 44],
    topAlpha: 0.56,
    middle: [12, 40, 63],
    middleAlpha: 0.42,
    bottom: [18, 48, 65],
    bottomAlpha: 0.3,
    glow: [111, 160, 183],
    glowAlpha: 0.04,
    vignetteAlpha: 0.28,
  },
  {
    minute: 6 * 60 + 30,
    top: [26, 48, 75],
    topAlpha: 0.28,
    middle: [205, 109, 70],
    middleAlpha: 0.18,
    bottom: [248, 180, 103],
    bottomAlpha: 0.15,
    glow: [255, 166, 96],
    glowAlpha: 0.22,
    vignetteAlpha: 0.12,
  },
  {
    minute: 8 * 60,
    top: [59, 116, 151],
    topAlpha: 0.045,
    middle: [119, 176, 182],
    middleAlpha: 0.025,
    bottom: [255, 219, 159],
    bottomAlpha: 0.03,
    glow: [255, 226, 176],
    glowAlpha: 0.06,
    vignetteAlpha: 0.04,
  },
  {
    minute: 12 * 60,
    top: [73, 133, 160],
    topAlpha: 0.015,
    middle: [129, 179, 184],
    middleAlpha: 0.01,
    bottom: [255, 232, 190],
    bottomAlpha: 0.012,
    glow: [255, 236, 202],
    glowAlpha: 0.03,
    vignetteAlpha: 0.025,
  },
  {
    minute: 16 * 60,
    top: [69, 119, 146],
    topAlpha: 0.04,
    middle: [191, 148, 105],
    middleAlpha: 0.06,
    bottom: [255, 205, 139],
    bottomAlpha: 0.055,
    glow: [255, 210, 150],
    glowAlpha: 0.08,
    vignetteAlpha: 0.05,
  },
  {
    minute: 18 * 60,
    top: [53, 66, 91],
    topAlpha: 0.16,
    middle: [223, 108, 59],
    middleAlpha: 0.18,
    bottom: [255, 151, 73],
    bottomAlpha: 0.14,
    glow: [255, 142, 74],
    glowAlpha: 0.24,
    vignetteAlpha: 0.12,
  },
  {
    minute: 19 * 60 + 30,
    top: [15, 28, 56],
    topAlpha: 0.42,
    middle: [41, 56, 84],
    middleAlpha: 0.32,
    bottom: [104, 56, 73],
    bottomAlpha: 0.2,
    glow: [255, 120, 64],
    glowAlpha: 0.12,
    vignetteAlpha: 0.22,
  },
  {
    minute: 21 * 60,
    top: [4, 11, 35],
    topAlpha: 0.58,
    middle: [8, 29, 56],
    middleAlpha: 0.44,
    bottom: [11, 37, 55],
    bottomAlpha: 0.32,
    glow: [81, 129, 174],
    glowAlpha: 0.025,
    vignetteAlpha: 0.32,
  },
  { minute: MINUTES_PER_DAY, ...MIDNIGHT },
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const smoothStep = (value: number) => {
  const normalized = clamp01(value);
  return normalized * normalized * (3 - 2 * normalized);
};

const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const mixRgb = (from: Rgb, to: Rgb, progress: number): Rgb => [
  Math.round(mix(from[0], to[0], progress)),
  Math.round(mix(from[1], to[1], progress)),
  Math.round(mix(from[2], to[2], progress)),
];

const toRgba = (rgb: Rgb, alpha: number) =>
  `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.round(alpha * 1000) / 1000})`;

const normalizeMinuteOfDay = (gameMinutes: number) =>
  ((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

export function getDayNightVisual(gameMinutes: number): DayNightVisual {
  const minuteOfDay = normalizeMinuteOfDay(
    Number.isFinite(gameMinutes) ? gameMinutes : GAME_START_TIME_MINUTES,
  );
  let start = DAY_NIGHT_KEYFRAMES[0];
  let end = DAY_NIGHT_KEYFRAMES[DAY_NIGHT_KEYFRAMES.length - 1];

  for (let index = 0; index < DAY_NIGHT_KEYFRAMES.length - 1; index += 1) {
    const candidate = DAY_NIGHT_KEYFRAMES[index];
    const next = DAY_NIGHT_KEYFRAMES[index + 1];
    if (minuteOfDay >= candidate.minute && minuteOfDay <= next.minute) {
      start = candidate;
      end = next;
      break;
    }
  }

  const duration = Math.max(1, end.minute - start.minute);
  const progress = smoothStep((minuteOfDay - start.minute) / duration);
  const daylightProgress = clamp01((minuteOfDay - 6 * 60) / (12 * 60));

  return {
    minuteOfDay,
    top: toRgba(
      mixRgb(start.top, end.top, progress),
      mix(start.topAlpha, end.topAlpha, progress),
    ),
    middle: toRgba(
      mixRgb(start.middle, end.middle, progress),
      mix(start.middleAlpha, end.middleAlpha, progress),
    ),
    bottom: toRgba(
      mixRgb(start.bottom, end.bottom, progress),
      mix(start.bottomAlpha, end.bottomAlpha, progress),
    ),
    glow: toRgba(
      mixRgb(start.glow, end.glow, progress),
      mix(start.glowAlpha, end.glowAlpha, progress),
    ),
    glowXPercent: mix(18, 82, daylightProgress),
    glowYPercent: 24 + Math.sin(daylightProgress * Math.PI) * 10,
    vignetteAlpha: mix(
      start.vignetteAlpha,
      end.vignetteAlpha,
      progress,
    ),
  };
}

export function getDayNightCssVariables(gameMinutes: number) {
  const visual = getDayNightVisual(gameMinutes);
  return {
    "--day-night-top": visual.top,
    "--day-night-middle": visual.middle,
    "--day-night-bottom": visual.bottom,
    "--day-night-glow": visual.glow,
    "--day-night-glow-x": `${visual.glowXPercent.toFixed(2)}%`,
    "--day-night-glow-y": `${visual.glowYPercent.toFixed(2)}%`,
    "--day-night-vignette": visual.vignetteAlpha.toFixed(3),
  };
}

export function loadDayNightEffectEnabled(
  storage: DayNightPreferenceStorage | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return false;
  try {
    return storage.getItem(DAY_NIGHT_EFFECT_STORAGE_KEY) === "enabled";
  } catch {
    return false;
  }
}

export function saveDayNightEffectEnabled(
  enabled: boolean,
  storage: DayNightPreferenceStorage | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return;
  try {
    storage.setItem(
      DAY_NIGHT_EFFECT_STORAGE_KEY,
      enabled ? "enabled" : "disabled",
    );
  } catch {
    // 儲存不可用時仍保留本次頁面的開關結果。
  }
}

export function isDebugTimeCommand(command: string) {
  return /^time(?:\s|$)/i.test(command.trim());
}

export function parseDebugTimeCommand(command: string): DebugTimeCommand | null {
  const match = command.trim().match(/^time\s+(\d{4})$/i);
  if (!match) return null;
  const hour = Number(match[1].slice(0, 2));
  const minute = Number(match[1].slice(2));
  if (hour > 23 || minute > 59) return null;
  return {
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function setSurvivalTimeOfDay(
  current: SurvivalGameState,
  minuteOfDay: number,
): SurvivalGameState {
  const currentCycle = Math.max(
    0,
    Math.floor((current.gameMinutes - GAME_START_TIME_MINUTES) / MINUTES_PER_DAY),
  );
  const cycleStart = GAME_START_TIME_MINUTES + currentCycle * MINUTES_PER_DAY;
  const minuteOffset = (
    (Math.floor(minuteOfDay) - GAME_START_TIME_MINUTES) % MINUTES_PER_DAY +
    MINUTES_PER_DAY
  ) % MINUTES_PER_DAY;
  return {
    ...current,
    values: { ...current.values },
    zeroDurationMinutes: { ...current.zeroDurationMinutes },
    gameMinutes: cycleStart + minuteOffset,
  };
}
