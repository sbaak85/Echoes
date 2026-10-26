export type InteractionFlowDescriptor = {
  type?: string;
  skipSuccessDialogue?: boolean;
  dialogue?: InteractionDialogueScript;
  failureDialogue?: InteractionDialogueScript;
  survivalFailureDialogue?: InteractionDialogueScript;
  completionDialogue?: InteractionDialogueScript;
  useRequirements?: InteractionUseRequirement[];
};

export type InteractionDialogueScript = {
  characterDelaySeconds?: number;
  speakers?: string[];
  lines: InteractionDialogueLine[];
  /** 最後一句之後顯示的對話選項（可省略）；由 MapEditor 對話腳本編輯器的「對話選項」頁設定。 */
  choice?: InteractionDialogueChoice;
};

/**
 * 選後動作：continue＝繼續原本的互動（例如開始小遊戲、發放獎勵、結算互動）；
 * cancel＝只播完回應台詞就結束，不執行互動、不消耗次數。
 */
export type InteractionDialogueChoiceAction = "continue" | "cancel";

export type InteractionDialogueChoiceOption = {
  id?: string;
  label: string;
  /** 選擇後播放的回應台詞（可留空直接結束） */
  replyLines?: InteractionDialogueLine[];
  action?: InteractionDialogueChoiceAction;
};

export type InteractionDialogueChoice = {
  options: InteractionDialogueChoiceOption[];
};

/** 對話結束時回報玩家選了什麼；沒有選項的對話不帶值。 */
export type DialogueChoiceOutcome = {
  choiceId?: string;
  choiceAction?: InteractionDialogueChoiceAction;
};

export const DIALOGUE_CHOICE_MAX_OPTIONS = 4;

/** 只保留有文字的選項（最多 4 個）；沒有可用選項時回傳 null，對話照一般方式結束。 */
export function normalizeDialogueChoice(choice: unknown): InteractionDialogueChoice | null {
  if (!choice || typeof choice !== "object") return null;
  const rawOptions = (choice as { options?: unknown }).options;
  if (!Array.isArray(rawOptions)) return null;
  const options = rawOptions.flatMap((candidate, index): InteractionDialogueChoiceOption[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const option = candidate as Partial<InteractionDialogueChoiceOption>;
    const label = typeof option.label === "string" ? option.label.trim() : "";
    if (!label) return [];
    const replyLines = Array.isArray(option.replyLines)
      ? option.replyLines.filter((line): line is InteractionDialogueLine =>
          Boolean(line) && typeof line.text === "string" && line.text.trim().length > 0)
      : [];
    return [{
      id: typeof option.id === "string" && option.id.trim() ? option.id.trim() : `option-${index + 1}`,
      label,
      replyLines,
      action: option.action === "cancel" ? "cancel" : "continue",
    }];
  }).slice(0, DIALOGUE_CHOICE_MAX_OPTIONS);
  return options.length > 0 ? { options } : null;
}

export type InteractionDialogueLine = {
  /** Stable editor-generated ID used by precise dialogue-line events such as BGM cues. */
  lineId?: string;
  speaker?: string;
  text: string;
  randomGroupId?: string;
  weight?: number;
};

export type InteractionFeedbackPoint = { x: number; y: number };

export function selectPreferredInteractionTarget<
  T extends { type?: string },
>(targets: readonly T[]): T | null {
  return targets.find((target) => target.type === "pickup") ?? targets[0] ?? null;
}

export const DEFAULT_INTERACTION_FAILURE_DIALOGUE: InteractionDialogueScript = {
  characterDelaySeconds: 0.02,
  speakers: ["Sbaak", "Echo"],
  lines: [{ speaker: "Sbaak", text: "目前無法使用。" }],
};

export type InteractionItemRewardDelivery = "inventory" | "world";

export type InteractionItemReward = {
  itemId: string;
  quantity: number;
  delivery: InteractionItemRewardDelivery;
};

export type InteractionRequirementScope =
  | "both"
  | "prompt"
  | "interaction";

