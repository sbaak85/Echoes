export type InventoryCategoryBumper = "LB" | "RB";

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
