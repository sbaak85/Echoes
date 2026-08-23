import assert from "node:assert/strict";
import test from "node:test";
import {
  createQuestSkipKeyController,
  QUEST_SKIP_LONG_PRESS_MS,
} from "../app/quest-debug-hotkey.ts";

function createHarness() {
  let nextTimerId = 0;
  let enabled = true;
  const timers = new Map();
  const events = [];
  const controller = createQuestSkipKeyController({
    canTrigger: () => enabled,
    onStageNext: () => events.push("stage-next"),
    onQuestNext: () => events.push("quest-next"),
    setTimer: (callback, delayMs) => {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, delayMs });
      return nextTimerId;
    },
    clearTimer: (timerId) => timers.delete(timerId),
  });
  return {
    controller,
    events,
    timers,
    setEnabled: (value) => { enabled = value; },
    fireTimer: (timerId) => timers.get(timerId)?.callback(),
  };
}

test("releasing ] before 0.5 seconds advances exactly one Stage", () => {
  const harness = createHarness();
  assert.equal(harness.controller.begin(), true);
  const [[timerId, timer]] = harness.timers;
  assert.equal(timer.delayMs, QUEST_SKIP_LONG_PRESS_MS);
  assert.equal(harness.controller.release(), "stage-next");
  assert.deepEqual(harness.events, ["stage-next"]);
  assert.equal(harness.timers.has(timerId), false);
});

test("holding ] for 0.5 seconds advances one quest and release adds no Stage", () => {
  const harness = createHarness();
  harness.controller.begin();
  const [[timerId]] = harness.timers;
  harness.fireTimer(timerId);
  assert.deepEqual(harness.events, ["quest-next"]);
  assert.equal(harness.controller.release(), "quest-next");
  assert.deepEqual(harness.events, ["quest-next"]);
});

test("key repeat and cancelled or blocked holds never duplicate a skip", () => {
  const harness = createHarness();
  assert.equal(harness.controller.begin(), true);
  assert.equal(harness.controller.begin(), false);
  harness.controller.cancel();
  assert.equal(harness.controller.release(), null);
  assert.deepEqual(harness.events, []);

  harness.controller.begin();
  const [[timerId]] = harness.timers;
  harness.setEnabled(false);
  harness.fireTimer(timerId);
  assert.equal(harness.controller.release(), null);
  assert.deepEqual(harness.events, []);
});
