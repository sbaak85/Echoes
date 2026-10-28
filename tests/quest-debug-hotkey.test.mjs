import assert from "node:assert/strict";
import test from "node:test";
import { createQuestSkipKeyController } from "../app/quest-debug-hotkey.ts";

function createHarness() {
  let enabled = true;
  const events = [];
  const controller = createQuestSkipKeyController({
    canTrigger: () => enabled,
    onStageNext: () => events.push("stage-next"),
  });
  return { controller, events, setEnabled: (value) => { enabled = value; } };
}

test("releasing ] advances exactly one Stage", () => {
  const { controller, events } = createHarness();
  assert.equal(controller.begin(), true);
  assert.equal(controller.isHolding(), true);
  assert.equal(controller.release(), "stage-next");
  assert.equal(controller.isHolding(), false);
  assert.equal(controller.release(), null);
  assert.deepEqual(events, ["stage-next"]);
});

test("holding ] and repeated keydown cannot skip a quest or multiple Stages", () => {
  const { controller, events } = createHarness();
  controller.begin();
  for (let i = 0; i < 100; i++) assert.equal(controller.begin(), false);
  assert.deepEqual(events, []);
  assert.equal(controller.release(), "stage-next");
  assert.deepEqual(events, ["stage-next"]);
  controller.begin();
  controller.release();
  assert.deepEqual(events, ["stage-next", "stage-next"]);
});

test("cancelled, blocked, or disabled holds never trigger a skip", () => {
  const { controller, events, setEnabled } = createHarness();
  controller.begin();
  controller.cancel();
  assert.equal(controller.release(), null);
  controller.begin();
  setEnabled(false);
  assert.equal(controller.release(), null);
  assert.equal(controller.begin(), false);
  assert.deepEqual(events, []);
});
