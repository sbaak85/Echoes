import assert from "node:assert/strict";
import test from "node:test";

import {
  getUnmetInteractionUseRequirements,
  normalizeInteractionItemReward,
  normalizeInteractionUseRequirements,
  selectInteractionDialogue,
  selectInteractionFeedbackPoint,
  shouldCompleteAfterDialogue,
} from "../app/interaction-flow.ts";

test("操作、採集與移動互動只要有腳本，都必須先完成對話再結算", () => {
  for (const type of ["dialogue", "operation", "gather", "move", "interaction"]) {
    assert.equal(
      shouldCompleteAfterDialogue({ type, dialogue: { lines: [{ text: "..." }] } }),
      true,
      type,
    );
  }
});

test("互動 Tween 優先使用互動提示點，未設定時才回到多邊形中心", () => {
  const center = { x: 100, y: 200 };
  const hint = { x: 140, y: 175 };
  assert.equal(selectInteractionFeedbackPoint(hint, center), hint);
  assert.equal(selectInteractionFeedbackPoint(undefined, center), center);
});

test("複數道具與章節需求採 AND 判定，任一不足即回報失敗", () => {
  const knownItems = new Set(["ruin-key", "transistor", "welding-tool"]);
  const requirements = normalizeInteractionUseRequirements(
    [
      { kind: "item", itemId: "ruin-key", quantity: 1 },
      { kind: "chapter", chapter: 4 },
    ],
    (itemId) => knownItems.has(itemId),
  );

  assert.deepEqual(
    getUnmetInteractionUseRequirements(requirements, { "ruin-key": 1 }, 4),
    [],
  );
  assert.deepEqual(
    getUnmetInteractionUseRequirements(requirements, {}, 3),
    [
      { kind: "item", itemId: "ruin-key", quantity: 1, actual: 0 },
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

test("互動道具獎勵只接受已登記道具、1 至 99 個與兩種發放方式", () => {
  const knownItems = new Set(["water-bottle", "metal-parts"]);
  const isKnownItem = (itemId) => knownItems.has(itemId);

  assert.deepEqual(
    normalizeInteractionItemReward(
      { itemId: "water-bottle", quantity: 3, delivery: "world" },
      isKnownItem,
    ),
    { itemId: "water-bottle", quantity: 3, delivery: "world" },
  );
  assert.deepEqual(
    normalizeInteractionItemReward(
      { itemId: "metal-parts", quantity: 200, delivery: "invalid" },
      isKnownItem,
    ),
    { itemId: "metal-parts", quantity: 99, delivery: "inventory" },
  );
  assert.equal(
    normalizeInteractionItemReward(
      { itemId: "unknown", quantity: 1, delivery: "inventory" },
      isKnownItem,
    ),
    null,
  );
});
