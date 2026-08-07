import assert from "node:assert/strict";
import test from "node:test";

import {
  DAY_NIGHT_EFFECT_STORAGE_KEY,
  getDayNightCssVariables,
  getDayNightVisual,
  isDebugTimeCommand,
  loadDayNightEffectEnabled,
  parseDebugTimeCommand,
  saveDayNightEffectEnabled,
  setSurvivalTimeOfDay,
} from "../app/day-night-manager.ts";
import {
  advanceSurvivalByGameMinutes,
  createInitialSurvivalState,
  getGameClock,
} from "../app/survival-manager.ts";

test("日夜遮罩在白天接近透明，夜晚加深並保留垂直漸層", () => {
  const noon = getDayNightVisual(12 * 60);
  const night = getDayNightVisual(20 * 60);

  assert.notEqual(night.top, night.middle);
  assert.notEqual(night.middle, night.bottom);
  assert.ok(night.vignetteAlpha > noon.vignetteAlpha);
  assert.match(noon.top, /^rgba\(/);
});

test("日夜曲線跨午夜連續，並輸出全部遮罩 CSS 參數", () => {
  assert.deepEqual(getDayNightVisual(0), getDayNightVisual(24 * 60));
  assert.deepEqual(Object.keys(getDayNightCssVariables(6 * 60)).sort(), [
    "--day-night-bottom",
    "--day-night-glow",
    "--day-night-glow-x",
    "--day-night-glow-y",
    "--day-night-middle",
    "--day-night-top",
    "--day-night-vignette",
  ]);
});

test("日夜遮罩預設關閉，玩家手動開關後可保存選擇", () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  assert.equal(loadDayNightEffectEnabled(storage), false);
  saveDayNightEffectEnabled(true, storage);
  assert.equal(values.get(DAY_NIGHT_EFFECT_STORAGE_KEY), "enabled");
  assert.equal(loadDayNightEffectEnabled(storage), true);
  saveDayNightEffectEnabled(false, storage);
  assert.equal(loadDayNightEffectEnabled(storage), false);
});

test("Time HHMM 指令不分大小寫並拒絕不存在的時間", () => {
  assert.deepEqual(parseDebugTimeCommand("Time 2000"), {
    hour: 20,
    minute: 0,
    minuteOfDay: 1200,
    label: "20:00",
  });
  assert.equal(parseDebugTimeCommand("time 0635")?.label, "06:35");
  assert.equal(parseDebugTimeCommand("Time 2400"), null);
  assert.equal(parseDebugTimeCommand("Time 1260"), null);
  assert.equal(parseDebugTimeCommand("Time 800"), null);
  assert.equal(isDebugTimeCommand("TIME 9999"), true);
  assert.equal(isDebugTimeCommand("R0004 3"), false);
});

test("Debug 時間切換保留目前遊戲日與生存數值", () => {
  const dayFour = advanceSurvivalByGameMinutes(
    createInitialSurvivalState(),
    25 * 60,
  );
  const night = setSurvivalTimeOfDay(dayFour, 20 * 60);
  const earlyMorning = setSurvivalTimeOfDay(dayFour, 2 * 60);

  assert.deepEqual(getGameClock(night.gameMinutes), {
    day: 4,
    hour: 20,
    minute: 0,
  });
  assert.deepEqual(getGameClock(earlyMorning.gameMinutes), {
    day: 4,
    hour: 2,
    minute: 0,
  });
  assert.deepEqual(night.values, dayFour.values);
  assert.notEqual(night.values, dayFour.values);
});
