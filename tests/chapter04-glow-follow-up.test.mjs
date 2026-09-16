import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ChapterFlowManager } from "../app/chapter-flow-manager.ts";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { QUEST_OBJECTIVE_COMPLETION_RULES, QUEST_STAGE_EVENT_FLOWS } from "../app/chapter04-quest-flow.ts";
const flow = QUEST_STAGE_EVENT_FLOWS["chapter04-glow-stick-follow-up"];
test("OBJ16 completion schedules section 6 after one second, once", async () => {
  const data = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
  const q = "QUEST_CH04_MAIN_001", obj = `${q}_OBJ_16`;
  const rule = QUEST_OBJECTIVE_COMPLETION_RULES.find(candidate => candidate.objectiveIds.includes(obj));
  assert.equal(rule.delaySeconds, 1);
  const followUp = QUEST_STAGE_EVENT_FLOWS[rule.eventFlowId];
  assert.equal(followUp.once, true);
  assert.deepEqual(followUp.actions, [{ type: "playDialogue", dialogueId: "chapter04-section-6", requireCompleted: true }]);
  let now = 1000;
  const timers = [], played = [];
  const manager = new QuestRuntimeManager(data, {
    now: () => now,
    objectiveCompletionRules: [rule],
    scheduleQuestStart: (delay, callback) => timers.push({ at: now + delay, callback }),
    runEventFlow: id => { played.push(id); return true; },
  });
  const save = manager.exportSave();
  Object.assign(save.quests[q], { state: "active", currentStageId: `${q}_STAGE_03`, stageAvailableAtEpochMs: 0 });
  manager.replaceSaveData(save, false);
  manager.activateObjective(obj, "chapter04-glow-stick-follow-up");
  manager.completeObjective(q, obj);
  manager.completeObjective(q, obj);
  const tick = async time => {
    now = time;
    for (const timer of timers.splice(0)) {
      if (timer.at <= now) timer.callback(); else timers.push(timer);
    }
    await new Promise(resolve => setImmediate(resolve));
  };
  await tick(1999);
  assert.deepEqual(played, []);
  await tick(2000);
  assert.deepEqual(played, [rule.eventFlowId]);
  await tick(5000);
  assert.deepEqual(played, [rule.eventFlowId]);
});
test("OBJ16 is gated by the delayed flow, not dialogue completion directly", () => {
  const data = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
  const objective = data.quests.find(q => q.id === "QUEST_CH04_MAIN_001")
    .stages.flatMap(s => s.objectives).find(o => o.id === "QUEST_CH04_MAIN_001_OBJ_16");
  assert.equal(objective.activationMode, "event");
  assert.equal(objective.activationEventId, flow.id);
  assert.equal(objective.unlockDialogueId, "");
  assert.equal(objective.startDelaySeconds, 0);
});
function harness(result) {
  const events = [];
  const manager = new ChapterFlowManager({
    setInputLocked() {}, setBlack() {}, fadeToBlack() {}, fadeFromBlack() {},
    showCenteredText() {}, hideCenteredText() {}, cancelDialogue() {},
    isCompleted: () => false, markCompleted: id => events.push(id),
    playDialogue: () => result, activateObjective: id => events.push(id),
  });
  return { events, manager };
}
test("OBJ15 waits 1s before section 5, then 1s before OBJ16", async () => {
  const rule = QUEST_OBJECTIVE_COMPLETION_RULES.find(r => r.eventFlowId === flow.id);
  assert.deepEqual(rule.objectiveIds, ["QUEST_CH04_MAIN_001_OBJ_15"]);
  assert.equal(rule.delaySeconds, 1);
  assert.deepEqual(flow.actions, [
    { type: "playDialogue", dialogueId: "chapter04-section-5", requireCompleted: true },
    { type: "wait", durationMs: 1000 },
    { type: "activateObjective", objectiveId: "QUEST_CH04_MAIN_001_OBJ_16" },
  ]);
  let finish;
  const { events, manager } = harness(new Promise(resolve => { finish = resolve; }));
  const running = manager.run(flow);
  assert.deepEqual(events, []);
  const before = performance.now();
  finish({ completed: true });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(events, []);
  await running;
  assert.ok(performance.now() - before >= 980);
  assert.deepEqual(events, ["QUEST_CH04_MAIN_001_OBJ_16", flow.id]);
});
test("cancelled section 5 neither activates OBJ16 nor marks flow complete", async () => {
  const { events, manager } = harness(Promise.resolve({ completed: false }));
  await assert.rejects(manager.run(flow), /Dialogue did not complete/);
  assert.deepEqual(events, []);
  assert.equal(manager.getActiveFlowId(), null);
});