type InteractionRequirementScopeField = {
  scope?: InteractionRequirementScope;
};

export type InteractionUseRequirement =
  | (InteractionRequirementScopeField & { kind: "dialogueCompleted"; dialogueId: string })
  | (InteractionRequirementScopeField & { kind: "item"; itemId: string; quantity: number })
  | (InteractionRequirementScopeField & { kind: "campPower"; minimumPower: number })
  | (InteractionRequirementScopeField & { kind: "chapter"; chapter: number })
  | (InteractionRequirementScopeField & { kind: "quest"; questId: string })
  | (InteractionRequirementScopeField & {
      kind: "questState";
      questId: string;
      questState: InteractionQuestState;
    })
  | (InteractionRequirementScopeField & {
      kind: "questStage";
      questId: string;
      stageId: string;
      stageMode: InteractionStageMode;
      objectiveId?: string;
      objectiveState?: InteractionObjectiveState;
      disableQuestId?: string;
      disableStageId?: string;
      disableObjectiveId?: string;
      disableObjectiveState?: InteractionObjectiveState;
      removeWhenDisabled?: boolean;
      removeQuestId?: string;
      removeStageId?: string;
      removeObjectiveId?: string;
      removeObjectiveState?: InteractionObjectiveState;
    });

export type InteractionStageMode =
  | "CurrentStageOnly"
  | "UnlockFromStage"
  | "UnlockUntilCondition";

export type InteractionObjectiveState = "unlocked" | "completed";

export type InteractionQuestState =
  | "locked"
  | "available"
  | "active"
  | "completed"
  | "failed"
  | "abandoned";

export type UnmetInteractionUseRequirement = InteractionUseRequirement & {
  actual: number;
};

function hasInteractionDisableCondition(
  requirement: Extract<InteractionUseRequirement, { kind: "questStage" }>,
  hasQuestReachedStage: (questId: string, stageId: string) => boolean,
  hasObjectiveReachedState: (questId: string, objectiveId: string, state: InteractionObjectiveState) => boolean,
): boolean {
  return requirement.stageMode === "UnlockUntilCondition" &&
    Boolean(requirement.disableQuestId && requirement.disableStageId &&
      hasQuestReachedStage(requirement.disableQuestId, requirement.disableStageId) &&
      (!requirement.disableObjectiveId || hasObjectiveReachedState(
        requirement.disableQuestId, requirement.disableObjectiveId,
        requirement.disableObjectiveState ?? "completed",
      )));
}

/** Retire the scene interaction, never the quest history. Scope and failed-attempt options cannot override this. */
export function isInteractionRetired(
  requirements: readonly InteractionUseRequirement[],
  hasQuestReachedStage: (questId: string, stageId: string) => boolean,
  hasObjectiveReachedState: (questId: string, objectiveId: string, state: InteractionObjectiveState) => boolean = () => false,
): boolean {
  return requirements.some(requirement => {
    if (requirement.kind !== "questStage") return false;
    if (requirement.removeQuestId || requirement.removeStageId) {
      return Boolean(requirement.removeQuestId && requirement.removeStageId &&
        hasQuestReachedStage(requirement.removeQuestId, requirement.removeStageId) &&
        (!requirement.removeObjectiveId || hasObjectiveReachedState(
          requirement.removeQuestId, requirement.removeObjectiveId,
          requirement.removeObjectiveState ?? "completed",
        )));
    }
    // Compatibility for scenes saved by the original combined close/remove option.
    return requirement.removeWhenDisabled === true &&
      hasInteractionDisableCondition(requirement, hasQuestReachedStage, hasObjectiveReachedState);
  });
}

