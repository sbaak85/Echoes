import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CHAPTER02_ENDING_BLACKOUT,
  CHAPTER02_ENDING_DIALOGUE_ID,
  CHAPTER_AUTO_START_STORAGE_KEY,
  requestChapterAutoStart,
  takeChapterAutoStart,
} from "../app/chapter02-ending.ts";

function memoryStore() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

test("section-18 播完：黑畫面淡入 2 秒、停留 1 秒", () => {
  assert.equal(CHAPTER02_ENDING_DIALOGUE_ID, "chapter02-section-18");
  assert.deepEqual({ ...CHAPTER02_ENDING_BLACKOUT }, { fadeInMs: 2000, holdMs: 1000 });
});

test("章節交接標記只生效一次", () => {
  const store = memoryStore();
  assert.equal(takeChapterAutoStart(store), null);
  assert.equal(requestChapterAutoStart(3, store), true);
  assert.equal(store.data.get(CHAPTER_AUTO_START_STORAGE_KEY), "3");
  assert.equal(takeChapterAutoStart(store), 3);
  assert.equal(takeChapterAutoStart(store), null);
  store.setItem(CHAPTER_AUTO_START_STORAGE_KEY, "9");
  assert.equal(takeChapterAutoStart(store), null);
});

test("駕駛座互動播放 section-18，播完後交接到第三章", () => {
  const scene = JSON.parse(readFileSync(new URL("../public/maps/ship_interior.scene.json", import.meta.url), "utf8"));
  const seat = scene.interactables.find((item) => item.id === "shipinterior-interaction-026");
  assert.equal(seat.storyDialogueId, CHAPTER02_ENDING_DIALOGUE_ID);

  const lab = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(lab, /request\.id === CHAPTER02_ENDING_DIALOGUE_ID && currentStoryChapterRef\.current === 2\) runChapter02Ending\(\)/);
  assert.match(lab, /fadeBlackScreen\(255, CHAPTER02_ENDING_BLACKOUT\.fadeInMs/);
  assert.match(lab, /requestChapterAutoStart\(3\);\s*holdPointerCursorForHandoffRef\.current\?\.\(\);\s*window\.location\.reload\(\)/);

  const entry = readFileSync(new URL("../app/game-entry.tsx", import.meta.url), "utf8");
  assert.match(entry, /takeChapterAutoStart\(\)/);
  assert.match(entry, /CHAPTER_AUTO_START_INLINE_SCRIPT/);
});

test("第二章結尾：全黑停留後播 chapter02-End 字幕（規格同 chapter03-End、黑畫面保持），再進第三章", async () => {
  const ending = await import("../app/chapter02-ending.ts");
  assert.equal(ending.CHAPTER02_END_SUBTITLE_EVENT_ID, "chapter02-End");
  const { STORY_CHAPTERS } = await import("../app/story-content.ts");
  const { findStorySubtitleEventById, createStorySubtitleFlow } = await import("../app/story-subtitle-flow.ts");
  const ch2 = findStorySubtitleEventById(STORY_CHAPTERS, "chapter02-End").event;
  const ch3 = findStorySubtitleEventById(STORY_CHAPTERS, "chapter03-End").event;
  for (const key of ["fadeInMs", "holdMs", "fadeOutMs", "delayBeforeMs", "delayAfterMs", "subtitleDurationMs", "lockInput"]) {
    assert.equal(ch2[key], ch3[key], key);
  }
  assert.deepEqual(ch2.lines.map((line) => line.fontSizePx), ch3.lines.map((line) => line.fontSizePx));
  const flow = createStorySubtitleFlow(2, { ...ch2, keepBlack: true }, 1, { blackAlreadyVisible: true });
  assert.equal(flow.keepBlackAfterComplete, true);
  const subtitle = flow.actions.find((action) => action.type === "showBlackSubtitle");
  assert.equal(subtitle.blackAlreadyVisible, true);
  assert.equal(subtitle.keepBlack, true);
  const lab = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(lab, /playEndSubtitle\(\)\.then\(handOff\)/);
});

test("章節交接重新載入：游標在同一位置接續顯示，不必等滑鼠移動", () => {
  const lab = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(lab, /requestChapterAutoStart\(3\);\s*holdPointerCursorForHandoffRef\.current\?\.\(\);\s*window\.location\.reload\(\)/);
  assert.match(lab, /sessionStorage\.getItem\(CURSOR_HANDOFF_VISIBLE_STORAGE_KEY\) === "1"/);
});
