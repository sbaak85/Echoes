import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QuestRuntimeManager, evaluateQuestObjective } from "../app/quest-runtime-manager.ts";

const data = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
const questId = "QUEST_CH04_MAIN_001";
const objectiveId = `${questId}_OBJ_13`;
const quest = data.quests.find(q => q.id === questId);
const objective = quest.stages.flatMap(s => s.objectives).find(o => o.id === objectiveId);
const arrival = {
  type: "sceneTransferCompleted", targetId: "Scene_6",
  sourceSceneId: "Scene_3", sourceConnectionId: "scene-exit-001", eventId: "transfer:1",
};

function harness(save, requiredAmount = 1) {
  const configuredQuest = structuredClone(quest);
  configuredQuest.prerequisiteQuestIds = [];
  configuredQuest.startDelaySeconds = 0;
  configuredQuest.stages[0].startEventFlowId = "";
  configuredQuest.stages[0].objectives.find(o => o.id === objectiveId).requiredAmount = requiredAmount;
  const manager = new QuestRuntimeManager({ ...data, quests: [configuredQuest] }, {}, save);
  if (!save) manager.startQuest(questId);
  return { manager, progress: () => manager.getObjectiveProgress(questId, objectiveId) };
}

test("OBJ 13 requires the configured route and retains its dialogue activation gate", () => {
  assert.equal(objective.type, "sceneTransferCompleted");
  assert.equal(objective.targetId, "Scene_6");
  assert.equal(objective.sourceSceneId, "Scene_3");
  assert.equal(objective.sourceConnectionId, "scene-exit-001");
  assert.equal(objective.requiredAmount, 1);
  assert.equal(objective.activationMode, "event");
  assert.equal(objective.activationEventId, "chapter04-section-1");
  assert.deepEqual(evaluateQuestObjective(objective, arrival), { mode: "add", amount: 1 });
  for (const changes of [
    { type: "areaEntered" }, { type: "interactionSucceeded" },
    { targetId: "Scene_3" }, { sourceSceneId: "Scene_2" },
    { sourceConnectionId: "scene-exit-002" }, { sourceSceneId: undefined },
    { sourceConnectionId: undefined },
  ]) assert.equal(evaluateQuestObjective(objective, { ...arrival, ...changes }), null);
});

test("generic arrival supports destination-only or source filtering, but never a blank destination or unscoped exit", () => {
  const destinationOnly = { ...objective, sourceSceneId: "", sourceConnectionId: "" };
  assert.deepEqual(evaluateQuestObjective(destinationOnly, { ...arrival, sourceSceneId: "Scene_2" }), { mode: "add", amount: 1 });
  assert.deepEqual(evaluateQuestObjective({ ...objective, sourceConnectionId: "" }, { ...arrival, sourceConnectionId: "another" }), { mode: "add", amount: 1 });
  for (const targetId of ["", "  ", undefined])
    assert.equal(evaluateQuestObjective({ ...destinationOnly, targetId }, arrival), null);
  assert.equal(evaluateQuestObjective({ ...objective, sourceSceneId: "" }, arrival), null);
  assert.deepEqual(evaluateQuestObjective(objective, { ...arrival, amount: 999 }), { mode: "add", amount: 1 });
});

test("pre-activation visits do not count; first real arrival after dialogue completes OBJ 13 and survives reload", () => {
  const h = harness();
  h.manager.handleEvent(arrival);
  assert.equal(h.progress().state, "locked");
  assert.equal(h.progress().currentAmount, 0);
  h.manager.handleEvent({ type: "dialogueCompleted", targetId: "chapter04-section-1" });
  assert.equal(h.progress().state, "active");
  assert.equal(h.progress().completed, false);
  h.manager.handleEvent({ ...arrival, type: "areaEntered" });
  h.manager.handleEvent({ ...arrival, sourceSceneId: "Scene_6", targetId: "Scene_3" });
  assert.equal(h.progress().completed, false);
  h.manager.handleEvent({ ...arrival, eventId: "transfer:2" });
  assert.equal(h.progress().completed, true);
  assert.equal(h.progress().currentAmount, 1);
  h.manager.handleEvent({ ...arrival, eventId: "transfer:3" });
  assert.equal(h.progress().currentAmount, 1);
  const restored = harness(h.manager.exportSave());
  assert.equal(restored.progress().completed, true);
  restored.manager.handleEvent({ ...arrival, eventId: "transfer:4" });
  assert.equal(restored.progress().currentAmount, 1);
});

test("multiple arrivals count once per transfer event, including after saving a partial count", () => {
  const h = harness(undefined, 2);
  h.manager.handleEvent({ type: "dialogueCompleted", targetId: "chapter04-section-1" });
  h.manager.handleEvent(arrival);
  h.manager.handleEvent(arrival);
  assert.equal(h.progress().currentAmount, 1);
  assert.equal(h.progress().completed, false);
  const restored = harness(h.manager.exportSave(), 2);
  restored.manager.handleEvent(arrival);
  assert.equal(restored.progress().currentAmount, 1);
  restored.manager.handleEvent({ ...arrival, eventId: "transfer:2" });
  assert.equal(restored.progress().completed, true);
});

test("game dispatches only in the arrival completion branch, after position update and before autosave", () => {
  const runtime = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.equal(runtime.match(/type: "sceneTransferCompleted"/g)?.length, 1);
  const completion = runtime.slice(runtime.indexOf("const completedTransition = sceneStreamTransition;"));
  const dispatch = completion.indexOf('type: "sceneTransferCompleted"');
  assert.ok(dispatch > completion.indexOf("activateSceneRuntime(completedTransition.targetScene)"));
  assert.ok(dispatch > completion.indexOf("playerPositionRef.current ="));
  assert.ok(dispatch > completion.indexOf("sceneStreamTransition = null"));
  assert.ok(dispatch < completion.indexOf('requestPortableAutosaveRef.current("scene-changed")'));
  assert.match(runtime, /sourceConnectionId: connection.id/);
  assert.match(completion, /sourceSceneId: completedTransition.sourceScene.sceneId/);
  assert.match(completion, /sourceConnectionId: completedTransition.sourceConnectionId/);
  assert.match(completion, /eventId: `scene-transfer:\$\{crypto.randomUUID\(\)\}`/);
});
