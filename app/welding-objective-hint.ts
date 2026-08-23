import { QuestRuntimeManager } from "./quest-runtime-manager.ts";

export const WELDING_TOOL_HINT_QUEST_ID = "QUEST_CH03_MAIN_006";
export const WELDING_TOOL_HINT_STAGE_ID = "QUEST_CH03_MAIN_006_STAGE_02";
export const WELDING_TOOL_HINT_OBJECTIVE_ID = "QUEST_CH03_MAIN_006_OBJ_06";
export const WELDING_COMPLETION_OBJECTIVE_ID = "QUEST_CH03_MAIN_006_OBJ_04";
export const WELDING_TOOL_HINT_INTERACTION_ID = "scene3-interaction-024";
export const WELDING_TOOL_HINT_ACTIVATION_EVENT_ID =
  "scene3-interaction-024-failed-twice";
export const WELDING_TOOL_HINT_FAILURE_COUNTER_ID =
  "scene3-interaction-024:stage-02:failed-requirement-attempts";
export const WELDING_TOOL_HINT_FAILURE_THRESHOLD = 2;

export type WeldingToolHintFailureResult = {
  activated: boolean;
  failureCount: number;
};

/**
 * Count only rejected attempts against the formal welding interaction while
 * Stage 02 is active. The second rejection unlocks the hidden welding-tool OBJ.
 */
export function recordWeldingToolHintInteractionFailure(
  manager: QuestRuntimeManager,
  interactionId: string,
): WeldingToolHintFailureResult {
  if (
    interactionId !== WELDING_TOOL_HINT_INTERACTION_ID ||
    !manager.isQuestAtStage(WELDING_TOOL_HINT_QUEST_ID, WELDING_TOOL_HINT_STAGE_ID)
  ) {
    return { activated: false, failureCount: 0 };
  }

  const completionProgress = manager.getObjectiveProgress(
    WELDING_TOOL_HINT_QUEST_ID,
    WELDING_COMPLETION_OBJECTIVE_ID,
  );
  const hintProgress = manager.getObjectiveProgress(
    WELDING_TOOL_HINT_QUEST_ID,
    WELDING_TOOL_HINT_OBJECTIVE_ID,
  );
  if (completionProgress.completed || hintProgress.unlocked !== false) {
    return {
      activated: false,
      failureCount: manager.getEventCounter(
        WELDING_TOOL_HINT_QUEST_ID,
        WELDING_TOOL_HINT_FAILURE_COUNTER_ID,
      ),
    };
  }

  const failureCount = manager.incrementEventCounter(
    WELDING_TOOL_HINT_QUEST_ID,
    WELDING_TOOL_HINT_FAILURE_COUNTER_ID,
  );
  if (failureCount < WELDING_TOOL_HINT_FAILURE_THRESHOLD) {
    return { activated: false, failureCount };
  }

  return {
    activated: manager.activateObjective(
      WELDING_TOOL_HINT_OBJECTIVE_ID,
      WELDING_TOOL_HINT_ACTIVATION_EVENT_ID,
    ),
    failureCount,
  };
}
