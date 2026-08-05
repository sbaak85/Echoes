import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";

const questDocument = JSON.parse(
  readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"),
);
const scene = JSON.parse(
  readFileSync(new URL("../public/maps/map_test01.scene.json", import.meta.url), "utf8"),
);

const QUEST_ID = "QUEST_CH03_MAIN_001";
const INVENTORY_QUEST_ID = "QUEST_CH03_MAIN_002";

function dispatch(manager, eventId, type, targetId) {
  manager.handleEvent({ eventId, type, targetId, amount: 1 });
}

test("inventory tutorial quest uses interface-opened and item-used objectives", () => {
  const quest = questDocument.quests.find((candidate) => candidate.id === INVENTORY_QUEST_ID);
  assert.ok(quest);
  assert.equal(quest.name, "整理背包");
  assert.deepEqual(quest.prerequisiteQuestIds, [QUEST_ID]);
  assert.equal(quest.grantMethod, "afterDialogue");
  assert.equal(quest.grantSourceId, "chapter03_backpack-teaching");
  assert.equal(quest.startDelaySeconds, 1);
  assert.equal(quest.stages[0].name, "打開介面與使用道具");
  assert.deepEqual(
    quest.stages[0].objectives.map((objective) => [objective.type, objective.targetId]),
    [["interfaceOpened", "Inventory"], ["itemUsed", "R0004"]],
  );
  assert.equal(quest.stages[0].objectives[1].completionInterfaceAction, "close");
  assert.equal(quest.stages[0].objectives[1].completionInterfaceId, "Inventory");

  const isolatedDocument = {
    schemaVersion: questDocument.schemaVersion,
    chapters: questDocument.chapters,
    quests: [{ ...structuredClone(quest), prerequisiteQuestIds: [] }],
  };
  const manager = new QuestRuntimeManager(isolatedDocument);
  assert.equal(manager.startQuest(INVENTORY_QUEST_ID), true);
  manager.handleEvent({ type: "interfaceOpened", targetId: "Inventory" });
  assert.equal(manager.getQuestState(INVENTORY_QUEST_ID), "active");
  manager.handleEvent({ type: "itemUsed", targetId: "R0004", amount: 1 });
  assert.equal(manager.getQuestState(INVENTORY_QUEST_ID), "completed");
});

test("story-trigger-002 unlocks after MAIN_001 and hands off MAIN_002 after dialogue", () => {
  const trigger = scene.storyTriggers.find((candidate) => candidate.id === "story-trigger-002");
  assert.ok(trigger);
  assert.equal(trigger.once, true);
  assert.equal(trigger.dialogueId, "chapter03_backpack-teaching");
  assert.deepEqual(trigger.startQuestIds, [INVENTORY_QUEST_ID]);
  assert.deepEqual(
    trigger.useRequirements.map(({ kind, questId, questState }) => ({ kind, questId, questState })),
    [{ kind: "questState", questId: QUEST_ID, questState: "completed" }],
  );
});

test("第三章第一個主線任務可依正式資料完成三個階段", () => {
  const lifecycle = [];
  const quest = questDocument.quests.find((candidate) => candidate.id === QUEST_ID);
  const [stage1, stage2, stage3] = quest.stages;
  const stage1Interaction = stage1.objectives.find((objective) => objective.type === "interactionSucceeded");
  const stage1Items = stage1.objectives.find((objective) => objective.type === "compoundCollectItem");
  const stage2Interaction = stage2.objectives.find((objective) => objective.type === "interactionSucceeded");
  const stage3Interaction = stage3.objectives.find((objective) => objective.type === "interactionSucceeded");
  const stage3SingleItem = stage3.objectives.find((objective) => objective.type === "collectItem");
  const stage3Items = stage3.objectives.find((objective) => objective.type === "compoundCollectItem");
  const manager = new QuestRuntimeManager(questDocument, {
    onQuestStarted: (questId) => lifecycle.push(["accepted", questId]),
    onQuestCompleted: (questId) => lifecycle.push(["completed", questId]),
  });

  assert.equal(manager.startQuest(QUEST_ID, 3, 360), true);
  assert.equal(manager.getCurrentStage(QUEST_ID), `${QUEST_ID}_STAGE_01`);

  dispatch(manager, "interaction:stage1", "interactionSucceeded", stage1Interaction.targetId);
  assert.equal(manager.getObjectiveProgress(QUEST_ID, `${QUEST_ID}_OBJ_01`).completed, true);

  dispatch(manager, "pickup:stage1-a", "itemCollected", stage1Items.itemRequirements[0].itemId);
  assert.equal(manager.getCurrentStage(QUEST_ID), `${QUEST_ID}_STAGE_01`);
  dispatch(manager, "pickup:stage1-b", "itemCollected", stage1Items.itemRequirements[1].itemId);
  assert.equal(manager.getCurrentStage(QUEST_ID), `${QUEST_ID}_STAGE_02`);

  dispatch(manager, "interaction:stage2", "interactionSucceeded", stage2Interaction.targetId);
  assert.equal(manager.getCurrentStage(QUEST_ID), `${QUEST_ID}_STAGE_03`);

  dispatch(manager, "pickup:stage3-single", "itemCollected", stage3SingleItem.targetId);
  for (const [index, requirement] of stage3Items.itemRequirements.entries()) {
    dispatch(manager, `pickup:stage3-${index}`, "itemCollected", requirement.itemId);
  }
  assert.equal(manager.getObjectiveProgress(QUEST_ID, `${QUEST_ID}_OBJ_05`).currentAmount, 3);
  assert.equal(manager.getQuestState(QUEST_ID), "active");

  dispatch(manager, "interaction:stage3", "interactionSucceeded", stage3Interaction.targetId);
  assert.equal(manager.getQuestState(QUEST_ID), "completed");
  assert.deepEqual(lifecycle, [
    ["accepted", QUEST_ID],
    ["completed", QUEST_ID],
  ]);
});

test("正式場景的互動區與 ItemPoint 使用正確任務階段條件", () => {
  const interactions = new Map(scene.interactables.map((entry) => [entry.id, entry]));
  const itemPoints = new Map(scene.itemPoints.map((entry) => [entry.id, entry]));

  assert.equal(interactions.get("interaction-008").useRequirements[0].kind, "quest");
  assert.equal(interactions.get("interaction-008").useRequirements[0].questId, QUEST_ID);

  for (const interactionId of ["interaction-007", "interaction-009"]) {
    const requirement = interactions.get(interactionId).useRequirements[0];
    assert.equal(requirement.questId, QUEST_ID);
    assert.equal(requirement.kind, "questStage");
    assert.equal(requirement.stageId, `${QUEST_ID}_STAGE_03`);
    assert.equal(requirement.stageMode, "CurrentStageOnly");
  }

  const computerRequirement = interactions.get("interaction-002").useRequirements[0];
  assert.equal(computerRequirement.questId, QUEST_ID);
  assert.equal(computerRequirement.kind, "questStage");
  assert.equal(computerRequirement.stageId, `${QUEST_ID}_STAGE_02`);
  assert.equal(computerRequirement.stageMode, "CurrentStageOnly");

  for (const itemPointId of ["item-point-001", "item-point-002", "item-point-003"]) {
    assert.deepEqual(itemPoints.get(itemPointId).spawnRequirement, {
      questId: QUEST_ID,
      stageId: `${QUEST_ID}_STAGE_03`,
      stageMode: "CurrentStageOnly",
    });
  }
});
