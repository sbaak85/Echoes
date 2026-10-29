import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ChapterFlowManager } from "../app/chapter-flow-manager.ts";
import { QUEST_STAGE_EVENT_FLOWS } from "../app/chapter04-quest-flow.ts";
import { CHAPTER02_EMERGENCY_BGM_EVENT_ID, CHAPTER02_EMERGENCY_FLOW_ID, createChapter02EmergencyFlow } from "../app/chapter02-emergency-flow.ts";
import { BGM_CONTROL_RULES } from "../app/audio-event-manager.ts";
import { resolveBgmControlPlan } from "../app/bgm-director.ts";
import { STORY_CHAPTERS, STORY_DIALOGUES } from "../app/story-content.ts";

const quests = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));

test("STAGE_02 completion (after OBJ_02) runs the emergency flow; MAIN_004 completion shows 1s later", () => {
  const quest = quests.quests.find(q => q.id === "QUEST_CH02_MAIN_004");
  const stage = quest.stages[1];
  assert.equal(stage.objectives.length, 1);
  assert.equal(stage.objectives[0].id, "QUEST_CH02_MAIN_004_OBJ_02");
  assert.equal(stage.objectives[0].completionEventFlowId, "", "an objective event would hold the quest until the flow ends");
  assert.equal(stage.completionEventFlowId, CHAPTER02_EMERGENCY_FLOW_ID);
  assert.equal(stage.completionDelaySeconds, 0);
  assert.equal(quest.completionPresentationDelaySeconds, 1);
  assert.ok(QUEST_STAGE_EVENT_FLOWS[CHAPTER02_EMERGENCY_FLOW_ID]);
  assert.ok(STORY_DIALOGUES["chapter02-section-11"]);
});

const emergencyEvent = () => STORY_CHAPTERS.find(c => c.chapterNumber === 2).subtitleEvents.find(e => e.id === "chapter02-Emergency");

test("chapter02-Emergency uses the black-first mode: editor fields drive delay, black, subtitle delay/duration, hold, fade out, after", () => {
  const event = emergencyEvent();
  assert.equal(event.triggerType, "manual", "only this flow plays it");
  assert.ok(event.subtitleDurationMs > 0, "subtitle duration set → black first, subtitle separate from black hold");
  assert.equal(event.keepBlack, false); assert.equal(event.lockInput, true);
  const flow = createChapter02EmergencyFlow();
  const types = flow.actions.map(a => a.type);
  assert.equal(types[0], "lockInput");
  assert.deepEqual(types.slice(-3), ["playDialogue", "setStoryFlag", "unlockInput"], "section-11 plays (then the stronger shake) before input unlocks");
  const bgm = types.indexOf("bgmEvent"), black = types.indexOf("fadeToBlack"), text = types.indexOf("showCenteredText"), out = types.indexOf("fadeFromBlack");
  assert.ok(bgm >= 0 && black === bgm + 1, "BGM fades out right as the black fade-in starts");
  assert.ok(text > black && out > text, "black first, then subtitle, then black fades out");
  assert.equal(flow.actions[black].durationMs, event.fadeInMs);
  assert.equal(flow.actions[out].durationMs, event.fadeOutMs);
  const textAction = flow.actions[text];
  assert.equal(textAction.fadeInMs + textAction.holdMs + textAction.fadeOutMs, event.subtitleDurationMs);
  assert.equal(flow.actions.at(-3).dialogueId, "chapter02-section-11");
  assert.ok(flow.skipActions.some(a => a.type === "playDialogue" && a.dialogueId === "chapter02-section-11"), "skipping still plays the alarm");
  assert.ok(flow.skipActions.some(a => a.type === "bgmEvent"), "skipping still keeps the BGM faded out");
});

test("BGM rule mutes main_BGM over the same time as the black fade-in", () => {
  const rule = BGM_CONTROL_RULES.find(r => r.triggerType === "event" && r.targetId === CHAPTER02_EMERGENCY_BGM_EVENT_ID);
  assert.ok(rule && rule.enabled);
  assert.equal(rule.action, "mute");
  assert.equal(rule.fadeOutSeconds * 1000, emergencyEvent().fadeInMs);
  const plan = resolveBgmControlPlan(BGM_CONTROL_RULES, (type, id) => type === "event" && id === CHAPTER02_EMERGENCY_BGM_EVENT_ID ? "triggered" : null);
  assert.equal(plan.volumeMultiplier, 0);
});

