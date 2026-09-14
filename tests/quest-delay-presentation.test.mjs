import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { isQuestObjectiveVisible, isQuestObjectiveCheckmarkVisible } from "../app/quest-hud-timing.ts";

test("actual HUD activation callback deduplicates the deadline and uses fresh state without resurrecting a changed Stage", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const marker = "onObjectiveActivated: (questId, objectiveId, _stageId, entry) => {";
  const body = source.slice(source.indexOf(marker) + marker.length, source.indexOf("          onStageTransitionStarted:"));
  const callback = new Function("questId", "objectiveId", "_stageId", "entry", "questObjectiveActivationPresentationsRef", "QUEST_DOCUMENT", "buildQuestHudView", "scheduleQuestPresentation", "questRuntimeManagerRef", "playOneShotAudio", "triggerQuestObjectiveUnlockTween", "Date", body.replace(/},\s*$/, ""));
  for (const obsolete of [false, true]) {
    let current = { state: "active", currentStageId: "S", revision: 1, objectives: { OBJ_15: { startPresentationAvailableAtEpochMs: 2000 } } };
    const registry = { current: new Map() };
    const scheduled = [], audio = [], shown = [];
    const args = ["Q", "OBJ_15", "S", current, registry, fixture(),
      (_id, entry) => ({ revision: entry.revision, objectives: [{ id: "OBJ_15" }] }),
      (delay, run) => scheduled.push({ delay, run }),
      { current: { exportSave: () => ({ quests: { Q: current } }) } },
      id => audio.push(id), view => shown.push(view), { now: () => 1000 }];
    callback(...args);
    callback(...args);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delay, 1);
    assert.equal(shown.length, 0);
    current = { ...current, currentStageId: obsolete ? "NEXT" : "S", revision: 2 };
    scheduled[0].run();
    assert.equal(audio.length, obsolete ? 0 : 1);
    assert.equal(shown.length, obsolete ? 0 : 1);
    if (!obsolete) assert.equal(shown[0].revision, 2);
  }
});

function fixture() {
  const objective = { displayText: "test", type: "collectItem", targetId: "item", requiredAmount: 1, countMode: "accumulated", interactionMode: "succeeded" };
  return { schemaVersion: 1, chapters: [], quests: [{
    id: "Q", name: "test", type: "main", prerequisiteQuestIds: [], grantMethod: "automatic",
    stages: [{ id: "S", completionMode: "all", objectives: [
      { ...objective, id: "OBJ_14" },
      { ...objective, id: "OBJ_15", targetId: "next", activationMode: "objectiveCompleted", activationEventId: "OBJ_14", startPresentationDelaySeconds: 1 },
      { ...objective, id: "BLOCK", targetId: "block" },
    ] }],
  }] };
}

test("Scene6 interaction 012 completes OBJ_05 and its completion callback retains STAGE_02 after runtime advances", () => {
  const doc = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
  const questId = "QUEST_CH04_MAIN_001";
  const stageId = `${questId}_STAGE_02`;
  const objectiveId = `${questId}_OBJ_05`;
  const completed = [], transitions = [];
  const clock = clockHost({
    onObjectiveCompleted: (q, obj, stage, entry) => completed.push({ q, obj, stage, entry }),
    onStageTransitionStarted: (q, from, to) => transitions.push({ q, from, to }),
  });
  const manager = new QuestRuntimeManager(doc, clock.host);
  const save = manager.exportSave();
  const entry = save.quests[questId];
  entry.state = "active";
  entry.currentStageId = stageId;
  entry.stageAvailableAtEpochMs = 0;
  Object.assign(entry.objectives[`${questId}_OBJ_04`], { completed: true, state: "completed", unlocked: true, completionPresented: true, completionEventCompleted: true });
  Object.assign(entry.objectives[objectiveId], { completed: false, state: "active", unlocked: true, activatedByEventId: "chapter04-signal-samples-follow-up", availableAtEpochMs: 0 });
  manager.replaceSaveData(save, false);
  manager.handleEvent({ type: "interactionSucceeded", targetId: "scene6-interaction-012" });
  assert.equal(manager.exportSave().quests[questId].objectives[objectiveId].completed, true);
  assert.equal(manager.exportSave().quests[questId].currentStageId, `${questId}_STAGE_03`);
  assert.equal(transitions.length, 1);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].stage, stageId);
  assert.equal(completed[0].entry.currentStageId, stageId);
  assert.equal(isQuestObjectiveCheckmarkVisible(completed[0].entry.objectives[objectiveId], 0.5, clock.now()), false);
  clock.advance(500);
  assert.equal(isQuestObjectiveCheckmarkVisible(completed[0].entry.objectives[objectiveId], 0.5, clock.now()), true);
});

