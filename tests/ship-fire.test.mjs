import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  findAreaBoomsToTrigger,
  findLineBooms,
  isBoomConditionMet,
  isShipFireActive,
  normalizeShipEffectsData,
  shipBoomFlag,
  SHIP_FIRE_START_DIALOGUE,
} from "../app/ship-fire.ts";
import { CHAPTER02_CIRCUIT_DIALOGUE } from "../app/chapter02-circuit-failure.ts";
import { extractChapterLines } from "../scripts/effect-editor-vite-plugin.ts";

const DATA_URL = new URL("../public/effects/ship_interior.effects.json", import.meta.url);
const data = normalizeShipEffectsData(JSON.parse(readFileSync(DATA_URL, "utf8")));

const sampleBoom = (overrides = {}) => ({
  id: "BOOM_01", x: 500, y: 500, size: 1, igniteRadius: 240, trigger: "area", lineId: "", delayMs: 0,
  radius: 100, requireDialogue: "", requireQuestId: "", requireStageId: "", ...overrides,
});

test("常駐火源在第二章 section-16 播完後才開始，之後維持", () => {
  assert.equal(SHIP_FIRE_START_DIALOGUE, CHAPTER02_CIRCUIT_DIALOGUE);
  assert.equal(data.startDialogue, CHAPTER02_CIRCUIT_DIALOGUE);
  const done = (id) => id === CHAPTER02_CIRCUIT_DIALOGUE;
  const notYet = () => false;
  assert.equal(isShipFireActive(data, "ship_interior", 2, notYet), false);
  assert.equal(isShipFireActive(data, "ship_interior", 2, done), true);
  assert.equal(isShipFireActive(data, "ship_interior", 3, done), false);
  assert.equal(isShipFireActive(data, "map_test01", 2, done), false);
});

test("配置檔沿用預覽頁記住的參數，火源 ID 不重複", () => {
  assert.equal(data.sceneId, "ship_interior");
  assert.equal(data.referenceSize, 1600);
  assert.equal(data.fire.fireRate, 45);
  assert.ok(data.emitters.length > 0);
  assert.equal(new Set(data.emitters.map((e) => e.id)).size, data.emitters.length);
  const boomIds = new Set(data.booms.map((b) => b.id));
  for (const e of data.emitters) assert.ok(e.ignitedBy === "" || boomIds.has(e.ignitedBy), `${e.id} 指向不存在的爆炸`);
});

test("資料整理：引燃者指向不存在的爆炸時改為常駐；爆炸 ID 不合法或重複會被拒絕", () => {
  const normalized = normalizeShipEffectsData({
    emitters: [{ id: "E01", type: "fire", x: 1, y: 2, ignitedBy: "BOOM_X" }, { id: "E02", type: "spark", x: 3, y: 4, ignitedBy: "BOOM_01" }],
    booms: [sampleBoom()],
  });
  assert.equal(normalized.emitters[0].ignitedBy, "");
  assert.equal(normalized.emitters[1].ignitedBy, "BOOM_01");
  assert.equal(normalized.fire.fireRate, 45);
  assert.throws(() => normalizeShipEffectsData({ booms: [sampleBoom({ id: "壞 ID" })] }));
  assert.throws(() => normalizeShipEffectsData({ booms: [sampleBoom(), sampleBoom()] }));
});

test("台詞爆炸依 lineId 找到；範圍爆炸在圓內、未炸過且條件成立時才觸發", () => {
  const lineBoom = sampleBoom({ id: "BOOM_L", trigger: "line", lineId: "chapter02-section-17-line-003" });
  const areaBoom = sampleBoom({ id: "BOOM_A", requireDialogue: "chapter02-section-16" });
  const fixture = normalizeShipEffectsData({ booms: [lineBoom, areaBoom] });
  assert.deepEqual(findLineBooms(fixture, "chapter02-section-17-line-003").map((b) => b.id), ["BOOM_L"]);
  assert.deepEqual(findLineBooms(fixture, "chapter02-section-17-line-004"), []);

  const notDone = () => false;
  const always = () => true;
  assert.deepEqual(findAreaBoomsToTrigger(fixture, { x: 550, y: 500 }, notDone, always).map((b) => b.id), ["BOOM_A"]);
  assert.deepEqual(findAreaBoomsToTrigger(fixture, { x: 700, y: 500 }, notDone, always), []);
  assert.deepEqual(findAreaBoomsToTrigger(fixture, { x: 550, y: 500 }, () => true, always), []);

  const boom = fixture.booms[1];
  const quest = () => true;
  assert.equal(isBoomConditionMet(boom, () => false, quest), false);
  assert.equal(isBoomConditionMet(boom, (id) => id === "chapter02-section-16", quest), true);
  const questBoom = { ...boom, requireDialogue: "", requireQuestId: "Q", requireStageId: "S" };
  assert.equal(isBoomConditionMet(questBoom, always, () => false), false);
  assert.equal(isBoomConditionMet(questBoom, always, (q, s) => q === "Q" && s === "S"), true);
  assert.equal(shipBoomFlag("BOOM_A"), "ship-boom:BOOM_A");
});

