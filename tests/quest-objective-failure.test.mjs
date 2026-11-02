import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { QuestRuntimeManager, evaluateQuestObjective } from "../app/quest-runtime-manager.ts";
import { AUDIO_EVENT_CONFIG, AudioEventManager } from "../app/audio-event-manager.ts";

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

const documentWith = (stageOneObjectives, stageTwoObjectives = [objective("QUEST_FAIL_OBJ_09")]) => ({
  schemaVersion: 1,
  chapters: [{ id: "CH03", name: "測試", completionQuestIds: [] }],
  quests: [{
    id: "QUEST_FAIL",
    name: "失敗測試",
    description: "",
    chapterId: "CH03",
    type: "main",
    prerequisiteQuestIds: [],
    grantMethod: "automatic",
    canAbandon: false,
    canReaccept: false,
    displayMode: "standard",
    stages: [
      { id: "QUEST_FAIL_STAGE_01", name: "一", completionMode: "all", nextStageId: "QUEST_FAIL_STAGE_02", objectives: stageOneObjectives },
      { id: "QUEST_FAIL_STAGE_02", name: "二", completionMode: "all", objectives: stageTwoObjectives },
    ],
  }],
});

const flush = () => new Promise(resolve => setImmediate(resolve));

test("scripted objectives ignore every player event and need no target", () => {
  const scripted = objective("QUEST_FAIL_OBJ_01");
  for (const type of ["itemCollected", "dialogueCompleted", "interactionSucceeded", "customQuestProgressAdded", "flagChanged"]) {
    assert.equal(evaluateQuestObjective({ ...scripted, targetId: "x" }, { type, targetId: "x", amount: 1, result: true }), null, type);
  }
  const manager = new QuestRuntimeManager(documentWith([scripted]));
  manager.startQuest("QUEST_FAIL");
  manager.handleEvent({ type: "dialogueCompleted", targetId: "" });
  assert.equal(manager.getObjectiveProgress("QUEST_FAIL", "QUEST_FAIL_OBJ_01").completed, false);
  assert.equal(manager.completeObjective("QUEST_FAIL", "QUEST_FAIL_OBJ_01"), true, "story code can still complete it");
});

test("event and dialogue-start failure triggers fail at once (delay 0) and only for the matching event type", () => {
  const failed = [];
  const manager = new QuestRuntimeManager(documentWith([
    objective("QUEST_FAIL_OBJ_01", { failureTriggerType: "event", failureTriggerId: "alarm-flag" }),
    objective("QUEST_FAIL_OBJ_02", { failureTriggerType: "dialogueStarted", failureTriggerId: "talk" }),
    objective("QUEST_FAIL_OBJ_03", { failureTriggerType: "dialogueCompleted", failureTriggerId: "talk" }),
    objective("QUEST_FAIL_OBJ_04", { failureTriggerType: "none", failureTriggerId: "alarm-flag" }),
  ]), { onObjectiveFailed: (_questId, objectiveId) => failed.push(objectiveId) });
  manager.startQuest("QUEST_FAIL");
  manager.handleEvent({ type: "dialogueStarted", targetId: "alarm-flag" });
  assert.deepEqual(failed, [], "event mode ignores dialogue starts, like event activation");
  manager.handleEvent({ type: "flagChanged", targetId: "alarm-flag", result: true });
  assert.deepEqual(failed, ["QUEST_FAIL_OBJ_01"]);
  manager.handleEvent({ type: "dialogueStarted", targetId: "talk" });
  assert.deepEqual(failed, ["QUEST_FAIL_OBJ_01", "QUEST_FAIL_OBJ_02"]);
  manager.handleEvent({ type: "dialogueCompleted", targetId: "talk" });
  assert.deepEqual(failed, ["QUEST_FAIL_OBJ_01", "QUEST_FAIL_OBJ_02", "QUEST_FAIL_OBJ_03"]);
  assert.equal(manager.getObjectiveProgress("QUEST_FAIL", "QUEST_FAIL_OBJ_04").failed, undefined);
});

