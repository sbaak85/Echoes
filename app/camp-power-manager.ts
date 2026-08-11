import { getInteractionCycle } from "./survival-manager.ts";

export const CAMP_POWER_STORAGE_KEY = "echoes:camp-power:v1";
export const CAMP_POWER_CAPACITY = 50;
export const CAMP_POWER_INITIAL_VALUE = 3;
export const CAMP_POWER_DAILY_CONSUMPTION = 1;
export const CAMP_POWER_RESONATOR_INTERACTION_ID = "interaction-013";
export const CAMP_POWER_REFILL_ITEM_ID = "R0001";
export const CAMP_POWER_REFILL_ITEM_QUANTITY = 1;
export const CAMP_POWER_REFILL_AMOUNT = 2;

export type CampPowerState = {
  current: number;
  dailyConsumptionEnabled: boolean;
  lastProcessedCycle: number;
};

function clampCampPower(value: unknown) {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric)
    ? Math.max(0, Math.min(CAMP_POWER_CAPACITY, numeric))
    : CAMP_POWER_INITIAL_VALUE;
}

export function createInitialCampPowerState(gameMinutes: number): CampPowerState {
  return {
    current: CAMP_POWER_INITIAL_VALUE,
    dailyConsumptionEnabled: false,
    lastProcessedCycle: getInteractionCycle(gameMinutes),
  };
}

export function normalizeCampPowerState(
  value: unknown,
  gameMinutes: number,
): CampPowerState {
  const fallback = createInitialCampPowerState(gameMinutes);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const candidate = value as Partial<CampPowerState>;
  const lastProcessedCycle = Math.floor(Number(candidate.lastProcessedCycle));
  return {
    current: clampCampPower(candidate.current),
    dailyConsumptionEnabled: candidate.dailyConsumptionEnabled === true,
    lastProcessedCycle: Number.isFinite(lastProcessedCycle)
      ? lastProcessedCycle
      : fallback.lastProcessedCycle,
  };
}

export function loadCampPowerState(gameMinutes: number): CampPowerState {
  if (typeof window === "undefined") return createInitialCampPowerState(gameMinutes);
  try {
    const stored = window.localStorage.getItem(CAMP_POWER_STORAGE_KEY);
    return stored === null
      ? createInitialCampPowerState(gameMinutes)
      : normalizeCampPowerState(JSON.parse(stored), gameMinutes);
  } catch {
    return createInitialCampPowerState(gameMinutes);
  }
}

export function saveCampPowerState(state: CampPowerState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CAMP_POWER_STORAGE_KEY, JSON.stringify(state));
}

export function setCampPowerDailyConsumptionEnabled(
  state: CampPowerState,
  enabled: boolean,
  gameMinutes: number,
): CampPowerState {
  return {
    ...state,
    dailyConsumptionEnabled: enabled,
    lastProcessedCycle: getInteractionCycle(gameMinutes),
  };
}

export function advanceCampPowerToGameMinutes(
  state: CampPowerState,
  gameMinutes: number,
): CampPowerState {
  const currentCycle = getInteractionCycle(gameMinutes);
  if (!state.dailyConsumptionEnabled) return state;
  if (currentCycle === state.lastProcessedCycle) return state;
  if (currentCycle < state.lastProcessedCycle) {
    return { ...state, lastProcessedCycle: currentCycle };
  }
  const elapsedCycles = currentCycle - state.lastProcessedCycle;
  return {
    ...state,
    current: Math.max(
      0,
      state.current - elapsedCycles * CAMP_POWER_DAILY_CONSUMPTION,
    ),
    lastProcessedCycle: currentCycle,
  };
}

export function canRefillCampPower(state: CampPowerState, ownedItemCount: number) {
  return state.current < CAMP_POWER_CAPACITY && ownedItemCount >= CAMP_POWER_REFILL_ITEM_QUANTITY;
}

export function refillCampPower(
  state: CampPowerState,
  itemQuantity = CAMP_POWER_REFILL_ITEM_QUANTITY,
): CampPowerState {
  const normalizedQuantity = Math.max(0, Math.floor(itemQuantity));
  if (normalizedQuantity === 0 || state.current >= CAMP_POWER_CAPACITY) return state;
  return {
    ...state,
    current: Math.min(
      CAMP_POWER_CAPACITY,
      state.current + normalizedQuantity * CAMP_POWER_REFILL_AMOUNT,
    ),
  };
}
