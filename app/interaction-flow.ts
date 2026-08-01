export type InteractionFlowDescriptor = {
  type?: string;
  dialogue?: InteractionDialogueScript;
  failureDialogue?: InteractionDialogueScript;
  completionDialogue?: InteractionDialogueScript;
  useRequirements?: InteractionUseRequirement[];
};

export type InteractionDialogueScript = {
  characterDelaySeconds?: number;
  speakers?: string[];
  lines: Array<{ speaker?: string; text: string }>;
};

export type InteractionFeedbackPoint = { x: number; y: number };

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

export type InteractionUseRequirement =
  | { kind: "item"; itemId: string; quantity: number }
  | { kind: "chapter"; chapter: number };

export type UnmetInteractionUseRequirement = InteractionUseRequirement & {
  actual: number;
};

export function shouldCompleteAfterDialogue(
  interactable: InteractionFlowDescriptor,
) {
  return interactable.type !== "pickup" && interactable.dialogue != null;
}

export function selectInteractionDialogue(
  interactable: InteractionFlowDescriptor,
  outcome: "success" | "failure" | "completion",
) {
  if (outcome === "success") return interactable.dialogue ?? null;
  if (outcome === "completion") {
    const dialogue = interactable.completionDialogue;
    return dialogue?.lines?.some((line) => line.text.trim())
      ? dialogue
      : null;
  }
  return interactable.failureDialogue ?? DEFAULT_INTERACTION_FAILURE_DIALOGUE;
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
    if (candidate.kind === "chapter") {
      return [{
        kind: "chapter",
        chapter: Math.min(99, Math.max(1, Math.floor(Number(candidate.chapter) || 1))),
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
    }];
  });
}

export function getUnmetInteractionUseRequirements(
  requirements: readonly InteractionUseRequirement[] | undefined,
  inventory: Readonly<Record<string, number>>,
  currentChapter: number,
): UnmetInteractionUseRequirement[] {
  if (!requirements?.length) return [];
  return requirements.flatMap((requirement): UnmetInteractionUseRequirement[] => {
    const actual = requirement.kind === "chapter"
      ? Math.max(1, Math.floor(currentChapter))
      : Math.max(0, Math.floor(inventory[requirement.itemId] ?? 0));
    const required = requirement.kind === "chapter"
      ? requirement.chapter
      : requirement.quantity;
    return actual >= required ? [] : [{ ...requirement, actual }];
  });
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
