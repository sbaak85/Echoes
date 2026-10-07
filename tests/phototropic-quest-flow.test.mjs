import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { craftInventoryRecipe } from "../app/crafting-recipes.ts";
import { publishSuccessfulCraftQuestProgress } from "../app/starship-crafting-quest-flow.ts";
import { completePhototropicQuestObjective as finishPlant } from "../app/phototropic-quest-flow.ts";
import { initialPhototropicState, normalizePhototropicState, PLANT_QUEST_ID as questId, PLANT_OBJECTIVE_ID as obj20, PLANT_PUZZLE_ID as puzzleId } from "../app/phototropic-puzzle.ts";
import { normalizeEchoesSaveData, SAVE_DATA_FORMAT } from "../app/save-data.ts";

const data = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
const quest = data.quests.find(entry => entry.id === questId);
const stageIndex = quest.stages.findIndex(stage => stage.objectives.some(objective => objective.id === obj20));
const stage = quest.stages[stageIndex];
const document = { ...data, chapters: [], quests: [{ ...quest, prerequisiteQuestIds: [], stages: quest.stages.slice(stageIndex) }] };
const obj18 = "QUEST_CH04_MAIN_001_OBJ_18", obj19 = "QUEST_CH04_MAIN_001_OBJ_19";
const solution = { introduced: true, solved: true, L: { slot: 0, angle: 40 }, R: { slot: 0, angle: 40 } };
const progress = (manager, id = obj20) => manager.getObjectiveProgress(questId, id);
function harness(saved) {
  let now = 1000;
  const manager = new QuestRuntimeManager(document, { now: () => now, scheduleQuestStart() {} }, saved);
  if (!saved) { manager.startQuest(questId); manager.activateObjective("QUEST_CH04_MAIN_001_OBJ_17", "chapter04-section-6"); }
  now += 1000;
  return manager;
}
function makeSticks(manager, quantity, transaction = "make-two") {
  const result = craftInventoryRecipe({ R0020: 2, R0036: 2 }, "T0006", quantity);
  assert.equal(result.ok, true);
  publishSuccessfulCraftQuestProgress(manager, result, transaction);
}

function completeReturnDialogue(manager) {
  manager.handleEvent({ type: "dialogueCompleted", targetId: "chapter04-section-8", eventId: "completed-return" });
}

test("OBJ20 uses the shared plant puzzle identity and waits for section 8 completion; OBJ19 stays the tube task", () => {
  assert.equal(obj20, "QUEST_CH04_MAIN_001_OBJ_20");
  const objective = stage.objectives.find(entry => entry.id === obj20);
  assert.equal(objective.activationMode, "dialogueCompleted"); assert.equal(objective.activationEventId, "chapter04-section-8");
  assert.equal(objective.type, "puzzleCompleted"); assert.equal(objective.targetId, puzzleId); assert.equal(objective.requiredAmount, 1);
  const tube = stage.objectives.find(entry => entry.id === obj19);
  assert.equal(tube.type, "collectItem"); assert.equal(tube.targetId, "R0036");
  assert.equal(tube.activationMode, "dialogueCompleted"); assert.equal(tube.activationEventId, "chapter04-section-7");
});

test("two fabricated sticks still leave OBJ20 locked until section 8 has finished", () => {
  const manager = harness();
  assert.equal(manager.isObjectiveInProgress(questId, obj20), false);
  makeSticks(manager, 1, "first");
  assert.equal(progress(manager, obj18).completed, false); assert.equal(manager.isObjectiveInProgress(questId, obj20), false);
  makeSticks(manager, 1, "second");
  assert.equal(progress(manager, obj18).completed, true); assert.equal(manager.isObjectiveInProgress(questId, obj20), false);
  assert.equal(finishPlant(manager, solution), false);
  manager.handleEvent({ type: "dialogueStarted", targetId: "chapter04-section-8", eventId: "started-return" });
  assert.equal(manager.isObjectiveInProgress(questId, obj20), false);
  completeReturnDialogue(manager);
  assert.equal(manager.isObjectiveInProgress(questId, obj20), true);
  assert.equal(progress(manager).completed, false);
});

test("after the crafting return dialogue, ordinary plant interaction still does not complete OBJ20", () => {
  const manager = harness(); makeSticks(manager, 2); completeReturnDialogue(manager);
  for (const id of ["scene6-interaction-020", "scene6-interaction-021"]) for (const type of ["interactionStarted", "interactionSucceeded", "itemSubmitted", "puzzleCompleted"]) {
    manager.handleEvent({ type, targetId: id, itemId: "T0006", amount: 1 });
    assert.equal(progress(manager).completed, false);
  }
  manager.handleEvent({ type: "puzzleCompleted", targetId: "different-puzzle" });
  assert.equal(progress(manager).completed, false);
});

