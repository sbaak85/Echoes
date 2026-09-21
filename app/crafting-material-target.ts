/** Preserve backpack order (including filters), skipping materials already assigned. */
export function findCraftMaterialTarget(materialIds: readonly string[], requiredIds: readonly string[], allocated: ReadonlySet<string>) {
  const required = new Set(requiredIds);
  const index = materialIds.findIndex(id => required.has(id) && !allocated.has(id));
  return index < 0 ? null : { id: materialIds[index], index, page: Math.floor(index / 12) };
}
