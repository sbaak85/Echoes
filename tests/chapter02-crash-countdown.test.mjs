import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  CHAPTER02_COUNTDOWN_ACTIVE_FLAG as ACTIVE,
  CHAPTER02_COUNTDOWN_STOPPED_FLAG as STOPPED,
  CHAPTER02_COUNTDOWN_TIMER_ID as TIMER,
  CHAPTER02_COUNTDOWN_START_MS,
  CHAPTER02_COUNTDOWN_TRIGGER_DIALOGUE,
  CHAPTER02_COUNTDOWN_STOP_DIALOGUE,
  CHAPTER02_COUNTDOWN_DELAY_MS,
  CHAPTER02_COUNTDOWN_FREEZE_AT_MS,
  CHAPTER02_COUNTDOWN_DOCK_AT_MS,
  formatChapter02Countdown,
  getChapter02CountdownRemaining,
  isChapter02CountdownRunning,
  resolveChapter02CountdownView,
  withChapter02CountdownRemaining,
  shouldPlayChapter02CountdownFollowUp,
  CHAPTER02_COUNTDOWN_FOLLOW_UP_DIALOGUE,
  CHAPTER02_COUNTDOWN_FOLLOW_UP_AT_MS,
  CHAPTER02_COUNTDOWN_FOLLOW_UP_DONE_FLAG as FOLLOW_UP_DONE,
} from "../app/chapter02-crash-countdown.ts";
import { normalizeStoryProgress } from "../app/story-progress.ts";
import { normalizeSurvivalState, createInitialSurvivalState } from "../app/survival-manager.ts";

const story = (flags = {}, timers, chapter = 2) => ({ currentChapter: chapter, completedEventIds: [], storyFlags: flags, ...(timers ? { storyTimers: timers } : {}) });

test("starts at 06:00:00 one second after section-13, stops when section-16 starts", () => {
  assert.equal(CHAPTER02_COUNTDOWN_START_MS, 360000);
  assert.deepEqual(formatChapter02Countdown(CHAPTER02_COUNTDOWN_START_MS), { minutes: "06", seconds: "00", centiseconds: "00" });
  assert.deepEqual(formatChapter02Countdown(61234), { minutes: "01", seconds: "01", centiseconds: "24" });
  assert.deepEqual(formatChapter02Countdown(1), { minutes: "00", seconds: "00", centiseconds: "01" }, "never shows 00:00:00 before it really ends");
  assert.deepEqual(formatChapter02Countdown(-5), { minutes: "00", seconds: "00", centiseconds: "00" });
  assert.equal(CHAPTER02_COUNTDOWN_TRIGGER_DIALOGUE, "chapter02-section-13");
  assert.equal(CHAPTER02_COUNTDOWN_STOP_DIALOGUE, "chapter02-section-16");
  assert.equal(CHAPTER02_COUNTDOWN_DELAY_MS, 1000);
  assert.ok(CHAPTER02_COUNTDOWN_DOCK_AT_MS - CHAPTER02_COUNTDOWN_FREEZE_AT_MS >= 1000, "holds in the centre for at least 1 s after freezing");
});

test("view and running state survive a reload", () => {
  assert.equal(resolveChapter02CountdownView(story()), "hidden");
  assert.equal(resolveChapter02CountdownView(story({ [ACTIVE]: true }, { [TIMER]: CHAPTER02_COUNTDOWN_START_MS })), "intro", "fresh start or retry replays the intro");
  assert.equal(resolveChapter02CountdownView(story({ [ACTIVE]: true }, { [TIMER]: 200000 })), "docked");
  assert.equal(resolveChapter02CountdownView(story({ [ACTIVE]: true, [STOPPED]: true }, { [TIMER]: CHAPTER02_COUNTDOWN_START_MS })), "docked");
  assert.equal(resolveChapter02CountdownView(story({ [ACTIVE]: true }, { [TIMER]: 200000 }, 3)), "hidden");
  assert.equal(isChapter02CountdownRunning(story({ [ACTIVE]: true }, { [TIMER]: 200000 })), true);
  assert.equal(isChapter02CountdownRunning(story({ [ACTIVE]: true, [STOPPED]: true }, { [TIMER]: 200000 })), false);
  assert.equal(isChapter02CountdownRunning(story({ [ACTIVE]: true }, { [TIMER]: 0 })), false);
  assert.equal(getChapter02CountdownRemaining(story({ [ACTIVE]: true })), CHAPTER02_COUNTDOWN_START_MS);
  assert.equal(getChapter02CountdownRemaining(withChapter02CountdownRemaining(story(), 1234.6)), 1235);
});

