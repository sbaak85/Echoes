import type { PlayerInfoFloatSegment, PlayerInfoFloatTone } from "./player-info-float";
import type { PlayerInfoFloatMotionConfig } from "./player-info-float";
import type {
  SurvivalMetric,
  UnmetSurvivalRequirement,
} from "./survival-manager";

const METRIC_LABELS: Record<SurvivalMetric, string> = {
  stamina: "體力",
  hunger: "飽足",
  thirst: "飲水",
  spirit: "精神",
};

const METRIC_TONES: Record<SurvivalMetric, PlayerInfoFloatTone> = {
  stamina: "stamina",
  hunger: "hunger",
  thirst: "thirst",
  spirit: "spirit",
};

export const INTERACTION_REQUIREMENT_FLOAT_MOTION: PlayerInfoFloatMotionConfig = {
  enterMs: 500,
  holdMs: 700,
  exitMs: 500,
  enterDistance: 9.6,
  exitDistance: 19.2,
};

export function shouldShowSurvivalRequirementFloats(
  failures: UnmetSurvivalRequirement[],
  hasNonSurvivalFailure: boolean,
) {
  return failures.length > 0 && !hasNonSurvivalFailure;
}

function formatRequirementValue(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function buildSurvivalRequirementFloatSegments(
  requirement: UnmetSurvivalRequirement,
): PlayerInfoFloatSegment[] {
  const label = METRIC_LABELS[requirement.metric];
  const value = formatRequirementValue(requirement.value);
  const valueSegment: PlayerInfoFloatSegment = {
    text: value,
    tone: METRIC_TONES[requirement.metric],
  };

  if (requirement.comparison === "below") {
    return [
      { text: "需要：", tone: "neutral" },
      { text: `${label}低於 `, tone: "neutral" },
      valueSegment,
    ];
  }
  if (requirement.comparison === "atMost") {
    return [
      { text: "需要：", tone: "neutral" },
      { text: `${label}不高於 `, tone: "neutral" },
      valueSegment,
    ];
  }

  return [
    { text: "需要：", tone: "neutral" },
    valueSegment,
    { text: ` ${label}`, tone: "neutral" },
  ];
}

export function buildSurvivalRequirementFloatRows(
  requirements: UnmetSurvivalRequirement[],
) {
  return requirements.map(buildSurvivalRequirementFloatSegments);
}
