import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createChapter02StartFlow } from "../app/chapter02-start-flow.ts";
import { ChapterFlowManager } from "../app/chapter-flow-manager.ts";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { createNewGameProgress } from "../app/new-game-reset.ts";
import { STORY_CHAPTERS, STORY_DIALOGUES } from "../app/story-content.ts";

const doc = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url)));
const questId = "QUEST_CH02_MAIN_001";
function harness(dialogueResult = { completed: true }) {
  const state = { black: false, locked: false, completed: false, dialogue: null };
  const quests = new QuestRuntimeManager(doc);
  const flow = new ChapterFlowManager({
    setBlack: value => { state.black = value; },
    setInputLocked: value => { state.locked = value; },
    fadeToBlack() {}, fadeFromBlack() {}, showCenteredText() {}, hideCenteredText() {},
    cancelDialogue() {}, isCompleted: () => state.completed,
    markCompleted: () => { state.completed = true; },
    playDialogue: async id => {
      assert.equal(state.black, false, "blackout must be fully cleared before dialogue");
      assert.equal(state.locked, true);
      assert.notEqual(quests.getQuestState(questId), "active");
      state.dialogue = id;
      if (dialogueResult.completed) quests.startAvailableAfterDialogueQuests(id);
      return dialogueResult;
    },
  });
  // Only remove real-time waits: action ordering, cleanup and quest rules remain real.
  flow.wait = async () => {};
  return { state, quests, flow };
}

test("chapter choice resets story progress to selected chapter, preserving default third chapter", () => {
  assert.equal(createNewGameProgress(2).story.currentChapter, 2);
  assert.equal(createNewGameProgress(3).story.currentChapter, 3);
  assert.equal(createNewGameProgress().story.currentChapter, 3);
});

test("chapter 2 uses editor subtitle timings followed by 1s fade and 1s settle", () => {
  const definition = createChapter02StartFlow();
  const source = STORY_CHAPTERS.find(c => c.chapterNumber === 2);
  const subtitles = definition.actions.filter(a => a.type === "showCenteredText");
  for (const [index, id] of ["chapter02-Open", "chapter02-opening-card"].entries()) {
    const event = source.subtitleEvents.find(e => e.id === id);
    assert.deepEqual(subtitles[index].lines, event.lines.map(l => l.text));
    for (const key of ["fadeInMs", "holdMs", "fadeOutMs"]) assert.equal(subtitles[index][key], event[key]);
    assert.equal(subtitles[index].fadeOnly, true);
  }
  assert.ok(STORY_DIALOGUES["chapter02-start"]);
  assert.deepEqual(definition.actions.slice(-5), [
    { type: "fadeFromBlack", durationMs: 1000 }, { type: "lockInput" },
    { type: "wait", durationMs: 1000 },
    { type: "playDialogue", dialogueId: "chapter02-start", requireCompleted: true },
    { type: "unlockInput" },
  ]);
});

test("briefing completion grants exactly once; only terminal 009 success completes first quest", async () => {
  const { state, quests, flow } = harness();
  assert.deepEqual(quests.startAvailableAutomaticQuests(null, null, "CH02"), []);
  await flow.run(createChapter02StartFlow());
  assert.equal(quests.getQuestState(questId), "active");
  assert.deepEqual(quests.startAvailableAfterDialogueQuests("chapter02-start"), []);
  quests.handleEvent({ type: "interactionSucceeded", targetId: "shipinterior-interaction-008" });
  assert.equal(quests.getQuestState(questId), "active");
  quests.handleEvent({ type: "interactionSucceeded", targetId: "shipinterior-interaction-009" });
  assert.equal(quests.getQuestState(questId), "completed");
  assert.equal(state.black, false);
  assert.equal(state.locked, false);
  assert.equal(await flow.run(createChapter02StartFlow()), false);
});

test("cancelled briefing does not grant quest and always clears black/input lock", async () => {
  const { state, quests, flow } = harness({ completed: false });
  await assert.rejects(flow.run(createChapter02StartFlow()), /Dialogue did not complete/);
  assert.notEqual(quests.getQuestState(questId), "active");
  assert.equal(state.completed, false);
  assert.equal(state.black, false);
  assert.equal(state.locked, false);
});

test("skipping opening subtitles still plays mandatory briefing and clears blackout", async () => {
  const { state, quests, flow } = harness();
  let firstWait = true;
  flow.wait = async () => { if (firstWait) { firstWait = false; flow.requestSkip(); } };
  await flow.run(createChapter02StartFlow());
  assert.equal(state.dialogue, "chapter02-start");
  assert.equal(quests.getQuestState(questId), "active");
  assert.equal(state.black, false);
  assert.equal(state.locked, false);
});

test("skip during a required dialogue reaches the skip handoff instead of throwing on cancellation", async () => {
  const { state, flow } = harness();
  let calls = 0;
  flow.host.playDialogue = async () => {
    calls++;
    if (calls === 1) { flow.requestSkip(); return { completed: false }; }
    return { completed: true };
  };
  await flow.run(createChapter02StartFlow());
  assert.equal(calls, 2);
  assert.equal(state.completed, true);
  assert.equal(state.black, false);
  assert.equal(state.locked, false);
});