test("empty, one-sided, unfinished and corrupt solved states do not complete OBJ20", () => {
  const manager = harness(); makeSticks(manager, 2); completeReturnDialogue(manager);
  for (const state of [initialPhototropicState(), { ...solution, R: { slot: null, angle: 40 } }, { ...solution, solved: false }, { ...solution, R: { slot: 2, angle: 120 } }]) {
    assert.equal(finishPlant(manager, state), false);
    assert.equal(progress(manager).completed, false);
  }
});

test("genuine successful completion ticks OBJ20 once, never the original tube objective", () => {
  const manager = harness(); makeSticks(manager, 2); completeReturnDialogue(manager);
  manager.activateObjective(obj19, "chapter04-section-7");
  assert.equal(finishPlant(manager, solution), true);
  assert.equal(progress(manager).completed, true); assert.equal(progress(manager).currentAmount, 1);
  assert.equal(progress(manager, obj19).completed, false); assert.equal(progress(manager, obj19).currentAmount, 0);
  assert.equal(finishPlant(manager, solution), false);
  manager.handleEvent({ type: "puzzleCompleted", targetId: puzzleId, eventId: `puzzleCompleted:${puzzleId}` });
  assert.equal(progress(manager).currentAmount, 1);
});

test("success cannot complete an inactive objective; validated persisted success can be reconciled after activation", () => {
  const manager = harness();
  assert.equal(finishPlant(null, solution), false); assert.equal(finishPlant(manager, solution), false);
  assert.equal(progress(manager).completed, false);
  makeSticks(manager, 2);
  assert.equal(finishPlant(manager, normalizePhototropicState(solution)), false);
  completeReturnDialogue(manager);
  assert.equal(finishPlant(manager, normalizePhototropicState(solution)), true);
});

test("portable reload preserves active OBJ20 and success evidence without manufacturing completion from lamp geometry", () => {
  const manager = harness(); makeSticks(manager, 2); completeReturnDialogue(manager);
  const save = state => normalizeEchoesSaveData(JSON.parse(JSON.stringify({
    format: SAVE_DATA_FORMAT, schemaVersion: 1, summary: {},
    progress: { sceneId: "Scene_6", quest: manager.exportSave(), phototropic: state },
  })));
  const unfinishedSave = save({ ...solution, solved: false });
  const unfinished = harness(unfinishedSave.progress.quest);
  assert.equal(unfinished.isObjectiveInProgress(questId, obj20), true);
  assert.equal(finishPlant(unfinished, unfinishedSave.progress.phototropic), false);
  const completedSave = save(solution), restored = harness(completedSave.progress.quest);
  assert.equal(finishPlant(restored, completedSave.progress.phototropic), true);
  const finalSave = normalizeEchoesSaveData({ ...completedSave, progress: { ...completedSave.progress, quest: restored.exportSave() } });
  const finalManager = harness(finalSave.progress.quest);
  assert.equal(progress(finalManager).completed, true); assert.equal(finishPlant(finalManager, solution), false);
});

test("production success, activation and hydration paths use the same guarded helper; QuestEditor indexes the runtime puzzle ID", () => {
  const runtime = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(runtime, /usePhototropicPuzzle\(\(\) => \{[\s\S]*?completePhototropicQuestObjective\(manager, plantController.state\)/);
  assert.match(runtime, /onObjectiveActivated:[\s\S]*?objectiveId === PLANT_OBJECTIVE_ID[\s\S]*?completePhototropicQuestObjective\(manager, plantController.state\)/);
  assert.match(runtime, /completePhototropicQuestObjective\(questRuntimeManagerRef.current, plantController.state\)/);
  assert.doesNotMatch(runtime, /manager.completeObjective\(PLANT_QUEST_ID, PLANT_OBJECTIVE_ID\)/);
  const catalog = readFileSync(new URL("../QuestEditor/QuestReferenceProvider.cs", import.meta.url), "utf8");
  assert.match(catalog, /LoadPlantPuzzle\(projectRoot, catalog\)/); assert.match(catalog, /PLANT_PUZZLE_ID/);
  assert.match(catalog, /catalog.Add\("Puzzle", match.Groups\["id"\].Value, "植物解謎系統"\)/);
});
