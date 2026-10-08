import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { BgmDirector, resolveBgmControlPlan } from "../app/bgm-director.ts";
import { BGM_TRACK_CONFIG, BGM_CONTROL_RULES } from "../app/audio-event-manager.ts";
import { createPhototropicBgmFlow, PLANT_BGM_ID } from "../app/phototropic-bgm-flow.ts";
import { runPhototropicInteractionFlow } from "../app/phototropic-interaction-flow.ts";
import { startPlantSuccessTransition } from "../app/phototropic-success-transition.ts";

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function setup(t) {
  let now = 0, frameId = 0;
  const frames = new Map(), audios = [];
  class FakeAudio extends EventTarget {
    currentTime = 0; duration = 300; readyState = 1; paused = true;
    volume = 0; playCalls = 0; rejectPlay = false;
    constructor() { super(); audios.push(this); }
    play() { this.playCalls++; if (this.rejectPlay) return Promise.reject(Error("autoplay blocked")); this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    load() { this.currentTime = 0; }
    removeAttribute() {}
  }
  const replacements = {
    Audio: FakeAudio, document: { hidden: false }, window: { clearTimeout() {} },
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const restorers = Object.entries(replacements).map(([key, value]) => {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    return () => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key];
  });
  t.mock.method(performance, "now", () => now);
  const director = new BgmDirector();
  const flow = createPhototropicBgmFlow(phase => director.setMinigameState(PLANT_BGM_ID, phase));
  t.after(() => { director.dispose(); restorers.forEach(fn => fn()); });
  const advance = ms => {
    now += ms;
    audios.forEach(audio => { if (!audio.paused) audio.currentTime += ms / 1000; });
    const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));
  };
  return { director, flow, map: audios[0], plant: audios[1], frames, advance };
}

test("植物曲素材原檔一致、循環且基礎音量限制 70%，兩種狀態皆用 1.5 秒", async () => {
  const track = BGM_TRACK_CONFIG[PLANT_BGM_ID];
  assert.equal(track.volume, .7); assert.equal(track.loop, true); assert.equal(track.rememberPosition, false);
  const [original, deployed] = await Promise.all([
    readFile(new URL("../Assets/Audio/Sombra_Forest_BGM.mp3", import.meta.url)),
    readFile(new URL("../public/audio/Sombra_Forest_BGM.mp3", import.meta.url)),
  ]);
  assert.deepEqual(deployed, original);
  for (const state of ["intro", "playing"]) {
    const plan = resolveBgmControlPlan(BGM_CONTROL_RULES, (type, id) => type === "minigame" && id === PLANT_BGM_ID ? state : null);
    assert.equal(plan.fadeInSeconds, 1.5); assert.equal(plan.fadeOutSeconds, 1.5);
    assert.equal(plan.pausePlayback, state === "intro");
    assert.equal(plan.trackId, state === "intro" ? "default" : PLANT_BGM_ID);
  }
});

test("藤蔓到位才啟播，成功演出與 section-99 閱讀期間持續播放，完整對話播完才交叉淡化", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { director, flow, map, plant, advance } = setup(t);
  await director.play(); map.currentTime = 30; map.dispatchEvent(new Event("timeupdate"));
  const release = flow.begin();
  advance(750); near(map.volume, .5); assert.equal(map.paused, false);
  advance(750); assert.equal(map.volume, 0); assert.equal(map.paused, true);
  const parked = map.currentTime;
  await director.play(); advance(5000);
  assert.equal(map.currentTime, parked); assert.equal(plant.playCalls, 0);
  flow.vinesReady(); await flush();
  assert.equal(plant.src, "./audio/Sombra_Forest_BGM.mp3");
  assert.equal(plant.currentTime, 0); assert.equal(plant.volume, 0);
  advance(750); near(plant.volume, .35);
  await director.play(); near(plant.volume, .35); // Input retry cannot jump to max.
  advance(750); near(plant.volume, .7); assert.equal(map.paused, true);
  let completeDialogue;
  const dialogue = new Promise(resolve => { completeDialogue = resolve; });
  const cancel = startPlantSuccessTransition(() => {}, () => dialogue, () => {}, () => flow.dialogueCompleted());
  t.mock.timers.tick(2750); advance(2750);
  t.mock.timers.tick(60000); advance(60000);
  assert.equal(flow.phase, "playing"); near(plant.volume, .7);
  assert.equal(map.paused, true); assert.equal(map.currentTime, parked);
  completeDialogue({ completed: true }); await flush();
  assert.equal(flow.phase, null); assert.equal(map.currentTime, parked);
  assert.equal(map.paused, false); assert.equal(plant.paused, false);
  advance(750); near(plant.volume, .35); near(map.volume, .5);
  advance(750); near(map.volume, 1); assert.equal(plant.volume, 0); assert.equal(plant.paused, true);
  const plantCalls = plant.playCalls;
  flow.vinesReady(); release(); advance(2000);
  assert.equal(plant.playCalls, plantCalls); near(map.volume, 1);
  cancel();
});