test("NEXT waits for the final OBJ's 0.5-second delay plus its one-second checkmark animation", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const start = source.indexOf("          onStageTransitionStarted:");
  const bodyStart = source.indexOf("const view =", start);
  const end = source.indexOf("          onQuestCompleted:", bodyStart);
  const callback = new Function("questId", "currentStageId", "nextStageId", "entry", "QUEST_DOCUMENT", "buildQuestHudView", "triggerQuestStageTransition", "Date", source.slice(bodyStart, end).replace(/},\s*$/, ""));
  const doc = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
  const q = "QUEST_CH04_MAIN_001", stageId = `${q}_STAGE_02`;
  const entry = { objectives: { [`${q}_OBJ_05`]: { completed: true, completionAvailableAtEpochMs: 1000 } } };
  const delays = [];
  const run = () => callback(q, stageId, `${q}_STAGE_03`, entry, doc, () => ({}), (_view, delay) => delays.push(delay), { now: () => 1000 });
  run();
  assert.equal(delays[0], 1.5);
  doc.quests.find(quest => quest.id === q).stages.find(stage => stage.id === stageId).completionPresentationDelaySeconds = 5;
  run();
  assert.equal(delays[1], 5, "a longer editor-defined Stage delay is preserved");
});

function clockHost(extra = {}) {
  let now = 1000;
  const timers = [];
  return {
    host: { now: () => now, scheduleQuestStart: (delay, callback) => timers.push({ at: now + delay, callback }), ...extra },
    now: () => now,
    advance(ms) {
      now += ms;
      for (;;) {
        const index = timers.findIndex(timer => timer.at <= now);
        if (index < 0) break;
        timers.splice(index, 1)[0].callback();
      }
    },
  };
}

test("OBJ_14 unlocks OBJ_15 once; every intermediate HUD refresh respects its one-second deadline", () => {
  const activations = [];
  const snapshots = [];
  const clock = clockHost({ onObjectiveActivated: (_q, id) => activations.push(id), onQuestStateChanged: (_q, entry) => snapshots.push(entry) });
  const manager = new QuestRuntimeManager(fixture(), clock.host);
  manager.startQuest("Q");
  manager.handleEvent({ type: "itemCollected", targetId: "item", amount: 1 });
  const progress = () => manager.exportSave().quests.Q.objectives.OBJ_15;
  assert.equal(progress().state, "active");
  assert.equal(progress().startPresentationAvailableAtEpochMs, 2000);
  assert.equal(isQuestObjectiveVisible(progress(), clock.now()), false);
  manager.handleEvent({ type: "objectiveCompleted", targetId: "OBJ_14" });
  manager.activateObjective("OBJ_15");
  clock.advance(999);
  assert.equal(isQuestObjectiveVisible(progress(), clock.now()), false);
  clock.advance(1);
  assert.equal(isQuestObjectiveVisible(progress(), clock.now()), true);
  assert.deepEqual(activations, ["OBJ_15"]);
});

test("objective completion checkmark also waits for its presentation delay", () => {
  const progress = { completed: true, completionPresented: true, completionAvailableAtEpochMs: 1000 };
  assert.equal(isQuestObjectiveCheckmarkVisible(progress, 1, 1999), false);
  assert.equal(isQuestObjectiveCheckmarkVisible(progress, 1, 2000), true);
  assert.equal(isQuestObjectiveCheckmarkVisible({ completed: true }, 1, 0), true);
});

test("restoring a pending reveal preserves its deadline instead of restarting the delay", () => {
  const clock = clockHost();
  const manager = new QuestRuntimeManager(fixture(), clock.host);
  manager.startQuest("Q");
  manager.handleEvent({ type: "itemCollected", targetId: "item", amount: 1 });
  clock.advance(500);
  const restored = new QuestRuntimeManager(fixture(), clock.host, manager.exportSave());
  assert.equal(restored.exportSave().quests.Q.objectives.OBJ_15.startPresentationAvailableAtEpochMs, 2000);
  clock.advance(500);
  assert.equal(isQuestObjectiveVisible(restored.exportSave().quests.Q.objectives.OBJ_15, clock.now()), true);
});

test("replacing a save invalidates old delayed quest starts and stage actions", () => {
  const doc = fixture();
  doc.quests[0].startDelaySeconds = 1;
  const started = [];
  const clock = clockHost({ onQuestStarted: id => started.push(id) });
  const manager = new QuestRuntimeManager(doc, clock.host);
  const before = manager.exportSave();
  manager.requestQuestStart("Q");
  manager.replaceSaveData(before, false);
  clock.advance(1000);
  assert.deepEqual(started, []);
  assert.equal(manager.getQuestState("Q"), "available");
  manager.requestQuestStart("Q");
  clock.advance(1000);
  assert.deepEqual(started, ["Q"]);
});
