import type { CraftingResult } from "./crafting-recipes.ts";
import type { QuestRuntimeManager } from "./quest-runtime-manager.ts";
import type { StoryProgress } from "./story-progress.ts";
import { STARSHIP_CRAFTING_TUTORIAL_QUEST, STARSHIP_CRAFTING_TUTORIAL_RECIPE } from "./starship-crafting-tutorial.ts";
import { STARSHIP_CRAFTING_QUANTITY_OBJECTIVE, publishSuccessfulCraftQuestProgress } from "./starship-crafting-quest-flow.ts";

export const STARSHIP_CRAFTING_RETURN_DIALOGUE = "chapter04-section-8";
export const STARSHIP_CRAFTING_RETURN_PENDING_FLAG = "story:chapter04-section-8:crafting-return-pending";
export const STARSHIP_CRAFTING_RETURN_DELAY_MS = 500;

/** Arm only when a real successful craft completes the active two-stick objective. */
export function publishStarshipCraftWithReturnDialogue(
  manager: QuestRuntimeManager,
  result: CraftingResult,
  transactionId: string,
  story: StoryProgress,
): StoryProgress {
  const wasCounting = manager.isObjectiveInProgress(STARSHIP_CRAFTING_TUTORIAL_QUEST, STARSHIP_CRAFTING_QUANTITY_OBJECTIVE);
  const published = publishSuccessfulCraftQuestProgress(manager, result, transactionId);
  if (!published || !result.ok || result.itemId !== STARSHIP_CRAFTING_TUTORIAL_RECIPE || !wasCounting ||
      !manager.getObjectiveProgress(STARSHIP_CRAFTING_TUTORIAL_QUEST, STARSHIP_CRAFTING_QUANTITY_OBJECTIVE).completed ||
      manager.hasDialogueCompleted(STARSHIP_CRAFTING_RETURN_DIALOGUE) ||
      story.completedEventIds.includes(STARSHIP_CRAFTING_RETURN_DIALOGUE) || isStarshipCraftingReturnPending(story)) return story;
  return { ...story, storyFlags: { ...story.storyFlags, [STARSHIP_CRAFTING_RETURN_PENDING_FLAG]: true } };
}

export function isStarshipCraftingReturnPending(story: StoryProgress) {
  return story.storyFlags[STARSHIP_CRAFTING_RETURN_PENDING_FLAG] === true &&
    !story.completedEventIds.includes(STARSHIP_CRAFTING_RETURN_DIALOGUE);
}

/** Called by the shared dialogue completion listener, never at dialogue start. */
export function completeStarshipCraftingReturnDialogue(story: StoryProgress): StoryProgress {
  if (story.completedEventIds.includes(STARSHIP_CRAFTING_RETURN_DIALOGUE) &&
      story.storyFlags[STARSHIP_CRAFTING_RETURN_PENDING_FLAG] !== true) return story;
  return {
    ...story,
    completedEventIds: [...new Set([...story.completedEventIds, STARSHIP_CRAFTING_RETURN_DIALOGUE])],
    storyFlags: { ...story.storyFlags, [STARSHIP_CRAFTING_RETURN_PENDING_FLAG]: false },
  };
}

type ReturnDialogueHost = {
  isPending: () => boolean;
  isMenuOpen: () => boolean;
  isSceneAvailable: () => boolean;
  playDialogue: () => Promise<{ completed: boolean }>;
  setTimer: (callback: () => void, delayMs: number) => number;
  clearTimer: (timerId: number) => void;
};

/** The outer menu stays open throughout its nested crafting screens. */
export function createStarshipCraftingReturnDialogueController(host: ReturnDialogueHost) {
  let timer: number | null = null;
  let playing = false;
  let disposed = false;
  let retryAfterNextExit = false;
  let sequence = 0;
  const cancelTimer = () => {
    sequence += 1;
    if (timer !== null) host.clearTimer(timer);
    timer = null;
  };
  const reconcile = () => {
    if (disposed) return;
    if (host.isMenuOpen()) retryAfterNextExit = false;
    if (!host.isPending() || host.isMenuOpen() || !host.isSceneAvailable() || playing || retryAfterNextExit) {
      if (timer !== null) cancelTimer();
      return;
    }
    if (timer !== null) return;
    const scheduledSequence = ++sequence;
    timer = host.setTimer(() => {
      if (disposed || scheduledSequence !== sequence) return;
      timer = null;
      // Recheck current refs at expiry; reopening a UI must never enqueue a dialogue behind it.
      if (!host.isPending() || host.isMenuOpen() || !host.isSceneAvailable()) return;
      playing = true;
      void (async () => {
        try {
          const result = await host.playDialogue();
          retryAfterNextExit = !result.completed;
        } catch {
          // Keep the persistent pending flag. Retry on a later return rather than every frame.
          retryAfterNextExit = true;
        } finally {
          playing = false;
        }
      })();
    }, STARSHIP_CRAFTING_RETURN_DELAY_MS);
  };
  return {
    reconcile,
    dispose() { disposed = true; cancelTimer(); },
  };
}
