export type InventoryCategoryBumper = "LB" | "RB";

export function getInventoryHorizontalTarget(
  currentPosition: number,
  itemCount: number,
  direction: number,
  hasNextPage: boolean,
  hasPreviousPage = false,
): { position: number; pageOffset: -1 | 0 | 1 } {
  if (itemCount <= 0) return { position: 0, pageOffset: 0 };
  const current = Math.max(0, Math.min(itemCount - 1, currentPosition));
  const step = Math.sign(direction);
  if (step > 0 && current === itemCount - 1 && hasNextPage) {
    return { position: 0, pageOffset: 1 };
  }
  if (step < 0 && current === 0 && hasPreviousPage) {
    return { position: 0, pageOffset: -1 };
  }
  return { position: (current + step + itemCount) % itemCount, pageOffset: 0 };
}

export const INVENTORY_SELECTED_ACTIONS = [
  "use",
  "inspect",
  "quick",
  "discard",
] as const;

export type InventorySelectedAction =
  (typeof INVENTORY_SELECTED_ACTIONS)[number];

export function moveInventorySelectedAction(
  current: InventorySelectedAction,
  horizontal: number,
  vertical: number,
  enabledActions: readonly InventorySelectedAction[],
): InventorySelectedAction {
  const enabled = new Set(enabledActions);
  if (enabled.size === 0) return current;
  const currentIndex = Math.max(0, INVENTORY_SELECTED_ACTIONS.indexOf(current));
  const step = horizontal !== 0 ? Math.sign(horizontal) : Math.sign(vertical) * 2;
  if (step === 0) return enabled.has(current)
    ? current
    : INVENTORY_SELECTED_ACTIONS.find((action) => enabled.has(action)) ?? current;

  let nextIndex = currentIndex;
  for (let attempt = 0; attempt < INVENTORY_SELECTED_ACTIONS.length; attempt += 1) {
    nextIndex =
      (nextIndex + step + INVENTORY_SELECTED_ACTIONS.length) %
      INVENTORY_SELECTED_ACTIONS.length;
    const candidate = INVENTORY_SELECTED_ACTIONS[nextIndex];
    if (candidate !== current && enabled.has(candidate)) return candidate;
  }
  const fallbackStep = Math.sign(horizontal || vertical);
  for (let attempt = 1; attempt < INVENTORY_SELECTED_ACTIONS.length; attempt += 1) {
    const candidate = INVENTORY_SELECTED_ACTIONS[
      (currentIndex + fallbackStep * attempt + INVENTORY_SELECTED_ACTIONS.length) %
        INVENTORY_SELECTED_ACTIONS.length
    ];
    if (enabled.has(candidate)) return candidate;
  }
  return current;
}

export function getInventoryCategoryOffsetForBumper(
  bumper: InventoryCategoryBumper,
) {
  return bumper === "LB" ? -1 : 1;
}

export function getClampedInventoryCategoryIndex(
  currentIndex: number,
  categoryCount: number,
  offset: number,
) {
  const safeCategoryCount = Math.max(1, Math.floor(categoryCount));
  return Math.max(
    0,
    Math.min(
      safeCategoryCount - 1,
      Math.floor(currentIndex) + Math.sign(offset),
    ),
  );
}

export function getVirtualCursorInventoryItemAction(
  selectedIndex: number,
  hoveredIndex: number,
): "select" | "actions" {
  return selectedIndex === hoveredIndex ? "actions" : "select";
}
