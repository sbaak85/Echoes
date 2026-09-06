import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as flush } from "node:timers/promises";
import test from "node:test";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { DialogueManager } from "../app/dialogue-manager.ts";
import {
  CHAPTER04_SIGNAL_SAMPLES_DIALOGUE_ID,
  CHAPTER04_SIGNAL_SAMPLES_FLOW_ID,
  CHAPTER04_SIGNAL_SAMPLES_NEXT_OBJECTIVE_ID,
  QUEST_OBJECTIVE_COMPLETION_RULES,
  QUEST_STAGE_EVENT_FLOWS,
} from "../app/chapter04-quest-flow.ts";
import {
  createScene6InvestigationStory,
  SCENE6_INVESTIGATION_DIALOGUE,
  SCENE6_INVESTIGATION_FOURTH_DIALOGUE,
} from "../app/scene6-investigation-story.ts";

const source = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
const questId = "QUEST_CH04_MAIN_001";
const first = `${questId}_OBJ_02`;
const second = `${questId}_OBJ_03`;
const next = `${questId}_OBJ_13`;
const dialogueId = "chapter04-section-1";
const ruleId = "chapter04-preparation-complete";
const signalSamplesObjectiveId = `${questId}_OBJ_04`;
const signalSamplesRuleId = "chapter04-signal-samples-complete";
const signalSamplesDialogueId = CHAPTER04_SIGNAL_SAMPLES_DIALOGUE_ID;
const signalSamplesFlowId = CHAPTER04_SIGNAL_SAMPLES_FLOW_ID;
const signalSamplesNextObjectiveId = CHAPTER04_SIGNAL_SAMPLES_NEXT_OBJECTIVE_ID;

function harness(save, initialTime = 1000, presentationDelay = 0) {
  const quest = structuredClone(source.quests.find(q => q.id === questId));
  quest.prerequisiteQuestIds = [];
  quest.startDelaySeconds = 0;
  quest.stages[0].startEventFlowId = "";
  quest.stages[0].objectives.find(o => o.id === first).completionDelaySeconds = presentationDelay;
  const document = { schemaVersion: 1, chapters: source.chapters, quests: [quest] };
  let now = initialTime;
  const timers = [];
  const opened = [];
  const dialogues = new DialogueManager();
  dialogues.register(dialogueId, { lines: [{ speaker: "Sbaak", text: "準備完成。" }] });
  dialogues.setPresenter(request => { opened.push({ id: request.id, at: now }); });
  const manager = new QuestRuntimeManager(document, {
    objectiveCompletionRules: QUEST_OBJECTIVE_COMPLETION_RULES,
    now: () => now,
    scheduleQuestStart: (delay, callback) => timers.push({ at: now + delay, callback }),
    runEventFlow: id => dialogues.playRegistered(id, {}).then(result => result.completed),
  }, save);
  dialogues.setCompletionListener(request => manager.handleEvent({
    type: "dialogueCompleted", targetId: request.id, eventId: `dialogue:${request.id}`,
  }));
  if (!save) {
    manager.startQuest(questId);
    manager.activateObjective(first);
    manager.activateObjective(second);
  }
  const tick = async time => {
    now = time;
    let index;
    while ((index = timers.findIndex(timer => timer.at <= now)) >= 0) {
      timers.splice(index, 1)[0].callback();
    }
    await flush();
  };
  return { manager, dialogues, opened, tick, progress: id => manager.getObjectiveProgress(questId, id) };
}