test("failure triggers only listen while their stage is current", () => {
  const failed = [];
  const manager = new QuestRuntimeManager(documentWith(
    [objective("QUEST_FAIL_OBJ_01", { type: "collectItem", targetId: "R0001" })],
    [objective("QUEST_FAIL_OBJ_02", { failureTriggerType: "event", failureTriggerId: "early" })],
  ), { onObjectiveFailed: (_questId, objectiveId) => failed.push(objectiveId) });
  manager.startQuest("QUEST_FAIL");
  manager.handleEvent({ type: "flagChanged", targetId: "early", result: true });
  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 1 });
  assert.equal(manager.getCurrentStage("QUEST_FAIL"), "QUEST_FAIL_STAGE_02");
  assert.deepEqual(failed, [], "an event before the stage started does not fail it later");
  manager.handleEvent({ type: "flagChanged", targetId: "early", result: true });
  assert.deepEqual(failed, ["QUEST_FAIL_OBJ_02"]);
});

test("an event-flow follow-up runs through runEventFlow once a story-code failure happens", async () => {
  const flows = [];
  const manager = new QuestRuntimeManager(documentWith([
    objective("QUEST_FAIL_OBJ_01", { failedTriggerType: "eventFlow", failedTriggerId: "after-fail-flow" }),
  ]), { runEventFlow: async flowId => { flows.push(flowId); return false; } });
  manager.startQuest("QUEST_FAIL");
  assert.equal(manager.failObjective("QUEST_FAIL", "QUEST_FAIL_OBJ_01"), true);
  await flush();
  assert.deepEqual(flows, ["after-fail-flow"]);
  const progress = manager.getObjectiveProgress("QUEST_FAIL", "QUEST_FAIL_OBJ_01");
  assert.equal(progress.failedTriggerCompleted, false, "a cancelled flow is retried after a reload");
  const restoredFlows = [];
  new QuestRuntimeManager(documentWith([
    objective("QUEST_FAIL_OBJ_01", { failedTriggerType: "eventFlow", failedTriggerId: "after-fail-flow" }),
  ]), { runEventFlow: async flowId => { restoredFlows.push(flowId); return true; } }, manager.exportSave());
  await flush();
  assert.deepEqual(restoredFlows, ["after-fail-flow"]);
});

test("a stage early-end trigger ends the stage with unfinished OBJs, honours the completion delay and survives a reload", () => {
  let now = 1000;
  const timers = [];
  const host = () => ({ now: () => now, scheduleQuestStart: (delay, run) => timers.push({ at: now + delay, run }) });
  const advance = ms => {
    now += ms;
    for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) {
      if (timer.at <= now) timer.run(); else timers.push(timer);
    }
  };
  const doc = documentWith([objective("QUEST_FAIL_OBJ_01", { type: "collectItem", targetId: "R0001" })]);
  Object.assign(doc.quests[0].stages[0], { endTriggerType: "event", endTriggerId: "evacuate", completionDelaySeconds: 2 });
  const manager = new QuestRuntimeManager(doc, host());
  manager.startQuest("QUEST_FAIL");
  manager.handleEvent({ type: "dialogueStarted", targetId: "evacuate" });
  manager.handleEvent({ type: "flagChanged", targetId: "evacuate", result: true });
  assert.equal(manager.getCurrentStage("QUEST_FAIL"), "QUEST_FAIL_STAGE_01", "waits for the completion delay");
  const saved = manager.exportSave();
  advance(2000);
  assert.equal(manager.getCurrentStage("QUEST_FAIL"), "QUEST_FAIL_STAGE_02");
  assert.equal(manager.getObjectiveProgress("QUEST_FAIL", "QUEST_FAIL_OBJ_01").completed, false, "the OBJ was not completed for it");

  const restored = new QuestRuntimeManager(doc, host(), saved);
  advance(2000);
  assert.equal(restored.getCurrentStage("QUEST_FAIL"), "QUEST_FAIL_STAGE_02", "a reload during the delay still switches");
});

