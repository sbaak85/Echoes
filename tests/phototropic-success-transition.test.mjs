import assert from "node:assert/strict";
import test from "node:test";
import { PLANT_SUCCESS_DIALOGUE_ID, PLANT_SUCCESS_COVER_MS, PLANT_SUCCESS_BLACK_MS, PLANT_SUCCESS_REVEAL_MS, PLANT_SUCCESS_HOLD_MS, PLANT_SUCCESS_EXIT_MS, startPlantSuccessTransition } from "../app/phototropic-success-transition.ts";

test("success covers for 1s, swaps under 250ms black, reveals for 1s, holds 500ms and waits for the entire dialogue before its 500ms exit", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const events = [], finished = []; let playCount = 0, completeDialogue;
  let musicFades = 0;
  const dialogue = new Promise(resolve => { completeDialogue = resolve; });
  const cancel = startPlantSuccessTransition(phase => events.push(phase), () => { playCount++; return dialogue; }, completed => finished.push(completed), () => { musicFades++; assert.equal(events.at(-1), "dialogue"); });
  assert.equal(PLANT_SUCCESS_DIALOGUE_ID, "chapter04-section-99");
  assert.deepEqual([PLANT_SUCCESS_COVER_MS, PLANT_SUCCESS_BLACK_MS, PLANT_SUCCESS_REVEAL_MS, PLANT_SUCCESS_HOLD_MS, PLANT_SUCCESS_EXIT_MS], [1000, 250, 1000, 500, 500]);
  assert.deepEqual(events, ["cover"]);
  t.mock.timers.tick(999); assert.deepEqual(events, ["cover"]);
  t.mock.timers.tick(1); assert.equal(events.at(-1), "black");
  t.mock.timers.tick(249); assert.equal(events.at(-1), "black");
  t.mock.timers.tick(1); assert.equal(events.at(-1), "reveal");
  t.mock.timers.tick(999); assert.equal(events.at(-1), "reveal");
  t.mock.timers.tick(1); assert.equal(events.at(-1), "hold");
  t.mock.timers.tick(499); assert.equal(playCount, 0);
  t.mock.timers.tick(1); assert.equal(events.at(-1), "dialogue"); assert.equal(playCount, 1);
  t.mock.timers.tick(60000); assert.deepEqual(finished, []); assert.equal(events.at(-1), "dialogue", "reading time must not auto-dismiss the script");
  assert.equal(musicFades, 0);
  completeDialogue({ completed: true }); await Promise.resolve();
  assert.equal(events.at(-1), "exit");
  assert.equal(musicFades, 1);
  t.mock.timers.tick(499); assert.deepEqual(finished, []);
  t.mock.timers.tick(1); assert.deepEqual(finished, [true]);
  t.mock.timers.tick(10000); assert.equal(playCount, 1); assert.deepEqual(finished, [true]);
  assert.equal(musicFades, 1);
  cancel();
});

test("cancellation in any pre-dialogue stage removes all delayed playback and finish callbacks", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const cancelAt of [0, 999, 1000, 1100, 1250, 2000, 2250, 2500, 2749]) {
    const events = []; let played = 0, finished = 0, musicFades = 0;
    const cancel = startPlantSuccessTransition(phase => events.push(phase), async () => { played++; return { completed: true }; }, () => finished++, () => musicFades++);
    t.mock.timers.tick(cancelAt); cancel();
    const snapshot = [...events];
    t.mock.timers.tick(10000);
    assert.deepEqual(events, snapshot); assert.equal(played, 0); assert.equal(finished, 0);
    assert.equal(musicFades, 0);
  }
});

test("unmount during dialogue suppresses a late completion, and unmount during exit cancels final return", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const duringExit of [false, true]) {
    const events = []; let finished = 0, complete, musicFades = 0;
    const dialogue = new Promise(resolve => { complete = resolve; });
    const cancel = startPlantSuccessTransition(phase => events.push(phase), () => dialogue, () => finished++, () => musicFades++);
    t.mock.timers.tick(2750);
    if (duringExit) { complete({ completed: true }); await Promise.resolve(); t.mock.timers.tick(300); }
    cancel(); const snapshot = [...events];
    complete({ completed: true }); await Promise.resolve(); t.mock.timers.tick(10000);
    assert.deepEqual(events, snapshot); assert.equal(finished, 0);
    assert.equal(musicFades, duringExit ? 1 : 0);
  }
});

test("cancelled dialogue releases the overlay without reporting the puzzle as completed", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const finished = [];
  startPlantSuccessTransition(() => {}, async () => ({ completed: false }), completed => finished.push(completed), () => assert.fail("Cancelled dialogue must not signal completed"));
  t.mock.timers.tick(2750); await Promise.resolve();
  t.mock.timers.tick(500); assert.deepEqual(finished, [false]);
});