test("前置對話取消／例外及入場淡出中返回，都恢復地圖曲而不啟動植物曲", async t => {
  const { director, flow, map, plant, advance } = setup(t);
  for (const fail of [false, true]) {
    await director.play(); map.currentTime = 20;
    let release, opened = false;
    const promise = runPhototropicInteractionFlow(async () => {
      advance(750);
      if (fail) throw Error("dialogue cancelled");
      return { completed: false };
    }, {
      showBackground() { release = flow.begin(); }, hideBackground() {},
      openPuzzle() { opened = true; return Promise.resolve(true); },
      cancelPuzzle() { release(); },
    }, () => assert.fail("No completion"));
    if (fail) await assert.rejects(promise); else await promise;
    advance(1500);
    assert.equal(opened, false); assert.equal(map.paused, false); near(map.volume, 1);
    assert.equal(plant.playCalls, 0);
  }
});

test("植物音量受玩家設定限制；關閉 BGM、視窗暫停及自動播放阻擋不破壞流程", async t => {
  const { director, flow, map, plant, advance } = setup(t);
  await director.play(); map.currentTime = 30;
  director.setUserVolume(.4); advance(0);
  flow.begin(); advance(1500);
  director.setEnabled(false); flow.vinesReady(); await flush(); advance(1500);
  assert.equal(plant.playCalls, 0); assert.equal(map.paused, true);
  director.setEnabled(true); await flush(); advance(1500);
  near(plant.volume, .28); assert.equal(plant.paused, false);
  director.pause(); assert.equal(plant.paused, true); await director.play();
  near(plant.volume, .28);
  const end = flow.begin(); advance(1500); end(); await flush(); advance(1500);
  flow.begin(); advance(1500);
  plant.rejectPlay = true; flow.vinesReady(); await flush();
  assert.equal(map.paused, true); assert.equal(plant.paused, true);
  plant.rejectPlay = false; await director.play(); advance(1500);
  near(plant.volume, .28);
});

test("取消、快速重開與播放 promise 競態不重啟已結束的曲目；已解謎不再啟播", async t => {
  const { director, flow, map, plant, advance } = setup(t);
  await director.play(); map.currentTime = 30;
  const oldRelease = flow.begin(); advance(1500);
  const release = flow.begin(); oldRelease(); assert.equal(flow.phase, "intro");
  flow.vinesReady(); flow.dialogueCompleted(); await flush(); advance(1500);
  assert.equal(plant.paused, true); assert.equal(plant.volume, 0); near(map.volume, 1);
  release(); const calls = plant.playCalls;
  flow.begin(true); flow.vinesReady(); advance(2000); assert.equal(plant.playCalls, calls);
});

test("背景分頁完成藤蔓入場後，回到分頁能啟播；暫停的入場曲不被焦點重試叫醒", async t => {
  const { director, flow, map, plant, advance } = setup(t);
  await director.play(); map.currentTime = 30;
  flow.begin(); advance(750);
  document.hidden = true; director.pause(); flow.vinesReady(); await flush(); advance(2000);
  assert.equal(plant.playCalls, 0); assert.equal(map.paused, true);
  document.hidden = false; await director.play(); advance(1500);
  near(plant.volume, .7); assert.equal(plant.paused, false);
  flow.dialogueCompleted(); await flush(); advance(1500);
  flow.begin(); advance(1500); await director.play();
  assert.equal(map.paused, true);
});

test("小遊戲換曲優先權勝過較低的地圖音量／對話靜音，更高的死亡靜音仍優先", () => {
  for (const id of [PLANT_BGM_ID, "power-routing", "frequency-calibration", "welding-route", "star-cards"]) {
    const lookup = (type, target) => type === "minigame" && target === id ? "playing" : type === "quest" ? "active" : type === "dialogueLine" ? "triggered" : null;
    const plan = resolveBgmControlPlan(BGM_CONTROL_RULES, lookup);
    assert.equal(plan.trackId, id); assert.equal(plan.volumeMultiplier, 1);
    const death = resolveBgmControlPlan(BGM_CONTROL_RULES, (type, target) => type === "event" ? "triggered" : lookup(type, target));
    assert.equal(death.volumeMultiplier, 0);
  }
});

test("音樂回呼例外不會卡住藤蔓 ready、成功演出或返回清理", t => {
  t.mock.method(console, "warn", () => {});
  const flow = createPhototropicBgmFlow(() => { throw Error("media unavailable"); });
  const release = flow.begin();
  assert.doesNotThrow(() => flow.vinesReady()); assert.equal(flow.phase, "playing");
  assert.doesNotThrow(() => flow.dialogueCompleted()); assert.equal(flow.phase, null);
  assert.doesNotThrow(release);
});
