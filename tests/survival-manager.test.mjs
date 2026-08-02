import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceSurvivalByGameMinutes,
  advanceSurvivalState,
  applySurvivalEffects,
  createInitialSurvivalState,
  createInteractionUsageState,
  ensureInteractionUsageCycle,
  formatElapsedGameHours,
  getElapsedClockHandMotion,
  getCharacterStatuses,
  getGameClock,
  getMealCurveRate,
  getUnmetSurvivalRequirements,
  getSurvivalSpeedMultiplier,
  isInteractionLocked,
  recordInteractionUse,
} from "../app/survival-manager.ts";

test("elapsed interaction time is formatted as compact game hours", () => {
  assert.equal(formatElapsedGameHours(60), "1");
  assert.equal(formatElapsedGameHours(90), "1.5");
  assert.equal(formatElapsedGameHours(480), "8");
  assert.equal(formatElapsedGameHours(Number.NaN), "0");
});

test("elapsed clock hands start at the prior time and rotate by actual elapsed minutes", () => {
  assert.deepEqual(getElapsedClockHandMotion(8 * 60 + 35, 60), {
    minuteStartDegrees: 210,
    minuteTravelDegrees: 360,
    hourStartDegrees: 257.5,
    hourTravelDegrees: 30,
  });
  assert.deepEqual(getElapsedClockHandMotion(23 * 60 + 50, 30), {
    minuteStartDegrees: 300,
    minuteTravelDegrees: 180,
    hourStartDegrees: 355,
    hourTravelDegrees: 15,
  });
});

test("one real hour advances one game day and applies the approved natural drain", () => {
  const result = advanceSurvivalState(createInitialSurvivalState(), 3600);
  assert.deepEqual(getGameClock(result.gameMinutes), { day: 2, hour: 6, minute: 0 });
  assert.ok(Math.abs(result.values.stamina - 75) < 0.01);
  assert.ok(Math.abs(result.values.hunger - 58) < 0.03);
  assert.ok(Math.abs(result.values.thirst - 52) < 0.01);
  assert.ok(Math.abs(result.values.spirit - 76) < 0.01);
});

test("meal hills peak at 08:00, 12:00 and 18:00 and vanish outside one hour", () => {
  assert.equal(getMealCurveRate(8), 10);
  assert.equal(getMealCurveRate(12), 10);
  assert.equal(getMealCurveRate(18), 10);
  assert.equal(getMealCurveRate(9), 0);
  assert.equal(getMealCurveRate(10), 0);
});

test("movement adds about fifteen stamina cost for a full day of continuous base-speed walking", () => {
  const result = advanceSurvivalState(
    createInitialSurvivalState(),
    3600,
    210 * 3600,
    210,
  );
  assert.ok(Math.abs(result.values.stamina - 60) < 0.02);
});

test("critical movement penalties multiply", () => {
  const multiplier = getSurvivalSpeedMultiplier({
    stamina: 20,
    hunger: 20,
    thirst: 20,
    spirit: 100,
  });
  assert.ok(Math.abs(multiplier - 0.6885) < 0.00001);
});

test("despair replaces discouraged and overhead statuses are capped at three", () => {
  const statuses = getCharacterStatuses({ stamina: 0, hunger: 0, thirst: 0, spirit: 0 });
  assert.equal(statuses[0].label, "絕望");
  assert.equal(statuses.some((status) => status.label === "喪氣"), false);
  assert.equal(statuses.length, 3);
});

test("interaction effects clamp values and daily usage resets at 06:00", () => {
  const changed = applySurvivalEffects(createInitialSurvivalState(), {
    stamina: -5,
    hunger: -3,
    thirst: 12,
    spirit: -2,
  });
  assert.deepEqual(changed.values, { stamina: 95, hunger: 97, thirst: 100, spirit: 98 });

  let usage = createInteractionUsageState(360);
  usage = recordInteractionUse(usage, "mine", 3);
  usage = recordInteractionUse(usage, "mine", 3);
  usage = recordInteractionUse(usage, "mine", 3);
  assert.equal(isInteractionLocked(usage, "mine", 3), true);
  usage = ensureInteractionUsageCycle(usage, 360 + 24 * 60);
  assert.equal(isInteractionLocked(usage, "mine", 3), false);
});

test("互動需求支援至少、低於與以下，舊資料預設全部成立", () => {
  const requirements = {
    stamina: { comparison: "below", value: 75 },
    spirit: { comparison: "atLeast", value: 30 },
  };
  assert.deepEqual(
    getUnmetSurvivalRequirements(
      { stamina: 74, hunger: 100, thirst: 100, spirit: 30 },
      requirements,
    ),
    [],
  );
  assert.deepEqual(
    getUnmetSurvivalRequirements(
      { stamina: 75, hunger: 100, thirst: 100, spirit: 29 },
      requirements,
    ).map(({ metric }) => metric),
    ["stamina", "spirit"],
  );
  assert.deepEqual(
    getUnmetSurvivalRequirements(
      { stamina: 99, hunger: 100, thirst: 100, spirit: 100 },
      { stamina: { comparison: "atMost", value: 99 } },
    ),
    [],
  );
});

test("互動需求可設定任一條件成立", () => {
  const requirements = {
    mode: "any",
    stamina: { comparison: "atMost", value: 99 },
    spirit: { comparison: "atMost", value: 99 },
  };
  assert.deepEqual(
    getUnmetSurvivalRequirements(
      { stamina: 99, hunger: 100, thirst: 100, spirit: 100 },
      requirements,
    ),
    [],
  );
  assert.deepEqual(
    getUnmetSurvivalRequirements(
      { stamina: 100, hunger: 100, thirst: 100, spirit: 100 },
      requirements,
    ).map(({ metric }) => metric),
    ["stamina", "spirit"],
  );
});

test("睡眠八小時會推進時鐘並套用期間內的自然消耗", () => {
  const before = createInitialSurvivalState();
  before.values.stamina = 25;
  const after = advanceSurvivalByGameMinutes(before, 8 * 60);
  assert.deepEqual(getGameClock(after.gameMinutes), { day: 1, hour: 14, minute: 0 });
  assert.ok(after.values.stamina < 25);
  assert.ok(after.values.hunger < 100);
  assert.ok(after.values.thirst < 100);
});
