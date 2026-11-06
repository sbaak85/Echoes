import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { isQuestObjectiveVisible } from "../app/quest-hud-timing.ts";
import { ChapterFlowManager } from "../app/chapter-flow-manager.ts";
import { AUDIO_EVENT_CONFIG } from "../app/audio-event-manager.ts";
import {
  CHAPTER02_CIRCUIT_AFTERSHOCK,
  CHAPTER02_CIRCUIT_AFTERSHOCK_FADE_PORTION,
  CHAPTER02_CIRCUIT_SHAKE,
  CHAPTER02_SHAKE_LEVELS,
  RepeatingCameraShake,
  ScriptedCameraShake,
} from "../app/camera-shake.ts";
import {
  CHAPTER02_CIRCUIT_BLACKOUT_FLOW,
  CHAPTER02_CIRCUIT_BLACKOUT_LINE_ID,
  CHAPTER02_CIRCUIT_COLLECT_OBJECTIVE_ID,
  CHAPTER02_CIRCUIT_DIALOGUE,
  CHAPTER02_CIRCUIT_DIALOGUE_DELAY_MS,
  CHAPTER02_CIRCUIT_HULL_BREACH_AUDIO_EVENTS,
  CHAPTER02_CIRCUIT_HULL_BREACH_LINE_ID,
  CHAPTER02_CIRCUIT_ITEM_ID,
  CHAPTER02_CIRCUIT_LINE_AUDIO_EVENTS,
  CHAPTER02_CIRCUIT_QUEST_ID,
  CHAPTER02_CIRCUIT_SHAKE_LINE_ID,
  CHAPTER02_CIRCUIT_STAGE_ID,
  shouldPlayChapter02CircuitDialogue,
} from "../app/chapter02-circuit-failure.ts";

const doc = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
const OBJ_01 = "QUEST_CH02_MAIN_006_OBJ_01";
const OBJ_02 = "QUEST_CH02_MAIN_006_OBJ_02";
const OBJ_03 = "QUEST_CH02_MAIN_006_OBJ_03";
const LANDING_STAGE_ID = "QUEST_CH02_MAIN_006_STAGE_02";
const FOLLOW_UP_DIALOGUE = "chapter02-section-17";
const storyContent = readFileSync(new URL("../app/story-content.ts", import.meta.url), "utf8");
const circuitStage = () => doc.quests.find(q => q.id === CHAPTER02_CIRCUIT_QUEST_ID).stages.find(s => s.id === CHAPTER02_CIRCUIT_STAGE_ID);
/** 黑畫面在 section-16 播完後再停 2 秒、淡出 1.5 秒；亮回後再過 1 秒 OBJ 失敗 */
const FAIL_AFTER_SECTION_16_MS = CHAPTER02_CIRCUIT_BLACKOUT_FLOW.actions
  .slice(CHAPTER02_CIRCUIT_BLACKOUT_FLOW.actions.findIndex(action => action.type === "waitForDialogueEnd") + 1)
  .reduce((total, action) => total + action.durationMs, 0) + 1000;

test("constants match the quest data, item database and dialogue lines", () => {
  assert.equal(CHAPTER02_CIRCUIT_ITEM_ID, "Q0005");
  assert.equal(CHAPTER02_CIRCUIT_DIALOGUE, "chapter02-section-16");
  assert.equal(CHAPTER02_CIRCUIT_DIALOGUE_DELAY_MS, 500);
  assert.equal(CHAPTER02_CIRCUIT_COLLECT_OBJECTIVE_ID, OBJ_02);
  const obj02 = circuitStage().objectives.find(o => o.id === OBJ_02);
  assert.equal(obj02.type, "collectItem");
  assert.equal(obj02.targetId, CHAPTER02_CIRCUIT_ITEM_ID);
  assert.match(readFileSync(new URL("../app/item-database.ts", import.meta.url), "utf8"), /id: "Q0005"/);
  for (const lineId of [CHAPTER02_CIRCUIT_SHAKE_LINE_ID, CHAPTER02_CIRCUIT_BLACKOUT_LINE_ID]) {
    assert.ok(storyContent.includes(lineId), lineId);
  }
  assert.match(storyContent, /"id": "chapter02-section-17"/);
});

