import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QuestRuntimeManager, evaluateQuestObjective, matchesItemSubmissionTarget } from "../app/quest-runtime-manager.ts";
import { removeInventoryItem } from "../app/item-database.ts";

const quest = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8")).quests.find(q => q.id === "QUEST_CH04_MAIN_001");
const objective = quest.stages.flatMap(s => s.objectives).find(o => o.id.endsWith("_OBJ_15"));
const locations = ["scene6-interaction-018", "scene6-interaction-019"];
function setup() {
  const document = { schemaVersion: 1, chapters: [], quests: [quest] };
  const initial = new QuestRuntimeManager(document);
  initial.startQuest(quest.id);
  const save = initial.exportSave();
  save.quests[quest.id].currentStageId = quest.stages.find(s => s.objectives.includes(objective)).id;
  return { document, manager: new QuestRuntimeManager(document, {}, save) };
}

for (const location of locations) test(`current OBJ15: submit one T0006 at ${location}, not both`, () => {
  const { document, manager } = setup();
  assert.equal(manager.getActiveItemSubmissionObjectives(location).length, 0);
  manager.handleEvent({ type: "dialogueCompleted", targetId: "chapter04-Light" });
  for (const id of ["015", "016", "017"]) manager.handleEvent({ type: "interactionSucceeded", targetId: `scene6-interaction-${id}` });
  const entry = manager.getActiveItemSubmissionObjectives(location).find(e => e.objective.id === objective.id);
  assert.ok(entry);
  assert.equal(entry.objective.itemRequirements[0].itemId, "T0006");
  assert.equal(entry.objective.itemRequirements[0].requiredAmount, 1);
  const event = { type: "itemSubmitted", targetId: location, itemId: "T0006", amount: 1, eventId: "confirm" };
  manager.handleEvent({ ...event, itemId: "R0004", eventId: "wrong-item" });
  manager.handleEvent({ ...event, targetId: "scene6-interaction-017", eventId: "wrong-location" });
  assert.equal(manager.getObjectiveProgress(quest.id, objective.id).completed, false);
  let inventory = { T0006: 2 };
  // Same confirm sequence as the shared submission dialog; cancellation never reaches here.
  inventory = removeInventoryItem(inventory, "T0006", 1);
  manager.handleEvent(event);
  assert.equal(inventory.T0006, 1);
  assert.equal(manager.getObjectiveProgress(quest.id, objective.id).completed, true);
  for (const id of locations) assert.equal(manager.getActiveItemSubmissionObjectives(id).some(e => e.objective.id === objective.id), false);
  const restored = new QuestRuntimeManager(document, {}, manager.exportSave());
  for (const id of locations) assert.equal(restored.getActiveItemSubmissionObjectives(id).some(e => e.objective.id === objective.id), false);
});

test("submission targets ignore blanks/duplicates, prefer the list, retain single target fallback", () => {
  const o = { ...objective, targetId: "legacy", targetIds: ["", " a ", "a", "b"] };
  assert.equal(matchesItemSubmissionTarget(o, "a"), true);
  assert.equal(matchesItemSubmissionTarget(o, "b"), true);
  assert.equal(matchesItemSubmissionTarget(o, "legacy"), false);
  assert.equal(matchesItemSubmissionTarget(o, ""), false);
  assert.equal(matchesItemSubmissionTarget({ ...o, targetIds: [""] }, "legacy"), true);
  assert.equal(evaluateQuestObjective(o, { type: "interactionSucceeded", targetId: "a" }), null);
  assert.deepEqual(evaluateQuestObjective(o, { type: "itemSubmitted", targetId: "b", itemId: "T0006", amount: 1 }), { mode: "add", amount: 1 });
});
