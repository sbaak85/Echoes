export type CraftQuantityHold = { direction: number; nextAt: number; blocked: boolean };
export const idleCraftQuantityHold = (): CraftQuantityHold => ({ direction: 0, nextAt: 0, blocked: false });

// Poll with the shared input loop: no timer survives a closed or suspended menu.
export function stepCraftQuantityHold(state: CraftQuantityHold, left: boolean, right: boolean, now: number, enabled: boolean) {
  if (!left && !right) return { state: idleCraftQuantityHold(), delta: 0 };
  if (!enabled || left === right) return { state: { ...state, blocked: true }, delta: 0 };
  if (state.blocked) return { state, delta: 0 };
  const direction = left ? -1 : 1;
  if (state.direction !== direction) return { state: { direction, nextAt: now + 500, blocked: false }, delta: direction };
  if (now >= state.nextAt) return { state: { ...state, nextAt: now + 100 }, delta: direction };
  return { state, delta: 0 };
}