test("quest data: OBJ_01 is scripted; both OBJs fail 1 s after the section-16 blackout clears; OBJ_01 then plays section-17 after 3 s", () => {
  assert.equal(FAIL_AFTER_SECTION_16_MS, 4500);
  const [obj01, obj02] = [OBJ_01, OBJ_02].map(id => circuitStage().objectives.find(o => o.id === id));
  assert.equal(obj01.type, "scripted", "no Target ID needed, never completed by the player");
  for (const objective of [obj01, obj02]) {
    assert.equal(objective.failureTriggerType, "dialogueCompleted", objective.id);
    assert.equal(objective.failureTriggerId, CHAPTER02_CIRCUIT_DIALOGUE, objective.id);
    assert.equal(objective.failureDelaySeconds * 1000, FAIL_AFTER_SECTION_16_MS, objective.id);
  }
  assert.equal(obj01.failedTriggerType, "dialogue");
  assert.equal(obj01.failedTriggerId, FOLLOW_UP_DIALOGUE);
  assert.equal(obj01.failedTriggerDelaySeconds, 3);
  assert.equal(obj02.failedTriggerType, undefined, "section-17 is played once, from OBJ_01 only");
  // section-17 播完：STAGE_01 不管失敗的 OBJ 直接結束，STAGE_02 的 OBJ_03 延遲 0.5 秒啟動
  assert.equal(circuitStage().endTriggerType, "dialogueCompleted");
  assert.equal(circuitStage().endTriggerId, FOLLOW_UP_DIALOGUE);
  assert.equal(circuitStage().nextStageId, LANDING_STAGE_ID);
  const landingStage = doc.quests.find(q => q.id === CHAPTER02_CIRCUIT_QUEST_ID).stages.find(s => s.id === LANDING_STAGE_ID);
  assert.equal(landingStage.startDelaySeconds, 0);
  const obj03 = landingStage.objectives.find(o => o.id === OBJ_03);
  assert.equal(obj03.startDelaySeconds, 0.5);
  assert.equal(obj03.activationMode, "immediate");
});

function createClock() {
  let now = 1_000_000;
  const timers = [];
  return {
    now: () => now,
    schedule: (delay, run) => timers.push({ at: now + delay, run }),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        if (!timers.length || timers[0].at > end) break;
        const timer = timers.shift();
        now = Math.max(now, timer.at);
        timer.run();
      }
      now = end;
    },
  };
}

function createCircuitRun(clock, save, played = []) {
  // 單獨測任務 6：拿掉前置任務 MAIN_005 才能直接開始
  const isolated = structuredClone(doc);
  isolated.quests.find(q => q.id === CHAPTER02_CIRCUIT_QUEST_ID).prerequisiteQuestIds = [];
  const failedEvents = [];
  const manager = new QuestRuntimeManager(isolated, {
    now: clock.now,
    scheduleQuestStart: clock.schedule,
    onObjectiveFailed: (_questId, objectiveId) => failedEvents.push(objectiveId),
    runCompletionTrigger: async (type, triggerId) => {
      played.push(`${type}:${triggerId}`);
      return true;
    },
  }, save);
  return { manager, failedEvents, played };
}

