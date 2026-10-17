import { evaluate } from "../public/minigames/bus-card/model.mjs";

export const BUS_CARD_INTERACTION_ID = "shipinterior-interaction-008";
export const BUS_CARD_OBJECTIVE_ID = "QUEST_CH02_MAIN_001_OBJ_03";

/** Validate the actual three-card route, not an unqualified 'success' message. */
export function isBusCardSolution(slots: unknown): boolean {
  if (!Array.isArray(slots) || slots.length !== 4 ||
      slots.some(card => card !== null && !["A", "B", "C"].includes(card))) return false;
  const cards = slots.filter(card => card !== null);
  return cards.length === 3 && new Set(cards).size === 3 && evaluate(slots).complete;
}
