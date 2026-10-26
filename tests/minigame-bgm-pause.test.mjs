import assert from "node:assert/strict";
import test from "node:test";
import { BgmDirector, resolveBgmControlPlan } from "../app/bgm-director.ts";
import { BGM_CONTROL_RULES } from "../app/audio-event-manager.ts";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
function setup(t) {
  let now = 0, frameId = 0;
  const frames = new Map(), audios = [];
  class FakeAudio extends EventTarget {
    currentTime = 0; duration = 300; readyState = 1; paused = true; volume = 0;
    constructor() { super(); audios.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
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
  t.after(() => { director.dispose(); restorers.forEach(fn => fn()); });
  const advance = ms => {
    now += ms;
    audios.forEach(audio => { if (!audio.paused) audio.currentTime += ms / 1000; });
    const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));
  };
  return { director, map: audios[0], advance };
}

for (const minigameId of ["bus-card", "nav-terminal"]) {
  test(`${minigameId}: entering fades main_BGM out and pauses it; returning to the scene fades it back in from the same position`, async t => {
    const plan = resolveBgmControlPlan(BGM_CONTROL_RULES, (type, id) => type === "minigame" && id === minigameId ? "playing" : null);
    assert.equal(plan.trackId, "default"); assert.equal(plan.pausePlayback, true);
    assert.equal(plan.fadeOutSeconds, 1.5); assert.equal(plan.fadeInSeconds, 1.5);

    const { director, map, advance } = setup(t);
    await director.play(); advance(3000);
    const playingVolume = map.volume;
    assert.ok(playingVolume > 0, "main_BGM audible on the map");
    director.setMinigameState(minigameId, "playing");
    advance(750); assert.ok(map.volume > 0 && map.volume < playingVolume, "fading out"); assert.equal(map.paused, false);
    advance(800); assert.equal(map.volume, 0); assert.equal(map.paused, true, "paused while the minigame is open");
    const parked = map.currentTime;
    advance(5000); assert.equal(map.currentTime, parked);
    director.setMinigameState(minigameId, null);
    await director.play();
    advance(750); assert.equal(map.paused, false); assert.ok(map.volume > 0 && map.volume < playingVolume, "fading in");
    advance(800); near(map.volume, playingVolume);
    assert.ok(map.currentTime >= parked, "resumes from the parked position");
  });
}
