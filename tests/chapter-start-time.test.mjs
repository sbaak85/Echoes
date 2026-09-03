import assert from "node:assert/strict";
import test from "node:test";

import { getChapterStartElapsedMinutes } from "../app/chapter-start-time.ts";

test("章節起始時間可延續上一章而不改變時間", () => {
  assert.equal(getChapterStartElapsedMinutes(20 * 60, {
    triggerType: "chapterStart",
    chapterStartTimeMode: "inherit",
  }), 0);
});

test("章節起始時間可設定距離上一章結束後經過幾小時", () => {
  assert.equal(getChapterStartElapsedMinutes(20 * 60, {
    triggerType: "chapterStart",
    chapterStartTimeMode: "elapsed",
    chapterStartElapsedMinutes: 6 * 60,
  }), 6 * 60);
});

test("指定時刻只向未來推進且能跨日", () => {
  assert.equal(getChapterStartElapsedMinutes(20 * 60, {
    triggerType: "chapterStart",
    chapterStartTimeMode: "clock",
    chapterStartClockMinuteOfDay: 8 * 60,
  }), 12 * 60);
  assert.equal(getChapterStartElapsedMinutes(6 * 60, {
    triggerType: "chapterStart",
    chapterStartTimeMode: "clock",
    chapterStartClockMinuteOfDay: 8 * 60,
  }), 2 * 60);
});

test("非章節開始事件不會套用章節起始時間", () => {
  assert.equal(getChapterStartElapsedMinutes(20 * 60, {
    triggerType: "afterDialogue",
    chapterStartTimeMode: "elapsed",
    chapterStartElapsedMinutes: 6 * 60,
  }), 0);
});
