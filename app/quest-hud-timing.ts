import type { QuestObjectiveRuntime } from "./quest-runtime-manager";

export function isQuestObjectiveVisible(progress: QuestObjectiveRuntime | undefined, now: number): boolean {
  if (!progress) return false;
  const unlocked = progress.state === "active" || progress.state === "completed" ||
    (progress.state == null && progress.unlocked !== false);
  return unlocked && (progress.availableAtEpochMs ?? 0) <= now &&
    (progress.startPresentationAvailableAtEpochMs ?? 0) <= now;
}

export function isQuestObjectiveCheckmarkVisible(progress: QuestObjectiveRuntime | undefined, delaySeconds: number | undefined, now: number): boolean {
  if (!progress?.completed || progress.completionPresented === false) return false;
  // Legacy saves already presented their completed objectives.
  if (progress.completionAvailableAtEpochMs == null) return true;
  const delay = Number.isFinite(delaySeconds) ? Math.max(0, Number(delaySeconds)) * 1000 : 0;
  return progress.completionAvailableAtEpochMs + delay <= now;
}