export function evaluateInteractionStageRequirement(
  requirement: Extract<InteractionUseRequirement, { kind: "questStage" }>,
  isQuestAtStage: (questId: string, stageId: string) => boolean,
  hasQuestReachedStage: (questId: string, stageId: string) => boolean,
  hasObjectiveReachedState: (
    questId: string,
    objectiveId: string,
    state: InteractionObjectiveState,
  ) => boolean = () => false,
): boolean {
  const stageRequirementMet = requirement.stageMode === "CurrentStageOnly"
    ? isQuestAtStage(requirement.questId, requirement.stageId)
    : hasQuestReachedStage(requirement.questId, requirement.stageId);
  if (!stageRequirementMet) return false;
  if (
    requirement.objectiveId &&
    !hasObjectiveReachedState(
      requirement.questId,
      requirement.objectiveId,
      requirement.objectiveState ?? "unlocked",
    )
  ) return false;
  if (hasInteractionDisableCondition(requirement, hasQuestReachedStage, hasObjectiveReachedState)) {
    return false;
  }
  return true;
}

export function shouldCompleteAfterDialogue(
  interactable: InteractionFlowDescriptor,
) {
  return interactable.type !== "pickup" &&
    interactable.skipSuccessDialogue !== true &&
    interactable.dialogue != null;
}

export function selectInteractionDialogue(
  interactable: InteractionFlowDescriptor,
  outcome: "success" | "failure" | "survivalFailure" | "completion",
) {
  if (outcome === "success") {
    return interactable.skipSuccessDialogue === true
      ? null
      : interactable.dialogue ?? null;
  }
  if (outcome === "completion") {
    const dialogue = interactable.completionDialogue;
    return dialogue?.lines?.some((line) => line.text.trim())
      ? dialogue
      : null;
  }
  if (outcome === "survivalFailure") {
    const dialogue = interactable.survivalFailureDialogue;
    return dialogue?.lines?.some((line) => line.text.trim())
      ? dialogue
      : interactable.failureDialogue ?? DEFAULT_INTERACTION_FAILURE_DIALOGUE;
  }
  return interactable.failureDialogue ?? DEFAULT_INTERACTION_FAILURE_DIALOGUE;
}

function normalizeDialogueWeight(value: unknown) {
  const weight = Math.floor(Number(value));
  return Number.isFinite(weight) && weight > 0
    ? Math.min(999, weight)
    : 1;
}

export function resolveWeightedDialogueLines(
  lines: readonly InteractionDialogueLine[],
  random: () => number = Math.random,
): InteractionDialogueLine[] {
  const output: InteractionDialogueLine[] = [];
  const resolvedGroups = new Set<string>();

  for (const line of lines) {
    const groupId = line.randomGroupId?.trim();
    if (!groupId) {
      output.push(line);
      continue;
    }
    const groupKey = groupId.toLocaleLowerCase();
    if (resolvedGroups.has(groupKey)) continue;
    resolvedGroups.add(groupKey);

    const candidates = lines.filter(
      (candidate) =>
        candidate.randomGroupId?.trim().toLocaleLowerCase() === groupKey,
    );
    if (candidates.length < 2) {
      output.push(line);
      continue;
    }

    const totalWeight = candidates.reduce(
      (total, candidate) => total + normalizeDialogueWeight(candidate.weight),
      0,
    );
    const randomValue = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
    const target = randomValue * totalWeight;
    let accumulatedWeight = 0;
    let selected = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      accumulatedWeight += normalizeDialogueWeight(candidate.weight);
      if (target < accumulatedWeight) {
        selected = candidate;
        break;
      }
    }
    output.push(selected);
  }

  return output;
}

export function selectInteractionFeedbackPoint(
  interactionHintPoint: InteractionFeedbackPoint | undefined,
  fallbackCenter: InteractionFeedbackPoint,
): InteractionFeedbackPoint {
  return interactionHintPoint ?? fallbackCenter;
}

