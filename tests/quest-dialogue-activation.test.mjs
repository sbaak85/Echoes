import test from "node:test";
import assert from "node:assert/strict";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
function harness(mode, delay = 1, save, start = 10000) {
  let now = start;
  const timers = [], activated = [];
  const document = { schemaVersion: 1, chapters: [], quests: [{
    id: "q", chapterId: "c", name: "q", type: "main", prerequisiteQuestIds: [],
    grantMethod: "automatic", stages: [{ id: "s", completionMode: "all", objectives: [{
      id: "o", type: "collectItem", targetId: "item", requiredAmount: 10,
      activationMode: mode, activationEventId: "script", startDelaySeconds: delay,
    }] }],
  }] };
  const manager = new QuestRuntimeManager(document, {
    now: () => now,
    scheduleQuestStart: (delay, callback) => timers.push({ at: now + delay, callback }),
    onObjectiveActivated: () => activated.push(now),
  }, save);
  if (!save) manager.startQuest("q");
  const tick = time => { now = time; let i;
    while ((i = timers.findIndex(t => t.at <= now)) >= 0) timers.splice(i, 1)[0].callback();
  };
  return { manager, tick, activated, progress: () => manager.exportSave().quests.q.objectives.o };
}
for (const mode of ["dialogueStarted", "dialogueCompleted"]) {
  test(mode + ": delay begins at matching trigger; duplicates do not reset timer", () => {
    const h = harness(mode);
    h.tick(20000);
    h.manager.handleEvent({ type: mode === "dialogueStarted" ? "dialogueCompleted" : "dialogueStarted", targetId: "script" });
    assert.equal(h.progress().unlocked, false);
    h.manager.handleEvent({ type: mode, targetId: "wrong" });
    assert.equal(h.progress().unlocked, false);
    h.manager.handleEvent({ type: mode, targetId: "script" });
    h.tick(20500);
    h.manager.handleEvent({ type: mode, targetId: "script" });
    h.manager.handleEvent({ type: "itemCollected", targetId: "item", itemId: "item", amount: 1 });
    assert.equal(h.progress().currentAmount, 0);
    h.tick(20999); assert.equal(h.progress().unlocked, false);
    h.tick(21000); assert.equal(h.progress().unlocked, true);
    assert.deepEqual(h.activated, [21000]);
  });
  test(mode + ": pending timer survives restore; zero delay activates immediately", () => {
    const h = harness(mode);
    h.manager.handleEvent({ type: mode, targetId: "script" });
    const restored = harness(mode, 1, h.manager.exportSave(), 10500);
    restored.tick(10999); assert.equal(restored.progress().unlocked, false);
    restored.tick(11000); assert.equal(restored.progress().unlocked, true);
    const immediate = harness(mode, 0);
    immediate.manager.handleEvent({ type: mode, targetId: "script" });
    assert.equal(immediate.progress().unlocked, true);
  });
}
test("legacy event activation ignores newly emitted dialogueStarted", () => {
  const h = harness("event", 0);
  h.manager.handleEvent({ type: "dialogueStarted", targetId: "script" });
  assert.equal(h.progress().unlocked, false);
});
