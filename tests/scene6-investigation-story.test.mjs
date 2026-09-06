import test from "node:test";
import assert from "node:assert/strict";
import {
  createScene6InvestigationStory,
  SCENE6_INVESTIGATION_COMPLETED,
  SCENE6_INVESTIGATION_DIALOGUE,
  SCENE6_INVESTIGATION_FOURTH_COMPLETED,
  SCENE6_INVESTIGATION_FOURTH_DIALOGUE,
} from "../app/scene6-investigation-story.ts";

const id = n => `scene6-interaction-${String(n).padStart(3, "0")}`;

function fixture(saved = { flags: {}, completed: [] }) {
  const state = {
    saved,
    stage: true,
    calls: [],
    sleeps: [],
    result: true,
  };
  state.check = createScene6InvestigationStory({
    isTargetStage: () => state.stage,
    getFlags: () => saved.flags,
    setFlag: (key, value) => { saved.flags[key] = value; },
    isCompleted: completionId => saved.completed.includes(completionId),
    markCompleted: completionId => { saved.completed.push(completionId); },
    play: async dialogueId => {
      state.calls.push(dialogueId);
      return { completed: state.result };
    },
    sleep: async milliseconds => { state.sleeps.push(milliseconds); },
  });
  return state;
}

test("second distinct success waits 1.25 seconds and plays section 2 once", async () => {
  const s = fixture();
  await s.check(id(1));
  await s.check(id(1));
  assert.deepEqual(s.calls, []);
  await s.check(id(2));
  assert.deepEqual(s.sleeps, [1250]);
  assert.deepEqual(s.calls, [SCENE6_INVESTIGATION_DIALOGUE]);
  assert.deepEqual(s.saved.completed, [SCENE6_INVESTIGATION_COMPLETED]);
});

test("fourth distinct success waits 1.5 seconds and plays section 3", async () => {
  const s = fixture();
  for (let n = 1; n <= 4; n++) await s.check(id(n));
  assert.deepEqual(s.calls, [
    SCENE6_INVESTIGATION_DIALOGUE,
    SCENE6_INVESTIGATION_FOURTH_DIALOGUE,
  ]);
  assert.deepEqual(s.sleeps, [1250, 1500]);
  assert.deepEqual(s.saved.completed, [
    SCENE6_INVESTIGATION_COMPLETED,
    SCENE6_INVESTIGATION_FOURTH_COMPLETED,
  ]);
});

test("all fourth-site combinations trigger section 3 exactly once", async () => {
  for (let a = 1; a <= 5; a++) {
    const s = fixture();
    const chosen = [a, ...[1, 2, 3, 4, 5].filter(n => n !== a).slice(0, 3)];
    for (const n of chosen) await s.check(id(n));
    await s.check(id(chosen[0]));
    await s.check(id(8));
    assert.equal(s.calls.filter(call => call === SCENE6_INVESTIGATION_FOURTH_DIALOGUE).length, 1);
  }
});

test("wrong stage and unrelated interactions do not count", async () => {
  const s = fixture();
  s.stage = false;
  await s.check(id(1));
  s.stage = true;
  await s.check("other");
  assert.deepEqual(s.saved.flags, {});
});

test("save round trip resumes each incomplete milestone without replaying completed dialogue", async () => {
  const s = fixture();
  await s.check(id(4));
  await s.check(id(8));
  const reload = fixture(JSON.parse(JSON.stringify(s.saved)));
  await reload.check(id(2));
  await reload.check(id(6));
  assert.deepEqual(reload.calls, [SCENE6_INVESTIGATION_FOURTH_DIALOGUE]);
});

test("reload after section 3 dialogue does not replay a completed milestone", async () => {
  const saved = {
    flags: Object.fromEntries([1, 2, 3, 4].map(n => [`scene6-investigation:${id(n)}`, true])),
    completed: [SCENE6_INVESTIGATION_COMPLETED, SCENE6_INVESTIGATION_FOURTH_COMPLETED],
  };
  const s = fixture(saved);
  await s.check();
  assert.deepEqual(s.calls, []);
  assert.deepEqual(s.sleeps, []);
});

test("cancelled section remains retryable and concurrent successes queue one runner", async () => {
  const s = fixture();
  s.result = false;
  await s.check(id(1));
  await Promise.all([s.check(id(2)), s.check(id(3))]);
  assert.deepEqual(s.calls, [SCENE6_INVESTIGATION_DIALOGUE]);
  assert.deepEqual(s.saved.completed, []);
  const reload = fixture(JSON.parse(JSON.stringify(s.saved)));
  await reload.check();
  assert.deepEqual(reload.calls, [SCENE6_INVESTIGATION_DIALOGUE]);
});
