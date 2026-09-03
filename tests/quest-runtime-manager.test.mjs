import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const movementLabSource = readFileSync(
  new URL("../app/movement-lab.tsx", import.meta.url),
  "utf8",
);

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

test("dialogue-gated objective stays hidden and inactive until the dialogue completes", () => {
  const gatedDocument = structuredClone(document);
  const quest = gatedDocument.quests[0];
  quest.stages = [
    {
      id: "QUEST_TEST_STAGE_01",
      name: "對話解鎖測試",
      completionMode: "all",
      objectives: [
        {
          id: "QUEST_TEST_OBJ_DIALOGUE_GATE",
          displayText: "取得挖掘鏟",
          type: "collectItem",
          targetId: "T0008",
          unlockDialogueId: "chapter03-scene2-start",
          requiredAmount: 1,
          countMode: "accumulated",
          interactionMode: "succeeded",
          showProgress: false,
          showHintIcon: false,
        },
      ],
    },
  ];
  quest.rewardItemId = "";
  quest.rewardItemAmount = 0;

  const manager = new QuestRuntimeManager(gatedDocument);
  manager.startQuest("QUEST_TEST");
  let progress = manager.getObjectiveProgress(
    "QUEST_TEST",
    "QUEST_TEST_OBJ_DIALOGUE_GATE",
  );
  assert.equal(progress.unlocked, false);

  manager.handleEvent({ type: "itemCollected", targetId: "T0008", amount: 1 });
  progress = manager.getObjectiveProgress(
    "QUEST_TEST",
    "QUEST_TEST_OBJ_DIALOGUE_GATE",
  );
  assert.equal(progress.currentAmount, 0);
  assert.equal(progress.completed, false);

  manager.handleEvent({
    type: "dialogueCompleted",
    targetId: "chapter03-scene2-start",
  });
  progress = manager.getObjectiveProgress(
    "QUEST_TEST",
    "QUEST_TEST_OBJ_DIALOGUE_GATE",
  );
  assert.equal(progress.unlocked, true);

  const restored = new QuestRuntimeManager(
    gatedDocument,
    {},
    manager.exportSave(),
  );
  assert.equal(
    restored.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_DIALOGUE_GATE").unlocked,
    true,
  );
  restored.handleEvent({ type: "itemCollected", targetId: "T0008", amount: 1 });
  assert.equal(restored.getQuestState("QUEST_TEST"), "completed");
});

