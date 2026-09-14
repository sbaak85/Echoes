import assert from "node:assert/strict";
import test from "node:test";
import { DialogueManager } from "../app/dialogue-manager.ts";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { normalizeInteractionUseRequirements, getUnmetInteractionUseRequirements, filterInteractionRequirementsByPurpose } from "../app/interaction-flow.ts";

test("dialogue completion unlocks a requirement and survives save restoration without a quest", () => {
  const doc = { schemaVersion: 1, chapters: [], quests: [] };
  const manager = new QuestRuntimeManager(doc);
  const requirements = normalizeInteractionUseRequirements([{ kind: "dialogueCompleted", dialogueId: " D_TEST ", scope: "prompt" }], () => null);
  const unmet = (runtime) => getUnmetInteractionUseRequirements(requirements, {}, 1, undefined, undefined, undefined, 0, id => runtime.hasDialogueCompleted(id));
  assert.equal(unmet(manager).length, 1);
  manager.handleEvent({ type: "dialogueCompleted", targetId: "D_OTHER", eventId: "1" });
  assert.equal(unmet(manager).length, 1);
  manager.handleEvent({ type: "dialogueCompleted", targetId: "D_TEST", eventId: "2" });
  manager.handleEvent({ type: "dialogueCompleted", targetId: "D_TEST", eventId: "3" });
  assert.equal(unmet(manager).length, 0);
  assert.equal(unmet(new QuestRuntimeManager(doc, {}, manager.exportSave())).length, 0);
  assert.deepEqual(manager.exportSave().completedDialogueIds, ["D_OTHER", "D_TEST"]);
  assert.equal(filterInteractionRequirementsByPurpose(requirements, "interaction").length, 0);
  assert.equal(new QuestRuntimeManager(doc, {}, { schemaVersion: 1, quests: {} }).hasDialogueCompleted("D_TEST"), false);
});

test("blank dialogue conditions fail closed", () => {
  const requirements = normalizeInteractionUseRequirements([{ kind: "dialogueCompleted", dialogueId: "" }], () => null);
  assert.equal(getUnmetInteractionUseRequirements(requirements, {}, 1, undefined, undefined, undefined, 0, () => true).length, 1);
});

test("cancelled dialogue never records completion", async () => {
  const manager = new QuestRuntimeManager({ schemaVersion: 1, chapters: [], quests: [] });
  const dialogue = new DialogueManager();
  dialogue.setPresenter(() => {});
  dialogue.setCompletionListener(request => manager.handleEvent({ type: "dialogueCompleted", targetId: request.id }));
  const result = dialogue.play("D_CANCEL", { lines: [{ text: "test" }] }, {});
  dialogue.cancelCurrent();
  assert.equal((await result).completed, false);
  assert.equal(manager.hasDialogueCompleted("D_CANCEL"), false);
});
