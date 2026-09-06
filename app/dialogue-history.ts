import type { InteractionDialogueLine } from "./interaction-flow";

export type DialogueHistoryEntry = {
  lineId: string;
  speaker: string;
  text: string;
};

export type DialogueHistoryView = {
  dialogueId: string;
  entries: DialogueHistoryEntry[];
};

const DIALOGUE_HISTORY_RIGHT_STICK_DEAD_ZONE = 0.18;
const DIALOGUE_HISTORY_SCROLL_SPEED = 420;

/** Script line index, not a wrapped page or the typewriter's character count. */
export function canOpenDialogueHistory(currentLineIndex: number, lineCount: number): boolean {
  return Number.isInteger(currentLineIndex) && currentLineIndex > 0 && currentLineIndex < lineCount;
}

export function hasDialogueHistoryRightStickInput(rightStickY: number): boolean {
  return Math.abs(rightStickY) >= DIALOGUE_HISTORY_RIGHT_STICK_DEAD_ZONE;
}

export function hasDialogueHistoryScrollbar(
  scrollHeight: number,
  clientHeight: number,
): boolean {
  return scrollHeight > clientHeight;
}

export function getDialogueHistoryRightStickScrollDelta(
  rightStickY: number,
  deltaTime: number,
): number {
  if (!hasDialogueHistoryRightStickInput(rightStickY)) return 0;
  return rightStickY * DIALOGUE_HISTORY_SCROLL_SPEED * Math.max(0, deltaTime);
}

/**
 * Build the review list from the resolved lines owned by one active dialogue.
 * The current line is intentionally excluded: the review only contains lines
 * that the player has already advanced past.
 */
export function buildDialogueHistoryView(
  dialogueId: string,
  lines: readonly InteractionDialogueLine[],
  currentLineIndex: number,
): DialogueHistoryView {
  const exclusiveEnd = Math.max(0, Math.min(lines.length, currentLineIndex));
  return {
    dialogueId,
    entries: lines.slice(0, exclusiveEnd).map((line, index) => ({
      lineId: line.lineId?.trim() || `${dialogueId}:history:${index}`,
      speaker: line.speaker?.trim() ?? "",
      text: line.text.trim(),
    })),
  };
}
