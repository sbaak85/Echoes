import assert from "node:assert/strict";
import test from "node:test";

import { ChapterFlowManager } from "../app/chapter-flow-manager.ts";
import { DialogueManager } from "../app/dialogue-manager.ts";
import {
  CHAPTER_3_START_DIALOGUE,
  CHAPTER_3_START_FLOW,
  CHAPTER_3_SECTION_1_DIALOGUE_ID,
  LOWER_LEFT_STORY_ZONE_DIALOGUE,
} from "../app/story-content.ts";
import { StoryEventManager } from "../app/story-event-manager.ts";

test("第三章開場腳本與流程符合第一版規格", () => {
  assert.equal(CHAPTER_3_START_DIALOGUE.lines.length, 9);
  assert.deepEqual(
    CHAPTER_3_START_DIALOGUE.lines.map((line) => line.speaker),
    ["", "", "???", "飛船輔助系統", "飛船輔助系統", "Sbaak", "飛船輔助系統", "Sbaak", "Sbaak"],
  );
  assert.ok(CHAPTER_3_START_DIALOGUE.lines.at(-1)?.text.trim());
  assert.equal(LOWER_LEFT_STORY_ZONE_DIALOGUE.lines[0]?.speaker, "Sbaak");
  assert.equal(LOWER_LEFT_STORY_ZONE_DIALOGUE.lines[0]?.text, "現在我還沒準備好。");

  const centeredText = CHAPTER_3_START_FLOW.actions.find(
    (action) => action.type === "showCenteredText",
  );
  assert.ok(centeredText);
  assert.equal(centeredText.fadeInMs, 1500);
  assert.equal(centeredText.holdMs, 8000);
  assert.equal(centeredText.fadeOutMs, 1500);
  assert.equal(CHAPTER_3_START_FLOW.chapter, 3);
  assert.equal(CHAPTER_3_START_FLOW.once, true);
  assert.equal(CHAPTER_3_SECTION_1_DIALOGUE_ID, "chapter03-section-1");

  const fadeIndex = CHAPTER_3_START_FLOW.actions.findIndex(
    (action) => action.type === "fadeFromBlack",
  );
  assert.deepEqual(
    CHAPTER_3_START_FLOW.actions.slice(fadeIndex, fadeIndex + 6),
    [
      { type: "fadeFromBlack", durationMs: 1000 },
      { type: "lockInput" },
      { type: "wait", durationMs: 1000 },
      { type: "playDialogue", dialogueId: CHAPTER_3_SECTION_1_DIALOGUE_ID },
      { type: "startQuest", questId: "QUEST_CH03_MAIN_001" },
      { type: "unlockInput" },
    ],
  );
  assert.equal(
    CHAPTER_3_START_FLOW.actions.some(
      (action) => action.type === "showMainObjectiveMarker",
    ),
    false,
  );
  assert.equal(
    CHAPTER_3_START_FLOW.skipActions?.some(
      (action) => action.type === "showMainObjectiveMarker",
    ),
    false,
  );
  assert.equal(
    CHAPTER_3_START_FLOW.skipActions?.some(
      (action) => action.type === "startQuest" && action.questId === "QUEST_CH03_MAIN_001",
    ),
    true,
  );
  assert.deepEqual(CHAPTER_3_START_FLOW.skipActions?.at(-1), {
    type: "unlockInput",
  });
});

test("DialogueManager 依序播放已登錄腳本", async () => {
  const manager = new DialogueManager();
  const presented = [];
  const completions = [];
  manager.setPresenter((request, complete) => {
    presented.push(request.id);
    completions.push(complete);
  });
  manager.register("first", LOWER_LEFT_STORY_ZONE_DIALOGUE);

  const first = manager.playRegistered("first", undefined);
  const second = manager.play("second", CHAPTER_3_START_DIALOGUE, undefined);
  assert.deepEqual(presented, ["first"]);
  completions.shift()();
  assert.deepEqual(await first, { completed: true });
  assert.deepEqual(presented, ["first", "second"]);
  completions.shift()();
  assert.deepEqual(await second, { completed: true });
});

