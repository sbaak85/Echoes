export const STARSHIP_CRAFTING_TUTORIAL_QUEST = "QUEST_CH04_MAIN_001";
export const STARSHIP_CRAFTING_TUTORIAL_OBJECTIVE = "QUEST_CH04_MAIN_001_OBJ_17";
// The former v1 tutorial ended at recipe selection, before teaching fabrication.
export const STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG = "tutorial:starship-crafting:completed:v2";
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
  focusTarget?: string;
  allowedTargets?: readonly string[];
  /** Extra spotlight regions remain read-only and never join the input gate. */
  visualTargets?: readonly string[];
  tipPlacement?: "left";
  tipLayout?: {
    placement: "above-center" | "above-right" | "left-bottom";
    widthRatio: number;
    heightRatio: number;
    gapRatio: number;
    panel?: string;
  };
  confirmLabel?: string;
};

/** Approved tutorial copy; newline escapes are intentional manual line breaks. */
export const STARSHIP_CRAFTING_TUTORIAL_COPY = {
  1: "回到伊薩卡號可前往工作甲板，\n進行道具的製作與料理功能。",
  2: "在工作甲板區可使用「製作工作台」與\n「料理工作台」兩種功能，要製作新道具則\n選擇進入製作工作台。",
  3: "可製作物品清單會列出目前已知可製作的道具種類。\n點擊其中「螢光棒」項目的「需求素材 >」即可快速選到所需的目標素材。",
  4: "螢光包囊為製作「螢光棒」的其中一項道具，點擊即可投入素材。",
  5: "也可以點擊「自動補齊素材」按鈕\n快速的投入所有需要的素材 (已擁有的道具)。",
  6: "素材備齊後，點擊「製作準備」，\n進行製作結果的確認並可更換製作數量。",
  7: "使用 [－] [＋] 調整製作數量；可製作的上限會依背包素材計算。\n決定後點擊「確認數量」繼續。",
  8: "查看成品、數量與素材需求後，點擊「確認製作」。\n系統會扣除所需素材，並將製作完成的道具放入背包。",
  9: "道具已製作完成並放入背包中。\n之後可用相同流程製作其他道具；點擊「完成教學」恢復操作。",
} as const;

/** Tips copy and semantic targets are edited here, never by recipe row position. */
export const STARSHIP_CRAFTING_TUTORIAL_STEPS: readonly StarshipCraftingTutorialStep[] = [
  { id: "ship-menu", order: 1, target: '[data-tutorial-action="craft"]', anchor: '[data-tutorial-action="repair"]',
    label: "製作道具／食物", message: STARSHIP_CRAFTING_TUTORIAL_COPY[1], holdMs: 500, action: "craft" },
  { id: "craft-menu", order: 2, target: '[data-tutorial-action="workbench"]', anchor: '[data-tutorial-action="workbench"]',
    tipLayout: { placement: "above-center", widthRatio: .66, heightRatio: .381, gapRatio: .03 },
    label: "製作工作台", message: STARSHIP_CRAFTING_TUTORIAL_COPY[2], holdMs: 0, action: "workbench" },
  { id: "glow-stick", order: 3, target: '[data-tutorial-item-id="T0006"] .recipe-row', anchor: '[data-tutorial-item-id="T0006"] .recipe-row',
    tipLayout: { placement: "above-right", widthRatio: .833, heightRatio: .416, gapRatio: .028 },
    label: "螢光棒", message: STARSHIP_CRAFTING_TUTORIAL_COPY[3], holdMs: 0, action: "recipe:T0006" },
  { id: "glow-stick-materials", order: 3, target: '[data-craft-nav="show-materials"]', anchor: '[data-tutorial-item-id="T0006"] .recipe-row',
    tipLayout: { placement: "above-right", widthRatio: .833, heightRatio: .416, gapRatio: .028 },
    label: "需求素材", message: STARSHIP_CRAFTING_TUTORIAL_COPY[3], holdMs: 0, action: "materials:T0006" },
  { id: "first-material", order: 4, target: '[data-craft-nav="material-R0020"]', anchor: null,
    tipLayout: { placement: "above-right", widthRatio: 2.08, heightRatio: .538, gapRatio: .025 },
    label: "螢光包囊", message: STARSHIP_CRAFTING_TUTORIAL_COPY[4], holdMs: 250, action: "material:R0020" },
  { id: "auto-fill", order: 5, target: '[data-craft-nav="auto-fill"]', anchor: null, tipPlacement: "left",
    visualTargets: ['#craft-requirements .requirement'],
    tipLayout: { placement: "left-bottom", panel: ".panel.recipe", widthRatio: .588, heightRatio: .418, gapRatio: .038 },
    label: "自動補齊素材", message: STARSHIP_CRAFTING_TUTORIAL_COPY[5], holdMs: 0, action: "auto-fill" },
  { id: "prepare", order: 6, target: '[data-craft-nav="prepare"]', anchor: null,
    tipLayout: { placement: "above-right", widthRatio: 1.025, heightRatio: .516, gapRatio: .048 },
    label: "製作準備", message: STARSHIP_CRAFTING_TUTORIAL_COPY[6], holdMs: 0, action: "prepare" },
  { id: "quantity", order: 7, target: '[data-tutorial-region="quantity"]', anchor: null,
    tipLayout: { placement: "above-center", panel: ".panel.output", widthRatio: .602, heightRatio: .427, gapRatio: .067 },
    focusTarget: '[data-craft-nav="quantity-confirm"]',
    allowedTargets: ['[data-craft-nav="quantity-minus"]', '[data-craft-nav="quantity-plus"]', '[data-craft-nav="quantity-confirm"]'],
    label: "確認數量", message: STARSHIP_CRAFTING_TUTORIAL_COPY[7], holdMs: 0, action: "quantity-confirm", confirmLabel: "操作選項" },
  { id: "confirm-craft", order: 8, target: '[data-craft-nav="prepare"]', anchor: null,
    tipLayout: { placement: "above-right", widthRatio: 1.025, heightRatio: .518, gapRatio: .05 },
    label: "確認製作", message: STARSHIP_CRAFTING_TUTORIAL_COPY[8], holdMs: 0, action: "crafted:T0006" },
  { id: "craft-result", order: 9, target: '#craft-result-view', anchor: '[data-craft-nav="tutorial-finish"]', tipPlacement: "left",
    tipLayout: { placement: "left-bottom", panel: ".panel.output", widthRatio: .581, heightRatio: .46, gapRatio: .08 },
    focusTarget: '[data-craft-nav="tutorial-finish"]', allowedTargets: ['[data-craft-nav="tutorial-finish"]'],
    label: "製作完成", message: STARSHIP_CRAFTING_TUTORIAL_COPY[9], holdMs: 0, action: "tutorial-finish", confirmLabel: "完成教學" },
];