test("編輯工具的台詞清單取自第二章劇情對話", () => {
  const story = readFileSync(new URL("../app/story-content.ts", import.meta.url), "utf8");
  const lines = extractChapterLines(story, 2);
  assert.ok(lines.length > 50);
  assert.ok(lines.every((line) => line.lineId.startsWith("chapter02-")));
  assert.ok(lines.some((line) => line.lineId === "chapter02-section-16-line-003"));
});

test("火焰畫在紅色警戒光照之後；台詞開始時檢查爆炸；炸過記在劇情旗標", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /drawRedAlertLighting\(time\);\s*drawShipFire\(time\);/);
  assert.match(source, /shipFireRef\.current\?\.triggerLine\(lineId,/);
  assert.match(source, /setStoryFlag\(shipBoomFlag\(boom\.id\), true\)/);
  assert.match(source, /import shipInteriorEffects from "\.\.\/public\/effects\/ship_interior\.effects\.json"/);
});

test("爆炸音效從四支隨機抽一支；chapter02-start 後環境音兩條音軌接力（第一支 1.8 秒淡入），section-16 之後照常持續", async () => {
  const { AUDIO_EVENT_CONFIG } = await import("../app/audio-event-manager.ts");
  const { existsSync } = await import("node:fs");
  const {
    pickShipBoomAudioEvent, SHIP_BOOM_AUDIO_EVENTS, SHIP_AMBIENCE_AUDIO_EVENTS, SHIP_AMBIENCE_FIRST_FADE_IN_SECONDS,
    SHIP_AMBIENCE_HANDOFF_RATIO, SHIP_AMBIENCE_START_DIALOGUE_ID, AudioRelayScheduler,
  } = await import("../app/ship-fire.ts");
  assert.deepEqual(
    SHIP_BOOM_AUDIO_EVENTS.map((name) => AUDIO_EVENT_CONFIG[name].sources[0]),
    ["./audio/star-cards-explosion-finish-1.mp3", "./audio/star-cards-explosion-finish-2.mp3", "./audio/star-cards-explosion-finish-3.mp3", "./audio/star-cards-explosion-heavy-finish.mp3"],
  );
  assert.equal(pickShipBoomAudioEvent(() => 0), "chapter02ShipBoom1");
  assert.equal(pickShipBoomAudioEvent(() => 0.999), "chapter02ShipBoom4");
  for (const name of SHIP_AMBIENCE_AUDIO_EVENTS) {
    const ambience = AUDIO_EVENT_CONFIG[name];
    assert.deepEqual(ambience.sources, ["./audio/Seamless_looping_spa_3.mp3"]);
    assert.equal(ambience.volume, 0.3);
    assert.equal(ambience.fadeInPercent, 20);
    assert.equal(ambience.fadeOutPercent, 20);
    assert.ok(!ambience.loop, "接力由兩條音軌輪流，不靠單軌 loop");
  }
  assert.equal(AUDIO_EVENT_CONFIG.chapter02ShipDamageAmbience, undefined, "section-16 後不再換成單軌循環");
  for (const name of [...SHIP_BOOM_AUDIO_EVENTS, ...SHIP_AMBIENCE_AUDIO_EVENTS]) {
    const file = AUDIO_EVENT_CONFIG[name].sources[0].replace("./", "../public/");
    assert.ok(existsSync(new URL(file, import.meta.url)), `${file} 不存在`);
  }

  assert.equal(SHIP_AMBIENCE_START_DIALOGUE_ID, "chapter02-start");
  assert.equal(SHIP_AMBIENCE_FIRST_FADE_IN_SECONDS, 1.8);
  assert.equal(SHIP_AMBIENCE_HANDOFF_RATIO, 0.8);
  // A → 播到 80% → B → 播到 80% → A …
  const playback = { chapter02ShipAmbienceA: { currentTime: 0, duration: 10, paused: true, ended: false }, chapter02ShipAmbienceB: { currentTime: 0, duration: 10, paused: true, ended: false } };
  const relay = new AudioRelayScheduler(SHIP_AMBIENCE_AUDIO_EVENTS, SHIP_AMBIENCE_HANDOFF_RATIO);
  const get = (name) => playback[name];
  assert.equal(relay.idle, true);
  assert.equal(relay.update(true, get, () => 0), "chapter02ShipAmbienceA");
  assert.equal(relay.idle, false);
  Object.assign(playback.chapter02ShipAmbienceA, { currentTime: 5, paused: false });
  assert.equal(relay.update(true, get), null);
  playback.chapter02ShipAmbienceA.currentTime = 8;
  assert.equal(relay.update(true, get), "chapter02ShipAmbienceB");
  Object.assign(playback.chapter02ShipAmbienceB, { currentTime: 1, paused: false });
  Object.assign(playback.chapter02ShipAmbienceA, { currentTime: 0, paused: true, ended: true });
  assert.equal(relay.update(true, get), null);
  playback.chapter02ShipAmbienceB.currentTime = 8.2;
  assert.equal(relay.update(true, get), "chapter02ShipAmbienceA");
  relay.reset();
  assert.equal(relay.idle, true);

  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /play\(pickShipBoomAudioEvent\(\), \{ overlap: true \}\)/);
  assert.match(source, /updateShipAmbienceRelay\(true\);/);
  assert.match(source, /const active = hasDialogueCompleted\(SHIP_AMBIENCE_START_DIALOGUE_ID\);/);
  assert.doesNotMatch(source, /updateShipAmbience\(/);
  assert.match(source, /first \? \{ restart: true, fadeInSeconds: SHIP_AMBIENCE_FIRST_FADE_IN_SECONDS \} : \{ restart: true \}/);
});

