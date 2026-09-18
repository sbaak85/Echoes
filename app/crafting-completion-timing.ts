export const CRAFT_COMPLETION = {
  firstItemMs: 1250,
  itemIntervalMs: 250,
  messageMs: 1000,
  introMs: 3800,
  // The last visible intro layer (orbit) reaches opacity 0 at 69%.
  introVisibleEndMs: 3800 * 0.69,
  burstMs: 1600,
  idleMs: 0,
  fadeMs: 500,
  burstPoolSize: 7,
} as const;

export function completionItemDelay(index: number) {
  return CRAFT_COMPLETION.firstItemMs + index * CRAFT_COMPLETION.itemIntervalMs;
}

export type CraftingAudioEvent = "craftingStarted" | "craftingAssemblyStep2" | "craftingAssemblyStep3" | "craftingItemShine" | "craftingFinished";

export function craftingCompletionAudioCues(quantity: number): { event: CraftingAudioEvent; atMs: number }[] {
  const { lastItemMs } = craftingCompletionTimeline(quantity);
  return [
    { event: "craftingStarted", atMs: 0 },
    { event: "craftingAssemblyStep2", atMs: 100 },
    { event: "craftingAssemblyStep3", atMs: 400 },
    ...Array.from({ length: quantity }, (_, index) => ({ event: "craftingItemShine" as const, atMs: completionItemDelay(index) })),
    { event: "craftingFinished", atMs: lastItemMs + 200 },
  ];
}

export function craftingCompletionTimeline(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new RangeError("Invalid completion quantity");
  const lastItemMs = completionItemDelay(quantity - 1);
  const fadeStartMs = Math.max(CRAFT_COMPLETION.introVisibleEndMs, lastItemMs + CRAFT_COMPLETION.burstMs, lastItemMs + CRAFT_COMPLETION.messageMs) + CRAFT_COMPLETION.idleMs;
  return { lastItemMs, fadeStartMs, endMs: fadeStartMs + CRAFT_COMPLETION.fadeMs };
}

// Seven reusable layers retain overlapping tails without creating an SVG per item.
export function craftingCompletionBurstSlots(quantity: number) {
  craftingCompletionTimeline(quantity);
  return Array.from({ length: Math.min(quantity, CRAFT_COMPLETION.burstPoolSize) }, (_, index) => ({
    delayMs: completionItemDelay(index),
    repeatMs: CRAFT_COMPLETION.burstPoolSize * CRAFT_COMPLETION.itemIntervalMs,
    count: Math.floor((quantity - 1 - index) / CRAFT_COMPLETION.burstPoolSize) + 1,
  }));
}
