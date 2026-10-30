import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Chapter02WhiteRift, CHAPTER02_WHITE_RIFT_FLOW, CHAPTER02_WHITE_RIFT_DIALOGUE, CHAPTER02_WHITE_RIFT_REVEAL_LINE, WHITE_RIFT_SETTINGS } from "../app/chapter02-white-rift.ts";
import { ChapterFlowManager } from "../app/chapter-flow-manager.ts";
import { createDialoguePlayer } from "../app/dialogue-player.ts";
import { STORY_DIALOGUES } from "../app/story-content.ts";

function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 0, opacity = 0, suspended = false, finishDialogue;
  const events = [];
  t.mock.method(performance, "now", () => now);
  const rift = new Chapter02WhiteRift({
    setOpacity: value => { opacity = value; },
    setEmergencySuspended: value => { suspended = value; events.push([now, "suspend", value]); },
    playDialogue: id => { events.push([now, "dialogue", id]); return new Promise(resolve => { finishDialogue = resolve; }); },
  });
  const advance = async ms => { for(let elapsed=0;elapsed<ms;elapsed+=10) { now+=10;t.mock.timers.tick(10);for(let i=0;i<5;i++)await Promise.resolve(); } };
  return {rift,events,advance,get now(){return now;},get opacity(){return opacity;},get suspended(){return suspended;},finish:()=>finishDialogue({completed:true})};
}

test("accepted preview parameters and exact authored dialogue line are retained", () => {
  assert.deepEqual(WHITE_RIFT_SETTINGS,{spotCount:12,density:1.5,spotSize:.8});
  assert.equal(STORY_DIALOGUES[CHAPTER02_WHITE_RIFT_DIALOGUE].lines[1].lineId, CHAPTER02_WHITE_RIFT_REVEAL_LINE);
});

test("2s fade, suspend at full white, 2s hold, then section-13; only line-002 starts the 2s reveal", async t => {
  const h=setup(t), run=h.rift.run();
  await h.advance(1000);assert.ok(h.opacity>.45&&h.opacity<.55);assert.equal(h.suspended,false);
  await h.advance(1020);assert.equal(h.opacity,1);assert.equal(h.suspended,true);assert.equal(h.events.filter(e=>e[1]==="dialogue").length,0);
  await h.advance(1900);assert.equal(h.events.filter(e=>e[1]==="dialogue").length,0);
  await h.advance(100);assert.equal(h.events.find(e=>e[1]==="dialogue")[2],CHAPTER02_WHITE_RIFT_DIALOGUE);
  h.rift.lineStarted("other",CHAPTER02_WHITE_RIFT_REVEAL_LINE);
  h.rift.lineStarted(CHAPTER02_WHITE_RIFT_DIALOGUE,"chapter02-section-13-line-001");
  await h.advance(500);assert.equal(h.opacity,1);assert.equal(h.suspended,true);
  h.rift.lineStarted(CHAPTER02_WHITE_RIFT_DIALOGUE,CHAPTER02_WHITE_RIFT_REVEAL_LINE);
  assert.equal(h.suspended,false);
  await h.advance(1000);assert.ok(h.opacity>.45&&h.opacity<.55);
  h.rift.lineStarted(CHAPTER02_WHITE_RIFT_DIALOGUE,CHAPTER02_WHITE_RIFT_REVEAL_LINE); // another page must not restart the fade
  await h.advance(1020);assert.equal(h.opacity,0);assert.equal(h.rift.isActive(),true,"dialogue keeps ownership after the scene is revealed");
  h.finish();await run;assert.equal(h.rift.isActive(),false);
});

test("fast completion waits for the reveal, and a removed cue line has a safe fade-out fallback", async t => {
  const h=setup(t),run=h.rift.run();await h.advance(4020);h.finish();await h.advance(1000);
  assert.equal(h.rift.isActive(),true);assert.ok(h.opacity>0&&h.opacity<1);
  await h.advance(1040);await run;assert.equal(h.opacity,0);assert.equal(h.suspended,false);
});

test("pause freezes timings; cancellation restores a clear screen and suppresses delayed dialogue", async t => {
  const h=setup(t),run=h.rift.run();await h.advance(1000);h.rift.setPaused(true);const opacity=h.opacity;
  await h.advance(5000);assert.equal(h.opacity,opacity);assert.equal(h.events.length,0);
  h.rift.setPaused(false);await h.advance(1020);assert.equal(h.suspended,true);
  h.rift.cancel();await run;await h.advance(6000);
  assert.equal(h.opacity,0);assert.equal(h.suspended,false);assert.equal(h.events.filter(e=>e[1]==="dialogue").length,0);
});

