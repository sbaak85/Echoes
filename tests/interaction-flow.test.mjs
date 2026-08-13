import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateInteractionStageRequirement,
  filterInteractionRequirementsByPurpose,
  getUnmetInteractionUseRequirements,
  normalizeInteractionItemReward,
  normalizeInteractionItemRewards,
  normalizeInteractionUseRequirements,
  resolveWeightedDialogueLines,
  selectInteractionDialogue,
  selectInteractionFeedbackPoint,
  selectPreferredInteractionTarget,
  shouldExposeInteraction,
  shouldCompleteAfterDialogue,
} from "../app/interaction-flow.ts";

test("任務階段需求支援本階段、永久解鎖與條件關閉", () => {
  const currentOnly = {
    kind: "questStage",
    questId: "QUEST_CH03_MAIN_001",
    stageId: "QUEST_CH03_MAIN_001_STAGE_02",
    stageMode: "CurrentStageOnly",
  };
  assert.equal(
    evaluateInteractionStageRequirement(
      currentOnly,
      (_questId, stageId) => stageId.endsWith("STAGE_02"),
      () => false,
    ),
    true,
  );
  assert.equal(
    evaluateInteractionStageRequirement(
      currentOnly,
      () => false,
      () => true,
    ),
    false,
  );

  const unlockFromStage = { ...currentOnly, stageMode: "UnlockFromStage" };
  assert.equal(
    evaluateInteractionStageRequirement(
      unlockFromStage,
      () => false,
      (questId) => questId === "QUEST_CH03_MAIN_001",
    ),
    true,
  );

  const untilCondition = {
    ...currentOnly,
    stageMode: "UnlockUntilCondition",
    disableQuestId: "QUEST_CH03_MAIN_002",
    disableStageId: "QUEST_CH03_MAIN_002_STAGE_01",
  };
  assert.equal(
    evaluateInteractionStageRequirement(
      untilCondition,
      () => false,
      (questId) => questId === "QUEST_CH03_MAIN_001",
    ),
    true,
  );
  assert.equal(
    evaluateInteractionStageRequirement(
      untilCondition,
      () => false,
      () => true,
    ),
    false,
  );
});

test("use requirement failures hide by default but can remain visible and attemptable", () => {
  assert.equal(shouldExposeInteraction(false), true);
  assert.equal(shouldExposeInteraction(true), false);
  assert.equal(shouldExposeInteraction(true, true), true);
});

test("interaction requirements can independently control prompt visibility and success", () => {
  const requirements = normalizeInteractionUseRequirements(
    [
      {
        kind: "questStage",
        questId: "QUEST_CH03_MAIN_002",
        stageId: "QUEST_CH03_MAIN_002_STAGE_01",
        stageMode: "CurrentStageOnly",
      },
      {
        kind: "item",
        itemId: "rope",
        quantity: 1,
        scope: "interaction",
      },
      {
        kind: "chapter",
        chapter: 3,
        scope: "prompt",
      },
    ],
    (itemId) => itemId === "rope" ? "R0008" : null,
  );

  assert.deepEqual(
    filterInteractionRequirementsByPurpose(requirements, "prompt"),
    [
      {
        kind: "questStage",
        questId: "QUEST_CH03_MAIN_002",
        stageId: "QUEST_CH03_MAIN_002_STAGE_01",
        stageMode: "CurrentStageOnly",
      },
      { kind: "chapter", chapter: 3, scope: "prompt" },
    ],
  );
  assert.deepEqual(
    filterInteractionRequirementsByPurpose(requirements, "interaction"),
    [
      {
        kind: "questStage",
        questId: "QUEST_CH03_MAIN_002",
        stageId: "QUEST_CH03_MAIN_002_STAGE_01",
        stageMode: "CurrentStageOnly",
      },
      { kind: "item", itemId: "R0008", quantity: 1, scope: "interaction" },
    ],
  );
});

test("quest requirements only pass while the quest is active", () => {
  const requirements = normalizeInteractionUseRequirements(
    [{ kind: "quest", questId: " QUEST_CH03_001 " }],
    () => null,
  );

  assert.deepEqual(requirements, [
    { kind: "quest", questId: "QUEST_CH03_001" },
  ]);
  assert.deepEqual(
    getUnmetInteractionUseRequirements(
      requirements,
      {},
      3,
      (questId) => questId === "QUEST_CH03_001",
    ),
    [],
  );
  assert.deepEqual(
    getUnmetInteractionUseRequirements(requirements, {}, 3, () => false),
    [{ kind: "quest", questId: "QUEST_CH03_001", actual: 0 }],
  );
});