test("story trigger activates an event objective and persists its runtime state", () => {
  const eventDocument = structuredClone(document);
  const quest = eventDocument.quests[0];
  quest.rewardItemId = "";
  quest.rewardItemAmount = 0;
  quest.stages = [{
    id: "QUEST_TEST_STAGE_EVENT",
    name: "事件啟用測試",
    completionMode: "all",
    objectives: [
      {
        id: "QUEST_TEST_OBJ_READY",
        displayText: "先完成既有目標",
        type: "interactionSucceeded",
        targetId: "interaction-ready",
        requiredAmount: 1,
        countMode: "accumulated",
        interactionMode: "succeeded",
        showProgress: false,
        showHintIcon: false,
      },
      {
        id: "QUEST_TEST_OBJ_EVENT",
        displayText: "由劇情區顯示的新目標",
        type: "collectItem",
        targetId: "T0008",
        requiredAmount: 1,
        countMode: "accumulated",
        interactionMode: "succeeded",
        activationMode: "event",
        activationEventId: "story-zone-a",
        blocksStageCompletion: true,
        showProgress: false,
        showHintIcon: false,
      },
    ],
  }];

  const activated = [];
  const manager = new QuestRuntimeManager(eventDocument, {
    onObjectiveActivated: (_questId, objectiveId) => activated.push(objectiveId),
  });
  manager.startQuest("QUEST_TEST");
  assert.deepEqual(activated, [], "Stage 開始時的 immediate OBJ 不得觸發額外 OBJ 啟用事件");
  assert.equal(manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_EVENT").state, "locked");
  manager.handleEvent({ type: "interactionSucceeded", targetId: "interaction-ready" });
  assert.equal(manager.getQuestState("QUEST_TEST"), "active");

  manager.handleEvent({ type: "storyTriggerCompleted", targetId: "story-zone-a" });
  assert.deepEqual(activated, ["QUEST_TEST_OBJ_EVENT"]);
  assert.equal(manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_EVENT").state, "active");

  const restored = new QuestRuntimeManager(eventDocument, {
    onObjectiveActivated: () => activated.push("replayed-after-load"),
  }, manager.exportSave());
  assert.deepEqual(activated, ["QUEST_TEST_OBJ_EVENT"], "讀檔不得重播 OBJ 啟用事件");
  assert.equal(restored.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_EVENT").state, "active");
  restored.handleEvent({ type: "itemCollected", targetId: "T0008", amount: 1 });
  assert.equal(restored.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_EVENT").state, "completed");
  assert.equal(restored.getQuestState("QUEST_TEST"), "completed");
});

test("an untouched objective is re-locked when its definition changes from immediate to event activation", () => {
  const immediateDocument = structuredClone(document);
  const quest = immediateDocument.quests[0];
  quest.rewardItemId = "";
  quest.rewardItemAmount = 0;
  quest.stages = [{
    id: "QUEST_TEST_STAGE_MIGRATION",
    name: "啟用規則遷移測試",
    completionMode: "all",
    objectives: [{
      id: "QUEST_TEST_OBJ_MIGRATION",
      displayText: "等待劇情後顯示",
      type: "collectItem",
      targetId: "T0008",
      requiredAmount: 1,
      countMode: "accumulated",
      interactionMode: "succeeded",
      activationMode: "immediate",
      activationEventId: "",
      blocksStageCompletion: true,
      showProgress: false,
      showHintIcon: false,
    }],
  }];

  const original = new QuestRuntimeManager(immediateDocument);
  original.startQuest("QUEST_TEST");
  assert.equal(
    original.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_MIGRATION").state,
    "active",
  );

  const eventDocument = structuredClone(immediateDocument);
  const objective = eventDocument.quests[0].stages[0].objectives[0];
  objective.activationMode = "event";
  objective.activationEventId = "chapter03-scene2-start";
  const migrated = new QuestRuntimeManager(eventDocument, {}, original.exportSave());
  const progress = migrated.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_MIGRATION");
  assert.equal(progress.unlocked, false);
  assert.equal(progress.state, "locked");
});

test("locked event objective can be excluded from stage completion", () => {
  const optionalDocument = structuredClone(document);
  const quest = optionalDocument.quests[0];
  quest.rewardItemId = "";
  quest.rewardItemAmount = 0;
  quest.stages = [{
    id: "QUEST_TEST_STAGE_OPTIONAL",
    name: "可選事件目標測試",
    completionMode: "all",
    objectives: [
      {
        id: "QUEST_TEST_OBJ_REQUIRED",
        displayText: "必要目標",
        type: "interactionSucceeded",
        targetId: "interaction-required",
        requiredAmount: 1,
        countMode: "accumulated",
        interactionMode: "succeeded",
        showProgress: false,
        showHintIcon: false,
      },
      {
        id: "QUEST_TEST_OBJ_OPTIONAL",
        displayText: "尚未出現的可選目標",
        type: "collectItem",
        targetId: "R0001",
        requiredAmount: 1,
        countMode: "accumulated",
        interactionMode: "succeeded",
        activationMode: "event",
        activationEventId: "story-zone-optional",
        blocksStageCompletion: false,
        showProgress: false,
        showHintIcon: false,
      },
    ],
  }];

  const manager = new QuestRuntimeManager(optionalDocument);
  manager.startQuest("QUEST_TEST");
  manager.handleEvent({ type: "interactionSucceeded", targetId: "interaction-required" });
  assert.equal(manager.getQuestState("QUEST_TEST"), "completed");
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

test("automatic quest grant pass can be limited to the current chapter", () => {
  const chapterDocument = structuredClone(document);
  chapterDocument.chapters.push({ id: "CH04", name: "天外世界", completionQuestIds: [] });
  const chapterFourQuest = structuredClone(chapterDocument.quests[0]);
  chapterFourQuest.id = "QUEST_CH04_TEST";
  chapterFourQuest.chapterId = "CH04";
  chapterFourQuest.stages[0].id = "QUEST_CH04_TEST_STAGE_01";
  chapterFourQuest.stages[0].objectives[0].id = "QUEST_CH04_TEST_OBJ_01";
  chapterFourQuest.stages[1].id = "QUEST_CH04_TEST_STAGE_02";
  chapterFourQuest.stages[1].objectives[0].id = "QUEST_CH04_TEST_OBJ_02";
  chapterDocument.quests.push(chapterFourQuest);

  const manager = new QuestRuntimeManager(chapterDocument);
  assert.deepEqual(
    manager.startAvailableAutomaticQuests(3, 360, "CH03"),
    ["QUEST_TEST"],
  );
  assert.equal(manager.getQuestState("QUEST_CH04_TEST"), "available");
  assert.deepEqual(
    manager.startAvailableAutomaticQuests(4, 360, "ch04"),
    ["QUEST_CH04_TEST"],
  );
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

test("stage and objective start delays block events, survive save restore and reveal in order", () => {
  const delayedDocument = structuredClone(document);
  const firstStage = delayedDocument.quests[0].stages[0];
  firstStage.startDelaySeconds = 2;
  firstStage.startEventFlowId = "stage-ready";
  firstStage.objectives[0].startDelaySeconds = 1.5;

  let now = 1000;
  const scheduled = [];
  const flows = [];
  const host = {
    now: () => now,
    runEventFlow: (eventFlowId) => flows.push(eventFlowId),
    scheduleQuestStart: (delayMilliseconds, callback) => {
      scheduled.push({ at: now + delayMilliseconds, callback });
    },
  };
  const runDue = () => {
    let ran;
    do {
      ran = false;
      for (let index = scheduled.length - 1; index >= 0; index -= 1) {
        if (scheduled[index].at > now) continue;
        const [{ callback }] = scheduled.splice(index, 1);
        callback();
        ran = true;
      }
    } while (ran);
  };

  const manager = new QuestRuntimeManager(delayedDocument, host);
  manager.startQuest("QUEST_TEST");
  let save = manager.exportSave();
  assert.equal(save.quests.QUEST_TEST.stageAvailableAtEpochMs, 3000);
  assert.equal(save.quests.QUEST_TEST.objectives.QUEST_TEST_OBJ_01.availableAtEpochMs, 4500);
  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 2, eventId: "too-early" });
  assert.equal(manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_01").currentAmount, 0);
  assert.deepEqual(manager.exportSave().processedEventIds, []);

  now = 2000;
  save = manager.exportSave();
  scheduled.length = 0;
  const restored = new QuestRuntimeManager(delayedDocument, host, save);
  now = 3000;
  runDue();
  assert.deepEqual(flows, ["stage-ready"]);
  restored.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 2 });
  assert.equal(restored.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_01").currentAmount, 0);

  now = 4500;
  runDue();
  restored.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 2 });
  assert.equal(restored.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_02");
});

test("completion delays save logical completion immediately and postpone only UI handoff", () => {
  const delayedDocument = structuredClone(document);
  const quest = delayedDocument.quests[0];
  quest.completionFlagId = "QUEST_TEST_COMPLETED";
  quest.stages = [structuredClone(quest.stages[0])];
  quest.stages[0].nextStageId = "";
  quest.stages[0].completionDelaySeconds = 4;
  quest.stages[0].objectives[0].completionDelaySeconds = 2;

  let now = 1000;
  const scheduled = [];
  const signals = [];
  const flags = [];
  const host = {
    now: () => now,
    setFlag: (flagId, value) => flags.push([flagId, value]),
    onObjectiveCompleted: (_questId, objectiveId) => signals.push(["objective", objectiveId]),
    onQuestCompleted: (questId) => signals.push(["quest", questId]),
    scheduleQuestStart: (delayMilliseconds, callback) => {
      scheduled.push({ at: now + delayMilliseconds, callback });
    },
  };
  const runDue = () => {
    let ran;
    do {
      ran = false;
      for (let index = scheduled.length - 1; index >= 0; index -= 1) {
        if (scheduled[index].at > now) continue;
        const [{ callback }] = scheduled.splice(index, 1);
        callback();
        ran = true;
      }
    } while (ran);
  };

  const manager = new QuestRuntimeManager(delayedDocument, host);
  manager.startQuest("QUEST_TEST");
  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 2 });

  const savedImmediately = manager.exportSave();
  assert.equal(manager.getQuestState("QUEST_TEST"), "completed");
  assert.equal(savedImmediately.quests.QUEST_TEST.objectives.QUEST_TEST_OBJ_01.completed, true);
  assert.equal(savedImmediately.quests.QUEST_TEST.objectives.QUEST_TEST_OBJ_01.completionPresented, false);
  assert.equal(savedImmediately.quests.QUEST_TEST.objectives.QUEST_TEST_OBJ_01.completionAvailableAtEpochMs, 3000);
  assert.equal(savedImmediately.quests.QUEST_TEST.stageCompletionAvailableAtEpochMs, 5000);
  assert.deepEqual(flags, [["QUEST_TEST_COMPLETED", true]]);
  assert.deepEqual(signals, []);

  now = 2000;
  scheduled.length = 0;
  const restored = new QuestRuntimeManager(delayedDocument, host, savedImmediately);
  assert.equal(restored.getQuestState("QUEST_TEST"), "completed");
  now = 3000;
  runDue();
  assert.deepEqual(signals, [["objective", "QUEST_TEST_OBJ_01"]]);
  now = 5000;
  runDue();
  assert.deepEqual(signals, [
    ["objective", "QUEST_TEST_OBJ_01"],
    ["quest", "QUEST_TEST"],
  ]);
  assert.equal(restored.exportSave().quests.QUEST_TEST.questCompletionPresented, true);
});

test("objective completion flow runs after its own delay without waiting for stage completion", () => {
  const delayedDocument = structuredClone(document);
  const quest = delayedDocument.quests[0];
  quest.rewardItemId = "";
  quest.rewardItemAmount = 0;
  quest.stages = [{
    id: "QUEST_TEST_STAGE_OBJECTIVE_FLOW",
    name: "Objective completion flow",
    completionMode: "all",
    objectives: [
      {
        id: "QUEST_TEST_OBJ_WITH_FLOW",
        displayText: "完成後播放腳本",
        type: "interactionSucceeded",
        targetId: "interaction-flow",
        requiredAmount: 1,
        countMode: "accumulated",
        interactionMode: "succeeded",
        completionDelaySeconds: 1,
        completionEventFlowId: "chapter03-section-6",
      },
      {
        id: "QUEST_TEST_OBJ_STILL_PENDING",
        displayText: "保持未完成",
        type: "interactionSucceeded",
        targetId: "interaction-pending",
        requiredAmount: 1,
        countMode: "accumulated",
        interactionMode: "succeeded",
      },
    ],
  }];

  let now = 1000;
  const scheduled = [];
  const flows = [];
  const manager = new QuestRuntimeManager(delayedDocument, {
    now: () => now,
    runEventFlow: (eventFlowId) => flows.push(eventFlowId),
    scheduleQuestStart: (delayMilliseconds, callback) => {
      scheduled.push({ at: now + delayMilliseconds, callback });
    },
  });

  manager.startQuest("QUEST_TEST");
  manager.handleEvent({
    type: "interactionSucceeded",
    targetId: "interaction-flow",
  });

  assert.deepEqual(flows, []);
  assert.equal(manager.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_OBJECTIVE_FLOW");
  assert.equal(manager.getQuestState("QUEST_TEST"), "active");

  now = 2000;
  for (const task of scheduled.splice(0)) task.callback();

  assert.deepEqual(flows, ["chapter03-section-6"]);
  assert.equal(manager.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_OBJECTIVE_FLOW");
  assert.equal(manager.getQuestState("QUEST_TEST"), "active");
});

test("事件啟用持有道具目標時會立即查核已同步的目前持有量", () => {
  const haveItemDocument = structuredClone(document);
  const quest = haveItemDocument.quests[0];
  quest.rewardItemId = "";
  quest.rewardItemAmount = 0;
  quest.stages = [{
    id: "QUEST_TEST_STAGE_HAVE_ITEM",
    name: "事件型持有量測試",
    completionMode: "all",
    objectives: [{
      id: "QUEST_TEST_OBJ_HAVE_ITEM",
      displayText: "持有焊槍工具",
      type: "haveItem",
      targetId: "T0007",
      requiredAmount: 1,
      countMode: "currentInventory",
      interactionMode: "succeeded",
      activationMode: "event",
      activationEventId: "welding-help-unlocked",
      blocksStageCompletion: false,
      showProgress: false,
      showHintIcon: false,
    }],
  }];

  const lifecycle = [];
  const manager = new QuestRuntimeManager(haveItemDocument, {
    onObjectiveActivated: () => lifecycle.push("activated"),
    onObjectiveCompleted: () => lifecycle.push("completed"),
  });
  manager.syncCurrentInventory({ T0007: 1 });
  manager.startQuest("QUEST_TEST");
  assert.equal(
    manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_HAVE_ITEM").state,
    "locked",
  );
  assert.equal(manager.getQuestState("QUEST_TEST"), "active");

  manager.handleEvent({
    type: "storyTriggerCompleted",
    targetId: "welding-help-unlocked",
  });
  assert.equal(
    manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_HAVE_ITEM").completed,
    true,
  );
  assert.equal(manager.getQuestState("QUEST_TEST"), "completed");
  assert.deepEqual(lifecycle, ["activated", "completed"]);
});

test("持有道具目標啟用後會隨背包目前數量變更完成", () => {
  const haveItemDocument = structuredClone(document);
  const quest = haveItemDocument.quests[0];
  quest.rewardItemId = "";
  quest.rewardItemAmount = 0;
  quest.stages = [{
    id: "QUEST_TEST_STAGE_HAVE_ITEM",
    name: "持有量更新測試",
    completionMode: "all",
    objectives: [{
      id: "QUEST_TEST_OBJ_HAVE_ITEM",
      displayText: "持有焊槍工具",
      type: "haveItem",
      targetId: "T0007",
      requiredAmount: 1,
      countMode: "currentInventory",
      interactionMode: "succeeded",
      showProgress: true,
      showHintIcon: false,
    }],
  }];

  const manager = new QuestRuntimeManager(haveItemDocument);
  manager.syncCurrentInventory({});
  manager.startQuest("QUEST_TEST");
  assert.equal(
    manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_HAVE_ITEM").currentAmount,
    0,
  );
  manager.syncCurrentInventory({ T0007: 1 });
  assert.equal(
    manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_HAVE_ITEM").completed,
    true,
  );
  assert.equal(manager.getQuestState("QUEST_TEST"), "completed");
});

test("遊戲載入與每次背包狀態變更都同步目前持有量任務", () => {
  assert.match(
    movementLabSource,
    /questRuntimeManagerRef\.current\.syncCurrentInventory\(loadedInventory\)/,
  );
  assert.match(
    movementLabSource,
    /playerInventoryRef\.current = playerInventory;[\s\S]*?syncCurrentInventory\(playerInventory\)/,
  );
  assert.match(
    movementLabSource,
    /replaceSaveData\(plan\.questSave, false\);\s*manager\.syncCurrentInventory\(plan\.inventory\)/,
  );
});

test("a required objective completion flow must finish before the next stage activates", async () => {
  const gatedDocument = structuredClone(document);
  const quest = gatedDocument.quests[0];
  quest.rewardItemId = "";
  quest.rewardItemAmount = 0;
  quest.stages = [
    {
      id: "QUEST_TEST_STAGE_BEFORE_DIALOGUE",
      name: "對話前階段",
      completionMode: "all",
      nextStageId: "QUEST_TEST_STAGE_AFTER_DIALOGUE",
      objectives: [{
        id: "QUEST_TEST_OBJ_DIALOGUE_HANDOFF",
        displayText: "完成互動並播放銜接對話",
        type: "puzzleCompleted",
        targetId: "puzzle-before-dialogue",
        requiredAmount: 1,
        countMode: "accumulated",
        interactionMode: "succeeded",
        completionEventFlowId: "chapter03-section-8",
      }],
    },
    {
      id: "QUEST_TEST_STAGE_AFTER_DIALOGUE",
      name: "對話後階段",
      completionMode: "all",
      objectives: [{
        id: "QUEST_TEST_OBJ_FINAL",
        displayText: "完成最後互動",
        type: "puzzleCompleted",
        targetId: "puzzle-final",
        requiredAmount: 1,
        countMode: "accumulated",
        interactionMode: "succeeded",
      }],
    },
  ];

  let finishDialogue;
  const dialogueRuns = [];
  const dialogueResult = new Promise((resolve) => {
    finishDialogue = resolve;
  });
  const manager = new QuestRuntimeManager(gatedDocument, {
    runEventFlow: (eventFlowId) => {
      dialogueRuns.push(eventFlowId);
      return dialogueResult;
    },
  });

  manager.startQuest("QUEST_TEST");
  manager.handleEvent({
    type: "puzzleCompleted",
    targetId: "puzzle-before-dialogue",
  });
  assert.equal(
    manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_DIALOGUE_HANDOFF").completed,
    true,
  );
  assert.deepEqual(dialogueRuns, ["chapter03-section-8"]);
  assert.equal(manager.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_BEFORE_DIALOGUE");

  finishDialogue(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(manager.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_AFTER_DIALOGUE");

  manager.handleEvent({ type: "puzzleCompleted", targetId: "puzzle-final" });
  assert.equal(manager.getQuestState("QUEST_TEST"), "completed");
});

test("unfinished Objective dialogue retries after reload and repairs legacy saves", async () => {
  const recoveryDocument = structuredClone(document);
  const sourceQuest = recoveryDocument.quests[0];
  sourceQuest.rewardItemId = "";
  sourceQuest.rewardItemAmount = 0;
  sourceQuest.stages = [{
    id: "QUEST_TEST_STAGE_RECOVERY",
    name: "Completion dialogue recovery",
    completionMode: "all",
    objectives: [{
      id: "QUEST_TEST_OBJ_RECOVERY",
      displayText: "播放完成對話",
      type: "interactionSucceeded",
      targetId: "interaction-recovery",
      requiredAmount: 1,
      countMode: "accumulated",
      interactionMode: "succeeded",
      completionDelaySeconds: 0,
      completionEventFlowId: "chapter03-section-recovery",
    }],
  }];
  recoveryDocument.quests.push({
    id: "QUEST_TEST_NEXT",
    name: "對話後任務",
    description: "",
    chapterId: "CH03",
    type: "main",
    prerequisiteQuestIds: [],
    grantMethod: "afterDialogue",
    grantSourceId: "chapter03-section-recovery",
    canAbandon: false,
    canReaccept: false,
    displayMode: "standard",
    rewardItemId: "",
    rewardItemAmount: 0,
    stages: [],
  });

  const firstRuns = [];
  const neverFinishes = new Promise(() => {});
  const firstManager = new QuestRuntimeManager(recoveryDocument, {
    runEventFlow: (eventFlowId) => {
      firstRuns.push(eventFlowId);
      return neverFinishes;
    },
  });
  firstManager.startQuest("QUEST_TEST");
  firstManager.handleEvent({
    type: "interactionSucceeded",
    targetId: "interaction-recovery",
  });
  const interruptedSave = firstManager.exportSave();
  assert.deepEqual(firstRuns, ["chapter03-section-recovery"]);
  assert.equal(
    interruptedSave.quests.QUEST_TEST.objectives.QUEST_TEST_OBJ_RECOVERY
      .completionEventCompleted,
    false,
  );

  const retryRuns = [];
  const restored = new QuestRuntimeManager(recoveryDocument, {
    runEventFlow: (eventFlowId) => {
      retryRuns.push(eventFlowId);
      return true;
    },
  }, interruptedSave);
  await Promise.resolve();
  assert.deepEqual(retryRuns, ["chapter03-section-recovery"]);
  assert.equal(
    restored.exportSave().quests.QUEST_TEST.objectives.QUEST_TEST_OBJ_RECOVERY
      .completionEventCompleted,
    true,
  );

  const legacySave = structuredClone(interruptedSave);
  delete legacySave.quests.QUEST_TEST.objectives.QUEST_TEST_OBJ_RECOVERY
    .completionEventCompleted;
  const legacyRuns = [];
  const migrated = new QuestRuntimeManager(recoveryDocument, {
    runEventFlow: (eventFlowId) => {
      legacyRuns.push(eventFlowId);
      return true;
    },
  }, legacySave);
  await Promise.resolve();
  assert.deepEqual(legacyRuns, ["chapter03-section-recovery"]);
  assert.equal(
    migrated.exportSave().quests.QUEST_TEST.objectives.QUEST_TEST_OBJ_RECOVERY
      .completionEventCompleted,
    true,
  );
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

test("stage transition advances immediately while objective completion signals only once", () => {
  const completedObjectives = [];
  const transitions = [];
  const completionDocument = structuredClone(document);
  completionDocument.quests[0].stages[0].completionPresentationDelaySeconds = 9;
  completionDocument.quests[0].stages[1].startPresentationDelaySeconds = 9;
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
    onStageTransitionStarted: (questId, currentStageId, nextStageId) => {
      transitions.push([questId, currentStageId, nextStageId]);
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
  assert.equal(manager.getCurrentStage("QUEST_TEST"), "QUEST_TEST_STAGE_02");

  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 1 });
  assert.equal(completedObjectives.length, 1);
  assert.equal(transitions.length, 1);

});

test("stage completion delay waits before requesting the existing NEXT UI transition", () => {
  const completionDocument = structuredClone(document);
  completionDocument.quests[0].stages[0].completionDelaySeconds = 3;
  let now = 1000;
  const scheduled = [];
  const transitions = [];
  const manager = new QuestRuntimeManager(completionDocument, {
    now: () => now,
    scheduleQuestStart: (delayMilliseconds, callback) => {
      scheduled.push({ at: now + delayMilliseconds, callback });
    },
    onStageTransitionStarted: (questId, currentStageId, nextStageId) => {
      transitions.push([questId, currentStageId, nextStageId]);
    },
  });

  manager.startQuest("QUEST_TEST");
  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 2 });
  assert.equal(manager.getObjectiveProgress("QUEST_TEST", "QUEST_TEST_OBJ_01").completed, true);
  assert.equal(manager.exportSave().quests.QUEST_TEST.stageCompletionAvailableAtEpochMs, 4000);
  assert.deepEqual(transitions, []);

  now = 4000;
  for (const task of scheduled.splice(0)) task.callback();
  assert.deepEqual(transitions, [
    ["QUEST_TEST", "QUEST_TEST_STAGE_01", "QUEST_TEST_STAGE_02"],
  ]);
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

test("quest completion waits for COMPLETE UI, then delays a dialogue and grants the next quest", async () => {
  const completionDocument = structuredClone(document);
  const firstQuest = completionDocument.quests[0];
  firstQuest.id = "QUEST_FIRST";
  firstQuest.stages = [];
  firstQuest.rewardItemId = "";
  firstQuest.rewardItemAmount = 0;
  firstQuest.completionTriggerType = "dialogue";
  firstQuest.completionTriggerId = "chapter03-section-2";
  firstQuest.completionTriggerDelaySeconds = 3;

  const nextQuest = structuredClone(firstQuest);
  nextQuest.id = "QUEST_NEXT";
  nextQuest.name = "下一個任務";
  nextQuest.prerequisiteQuestIds = [firstQuest.id];
  nextQuest.grantMethod = "afterDialogue";
  nextQuest.grantSourceId = "chapter03-section-2";
  nextQuest.completionTriggerType = "none";
  nextQuest.completionTriggerId = "";
  nextQuest.completionTriggerDelaySeconds = 0;
  completionDocument.quests = [firstQuest, nextQuest];

  let now = 1000;
  const scheduled = [];
  const triggers = [];
  let completePresentation;
  let manager;
  manager = new QuestRuntimeManager(completionDocument, {
    now: () => now,
    scheduleQuestStart: (delayMilliseconds, callback) => {
      scheduled.push({ at: now + delayMilliseconds, callback });
    },
    runCompletionTrigger: async (type, triggerId, sourceQuestId) => {
      triggers.push([type, triggerId, sourceQuestId]);
      manager.startAvailableAfterDialogueQuests(triggerId, 3, 600);
      return true;
    },
    onQuestCompleted: (_questId, _entry, complete) => {
      completePresentation = complete;
    },
  });

  manager.completeQuest(firstQuest.id);
  assert.equal(manager.getQuestState(firstQuest.id), "completed");
  assert.equal(manager.getQuestState(nextQuest.id), "available");
  assert.equal(
    manager.exportSave().quests[firstQuest.id].completionTriggerAvailableAtEpochMs,
    undefined,
  );
  assert.equal(scheduled.length, 0);
  assert.deepEqual(triggers, []);

  now = 5000;
  completePresentation();
  assert.equal(manager.exportSave().quests[firstQuest.id].completionTriggerAvailableAtEpochMs, 8000);

  now = 7999;
  for (const task of scheduled.filter((task) => task.at <= now)) task.callback();
  assert.deepEqual(triggers, []);

  now = 8000;
  for (const task of scheduled.splice(0).filter((task) => task.at <= now)) task.callback();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(triggers, [["dialogue", "chapter03-section-2", firstQuest.id]]);
  assert.equal(manager.getQuestState(nextQuest.id), "active");
  assert.equal(manager.exportSave().quests[firstQuest.id].completionTriggerCompleted, true);
});

test("quest, stage and objective lifecycle teleports fire once with their own delays", () => {
  const teleportDocument = structuredClone(document);
  const quest = teleportDocument.quests[0];
  quest.startTeleportPointId = "quest-start";
  quest.startTeleportDelaySeconds = 0.1;
  quest.completionTeleportPointId = "quest-complete";
  quest.completionTeleportDelaySeconds = 0.2;
  quest.rewardItemId = "";
  quest.rewardItemAmount = 0;
  quest.stages = [structuredClone(quest.stages[0])];
  const stage = quest.stages[0];
  stage.nextStageId = "";
  stage.startTeleportPointId = "stage-start";
  stage.startTeleportDelaySeconds = 0.3;
  stage.completionTeleportPointId = "stage-complete";
  stage.completionTeleportDelaySeconds = 0.4;
  const objective = stage.objectives[0];
  objective.startTeleportPointId = "objective-start";
  objective.startTeleportDelaySeconds = 0.5;
  objective.completionTeleportPointId = "objective-complete";
  objective.completionTeleportDelaySeconds = 0.6;

  const teleports = [];
  const manager = new QuestRuntimeManager(teleportDocument, {
    requestTeleport: (pointId, delayMilliseconds, source) => {
      teleports.push([pointId, delayMilliseconds, source]);
    },
  });

  manager.startQuest(quest.id);
  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 2 });
  manager.handleEvent({ type: "itemCollected", targetId: "R0001", amount: 1 });

  assert.deepEqual(teleports, [
    ["quest-start", 100, { questId: quest.id, phase: "start" }],
    ["stage-start", 300, { questId: quest.id, stageId: stage.id, phase: "start" }],
    ["objective-start", 500, {
      questId: quest.id,
      stageId: stage.id,
      objectiveId: objective.id,
      phase: "start",
    }],
    ["objective-complete", 600, {
      questId: quest.id,
      stageId: stage.id,
      objectiveId: objective.id,
      phase: "completion",
    }],
    ["stage-complete", 400, {
      questId: quest.id,
      stageId: stage.id,
      phase: "completion",
    }],
    ["quest-complete", 200, { questId: quest.id, phase: "completion" }],
  ]);
});

test("interaction item submissions keep objective order while allowing out-of-order completion", () => {
  const submissionDocument = structuredClone(document);
  const quest = submissionDocument.quests[0];
  quest.rewardItemId = "";
  quest.rewardItemAmount = 0;
  quest.stages = [
    {
      id: "QUEST_TEST_STAGE_SUBMISSION",
      name: "安裝通訊陣列零件",
      completionMode: "all",
      objectives: [
        {
          id: "QUEST_TEST_OBJ_R0013",
          displayText: "安裝通訊陣列面板",
          type: "submitItemAtInteraction",
          targetId: "scene3-interaction-023",
          itemRequirements: [{ itemId: "R0013", requiredAmount: 1 }],
          requiredAmount: 1,
          countMode: "accumulated",
          interactionMode: "succeeded",
          showProgress: false,
          showHintIcon: false,
        },
        {
          id: "QUEST_TEST_OBJ_R0014",
          displayText: "安裝量子傳輸器",
          type: "submitItemAtInteraction",
          targetId: "scene3-interaction-023",
          itemRequirements: [{ itemId: "R0014", requiredAmount: 1 }],
          requiredAmount: 1,
          countMode: "accumulated",
          interactionMode: "succeeded",
          showProgress: false,
          showHintIcon: false,
        },
        {
          id: "QUEST_TEST_OBJ_R0015",
          displayText: "安裝校正元件",
          type: "submitItemAtInteraction",
          targetId: "scene3-interaction-023",
          itemRequirements: [{ itemId: "R0015", requiredAmount: 1 }],
          requiredAmount: 1,
          countMode: "accumulated",
          interactionMode: "succeeded",
          showProgress: false,
          showHintIcon: false,
        },
      ],
    },
  ];

  const manager = new QuestRuntimeManager(submissionDocument);
  manager.startQuest(quest.id);

  assert.deepEqual(
    manager
      .getActiveItemSubmissionObjectives("scene3-interaction-023")
      .map((entry) => entry.objective.itemRequirements[0].itemId),
    ["R0013", "R0014", "R0015"],
  );

  manager.handleEvent({
    type: "itemSubmitted",
    targetId: "scene3-interaction-023",
    itemId: "R0014",
    amount: 1,
    eventId: "submit-r0014",
  });

  assert.equal(
    manager.getObjectiveProgress(quest.id, "QUEST_TEST_OBJ_R0014").completed,
    true,
  );
  assert.equal(
    manager.getObjectiveProgress(quest.id, "QUEST_TEST_OBJ_R0013").completed,
    false,
  );
  assert.deepEqual(
    manager
      .getActiveItemSubmissionObjectives("scene3-interaction-023")
      .map((entry) => entry.objective.itemRequirements[0].itemId),
    ["R0013", "R0015"],
  );
  assert.deepEqual(
    manager
      .getCurrentItemSubmissionObjectives("scene3-interaction-023")
      .map((entry) => ({
        itemId: entry.objective.itemRequirements[0].itemId,
        completed: entry.progress.completed,
      })),
    [
      { itemId: "R0013", completed: false },
      { itemId: "R0014", completed: true },
      { itemId: "R0015", completed: false },
    ],
  );

  manager.handleEvent({
    type: "itemSubmitted",
    targetId: "scene3-interaction-023",
    itemId: "R0013",
    amount: 1,
    eventId: "submit-r0013",
  });
  manager.handleEvent({
    type: "itemSubmitted",
    targetId: "scene3-interaction-023",
    itemId: "R0015",
    amount: 1,
    eventId: "submit-r0015",
  });

  assert.equal(manager.getQuestState(quest.id), "completed");

  const submissionOrders = [
    ["R0013", "R0014", "R0015"],
    ["R0013", "R0015", "R0014"],
    ["R0014", "R0013", "R0015"],
    ["R0014", "R0015", "R0013"],
    ["R0015", "R0013", "R0014"],
    ["R0015", "R0014", "R0013"],
  ];
  for (const [runIndex, submissionOrder] of submissionOrders.entries()) {
    const repeatedManager = new QuestRuntimeManager(submissionDocument);
    repeatedManager.startQuest(quest.id);
    for (const [submissionIndex, itemId] of submissionOrder.entries()) {
      repeatedManager.handleEvent({
        type: "itemSubmitted",
        targetId: "scene3-interaction-023",
        itemId,
        amount: 1,
        eventId: `repeat-${runIndex}-${itemId}`,
      });
      if (submissionIndex < submissionOrder.length - 1) {
        const currentVisualStates = repeatedManager
          .getCurrentItemSubmissionObjectives("scene3-interaction-023")
          .map((entry) => entry.progress.completed);
        assert.equal(
          currentVisualStates.filter(Boolean).length,
          submissionIndex + 1,
          `第 ${runIndex + 1} 輪第 ${submissionIndex + 1} 次投入應增加一格完成狀態`,
        );
        assert.equal(
          repeatedManager.getActiveItemSubmissionObjectives("scene3-interaction-023").length,
          submissionOrder.length - submissionIndex - 1,
        );
      }
    }
    assert.equal(repeatedManager.getQuestState(quest.id), "completed");
  }
});