test("skip during dialogue cancels the white effect and releases the shared chapter input lock", async t => {
  const h=setup(t),locks=[];
  const manager=new ChapterFlowManager({
    setInputLocked:value=>locks.push(value),setBlack:()=>{},fadeToBlack:()=>{},fadeFromBlack:()=>{},showCenteredText:()=>{},hideCenteredText:()=>{},
    playDialogue:async()=>({completed:true}),cancelDialogue:()=>{},markCompleted:()=>{},isCompleted:()=>false,
    playWhiteRiftTransition:()=>h.rift.run(),cancelWhiteRiftTransition:()=>h.rift.cancel(),
  });
  const run=manager.run(CHAPTER02_WHITE_RIFT_FLOW);assert.deepEqual(locks,[true]);
  await h.advance(4020);assert.equal(h.suspended,true);
  manager.requestSkip();await run;assert.equal(h.opacity,0);assert.equal(h.suspended,false);assert.equal(locks.at(-1),false);assert.equal(manager.isActive(),false);
});

test("dialogue line cue fires once at the true line boundary, not on typewriter ticks or pagination", () => {
  const cues=[],playback={current:null},typing={current:null};
  const player=createDialoguePlayer({playback,typing,historyOpen:{current:false},setView:()=>{},setHistory:()=>{},setTimer:()=>0,clearTimer:()=>{},onLineStarted:(...cue)=>cues.push(cue)});
  player.present(CHAPTER02_WHITE_RIFT_DIALOGUE,{},()=>{}, {characterDelaySeconds:0,lines:[
    {lineId:"chapter02-section-13-line-001",speaker:"",text:"白".repeat(200)},
    {lineId:CHAPTER02_WHITE_RIFT_REVEAL_LINE,speaker:"AI",text:"已脫離曲速"},
  ]});
  assert.equal(cues.length,1);player.advance();assert.equal(cues.length,1);player.advance();assert.equal(cues.length,1);
  player.advance();assert.deepEqual(cues.at(-1),[CHAPTER02_WHITE_RIFT_DIALOGUE,CHAPTER02_WHITE_RIFT_REVEAL_LINE]);assert.equal(cues.length,2);
});

test("runtime wiring preserves red lighting, stops only the shake impacts, and renders dialogue above white", () => {
  const source=readFileSync(new URL("../app/movement-lab.tsx",import.meta.url),"utf8");
  assert.match(source,/request.id === CHAPTER02_WHITE_RIFT_TRIGGER && currentStoryChapterRef.current === 2/);
  assert.match(source,/if \(suspended\) for \(const event of CHAPTER02_SHAKE_AUDIO_EVENTS\) audioEventManagerRef.current\?\.stop\(event\)/);
  assert.match(source,/!shipEmergencySuspendedRef.current && SCENE_DATA.sceneId === RED_ALERT_SCENE_ID/);
  const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(css,/\.white-rift-overlay \{[^}]*z-index: 91/);
  assert.match(css,/\.game-shell.is-story-flow \.dialogue-box \{[^}]*z-index: 93/);
});

test("pending flag: resumes only in chapter 2 on the ship, and clears only after a finished reveal", async t => {
  const { shouldResumeChapter02WhiteRift, CHAPTER02_WHITE_RIFT_PENDING_FLAG: FLAG } = await import("../app/chapter02-white-rift.ts");
  assert.equal(shouldResumeChapter02WhiteRift({ [FLAG]: true }, 2, "ship_interior"), true);
  assert.equal(shouldResumeChapter02WhiteRift({ [FLAG]: false }, 2, "ship_interior"), false);
  assert.equal(shouldResumeChapter02WhiteRift({}, 2, "ship_interior"), false);
  assert.equal(shouldResumeChapter02WhiteRift({ [FLAG]: true }, 3, "ship_interior"), false);
  assert.equal(shouldResumeChapter02WhiteRift({ [FLAG]: true }, 2, "planet"), false);

  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 0, finishDialogue, completed = 0;
  t.mock.method(performance, "now", () => now);
  const make = () => new Chapter02WhiteRift({
    setOpacity: () => {}, setEmergencySuspended: () => {},
    playDialogue: () => new Promise(resolve => { finishDialogue = resolve; }),
    onCompleted: () => completed++,
  });
  const advance = async ms => { for (let e = 0; e < ms; e += 10) { now += 10; t.mock.timers.tick(10); for (let i = 0; i < 5; i++) await Promise.resolve(); } };
  const cancelled = make(), run1 = cancelled.run();
  await advance(4020); cancelled.cancel(); await run1;
  assert.equal(completed, 0, "an interrupted transition stays pending");
  const finished = make(), run2 = finished.run();
  await advance(4020); finishDialogue({ completed: true }); await advance(2100); await run2;
  assert.equal(completed, 1, "finished section-13 plus a clear screen clears the pending flag");
});

