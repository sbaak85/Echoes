import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { isQuestObjectiveVisible } from "../app/quest-hud-timing.ts";
import { ChapterFlowManager } from "../app/chapter-flow-manager.ts";
import { CHAPTER02_CIRCUIT_SHAKE, CHAPTER02_SHAKE_LEVELS, ScriptedCameraShake } from "../app/camera-shake.ts";
import {
  CHAPTER02_CIRCUIT_BLACKOUT_FLOW,
  CHAPTER02_CIRCUIT_BLACKOUT_LINE_ID,
  CHAPTER02_CIRCUIT_COLLECT_OBJECTIVE_ID,
  CHAPTER02_CIRCUIT_DIALOGUE,
  CHAPTER02_CIRCUIT_DIALOGUE_DELAY_MS,
  CHAPTER02_CIRCUIT_FAIL_DELAY_MS,
  CHAPTER02_CIRCUIT_FAILED_OBJECTIVE_IDS,
  CHAPTER02_CIRCUIT_ITEM_ID,
  CHAPTER02_CIRCUIT_QUEST_ID,
  CHAPTER02_CIRCUIT_SHAKE_LINE_ID,
  CHAPTER02_CIRCUIT_STAGE_ID,
  resolveChapter02CircuitStep,
} from "../app/chapter02-circuit-failure.ts";
import { CHAPTER02_COUNTDOWN_STOP_DIALOGUE } from "../app/chapter02-crash-countdown.ts";

const doc = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
const OBJ_01 = "QUEST_CH02_MAIN_006_OBJ_01";
const OBJ_02 = "QUEST_CH02_MAIN_006_OBJ_02";
const storyContent = readFileSync(new URL("../app/story-content.ts", import.meta.url), "utf8");

test("constants match the quest data, item database, dialogue lines and countdown stop dialogue", () => {
  assert.equal(CHAPTER02_CIRCUIT_ITEM_ID, "Q0005");
  assert.equal(CHAPTER02_CIRCUIT_DIALOGUE, "chapter02-section-16");
  assert.equal(CHAPTER02_CIRCUIT_DIALOGUE, CHAPTER02_COUNTDOWN_STOP_DIALOGUE, "section-16 still stops the countdown when it starts");
  assert.equal(CHAPTER02_CIRCUIT_DIALOGUE_DELAY_MS, 500);
  assert.equal(CHAPTER02_CIRCUIT_FAIL_DELAY_MS, 1000);
  assert.deepEqual([...CHAPTER02_CIRCUIT_FAILED_OBJECTIVE_IDS], [OBJ_01, OBJ_02], "OBJ_02 is checked on pickup, then turns into X too");
  assert.equal(CHAPTER02_CIRCUIT_COLLECT_OBJECTIVE_ID, OBJ_02);
  const stage = doc.quests.find(q => q.id === CHAPTER02_CIRCUIT_QUEST_ID).stages.find(s => s.id === CHAPTER02_CIRCUIT_STAGE_ID);
  const obj02 = stage.objectives.find(o => o.id === OBJ_02);
  assert.equal(obj02.type, "collectItem");
  assert.equal(obj02.targetId, CHAPTER02_CIRCUIT_ITEM_ID);
  assert.match(readFileSync(new URL("../app/item-database.ts", import.meta.url), "utf8"), /id: "Q0005"/);
  for (const lineId of [CHAPTER02_CIRCUIT_SHAKE_LINE_ID, CHAPTER02_CIRCUIT_BLACKOUT_LINE_ID]) {
    assert.ok(storyContent.includes(lineId), lineId);
  }
});