test("camp-power requirements require at least the configured power value", () => {
  const requirements = normalizeInteractionUseRequirements(
    [{ kind: "campPower", minimumPower: 7 }],
    () => null,
  );

  assert.deepEqual(requirements, [
    { kind: "campPower", minimumPower: 7 },
  ]);
  assert.deepEqual(
    getUnmetInteractionUseRequirements(
      requirements,
      {},
      3,
      () => false,
      () => false,
      () => false,
      7,
    ),
    [],
  );
  assert.deepEqual(
    getUnmetInteractionUseRequirements(
      requirements,
      {},
      3,
      () => false,
      () => false,
      () => false,
      6,
    ),
    [{ kind: "campPower", minimumPower: 7, actual: 6 }],
  );
});

test("quest-state requirements preserve completed state and evaluate once on demand", () => {
  const requirements = normalizeInteractionUseRequirements(
    [{
      kind: "questState",
      questId: " QUEST_CH03_MAIN_001 ",
      questState: "completed",
    }],
    () => null,
  );

  assert.deepEqual(requirements, [{
    kind: "questState",
    questId: "QUEST_CH03_MAIN_001",
    questState: "completed",
  }]);
  assert.deepEqual(
    getUnmetInteractionUseRequirements(
      requirements,
      {},
      3,
      () => false,
      () => false,
      (questId, state) =>
        questId === "QUEST_CH03_MAIN_001" && state === "completed",
    ),
    [],
  );
});

test("multiple interaction rewards normalize independently and support legacy data", () => {
  const itemIds = new Map([
    ["ration", "R0003"],
    ["water", "R0004"],
  ]);
  const resolveItemId = (itemId) => itemIds.get(itemId) ?? null;

  assert.deepEqual(
    normalizeInteractionItemRewards(
      [
        { itemId: "ration", quantity: 2, delivery: "inventory" },
        { itemId: "water", quantity: 2, delivery: "world" },
      ],
      null,
      resolveItemId,
    ),
    [
      { itemId: "R0003", quantity: 2, delivery: "inventory" },
      { itemId: "R0004", quantity: 2, delivery: "world" },
    ],
  );
  assert.deepEqual(
    normalizeInteractionItemRewards(
      undefined,
      { itemId: "water", quantity: 1, delivery: "inventory" },
      resolveItemId,
    ),
    [{ itemId: "R0004", quantity: 1, delivery: "inventory" }],
  );
});

test("角色或游標同時接觸互動多邊形與道具時，優先選擇可拾取道具", () => {
  const fruitTree = { id: "fruit-tree", type: "gather" };
  const spawnedFruit = { id: "spawned-fruit", type: "pickup" };

  assert.equal(
    selectPreferredInteractionTarget([fruitTree, spawnedFruit]),
    spawnedFruit,
  );
  assert.equal(selectPreferredInteractionTarget([fruitTree]), fruitTree);
  assert.equal(selectPreferredInteractionTarget([]), null);
});

test("抽選群組會依權重只保留一句，未填權重時預設為 1", () => {
  const lines = [
    { speaker: "Sbaak", text: "固定開場。" },
    { speaker: "Echo", text: "常見句。", randomGroupId: "greeting", weight: 3 },
    { speaker: "Echo", text: "稀有句。", randomGroupId: "GREETING" },
    { speaker: "Sbaak", text: "固定結尾。" },
  ];

  assert.deepEqual(
    resolveWeightedDialogueLines(lines, () => 0.1).map((line) => line.text),
    ["固定開場。", "常見句。", "固定結尾。"],
  );
  assert.deepEqual(
    resolveWeightedDialogueLines(lines, () => 0.99).map((line) => line.text),
    ["固定開場。", "稀有句。", "固定結尾。"],
  );
});

test("跨行抽選群組以最先出現的位置播放，並按 1:3:6 權重分段抽選", () => {
  const lines = [
    { text: "群組第一句", randomGroupId: "random-group-1", weight: 1 },
    { text: "固定句" },
    { text: "群組第二句", randomGroupId: "random-group-1", weight: 3 },
    { text: "群組第三句", randomGroupId: "random-group-1", weight: 6 },
  ];

  assert.deepEqual(
    resolveWeightedDialogueLines(lines, () => 0).map((line) => line.text),
    ["群組第一句", "固定句"],
  );
  assert.deepEqual(
    resolveWeightedDialogueLines(lines, () => 0.11).map((line) => line.text),
    ["群組第二句", "固定句"],
  );
  assert.deepEqual(
    resolveWeightedDialogueLines(lines, () => 0.5).map((line) => line.text),
    ["群組第三句", "固定句"],
  );
});

test("只有一個成員的舊群組資料仍按普通句子播放", () => {
  const line = {
    speaker: "Sbaak",
    text: "不要遺失我。",
    randomGroupId: "orphan-group",
    weight: 8,
  };
  assert.deepEqual(resolveWeightedDialogueLines([line], () => 0.5), [line]);
});