test("配置工具存檔後推送新配置，開著的遊戲直接重建特效套用", () => {
  const plugin = readFileSync(new URL("../scripts/effect-editor-vite-plugin.ts", import.meta.url), "utf8");
  assert.match(plugin, /send\(\{ type: "custom", event: SHIP_EFFECTS_UPDATED_EVENT, data \}\)/);
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /shipEffectsHot\?\.on\(SHIP_EFFECTS_UPDATED_EVENT,/);
  assert.match(source, /shipFireRef\.current\.data !== SHIP_EFFECTS_DATA/);
});

test("火源起火方式：section-16、白畫面淡入後、指定台詞、被爆炸引燃（舊資料自動轉換）", async () => {
  const { ShipFireEffect, shipFireLineFlag } = await import("../app/ship-fire.ts");
  const fixture = normalizeShipEffectsData({
    emitters: [
      { id: "S", type: "fire", x: 0, y: 0, ignitedBy: "" },
      { id: "W", type: "fire", x: 0, y: 0, ignite: "warp" },
      { id: "L", type: "fire", x: 0, y: 0, ignite: "line", igniteLineId: "chapter02-section-14-line-002" },
      { id: "LX", type: "fire", x: 0, y: 0, ignite: "line", igniteLineId: "" },
      { id: "B", type: "fire", x: 0, y: 0, ignitedBy: "BOOM_01" },
    ],
    booms: [sampleBoom()],
  });
  assert.deepEqual(fixture.emitters.map((e) => e.ignite), ["section16", "warp", "line", "section16", "boom"]);
  assert.equal(shipFireLineFlag("x"), "ship-fire-line:x");

  const effect = new ShipFireEffect(1600, fixture);
  const heat = () => Object.fromEntries(effect.emitters.map((e) => [e.id, e.heat > 0]));
  const env = { fireStarted: false, warpExited: false, isLineFired: () => false, isBoomDone: () => false, player: null, isAreaConditionMet: () => true };
  effect.update(0.016, 0, env);
  assert.deepEqual(heat(), { S: false, W: false, L: false, LX: false, B: false });
  // 白畫面淡入到全白：W 在 0.8 秒內陸續起火
  effect.update(0.016, 0, { ...env, warpExited: true });
  for (let i = 0; i < 60; i++) effect.update(0.02, 0, { ...env, warpExited: true });
  assert.deepEqual(heat(), { S: false, W: true, L: false, LX: false, B: false });
  // 指定台詞開始：L 起火並通知存旗標
  const fired = [];
  effect.onLineIgnite = (lineId) => fired.push(lineId);
  effect.triggerLine("chapter02-section-14-line-002", () => false);
  for (let i = 0; i < 30; i++) effect.update(0.02, 0, { ...env, warpExited: true });
  assert.deepEqual(fired, ["chapter02-section-14-line-002"]);
  assert.equal(heat().L, true);

  // 讀檔：條件都已成立 → 第一幀直接燒（不播起火過程）
  const loaded = new ShipFireEffect(1600, fixture);
  loaded.update(0.016, 0, { ...env, fireStarted: true, warpExited: true, isLineFired: () => true, isBoomDone: () => true });
  assert.ok(loaded.emitters.every((e) => e.heat === 1));
});