test("restarting the quest during the follow-up delay still runs the new failure's follow-up", async () => {
  let now = 1000;
  const timers = [];
  const advance = ms => {
    now += ms;
    for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) {
      if (timer.at <= now) timer.run(); else timers.push(timer);
    }
  };
  const played = [];
  const doc = documentWith([
    objective("QUEST_FAIL_OBJ_01", { failedTriggerType: "dialogue", failedTriggerId: "after-fail", failedTriggerDelaySeconds: 3 }),
  ]);
  const manager = new QuestRuntimeManager(doc, {
    now: () => now,
    scheduleQuestStart: (delay, run) => timers.push({ at: now + delay, run }),
    runCompletionTrigger: async (type, id) => { played.push(`${type}:${id}`); return true; },
  });
  manager.startQuest("QUEST_FAIL");
  manager.failObjective("QUEST_FAIL", "QUEST_FAIL_OBJ_01");
  advance(1000);
  // 等待後續對話期間重新開始任務，再讓同一個 OBJ 失敗
  manager.restartQuest("QUEST_FAIL");
  manager.startQuest("QUEST_FAIL");
  assert.equal(manager.failObjective("QUEST_FAIL", "QUEST_FAIL_OBJ_01"), true);
  advance(2000); // 舊排程到期：屬於舊的任務實例，不可播放
  await flush();
  assert.deepEqual(played, []);
  advance(1000); // 新排程到期
  await flush();
  assert.deepEqual(played, ["dialogue:after-fail"]);
  assert.equal(manager.getObjectiveProgress("QUEST_FAIL", "QUEST_FAIL_OBJ_01").failedTriggerCompleted, true);
});

test("every OBJ X plays interaction-denied once, on its own overlapping voice managed by AudioEventManager", async () => {
  const event = AUDIO_EVENT_CONFIG.questObjectiveFailed;
  assert.deepEqual(event.sources, ["./audio/interaction-denied.mp3"]);
  assert.deepEqual(event.sourceAssetPaths, ["Assets/Audio/互動否定.mp3"]);
  assert.equal(event.delaySeconds, 0);
  assert.equal(event.fadeInPercent, 0, "overlap needs a plain one-shot");
  assert.equal(event.fadeOutPercent, 0);
  assert.equal(event.loop, undefined);
  assert.equal(event.maxOverlappingVoices, undefined, "no cap: every X is heard");
  assert.equal(event.maxPlaysPerWindow, undefined);

  // 打叉 Tween 開始時播放；打勾維持原本的單軌重播
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!failed\) playOneShotAudio\("questObjectiveCompleted"\);\s*\/\/[^\n]*\n\s*else void audioEventManagerRef\.current\?\.play\("questObjectiveFailed", \{ overlap: true \}\)/);
  assert.match(source, /onObjectiveFailed: \(questId, objectiveId, _stageId, entry\) => \{[^}]*triggerQuestObjectiveTween\(view, objectiveId, true\)/);

  const originalAudio = globalThis.Audio;
  const created = [];
  globalThis.Audio = class {
    constructor(src = "") { Object.assign(this, { src, paused: true, playCount: 0, volume: 1, loop: false, currentTime: 0 }); created.push(this); }
    addEventListener() {}
    removeEventListener() {}
    load() {}
    pause() { this.paused = true; }
    play() { this.paused = false; this.playCount += 1; return Promise.resolve(); }
  };
  try {
    const manager = new AudioEventManager();
    const before = created.length;
    // 兩項同時打叉，再一項緊接著打叉：三聲都在播，先前的沒有被暫停或重來
    await Promise.all([1, 2].map(() => manager.play("questObjectiveFailed", { overlap: true })));
    await manager.play("questObjectiveFailed", { overlap: true });
    const voices = created.slice(before);
    assert.equal(voices.length, 3);
    assert.deepEqual(voices.map(voice => voice.src), Array(3).fill("./audio/interaction-denied.mp3"));
    assert.deepEqual(voices.map(voice => [voice.paused, voice.playCount]), Array(3).fill([false, 1]));
    assert.ok(voices.every(voice => voice.volume === event.volume));
    manager.dispose();
  } finally {
    globalThis.Audio = originalAudio;
  }
});

test("objectives without failure settings keep their old save shape", () => {
  const manager = new QuestRuntimeManager(documentWith([objective("QUEST_FAIL_OBJ_01")]));
  manager.startQuest("QUEST_FAIL");
  manager.failObjective("QUEST_FAIL", "QUEST_FAIL_OBJ_01");
  const progress = manager.getObjectiveProgress("QUEST_FAIL", "QUEST_FAIL_OBJ_01");
  assert.equal(progress.failedTriggerCompleted, undefined);
  assert.equal(progress.failedTriggerAvailableAtEpochMs, undefined);
  assert.equal(progress.failureDueAtEpochMs, undefined);
});
