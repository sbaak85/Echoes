export const FREQUENCY_CALIBRATION_EVENT_NAME =
  "echoes:frequency-calibration-complete";
export const FREQUENCY_CALIBRATION_COMPLETION_FLAG =
  "COMM_ARRAY_CALIBRATION_01_COMPLETED";

export const FREQUENCY_COARSE_MIN = 1;
export const FREQUENCY_COARSE_MAX = 8;
export const FREQUENCY_FINE_MIN = 0;
export const FREQUENCY_FINE_MAX = 100;
export const FREQUENCY_FINE_DISPLAY_MIN = -3;
export const FREQUENCY_FINE_DISPLAY_MAX = 3;

export const FREQUENCY_COARSE_FINE_RESET_DISPLAY_VALUES = {
  1: -1.3,
  2: 0.7,
  3: -0.9,
  4: -2.5,
  5: 1.2,
  6: -0.5,
  7: -2,
  8: 0.75,
} as const;

export const FREQUENCY_GAMEPAD_DIAL_DEAD_ZONE = 0.24;
export const FREQUENCY_GAMEPAD_FINE_DEAD_ZONE = 0.18;
export const FREQUENCY_GAMEPAD_FINE_UNITS_PER_SECOND = 38;

export type FrequencyCalibrationState = {
  coarse: number;
  fine: number;
};

export type FrequencyCalibrationPuzzleConfig = {
  id: string;
  title: string;
  stageLabel: string;
  initial: FrequencyCalibrationState;
  target: FrequencyCalibrationState;
  fineTolerance: number;
};

export type FrequencyCalibrationEvaluation = {
  strength: number;
  coarseError: number;
  fineError: number;
  canLock: boolean;
  status: "weak" | "searching" | "stable" | "matched";
  statusLabel: string;
};

export const DEFAULT_FREQUENCY_CALIBRATION_CONFIG: FrequencyCalibrationPuzzleConfig = {
  id: "COMM_ARRAY_CALIBRATION_01",
  title: "通訊陣列－頻率調校",
  stageLabel: "階段 2 / 4・測試通訊調頻",
  initial: { coarse: 2, fine: frequencyFineDisplayToValue(0.7) },
  target: { coarse: 7, fine: 85 },
  fineTolerance: 1,
};

export function getFrequencyVisualSignalStrength(
  state: FrequencyCalibrationState,
  randomValue = Math.random(),
): number {
  const normalized = clampFrequencyState(state);
  const fineError = Math.abs(normalized.fine - 85);

  if (normalized.coarse === 7 && normalized.fine >= 80 && normalized.fine <= 90) {
    if (fineError === 0) return 100;
    const nearTargetStrength = 93 + (1 - fineError / 5) * 6;
    return Math.min(99, Math.round(nearTargetStrength + randomValue * 0.8));
  }

  return Math.round(12 + Math.max(0, Math.min(1, randomValue)) * 68);
}

export function clampFrequencyState(
  state: FrequencyCalibrationState,
): FrequencyCalibrationState {
  return {
    coarse: Math.min(
      FREQUENCY_COARSE_MAX,
      Math.max(FREQUENCY_COARSE_MIN, Math.round(state.coarse)),
    ),
    fine: Math.min(
      FREQUENCY_FINE_MAX,
      Math.max(FREQUENCY_FINE_MIN, Math.round(state.fine)),
    ),
  };
}

export function frequencyFineDisplayToValue(displayValue: number): number {
  const displayRange = FREQUENCY_FINE_DISPLAY_MAX - FREQUENCY_FINE_DISPLAY_MIN;
  const normalized =
    (displayValue - FREQUENCY_FINE_DISPLAY_MIN) / displayRange;
  return Math.min(
    FREQUENCY_FINE_MAX,
    Math.max(FREQUENCY_FINE_MIN, normalized * FREQUENCY_FINE_MAX),
  );
}

export function frequencyFineValueToDisplay(fineValue: number): number {
  const normalized =
    (fineValue - FREQUENCY_FINE_MIN) /
    (FREQUENCY_FINE_MAX - FREQUENCY_FINE_MIN);
  return (
    FREQUENCY_FINE_DISPLAY_MIN +
    normalized * (FREQUENCY_FINE_DISPLAY_MAX - FREQUENCY_FINE_DISPLAY_MIN)
  );
}

export function getFrequencyFineResetValue(coarse: number): number {
  const normalizedCoarse = Math.min(
    FREQUENCY_COARSE_MAX,
    Math.max(FREQUENCY_COARSE_MIN, Math.round(coarse)),
  ) as keyof typeof FREQUENCY_COARSE_FINE_RESET_DISPLAY_VALUES;
  return frequencyFineDisplayToValue(
    FREQUENCY_COARSE_FINE_RESET_DISPLAY_VALUES[normalizedCoarse],
  );
}

export function evaluateFrequencyCalibration(
  state: FrequencyCalibrationState,
  config = DEFAULT_FREQUENCY_CALIBRATION_CONFIG,
): FrequencyCalibrationEvaluation {
  const normalized = clampFrequencyState(state);
  const coarseError = Math.abs(normalized.coarse - config.target.coarse);
  const fineError = Math.abs(normalized.fine - config.target.fine);
  const coarseScore = Math.max(0, 1 - coarseError / 4.5);
  const fineScore = Math.max(0, 1 - fineError / 50);
  const rawScore = coarseScore * 0.64 + fineScore * 0.36;
  const strength = Math.max(
    0,
    Math.min(100, Math.round(Math.pow(rawScore, 1.12) * 100)),
  );
  const canLock = coarseError === 0 && fineError <= config.fineTolerance;

  if (canLock) {
    return {
      strength: 100,
      coarseError,
      fineError,
      canLock,
      status: "matched",
      statusLabel: "波形同步",
    };
  }
  if (strength >= 75) {
    return {
      strength,
      coarseError,
      fineError,
      canLock,
      status: "stable",
      statusLabel: "接近穩定",
    };
  }
  if (strength >= 42) {
    return {
      strength,
      coarseError,
      fineError,
      canLock,
      status: "searching",
      statusLabel: "搜尋訊號",
    };
  }
  return {
    strength,
    coarseError,
    fineError,
    canLock,
    status: "weak",
    statusLabel: "訊號微弱",
  };
}

export function stepFrequencyCoarse(value: number, direction: number): number {
  return clampFrequencyState({ coarse: value + Math.sign(direction), fine: 0 })
    .coarse;
}

export function stepFrequencyFine(value: number, direction: number): number {
  return clampFrequencyState({ coarse: 1, fine: value + Math.sign(direction) })
    .fine;
}

export function frequencyDialAngleFromStick(
  horizontal: number,
  vertical: number,
): number | null {
  if (Math.hypot(horizontal, vertical) < FREQUENCY_GAMEPAD_DIAL_DEAD_ZONE) {
    return null;
  }
  const angle = (Math.atan2(horizontal, -vertical) * 180) / Math.PI;
  return (angle + 360) % 360;
}

export function frequencyCoarseFromDialAngle(angleDegrees: number): number {
  const normalizedAngle = ((angleDegrees % 360) + 360) % 360;
  const tickCount = FREQUENCY_COARSE_MAX - FREQUENCY_COARSE_MIN + 1;
  const tickAngle = 360 / tickCount;
  return (
    FREQUENCY_COARSE_MIN +
    (Math.round(normalizedAngle / tickAngle) % tickCount)
  );
}
