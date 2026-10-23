import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { shouldStartStarCardsTutorial, STAR_CARDS_TUTORIAL_STARTED_FLAG as flag, STAR_CARDS_INTERACTION_ID as target } from "../app/star-cards-quest-flow.ts";
import { normalizeStoryProgress } from "../app/story-progress.ts";
import { normalizeEchoesSaveData } from "../app/save-data.ts";
import { createNewGameProgress } from "../app/new-game-reset.ts";

test("only the first actual 017 launch opts in; preview and other entrances do not consume it", () => {
  const flags = { "unrelated:flag": true };
  for (const id of [undefined, "debug", "shipinterior-interaction-008"]) {
    assert.equal(shouldStartStarCardsTutorial(id, flags), false);
  }
  assert.equal(shouldStartStarCardsTutorial(target, flags), true);
  assert.deepEqual(flags, { "unrelated:flag": true }, "checking eligibility is read-only");
  const started = { ...flags, [flag]: true };
  assert.equal(shouldStartStarCardsTutorial(target, started), false, "reopening after abandonment remains normal");
  assert.equal(shouldStartStarCardsTutorial(target, { [flag]: false }), true);
});

test("first-launch state survives portable save/load and a new game gets its own first launch", () => {
  const story = normalizeStoryProgress({ currentChapter: 2, completedEventIds: [], storyFlags: { [flag]: true } });
  const save = normalizeEchoesSaveData({
    format: "EchoesSaveData", schemaVersion: 1, summary: {},
    progress: { sceneId: "ship_interior", quest: { schemaVersion: 1, quests: {} }, story },
  });
  assert.ok(save);
  const reloaded = normalizeEchoesSaveData(JSON.parse(JSON.stringify(save)));
  assert.equal(shouldStartStarCardsTutorial(target, reloaded.progress.story.storyFlags), false);
  assert.equal(shouldStartStarCardsTutorial(target, createNewGameProgress().story.storyFlags), true);
});

test("runtime claims the flag at launch after dialogue and passes the latched choice to StarCardsGame", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const open = source.slice(source.indexOf("const openStarCardsGame ="), source.indexOf("const openWeldingPuzzle ="));
  assert.match(open, /shouldStartStarCardsTutorial\(\s*session\?\.interactable\.id, storyProgressRef\.current\.storyFlags/);
  assert.match(open, /setStarCardsTutorialStart\(startTutorial\)/);
  assert.match(open, /if \(startTutorial\) \{[\s\S]*setStoryFlag\(STAR_CARDS_TUTORIAL_STARTED_FLAG, true\)/);
  assert.match(open, /requestPortableAutosaveRef\.current\("star-cards-tutorial-started"\)/);
  assert.match(source, /playRegistered\(interactable\.storyDialogueId, interactable, startMatch\)/);
  assert.match(source, /openDialogue\(interactable, startMatch, dialogue\)/);
  assert.match(source, /<StarCardsGame[\s\S]*?tutorialEnabled=\{starCardsTutorialStart\}/);
});