test("阻擋圈：可放多個、位置自由，依啟用時機成立後才加進碰撞", async () => {
  const { ShipFireEffect } = await import("../app/ship-fire.ts");
  const fixture = normalizeShipEffectsData({
    booms: [sampleBoom()],
    blockers: [
      { id: "K01", x: 100, y: 200, radius: 50, ignite: "section16" },
      { id: "K02", x: 900, y: 300, radius: 80, ignite: "boom", ignitedBy: "BOOM_01" },
      { id: "K03", x: 400, y: 400, radius: 40, ignite: "line", igniteLineId: "chapter02-section-17-line-001" },
      { id: "K04", x: 10, y: 10, ignite: "boom", ignitedBy: "NOPE" },
    ],
  });
  assert.deepEqual(fixture.blockers.map((b) => b.ignite), ["section16", "boom", "line", "section16"]);
  assert.equal(fixture.blockers[3].radius, 60);

  const effect = new ShipFireEffect(3200, fixture); // 世界是參考座標的 2 倍
  const env = { fireStarted: false, warpExited: false, isLineFired: () => false, isBoomDone: () => false, player: null, isAreaConditionMet: () => true };
  assert.deepEqual(effect.activeBlockers(), []);
  effect.update(0.016, 0, env);
  assert.deepEqual(effect.activeBlockers(), []);
  effect.update(0.016, 0, { ...env, fireStarted: true });
  assert.deepEqual(effect.activeBlockers().map((b) => b.id), ["K01", "K04"]);
  assert.deepEqual(effect.activeBlockers()[0], { id: "K01", x: 200, y: 400, radius: 100 });
  effect.testBoom("BOOM_01");
  effect.triggerLine("chapter02-section-17-line-001", () => false);
  assert.deepEqual(effect.activeBlockers().map((b) => b.id), ["K01", "K02", "K03", "K04"]);

  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /applyShipBlockers\(shipFire\.activeBlockers\(\)\);/);
  assert.match(source, /SCENE_COLLIDERS = dynamic\.length \? \[\.\.\.STATIC_SCENE_COLLIDERS, \.\.\.dynamic\] : STATIC_SCENE_COLLIDERS;/);
  assert.match(source, /STATIC_SCENE_COLLIDERS = SCENE_COLLIDERS;\s*const cachedMiniMapGeometry/);
});

test("爆炸可指定炸開後播放的對話（劇情多邊形台詞等已登記的對話 ID）", async () => {
  const { extractChapterDialogues } = await import("../scripts/effect-editor-vite-plugin.ts");
  const fixture = normalizeShipEffectsData({ booms: [sampleBoom({ dialogueId: "chapter02-section-16-2", dialogueDelayMs: 1200 }), sampleBoom({ id: "BOOM_02" })] });
  assert.equal(fixture.booms[0].dialogueId, "chapter02-section-16-2");
  assert.equal(fixture.booms[0].dialogueDelayMs, 1200);
  assert.equal(fixture.booms[1].dialogueId, "");
  assert.equal(fixture.booms[1].dialogueDelayMs, 800);

  const story = readFileSync(new URL("../app/story-content.ts", import.meta.url), "utf8");
  const dialogues = extractChapterDialogues(story, 2);
  assert.ok(dialogues.some((d) => d.group === "section" && d.id === "chapter02-section-16"));
  for (const d of dialogues.filter((x) => x.group === "storyTrigger")) {
    assert.match(story, new RegExp(`\n  "${d.id}": \{`), `${d.id} 沒有登記在 STORY_DIALOGUES`);
  }
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(boom\.dialogueId\) scheduleRegisteredStoryDialogue\(boom\.dialogueId, boom\.dialogueDelayMs\);/);
});

