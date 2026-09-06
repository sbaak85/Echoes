export const SCENE6_INVESTIGATION_DIALOGUE = "chapter04-section-2";
export const SCENE6_INVESTIGATION_COMPLETED = "scene6-investigation:section-2-completed";
export const SCENE6_INVESTIGATION_FOURTH_DIALOGUE = "chapter04-section-3";
export const SCENE6_INVESTIGATION_FOURTH_COMPLETED = "scene6-investigation:section-3-completed";

const investigationIds = Array.from(
  { length: 8 },
  (_, i) => `scene6-interaction-${String(i + 1).padStart(3, "0")}`,
);
const flag = (id: string) => `scene6-investigation:${id}`;

const milestones = [
  {
    requiredCount: 2,
    delayMilliseconds: 1250,
    dialogueId: SCENE6_INVESTIGATION_DIALOGUE,
    completionId: SCENE6_INVESTIGATION_COMPLETED,
  },
  {
    requiredCount: 4,
    delayMilliseconds: 1500,
    dialogueId: SCENE6_INVESTIGATION_FOURTH_DIALOGUE,
    completionId: SCENE6_INVESTIGATION_FOURTH_COMPLETED,
  },
] as const;

type Scene6InvestigationHost = {
  isTargetStage: () => boolean;
  getFlags: () => Record<string, boolean>;
  setFlag: (id: string, value: boolean) => void;
  isCompleted: (completionId: string) => boolean;
  markCompleted: (completionId: string) => void;
  play: (dialogueId: string) => Promise<{ completed: boolean }>;
  sleep?: (milliseconds: number) => Promise<void>;
};

/** Counts successful distinct sites using the existing saved story progress. */
export function createScene6InvestigationStory(host: Scene6InvestigationHost) {
  const sleep = host.sleep ?? ((milliseconds: number) =>
    new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  let pending = false;

  const completedInteractionCount = () => investigationIds.reduce(
    (count, id) => count + Number(host.getFlags()[flag(id)] === true),
    0,
  );

  return async (interactionId?: string) => {
    if (!host.isTargetStage()) return;
    if (interactionId) {
      if (!investigationIds.includes(interactionId)) return;
      host.setFlag(flag(interactionId), true);
    }
    if (pending) return;

    pending = true;
    try {
      for (const milestone of milestones) {
        if (!host.isTargetStage()) break;
        if (host.isCompleted(milestone.completionId)) continue;
        if (completedInteractionCount() < milestone.requiredCount) break;

        await sleep(milestone.delayMilliseconds);
        if (!host.isTargetStage() || host.isCompleted(milestone.completionId) ||
            completedInteractionCount() < milestone.requiredCount) continue;

        const result = await host.play(milestone.dialogueId);
        if (!result.completed) break;
        host.markCompleted(milestone.completionId);
      }
    } finally {
      pending = false;
    }
  };
}
