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
const scene2 = JSON.parse(
  readFileSync(new URL("../public/maps/map_test02.scene.json", import.meta.url), "utf8"),
);

const QUEST_ID = "QUEST_CH03_MAIN_001";
const INVENTORY_QUEST_ID = "QUEST_CH03_MAIN_002";
const REST_QUEST_ID = "QUEST_CH03_MAIN_003";
const HOPE_QUEST_ID = "QUEST_CH03_MAIN_004";
const FAR_LIGHT_QUEST_ID = "QUEST_CH03_MAIN_005";
const ARRAY_REPAIR_QUEST_ID = "QUEST_CH03_MAIN_006";
const WELDING_INTERACTION_ID = "scene3-interaction-024";

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
  assert.equal(quest.startDelaySeconds, 0.2);
  assert.equal(quest.completionTriggerType, "dialogue");
  assert.equal(quest.completionTriggerId, "chapter03-section-2");
  assert.equal(quest.completionTriggerDelaySeconds, 3);
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

test("MAIN_002 completion dialogue hands off MAIN_003 without a second start delay", () => {
  const quest = questDocument.quests.find((candidate) => candidate.id === REST_QUEST_ID);
  assert.ok(quest);
  assert.equal(quest.grantMethod, "afterDialogue");
  assert.equal(quest.grantSourceId, "chapter03-section-2");
  assert.deepEqual(quest.prerequisiteQuestIds, [INVENTORY_QUEST_ID]);
  assert.equal(quest.startDelaySeconds, 0);
});

test("MAIN_003 objective completion teleports at the fully-black timing after 0.5 seconds", () => {
  const quest = questDocument.quests.find((candidate) => candidate.id === REST_QUEST_ID);
  const objective = quest.stages[0].objectives[0];
  const teleportPoint = scene.teleportPoints.find(
    (candidate) => candidate.id === objective.completionTeleportPointId,
  );
  assert.ok(teleportPoint);
  assert.equal(quest.completionTeleportPointId, undefined);
  assert.equal(objective.completionTeleportDelaySeconds, 0.5);
  assert.equal(teleportPoint.label, "地圖中央傳送點");
  assert.equal(teleportPoint.facing, "S");
  assert.equal(Number.isFinite(teleportPoint.x), true);
  assert.equal(Number.isFinite(teleportPoint.y), true);
});

test("MAIN_003 COMPLETE UI hands off section 3, then section 3 grants MAIN_004", () => {
  const restQuest = questDocument.quests.find((candidate) => candidate.id === REST_QUEST_ID);
  const hopeQuest = questDocument.quests.find((candidate) => candidate.id === HOPE_QUEST_ID);
  assert.ok(restQuest);
  assert.ok(hopeQuest);
  assert.equal(restQuest.completionTriggerType, "dialogue");
  assert.equal(restQuest.completionTriggerId, "chapter03-section-3");
  assert.equal(restQuest.completionTriggerDelaySeconds, 1);
  assert.equal(hopeQuest.grantMethod, "afterDialogue");
  assert.equal(hopeQuest.grantSourceId, "chapter03-section-3");
  assert.deepEqual(hopeQuest.prerequisiteQuestIds, [REST_QUEST_ID]);
  assert.equal(hopeQuest.startDelaySeconds, 0);
});

test("MAIN_004 and interaction-011 use the approved objective and resource setup", () => {
  const quest = questDocument.quests.find((candidate) => candidate.id === HOPE_QUEST_ID);
  const interaction = scene.interactables.find((candidate) => candidate.id === "interaction-011");
  assert.ok(quest);
  assert.ok(interaction);
  assert.equal(quest.name, "有限的希望");
  assert.equal(quest.stages[0].name, "修復通訊陣列的準備");
  assert.deepEqual(
    quest.stages[0].objectives.map((objective) => [
      objective.id,
      objective.displayText,
      objective.type,
      objective.targetId,
      objective.showProgress,
    ]),
    [
      ["QUEST_CH03_MAIN_004_OBJ_01", "找出裝載通訊零件的貨箱", "interactionSucceeded", "interaction-011", false],
      [
        "QUEST_CH03_MAIN_004_OBJ_02",
        "取得陣列天線零件",
        "compoundCollectItem",
        "",
        true,
      ],
      ["QUEST_CH03_MAIN_004_OBJ_03", "取得多功能工具箱", "collectItem", "T0003", false],
    ],
  );
  assert.deepEqual(quest.stages[0].objectives[1].itemRequirements, [
    { itemId: "R0013", requiredAmount: 1 },
    { itemId: "R0014", requiredAmount: 1 },
    { itemId: "R0015", requiredAmount: 1 },
  ]);
  assert.deepEqual(interaction.itemRewards, [
    { itemId: "R0013", quantity: 1, delivery: "world" },
    { itemId: "R0014", quantity: 1, delivery: "world" },
    { itemId: "R0015", quantity: 1, delivery: "world" },
  ]);
});