async function runTimeline(t, flow) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const log = [];
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const host = {
    setInputLocked: locked => log.push([now, locked ? "lock" : "unlock"]),
    cancelDialogue: () => {}, isCompleted: () => false, markCompleted: () => {},
    triggerBgmEvent: id => log.push([now, `bgm ${id}`]), clearBgmEvent: () => {},
    fadeToBlack: ms => log.push([now, `fadeToBlack ${ms}`]), fadeFromBlack: ms => log.push([now, `fadeFromBlack ${ms}`]),
    setBlack: v => log.push([now, `setBlack ${v}`]),
    showCenteredText: a => log.push([now, "showText"]), hideCenteredText: () => log.push([now, "hideText"]),
    playDialogue: async id => { log.push([now, `play ${id}`]); return { completed: true }; },
    playAudioEvent: (name, delay) => log.push([now + delay, `audio ${name}`]),
    setStoryFlag: (id, v) => log.push([now, `flag ${id}=${v}`]),
  };
  const manager = new ChapterFlowManager(host);
  const run = manager.run(flow);
  for (let i = 0; i < 1500; i++) { await Promise.resolve(); now += 16; t.mock.timers.tick(16); await Promise.resolve(); }
  await run;
  return label => log.find(([, l]) => l.startsWith(label))?.[0];
}

test("timeline follows the editor fields (subtitle delay and duration separate from the black hold)", async t => {
  const e = emergencyEvent();
  const at = await runTimeline(t, createChapter02EmergencyFlow());
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 80, `${label}: ${actual} vs ${expected}`);
  near(at("bgm chapter02-emergency"), e.delayBeforeMs, "BGM fade-out");
  assert.equal(at("fadeToBlack"), at("bgm chapter02-emergency"), "BGM and black start together");
  const fullBlack = at("fadeToBlack") + e.fadeInMs;
  near(at("showText"), fullBlack + e.subtitleDelayMs, "subtitle start");
  near(at("fadeFromBlack"), fullBlack + Math.max(e.holdMs, e.subtitleDelayMs + e.subtitleDurationMs), "black fade-out");
  near(at("play chapter02-section-11"), at("fadeFromBlack") + e.fadeOutMs + e.delayAfterMs, "section-11");
});

test("subtitle delay and a black hold longer than the subtitle are honoured", async t => {
  const { createStorySubtitleFlow } = await import("../app/story-subtitle-flow.ts");
  const event = { ...emergencyEvent(), delayBeforeMs: 500, fadeInMs: 1000, subtitleDelayMs: 800, subtitleDurationMs: 2000, holdMs: 5000, fadeOutMs: 1000, delayAfterMs: 0 };
  const at = await runTimeline(t, createStorySubtitleFlow(2, event, 1));
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 80, `${label}: ${actual} vs ${expected}`);
  near(at("fadeToBlack"), 500, "black");
  near(at("showText"), 500 + 1000 + 800, "text after full black + subtitle delay");
  near(at("fadeFromBlack"), 500 + 1000 + 5000, "black keeps holding after the subtitle is gone");
});

test("events without a subtitle duration keep the old combined black + subtitle behaviour", async () => {
  const { createStorySubtitleFlow } = await import("../app/story-subtitle-flow.ts");
  const legacy = STORY_CHAPTERS.flatMap(c => c.subtitleEvents).find(e => !(e.subtitleDurationMs > 0) && e.id !== "chapter03-End");
  const types = createStorySubtitleFlow(2, legacy, 1).actions.map(a => a.type);
  assert.ok(types.includes("showBlackSubtitle") && !types.includes("fadeToBlack"));
});

