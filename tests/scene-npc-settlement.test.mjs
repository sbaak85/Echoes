import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DialogueManager } from "../app/dialogue-manager.ts";
import { runInteractionIllustrationFlow } from "../app/interaction-illustration-flow.ts";
import { isInteractionRetired } from "../app/interaction-flow.ts";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { isSceneNpcVisible } from "../app/scene-npcs.ts";

// Exercise the actual completion entry guards without mounting the browser game.
// The boundary is immediately before settlement starts; the real quest/dialogue
// managers below determine whether these guards allow that settlement to run.
const runtimeSource = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
const entryMatch = runtimeSource.match(
  /const completeInteraction = \([\s\S]*?\) => \{([\s\S]*?)\n\s*settleNaturalSurvival\(\);/,
);
assert.ok(entryMatch, "Could not locate the runtime completion entry guards");
const createCompletion = new Function(
  "isInteractableRetired", "isNpcPresent", "settle",
  `return interactable => { ${entryMatch[1]} settle(); return true; };`,
);

function createScenario(removeAfterDialogue = false) {
  const definition = {
    schemaVersion: 1,
    chapters: [{ id: "C", name: "Test", completionQuestIds: [] }],
    quests: [{
      id: "Q", name: "Test", chapterId: "C", type: "main", grantMethod: "automatic",
      prerequisiteQuestIds: [],
      stages: [{
        id: "S1", name: "Talk", completionMode: "all", nextStageId: "S2",
        objectives: [{ id: "O1", displayText: "Talk", type: "dialogueCompleted", targetId: "D", requiredAmount: 1 }],
      }, {
        id: "S2", name: "Continue", completionMode: "all", nextStageId: "",
        objectives: [{ id: "O2", displayText: "Continue", type: "interactionSucceeded", targetId: "next", requiredAmount: 1 }],
      }],
    }],
  };
  const quest = new QuestRuntimeManager(definition);
  quest.startQuest("Q");
  const query = {
    isQuestAtStage: (q, s) => quest.isQuestAtStage(q, s),
    hasQuestReachedStage: (q, s) => quest.hasQuestReachedStage(q, s),
    hasObjectiveReachedState: (q, o, s) => quest.hasObjectiveReachedState(q, o, s),
  };
  const interactable = {
    id: "npc-talk",
    npc: { characterId: "owen", x: 100, y: 100, facing: "SE", scale: 1 },
    useRequirements: [{
      kind: "questStage", questId: "Q", stageId: "S1", stageMode: "CurrentStageOnly",
      ...(removeAfterDialogue ? { removeQuestId: "Q", removeStageId: "S2" } : {}),
    }],
  };
  const present = value => isSceneNpcVisible(value.useRequirements, query);
  const retired = value => isInteractionRetired(
    value.useRequirements, query.hasQuestReachedStage, query.hasObjectiveReachedState,
  );
  const dialogue = new DialogueManager();
  let finishDialogue;
  const events = [];
  dialogue.setPresenter((_request, complete) => { finishDialogue = complete; });
  dialogue.setCompletionListener(request => {
    quest.handleEvent({ type: "dialogueCompleted", targetId: request.id });
    events.push(`stage:${quest.getCurrentStage("Q")}`);
  });
  const complete = createCompletion(retired, present, () => events.push("settlement"));
  return { quest, interactable, present, retired, dialogue, complete, events,
    finishDialogue: () => { assert.equal(typeof finishDialogue, "function"); finishDialogue(); } };
}

for (const concurrent of [false, true]) {
  const mode = concurrent ? "concurrent" : "sequential";
  test(`${mode} illustration settles an accepted NPC dialogue after its CurrentStageOnly stage advances`, async () => {
    const scenario = createScenario();
    assert.equal(scenario.present(scenario.interactable), true);
    const flow = runInteractionIllustrationFlow(concurrent,
      () => scenario.dialogue.play("D", { lines: [{ text: "Done" }] }, scenario.interactable),
      { open: async () => true, close: async () => true, cancel: () => assert.fail("Unexpected cancellation") },
      () => scenario.complete(scenario.interactable),
    );
    scenario.finishDialogue();
    await flow;
    assert.equal(scenario.quest.getCurrentStage("Q"), "S2");
    assert.equal(scenario.present(scenario.interactable), false, "The actor has left its display stage");
    assert.deepEqual(scenario.events, ["stage:S2", "settlement"], "Accepted success must settle once after dialogue progression");
  });

  test(`${mode} illustration still blocks settlement when dialogue reaches explicit NPC removal`, async () => {
    const scenario = createScenario(true);
    assert.equal(scenario.present(scenario.interactable), true);
    const flow = runInteractionIllustrationFlow(concurrent,
      () => scenario.dialogue.play("D", { lines: [{ text: "Leave" }] }, scenario.interactable),
      { open: async () => true, close: async () => true, cancel: () => assert.fail("Unexpected cancellation") },
      () => scenario.complete(scenario.interactable),
    );
    scenario.finishDialogue();
    await flow;
    assert.equal(scenario.retired(scenario.interactable), true);
    assert.deepEqual(scenario.events, ["stage:S2"], "Explicit retirement must still prevent delayed settlement");
  });
}