test("BOOM_03 引爆後（section-16 播完後也一定）火焰燃燒聲三支隨機接力：頭尾 20% 淡入淡出、音量 0.3，持續循環", async () => {
  const { AUDIO_EVENT_CONFIG } = await import("../app/audio-event-manager.ts");
  const { existsSync } = await import("node:fs");
  const {
    SHIP_FIRE_LOOP_AUDIO_EVENTS, SHIP_FIRE_LOOP_START_BOOM_ID, SHIP_FIRE_LOOP_START_DIALOGUE_ID, ShipFireLoopScheduler,
  } = await import("../app/ship-fire.ts");
  assert.equal(SHIP_FIRE_LOOP_START_BOOM_ID, "BOOM_03");
  assert.ok(data.booms.some((boom) => boom.id === SHIP_FIRE_LOOP_START_BOOM_ID), "配置檔要有 BOOM_03");
  assert.equal(SHIP_FIRE_LOOP_START_DIALOGUE_ID, "chapter02-section-16");
  SHIP_FIRE_LOOP_AUDIO_EVENTS.forEach((name, index) => {
    const definition = AUDIO_EVENT_CONFIG[name];
    assert.deepEqual(definition.sources, [`./audio/Fire_looping_${index + 1}.mp3`]);
    assert.equal(definition.volume, 0.3);
    assert.equal(definition.fadeInPercent, 20);
    assert.equal(definition.fadeOutPercent, 20);
    assert.notEqual(definition.loop, true);
    assert.ok(existsSync(new URL(definition.sources[0].replace("./", "../public/"), import.meta.url)));
  });

  // 模擬三支音檔的播放狀態
  const playback = Object.fromEntries(SHIP_FIRE_LOOP_AUDIO_EVENTS.map((name) => [name, { currentTime: 0, duration: 2, paused: true, ended: false }]));
  const get = (name) => playback[name];
  const scheduler = new ShipFireLoopScheduler();
  assert.equal(scheduler.update(false, get), null);
  const first = scheduler.update(true, get, () => 0);
  assert.equal(first, "chapter02ShipFireLoop1");
  // 還沒真正開始播放時不接力
  assert.equal(scheduler.update(true, get), null);
  Object.assign(playback[first], { paused: false, currentTime: 0.5 });
  assert.equal(scheduler.update(true, get), null);
  // 播到 80%（開始淡出）→ 換另一支（不會挑正在播的同一支）
  playback[first].currentTime = 1.6;
  const second = scheduler.update(true, get, () => 0);
  assert.equal(second, "chapter02ShipFireLoop2");
  assert.equal(scheduler.update(true, get), null);
  Object.assign(playback[second], { paused: false, currentTime: 1.7 });
  // 第一支還在淡出 → 只剩第三支可挑
  assert.equal(scheduler.update(true, get, () => 0), "chapter02ShipFireLoop3");
  // 離開船艙（active=false）：不再接下一支
  assert.equal(scheduler.update(false, get), null);
  assert.equal(scheduler.update(false, get), null);

  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /isShipBoomDone\(SHIP_FIRE_LOOP_START_BOOM_ID\) \|\| hasDialogueCompleted\(SHIP_FIRE_LOOP_START_DIALOGUE_ID\)/);
  assert.match(source, /updateShipFireLoop\(true\);/);
  assert.match(source, /updateShipFireLoop\(false\);/);
});

test("分頁切到背景時暫停所有音效（環境音、循環、延遲觸發），回到前景從原位置繼續", () => {
  const manager = readFileSync(new URL("../app/audio-event-manager.ts", import.meta.url), "utf8");
  assert.match(manager, /setSuspended\(suspended: boolean\) \{/);
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(document\.hidden\) \{[\s\S]*?audioEvents\.setSuspended\(true\);\s*\} else \{\s*audioEvents\.setSuspended\(false\);/);
});