test("going to bed completes MAIN_004 right away and starts the flow without waiting for it to finish", async () => {
  const { QuestRuntimeManager } = await import("../app/quest-runtime-manager.ts");
  const ran = [], completed = [];
  const manager = new QuestRuntimeManager(quests, {
    // 緊急事件流程要播十幾秒；這裡故意永遠不結束，確認任務完成不會等它
    runEventFlow: id => { ran.push(id); return new Promise(() => {}); },
    onQuestCompleted: (questId, _entry, done) => { completed.push(questId); done(); },
  });
  manager.startQuest("QUEST_CH02_MAIN_004");
  for (const targetId of ["shipinterior-interaction-021", "shipinterior-interaction-020"]) manager.handleEvent({ type: "interactionSucceeded", targetId });
  manager.handleEvent({ type: "puzzleCompleted", targetId: "shipinterior-interaction-019" });
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(ran, [], "nothing before going to bed");
  assert.deepEqual(completed, []);
  manager.handleEvent({ type: "interactionSucceeded", targetId: "shipinterior-interaction-023" });
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(ran, [CHAPTER02_EMERGENCY_FLOW_ID]);
  assert.equal(manager.getQuestState("QUEST_CH02_MAIN_004"), "completed");
  assert.deepEqual(completed, ["QUEST_CH02_MAIN_004"], "COMPLETE presentation is handed to the host (it applies the 1s delay) while the flow is still running");
});

test("red alert lighting switches on once the screen is fully black (and on skip), using the tuned preview settings", async () => {
  const { RED_ALERT_STORY_FLAG, RED_ALERT_SETTINGS, RED_ALERT_LIGHTS } = await import("../app/red-alert-lighting.ts");
  const flow = createChapter02EmergencyFlow();
  const types = flow.actions.map(a => a.type);
  const flagIndex = flow.actions.findIndex(a => a.type === "setStoryFlag" && a.flagId === RED_ALERT_STORY_FLAG && a.value === true);
  assert.equal(flagIndex, types.indexOf("fadeToBlack") + 1, "set right after the black fade-in completes");
  assert.ok(flagIndex < types.indexOf("fadeFromBlack"), "already on before the scene lights back up");
  assert.ok(flow.skipActions.some(a => a.type === "setStoryFlag" && a.flagId === RED_ALERT_STORY_FLAG));
  assert.deepEqual(
    { ambient: RED_ALERT_SETTINGS.ambient, power: RED_ALERT_SETTINGS.power, bloom: RED_ALERT_SETTINGS.bloom, fill: RED_ALERT_SETTINGS.fill, centerLevel: RED_ALERT_SETTINGS.centerLevel },
    { ambient: 0.83, power: 0.98, bloom: 0, fill: 0.54, centerLevel: 0.5 });
  assert.equal(RED_ALERT_LIGHTS.length, 17);
  assert.deepEqual(RED_ALERT_LIGHTS.filter(l => l.color).map(l => l.id).sort(), ["bathroom", "engine"], "engine room and bathroom keep their original look");
});


test("alarm plays 5s after the subtitle appears; shake starts when the scene is back and gets stronger after section-11", async t => {
  const { CHAPTER02_SHAKE_FLAG, CHAPTER02_SHAKE_STRONG_FLAG } = await import("../app/camera-shake.ts");
  const { AUDIO_EVENT_CONFIG } = await import("../app/audio-event-manager.ts");
  assert.equal(AUDIO_EVENT_CONFIG.chapter02EmergencyAlarm.sources[0], "./audio/Alarm.mp3");
  const at = await runTimeline(t, createChapter02EmergencyFlow());
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 80, `${label}: ${actual} vs ${expected}`);
  near(at("audio chapter02EmergencyAlarm"), at("showText") + 5000, "alarm");
  assert.ok(at(`flag ${CHAPTER02_SHAKE_FLAG}=true`) >= at("fadeFromBlack"), "shake only after the black lifts");
  assert.ok(at(`flag ${CHAPTER02_SHAKE_STRONG_FLAG}=true`) >= at("play chapter02-section-11"), "stronger shake after section-11");
  const flow = createChapter02EmergencyFlow();
  for (const flag of [CHAPTER02_SHAKE_FLAG, CHAPTER02_SHAKE_STRONG_FLAG]) {
    assert.ok(flow.skipActions.some(a => a.type === "setStoryFlag" && a.flagId === flag), `skip also sets ${flag}`);
  }
});

