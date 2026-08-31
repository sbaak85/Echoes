export type SurvivalMetric = "stamina" | "hunger" | "thirst" | "spirit";

export type SurvivalValues = Record<SurvivalMetric, number>;

export type SurvivalEffects = Partial<Record<SurvivalMetric, number>>;

export type InteractionTimeEffects = {
  timeMinutes?: number;
  jumpToTimeMinutes?: number | null;
  jumpDayOffset?: number;
};

export type SurvivalRequirementComparison = "atLeast" | "below" | "atMost";

export type SurvivalRequirementMatchMode = "all" | "any";

export type SurvivalRequirementRule = {
  comparison: SurvivalRequirementComparison;
  value: number;
};

export type SurvivalRequirements = Partial<
  Record<SurvivalMetric, SurvivalRequirementRule>
> & {
  mode?: SurvivalRequirementMatchMode;
};

export type UnmetSurvivalRequirement = SurvivalRequirementRule & {
  metric: SurvivalMetric;
  actual: number;
};

export type SurvivalGameOverReason = "hunger" | "thirst" | "spirit";

export type SurvivalDeathWarning = {
  reason: SurvivalGameOverReason;
  remainingGameMinutes: number;
};

export type SurvivalGameState = {
  values: SurvivalValues;
  gameMinutes: number;
  zeroDurationMinutes: Pick<SurvivalValues, "hunger" | "thirst" | "spirit">;
  gameOverReason: SurvivalGameOverReason | null;
};

export type CharacterStatus = {
  id: string;
  label: string;
  color: string;
  priority: number;
};

export type InteractionUsageState = {
  cycle: number;
  counts: Record<string, number>;
  completedOnceIds: string[];
};

export const SURVIVAL_STORAGE_KEY = "echoes:survival-state:v1";
export const INTERACTION_USAGE_STORAGE_KEY = "echoes:interaction-usage:v1";
export const GAME_DAY_REAL_SECONDS = 60 * 60;
export const GAME_START_TIME_MINUTES = 6 * 60;
export const GAME_START_DAY = 3;
export const DAILY_RESET_TIME_MINUTES = 6 * 60;
export const MEAL_CENTERS = [8, 12, 18] as const;

const METRICS: SurvivalMetric[] = ["stamina", "hunger", "thirst", "spirit"];
const CRITICAL_THRESHOLD = 20;
export const SURVIVAL_GAME_OVER_ZERO_MINUTES: Record<
  SurvivalGameOverReason,
  number
> = {
  hunger: 5 * 24 * 60,
  thirst: 3 * 24 * 60,
  spirit: 10 * 24 * 60,
};

const clampValue = (value: number) => Math.max(0, Math.min(100, value));

export function getSurvivalDisplayValue(value: number) {
  const normalized = Number.isFinite(value) ? clampValue(value) : 0;
  return Math.floor(normalized);
}

export function formatElapsedGameHours(gameMinutes: number) {
  const normalizedMinutes = Number.isFinite(gameMinutes)
    ? Math.max(0, gameMinutes)
    : 0;
  const hours = Math.round((normalizedMinutes / 60) * 100) / 100;
  return String(hours);
}

/**
 * Duration for the short blackout that masks an interaction which advances
 * the game clock. The interaction still uses its real configured minutes;
 * this only controls the presentation pacing.
 */
export function getTimePassTransitionHoldMs(gameMinutes: number) {
  const normalizedMinutes = Number.isFinite(gameMinutes)
    ? Math.max(0, gameMinutes)
    : 0;
  if (normalizedMinutes < 60) return 0;
  if (normalizedMinutes >= 24 * 60) return 800;
  if (normalizedMinutes >= 8 * 60) return 800;
  if (normalizedMinutes >= 4 * 60) return 200;
  return 100;
}

