import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { BgmDirector } from "../app/bgm-director.ts";
import { BGM_TRACK_CONFIG } from "../app/audio-event-manager.ts";

function setup(t, rules = []) {
  let now = 0;
  let nextFrame = 0;
  const frames = new Map();
  const audios = [];
  class FakeAudio extends EventTarget {
    currentTime = 0; duration = 60; readyState = 1; paused = true;
    volume = 1; playCalls = 0; loadCalls = 0;
    constructor() { super(); audios.push(this); }
    play() {
      this.playCalls++; this.paused = false;
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    load() { this.loadCalls++; this.currentTime = 0; }
    removeAttribute() {}
  }
  const replacements = {
    Audio: FakeAudio,
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const restoreGlobals = [];
  for (const [key, value] of Object.entries(replacements)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restoreGlobals.push(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  t.mock.method(performance, "now", () => now);
  const director = new BgmDirector(BGM_TRACK_CONFIG, rules);
  t.after(() => { director.dispose(); restoreGlobals.forEach(restore => restore()); });
  return {
    director, audio: audios[0],
    advance(ms, time) { now += ms; audios[0].currentTime = time; },
    tick() {
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(fn => fn(now));
    },
  };
}

test("第三章字幕：首次啟播前兩秒共用同一次播放，不 seek 或重載", async t => {
  const { director, audio, advance } = setup(t);
  await director.play();
  advance(500, 0.5);
  director.triggerStorySubtitle("chapter03-Open");
  assert.equal(audio.currentTime, 0.5);
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.loadCalls, 1);
  // 合併資格只有一次；之後重新進第三章仍正式重播。
  director.triggerStorySubtitle("chapter03-Open");
  assert.equal(audio.currentTime, 0);
});

test("第三章字幕：前面已遊玩後由曲頭重播並兩秒淡入", async t => {
  const { director, audio, advance, tick } = setup(t);
  director.setUserVolume(0.4);
  await director.play();
  advance(30000, 30);
  director.triggerStorySubtitle("chapter03-Open");
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.volume, 0);
  advance(1000, 1); tick();
  assert.equal(audio.volume, 0.2);
  advance(1000, 2); tick();
  assert.equal(audio.volume, 0.4);
  assert.equal(audio.playCalls, 1);
});

test("第三章字幕：後續 loop 恰好回到曲頭也不可誤判為初始化", async t => {
  const { director, audio, advance } = setup(t);
  await director.play();
  advance(60500, 0.5);
  director.triggerStorySubtitle("chapter03-Open");
  assert.equal(audio.currentTime, 0);
});

test("第三章字幕：自動播放尚未解鎖時不額外 play，等待既有重試", async t => {
  const { director, audio } = setup(t);
  director.triggerStorySubtitle("chapter03-Open");
  assert.equal(audio.playCalls, 0);
  assert.equal(audio.loadCalls, 1);
  await director.play();
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.currentTime, 0);
});

test("第三章字幕：重播不覆蓋事件靜音，也不強制開啟關閉中的 BGM", async t => {
  const { director, audio, advance, tick } = setup(t, [{
    id: "mute", enabled: true, triggerType: "event", targetId: "mute",
    state: "active", action: "mute", priority: 100,
    fadeInSeconds: 0, fadeOutSeconds: 0, restoreMode: "resume",
  }]);
  await director.play();
  advance(30000, 30);
  director.setState("event", "mute", "active"); tick();
  director.setEnabled(false);
  director.triggerStorySubtitle("chapter03-Open");
  assert.equal(audio.currentTime, 0);
  advance(1000, 1); tick();
  assert.equal(audio.volume, 0);
  assert.equal(audio.paused, true);
  assert.equal(audio.playCalls, 1);
});

test("其他字幕不重播；第三章接點只在第一張字幕呈現，並保留初始化前事件", async t => {
  const { director, audio, advance } = setup(t);
  await director.play(); advance(30000, 30);
  director.triggerStorySubtitle("chapter04-Open");
  assert.equal(audio.currentTime, 30);
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const callback = source.slice(source.indexOf("showCenteredText: (action) =>"), source.indexOf("restartCenteredTextFadeOut:"));
  assert.match(callback, /getActiveFlowId\(\) === CHAPTER_3_START_FLOW.id/);
  assert.match(callback, /action === CHAPTER_3_START_FLOW.actions.find/);
  assert.match(callback, /triggerStorySubtitle\("chapter03-Open"\)/);
  assert.match(callback, /pendingBgmSubtitleRef.current = "chapter03-Open"/);
  assert.match(source, /bgmDirector.triggerStorySubtitle\(pendingBgmSubtitleRef.current\)/);
});
