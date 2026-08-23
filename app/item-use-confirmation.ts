export type ItemUseConfirmationChoice = "cancel" | "confirm";

const ITEM_USE_CONFIRMATION_CHOICES: readonly ItemUseConfirmationChoice[] = [
  "cancel",
  "confirm",
];

export function resolveItemUseActionVerb(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : "使用";
}

export function formatItemUseActionEffect(
  action: {
    verb?: unknown;
    rewards?: readonly { itemId: string; quantity: number }[];
  } | null | undefined,
  resolveItemName: (itemId: string) => string | null | undefined,
): string | null {
  if (!action?.rewards?.length) return null;
  const rewards = action.rewards.flatMap((reward) => {
    const quantity = Math.floor(Number(reward.quantity));
    if (!Number.isFinite(quantity) || quantity < 1) return [];
    return [`${resolveItemName(reward.itemId) ?? reward.itemId}+${quantity}`];
  });
  if (rewards.length === 0) return null;
  return `可${resolveItemUseActionVerb(action.verb)}成　${rewards.join("、")}`;
}

export function moveItemUseConfirmationChoice(
  current: ItemUseConfirmationChoice,
  offset: number,
): ItemUseConfirmationChoice {
  const currentIndex = ITEM_USE_CONFIRMATION_CHOICES.indexOf(current);
  const direction = Math.sign(offset);
  if (direction === 0) return current;
  const nextIndex =
    (currentIndex + direction + ITEM_USE_CONFIRMATION_CHOICES.length) %
    ITEM_USE_CONFIRMATION_CHOICES.length;
  return ITEM_USE_CONFIRMATION_CHOICES[nextIndex];
}
