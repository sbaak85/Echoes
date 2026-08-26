import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSurvivalRequirementFloatRows,
  buildSurvivalRequirementFloatSegments,
  INTERACTION_REQUIREMENT_FLOAT_MOTION,
  shouldShowSurvivalRequirementFloats,
} from "../app/interaction-survival-feedback.ts";
import {
  enqueuePlayerInfoFloat,
  getPlayerInfoFloatToneColor,
  getPlayerInfoFloatTotalMs,
  getPlayerInfoFloatVisuals,
  prunePlayerInfoFloats,
} from "../app/player-info-float.ts";

const requirement = (metric, comparison, value) => ({
  metric,
  comparison,
  value,
  actual: 10,
});

test("生存值需求字幕會使用對應名稱、門檻與顏色", () => {
  const stamina = buildSurvivalRequirementFloatSegments(
    requirement("stamina", "atLeast", 60),
  );
  const hunger = buildSurvivalRequirementFloatSegments(
    requirement("hunger", "atLeast", 40),
  );

  assert.deepEqual(stamina, [
    { text: "需要：", tone: "neutral" },
    { text: "60", tone: "stamina" },
    { text: " 體力", tone: "neutral" },
  ]);
  assert.equal(hunger[1].tone, "hunger");
  assert.equal(getPlayerInfoFloatToneColor("stamina"), "#63df88");
  assert.equal(getPlayerInfoFloatToneColor("hunger"), "#f0a953");
  assert.equal(getPlayerInfoFloatToneColor("thirst"), "#59c9ed");
  assert.equal(getPlayerInfoFloatToneColor("spirit"), "#b478e6");
});

test("互動有多項生存條件不足時會逐項列出全部需求字幕", () => {
  const rows = buildSurvivalRequirementFloatRows([
    requirement("stamina", "atLeast", 60),
    requirement("hunger", "atLeast", 50),
    requirement("thirst", "atLeast", 50),
    requirement("spirit", "atLeast", 60),
  ]);

  assert.deepEqual(
    rows.map((segments) => segments.map((segment) => segment.text).join("")),
    ["需要：60 體力", "需要：50 飽足", "需要：50 飲水", "需要：60 精神"],
  );
});

test("只有純生存值失敗才顯示需求字幕", () => {
  const failures = [requirement("thirst", "atLeast", 40)];
  assert.equal(shouldShowSurvivalRequirementFloats(failures, false), true);
  assert.equal(shouldShowSurvivalRequirementFloats(failures, true), false);
  assert.equal(shouldShowSurvivalRequirementFloats([], false), false);
});

test("低於與以下門檻會顯示正確比較文字", () => {
  assert.equal(
    buildSurvivalRequirementFloatSegments(
      requirement("spirit", "below", 75),
    ).map((segment) => segment.text).join(""),
    "需要：精神低於 75",
  );
  assert.equal(
    buildSurvivalRequirementFloatSegments(
      requirement("thirst", "atMost", 20.5),
    ).map((segment) => segment.text).join(""),
    "需要：飲水不高於 20.5",
  );
});

test("需求字幕多停留 0.5 秒，且上浮距離增加 20%", () => {
  const entries = enqueuePlayerInfoFloat(
    [],
    buildSurvivalRequirementFloatSegments(
      requirement("stamina", "atLeast", 60),
    ),
    1,
    0,
  );
  const holding = getPlayerInfoFloatVisuals(
    entries,
    1000,
    24,
    INTERACTION_REQUIREMENT_FLOAT_MOTION,
  )[0];
  const nearEnd = getPlayerInfoFloatVisuals(
    entries,
    1699,
    24,
    INTERACTION_REQUIREMENT_FLOAT_MOTION,
  )[0];
  const totalMs = getPlayerInfoFloatTotalMs(
    INTERACTION_REQUIREMENT_FLOAT_MOTION,
  );

  assert.equal(totalMs, 1700);
  assert.equal(holding.opacity, 1);
  assert.ok(nearEnd.yOffset < -28);
  assert.equal(prunePlayerInfoFloats(entries, totalMs, totalMs).length, 0);
});