test("MAIN_004 completes after the cargo box, three communication parts, and T0003", () => {
  const quest = structuredClone(
    questDocument.quests.find((candidate) => candidate.id === HOPE_QUEST_ID),
  );
  quest.prerequisiteQuestIds = [];
  const manager = new QuestRuntimeManager({
    schemaVersion: questDocument.schemaVersion,
    chapters: questDocument.chapters,
    quests: [quest],
  });
  assert.equal(manager.startQuest(HOPE_QUEST_ID), true);
  manager.handleEvent({ type: "interactionSucceeded", targetId: "interaction-011" });
  for (const itemId of ["R0013", "R0014", "R0015", "T0003"]) {
    manager.handleEvent({ type: "itemCollected", targetId: itemId, amount: 1 });
  }
  assert.equal(manager.getQuestState(HOPE_QUEST_ID), "completed");
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
  let now = 0;
  const scheduled = [];
  const quest = questDocument.quests.find((candidate) => candidate.id === QUEST_ID);
  const [stage1, stage2, stage3] = quest.stages;
  const stage1Interaction = stage1.objectives.find((objective) => objective.type === "interactionSucceeded");
  const stage1Items = stage1.objectives.find((objective) => objective.type === "compoundCollectItem");
  const stage2Interaction = stage2.objectives.find((objective) => objective.type === "interactionSucceeded");
  const stage3Interaction = stage3.objectives.find((objective) => objective.type === "interactionSucceeded");
  const stage3SingleItem = stage3.objectives.find((objective) => objective.type === "collectItem");
  const stage3Items = stage3.objectives.find((objective) => objective.type === "compoundCollectItem");
  const manager = new QuestRuntimeManager(questDocument, {
    now: () => now,
    scheduleQuestStart: (delayMilliseconds, callback) => {
      scheduled.push({ at: now + delayMilliseconds, callback });
    },
    onQuestStarted: (questId) => lifecycle.push(["accepted", questId]),
    onQuestCompleted: (questId) => lifecycle.push(["completed", questId]),
  });
  const flushScheduled = () => {
    while (scheduled.length > 0) {
      const nextAt = Math.min(...scheduled.map((task) => task.at));
      now = Math.max(now, nextAt);
      const due = scheduled.filter((task) => task.at <= now);
      scheduled.splice(0, scheduled.length, ...scheduled.filter((task) => task.at > now));
      for (const task of due) task.callback();
    }
  };

  assert.equal(manager.startQuest(QUEST_ID, 3, 360), true);
  assert.equal(manager.getCurrentStage(QUEST_ID), `${QUEST_ID}_STAGE_01`);

  dispatch(manager, "interaction:stage1", "interactionSucceeded", stage1Interaction.targetId);
  assert.equal(manager.getObjectiveProgress(QUEST_ID, `${QUEST_ID}_OBJ_01`).completed, true);

  dispatch(manager, "pickup:stage1-a", "itemCollected", stage1Items.itemRequirements[0].itemId);
  assert.equal(manager.getCurrentStage(QUEST_ID), `${QUEST_ID}_STAGE_01`);
  dispatch(manager, "pickup:stage1-b", "itemCollected", stage1Items.itemRequirements[1].itemId);
  flushScheduled();
  assert.equal(manager.getCurrentStage(QUEST_ID), `${QUEST_ID}_STAGE_02`);

  dispatch(manager, "interaction:stage2", "interactionSucceeded", stage2Interaction.targetId);
  flushScheduled();
  assert.equal(manager.getCurrentStage(QUEST_ID), `${QUEST_ID}_STAGE_03`);

  dispatch(manager, "pickup:stage3-single", "itemCollected", stage3SingleItem.targetId);
  for (const [index, requirement] of stage3Items.itemRequirements.entries()) {
    dispatch(manager, `pickup:stage3-${index}`, "itemCollected", requirement.itemId);
  }
  assert.equal(manager.getObjectiveProgress(QUEST_ID, `${QUEST_ID}_OBJ_05`).currentAmount, 3);
  assert.equal(manager.getQuestState(QUEST_ID), "active");

  dispatch(manager, "interaction:stage3", "interactionSucceeded", stage3Interaction.targetId);
  flushScheduled();
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

test("MAIN_006 stage 02 starts welding at interaction-024 and completes only from its puzzle event", () => {
  const quest = questDocument.quests.find(
    (candidate) => candidate.id === ARRAY_REPAIR_QUEST_ID,
  );
  const stage = quest?.stages.find(
    (candidate) => candidate.id === `${ARRAY_REPAIR_QUEST_ID}_STAGE_02`,
  );
  const objective = stage?.objectives.find(
    (candidate) => candidate.id === `${ARRAY_REPAIR_QUEST_ID}_OBJ_04`,
  );
  const interaction = scene.interactables.find(
    (candidate) => candidate.id === WELDING_INTERACTION_ID,
  );

  assert.ok(quest);
  assert.ok(stage);
  assert.ok(objective);
  assert.ok(interaction);
  assert.equal(objective.type, "puzzleCompleted");
  assert.equal(objective.targetId, WELDING_INTERACTION_ID);
  assert.deepEqual(
    interaction.useRequirements
      .filter((requirement) => requirement.kind === "questStage")
      .map((requirement) => [requirement.questId, requirement.stageId, requirement.stageMode]),
    [[ARRAY_REPAIR_QUEST_ID, stage.id, "CurrentStageOnly"]],
  );

  const isolatedQuest = {
    ...structuredClone(quest),
    prerequisiteQuestIds: [],
    stages: [structuredClone(stage)],
  };
  const manager = new QuestRuntimeManager({
    schemaVersion: questDocument.schemaVersion,
    chapters: questDocument.chapters,
    quests: [isolatedQuest],
  });
  assert.equal(manager.startQuest(ARRAY_REPAIR_QUEST_ID), true);
  manager.handleEvent({ type: "interactionSucceeded", targetId: WELDING_INTERACTION_ID });
  assert.equal(manager.getQuestState(ARRAY_REPAIR_QUEST_ID), "active");
  manager.handleEvent({ type: "puzzleCompleted", targetId: "another-puzzle" });
  assert.equal(manager.getQuestState(ARRAY_REPAIR_QUEST_ID), "active");
  manager.handleEvent({ type: "puzzleCompleted", targetId: WELDING_INTERACTION_ID });
  assert.equal(manager.getQuestState(ARRAY_REPAIR_QUEST_ID), "completed");
});

test("MAIN_005 preserves the hidden tool chain and advances through the power puzzle", () => {
  const quest = questDocument.quests.find((candidate) => candidate.id === FAR_LIGHT_QUEST_ID);
  assert.ok(quest);
  assert.equal(quest.grantMethod, "afterDialogue");
  assert.equal(quest.grantSourceId, "chapter03-section-4");
  assert.deepEqual(quest.prerequisiteQuestIds, [HOPE_QUEST_ID]);
  assert.deepEqual(
    quest.stages.map((stage) => {
      const objective = stage.objectives[0];
      return [objective.type, objective.targetId];
    }),
    [
      ["interactionSucceeded", "interaction-021"],
      ["interactionSucceeded", "interaction-020"],
      ["interactionSucceeded", "interaction-022"],
      ["interactionSucceeded", "scene2-interaction-002"],
      ["collectItem", "R0001"],
      ["interactionSucceeded", "interaction-013"],
      ["interactionSucceeded", "interaction-012"],
    ],
  );

  const scene2Stage = quest.stages.find(
    (stage) => stage.id === `${FAR_LIGHT_QUEST_ID}_STAGE_03`,
  );
  assert.deepEqual(
    scene2Stage.objectives.map((objective) => objective.id),
    [
      `${FAR_LIGHT_QUEST_ID}_OBJ_03`,
      `${FAR_LIGHT_QUEST_ID}_OBJ_08`,
    ],
  );
  assert.equal(
    scene2Stage.objectives[1].unlockDialogueId,
    "chapter03-scene2-start",
  );

  const scene1Interactions = new Map(scene.interactables.map((entry) => [entry.id, entry]));
  const scene2Interactions = new Map(scene2.interactables.map((entry) => [entry.id, entry]));
  const requirementSummary = (interactionId) =>
    scene1Interactions.get(interactionId).useRequirements.map((requirement) => [
      requirement.kind,
      requirement.stageId || requirement.itemId || requirement.minimumPower,
    ]);

  assert.deepEqual(requirementSummary("interaction-020"), [
    ["questStage", `${FAR_LIGHT_QUEST_ID}_STAGE_02`],
  ]);
  assert.deepEqual(requirementSummary("interaction-022"), [
    ["questStage", `${FAR_LIGHT_QUEST_ID}_STAGE_02B`],
  ]);
  assert.equal(
    scene1Interactions.get("interaction-022").useRequirements[0].stageMode,
    "CurrentStageOnly",
  );
  assert.equal(
    scene1Interactions.get("interaction-022").storyDialogueId,
    "chapter03-section-5",
  );
  assert.deepEqual(requirementSummary("interaction-019"), [
    ["questStage", `${FAR_LIGHT_QUEST_ID}_STAGE_03`],
    ["item", "T0010"],
  ]);
  assert.equal(scene1Interactions.get("interaction-019").itemRewards[0].itemId, "T0001");
  assert.deepEqual(requirementSummary("interaction-006"), [
    ["questStage", `${FAR_LIGHT_QUEST_ID}_STAGE_04`],
    ["item", "T0008"],
  ]);
  assert.deepEqual(requirementSummary("interaction-013"), [
    ["questStage", `${FAR_LIGHT_QUEST_ID}_STAGE_05`],
    ["item", "R0001"],
  ]);
  assert.deepEqual(requirementSummary("interaction-012"), [
    ["questStage", `${FAR_LIGHT_QUEST_ID}_STAGE_06`],
    ["campPower", 5],
  ]);

  for (const interactionId of ["scene2-interaction-001", "scene2-interaction-002"]) {
    const requirements = scene2Interactions.get(interactionId).useRequirements;
    assert.equal(requirements[0].stageId, `${FAR_LIGHT_QUEST_ID}_STAGE_03`);
    assert.equal(requirements[0].stageMode, "UnlockFromStage");
    assert.equal(requirements[1].kind, "item");
    assert.equal(requirements[1].itemId, "T0001");
  }
  assert.deepEqual(scene2.itemPoints[0].spawnRequirement, {
    questId: FAR_LIGHT_QUEST_ID,
    stageId: `${FAR_LIGHT_QUEST_ID}_STAGE_03`,
    stageMode: "UnlockFromStage",
  });
  assert.equal(scene2.itemPoints[0].itemId, "T0008");

  const isolatedDocument = {
    schemaVersion: questDocument.schemaVersion,
    chapters: questDocument.chapters,
    quests: [{ ...structuredClone(quest), prerequisiteQuestIds: [] }],
  };
  const manager = new QuestRuntimeManager(isolatedDocument);
  assert.equal(manager.startQuest(FAR_LIGHT_QUEST_ID), true);
  const expectedStages = quest.stages.map((stage) => stage.id);
  const events = [
    ["interactionSucceeded", "interaction-021"],
    ["interactionSucceeded", "interaction-020"],
    ["interactionSucceeded", "interaction-022"],
    ["itemCollected", "T0008"],
    ["itemCollected", "R0001"],
    ["interactionSucceeded", "interaction-013"],
    ["interactionSucceeded", "interaction-012"],
  ];
  for (const [index, [type, targetId]] of events.entries()) {
    assert.equal(manager.getCurrentStage(FAR_LIGHT_QUEST_ID), expectedStages[index]);
    dispatch(manager, `main005:${index}`, type, targetId);
  }
  assert.equal(manager.getQuestState(FAR_LIGHT_QUEST_ID), "completed");
});

test("Scene_2 shovel objective unlocks after its story dialogue and uses a scene-specific interaction ID", () => {
  const quest = questDocument.quests.find((candidate) => candidate.id === FAR_LIGHT_QUEST_ID);
  const stage = quest.stages.find(
    (candidate) => candidate.id === `${FAR_LIGHT_QUEST_ID}_STAGE_03`,
  );
  const searchObjective = stage.objectives.find(
    (objective) => objective.id === `${FAR_LIGHT_QUEST_ID}_OBJ_03`,
  );
  const shovelObjective = stage.objectives.find(
    (objective) => objective.id === `${FAR_LIGHT_QUEST_ID}_OBJ_08`,
  );
  const storyTrigger = scene2.storyTriggers.find(
    (trigger) => trigger.label === "發現挖掘鏟",
  );

  assert.equal(searchObjective.type, "interactionSucceeded");
  assert.equal(searchObjective.targetId, "scene2-interaction-002");
  assert.ok(
    scene2.interactables.some(
      (interaction) => interaction.id === "scene2-interaction-002",
    ),
  );
  assert.equal(shovelObjective.type, "collectItem");
  assert.equal(shovelObjective.targetId, "T0008");
  assert.equal(shovelObjective.unlockDialogueId, "chapter03-scene2-start");
  assert.equal(storyTrigger.dialogueId, "chapter03-scene2-start");
});