test("looping camera shake: ±amplitude over the duration with the given count, then waits 5–10s and repeats", async () => {
  const { LoopingCameraShake, CHAPTER02_SHAKE_LEVELS } = await import("../app/camera-shake.ts");
  for (const [level, settings] of Object.entries(CHAPTER02_SHAKE_LEVELS)) {
    let r = 0; const randoms = [0.25, 0.5, 0.25, 0.5, 0.25, 0.5];
    const shake = new LoopingCameraShake(() => randoms[r++ % randoms.length]);
    let startCalls = 0; shake.onShakeStart = () => startCalls++;
    let maxX = 0, maxY = 0, crossings = 0, prevX = 0;
    const starts = [];
    let wasActive = false;
    for (let ms = 0; ms <= 40000; ms += 4) {
      const o = shake.offset(ms, settings);
      const active = o.x !== 0 || o.y !== 0;
      if (active && !wasActive) starts.push(ms);
      wasActive = active;
      if (ms < settings.durationSeconds * 1000) {
        maxX = Math.max(maxX, Math.abs(o.x)); maxY = Math.max(maxY, Math.abs(o.y));
        if (prevX < 0 && o.x >= 0) crossings++;
        prevX = o.x;
      }
    }
    assert.ok(maxX <= settings.amplitudeX && maxX > settings.amplitudeX * 0.6, `${level} x amplitude ${maxX}`);
    assert.ok(maxY <= settings.amplitudeY && maxY > settings.amplitudeY * 0.4, `${level} y amplitude ${maxY}`);
    assert.ok(Math.abs(crossings - settings.count) <= 1, `${level} oscillations ${crossings}`);
    assert.equal(starts[0], 0, "first shake right away");
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i] - starts[i - 1] - settings.durationSeconds * 1000;
      assert.ok(gap >= settings.intervalMinSeconds * 1000 - 10 && gap <= settings.intervalMaxSeconds * 1000 + 10, `${level} gap ${gap}`);
    }
    assert.ok(starts.length >= 3, "keeps looping");
    assert.equal(startCalls, starts.length, "impact sound hook fires once per shake");
    assert.deepEqual(shake.offset(50000, null), { x: 0, y: 0 }, "stops when switched off");
  }
  assert.deepEqual(CHAPTER02_SHAKE_LEVELS.normal, { amplitudeX: 5, amplitudeY: 5, durationSeconds: 0.5, count: 5, intervalMinSeconds: 5, intervalMaxSeconds: 10 });
  assert.deepEqual(CHAPTER02_SHAKE_LEVELS.strong, { amplitudeX: 10, amplitudeY: 10, durationSeconds: 0.75, count: 10, intervalMinSeconds: 5, intervalMaxSeconds: 10 });
});


test("each shake plays one of two impact sounds at 20% volume, registered in AudioEventManager", async () => {
  const { CHAPTER02_SHAKE_AUDIO_EVENTS } = await import("../app/camera-shake.ts");
  const { AUDIO_EVENT_CONFIG } = await import("../app/audio-event-manager.ts");
  assert.deepEqual(CHAPTER02_SHAKE_AUDIO_EVENTS.map(id => [AUDIO_EVENT_CONFIG[id].sources[0], AUDIO_EVENT_CONFIG[id].volume, AUDIO_EVENT_CONFIG[id].loop]), [
    ["./audio/star-cards-explosion-finish-2.mp3", 0.2, undefined],
    ["./audio/star-cards-explosion-finish-3.mp3", 0.2, undefined],
  ]);
});

test("bridge assembly: the 4 NPCs stand on the ship_interior bridge TeleportPoints (editable in MapEditor)", async () => {
  const { CHAPTER02_BRIDGE_ASSEMBLY_POINTS, resolveBridgeAssemblyPlacement } = await import("../app/chapter02-bridge-assembly.ts");
  const scene = JSON.parse(readFileSync(new URL("../public/maps/ship_interior.scene.json", import.meta.url), "utf8"));
  const npcIds = scene.npcs.map(n => n.id);
  for (const [npcId, pointId] of Object.entries(CHAPTER02_BRIDGE_ASSEMBLY_POINTS)) {
    assert.ok(npcIds.includes(npcId), `${npcId} exists in the scene`);
    const point = scene.teleportPoints.find(p => p.id === pointId);
    assert.ok(point, `${pointId} placed in the scene`);
    assert.deepEqual(resolveBridgeAssemblyPlacement(npcId, scene.teleportPoints), { x: point.x, y: point.y, facing: point.facing });
  }
  assert.equal(resolveBridgeAssemblyPlacement("npc-captain", []), null, "missing point keeps the NPC where it was");
  assert.equal(resolveBridgeAssemblyPlacement("npc-someone-else", scene.teleportPoints), null);
});