function reachSection16(clock) {
  const run = createCircuitRun(clock);
  run.manager.startQuest(CHAPTER02_CIRCUIT_QUEST_ID);
  clock.advance(0);
  run.manager.activateObjective(OBJ_02, "chapter02-section-15");
  run.manager.handleEvent({ type: "itemCollected", targetId: CHAPTER02_CIRCUIT_ITEM_ID, amount: 1, eventId: "itemCollected:test" });
  assert.equal(run.manager.getObjectiveProgress(CHAPTER02_CIRCUIT_QUEST_ID, OBJ_02).completed, true, "checked immediately on pickup");
  run.manager.handleEvent({ type: "dialogueCompleted", targetId: CHAPTER02_CIRCUIT_DIALOGUE, eventId: "dialogueCompleted:test" });
  return run;
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test("section-16 finished → both OBJs (even the checked one) fail 4.5 s later, stay listed with X and survive a reload", async () => {
  const clock = createClock();
  const { manager, failedEvents, played } = reachSection16(clock);
  clock.advance(FAIL_AFTER_SECTION_16_MS - 1);
  assert.deepEqual(failedEvents, [], "still waiting for the blackout to clear");
  clock.advance(1);
  assert.deepEqual(failedEvents, [OBJ_01, OBJ_02]);
  assert.equal(manager.failObjective(CHAPTER02_CIRCUIT_QUEST_ID, OBJ_01), false, "only fails once");

  manager.handleEvent({ type: "itemCollected", targetId: CHAPTER02_CIRCUIT_ITEM_ID, amount: 1, eventId: "itemCollected:again" });
  for (const id of [OBJ_01, OBJ_02]) {
    const progress = manager.getObjectiveProgress(CHAPTER02_CIRCUIT_QUEST_ID, id);
    assert.equal(progress.failed, true, id);
    assert.equal(progress.state, "failed", id);
    assert.equal(progress.completed, false, `${id}: the X replaces the check`);
    assert.equal(isQuestObjectiveVisible(progress, clock.now()), true, "still shown on the HUD");
    assert.equal(manager.isObjectiveInProgress(CHAPTER02_CIRCUIT_QUEST_ID, id), false);
  }
  assert.equal(manager.isQuestAtStage(CHAPTER02_CIRCUIT_QUEST_ID, CHAPTER02_CIRCUIT_STAGE_ID), true, "failure does not advance the stage");

  // 3 秒後只播一次 section-17
  clock.advance(2999);
  assert.deepEqual(played, []);
  clock.advance(1);
  await flush();
  assert.deepEqual(played, [`dialogue:${FOLLOW_UP_DIALOGUE}`]);
  manager.handleEvent({ type: "dialogueCompleted", targetId: FOLLOW_UP_DIALOGUE });
  clock.advance(10000);
  await flush();

  const restored = createCircuitRun(clock, manager.exportSave());
  clock.advance(10000);
  await flush();
  assert.deepEqual(restored.played, [], "a played section-17 is not replayed after a reload");
  for (const id of [OBJ_01, OBJ_02]) {
    const progress = restored.manager.getObjectiveProgress(CHAPTER02_CIRCUIT_QUEST_ID, id);
    assert.equal(progress.state, "failed", id);
    assert.equal(progress.completed, false, id);
  }
});

test("a reload during the 4.5 s failure delay or the 3 s section-17 delay continues the saved countdown", async () => {
  const clock = createClock();
  const { manager } = reachSection16(clock);
  clock.advance(2000);
  const midFailure = createCircuitRun(clock, manager.exportSave());
  clock.advance(FAIL_AFTER_SECTION_16_MS - 2000 - 1);
  assert.deepEqual(midFailure.failedEvents, []);
  clock.advance(1);
  assert.deepEqual(midFailure.failedEvents, [OBJ_01, OBJ_02]);

  clock.advance(1000);
  const midFollowUp = createCircuitRun(clock, midFailure.manager.exportSave());
  clock.advance(1999);
  await flush();
  assert.deepEqual(midFollowUp.played, []);
  clock.advance(1);
  await flush();
  assert.deepEqual(midFollowUp.played, [`dialogue:${FOLLOW_UP_DIALOGUE}`]);
});

test("section-17 interrupted, or OBJs failed by an older build, is replayed after a reload until it completes", async () => {
  const clock = createClock();
  const first = reachSection16(clock);
  clock.advance(FAIL_AFTER_SECTION_16_MS);
  // 舊版存檔：OBJ 已失敗，但沒有失敗後觸發的紀錄
  const legacy = first.manager.exportSave();
  delete legacy.quests[CHAPTER02_CIRCUIT_QUEST_ID].objectives[OBJ_01].failedTriggerCompleted;
  const legacyRun = createCircuitRun(clock, legacy);
  clock.advance(3000);
  await flush();
  assert.deepEqual(legacyRun.played, [`dialogue:${FOLLOW_UP_DIALOGUE}`]);
  const alreadyPlayed = structuredClone(legacy);
  alreadyPlayed.completedDialogueIds = [...alreadyPlayed.completedDialogueIds, FOLLOW_UP_DIALOGUE];
  const alreadyPlayedRun = createCircuitRun(clock, alreadyPlayed);
  clock.advance(5000);
  await flush();
  assert.deepEqual(alreadyPlayedRun.played, [], "an older save that already played section-17 is left alone");
});

test("a save from the old build, made after section-16 but before the OBJs failed, fails them on load and continues to section-17", async () => {
  const clock = createClock();
  const { manager } = reachSection16(clock);
  // 舊版存檔：section-16 已播完、OBJ 還沒失敗，而且沒有失敗倒數（舊版由程式寫死處理）
  const legacy = manager.exportSave();
  delete legacy.objectiveFailureTriggersTracked;
  for (const id of [OBJ_01, OBJ_02]) delete legacy.quests[CHAPTER02_CIRCUIT_QUEST_ID].objectives[id].failureDueAtEpochMs;
  const restored = createCircuitRun(clock, legacy);
  clock.advance(0);
  assert.deepEqual(restored.failedEvents, [OBJ_01, OBJ_02], "fails right away, like the old reload path");
  clock.advance(3000);
  await flush();
  assert.deepEqual(restored.played, [`dialogue:${FOLLOW_UP_DIALOGUE}`]);

  // 新版存檔不靠對話紀錄補算：section-16 在 Stage 開始前播過，不會讓 OBJ 失敗
  const tracked = createCircuitRun(clock);
  tracked.manager.startQuest(CHAPTER02_CIRCUIT_QUEST_ID);
  const current = tracked.manager.exportSave();
  current.completedDialogueIds = [...(current.completedDialogueIds ?? []), CHAPTER02_CIRCUIT_DIALOGUE];
  const reloaded = createCircuitRun(clock, current);
  clock.advance(10000);
  assert.deepEqual(reloaded.failedEvents, []);
});

test("section-17 finished → STAGE_01 ends despite its failed OBJs; OBJ_03 starts 0.5 s into STAGE_02, also after a reload", async () => {
  const clock = createClock();
  const { manager } = reachSection16(clock);
  clock.advance(FAIL_AFTER_SECTION_16_MS + 3000);
  await flush();
  assert.equal(manager.getCurrentStage(CHAPTER02_CIRCUIT_QUEST_ID), CHAPTER02_CIRCUIT_STAGE_ID, "failed OBJs alone never end STAGE_01");
  manager.handleEvent({ type: "dialogueStarted", targetId: FOLLOW_UP_DIALOGUE });
  assert.equal(manager.getCurrentStage(CHAPTER02_CIRCUIT_QUEST_ID), CHAPTER02_CIRCUIT_STAGE_ID, "only the end of section-17 counts");
  const beforeEnd = manager.exportSave();
  manager.handleEvent({ type: "dialogueCompleted", targetId: FOLLOW_UP_DIALOGUE, eventId: "dialogueCompleted:17" });
  assert.equal(manager.getCurrentStage(CHAPTER02_CIRCUIT_QUEST_ID), LANDING_STAGE_ID);
  assert.equal(manager.isObjectiveInProgress(CHAPTER02_CIRCUIT_QUEST_ID, OBJ_03), false, "not yet");
  clock.advance(499);
  assert.equal(manager.isObjectiveInProgress(CHAPTER02_CIRCUIT_QUEST_ID, OBJ_03), false);
  clock.advance(1);
  assert.equal(manager.isObjectiveInProgress(CHAPTER02_CIRCUIT_QUEST_ID, OBJ_03), true, "0.5 s after section-17");
  for (const id of [OBJ_01, OBJ_02]) {
    assert.equal(manager.getObjectiveProgress(CHAPTER02_CIRCUIT_QUEST_ID, id).state, "failed", `${id} keeps its X`);
  }

  // section-17 播到一半中斷再讀檔：仍停在 STAGE_01，等重新播完才切換
  const restored = createCircuitRun(clock, beforeEnd);
  clock.advance(5000);
  await flush();
  assert.equal(restored.manager.getCurrentStage(CHAPTER02_CIRCUIT_QUEST_ID), CHAPTER02_CIRCUIT_STAGE_ID);
  restored.manager.handleEvent({ type: "dialogueCompleted", targetId: FOLLOW_UP_DIALOGUE });
  assert.equal(restored.manager.getCurrentStage(CHAPTER02_CIRCUIT_QUEST_ID), LANDING_STAGE_ID);
});

test("the 4 crew NPCs leave the moment OBJ_02 completes and stay gone through its failure, STAGE_02 and a reload", async () => {
  const { hasChapter02CrewDeparted, CHAPTER02_CREW_DEPARTURE_OBJECTIVE_ID, CHAPTER02_BRIDGE_ASSEMBLY_POINTS } = await import("../app/chapter02-bridge-assembly.ts");
  assert.equal(CHAPTER02_CREW_DEPARTURE_OBJECTIVE_ID, OBJ_02);
  const crew = Object.keys(CHAPTER02_BRIDGE_ASSEMBLY_POINTS);
  assert.deepEqual(crew.sort(), ["npc-captain", "npc-ian", "npc-owen", "npc-rena"]);
  const departed = manager => crew.map(id => hasChapter02CrewDeparted(id, manager));

  const clock = createClock();
  const run = createCircuitRun(clock);
  run.manager.startQuest(CHAPTER02_CIRCUIT_QUEST_ID);
  clock.advance(0);
  run.manager.activateObjective(OBJ_02, "chapter02-section-15");
  assert.deepEqual(departed(run.manager), [false, false, false, false], "still aboard before the pickup");
  run.manager.handleEvent({ type: "itemCollected", targetId: CHAPTER02_CIRCUIT_ITEM_ID, amount: 1, eventId: "itemCollected:test" });
  assert.deepEqual(departed(run.manager), [true, true, true, true], "gone on the same frame as the check");
  assert.equal(hasChapter02CrewDeparted("npc-someone-else", run.manager), false, "only these 4");

  // section-16 播完 4.5 秒 OBJ_02 改成失敗（清掉已完成），NPC 不可回來
  run.manager.handleEvent({ type: "dialogueCompleted", targetId: CHAPTER02_CIRCUIT_DIALOGUE, eventId: "dialogueCompleted:test" });
  clock.advance(FAIL_AFTER_SECTION_16_MS);
  assert.equal(run.manager.getObjectiveProgress(CHAPTER02_CIRCUIT_QUEST_ID, OBJ_02).completed, false);
  assert.deepEqual(departed(run.manager), [true, true, true, true], "the X does not bring them back");
  assert.deepEqual(departed(createCircuitRun(clock, run.manager.exportSave()).manager), [true, true, true, true], "reload while failed");

  clock.advance(3000);
  await flush();
  run.manager.handleEvent({ type: "dialogueCompleted", targetId: FOLLOW_UP_DIALOGUE, eventId: "dialogueCompleted:17" });
  assert.equal(run.manager.getCurrentStage(CHAPTER02_CIRCUIT_QUEST_ID), LANDING_STAGE_ID);
  assert.deepEqual(departed(createCircuitRun(clock, run.manager.exportSave()).manager), [true, true, true, true], "reload in STAGE_02");

  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /const isSceneNpcOnStage = \(npc: SceneNpcDefinition, sceneId = SCENE_DATA\.sceneId\) => \{\s*\/\/[^\n]*\n\s*if \(sceneId === RED_ALERT_SCENE_ID && hasChapter02CrewDeparted\(npc\.id, crewDepartureQuery\)\) return false;/);
  assert.match(source, /if \(!isSceneNpcOnStage\(sceneNpc, scene\.sceneId\)\) continue;/);
});

test("pickup / reload only plays section-16 while it is unfinished", () => {
  const quest = (atStage, played) => ({
    isQuestAtStage: (q, s) => atStage && q === CHAPTER02_CIRCUIT_QUEST_ID && s === CHAPTER02_CIRCUIT_STAGE_ID,
    hasDialogueCompleted: id => played && id === CHAPTER02_CIRCUIT_DIALOGUE,
  });
  assert.equal(shouldPlayChapter02CircuitDialogue(quest(true, false), true), true);
  assert.equal(shouldPlayChapter02CircuitDialogue(quest(true, false), false), false);
  assert.equal(shouldPlayChapter02CircuitDialogue(quest(true, true), true), false, "the quest data handles failure after section-16");
  assert.equal(shouldPlayChapter02CircuitDialogue(quest(false, false), true), false);
});

test("line-003 shake: ±5px, 0.35s per shake, 1.5s in total", () => {
  assert.equal(CHAPTER02_CIRCUIT_SHAKE.amplitudeX, 5);
  assert.equal(CHAPTER02_CIRCUIT_SHAKE.amplitudeY, 5);
  assert.equal(CHAPTER02_CIRCUIT_SHAKE.durationSeconds, 1.5);
  const perShake = CHAPTER02_CIRCUIT_SHAKE.durationSeconds / (CHAPTER02_CIRCUIT_SHAKE.count / CHAPTER02_SHAKE_LEVELS.normal.count);
  assert.ok(Math.abs(perShake - 0.35) < 1e-9, `${perShake}`);
  const shake = new ScriptedCameraShake(CHAPTER02_CIRCUIT_SHAKE, 0.2, () => 0);
  shake.request();
  let max = 0;
  for (let t = 0; t < 1500; t += 5) {
    const o = shake.offset(1000 + t);
    assert.equal(o.active, true);
    max = Math.max(max, Math.abs(o.x), Math.abs(o.y));
  }
  assert.ok(max <= 5 && max > 4.5, `${max}`);
  assert.equal(shake.offset(2500).active, false);
});

test("aftershock after line-003: ±3px, 3s with 20% fade in/out, 0.5–1.5s gaps, repeats until stopped", () => {
  assert.equal(CHAPTER02_CIRCUIT_AFTERSHOCK.amplitudeX, 3);
  assert.equal(CHAPTER02_CIRCUIT_AFTERSHOCK.amplitudeY, 3);
  assert.equal(CHAPTER02_CIRCUIT_AFTERSHOCK.durationSeconds, 3);
  assert.equal(CHAPTER02_CIRCUIT_AFTERSHOCK.intervalMinSeconds, 0.5);
  assert.equal(CHAPTER02_CIRCUIT_AFTERSHOCK.intervalMaxSeconds, 1.5);
  assert.equal(CHAPTER02_CIRCUIT_AFTERSHOCK_FADE_PORTION, 0.2);
  // random() = 0 → 間隔取 0.5 秒、相位 0
  const shake = new RepeatingCameraShake(CHAPTER02_CIRCUIT_AFTERSHOCK, 0.2, 300, () => 0);
  let starts = 0;
  shake.onShakeStart = () => starts++;
  assert.equal(shake.offset(0).active, false, "idle until started");
  shake.start(1500); // line-003：等主震動 1.5 秒
  // 0～2000ms：主震動＋0.5 秒間隔，循環已開始但還沒震（active 讓背景循環震動暫停）
  for (let t = 0; t < 2000; t += 10) {
    const o = shake.offset(t);
    assert.equal(o.active, true);
    assert.equal(o.x, 0);
  }
  assert.equal(starts, 0);
  // 第一次：2000～5000ms，頭尾 20%（600ms）淡入淡出，中段接近 ±3px
  let edgeMax = 0;
  let middleMax = 0;
  for (let t = 2000; t < 5000; t += 2) {
    const o = shake.offset(t);
    const progress = (t - 2000) / 3000;
    const size = Math.max(Math.abs(o.x), Math.abs(o.y));
    if (progress < 0.03 || progress > 0.97) edgeMax = Math.max(edgeMax, size);
    if (progress > 0.2 && progress < 0.8) middleMax = Math.max(middleMax, size);
    assert.ok(size <= 3.0001, `${size}`);
  }
  assert.equal(starts, 1);
  assert.ok(edgeMax < 0.3, `edges must fade: ${edgeMax}`);
  assert.ok(middleMax > 2.7, `middle near full strength: ${middleMax}`);
  // 結束後再等 0.5 秒才震第二次
  assert.equal(shake.offset(5000).x, 0);
  assert.equal(shake.offset(5400).x, 0);
  shake.offset(5510);
  assert.equal(starts, 2);
  // line-011：停止，正在震的這次 300ms 內收到 0，之後不再排下一次
  shake.offset(7000);
  shake.stop();
  shake.offset(7001);
  const fading = shake.offset(7150);
  assert.ok(Math.abs(fading.x) <= 3);
  assert.equal(shake.offset(7350).active, false, "stops within the stop fade");
  for (let t = 7400; t < 15000; t += 50) assert.equal(shake.offset(t).active, false);
  assert.equal(starts, 2);
});

test("aftershock stopped during a gap ends immediately; cancel clears a pending start", () => {
  const shake = new RepeatingCameraShake(CHAPTER02_CIRCUIT_AFTERSHOCK, 0.2, 300, () => 0);
  shake.start(1500);
  assert.equal(shake.offset(100).active, true);
  shake.stop();
  assert.equal(shake.offset(200).active, false);
  shake.start(0);
  shake.cancel();
  assert.equal(shake.isRunning, false);
  assert.equal(shake.offset(5000).active, false);
});

test("line-011 blackout: 1s fade in, black until section-16 ends, then 2s hold and 1.5s fade out", async () => {
  assert.deepEqual(CHAPTER02_CIRCUIT_BLACKOUT_FLOW.actions, [
    { type: "fadeToBlack", durationMs: 1000 },
    { type: "waitForDialogueEnd" },
    { type: "wait", durationMs: 2000 },
    { type: "fadeFromBlack", durationMs: 1500 },
  ]);
  const log = [];
  let endDialogue;
  const manager = new ChapterFlowManager({
    setInputLocked: () => {},
    setBlack: visible => log.push(`black ${visible}`),
    fadeToBlack: ms => log.push(`fadeToBlack ${ms}`),
    fadeFromBlack: ms => log.push(`fadeFromBlack ${ms}`),
    showCenteredText: () => {},
    hideCenteredText: () => {},
    playDialogue: async () => ({ completed: true }),
    waitForDialogueEnd: () => new Promise(resolve => { endDialogue = () => { log.push("dialogue ended"); resolve(); }; }),
    markCompleted: () => {},
    isCompleted: () => false,
    wait: async ms => { log.push(`wait ${ms}`); },
  });
  const running = manager.run({ ...CHAPTER02_CIRCUIT_BLACKOUT_FLOW, actions: CHAPTER02_CIRCUIT_BLACKOUT_FLOW.actions });
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.ok(log.includes("fadeToBlack 1000"));
  assert.ok(!log.includes("fadeFromBlack 1500"), "stays black while the dialogue is still playing");
  endDialogue();
  await running;
  const ended = log.indexOf("dialogue ended");
  assert.ok(ended > log.indexOf("fadeToBlack 1000"));
  assert.ok(log.indexOf("fadeFromBlack 1500") > ended);
});

test("runtime wiring and HUD failure visuals", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(item\.id === CHAPTER02_CIRCUIT_ITEM_ID\) advanceChapter02Circuit\(true\);/);
  assert.match(source, /restoreChapter02Countdown\(\);\s*\/\/[^\n]*\n\s*advanceChapter02Circuit\(\(playerInventoryRef\.current\[CHAPTER02_CIRCUIT_ITEM_ID\] \?\? 0\) > 0\);/);
  assert.match(source, /\}, CHAPTER02_CIRCUIT_DIALOGUE_DELAY_MS\);/);
  assert.match(source, /void chapterFlowManagerRef\.current\?\.run\(CHAPTER02_CIRCUIT_BLACKOUT_FLOW\)/);
  // OBJ 失敗與 section-17 只由任務資料的失敗設定處理，程式裡不再寫死
  assert.doesNotMatch(source, /failChapter02CircuitObjectives|CHAPTER02_CIRCUIT_FAIL|chapter02-section-17/);
  assert.match(source, /dialogueId === CHAPTER02_CIRCUIT_DIALOGUE && lineId === CHAPTER02_CIRCUIT_SHAKE_LINE_ID\) \{\s*circuitCameraShakeRef\.current\?\.request\(\);/);
  // line-003 主震動結束後開始持續餘震；line-011 停止；對話中斷時也停止
  assert.match(source, /circuitAftershockRef\.current\?\.start\(CHAPTER02_CIRCUIT_SHAKE\.durationSeconds \* 1000\);/);
  assert.match(source, /lineId === CHAPTER02_CIRCUIT_BLACKOUT_LINE_ID\) \{\s*circuitAftershockRef\.current\?\.stop\(\);/);
  assert.match(source, /\.then\(\(\) => \{\s*\/\/[^\n]*\n\s*circuitAftershockRef\.current\?\.stop\(\);\s*chapter02CircuitPendingRef\.current = false;/);
  // 失敗後觸發的對話用和任務完成後觸發相同的播放器（播放中時排隊）
  assert.match(source, /runCompletionTrigger: async \(type, triggerId\) => \{\s*if \(type === "dialogue"\) \{\s*const result = await dialogueManager\.playRegistered\(/);
  assert.match(source, /const scriptedCameraShakes = \[shipBoomShakeRef\.current!, warpExitCameraShake, circuitCameraShakeRef\.current!, circuitAftershockRef\.current!\];/);
  assert.match(source, /waitForDialogueEnd: \(\) => new Promise<void>/);
  // 換 Stage 時不疊舊 HUD 複本：NEXT 已淡出的 OBJ_01／OBJ_02 不可再閃出來一次
  assert.match(source, /const isStageSwitch = previousStage\.questId !== undefined &&\s*previousStage\.questId === activeQuestHud\?\.id &&\s*previousStage\.stageId !== activeQuestHud\?\.stageId;\s*const snapshot = isStageSwitch \? null : questFadeSnapshotRef\.current;/);
  assert.match(source, /onObjectiveFailed: \(questId, objectiveId, _stageId, entry\) => \{[^}]*triggerQuestObjectiveTween\(view, objectiveId, true\)/);
  assert.match(source, /\{objective\.failed \? "☒" : objective\.completed \? "☑" : "☐"\}/);
  assert.match(source, /objective\.failed \? " is-failure-pop" : " is-completion-pop"/);
  assert.match(source, /\(objective\) => !objective\.failed && objective\.current >= objective\.required/, "a failed OBJ no longer counts as done");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.quest-objective\.is-failure-pop \.quest-objective-check \{[^}]*quest-objective-failure-check 1\.8s/);
  assert.match(css, /\.quest-objective\.is-failed \.quest-objective-label,/);
});

test("line-009 hull breach: rupture at 0 s, breach 1/2/4 at 0.1/0.8/1.1 s with the requested volume and fades", () => {
  assert.equal(CHAPTER02_CIRCUIT_HULL_BREACH_LINE_ID, "chapter02-section-16-line-009");
  assert.ok(storyContent.includes(CHAPTER02_CIRCUIT_HULL_BREACH_LINE_ID));
  const expected = {
    chapter02HullRupture: ["./audio/Spaceship_hull_ruptu.mp3", 0.5, 0, 20, 10],
    chapter02HullBreach1: ["./audio/Spaceship_breac_1.mp3", 0.3, 0.1, 10, 10],
    chapter02HullBreach2: ["./audio/Spaceship_breac_2.mp3", 0.2, 0.8, 10, 10],
    chapter02HullBreach4: ["./audio/Spaceship_breac_4.mp3", 0.2, 1.1, 10, 10],
  };
  assert.deepEqual([...CHAPTER02_CIRCUIT_HULL_BREACH_AUDIO_EVENTS], Object.keys(expected));
  for (const [eventName, [source, volume, delay, fadeIn, fadeOut]] of Object.entries(expected)) {
    const definition = AUDIO_EVENT_CONFIG[eventName];
    assert.deepEqual(definition.sources, [source], eventName);
    assert.equal(definition.volume, volume, eventName);
    assert.equal(definition.delaySeconds, delay, eventName);
    assert.equal(definition.fadeInPercent, fadeIn, eventName);
    assert.equal(definition.fadeOutPercent, fadeOut, eventName);
    assert.ok(!definition.loop, eventName);
  }
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.deepEqual(CHAPTER02_CIRCUIT_LINE_AUDIO_EVENTS[CHAPTER02_CIRCUIT_HULL_BREACH_LINE_ID], CHAPTER02_CIRCUIT_HULL_BREACH_AUDIO_EVENTS);
  assert.match(source, /if \(dialogueId === CHAPTER02_CIRCUIT_DIALOGUE\) \{[^}]*for \(const eventName of CHAPTER02_CIRCUIT_LINE_AUDIO_EVENTS\[lineId\] \?\? \[\]\) \{\s*void audioEventManagerRef\.current\?\.play\(eventName as AudioEventName, \{ restart: true \}\)/);
});

test("line-005 / line-008 metal groans: volume 50, 10% fades, played once", () => {
  const expected = {
    "chapter02-section-16-line-005": ["chapter02MetalGroan", "./audio/agonizing_metal.mp3"],
    "chapter02-section-16-line-008": ["chapter02MetalGroanSlow", "./audio/Slow_agonizing_metal.mp3"],
  };
  for (const [lineId, [eventName, source]] of Object.entries(expected)) {
    assert.ok(storyContent.includes(lineId), lineId);
    assert.deepEqual(CHAPTER02_CIRCUIT_LINE_AUDIO_EVENTS[lineId], [eventName]);
    const definition = AUDIO_EVENT_CONFIG[eventName];
    assert.deepEqual(definition.sources, [source]);
    assert.ok(definition.volume > 0 && definition.volume <= 1, "音量可在 AudioEventManager 自行微調");
    assert.equal(definition.delaySeconds, 0);
    assert.equal(definition.fadeInPercent, 10);
    assert.equal(definition.fadeOutPercent, 10);
    assert.ok(!definition.loop);
  }
  for (const eventNames of Object.values(CHAPTER02_CIRCUIT_LINE_AUDIO_EVENTS)) {
    for (const eventName of eventNames) assert.ok(AUDIO_EVENT_CONFIG[eventName], eventName);
  }
});
