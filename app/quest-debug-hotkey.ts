export const QUEST_SKIP_LONG_PRESS_MS = 500;

export type QuestSkipKeyController = {
  begin(): boolean;
  release(): "stage-next" | "quest-next" | null;
  cancel(): void;
  isHolding(): boolean;
};

export function createQuestSkipKeyController(options: {
  canTrigger: () => boolean;
  onStageNext: () => void;
  onQuestNext: () => void;
  setTimer: (callback: () => void, delayMs: number) => number;
  clearTimer: (timerId: number) => void;
}): QuestSkipKeyController {
  let hold: { timerId: number; longPressTriggered: boolean } | null = null;

  const cancel = () => {
    if (!hold) return;
    options.clearTimer(hold.timerId);
    hold = null;
  };

  return {
    begin() {
      if (hold || !options.canTrigger()) return false;
      const nextHold = { timerId: 0, longPressTriggered: false };
      nextHold.timerId = options.setTimer(() => {
        if (hold !== nextHold) return;
        if (!options.canTrigger()) {
          hold = null;
          return;
        }
        nextHold.longPressTriggered = true;
        options.onQuestNext();
      }, QUEST_SKIP_LONG_PRESS_MS);
      hold = nextHold;
      return true;
    },
    release() {
      if (!hold) return null;
      const releasedHold = hold;
      options.clearTimer(releasedHold.timerId);
      hold = null;
      if (releasedHold.longPressTriggered) return "quest-next";
      if (!options.canTrigger()) return null;
      options.onStageNext();
      return "stage-next";
    },
    cancel,
    isHolding() {
      return hold !== null;
    },
  };
}
