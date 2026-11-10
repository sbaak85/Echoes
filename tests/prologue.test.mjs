import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { STORY_CHAPTERS, STORY_DIALOGUES } from "../app/story-content.ts";
import {
  PROLOGUE_BGM_FADE_OUT_MS,
  PROLOGUE_BGM_SOURCE,
  PROLOGUE_END_SUBTITLE_EVENT_ID,
  PROLOGUE_ILLUSTRATIONS,
  PROLOGUE_NEXT_CHAPTER,
  resolvePrologueSequence,
} from "../app/prologue-flow.ts";

const prologue = STORY_CHAPTERS.find((chapter) => chapter.id === "prologue");

test("序章腳本：開場黑畫面字幕、10 段對話、序章結束字幕", () => {
  assert.ok(prologue);
  assert.equal(prologue.chapterNumber, 0);
  assert.deepEqual(prologue.subtitleEvents.map((event) => [event.id, event.triggerType]), [
    ["prologue-Open", "chapterStart"],
    ["prologue-opening-card", "chapterStart"],
    ["prologue-End", "manual"],
  ]);
  assert.deepEqual(prologue.dialogueSections.map((section) => section.id),
    Array.from({ length: 10 }, (_, index) => `prologue-section-${index + 1}`));
  // 前 4 段是畫外旁白（世界觀），之後切換到 Sbaak 的視角
  for (const section of prologue.dialogueSections.slice(0, 4)) {
    assert.ok(section.dialogue.lines.every((line) => line.speaker === ""), section.id);
  }
  assert.ok(prologue.dialogueSections.slice(4).every((section) => section.dialogue.lines.some((line) => line.speaker === "Sbaak")));
  for (const section of prologue.dialogueSections) {
    assert.deepEqual(STORY_DIALOGUES[section.id], section.dialogue, section.id);
    for (const line of section.dialogue.lines) {
      // 台詞規範：全形標點，不用半形逗號／句號／驚嘆號／問號
      assert.doesNotMatch(line.text, /[,!?]|\.(?!\d)/, line.lineId);
      if (line.speaker === "飛航電腦AI") assert.match(line.text, /^- /, line.lineId);
    }
  }
});

test("序章結束字幕的規格與 chapter02-End、chapter03-End 一致", () => {
  const end = prologue.subtitleEvents.find((event) => event.id === PROLOGUE_END_SUBTITLE_EVENT_ID);
  const ch2 = STORY_CHAPTERS.find((chapter) => chapter.id === "chapter02").subtitleEvents.find((event) => event.id === "chapter02-End");
  assert.equal(end.text, "序章結束");
  for (const key of ["fadeInMs", "holdMs", "fadeOutMs", "delayBeforeMs", "delayAfterMs", "subtitleDurationMs", "lockInput"]) {
    assert.equal(end[key], ch2[key], key);
  }
  assert.equal(end.lines[0].fontSizePx, ch2.lines[0].fontSizePx);
});

test("ChapterScriptEditor 的原始資料與遊戲資料同步", () => {
  const source = readFileSync(new URL("../app/story-content.ts", import.meta.url), "utf8");
  const blob = source.split("CHAPTER_SCRIPT_EDITOR_DATA_BEGIN")[1].split("CHAPTER_SCRIPT_EDITOR_DATA_END")[0].trim();
  const document = JSON.parse(Buffer.from(blob, "base64").toString("utf8"));
  assert.deepEqual(document.chapters[0], JSON.parse(JSON.stringify(prologue)));
});

test("播放順序：開場字幕 → 6 張插圖（前 4 張各 2 段、後 2 張各 1 段對話）→ 序章結束 → 第二章", () => {
  assert.deepEqual(PROLOGUE_ILLUSTRATIONS.map((item) => item.sectionIds.length), [2, 2, 2, 2, 1, 1]);
  const { steps, end } = resolvePrologueSequence(STORY_CHAPTERS);
  assert.deepEqual(steps.map((step) => step.kind === "subtitle" ? step.event.id : [step.imagePath, step.dialogues.map((item) => item.id)]), [
    "prologue-Open",
    "prologue-opening-card",
    ...PROLOGUE_ILLUSTRATIONS.map((item) => [item.imagePath, [...item.sectionIds]]),
  ]);
  assert.equal(end.id, "prologue-End");
  assert.equal(PROLOGUE_NEXT_CHAPTER, 2);
  for (const item of PROLOGUE_ILLUSTRATIONS) {
    assert.ok(existsSync(new URL(`../public/${item.imagePath}`, import.meta.url)), item.imagePath);
  }
});

test("section-10：駛離地球軌道的新插圖，船員對話接在原本的開頭與結尾之間", () => {
  const lines = STORY_DIALOGUES["prologue-section-10"].lines;
  assert.equal(lines[0].lineId, "prologue-section-10-line-001");
  assert.deepEqual(lines.slice(-2).map((line) => line.lineId), ["prologue-section-10-line-002", "prologue-section-10-line-003"]);
  assert.ok(lines.length > 3);
  for (const speaker of ["米拉", "歐文", "蕾娜", "飛航電腦AI"]) {
    assert.ok(lines.some((line) => line.speaker === speaker), speaker);
  }
  for (const line of lines) assert.ok(line.text.replace(/\n/g, "").length <= 96, `${line.lineId} 超過單頁 96 字`);
  assert.equal(PROLOGUE_ILLUSTRATIONS.at(-1).imagePath, "ui/interaction-illustrations/序章_伊薩卡號_駛離地球軌道_v1.png");
});

test("沒有對應插圖的新段落沿用前一張插圖", () => {
  const chapters = [{
    id: "prologue",
    subtitleEvents: [],
    dialogueSections: [
      { id: "prologue-section-1", dialogue: { lines: [] } },
      { id: "prologue-section-extra", dialogue: { lines: [] } },
      { id: "prologue-section-3", dialogue: { lines: [] } },
    ],
  }];
  const { steps } = resolvePrologueSequence(chapters);
  assert.deepEqual(steps.map((step) => step.dialogues.map((item) => item.id)), [
    ["prologue-section-1", "prologue-section-extra"],
    ["prologue-section-3"],
  ]);
});

test("章節選單：序章在第二章、第三章之上；序章結束後交接游標並進入第二章", () => {
  const entry = readFileSync(new URL("../app/game-entry.tsx", import.meta.url), "utf8");
  const order = ["\"prologue\"", "id: 2,", "id: 3,"].map((token) => entry.indexOf(token));
  assert.ok(order.every((index) => index > 0) && order[0] < order[1] && order[1] < order[2]);
  assert.match(entry, /void choose\(PROLOGUE_NEXT_CHAPTER\)/);
  const player = readFileSync(new URL("../app/prologue-player.tsx", import.meta.url), "utf8");
  assert.match(player, /CURSOR_HANDOFF_VISIBLE_STORAGE_KEY, "1"/);
  assert.match(player, /<DialoguePlayerView /);
});

test("序章 BGM：開場循環播放 Prologue1.mp3，「序章結束」字幕出現時 2.5 秒淡出", () => {
  assert.equal(PROLOGUE_BGM_SOURCE, "audio/Prologue1.mp3");
  assert.ok(existsSync(new URL(`../public/${PROLOGUE_BGM_SOURCE}`, import.meta.url)));
  assert.equal(PROLOGUE_BGM_FADE_OUT_MS, 2500);
  const player = readFileSync(new URL("../app/prologue-player.tsx", import.meta.url), "utf8");
  assert.match(player, /bgm\.loop = true;/);
  assert.match(player, /fadeOutBgm\(\);\s*if \(end\) await showSubtitle\(end\);/);
});