test("操作、採集與移動互動只要有腳本，都必須先完成對話再結算", () => {
  for (const type of ["dialogue", "operation", "gather", "move", "interaction"]) {
    assert.equal(
      shouldCompleteAfterDialogue({ type, dialogue: { lines: [{ text: "..." }] } }),
      true,
      type,
    );
  }
});

test("互動可選擇略過成功腳本並直接結算，失敗腳本不受影響", () => {
  const success = { lines: [{ speaker: "Sbaak", text: "開始操作。" }] };
  const failure = { lines: [{ speaker: "Echo", text: "目前無法使用。" }] };
  const interactable = {
    type: "operation",
    skipSuccessDialogue: true,
    dialogue: success,
    failureDialogue: failure,
  };

  assert.equal(shouldCompleteAfterDialogue(interactable), false);
  assert.equal(selectInteractionDialogue(interactable, "success"), null);
  assert.equal(selectInteractionDialogue(interactable, "failure"), failure);
});

test("互動 Tween 優先使用互動提示點，未設定時才回到多邊形中心", () => {
  const center = { x: 100, y: 200 };
  const hint = { x: 140, y: 175 };
  assert.equal(selectInteractionFeedbackPoint(hint, center), hint);
  assert.equal(selectInteractionFeedbackPoint(undefined, center), center);
});

test("複數道具與章節需求採 AND 判定，任一不足即回報失敗", () => {
  const itemIds = new Map([
    ["ruin-key", "Q0004"],
    ["transistor", "R0011"],
    ["welding-tool", "T0007"],
  ]);
  const requirements = normalizeInteractionUseRequirements(
    [
      { kind: "item", itemId: "ruin-key", quantity: 1 },
      { kind: "chapter", chapter: 4 },
    ],
    (itemId) => itemIds.get(itemId) ?? null,
  );

  assert.deepEqual(
    getUnmetInteractionUseRequirements(requirements, { Q0004: 1 }, 4),
    [],
  );
  assert.deepEqual(
    getUnmetInteractionUseRequirements(requirements, {}, 3),
    [
      { kind: "item", itemId: "Q0004", quantity: 1, actual: 0 },
      { kind: "chapter", chapter: 4, actual: 3 },
    ],
  );
});

test("拾取物與沒有對話腳本的互動維持立即完成", () => {
  assert.equal(
    shouldCompleteAfterDialogue({ type: "pickup", dialogue: { lines: [] } }),
    false,
  );
  assert.equal(shouldCompleteAfterDialogue({ type: "operation" }), false);
});

test("互動失敗會使用獨立失敗腳本，舊場景則取得安全預設文字", () => {
  const success = { lines: [{ speaker: "Sbaak", text: "開始操作。" }] };
  const failure = { lines: [{ speaker: "Echo", text: "條件還不夠。" }] };
  const interactable = { dialogue: success, failureDialogue: failure };

  assert.equal(selectInteractionDialogue(interactable, "success"), success);
  assert.equal(selectInteractionDialogue(interactable, "failure"), failure);
  assert.deepEqual(
    selectInteractionDialogue({ dialogue: success }, "failure")?.lines,
    [{ speaker: "Sbaak", text: "目前無法使用。" }],
  );
});

test("互動完成後只播放明確設定且含有效句子的第三套腳本", () => {
  const completion = {
    characterDelaySeconds: 0.02,
    lines: [{ speaker: "Sbaak", text: "總算完成了。" }],
  };
  assert.equal(
    selectInteractionDialogue({ completionDialogue: completion }, "completion"),
    completion,
  );
  assert.equal(selectInteractionDialogue({}, "completion"), null);
  assert.equal(
    selectInteractionDialogue(
      { completionDialogue: { lines: [{ text: "   " }] } },
      "completion",
    ),
    null,
  );
});

test("互動道具獎勵只接受已登記道具、1 至 99 個與兩種發放方式", () => {
  const itemIds = new Map([
    ["water-bottle", "R0004"],
    ["metal-parts", "R0002"],
  ]);
  const resolveItemId = (itemId) => itemIds.get(itemId) ?? null;

  assert.deepEqual(
    normalizeInteractionItemReward(
      { itemId: "water-bottle", quantity: 3, delivery: "world" },
      resolveItemId,
    ),
    { itemId: "R0004", quantity: 3, delivery: "world" },
  );
  assert.deepEqual(
    normalizeInteractionItemReward(
      { itemId: "metal-parts", quantity: 200, delivery: "invalid" },
      resolveItemId,
    ),
    { itemId: "R0002", quantity: 99, delivery: "inventory" },
  );
  assert.equal(
    normalizeInteractionItemReward(
      { itemId: "unknown", quantity: 1, delivery: "inventory" },
      resolveItemId,
    ),
    null,
  );
});