test("story timers persist through save normalisation; old saves stay unchanged", () => {
  const saved = normalizeStoryProgress(JSON.parse(JSON.stringify(withChapter02CountdownRemaining(story({ [ACTIVE]: true }), 123456))));
  assert.equal(saved.storyTimers[TIMER], 123456);
  assert.deepEqual(Object.keys(normalizeStoryProgress(story())), ["currentChapter", "completedEventIds", "storyFlags"]);
  assert.deepEqual(normalizeStoryProgress({ ...story(), storyTimers: { a: -1, b: "x", c: 5 } }).storyTimers, { c: 5 });
});

test("crash is a persisted Game Over reason", () => {
  const state = createInitialSurvivalState();
  assert.equal(normalizeSurvivalState({ ...state, gameOverReason: "crash" }).gameOverReason, "crash");
});

test("runtime wiring", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /request\.id === CHAPTER02_COUNTDOWN_TRIGGER_DIALOGUE && currentStoryChapterRef\.current === 2\) \{\s*window\.setTimeout\(startChapter02Countdown, CHAPTER02_COUNTDOWN_DELAY_MS\)/);
  assert.match(source, /if \(dialogueId === CHAPTER02_COUNTDOWN_STOP_DIALOGUE\) stopChapter02Countdown\(\)/);
  assert.match(source, /advanceChapter02Countdown\(survivalPaused, survivalDeltaSeconds\);/, "pauses with dialogue, story flows and menus");
  assert.match(source, /window\.localStorage\.setItem\(CHAPTER02_COUNTDOWN_CHECKPOINT_KEY/);
  assert.match(source, /restoreChapter02Countdown\(\);/);
  assert.equal((source.match(/confirmGameOverAction\(\);/g) ?? []).length, 2, "keyboard and gamepad");
  assert.match(source, /onClick=\{confirmGameOverAction\}/);
  assert.match(source, /CHAPTER02_CRASH_GAME_OVER_IMAGE\s*: "gameover\.png"/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.chapter02-countdown\.is-stage-docked \{[^}]*top: 64px;[^}]*scale\(0\.55\)/);
});

test("section-14 plays automatically once the docked countdown reaches 05:56:50", () => {
  assert.equal(CHAPTER02_COUNTDOWN_FOLLOW_UP_DIALOGUE, "chapter02-section-14");
  assert.equal(CHAPTER02_COUNTDOWN_FOLLOW_UP_AT_MS, 356500);
  assert.ok(CHAPTER02_COUNTDOWN_START_MS - CHAPTER02_COUNTDOWN_FOLLOW_UP_AT_MS > CHAPTER02_COUNTDOWN_DOCK_AT_MS - CHAPTER02_COUNTDOWN_FREEZE_AT_MS + 520, "after the dock animation");
  assert.equal(shouldPlayChapter02CountdownFollowUp(story({ [ACTIVE]: true }, { [TIMER]: 356501 })), false);
  assert.equal(shouldPlayChapter02CountdownFollowUp(story({ [ACTIVE]: true }, { [TIMER]: 356500 })), true);
  assert.equal(shouldPlayChapter02CountdownFollowUp(story({ [ACTIVE]: true }, { [TIMER]: 200000 })), true, "a reload before it finished replays it");
  assert.equal(shouldPlayChapter02CountdownFollowUp(story({ [ACTIVE]: true, [FOLLOW_UP_DONE]: true }, { [TIMER]: 200000 })), false);
  assert.equal(shouldPlayChapter02CountdownFollowUp(story({ [ACTIVE]: true, [STOPPED]: true }, { [TIMER]: 200000 })), false);
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!result\.completed\) return;\s*setStoryFlag\(CHAPTER02_COUNTDOWN_FOLLOW_UP_DONE_FLAG, true\);\s*\/\/[^\n]*\s*void chapterFlowManagerRef\.current\?\.run\(CHAPTER02_ESCAPE_ASSEMBLY_FLOW\)/);
});

test("countdown intro replays Alarm.mp3 (chapter02EmergencyAlarm)", async () => {
  const { CHAPTER02_COUNTDOWN_ALARM_EVENT } = await import("../app/chapter02-crash-countdown.ts");
  assert.equal(CHAPTER02_COUNTDOWN_ALARM_EVENT, "chapter02EmergencyAlarm");
  const audio = readFileSync(new URL("../app/audio-event-manager.ts", import.meta.url), "utf8");
  assert.match(audio, /"chapter02EmergencyAlarm": \{[\s\S]*?"\.\/audio\/Alarm\.mp3"/);
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(view === "intro"\) \{[^}]*chapter02CountdownCountFromRef\.current = [^;]+;\s*void audioEventManagerRef\.current\?\.play\(CHAPTER02_COUNTDOWN_ALARM_EVENT, \{ restart: true \}\)/);
});
