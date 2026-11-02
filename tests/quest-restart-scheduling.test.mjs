import assert from "node:assert/strict";
import test from "node:test";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";

// 重新開始任務（含 failureMode = restartQuest）會換成新的任務實例；
// 舊實例留下的排程既不能擋住新排程，也不能替新實例標記完成。

const objective = (id, extra = {}) => ({
  id,
  displayText: id,
  type: "scripted",
  targetId: "",
  requiredAmount: 1,
  countMode: "accumulated",
  interactionMode: "succeeded",
  showProgress: false,
  showHintIcon: false,
  ...extra,
});

const QUEST = "QUEST_RESTART";
const OBJ_01 = "QUEST_RESTART_OBJ_01";
const OBJ_09 = "QUEST_RESTART_OBJ_09";

const documentWith = ({ stageOne = {}, stageTwo = {}, quest = {}, objectiveOne = {} } = {}) => ({
  schemaVersion: 1,
  chapters: [{ id: "CH03", name: "測試", completionQuestIds: [] }],
  quests: [{
    id: QUEST,
    name: "重新開始測試",
    description: "",
    chapterId: "CH03",
    type: "main",
    prerequisiteQuestIds: [],
    grantMethod: "automatic",
    canAbandon: false,
    canReaccept: false,
    displayMode: "standard",
    ...quest,
    stages: [
      { id: "QUEST_RESTART_STAGE_01", name: "一", completionMode: "all", nextStageId: "QUEST_RESTART_STAGE_02", objectives: [objective(OBJ_01, objectiveOne)], ...stageOne },
      { id: "QUEST_RESTART_STAGE_02", name: "二", completionMode: "all", objectives: [objective(OBJ_09)], ...stageTwo },
    ],
  }],
});

const createClock = () => {
  let now = 1000;
  const timers = [];
  return {
    now: () => now,
    scheduleQuestStart: (delay, run) => timers.push({ at: now + delay, run }),
    advance(ms) {
      now += ms;
      for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) {
        if (timer.at <= now) timer.run(); else timers.push(timer);
      }
    },
  };
};

const flush = () => new Promise(resolve => setImmediate(resolve));

const restart = (manager) => {
  manager.restartQuest(QUEST);
  manager.startQuest(QUEST);
};

test("an OBJ completion event flow still in progress during a restart neither blocks nor completes the new instance's flow", async () => {
  const flows = [];
  const manager = new QuestRuntimeManager(documentWith({ objectiveOne: { completionEventFlowId: "after-done-flow" } }), {
    runEventFlow: flowId => new Promise(resolve => flows.push({ flowId, resolve })),
  });
  manager.startQuest(QUEST);
  manager.completeObjective(QUEST, OBJ_01);
  assert.equal(flows.length, 1);

  restart(manager);
  manager.completeObjective(QUEST, OBJ_01);
  assert.equal(flows.length, 2, "the new instance starts its own completion event flow");

  flows[0].resolve(true);
  await flush();
  assert.equal(manager.getObjectiveProgress(QUEST, OBJ_01).completionEventCompleted, false,
    "the old instance's flow does not complete the new OBJ");
  assert.equal(manager.getCurrentStage(QUEST), "QUEST_RESTART_STAGE_01");

  flows[1].resolve(true);
  await flush();
  assert.equal(manager.getObjectiveProgress(QUEST, OBJ_01).completionEventCompleted, true);
  assert.equal(manager.getCurrentStage(QUEST), "QUEST_RESTART_STAGE_02");
});

test("an old OBJ completion presentation timer does not present the restarted OBJ early", () => {
  const clock = createClock();
  const completed = [];
  const manager = new QuestRuntimeManager(documentWith({ objectiveOne: { completionDelaySeconds: 3 } }), {
    ...clock,
    onObjectiveCompleted: (_questId, objectiveId) => completed.push(objectiveId),
  });
  manager.startQuest(QUEST);
  manager.completeObjective(QUEST, OBJ_01);
  clock.advance(1000);
  restart(manager);
  manager.completeObjective(QUEST, OBJ_01);
  clock.advance(2000); // 舊實例到期
  assert.equal(manager.getObjectiveProgress(QUEST, OBJ_01).completionPresented, false);
  assert.deepEqual(completed, []);
  clock.advance(1000); // 新實例到期
  assert.equal(manager.getObjectiveProgress(QUEST, OBJ_01).completionPresented, true);
  assert.deepEqual(completed, [OBJ_01]);
});

test("a stage completion delay left by the old instance does not block the restarted stage's delay", () => {
  const clock = createClock();
  const manager = new QuestRuntimeManager(documentWith({
    stageOne: { completionDelaySeconds: 1 },
    stageTwo: { completionDelaySeconds: 5 },
  }), clock);
  manager.startQuest(QUEST);
  manager.completeObjective(QUEST, OBJ_01);
  clock.advance(1000);
  assert.equal(manager.getCurrentStage(QUEST), "QUEST_RESTART_STAGE_02");
  manager.completeObjective(QUEST, OBJ_09); // STAGE_02 的 5 秒完成延遲開始倒數

  restart(manager);
  manager.completeObjective(QUEST, OBJ_01);
  clock.advance(1000);
  assert.equal(manager.getCurrentStage(QUEST), "QUEST_RESTART_STAGE_02", "the new STAGE_01 switches after its own 1 s");
});

test("a quest completion trigger delay left by the old instance neither blocks nor fires the new one early", async () => {
  const clock = createClock();
  const played = [];
  const manager = new QuestRuntimeManager(documentWith({
    quest: { completionTriggerType: "dialogue", completionTriggerId: "done-talk", completionTriggerDelaySeconds: 3 },
  }), {
    ...clock,
    runCompletionTrigger: async (type, id) => { played.push(`${type}:${id}`); return true; },
  });
  manager.startQuest(QUEST);
  manager.completeObjective(QUEST, OBJ_01);
  manager.completeObjective(QUEST, OBJ_09);
  assert.equal(manager.getQuestState(QUEST), "completed");
  clock.advance(1000);
  restart(manager);
  manager.completeObjective(QUEST, OBJ_01);
  manager.completeObjective(QUEST, OBJ_09);
  clock.advance(2000); // 舊實例到期
  await flush();
  assert.deepEqual(played, []);
  clock.advance(1000); // 新實例到期
  await flush();
  assert.deepEqual(played, ["dialogue:done-talk"]);
  assert.equal(manager.exportSave().quests[QUEST].completionTriggerCompleted, true);
});
