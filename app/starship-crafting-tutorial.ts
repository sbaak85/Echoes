export const STARSHIP_CRAFTING_TUTORIAL_QUEST = "QUEST_CH04_MAIN_001";
export const STARSHIP_CRAFTING_TUTORIAL_OBJECTIVE = "QUEST_CH04_MAIN_001_OBJ_17";
export const STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG = "tutorial:starship-crafting:completed:v1";
export const STARSHIP_CRAFTING_TUTORIAL_RECIPE = "T0006";
// One common visual contract for every step, including future additions.
export const STARSHIP_CRAFTING_TUTORIAL_VISUALS = { blackOpacity: .7, holeBlurPx: 6, fadeMs: 250 } as const;

export type StarshipCraftingTutorialStep = {
  id: string;
  order: number;
  target: string;
  anchor: string | null;
  label: string;
  message: string;
  holdMs: number;
  action: string;
};

/** Tips copy and semantic targets are edited here, never by recipe row position. */
export const STARSHIP_CRAFTING_TUTORIAL_STEPS: readonly StarshipCraftingTutorialStep[] = [
  { id: "ship-menu", order: 1, target: '[data-tutorial-action="craft"]', anchor: '[data-tutorial-action="repair"]',
    label: "製作道具／食物", message: "經由工作艙可以製作新的道具或料理食物。", holdMs: 500, action: "craft" },
  { id: "craft-menu", order: 2, target: '[data-tutorial-action="workbench"]', anchor: '[data-tutorial-action="cooking"]',
    label: "製作工作台", message: "暫時留空，我等會再補", holdMs: 0, action: "workbench" },
  { id: "glow-stick", order: 3, target: '[data-tutorial-item-id="T0006"] .recipe-row', anchor: null,
    label: "螢光棒", message: "暫時留空，我等會再補", holdMs: 0, action: "recipe:T0006" },
];

export function shouldStartStarshipCraftingTutorial(
  manager: { isObjectiveInProgress: (questId: string, objectiveId: string) => boolean } | null,
  flags: Record<string, boolean>,
) {
  return flags[STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG] !== true &&
    !!manager?.isObjectiveInProgress(STARSHIP_CRAFTING_TUTORIAL_QUEST, STARSHIP_CRAFTING_TUTORIAL_OBJECTIVE);
}

export function advanceStarshipCraftingTutorial(step: StarshipCraftingTutorialStep, action: string) {
  if (step.action !== action) return step;
  const index = STARSHIP_CRAFTING_TUTORIAL_STEPS.findIndex(candidate => candidate.id === step.id);
  return index < 0 ? step : STARSHIP_CRAFTING_TUTORIAL_STEPS[index + 1] ?? null;
}

export type TutorialRect = { x: number; y: number; left: number; right: number; top: number; bottom: number; width: number; height: number };
export function positionStarshipCraftingTip(step: StarshipCraftingTutorialStep, target: TutorialRect,
  anchor: TutorialRect | null, viewport: { width: number; height: number }) {
  const margin = 12;
  const above = !step.anchor;
  const width = Math.max(1, Math.min(viewport.width - margin * 2, above
    ? Math.max(224, Math.min(300, target.width * .56))
    : Math.max(280, Math.min(440, (anchor?.width ?? target.width) * .66))));
  const height = above ? 94 : 112;
  let x = above ? target.right - width
    : (anchor?.left ?? target.left) + ((anchor?.width ?? target.width) - width) / 2;
  let y = above ? target.top - height - 10
    : (anchor?.top ?? target.bottom + 10) + Math.max(0, ((anchor?.height ?? height) - height) / 2);
  if (above && y < margin) y = target.bottom + 10;
  x = Math.max(margin, Math.min(viewport.width - width - margin, x));
  y = Math.max(margin, Math.min(viewport.height - height - margin, y));
  const arrowDirection = target.top + target.height / 2 < y + height / 2 ? "up" : "down";
  return { x, y, width, height, arrowDirection } as const;
}
