export type NewPlayerTutorialStepId =
  | "quest"
  | "survival"
  | "hotbar"
  | "minimap";

export type NewPlayerTutorialHintPlacement =
  | "left"
  | "right"
  | "above";

export type NewPlayerTutorialSpotlightShape = "rectangle" | "circle";

export type NewPlayerTutorialStep = {
  id: NewPlayerTutorialStepId;
  order: 1 | 2 | 3 | 4;
  targetSelector: string;
  spotlightPadding: number;
  spotlightShape: NewPlayerTutorialSpotlightShape;
  hintPlacement: NewPlayerTutorialHintPlacement;
  message: string;
  actionLabel: "繼續" | "結束";
};

/**
 * 2026-08-27 新手指引示意圖的四個固定步驟。
 * 四個步驟依序共用同一套阻擋遮罩與輸入流程。
 */
export const NEW_PLAYER_TUTORIAL_STEPS: readonly NewPlayerTutorialStep[] = [
  {
    id: "quest",
    order: 1,
    targetSelector: ".quest-hud",
    spotlightPadding: 3,
    spotlightShape: "rectangle",
    hintPlacement: "left",
    message:
      "當主要故事推動時，可經由此任務提示介面\n了解當前應該進行的事項。",
    actionLabel: "繼續",
  },
  {
    id: "survival",
    order: 2,
    targetSelector: ".survival-hud",
    spotlightPadding: 3,
    spotlightShape: "rectangle",
    hintPlacement: "right",
    message:
      "想在異星生存必須隨時注意身體狀況，\n關注生存計量介面以滿足身體機能所需。",
    actionLabel: "繼續",
  },
  {
    id: "hotbar",
    order: 3,
    targetSelector: ".hotbar-slots",
    spotlightPadding: 4,
    spotlightShape: "rectangle",
    hintPlacement: "above",
    message:
      "可以將背包中的東西加入快捷使用介面，\n在此按下 [Y] 即可快速使用該道具。",
    actionLabel: "繼續",
  },
  {
    id: "minimap",
    order: 4,
    targetSelector: ".minimap-hud",
    spotlightPadding: 3,
    spotlightShape: "circle",
    hintPlacement: "left",
    message:
      "可以透過小地圖介面了解活動區域地形，\n若出現重要道具會以光點標示位置。",
    actionLabel: "結束",
  },
];

export function getNewPlayerTutorialStep(id: NewPlayerTutorialStepId) {
  const step = NEW_PLAYER_TUTORIAL_STEPS.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Unknown new-player tutorial step: ${id}`);
  return step;
}

export function getNextNewPlayerTutorialStep(id: NewPlayerTutorialStepId) {
  const index = NEW_PLAYER_TUTORIAL_STEPS.findIndex(
    (candidate) => candidate.id === id,
  );
  return index >= 0 ? NEW_PLAYER_TUTORIAL_STEPS[index + 1] ?? null : null;
}

export function getNewPlayerTutorialOperationHint(
  stepId: NewPlayerTutorialStepId,
  targetCollapsed = false,
) {
  if (stepId === "quest") {
    return `按 [RB] ${targetCollapsed ? "展開" : "收折"}介面`;
  }
  if (stepId === "survival") {
    return `按 [LB] ${targetCollapsed ? "展開" : "收折"}介面`;
  }
  if (stepId === "hotbar") {
    return "按 [◀] [▶] 切換選取道具";
  }
  return `按 [M] ${targetCollapsed ? "展開" : "收折"}介面`;
}
