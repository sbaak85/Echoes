import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AtmosphereEntryTimeline,
  CHAPTER02_ATMOSPHERE_ENTRY_DIALOGUE_ID,
  CHAPTER02_ATMOSPHERE_ENTRY_END_SECONDS,
  CHAPTER02_ATMOSPHERE_ENTRY_SEGMENTS,
  ATMOSPHERE_ENTRY_BASE_PARAMS,
  resolveAtmosphereEntryState,
} from "../app/atmosphere-entry.ts";

const step = (timeline, seconds, dt = 0.05) => {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += dt) timeline.advance(dt);
  return timeline.time;
};

test("section-18 的 line-001／005／008 分別推進到 6、8.5、10 秒，總長 10 秒", () => {
  assert.equal(CHAPTER02_ATMOSPHERE_ENTRY_DIALOGUE_ID, "chapter02-section-18");
  assert.deepEqual(CHAPTER02_ATMOSPHERE_ENTRY_SEGMENTS.map((item) => [item.lineId, item.from, item.to]), [
    ["chapter02-section-18-line-001", 0, 6],
    ["chapter02-section-18-line-005", 6, 8.5],
    ["chapter02-section-18-line-008", 8.5, 10],
  ]);
  assert.equal(CHAPTER02_ATMOSPHERE_ENTRY_END_SECONDS, 10);
  const saved = JSON.parse(readFileSync(new URL("../public/effects/chapter02_atmosphere_entry.json", import.meta.url), "utf8"));
  assert.equal(saved.duration, 10);
});

test("正常速度：每段照實際時間推進，停在該段終點等下一句", () => {
  const timeline = new AtmosphereEntryTimeline(CHAPTER02_ATMOSPHERE_ENTRY_SEGMENTS);
  assert.equal(timeline.active, false);
  timeline.lineStarted("chapter02-section-18-line-001");
  assert.equal(timeline.active, true);
  assert.ok(Math.abs(step(timeline, 3) - 3) < 1e-6);
  assert.equal(step(timeline, 10), 6);
  timeline.lineStarted("chapter02-section-18-line-002");
  assert.equal(step(timeline, 2), 6);
  timeline.lineStarted("chapter02-section-18-line-005");
  assert.equal(step(timeline, 2.5), 8.5);
  timeline.lineStarted("chapter02-section-18-line-008");
  assert.equal(step(timeline, 5), 10);
});

test("快速跳過台詞：加速推進，在該段標稱時長內追到終點", () => {
  const timeline = new AtmosphereEntryTimeline(CHAPTER02_ATMOSPHERE_ENTRY_SEGMENTS);
  timeline.lineStarted("chapter02-section-18-line-001");
  step(timeline, 1);
  timeline.lineStarted("chapter02-section-18-line-005");
  // 從 1 秒走到 8.5 秒只花 2.5 秒（3 倍速）
  assert.ok(Math.abs(step(timeline, 1.25) - 4.75) < 1e-6);
  assert.ok(Math.abs(step(timeline, 1.25) - 8.5) < 1e-6);
  // 對話提早結束：黑畫面淡入 2 秒內走完
  timeline.finish(10, 2);
  assert.ok(Math.abs(step(timeline, 2) - 10) < 1e-6);
});

test("時間軸各點的效果進度", () => {
  const p = ATMOSPHERE_ENTRY_BASE_PARAMS;
  const start = resolveAtmosphereEntryState(p, 0);
  const end = resolveAtmosphereEntryState(p, 30);
  assert.equal(start.skyProgress, 0);
  assert.equal(start.speed, p.speedFrom);
  assert.equal(end.skyProgress, p.skyMaxOpacity);
  assert.equal(end.speed, p.speedTo);
  assert.equal(end.cloudCount, p.cloudCountEnd);
  assert.equal(end.flameIntensity, 1);
});

test("遊戲接上 section-18 的台詞與畫面", () => {
  const lab = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(lab, /dialogueId === CHAPTER02_ATMOSPHERE_ENTRY_DIALOGUE_ID[\s\S]{0,120}lineStarted\(lineId\)/);
  assert.match(lab, /chapter02AtmosphereRef\.current\?\.finish\(CHAPTER02_ATMOSPHERE_ENTRY_END_SECONDS/);
  assert.match(lab, /atmosphereBackdrop\.draw\(/);
  assert.match(lab, /atmosphereBowFlame\.draw\(/);
  const preview = readFileSync(new URL("../app/atmosphere-preview/page.tsx", import.meta.url), "utf8");
  assert.match(preview, /from "\.\.\/atmosphere-entry"/);
});

test("line-005 開始時 3 支火焰聲 5 秒內從目前音量減掉 6 成，並沿用到之後接力的片段", async () => {
  const fire = await import("../app/ship-fire.ts");
  assert.equal(fire.SHIP_FIRE_LOOP_FADE_LINE_ID, "chapter02-section-18-line-005");
  assert.equal(fire.SHIP_FIRE_LOOP_FADE_SECONDS, 5);
  assert.equal(fire.SHIP_FIRE_LOOP_FADE_GAIN, 0.4);
  assert.deepEqual([...fire.SHIP_FIRE_LOOP_AUDIO_EVENTS], ["chapter02ShipFireLoop1", "chapter02ShipFireLoop2", "chapter02ShipFireLoop3"]);
  const lab = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(lab, /lineId === SHIP_FIRE_LOOP_FADE_LINE_ID\) \{\s*audioEventManagerRef\.current\?\.fadeEventGain\(SHIP_FIRE_LOOP_AUDIO_EVENTS, SHIP_FIRE_LOOP_FADE_GAIN, SHIP_FIRE_LOOP_FADE_SECONDS\)/);
  const manager = readFileSync(new URL("../app/audio-event-manager.ts", import.meta.url), "utf8");
  // 倍率疊在音量包絡上（換下一支片段也沿用），從目前倍率線性變化
  assert.match(manager, /smoothstep\(fadeOutProgress\) \* this\.resolveRuntimeGain\(runtime\)/);
  assert.match(manager, /from: this\.resolveRuntimeGain\(runtime, now\)/);
});
