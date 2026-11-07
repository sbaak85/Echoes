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
  assert.match(lab, /requestChapterAutoStart\(3\);\s*window\.location\.reload\(\)/);

  const entry = readFileSync(new URL("../app/game-entry.tsx", import.meta.url), "utf8");
  assert.match(entry, /takeChapterAutoStart\(\)/);
  assert.match(entry, /CHAPTER_AUTO_START_INLINE_SCRIPT/);
});