export function normalizeInteractionUseRequirements(
  value: unknown,
  resolveItemId: (itemId: string) => string | null,
): InteractionUseRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): InteractionUseRequirement[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const candidate = raw as Record<string, unknown>;
    const scope: InteractionRequirementScopeField = candidate.scope === "prompt" || candidate.scope === "interaction"
      ? { scope: candidate.scope }
      : {};
    if (candidate.kind === "dialogueCompleted") {
      const dialogueId = String(candidate.dialogueId ?? "").trim();
      return [{ kind: "dialogueCompleted", dialogueId, ...scope }];
    }
    if (candidate.kind === "chapter") {
      return [{
        kind: "chapter",
        chapter: Math.min(99, Math.max(1, Math.floor(Number(candidate.chapter) || 1))),
        ...scope,
      }];
    }
    if (candidate.kind === "campPower") {
      return [{
        kind: "campPower",
        minimumPower: Math.min(
          50,
          Math.max(1, Math.floor(Number(candidate.minimumPower) || 1)),
        ),
        ...scope,
      }];
    }
    if (candidate.kind === "quest") {
      const questId = typeof candidate.questId === "string"
        ? candidate.questId.trim()
        : "";
      return questId ? [{ kind: "quest", questId, ...scope }] : [];
    }
    if (candidate.kind === "questState") {
      const questId = typeof candidate.questId === "string"
        ? candidate.questId.trim()
        : "";
      if (!questId) return [];
      const questState: InteractionQuestState = [
        "locked",
        "available",
        "active",
        "completed",
        "failed",
        "abandoned",
      ].includes(String(candidate.questState))
        ? candidate.questState as InteractionQuestState
        : "completed";
      return [{ kind: "questState", questId, questState, ...scope }];
    }
    if (candidate.kind === "questStage") {
      const questId = typeof candidate.questId === "string"
        ? candidate.questId.trim()
        : "";
      const stageId = typeof candidate.stageId === "string"
        ? candidate.stageId.trim()
        : "";
      if (!questId || !stageId) return [];
      const stageMode: InteractionStageMode = candidate.stageMode === "UnlockFromStage"
        ? "UnlockFromStage"
        : candidate.stageMode === "UnlockUntilCondition"
          ? "UnlockUntilCondition"
          : "CurrentStageOnly";
      const disableQuestId = typeof candidate.disableQuestId === "string"
        ? candidate.disableQuestId.trim()
        : "";
      const disableStageId = typeof candidate.disableStageId === "string"
        ? candidate.disableStageId.trim()
        : "";
      const objectiveId = typeof candidate.objectiveId === "string"
        ? candidate.objectiveId.trim()
        : "";
      const objectiveState: InteractionObjectiveState =
        candidate.objectiveState === "completed" ? "completed" : "unlocked";
      const disableObjectiveId = typeof candidate.disableObjectiveId === "string"
        ? candidate.disableObjectiveId.trim()
        : "";
      const disableObjectiveState: InteractionObjectiveState =
        candidate.disableObjectiveState === "unlocked" ? "unlocked" : "completed";
      const legacyRemoval = candidate.removeWhenDisabled === true &&
        !candidate.removeQuestId && !candidate.removeStageId && stageMode === "UnlockUntilCondition";
      const removeQuestId = typeof candidate.removeQuestId === "string" && candidate.removeQuestId.trim()
        ? candidate.removeQuestId.trim() : legacyRemoval ? disableQuestId : "";
      const removeStageId = typeof candidate.removeStageId === "string" && candidate.removeStageId.trim()
        ? candidate.removeStageId.trim() : legacyRemoval ? disableStageId : "";
      const removeObjectiveId = legacyRemoval ? disableObjectiveId :
        typeof candidate.removeObjectiveId === "string" ? candidate.removeObjectiveId.trim() : "";
      const removeObjectiveState: InteractionObjectiveState = legacyRemoval ? disableObjectiveState :
        candidate.removeObjectiveState === "unlocked" ? "unlocked" : "completed";
      return [{
        kind: "questStage",
        questId,
        stageId,
        stageMode,
        ...(objectiveId ? { objectiveId, objectiveState } : {}),
        ...(stageMode === "UnlockUntilCondition" && disableQuestId && disableStageId
          ? {
              disableQuestId,
              disableStageId,
              ...(disableObjectiveId
                ? { disableObjectiveId, disableObjectiveState }
                : {}),
            }
          : {}),
        ...(removeQuestId && removeStageId ? {
          removeQuestId, removeStageId,
          ...(removeObjectiveId ? { removeObjectiveId, removeObjectiveState } : {}),
        } : {}),
        ...scope,
      }];
    }
    const itemId = typeof candidate.itemId === "string"
      ? resolveItemId(candidate.itemId)
      : null;
    if (!itemId) return [];
    return [{
      kind: "item",
      itemId,
      quantity: Math.min(99, Math.max(1, Math.floor(Number(candidate.quantity) || 1))),
      ...scope,
    }];
  });
}