test("DialogueManager 不會排入相同互動的重複播放", async () => {
  const manager = new DialogueManager();
  const presented = [];
  const completions = [];
  manager.setPresenter((request, complete) => {
    presented.push(request.id);
    completions.push(complete);
  });

  const first = manager.playUnique(
    "interaction:campfire",
    LOWER_LEFT_STORY_ZONE_DIALOGUE,
    undefined,
  );
  const duplicate = manager.playUnique(
    "interaction:campfire",
    LOWER_LEFT_STORY_ZONE_DIALOGUE,
    undefined,
  );

  assert.deepEqual(presented, ["interaction:campfire"]);
  assert.deepEqual(await duplicate, { completed: false });
  completions.shift()();
  assert.deepEqual(await first, { completed: true });
  assert.deepEqual(presented, ["interaction:campfire"]);
});

test("StoryEventManager 依登錄順序派送事件", async () => {
  const manager = new StoryEventManager();
  const received = [];
  manager.on("chapterStarted", ({ chapter }) => received.push(`first:${chapter}`));
  manager.on("chapterStarted", async ({ chapter }) => received.push(`second:${chapter}`));
  await manager.emit("chapterStarted", { chapter: 3 });
  assert.deepEqual(received, ["first:3", "second:3"]);
});

test("ChapterFlowManager 可執行並以 skipActions 結束", async () => {
  const calls = [];
  const completed = new Set();
  const manager = new ChapterFlowManager({
    setInputLocked: (locked) => calls.push(`lock:${locked}`),
    setBlack: (visible) => calls.push(`black:${visible}`),
    fadeFromBlack: (durationMs) => calls.push(`fade:${durationMs}`),
    showCenteredText: () => calls.push("text:show"),
    hideCenteredText: () => calls.push("text:hide"),
    playDialogue: async (dialogueId) => calls.push(`dialogue:${dialogueId}`),
    startQuest: async (questId) => calls.push(`quest:${questId}`),
    cancelDialogue: () => calls.push("dialogue:cancel"),
    markCompleted: (flowId) => completed.add(flowId),
    isCompleted: (flowId) => completed.has(flowId),
  });

  const run = manager.run({
    id: "test-flow",
    chapter: 3,
    once: true,
    actions: [
      { type: "lockInput" },
      { type: "setBlack", visible: true },
      { type: "wait", durationMs: 100 },
      { type: "playDialogue", dialogueId: "should-not-play" },
    ],
    skipActions: [
      { type: "fadeFromBlack", durationMs: 1 },
      { type: "startQuest", questId: "QUEST_TEST" },
      { type: "unlockInput" },
    ],
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(manager.requestSkip(), true);
  assert.equal(await run, true);
  assert.equal(completed.has("test-flow"), true);
  assert.equal(calls.includes("dialogue:should-not-play"), false);
  assert.equal(calls.includes("fade:1"), true);
  assert.equal(calls.includes("quest:QUEST_TEST"), true);
  assert.equal(calls.includes("lock:false"), true);
  assert.equal(await manager.run({ id: "test-flow", chapter: 3, once: true, actions: [] }), false);
});

test("ChapterFlowManager 從暫停狀態 SKIP 後仍會關閉黑幕並解鎖", async () => {
  let blackVisible = false;
  let inputLocked = false;
  let paused = false;
  const manager = new ChapterFlowManager({
    setInputLocked: (locked) => { inputLocked = locked; },
    setBlack: (visible) => { blackVisible = visible; },
    fadeFromBlack: () => {},
    showCenteredText: () => {},
    hideCenteredText: () => {},
    playDialogue: async () => {},
    cancelDialogue: () => {},
    markCompleted: () => {},
    isCompleted: () => false,
    onPausedChanged: (value) => { paused = value; },
  });

  const run = manager.run({
    id: "paused-skip-flow",
    chapter: 3,
    actions: [
      { type: "lockInput" },
      { type: "setBlack", visible: true },
      { type: "wait", durationMs: 1000 },
    ],
    skipActions: [
      { type: "setBlack", visible: true },
      { type: "fadeFromBlack", durationMs: 1 },
      { type: "unlockInput" },
    ],
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  manager.pause();
  assert.equal(paused, true);
  assert.equal(manager.requestSkip(), true);
  assert.equal(await run, true);
  assert.equal(paused, false);
  assert.equal(blackVisible, false);
  assert.equal(inputLocked, false);
});
