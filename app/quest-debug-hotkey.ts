export type QuestSkipKeyController = {
  begin(): boolean;
  release(): "stage-next" | null;
  cancel(): void;
  isHolding(): boolean;
};

export function createQuestSkipKeyController(options: {
  canTrigger: () => boolean;
  onStageNext: () => void;
}): QuestSkipKeyController {
  let holding = false;

  const cancel = () => {
    holding = false;
  };

  return {
    begin() {
      if (holding || !options.canTrigger()) return false;
      holding = true;
      return true;
    },
    release() {
      if (!holding) return null;
      holding = false;
      if (!options.canTrigger()) return null;
      options.onStageNext();
      return "stage-next";
    },
    cancel,
    isHolding() {
      return holding;
    },
  };
}