export function starshipTutorialButtonSelectors(step: StarshipCraftingTutorialStep) {
  return step.allowedTargets ?? [step.focusTarget ?? step.target];
}

/** Navigation keys are resolved from the recipe identity, never its saved row. */
export function starshipTutorialNavigationKeys(step: StarshipCraftingTutorialStep, recipeIndex: number): readonly string[] {
  if (step.id === "glow-stick") return [`recipe-${recipeIndex}`];
  return starshipTutorialButtonSelectors(step).map(selector => selector.match(/data-craft-nav="([^"]+)"/)?.[1] ?? "");
}

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
  anchor: TutorialRect | null, viewport: { width: number; height: number }, measuredHeight = 0,
  panel: TutorialRect | null = null) {
  const margin = 12;
  if (step.tipLayout) {
    // Ratios follow the annotated UI regions, including the workbench's own scale.
    // The placement anchor is separate from the spotlight/action target.
    const layout = step.tipLayout, reference = anchor ?? target;
    const width = Math.max(1, Math.min(viewport.width - margin * 2, (panel ?? reference).width * layout.widthRatio));
    const height = Math.max(1, Math.min(viewport.height - margin * 2, width * layout.heightRatio));
    const gap = width * layout.gapRatio;
    let x = layout.placement === "above-center" ? reference.left + (reference.width - width) / 2
      : layout.placement === "left-bottom" ? reference.left - width - gap : reference.right - width;
    let y = layout.placement === "left-bottom" ? reference.bottom - height : reference.top - height - gap;
    if (layout.placement === "left-bottom" && x < margin) {
      x = reference.right - width;
      y = reference.top - height - gap;
    }
    if (y < margin) y = reference.bottom + gap;
    x = Math.max(margin, Math.min(viewport.width - width - margin, x));
    y = Math.max(margin, Math.min(viewport.height - height - margin, y));
    const arrowDirection = x + width < reference.left ? "right"
      : reference.top + reference.height / 2 < y + height / 2 ? "up" : "down";
    return { x, y, width, height, arrowDirection, fitted: true } as const;
  }
  const above = !step.anchor;
  const width = Math.max(1, Math.min(viewport.width - margin * 2, above
    ? Math.max(224, Math.min(300, target.width * .56))
    : Math.max(280, Math.min(440, (anchor?.width ?? target.width) * .66))));
  const height = Math.max(above ? 94 : 112, measuredHeight);
  let x = above ? target.right - width
    : (anchor?.left ?? target.left) + ((anchor?.width ?? target.width) - width) / 2;
  let y = above ? target.top - height - 10
    : (anchor?.top ?? target.bottom + 10) + Math.max(0, ((anchor?.height ?? height) - height) / 2);
  if (above && y < margin) y = target.bottom + 10;
  if (step.tipPlacement === "left") {
    x = target.left - width - 12;
    y = target.top + (target.height - height) / 2;
    // Narrow screens use the above/below placement instead of covering the target.
    if (x < margin) { x = target.right - width; y = target.top - height - 10; if (y < margin) y = target.bottom + 10; }
  }
  x = Math.max(margin, Math.min(viewport.width - width - margin, x));
  y = Math.max(margin, Math.min(viewport.height - height - margin, y));
  const arrowDirection = x + width < target.left ? "right"
    : target.top + target.height / 2 < y + height / 2 ? "up" : "down";
  return { x, y, width, height, arrowDirection, fitted: false } as const;
}
