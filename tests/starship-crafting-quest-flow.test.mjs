import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { craftInventoryRecipe, WORKBENCH_RECIPES } from "../app/crafting-recipes.ts";
import { normalizeEchoesSaveData } from "../app/save-data.ts";
import { createNewGameProgress } from "../app/new-game-reset.ts";
import {
  STARSHIP_CRAFTING_TUTORIAL_QUEST as questId,
  STARSHIP_CRAFTING_TUTORIAL_OBJECTIVE as obj17,
  STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG as flag,
  STARSHIP_CRAFTING_TUTORIAL_STEPS as steps,
  advanceStarshipCraftingTutorial,
} from "../app/starship-crafting-tutorial.ts";
import {
  STARSHIP_CRAFTING_QUANTITY_OBJECTIVE as obj18,
  STARSHIP_CRAFTING_TUTORIAL_PROGRESS_TARGET as tutorialTarget,
  STARSHIP_CRAFTING_QUANTITY_PROGRESS_TARGET as craftTarget,
  completeStarshipCraftingTutorialObjective as finishTutorial,
  publishSuccessfulCraftQuestProgress as publishCraft,
} from "../app/starship-crafting-quest-flow.ts";

const document = JSON.parse(await readFile(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
const quest = document.quests.find(entry => entry.id === questId);
const stageIndex = quest.stages.findIndex(stage => stage.objectives.some(objective => objective.id === obj17));
const stage = quest.stages[stageIndex];
const data = { ...document, chapters: [], quests: [{ ...quest, prerequisiteQuestIds: [], stages: quest.stages.slice(stageIndex) }] };
const progress = (manager, id) => manager.getObjectiveProgress(questId, id);
function harness({ activate = true, restored, extraObjective } = {}) {
  let now = 1000;
  const definition = extraObjective ? {
    ...data, quests: [{ ...data.quests[0], stages: [{ ...stage, objectives: [...stage.objectives, extraObjective] }, ...data.quests[0].stages.slice(1)] }],
  } : data;
  const manager = new QuestRuntimeManager(definition, { now: () => now, scheduleQuestStart() {} }, restored);
  if (!restored) {
    manager.startQuest(questId);
    if (activate) manager.activateObjective(obj17, "chapter04-section-6");
  }
  now += 1000;
  return manager;
}
const craft = (manager, inventory, quantity, id) => {
  const result = craftInventoryRecipe(inventory, "T0006", quantity);
  publishCraft(manager, result, id);
  return result;
};

test("OBJ17 and OBJ18 use existing custom-progress rules with the approved activation and thresholds", () => {
  const tutorial = stage.objectives.find(objective => objective.id === obj17);
  const quantity = stage.objectives.find(objective => objective.id === obj18);
  assert.equal(tutorial.type, "customProgress"); assert.equal(tutorial.targetId, tutorialTarget);
  assert.equal(tutorial.activationMode, "dialogueCompleted"); assert.equal(tutorial.activationEventId, "chapter04-section-6");
  assert.equal(quantity.type, "customProgress"); assert.equal(quantity.targetId, craftTarget);
  assert.equal(quantity.activationMode, "objectiveActivated"); assert.equal(quantity.activationEventId, obj17);
  assert.equal(quantity.requiredAmount, 2); assert.equal(quantity.countMode, "accumulated");
});

test("entering 029 or interacting successfully alone does not complete OBJ17", () => {
  const manager = harness();
  for (const type of ["interactionStarted", "interactionSucceeded", "interfaceOpened"]) {
    manager.handleEvent({ type, targetId: "scene3-interaction-029" });
    assert.equal(progress(manager, obj17).completed, false);
  }
  assert.equal(finishTutorial(manager, "scene3-interaction-029", false), false);
});

test("only a complete tutorial from 029 while OBJ17 is active completes OBJ17, once", () => {
  const manager = harness();
  assert.equal(finishTutorial(null, "scene3-interaction-029", true), false);
  assert.equal(finishTutorial(harness({ activate: false }), "scene3-interaction-029", true), false);
  for (const id of [null, "scene3-interaction-031", "scene3-interaction-030"]) assert.equal(finishTutorial(manager, id, true), false);
  assert.equal(progress(manager, obj17).completed, false);
  assert.equal(finishTutorial(manager, "scene3-interaction-029", true), true);
  assert.equal(progress(manager, obj17).completed, true);
  assert.equal(finishTutorial(manager, "scene3-interaction-029", true), false);
  assert.equal(progress(manager, obj17).currentAmount, 1);
  assert.equal(manager.isObjectiveInProgress(questId, obj18), true);
});

test("the complete tutorial counts its first fabricated stick before the final OBJ17 acknowledgement", () => {
  const manager = harness();
  let step = steps[0], result;
  for (const entry of steps) {
    assert.equal(step.id, entry.id);
    if (entry.action === "crafted:T0006") result = craft(manager, { R0020: 2, R0036: 2 }, 1, "tutorial-craft");
    assert.equal(progress(manager, obj17).completed, false);
    step = advanceStarshipCraftingTutorial(step, entry.action);
    if (!step) finishTutorial(manager, "scene3-interaction-029", true);
  }
  assert.equal(result.ok, true);
  assert.equal(progress(manager, obj17).completed, true);
  assert.equal(progress(manager, obj18).currentAmount, 1);
  assert.equal(progress(manager, obj18).completed, false);
});

test("two separate successful 1-stick transactions accumulate 1 then 2", () => {
  const manager = harness();
  const first = craft(manager, { R0020: 2, R0036: 2 }, 1, "first-menu:transaction");
  assert.equal(first.ok, true); assert.equal(progress(manager, obj18).currentAmount, 1);
  assert.equal(progress(manager, obj18).completed, false);
  // Closing/opening a menu does not recreate QuestRuntimeManager or reset progress.
  finishTutorial(manager, "scene3-interaction-029", true);
  const second = craft(manager, first.inventory, 1, "second-menu:transaction");
  assert.equal(second.ok, true); assert.equal(progress(manager, obj18).currentAmount, 2);
  assert.equal(progress(manager, obj18).completed, true);
});

test("a single 2-stick batch completes OBJ18 immediately and does not shortcut OBJ17", () => {
  const manager = harness();
  const result = craft(manager, { R0020: 2, R0036: 2 }, 2, "batch-two");
  assert.equal(result.ok, true); assert.equal(result.inventory.T0006, 2);
  assert.equal(progress(manager, obj18).currentAmount, 2); assert.equal(progress(manager, obj18).completed, true);
  assert.equal(progress(manager, obj17).completed, false);
  finishTutorial(manager, "scene3-interaction-029", true);
  assert.equal(progress(manager, obj17).completed, true);
});

test("one fabricated stick persists through portable save JSON roundtrip, then the second completes OBJ18", () => {
  const manager = harness();
  const first = craft(manager, { R0020: 2, R0036: 2 }, 1, "before-reload");
  finishTutorial(manager, "scene3-interaction-029", true);
  const fresh = createNewGameProgress();
  const saved = normalizeEchoesSaveData(JSON.parse(JSON.stringify({
    format: "EchoesSaveData", schemaVersion: 1, savedAt: "2026-10-07T00:00:00.000Z", slotKind: "auto",
    summary: { chapterId: "CH04", chapterName: "第四章", questId, questName: "測試", stageId: stage.id, stageName: stage.name },
    progress: { ...fresh, sceneId: "Scene_3", inventory: first.inventory, quest: manager.exportSave(), story: { ...fresh.story, storyFlags: { [flag]: true } } },
  })));
  const restored = harness({ restored: saved.progress.quest });
  assert.equal(progress(restored, obj17).completed, true);
  assert.equal(progress(restored, obj18).currentAmount, 1);
  assert.equal(saved.progress.story.storyFlags[flag], true);
  // Replaying the original transaction is ignored; a new reload-safe ID advances.
  publishCraft(restored, first, "before-reload");
  assert.equal(progress(restored, obj18).currentAmount, 1);
  craft(restored, saved.progress.inventory, 1, "after-reload");
  assert.equal(progress(restored, obj18).currentAmount, 2); assert.equal(progress(restored, obj18).completed, true);
});

test("pickup, starting inventory, and dropping/using sticks do not advance or erase fabrication progress", () => {
  const manager = harness();
  manager.syncCurrentInventory({ T0006: 9 });
  manager.handleEvent({ type: "itemCollected", targetId: "T0006", amount: 2, eventId: "pickup" });
  assert.equal(progress(manager, obj18).currentAmount, 0);
  craft(manager, { R0020: 2, R0036: 2 }, 1, "fabrication");
  manager.syncCurrentInventory({});
  manager.handleEvent({ type: "itemUsed", targetId: "T0006", amount: 1 });
  assert.equal(progress(manager, obj18).currentAmount, 1); assert.equal(progress(manager, obj18).completed, false);
});

test("failed fabrication, other recipes and inactive OBJ18 never count", () => {
  const manager = harness();
  const failure = craftInventoryRecipe({ R0020: 1 }, "T0006", 1);
  assert.equal(failure.ok, false); assert.equal(publishCraft(manager, failure, "failed"), false);
  const other = WORKBENCH_RECIPES.find(recipe => recipe.id !== "T0006");
  const madeOther = craftInventoryRecipe(Object.fromEntries(other.req), other.id);
  assert.equal(madeOther.ok, true); publishCraft(manager, madeOther, "other-recipe");
  assert.equal(progress(manager, obj18).currentAmount, 0);
  const inactive = harness({ activate: false });
  craft(inactive, { R0020: 2, R0036: 2 }, 2, "before-activation");
  inactive.activateObjective(obj18);
  assert.equal(progress(inactive, obj18).currentAmount, 0);
});

test("generic collection still receives fabrication acquisition once without blocking craft progress deduplication", () => {
  const acquisition = { ...stage.objectives.find(objective => objective.id === obj18),
    id: "TEST_GENERIC_ACQUISITION", type: "collectItem", targetId: "T0006", requiredAmount: 9,
    activationMode: "immediate", activationEventId: "" };
  const manager = harness({ extraObjective: acquisition });
  const result = craftInventoryRecipe({ R0020: 2, R0036: 2 }, "T0006", 1);
  publishCraft(manager, result, "same-transaction"); publishCraft(manager, result, "same-transaction");
  assert.equal(progress(manager, acquisition.id).currentAmount, 1);
  assert.equal(progress(manager, obj18).currentAmount, 1);
  craft(manager, result.inventory, 1, "new-transaction");
  assert.equal(progress(manager, acquisition.id).currentAmount, 2);
  assert.equal(progress(manager, obj18).completed, true);
});

test("a restored full v2 tutorial can reconcile active OBJ17 without replaying, never from 031 or a v1-only flag", () => {
  const manager = harness();
  const savedFlags = { [flag]: true };
  assert.equal(finishTutorial(manager, "scene3-interaction-031", savedFlags[flag] === true), false);
  assert.equal(finishTutorial(manager, "scene3-interaction-029", { "tutorial:starship-crafting:completed:v1": true }[flag] === true), false);
  assert.equal(finishTutorial(manager, "scene3-interaction-029", savedFlags[flag] === true), true);
  assert.equal(progress(manager, obj17).completed, true);
});

test("production wiring records the 029 source, persists both counters and uses reload-safe transaction IDs", async () => {
  const movement = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(movement, /\? \(\) => openStarshipInteractionMenu\(interactable.id\)/);
  assert.match(movement, /starshipInteractionMenuEntryIdRef.current = interactionId/);
  assert.match(movement, /starshipInteractionMenuEntryIdRef.current = null/);
  assert.match(movement, /onTutorialCompleted=\{\(\) => \{[\s\S]*?completeStarshipCraftingTutorialObjective\(manager, starshipInteractionMenuEntryIdRef.current, true\)/);
  assert.match(movement, /publishStarshipCraftWithReturnDialogue\(\s*craftQuestManager, result, `itemCrafted:\$\{crypto.randomUUID\(\)\}`, storyProgressRef.current,/);
  assert.match(movement, /saveQuestSaveData\(craftQuestManager.exportSave\(\)\)/);
  assert.match(movement, /requestPortableAutosaveRef.current\("item-crafted"\)/);
});