test("picking up Q0005 checks OBJ_02; later both OBJs (even the checked one) fail, stay listed with X and survive a reload", () => {
  // 單獨測任務 6：拿掉前置任務 MAIN_005 才能直接開始
  const isolated = structuredClone(doc);
  isolated.quests.find(q => q.id === CHAPTER02_CIRCUIT_QUEST_ID).prerequisiteQuestIds = [];
  const failedEvents = [];
  const manager = new QuestRuntimeManager(isolated, { onObjectiveFailed: (questId, objectiveId) => failedEvents.push(objectiveId) });
  manager.startQuest(CHAPTER02_CIRCUIT_QUEST_ID);
  assert.equal(manager.isQuestAtStage(CHAPTER02_CIRCUIT_QUEST_ID, CHAPTER02_CIRCUIT_STAGE_ID), true);
  manager.activateObjective(OBJ_02, "chapter02-section-15");
  manager.handleEvent({ type: "itemCollected", targetId: CHAPTER02_CIRCUIT_ITEM_ID, amount: 1, eventId: "itemCollected:test" });
  assert.equal(manager.getObjectiveProgress(CHAPTER02_CIRCUIT_QUEST_ID, OBJ_02).completed, true, "checked immediately on pickup");

  for (const id of CHAPTER02_CIRCUIT_FAILED_OBJECTIVE_IDS) assert.equal(manager.failObjective(CHAPTER02_CIRCUIT_QUEST_ID, id), true);
  assert.equal(manager.failObjective(CHAPTER02_CIRCUIT_QUEST_ID, OBJ_01), false, "only fails once");
  assert.deepEqual(failedEvents, [OBJ_01, OBJ_02]);

  manager.handleEvent({ type: "dialogueCompleted", targetId: "chapter02-section-17" });
  manager.handleEvent({ type: "itemCollected", targetId: CHAPTER02_CIRCUIT_ITEM_ID, amount: 1, eventId: "itemCollected:again" });
  for (const id of CHAPTER02_CIRCUIT_FAILED_OBJECTIVE_IDS) {
    const progress = manager.getObjectiveProgress(CHAPTER02_CIRCUIT_QUEST_ID, id);
    assert.equal(progress.failed, true, id);
    assert.equal(progress.state, "failed", id);
    assert.equal(progress.completed, false, `${id}: the X replaces the check`);
    assert.equal(isQuestObjectiveVisible(progress, Date.now()), true, "still shown on the HUD");
    assert.equal(manager.isObjectiveInProgress(CHAPTER02_CIRCUIT_QUEST_ID, id), false);
  }
  assert.equal(manager.isQuestAtStage(CHAPTER02_CIRCUIT_QUEST_ID, CHAPTER02_CIRCUIT_STAGE_ID), true, "failure does not advance the stage");

  const restored = new QuestRuntimeManager(isolated, {}, manager.exportSave());
  for (const id of CHAPTER02_CIRCUIT_FAILED_OBJECTIVE_IDS) {
    const progress = restored.getObjectiveProgress(CHAPTER02_CIRCUIT_QUEST_ID, id);
    assert.equal(progress.state, "failed", id);
    assert.equal(progress.completed, false, id);
  }
});

test("pickup / reload decides between playing section-16 and failing the OBJs", () => {
  const quest = (atStage, played) => ({
    isQuestAtStage: (q, s) => atStage && q === CHAPTER02_CIRCUIT_QUEST_ID && s === CHAPTER02_CIRCUIT_STAGE_ID,
    hasDialogueCompleted: id => played && id === CHAPTER02_CIRCUIT_DIALOGUE,
  });
  assert.equal(resolveChapter02CircuitStep(quest(true, false), true), "playDialogue");
  assert.equal(resolveChapter02CircuitStep(quest(true, false), false), "none");
  assert.equal(resolveChapter02CircuitStep(quest(true, true), true), "failObjectives");
  assert.equal(resolveChapter02CircuitStep(quest(false, false), true), "none");
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
  assert.match(source, /chapter02CircuitBlackoutRef\.current = chapterFlowManagerRef\.current\?\.run\(CHAPTER02_CIRCUIT_BLACKOUT_FLOW\)/);
  assert.match(source, /await chapter02CircuitBlackoutRef\.current;\s*chapter02CircuitBlackoutRef\.current = null;\s*window\.setTimeout\(\(\) => \{\s*chapter02CircuitPendingRef\.current = false;\s*failChapter02CircuitObjectives\(\);\s*\}, CHAPTER02_CIRCUIT_FAIL_DELAY_MS\)/);
  assert.match(source, /dialogueId === CHAPTER02_CIRCUIT_DIALOGUE && lineId === CHAPTER02_CIRCUIT_SHAKE_LINE_ID\) \{\s*circuitCameraShakeRef\.current\?\.request\(\);/);
  assert.match(source, /const scriptedCameraShakes = \[warpExitCameraShake, circuitCameraShakeRef\.current!\];/);
  assert.match(source, /waitForDialogueEnd: \(\) => new Promise<void>/);
  assert.match(source, /onObjectiveFailed: \(questId, objectiveId, _stageId, entry\) => \{[^}]*triggerQuestObjectiveTween\(view, objectiveId, true\)/);
  assert.match(source, /\{objective\.failed \? "☒" : objective\.completed \? "☑" : "☐"\}/);
  assert.match(source, /objective\.failed \? " is-failure-pop" : " is-completion-pop"/);
  assert.match(source, /\(objective\) => !objective\.failed && objective\.current >= objective\.required/, "a failed OBJ no longer counts as done");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.quest-objective\.is-failure-pop \.quest-objective-check \{[^}]*quest-objective-failure-check 1\.8s/);
  assert.match(css, /\.quest-objective\.is-failed \.quest-objective-label,/);
});