export function filterInteractionRequirementsByPurpose(
  requirements: readonly InteractionUseRequirement[] | undefined,
  purpose: "prompt" | "interaction",
): InteractionUseRequirement[] {
  return requirements?.filter((requirement) => {
    const scope = requirement.scope ?? "both";
    return scope === "both" || scope === purpose;
  }) ?? [];
}

export function getUnmetInteractionUseRequirements(
  requirements: readonly InteractionUseRequirement[] | undefined,
  inventory: Readonly<Record<string, number>>,
  currentChapter: number,
  isQuestActive: (questId: string) => boolean = () => false,
  isQuestStageRequirementMet: (
    requirement: Extract<InteractionUseRequirement, { kind: "questStage" }>,
  ) => boolean = () => false,
  isQuestState: (
    questId: string,
    questState: InteractionQuestState,
  ) => boolean = () => false,
  currentCampPower: number = 0,
  hasDialogueCompleted: (dialogueId: string) => boolean = () => false,
): UnmetInteractionUseRequirement[] {
  if (!requirements?.length) return [];
  return requirements.flatMap((requirement): UnmetInteractionUseRequirement[] => {
    const actual = requirement.kind === "dialogueCompleted"
      ? requirement.dialogueId.trim() && hasDialogueCompleted(requirement.dialogueId) ? 1 : 0
      : requirement.kind === "chapter"
      ? Math.max(1, Math.floor(currentChapter))
      : requirement.kind === "campPower"
        ? Math.max(0, Math.floor(currentCampPower))
      : requirement.kind === "quest"
        ? isQuestActive(requirement.questId) ? 1 : 0
        : requirement.kind === "questState"
          ? isQuestState(requirement.questId, requirement.questState) ? 1 : 0
        : requirement.kind === "questStage"
          ? isQuestStageRequirementMet(requirement) ? 1 : 0
        : Math.max(0, Math.floor(inventory[requirement.itemId] ?? 0));
    const required = requirement.kind === "chapter"
      ? requirement.chapter
      : requirement.kind === "campPower"
        ? requirement.minimumPower
      : requirement.kind === "dialogueCompleted" || requirement.kind === "quest" ||
          requirement.kind === "questState" ||
          requirement.kind === "questStage"
        ? 1
        : requirement.quantity;
    return actual >= required ? [] : [{ ...requirement, actual }];
  });
}

export function shouldExposeInteraction(
  hasUseRequirementFailure: boolean,
  allowAttemptWhenRequirementsUnmet = false,
  retired = false,
): boolean {
  return !retired && (allowAttemptWhenRequirementsUnmet || !hasUseRequirementFailure);
}

export function normalizeInteractionItemReward(
  value: unknown,
  resolveItemId: (itemId: string) => string | null,
): InteractionItemReward | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<InteractionItemReward>;
  if (
    typeof candidate.itemId !== "string"
  ) {
    return null;
  }
  const itemId = resolveItemId(candidate.itemId);
  if (!itemId) return null;
  return {
    itemId,
    quantity: Math.min(
      99,
      Math.max(1, Math.floor(Number(candidate.quantity) || 1)),
    ),
    delivery: candidate.delivery === "world" ? "world" : "inventory",
  };
}

export function normalizeInteractionItemRewards(
  value: unknown,
  legacyValue: unknown,
  resolveItemId: (itemId: string) => string | null,
): InteractionItemReward[] {
  const source = Array.isArray(value)
    ? value
    : legacyValue == null
      ? []
      : [legacyValue];
  return source.flatMap((reward) => {
    const normalized = normalizeInteractionItemReward(reward, resolveItemId);
    return normalized ? [normalized] : [];
  });
}