export function getInteractionCompletionElapsedMinutes(
  currentGameMinutes: number,
  effects?: InteractionTimeEffects,
) {
  const configuredTargetMinutes = effects?.jumpToTimeMinutes;
  if (
    configuredTargetMinutes !== null &&
    configuredTargetMinutes !== undefined &&
    Number.isFinite(Number(configuredTargetMinutes))
  ) {
    const normalizedCurrentMinutes = Number.isFinite(currentGameMinutes)
      ? Math.max(0, currentGameMinutes)
      : 0;
    const targetMinuteOfDay = Math.max(
      0,
      Math.min(24 * 60 - 1, Math.floor(Number(configuredTargetMinutes))),
    );
    const dayOffset = Math.max(
      0,
      Math.min(30, Math.floor(Number(effects?.jumpDayOffset) || 0)),
    );
    const currentDayStart =
      Math.floor(normalizedCurrentMinutes / (24 * 60)) * 24 * 60;
    const targetGameMinutes =
      currentDayStart + dayOffset * 24 * 60 + targetMinuteOfDay;
    return Math.max(0, targetGameMinutes - normalizedCurrentMinutes);
  }

  return Math.max(0, Number(effects?.timeMinutes) || 0);
}

export function getElapsedClockHandMotion(
  startGameMinutes: number,
  elapsedGameMinutes: number,
) {
  const normalizedStart = Number.isFinite(startGameMinutes)
    ? ((startGameMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
    : 0;
  const normalizedElapsed = Number.isFinite(elapsedGameMinutes)
    ? Math.max(0, elapsedGameMinutes)
    : 0;
  const minute = normalizedStart % 60;
  const hour = Math.floor(normalizedStart / 60) % 12;

  return {
    minuteStartDegrees: minute * 6,
    minuteTravelDegrees: normalizedElapsed * 6,
    hourStartDegrees: hour * 30 + minute * 0.5,
    hourTravelDegrees: normalizedElapsed * 0.5,
  };
}

export function createInitialSurvivalState(): SurvivalGameState {
  return {
    values: { stamina: 100, hunger: 100, thirst: 100, spirit: 100 },
    gameMinutes: GAME_START_TIME_MINUTES,
    zeroDurationMinutes: { hunger: 0, thirst: 0, spirit: 0 },
    gameOverReason: null,
  };
}

export function normalizeSurvivalState(value: unknown): SurvivalGameState {
  const initial = createInitialSurvivalState();
  if (!value || typeof value !== "object") return initial;
  const candidate = value as Partial<SurvivalGameState>;
  const rawValues = candidate.values ?? initial.values;
  const rawZero = candidate.zeroDurationMinutes ?? initial.zeroDurationMinutes;
  const values = { ...initial.values };
  for (const metric of METRICS) {
    const next = Number(rawValues[metric]);
    values[metric] = Number.isFinite(next) ? clampValue(next) : initial.values[metric];
  }
  const zeroDurationMinutes = { ...initial.zeroDurationMinutes };
  for (const metric of ["hunger", "thirst", "spirit"] as const) {
    const next = Number(rawZero[metric]);
    zeroDurationMinutes[metric] = Number.isFinite(next) ? Math.max(0, next) : 0;
  }
  const gameMinutes = Number(candidate.gameMinutes);
  const reason = candidate.gameOverReason;
  return {
    values,
    gameMinutes: Number.isFinite(gameMinutes) && gameMinutes >= GAME_START_TIME_MINUTES
      ? gameMinutes
      : GAME_START_TIME_MINUTES,
    zeroDurationMinutes,
    gameOverReason:
      reason === "hunger" || reason === "thirst" || reason === "spirit"
        ? reason
        : null,
  };
}

export function loadSurvivalState(): SurvivalGameState {
  if (typeof window === "undefined") return createInitialSurvivalState();
  try {
    const stored = window.localStorage.getItem(SURVIVAL_STORAGE_KEY);
    return stored ? normalizeSurvivalState(JSON.parse(stored)) : createInitialSurvivalState();
  } catch {
    return createInitialSurvivalState();
  }
}

export function saveSurvivalState(state: SurvivalGameState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SURVIVAL_STORAGE_KEY, JSON.stringify(state));
}

export function getGameClock(gameMinutes: number) {
  const elapsed = Math.max(0, gameMinutes - GAME_START_TIME_MINUTES);
  const day = Math.floor(elapsed / (24 * 60)) + GAME_START_DAY;
  const minutesInDay = ((Math.floor(gameMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return {
    day,
    hour: Math.floor(minutesInDay / 60),
    minute: minutesInDay % 60,
  };
}

export function getMealCurveRate(hourOfDay: number) {
  const normalizedHour = ((hourOfDay % 24) + 24) % 24;
  return MEAL_CENTERS.reduce((rate, center) => {
    const rawDistance = Math.abs(normalizedHour - center);
    const distance = Math.min(rawDistance, 24 - rawDistance);
    if (distance >= 1) return rate;
    return rate + 10 * 0.5 * (1 + Math.cos(Math.PI * distance));
  }, 0);
}

function detectGameOver(state: SurvivalGameState) {
  if (state.gameOverReason) return;
  for (const metric of ["thirst", "hunger", "spirit"] as const) {
    if (
      state.zeroDurationMinutes[metric] >=
      SURVIVAL_GAME_OVER_ZERO_MINUTES[metric]
    ) {
      state.gameOverReason = metric;
      return;
    }
  }
}

export function getSurvivalDeathWarning(
  state: SurvivalGameState,
): SurvivalDeathWarning | null {
  if (state.gameOverReason) return null;
  for (const reason of ["thirst", "hunger", "spirit"] as const) {
    if (state.values[reason] > 0) continue;
    const remainingGameMinutes = Math.max(
      0,
      SURVIVAL_GAME_OVER_ZERO_MINUTES[reason] -
        state.zeroDurationMinutes[reason],
    );
    if (remainingGameMinutes > 0 && remainingGameMinutes <= 1) {
      return { reason, remainingGameMinutes };
    }
  }
  return null;
}

export function prepareDebugNaturalDeathFinalMoment(
  current: SurvivalGameState,
  reason: SurvivalGameOverReason = "thirst",
) {
  return {
    values: { ...current.values, [reason]: 0 },
    gameMinutes: current.gameMinutes,
    zeroDurationMinutes: {
      ...current.zeroDurationMinutes,
      [reason]: Math.max(0, SURVIVAL_GAME_OVER_ZERO_MINUTES[reason] - 1),
    },
    gameOverReason: null,
  } satisfies SurvivalGameState;
}

export function advanceSurvivalState(
  current: SurvivalGameState,
  realDeltaSeconds: number,
  movementDistance = 0,
  movementSpeed = 0,
) {
  const state: SurvivalGameState = {
    values: { ...current.values },
    gameMinutes: current.gameMinutes,
    zeroDurationMinutes: { ...current.zeroDurationMinutes },
    gameOverReason: current.gameOverReason,
  };
  if (state.gameOverReason || realDeltaSeconds <= 0) return state;

  let remainingGameMinutes = realDeltaSeconds * (24 * 60) / GAME_DAY_REAL_SECONDS;
  while (remainingGameMinutes > 0.000001) {
    const stepMinutes = Math.min(1, remainingGameMinutes);
    const stepHours = stepMinutes / 60;
    const midpointHour = ((state.gameMinutes + stepMinutes / 2) / 60) % 24;

    if (state.values.stamina > 10) {
      state.values.stamina = Math.max(
        10,
        state.values.stamina - (25 / 24) * stepHours,
      );
    }
    state.values.hunger = clampValue(
      state.values.hunger - (0.5 + getMealCurveRate(midpointHour)) * stepHours,
    );
    state.values.thirst = clampValue(state.values.thirst - 2 * stepHours);
    state.values.spirit = clampValue(state.values.spirit - 1 * stepHours);
    state.gameMinutes += stepMinutes;

    for (const metric of ["hunger", "thirst", "spirit"] as const) {
      state.zeroDurationMinutes[metric] = state.values[metric] <= 0
        ? state.zeroDurationMinutes[metric] + stepMinutes
        : 0;
    }
    detectGameOver(state);
    if (state.gameOverReason) break;
    remainingGameMinutes -= stepMinutes;
  }

  if (movementDistance > 0) {
    const referenceSpeed = 210;
    const speedFactor = Math.pow(
      Math.max(0.25, movementSpeed / referenceSpeed),
      0.25,
    );
    const movementStaminaCost =
      (15 * movementDistance / (referenceSpeed * GAME_DAY_REAL_SECONDS)) * speedFactor;
    state.values.stamina = clampValue(state.values.stamina - movementStaminaCost);
  }

  return state;
}

export function advanceSurvivalByGameMinutes(
  current: SurvivalGameState,
  gameMinutes: number,
) {
  const normalizedMinutes = Math.max(0, Number(gameMinutes) || 0);
  const equivalentRealSeconds =
    normalizedMinutes * GAME_DAY_REAL_SECONDS / (24 * 60);
  return advanceSurvivalState(current, equivalentRealSeconds);
}

export function getUnmetSurvivalRequirements(
  values: SurvivalValues,
  requirements?: SurvivalRequirements,
): UnmetSurvivalRequirement[] {
  if (!requirements) return [];
  const results = METRICS.flatMap((metric) => {
    const rule = requirements[metric];
    if (!rule) return [];
    const value = clampValue(Number(rule.value));
    if (!Number.isFinite(value)) return [];
    const comparison: SurvivalRequirementComparison = rule.comparison === "below"
      ? "below"
      : rule.comparison === "atMost"
        ? "atMost"
        : "atLeast";
    const actual = values[metric];
    const met = comparison === "below"
      ? actual < value
      : comparison === "atMost"
        ? actual <= value
        : actual >= value;
    return [{ metric, comparison, value, actual, met }];
  });
  if (requirements.mode === "any" && results.some(({ met }) => met)) return [];
  return results.flatMap(({ met, ...failure }) => met ? [] : [failure]);
}

export function applySurvivalEffects(
  current: SurvivalGameState,
  effects?: SurvivalEffects,
) {
  if (!effects) return current;
  const state: SurvivalGameState = {
    ...current,
    values: { ...current.values },
    zeroDurationMinutes: { ...current.zeroDurationMinutes },
  };
  for (const metric of METRICS) {
    const change = Number(effects[metric] ?? 0);
    if (Number.isFinite(change)) state.values[metric] = clampValue(state.values[metric] + change);
  }
  for (const metric of ["hunger", "thirst", "spirit"] as const) {
    if (state.values[metric] > 0) state.zeroDurationMinutes[metric] = 0;
  }
  return state;
}

export function hasConfiguredSurvivalEffects(effects?: SurvivalEffects) {
  if (!effects) return false;
  return METRICS.some((metric) => {
    const value = Number(effects[metric] ?? 0);
    return Number.isFinite(value) && value !== 0;
  });
}

export function canApplySurvivalEffects(
  values: SurvivalValues,
  effects?: SurvivalEffects,
) {
  if (!hasConfiguredSurvivalEffects(effects)) return false;
  const recoveryMetrics = METRICS.filter(
    (metric) => Number(effects?.[metric] ?? 0) > 0,
  );
  if (recoveryMetrics.length === 0) return true;
  return recoveryMetrics.some((metric) => values[metric] < 100);
}

export function getSurvivalSpeedMultiplier(values: SurvivalValues) {
  let multiplier = 1;
  if (values.stamina <= CRITICAL_THRESHOLD) multiplier *= 0.85;
  if (values.hunger <= CRITICAL_THRESHOLD) multiplier *= 0.9;
  if (values.thirst <= CRITICAL_THRESHOLD) multiplier *= 0.9;
  return multiplier;
}

export function getCriticalMetrics(values: SurvivalValues) {
  return METRICS.filter((metric) => values[metric] <= CRITICAL_THRESHOLD);
}

export function getCharacterStatuses(values: SurvivalValues): CharacterStatus[] {
  const statuses: CharacterStatus[] = [];
  const criticalCount = getCriticalMetrics(values).length;
  if (criticalCount === 4) {
    statuses.push({ id: "despair", label: "絕望", color: "#92979f", priority: 100 });
  } else if (criticalCount === 3) {
    statuses.push({ id: "discouraged", label: "喪氣", color: "#76509a", priority: 90 });
  }

  if (values.stamina <= 20) {
    statuses.push({ id: "exhausted-critical", label: "疲憊", color: "#ff5d63", priority: 74 });
  } else if (values.stamina < 30) {
    statuses.push({ id: "exhausted", label: "疲憊", color: "#63df88", priority: 34 });
  }
  if (values.hunger <= 20) {
    statuses.push({ id: "starving", label: "非常飢餓", color: "#ff5d63", priority: 73 });
  } else if (values.hunger < 49) {
    statuses.push({ id: "hungry", label: "飢餓", color: "#f0a953", priority: 33 });
  }
  if (values.thirst <= 20) {
    statuses.push({ id: "dehydrated", label: "非常口渴", color: "#ff5d63", priority: 72 });
  } else if (values.thirst < 49) {
    statuses.push({ id: "thirsty", label: "口渴", color: "#59c9ed", priority: 32 });
  }
  if (values.spirit <= 1) {
    statuses.push({ id: "breaking", label: "瀕臨崩潰", color: "#ff5d63", priority: 76 });
  } else if (values.spirit <= 20) {
    statuses.push({ id: "low-spirit", label: "精神不濟", color: "#b478e6", priority: 40 });
  }

  return statuses.sort((left, right) => right.priority - left.priority).slice(0, 3);
}

export function getInteractionCycle(gameMinutes: number) {
  return Math.max(
    0,
    Math.floor((gameMinutes - DAILY_RESET_TIME_MINUTES) / (24 * 60)),
  );
}

export function createInteractionUsageState(gameMinutes: number): InteractionUsageState {
  return {
    cycle: getInteractionCycle(gameMinutes),
    counts: {},
    completedOnceIds: [],
  };
}

export function normalizeInteractionUsageState(
  value: unknown,
  gameMinutes: number,
): InteractionUsageState {
  const currentCycle = getInteractionCycle(gameMinutes);
  if (!value || typeof value !== "object") return createInteractionUsageState(gameMinutes);
  const candidate = value as Partial<InteractionUsageState>;
  const counts: Record<string, number> = {};
  if (
    candidate.cycle === currentCycle &&
    candidate.counts &&
    typeof candidate.counts === "object"
  ) {
    for (const [id, count] of Object.entries(candidate.counts)) {
      const normalized = Math.max(0, Math.floor(Number(count)));
      if (Number.isFinite(normalized)) counts[id] = normalized;
    }
  }
  const completedOnceIds = Array.from(new Set(
    Array.isArray(candidate.completedOnceIds)
      ? candidate.completedOnceIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [],
  ));
  return { cycle: currentCycle, counts, completedOnceIds };
}

export function ensureInteractionUsageCycle(
  state: InteractionUsageState,
  gameMinutes: number,
) {
  const cycle = getInteractionCycle(gameMinutes);
  return state.cycle === cycle
    ? state
    : { ...state, cycle, counts: {} };
}

export function loadInteractionUsageState(gameMinutes: number) {
  if (typeof window === "undefined") return createInteractionUsageState(gameMinutes);
  try {
    const stored = window.localStorage.getItem(INTERACTION_USAGE_STORAGE_KEY);
    return stored
      ? normalizeInteractionUsageState(JSON.parse(stored), gameMinutes)
      : createInteractionUsageState(gameMinutes);
  } catch {
    return createInteractionUsageState(gameMinutes);
  }
}

export function saveInteractionUsageState(state: InteractionUsageState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INTERACTION_USAGE_STORAGE_KEY, JSON.stringify(state));
}

export function normalizeDailyInteractionLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const limit = Math.floor(Number(value));
  return Number.isFinite(limit) && limit >= 1 ? Math.min(10, limit) : null;
}

export function isInteractionLocked(
  state: InteractionUsageState,
  interactableId: string,
  limit: unknown,
  limitMode?: unknown,
) {
  if (limitMode === "once") {
    return state.completedOnceIds.includes(interactableId);
  }
  const normalizedLimit = normalizeDailyInteractionLimit(limit);
  return normalizedLimit !== null && (state.counts[interactableId] ?? 0) >= normalizedLimit;
}

export function shouldShowLockedInteractionHint(limitMode?: unknown) {
  return limitMode !== "once";
}

export function recordInteractionUse(
  state: InteractionUsageState,
  interactableId: string,
  limit: unknown,
  limitMode?: unknown,
) {
  if (limitMode === "once") {
    if (state.completedOnceIds.includes(interactableId)) return state;
    return {
      ...state,
      completedOnceIds: [...state.completedOnceIds, interactableId],
    };
  }
  const normalizedLimit = normalizeDailyInteractionLimit(limit);
  if (normalizedLimit === null) return state;
  return {
    ...state,
    counts: {
      ...state.counts,
      [interactableId]: Math.min(normalizedLimit, (state.counts[interactableId] ?? 0) + 1),
    },
  };
}
