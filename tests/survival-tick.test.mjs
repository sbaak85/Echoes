import assert from "node:assert/strict";
import test from "node:test";
import { SurvivalTickAccumulator } from "../app/survival-tick.ts";
import { advanceSurvivalState, createInitialSurvivalState, getGameClock } from "../app/survival-manager.ts";
import { useSurvivalInventoryItem } from "../app/item-database.ts";

function simulate(fps, seconds) {
  const tick = new SurvivalTickAccumulator();
  let state = createInitialSurvivalState();
  let settlements = 0;
  for (let frame = 0; frame < fps * seconds; frame++) {
    if (tick.accumulate(1 / fps)) {
      state = tick.flush(state);
      settlements++;
    }
  }
  return { state: tick.flush(state), settlements };
}

test("60 FPS 一分鐘只需約 60 次結算，不會遺失不足一秒的尾數", () => {
  const { state, settlements } = simulate(60, 60);
  assert.ok(settlements >= 59 && settlements <= 60);
  assert.ok(Math.abs(state.gameMinutes - 384) < 1e-8);
  const expected = advanceSurvivalState(createInitialSurvivalState(), 60);
  for (const metric of Object.keys(state.values)) {
    assert.ok(Math.abs(state.values[metric] - expected.values[metric]) < 0.001, metric);
  }
});

test("15 / 60 / 144 FPS 保持相同遊戲日長度與自然衰減", () => {
  const reference = simulate(60, 3600).state;
  for (const fps of [15, 144]) {
    const actual = simulate(fps, 3600).state;
    assert.ok(Math.abs(actual.gameMinutes - reference.gameMinutes) < 1e-6);
    for (const metric of Object.keys(actual.values)) {
      assert.ok(Math.abs(actual.values[metric] - reference.values[metric]) < 0.001, metric);
    }
  }
});

test("混合移動速度保留逐段耗體力加權，不以平均速度取代", () => {
  const initial = createInitialSurvivalState();
  const tick = new SurvivalTickAccumulator();
  let perFrame = initial;
  for (const speed of [0, 105, 420, 210]) {
    tick.accumulate(0.25, speed * 0.25, speed);
    perFrame = advanceSurvivalState(perFrame, 0.25, speed * 0.25, speed);
  }
  const batched = tick.flush(initial);
  assert.ok(Math.abs(batched.values.stamina - perFrame.values.stamina) < 1e-10);
});

test("補算與暫停可重入，不會重扣；恢復後只計算新時間", () => {
  const tick = new SurvivalTickAccumulator();
  const initial = createInitialSurvivalState();
  assert.equal(tick.accumulate(0.3), false);
  const paused = tick.flush(initial);
  for (let frame = 0; frame < 600; frame++) assert.equal(tick.flush(paused), paused);
  tick.accumulate(0.2);
  const resumed = tick.flush(paused);
  assert.ok(Math.abs(resumed.gameMinutes - 360.2) < 1e-8);
  assert.equal(tick.flush(resumed), resumed);
});

test("道具使用及存檔前補算尾數，效果後不重播舊耗量", () => {
  const tick = new SurvivalTickAccumulator();
  const initial = createInitialSurvivalState();
  initial.values.thirst = 99.001;
  assert.equal(useSurvivalInventoryItem({ R0004: 2 }, initial, "R0004").status, "full");
  tick.accumulate(0.5);
  const snapshot = tick.flush(initial);
  const result = useSurvivalInventoryItem({ R0004: 2 }, snapshot, "R0004");
  assert.equal(result.status, "success");
  assert.equal(result.survival.values.thirst, 100);
  assert.equal(tick.flush(result.survival), result.survival);
  assert.ok(Math.abs(JSON.parse(JSON.stringify(snapshot)).gameMinutes - 360.2) < 1e-8);
});

test("新遊戲/讀檔清除舊累積；延遲幀不丟失有效遊戲時間", () => {
  const tick = new SurvivalTickAccumulator();
  tick.accumulate(0.8, 80, 100);
  tick.clear();
  const loaded = createInitialSurvivalState();
  assert.equal(tick.flush(loaded), loaded);
  assert.equal(tick.accumulate(2.5), true);
  assert.ok(Math.abs(tick.flush(loaded).gameMinutes - 361) < 1e-8);
});

test("時鐘每 2.5 秒跳分，不受每秒結算或途中存檔補算影響", () => {
  const tick = new SurvivalTickAccumulator();
  let state = createInitialSurvivalState();
  let previousMinute = Math.floor(state.gameMinutes);
  const changes = [];
  for (let frame = 1; frame <= 1200; frame++) {
    const ready = tick.accumulate(1 / 60);
    // Irregular extra flushes model saving/using items between ordinary ticks.
    if (ready || frame % 47 === 0) state = tick.flush(state);
    const minute = Math.floor(tick.getClockGameMinutes(state.gameMinutes));
    if (minute !== previousMinute) {
      changes.push(frame / 60);
      previousMinute = minute;
    }
  }
  assert.ok(changes.length >= 7);
  changes.forEach((seconds, index) => {
    assert.ok(Math.abs(seconds - (index + 1) * 2.5) < 0.035, `${seconds}s`);
  });
});

test("時鐘讀取不結算生存值，暫停與時間跳轉不留下舊尾數", () => {
  const tick = new SurvivalTickAccumulator();
  const state = createInitialSurvivalState();
  state.gameMinutes = 1439.9;
  tick.accumulate(0.5);
  const clockTime = tick.getClockGameMinutes(state.gameMinutes);
  assert.equal(state.gameMinutes, 1439.9);
  assert.deepEqual(getGameClock(clockTime), { day: 3, hour: 0, minute: 0 });
  const paused = tick.flush(state);
  for (let i = 0; i < 120; i++) assert.equal(tick.getClockGameMinutes(paused.gameMinutes), clockTime);
  tick.accumulate(0.4);
  tick.clear();
  assert.equal(tick.getClockGameMinutes(720), 720);
});
