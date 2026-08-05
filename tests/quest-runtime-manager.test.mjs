import assert from "node:assert/strict";
import test from "node:test";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";

const document = {
  schemaVersion: 1,
  chapters: [{ id: "CH03", name: "存活的準備", completionQuestIds: [] }],
  quests: [
    {
      id: "QUEST_TEST",
      name: "確認營地狀況",
      description: "",
      chapterId: "CH03",
      type: "main",
      prerequisiteQuestIds: [],
      grantMethod: "automatic",
      canAbandon: false,
      canReaccept: false,
      displayMode: "standard",
      rewardItemId: "R0004",
      rewardItemAmount: 1,
      stages: [
        {
          id: "QUEST_TEST_STAGE_01",
          name: "收集補給",
          completionMode: "all",
          nextStageId: "QUEST_TEST_STAGE_02",
          objectives: [
            {
              id: "QUEST_TEST_OBJ_01",
              displayText: "取得晶體",
              type: "collectItem",
              targetId: "R0001",
              requiredAmount: 2,
              countMode: "accumulated",
              interactionMode: "succeeded",
              showProgress: true,
              showHintIcon: false,
            },
          ],
        },
        {
          id: "QUEST_TEST_STAGE_02",
          name: "檢查電腦",
          completionMode: "all",
          objectives: [
            {
              id: "QUEST_TEST_OBJ_02",
              displayText: "操作工作台電腦",
              type: "interactionSucceeded",
              targetId: "interaction-004",
              requiredAmount: 1,
              countMode: "accumulated",
              interactionMode: "succeeded",
              showProgress: false,
              showHintIcon: true,
            },
          ],
        },
      ],
    },
  ],
};

test("quest runtime advances stages and completes the quest", () => {
  const rewards = [];
  const manager = new QuestRuntimeManager(document, {
    giveItem: (itemId, amount) => rewards.push([itemId, amount]),
  });
  assert.equal(manager.getQuestState("QUEST_TEST"), "available");
  assert.equal(manager.startQuest("QUEST_TEST", 3, 360), true);
  assert.equal(manager.hasQuestReachedStage("QUEST_TEST", "QUEST_TEST_STAGE_01"), true);
  assert.equal(manager.hasQuestReachedStage("QUEST_TEST", "QUEST_TEST_STAGE_02"), false);
  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 1 });
  assert.equal(manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_01").currentAmount, 1);
  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 1 });
  assert.equal(manager.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_02");
  assert.equal(manager.isQuestAtStage("QUEST_TEST", "QUEST_TEST_STAGE_02"), true);
  assert.equal(manager.hasQuestReachedStage("QUEST_TEST", "QUEST_TEST_STAGE_01"), true);
  manager.handleEvent({ type: "interactionSucceeded", targetId: "interaction-004" });
  assert.equal(manager.getQuestState("QUEST_TEST"), "completed");
  assert.deepEqual(rewards, [["R0004", 1]]);
});