test("runtime wiring saves the pending flag before playing and replays it on chapter 2 load", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /setStoryFlag\(CHAPTER02_WHITE_RIFT_PENDING_FLAG, true\);\s*void chapterFlowManagerRef\.current\?\.run\(CHAPTER02_WHITE_RIFT_FLOW\)/);
  assert.match(source, /onCompleted: \(\) => setStoryFlag\(CHAPTER02_WHITE_RIFT_PENDING_FLAG, false\)/);
  assert.match(source, /shouldResumeChapter02WhiteRift\(storyProgressRef\.current\.storyFlags, chapter, SCENE_DATA\.sceneId\)\) \{\s*startChapter02WhiteRift\(\);/);
});

test("warp exit: full white sets the flag, and the ship starfield keeps warp streaks at speed 0.2", async t => {
  const { resolveChapter02Backdrop, CHAPTER02_WARP_EXITED_FLAG: FLAG } = await import("../app/chapter02-white-rift.ts");
  const scene = JSON.parse(readFileSync(new URL("../public/maps/ship_interior.scene.json", import.meta.url), "utf8"));
  const backdrop = scene.backdrop;
  assert.equal(resolveChapter02Backdrop(backdrop, {}, 2, "ship_interior"), backdrop, "unchanged before the warp exit");
  assert.equal(resolveChapter02Backdrop(backdrop, { [FLAG]: true }, 3, "ship_interior"), backdrop);
  const slowed = resolveChapter02Backdrop(backdrop, { [FLAG]: true }, 2, "ship_interior");
  assert.deepEqual(slowed, { ...backdrop, mode: "warp", speed: 0.2 });
  assert.equal(resolveChapter02Backdrop(backdrop, { [FLAG]: true }, 2, "ship_interior"), slowed, "no per-frame allocation");
  assert.equal(backdrop.speed, 0.6, "scene data is not mutated");

  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 0, opacity = 0, fullWhiteAt = null;
  t.mock.method(performance, "now", () => now);
  const rift = new Chapter02WhiteRift({
    setOpacity: v => { opacity = v; }, setEmergencySuspended: () => {},
    playDialogue: () => new Promise(() => {}), onFullWhite: () => { fullWhiteAt = opacity; },
  });
  void rift.run();
  for (let e = 0; e < 2100; e += 10) { now += 10; t.mock.timers.tick(10); for (let i = 0; i < 5; i++) await Promise.resolve(); }
  assert.equal(fullWhiteAt, 1, "speed changes only while the screen is fully white");
  rift.cancel();
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /onFullWhite: \(\) => setStoryFlag\(CHAPTER02_WARP_EXITED_FLAG, true\)/);
  assert.match(source, /const sceneBackdrop = resolveChapter02Backdrop\(/);
});

test("warp exit: hull streaks outside the ship slow down by the same ratio as the starfield", async () => {
  const { resolveChapter02HullStreams, CHAPTER02_WARP_EXITED_FLAG: FLAG } = await import("../app/chapter02-white-rift.ts");
  const scene = JSON.parse(readFileSync(new URL("../public/maps/ship_interior.scene.json", import.meta.url), "utf8"));
  const lanes = scene.hullStreams;
  assert.ok(lanes.length > 0);
  assert.equal(resolveChapter02HullStreams(lanes, scene.backdrop, {}, 2, "ship_interior"), lanes);
  assert.equal(resolveChapter02HullStreams(lanes, scene.backdrop, { [FLAG]: true }, 3, "ship_interior"), lanes);
  const slowed = resolveChapter02HullStreams(lanes, scene.backdrop, { [FLAG]: true }, 2, "ship_interior");
  const ratio = 0.2 / scene.backdrop.speed;
  slowed.forEach((lane, i) => assert.ok(Math.abs(lane.speed - (lanes[i].speed ?? 1) * ratio) < 1e-9));
  assert.equal(resolveChapter02HullStreams(lanes, scene.backdrop, { [FLAG]: true }, 2, "ship_interior"), slowed, "no per-frame allocation");
  assert.equal(lanes[0].speed, undefined, "scene data is not mutated");
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/sceneHullStreams\.draw\(context, hullStreams,/g) ?? []).length, 2);
});