test("chapter 4 completion rules cover preparation and the three signal samples", () => {
  assert.deepEqual(QUEST_OBJECTIVE_COMPLETION_RULES, [{
    id: ruleId, questId, objectiveIds: [first, second], delaySeconds: 1.5, eventFlowId: dialogueId,
  }, {
    id: signalSamplesRuleId,
    questId,
    objectiveIds: [signalSamplesObjectiveId],
    delaySeconds: 1.25,
    eventFlowId: signalSamplesFlowId,
  }]);
  const obj = source.quests.find(q => q.id === questId).stages.flatMap(s => s.objectives).find(o => o.id === next);
  assert.equal(obj.activationMode, "event");
  assert.equal(obj.activationEventId, dialogueId);
  assert.equal(obj.unlockDialogueId, dialogueId);
  const runtimeSource = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(runtimeSource, /objectiveCompletionRules: QUEST_OBJECTIVE_COMPLETION_RULES/);
  const story = readFileSync(new URL("../app/story-content.ts", import.meta.url), "utf8");
  assert.match(story, /"chapter04-section-1":\s*\{/);
  assert.match(story, /"chapter04-section-4":\s*\{/);
  const followUpObjective = source.quests.find(q => q.id === questId).stages
    .flatMap(stage => stage.objectives)
    .find(objective => objective.id === signalSamplesNextObjectiveId);
  assert.equal(followUpObjective.activationMode, "event");
  assert.equal(followUpObjective.activationEventId, signalSamplesFlowId);
  assert.deepEqual(QUEST_STAGE_EVENT_FLOWS[signalSamplesFlowId].actions, [{
    type: "playDialogue",
    dialogueId: signalSamplesDialogueId,
  }, {
    type: "activateObjective",
    objectiveId: signalSamplesNextObjectiveId,
  }]);
  assert.deepEqual(QUEST_STAGE_EVENT_FLOWS[signalSamplesFlowId].skipActions, [{
    type: "activateObjective",
    objectiveId: signalSamplesNextObjectiveId,
  }]);
  const obj01 = source.quests.find(q => q.id === questId).stages[0].objectives
    .find(objective => objective.id === `${questId}_OBJ_01`);
  assert.equal(obj01.type, "dialogueCompleted");
  assert.equal(obj01.targetId, "chapter04-section-3");
  assert.equal(obj01.completionDelaySeconds, 1.25);
});

test("all four Stage 01 objectives automatically advance after OBJ 01's configured delay", async () => {
  const quest = structuredClone(source.quests.find(q => q.id === questId));
  quest.prerequisiteQuestIds = [];
  quest.startDelaySeconds = 0;
  quest.stages[0].startEventFlowId = "";
  let now = 1000;
  const timers = [];
  const manager = new QuestRuntimeManager(
    { schemaVersion: 1, chapters: source.chapters, quests: [quest] },
    {
      now: () => now,
      scheduleQuestStart: (delay, callback) => timers.push({ at: now + delay, callback }),
    },
  );
  manager.startQuest(questId);
  manager.activateObjective(first);
  manager.activateObjective(second);
  manager.activateObjective(next, dialogueId);
  manager.completeObjective(questId, first);
  manager.completeObjective(questId, second);
  manager.completeObjective(questId, next);
  assert.equal(manager.getCurrentStage(questId), "QUEST_CH04_MAIN_001_STAGE_01");
  manager.completeObjective(questId, `${questId}_OBJ_01`);
  assert.equal(manager.getCurrentStage(questId), "QUEST_CH04_MAIN_001_STAGE_01");
  now = 2249;
  timers.filter(timer => timer.at <= now).forEach(timer => timer.callback());
  await flush();
  assert.equal(manager.getCurrentStage(questId), "QUEST_CH04_MAIN_001_STAGE_01");
  now = 2250;
  timers.filter(timer => timer.at <= now).forEach(timer => timer.callback());
  await flush();
  assert.equal(manager.getCurrentStage(questId), "QUEST_CH04_MAIN_001_STAGE_02");
});

test("the fourth Scene 6 investigation plays section 3 and its delayed OBJ 01 check advances Stage 01", async () => {
  const quest = structuredClone(source.quests.find(q => q.id === questId));
  quest.prerequisiteQuestIds = [];
  quest.startDelaySeconds = 0;
  quest.stages[0].startEventFlowId = "";
  let now = 1000;
  const timers = [];
  const manager = new QuestRuntimeManager(
    { schemaVersion: 1, chapters: source.chapters, quests: [quest] },
    {
      now: () => now,
      scheduleQuestStart: (delay, callback) => timers.push({ at: now + delay, callback }),
    },
  );
  manager.startQuest(questId);
  manager.activateObjective(first);
  manager.activateObjective(second);
  manager.activateObjective(next, dialogueId);
  manager.completeObjective(questId, first);
  manager.completeObjective(questId, second);
  manager.completeObjective(questId, next);

  const flags = {};
  const completed = [];
  const played = [];
  const sleeps = [];
  const check = createScene6InvestigationStory({
    isTargetStage: () => manager.isQuestAtStage(questId, "QUEST_CH04_MAIN_001_STAGE_01"),
    getFlags: () => flags,
    setFlag: (flagId, value) => { flags[flagId] = value; },
    isCompleted: completionId => completed.includes(completionId),
    markCompleted: completionId => { completed.push(completionId); },
    play: async sectionId => {
      played.push(sectionId);
      if (sectionId === SCENE6_INVESTIGATION_FOURTH_DIALOGUE) {
        manager.handleEvent({ type: "dialogueCompleted", targetId: sectionId, eventId: "section-3-complete" });
      }
      return { completed: true };
    },
    sleep: async milliseconds => { sleeps.push(milliseconds); now += milliseconds; },
  });
  for (const interactionId of [
    "scene6-interaction-001", "scene6-interaction-002",
    "scene6-interaction-003", "scene6-interaction-004",
  ]) await check(interactionId);

  assert.deepEqual(played, [SCENE6_INVESTIGATION_DIALOGUE, SCENE6_INVESTIGATION_FOURTH_DIALOGUE]);
  assert.deepEqual(sleeps, [1250, 1500]);
  assert.equal(manager.getObjectiveProgress(questId, `${questId}_OBJ_01`).completed, true);
  assert.equal(manager.getObjectiveProgress(questId, `${questId}_OBJ_01`).completionPresented, false);
  assert.equal(manager.getCurrentStage(questId), "QUEST_CH04_MAIN_001_STAGE_01");

  const tick = async time => {
    now = time;
    let index;
    while ((index = timers.findIndex(timer => timer.at <= now)) >= 0) {
      timers.splice(index, 1)[0].callback();
    }
    await flush();
  };
  await tick(4999);
  assert.equal(manager.getCurrentStage(questId), "QUEST_CH04_MAIN_001_STAGE_01");
  await tick(5000);
  assert.equal(manager.getCurrentStage(questId), "QUEST_CH04_MAIN_001_STAGE_02");
});

test("OBJ 04 waits 1.25 seconds, plays section 4, then activates OBJ 05", async () => {
  const quest = structuredClone(source.quests.find(q => q.id === questId));
  quest.prerequisiteQuestIds = [];
  quest.startDelaySeconds = 0;
  quest.stages[0].startEventFlowId = "";
  quest.stages[0].objectives.find(objective => objective.id === `${questId}_OBJ_01`)
    .completionDelaySeconds = 0;
  let now = 1000;
  const timers = [];
  const opened = [];
  let completeSection4;
  const section4Completion = new Promise(resolve => { completeSection4 = resolve; });
  const manager = new QuestRuntimeManager(
    { schemaVersion: 1, chapters: source.chapters, quests: [quest] },
    {
      objectiveCompletionRules: QUEST_OBJECTIVE_COMPLETION_RULES,
      now: () => now,
      scheduleQuestStart: (delay, callback) => timers.push({ at: now + delay, callback }),
      runEventFlow: async flowId => {
        opened.push({ flowId, at: now });
        const flow = QUEST_STAGE_EVENT_FLOWS[flowId];
        for (const action of flow?.actions ?? []) {
          if (action.type === "playDialogue") {
            opened.push({ dialogueId: action.dialogueId, at: now });
            await section4Completion;
          } else if (action.type === "activateObjective") {
            manager.activateObjective(action.objectiveId, flowId);
          }
        }
        return true;
      },
    },
  );
  manager.startQuest(questId);
  manager.activateObjective(first);
  manager.activateObjective(second);
  manager.activateObjective(next, dialogueId);
  for (const objectiveId of [first, second, next, `${questId}_OBJ_01`]) {
    manager.completeObjective(questId, objectiveId);
  }
  assert.equal(manager.getCurrentStage(questId), "QUEST_CH04_MAIN_001_STAGE_02");

  const objective = quest.stages[1].objectives.find(candidate => candidate.id === signalSamplesObjectiveId);
  assert.deepEqual(objective.targetIds, [
    "scene6-interaction-009", "scene6-interaction-010", "scene6-interaction-011",
  ]);
  for (const [targetId, eventId] of [
    ["scene6-interaction-009", "sample-a"],
    ["scene6-interaction-009", "sample-a-repeat"],
    ["unrelated", "sample-other"],
    ["scene6-interaction-010", "sample-b"],
  ]) manager.handleEvent({ type: "interactionSucceeded", targetId, eventId });
  assert.equal(manager.getObjectiveProgress(questId, signalSamplesObjectiveId).currentAmount, 2);
  manager.handleEvent({
    type: "interactionSucceeded", targetId: "scene6-interaction-011", eventId: "sample-c",
  });
  assert.equal(manager.getObjectiveProgress(questId, signalSamplesObjectiveId).completed, true);
  assert.equal(manager.getObjectiveProgress(questId, signalSamplesNextObjectiveId).state, "locked");

  const tick = async time => {
    now = time;
    let index;
    while ((index = timers.findIndex(timer => timer.at <= now)) >= 0) {
      timers.splice(index, 1)[0].callback();
    }
    await flush();
  };
  await tick(2249);
  assert.deepEqual(opened.filter(entry => entry.flowId === signalSamplesFlowId), []);
  assert.equal(manager.getObjectiveProgress(questId, signalSamplesNextObjectiveId).state, "locked");
  await tick(2250);
  assert.deepEqual(opened.filter(entry => entry.flowId === signalSamplesFlowId), [
    { flowId: signalSamplesFlowId, at: 2250 },
  ]);
  assert.deepEqual(opened.filter(entry => entry.dialogueId === signalSamplesDialogueId), [
    { dialogueId: signalSamplesDialogueId, at: 2250 },
  ]);
  assert.equal(manager.getObjectiveProgress(questId, signalSamplesNextObjectiveId).state, "locked");
  completeSection4(true);
  await flush();
  await flush();
  assert.equal(manager.getObjectiveProgress(questId, signalSamplesNextObjectiveId).state, "active");
  assert.equal(
    manager.getObjectiveProgress(questId, signalSamplesNextObjectiveId).activatedByEventId,
    signalSamplesFlowId,
  );
});

for (const order of [[first, second], [second, first]]) {
  test(`both checked -> 1.5s -> dialogue -> unlock 13 (${order[0]} first)`, async () => {
    const h = harness();
    h.manager.completeObjective(questId, order[0]);
    await h.tick(5000);
    assert.deepEqual(h.opened, []);
    assert.equal(h.progress(next).state, "locked");
    h.manager.completeObjective(questId, order[1]);
    await h.tick(6499);
    assert.deepEqual(h.opened, []);
    await h.tick(6500);
    assert.deepEqual(h.opened, [{ id: dialogueId, at: 6500 }]);
    assert.equal(h.progress(`${questId}_OBJ_01`).completed, false, "不等待 OBJ 01 或整個 Stage");
    assert.equal(h.progress(next).state, "locked", "開啟對話不等於對話已播完");
    h.dialogues.completeCurrent();
    await flush();
    assert.equal(h.progress(next).state, "active");
    assert.equal(h.progress(next).completed, false);
    assert.equal(h.manager.exportSave().quests[questId].objectiveCompletionRules[ruleId].completed, true);
    h.manager.completeObjective(questId, first);
    h.manager.completeObjective(questId, second);
    await h.tick(10000);
    assert.equal(h.opened.length, 1);
    const restored = harness(h.manager.exportSave(), 11000);
    await restored.tick(20000);
    assert.deepEqual(restored.opened, [], "播完後讀檔不重播");
  });
}

test("countdown survives reload with only the remaining delay", async () => {
  const h = harness();
  h.manager.completeObjective(questId, first);
  h.manager.completeObjective(questId, second);
  await h.tick(1800);
  const restored = harness(h.manager.exportSave(), 1800);
  await restored.tick(2499);
  assert.deepEqual(restored.opened, []);
  await restored.tick(2500);
  assert.equal(restored.opened.length, 1);
});

test("cancelled dialogue does not unlock 13 and can resume after reload", async () => {
  const h = harness();
  h.manager.completeObjective(questId, first);
  h.manager.completeObjective(questId, second);
  await h.tick(2500);
  h.dialogues.cancelCurrent();
  await flush();
  assert.equal(h.progress(next).state, "locked");
  const restored = harness(h.manager.exportSave(), 3000);
  await restored.tick(3000);
  assert.equal(restored.opened.length, 1);
  restored.dialogues.completeCurrent();
  await flush();
  assert.equal(restored.progress(next).state, "active");
});

test("delay starts after both checkmark presentations and old timers cannot cross snapshot resets", async () => {
  const h = harness(undefined, 1000, 1);
  const initial = h.manager.exportSave();
  h.manager.completeObjective(questId, first);
  h.manager.completeObjective(questId, second);
  await h.tick(1999);
  assert.equal(h.manager.exportSave().quests[questId].objectiveCompletionRules, undefined);
  await h.tick(2000);
  assert.equal(h.manager.exportSave().quests[questId].objectiveCompletionRules[ruleId].availableAtEpochMs, 3500);
  h.manager.replaceSaveData(initial, false);
  await h.tick(5000);
  assert.deepEqual(h.opened, []);
  assert.equal(h.progress(next).state, "locked");
});