test("quest save restores progress without copying definitions", () => {
  const manager = new QuestRuntimeManager(document);
  manager.startQuest("QUEST_TEST");
  manager.addObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_01", 1);
  const restored = new QuestRuntimeManager(document, {}, manager.exportSave());
  assert.equal(restored.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_01").currentAmount, 1);
  assert.equal(restored.getQuestState("QUEST_TEST"), "active");
});

test("completed quest history keeps the latest three completion order", () => {
  const historyDocument = structuredClone(document);
  historyDocument.quests = ["A", "B", "C", "D"].map((suffix) => {
    const quest = structuredClone(document.quests[0]);
    quest.id = `QUEST_${suffix}`;
    quest.name = `任務 ${suffix}`;
    quest.stages = [];
    quest.rewardItemId = "";
    quest.rewardItemAmount = 0;
    return quest;
  });
  const manager = new QuestRuntimeManager(historyDocument);
  for (const questId of ["QUEST_B", "QUEST_D", "QUEST_A", "QUEST_C"]) {
    manager.completeQuest(questId);
  }

  assert.deepEqual(
    manager.getCompletedQuestIds(3),
    ["QUEST_C", "QUEST_A", "QUEST_D"],
  );
  const restored = new QuestRuntimeManager(historyDocument, {}, manager.exportSave());
  assert.deepEqual(
    restored.getCompletedQuestIds(3),
    ["QUEST_C", "QUEST_A", "QUEST_D"],
  );
});

test("available automatic quests are truly accepted by the reusable grant pass", () => {
  const manager = new QuestRuntimeManager(document);
  assert.deepEqual(manager.startAvailableAutomaticQuests(3, 420), ["QUEST_TEST"]);
  assert.equal(manager.getQuestState("QUEST_TEST"), "active");
  const entry = manager.exportSave().quests.QUEST_TEST;
  assert.equal(entry.startedAtDay, 3);
  assert.equal(entry.startedAtTime, 420);
  assert.deepEqual(manager.startAvailableAutomaticQuests(3, 421), []);
});

test("quest start requests wait for the configured real-time delay", () => {
  const delayedDocument = structuredClone(document);
  delayedDocument.quests[0].startDelaySeconds = 1;
  let scheduledDelay = null;
  let scheduledStart = null;
  const manager = new QuestRuntimeManager(delayedDocument, {
    scheduleQuestStart: (delayMilliseconds, start) => {
      scheduledDelay = delayMilliseconds;
      scheduledStart = start;
    },
  });

  assert.equal(manager.requestQuestStart("QUEST_TEST", 3, 480), true);
  assert.equal(manager.getQuestState("QUEST_TEST"), "available");
  assert.equal(scheduledDelay, 1000);
  assert.equal(manager.requestQuestStart("QUEST_TEST", 3, 480), false);

  scheduledStart();
  assert.equal(manager.getQuestState("QUEST_TEST"), "active");
  const entry = manager.exportSave().quests.QUEST_TEST;
  assert.equal(entry.startedAtDay, 3);
  assert.equal(entry.startedAtTime, 480);
});

test("compound item objective requires every configured item and ignores duplicate events", () => {
  const compoundDocument = structuredClone(document);
  const objective = compoundDocument.quests[0].stages[0].objectives[0];
  objective.type = "compoundCollectItem";
  objective.targetId = "";
  objective.requiredAmount = 2;
  objective.itemRequirements = [
    { itemId: "R0004", requiredAmount: 1 },
    { itemId: "R0005", requiredAmount: 1 },
  ];

  const manager = new QuestRuntimeManager(compoundDocument);
  manager.startQuest("QUEST_TEST");
  manager.handleEvent({
    type: "itemCollected",
    targetId: "R0004",
    amount: 1,
    eventId: "pickup:food",
  });
  manager.handleEvent({
    type: "itemCollected",
    targetId: "R0004",
    amount: 1,
    eventId: "pickup:food",
  });
  assert.equal(manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_01").currentAmount, 1);
  assert.equal(manager.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_01");

  manager.handleEvent({
    type: "itemCollected",
    targetId: "R0005",
    amount: 1,
    eventId: "pickup:water",
  });
  assert.equal(manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_01").completed, true);
  assert.equal(manager.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_02");
  assert.deepEqual(manager.exportSave().processedEventIds, ["pickup:food", "pickup:water"]);
});

test("quest lifecycle host receives distinct accepted, completed, failed and abandoned signals", () => {
  const signals = [];
  const manager = new QuestRuntimeManager(document, {
    onQuestStarted: (questId) => signals.push(["accepted", questId]),
    onQuestCompleted: (questId) => signals.push(["completed", questId]),
    onQuestFailed: (questId) => signals.push(["failed", questId]),
    onQuestAbandoned: (questId) => signals.push(["abandoned", questId]),
  });
  manager.startQuest("QUEST_TEST");
  manager.completeQuest("QUEST_TEST");
  assert.deepEqual(signals, [
    ["accepted", "QUEST_TEST"],
    ["completed", "QUEST_TEST"],
  ]);

  const failureDocument = structuredClone(document);
  failureDocument.quests[0].canAbandon = true;
  const failedManager = new QuestRuntimeManager(failureDocument, {
    onQuestFailed: (questId) => signals.push(["failed", questId]),
  });
  failedManager.startQuest("QUEST_TEST");
  failedManager.failQuest("QUEST_TEST");

  const abandonedManager = new QuestRuntimeManager(failureDocument, {
    onQuestAbandoned: (questId) => signals.push(["abandoned", questId]),
  });
  abandonedManager.startQuest("QUEST_TEST");
  abandonedManager.abandonQuest("QUEST_TEST");
  assert.deepEqual(signals.slice(-2), [
    ["failed", "QUEST_TEST"],
    ["abandoned", "QUEST_TEST"],
  ]);
});

test("stage transition waits for the UI handoff and objective completion signals only once", () => {
  const completedObjectives = [];
  const transitions = [];
  let finishTransition = null;
  const completionDocument = structuredClone(document);
  completionDocument.quests[0].stages[0].objectives[0].completionInterfaceAction = "close";
  completionDocument.quests[0].stages[0].objectives[0].completionInterfaceId = "Inventory";
  const manager = new QuestRuntimeManager(completionDocument, {
    onObjectiveCompleted: (questId, objectiveId, stageId, _entry, objective) => {
      completedObjectives.push([
        questId,
        objectiveId,
        stageId,
        objective.completionInterfaceAction,
        objective.completionInterfaceId,
      ]);
    },
    onStageTransitionStarted: (questId, currentStageId, nextStageId, _entry, complete) => {
      transitions.push([questId, currentStageId, nextStageId]);
      finishTransition = complete;
    },
  });

  manager.startQuest("QUEST_TEST");
  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 2 });

  assert.deepEqual(completedObjectives, [
    ["QUEST_TEST", "QUEST_TEST_OBJ_01", "QUEST_TEST_STAGE_01", "close", "Inventory"],
  ]);
  assert.deepEqual(transitions, [
    ["QUEST_TEST", "QUEST_TEST_STAGE_01", "QUEST_TEST_STAGE_02"],
  ]);
  assert.equal(manager.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_01");

  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 1 });
  assert.equal(completedObjectives.length, 1);
  assert.equal(transitions.length, 1);

  finishTransition?.();
  assert.equal(manager.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_02");
});

test("interface opening and successful item use are reusable objective events", () => {
  const eventDocument = structuredClone(document);
  eventDocument.quests[0].stages = [{
    id: "QUEST_TEST_STAGE_01",
    name: "背包教學",
    completionMode: "all",
    objectives: [
      {
        id: "QUEST_TEST_OBJ_01",
        displayText: "打開背包",
        type: "interfaceOpened",
        targetId: "Inventory",
        requiredAmount: 1,
        countMode: "accumulated",
        interactionMode: "succeeded",
        showProgress: false,
        showHintIcon: false,
      },
      {
        id: "QUEST_TEST_OBJ_02",
        displayText: "使用淨水瓶",
        type: "itemUsed",
        targetId: "R0004",
        requiredAmount: 1,
        countMode: "accumulated",
        interactionMode: "succeeded",
        showProgress: false,
        showHintIcon: false,
      },
    ],
  }];

  const manager = new QuestRuntimeManager(eventDocument);
  manager.startQuest("QUEST_TEST");
  manager.handleEvent({ type: "interfaceOpened", targetId: "Options" });
  manager.handleEvent({ type: "itemUsed", targetId: "R0005", amount: 1 });
  assert.equal(manager.getQuestState("QUEST_TEST"), "active");

  manager.handleEvent({ type: "interfaceOpened", targetId: "Inventory" });
  assert.equal(manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_01").completed, true);
  manager.handleEvent({ type: "itemUsed", targetId: "R0004", amount: 1 });
  assert.equal(manager.getQuestState("QUEST_TEST"), "completed");
});
