import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ITEM_DEFINITIONS } from "../app/item-database.ts";
import { createNewGameProgress } from "../app/new-game-reset.ts";
import {
  buildQuestDebugScenarioPlan,
  isQuestDebugCommand,
  parseQuestDebugCommand,
  prepareQuestDebugItemAllInventory,
  validateQuestDebugConfiguration,
} from "../app/quest-debug-scenario.ts";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { QUEST_OBJECTIVE_COMPLETION_RULES } from "../app/chapter04-quest-flow.ts";

const questDocument = JSON.parse(
  readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"),
);
const movementLabSource = readFileSync(
  new URL("../app/movement-lab.tsx", import.meta.url),
  "utf8",
);
const sceneDocuments = [
  "map_test01.scene.json",
  "map_test02.scene.json",
  "map_scene_06B.scene.json",
].map((name) =>
  JSON.parse(readFileSync(new URL(`../public/maps/${name}`, import.meta.url), "utf8")),
);
const survivalEffects = Object.fromEntries(
  ITEM_DEFINITIONS.map((item) => [item.id, item.survivalEffects]),
);

function createState() {
  const progress = createNewGameProgress();
  return {
    questSave: { schemaVersion: 1, quests: {} },
    inventory: progress.inventory,
    survival: progress.survival,
    story: progress.story,
    interactionUsage: progress.interactionUsage,
    campPowerCurrent: progress.campPower.current,
  };
}

function build(command, state = createState()) {
  return buildQuestDebugScenarioPlan(questDocument, command, state, {
    itemSurvivalEffects: survivalEffects,
    objectiveCompletionRules: QUEST_OBJECTIVE_COMPLETION_RULES,
  });
}

test("Quest debug commands accept next, numeric goto, and stable IDs", () => {
  assert.equal(isQuestDebugCommand("Quest Goto 5 Stage 3"), true);
  assert.equal(isQuestDebugCommand("Item R0001"), false);
  assert.deepEqual(parseQuestDebugCommand("Quest Next"), { kind: "next" });
  assert.deepEqual(parseQuestDebugCommand("Quest Stage Next"), {
    kind: "stage-next",
  });
  assert.deepEqual(parseQuestDebugCommand("quest goto 5 stage 3"), {
    kind: "goto",
    questRef: "5",
    stageRef: "3",
  });
  assert.deepEqual(parseQuestDebugCommand("Quest Goto QUEST_CH03_MAIN_006"), {
    kind: "goto",
    questRef: "QUEST_CH03_MAIN_006",
  });
  assert.equal(parseQuestDebugCommand("Quest Goto"), null);
});

test("movement lab exposes Quest commands and the ] short/long press hotkey", () => {
  assert.match(movementLabSource, /parseQuestDebugCommand\(command\)/);
  assert.match(movementLabSource, /event\.code === "BracketRight"/);
  assert.match(movementLabSource, /createQuestSkipKeyController\(/);
  assert.match(
    movementLabSource,
    /debugItemSpawnHandlerRef\.current\("Quest Next"\)/,
  );
  assert.match(
    movementLabSource,
    /debugItemSpawnHandlerRef\.current\("Quest Stage Next"\)/,
  );
  assert.doesNotMatch(movementLabSource, /event\.code === "F8"/);
  assert.match(movementLabSource, /Quest Goto 5 Stage 3/);
  assert.match(movementLabSource, /prepareQuestDebugItemAllInventory\(/);
  assert.match(movementLabSource, /questDebugItemAllGrantedRef\.current = true/);
});

test("the first Quest debug jump applies Item All once", () => {
  const first = prepareQuestDebugItemAllInventory({ R0005: 2 }, false, false);
  assert.equal(first.applied, true);
  assert.equal(Object.keys(first.inventory).length, ITEM_DEFINITIONS.length);
  assert.equal(first.inventory.R0005, 3);
  for (const item of ITEM_DEFINITIONS) {
    assert.ok((first.inventory[item.id] ?? 0) >= 1);
  }

  const next = prepareQuestDebugItemAllInventory(first.inventory, true, false);
  assert.equal(next.applied, false);
  assert.equal(next.inventory, first.inventory);
  assert.equal(next.inventory.R0005, 3, "later Next commands must not stack Item All");

  const freshGoto = prepareQuestDebugItemAllInventory({ R0005: 2 }, true, true);
  assert.equal(freshGoto.applied, true);
  assert.equal(freshGoto.inventory.R0005, 3);
  assert.equal(Object.keys(freshGoto.inventory).length, ITEM_DEFINITIONS.length);
});

test("Quest Goto 3 builds the skipped outcomes without replaying quest flows", () => {
  const plan = build({ kind: "goto", questRef: "3" });
  assert.equal(plan.targetQuestId, "QUEST_CH03_MAIN_003");
  assert.equal(plan.targetStageId, "QUEST_CH03_MAIN_003_STAGE_01");
  assert.deepEqual(plan.completedQuestIds, [
    "QUEST_CH03_MAIN_001",
    "QUEST_CH03_MAIN_002",
  ]);
  assert.equal(plan.questSave.quests.QUEST_CH03_MAIN_001.state, "completed");
  assert.equal(plan.questSave.quests.QUEST_CH03_MAIN_002.state, "completed");
  assert.equal(plan.questSave.quests.QUEST_CH03_MAIN_003.state, "active");
  assert.equal(plan.story.storyFlags.QUEST_CH03_MAIN_001_COMPLETED, true);
  assert.equal(plan.story.storyFlags.QUEST_CH03_MAIN_002_COMPLETED, true);
  assert.ok(plan.story.completedEventIds.includes("chapter03-start-flow"));
  assert.ok(plan.story.completedEventIds.includes("story-zone:Scene_3:story-trigger-002"));
  assert.equal(plan.inventory.R0004, undefined);
  assert.equal(plan.survival.values.thirst, 100);
});

test("Quest Goto stage number uses displayed stage order including 02B", () => {
  const plan = build({ kind: "goto", questRef: "5", stageRef: "3" });
  assert.equal(plan.targetStageId, "QUEST_CH03_MAIN_005_STAGE_02B");
  const entry = plan.questSave.quests.QUEST_CH03_MAIN_005;
  assert.equal(entry.currentStageId, "QUEST_CH03_MAIN_005_STAGE_02B");
  assert.equal(entry.objectives.QUEST_CH03_MAIN_005_OBJ_01.completed, true);
  assert.equal(entry.objectives.QUEST_CH03_MAIN_005_OBJ_02.completed, true);
  assert.equal(entry.objectives.QUEST_CH03_MAIN_005_OBJ_03.completed, false);
});

test("Quest Stage Next completes only the current stage and preserves completion order", () => {
  const firstStage = build({ kind: "goto", questRef: "5", stageRef: "1" });
  const originalFirstQuestOrder =
    firstStage.questSave.quests.QUEST_CH03_MAIN_001.completedOrder;
  const secondStage = build({ kind: "stage-next" }, {
    ...createState(),
    questSave: firstStage.questSave,
    inventory: firstStage.inventory,
    survival: firstStage.survival,
    story: firstStage.story,
    interactionUsage: firstStage.interactionUsage,
    campPowerCurrent: firstStage.campPowerCurrent,
  });
  assert.equal(secondStage.targetQuestId, "QUEST_CH03_MAIN_005");
  assert.equal(secondStage.targetStageId, "QUEST_CH03_MAIN_005_STAGE_02");
  assert.equal(
    secondStage.questSave.quests.QUEST_CH03_MAIN_005.objectives
      .QUEST_CH03_MAIN_005_OBJ_01.completed,
    true,
  );
  assert.equal(
    secondStage.questSave.quests.QUEST_CH03_MAIN_005.objectives
      .QUEST_CH03_MAIN_005_OBJ_02.completed,
    false,
  );
  assert.ok(secondStage.interactionUsage.completedOnceIds.includes("interaction-021"));
  assert.equal(
    secondStage.questSave.quests.QUEST_CH03_MAIN_001.completedOrder,
    originalFirstQuestOrder,
  );
});

test("Quest Stage Next crosses from a final stage to the next quest Stage 1", () => {
  const finalStage = build({ kind: "goto", questRef: "5", stageRef: "7" });
  const nextQuest = build({ kind: "stage-next" }, {
    ...createState(),
    questSave: finalStage.questSave,
    inventory: finalStage.inventory,
    survival: finalStage.survival,
    story: finalStage.story,
    interactionUsage: finalStage.interactionUsage,
    campPowerCurrent: finalStage.campPowerCurrent,
  });
  assert.equal(nextQuest.questSave.quests.QUEST_CH03_MAIN_005.state, "completed");
  assert.equal(nextQuest.targetQuestId, "QUEST_CH03_MAIN_006");
  assert.equal(nextQuest.targetStageId, "QUEST_CH03_MAIN_006_STAGE_01");
});

test("Quest Stage Next crosses Chapter 3 into Chapter 4 and settles every Stage 1 requirement", async () => {
  const chapterThreeFinalStage = build({ kind: "goto", questRef: "6", stageRef: "3" });
  const chapterFourStageOne = build({ kind: "stage-next" }, {
    ...createState(),
    questSave: chapterThreeFinalStage.questSave,
    inventory: chapterThreeFinalStage.inventory,
    survival: chapterThreeFinalStage.survival,
    story: chapterThreeFinalStage.story,
    interactionUsage: chapterThreeFinalStage.interactionUsage,
    campPowerCurrent: chapterThreeFinalStage.campPowerCurrent,
  });
  assert.equal(chapterFourStageOne.questSave.quests.QUEST_CH03_MAIN_006.state, "completed");
  assert.equal(chapterFourStageOne.targetQuestId, "QUEST_CH04_MAIN_001");
  assert.equal(chapterFourStageOne.targetStageId, "QUEST_CH04_MAIN_001_STAGE_01");

  const chapterFourStageTwo = build({ kind: "stage-next" }, {
    ...createState(),
    questSave: chapterFourStageOne.questSave,
    inventory: chapterFourStageOne.inventory,
    survival: chapterFourStageOne.survival,
    story: chapterFourStageOne.story,
    interactionUsage: chapterFourStageOne.interactionUsage,
    campPowerCurrent: chapterFourStageOne.campPowerCurrent,
  });
  const chapterFourEntry = chapterFourStageTwo.questSave.quests.QUEST_CH04_MAIN_001;
  assert.equal(chapterFourStageTwo.targetStageId, "QUEST_CH04_MAIN_001_STAGE_02");
  for (const objectiveId of [
    "QUEST_CH04_MAIN_001_OBJ_01",
    "QUEST_CH04_MAIN_001_OBJ_02",
    "QUEST_CH04_MAIN_001_OBJ_03",
    "QUEST_CH04_MAIN_001_OBJ_13",
  ]) {
    assert.equal(chapterFourEntry.objectives[objectiveId].completed, true, objectiveId);
  }
  assert.ok(chapterFourStageTwo.inventory.T0004 >= 1);
  assert.ok(chapterFourStageTwo.inventory.R0004 >= 1);
  assert.ok(chapterFourStageTwo.inventory.R0005 >= 1);
  assert.ok(chapterFourStageTwo.story.completedEventIds.includes("chapter04-section-3"));
  assert.ok(chapterFourStageTwo.story.completedEventIds.includes("chapter04-section-1"));
  assert.equal(
    chapterFourEntry.objectiveCompletionRules["chapter04-preparation-complete"].completed,
    true,
  );

  const replayedFlows = [];
  const manager = new QuestRuntimeManager(questDocument, {
    objectiveCompletionRules: QUEST_OBJECTIVE_COMPLETION_RULES,
    scheduleQuestStart: (_delay, callback) => callback(),
    runEventFlow: (flowId) => {
      replayedFlows.push(flowId);
      return true;
    },
  });
  manager.replaceSaveData(chapterFourStageTwo.questSave, false);
  manager.handleEvent({
    type: "interactionSucceeded",
    targetId: "scene6-interaction-009",
    eventId: "debug-stage-two-first-interaction",
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(replayedFlows.includes("chapter04-section-1"), false);
});

test("Quest Goto 6 Stage 2 materializes the implicit chain and required welding items", () => {
  const plan = build({ kind: "goto", questRef: "6", stageRef: "2" });
  assert.deepEqual(plan.completedQuestIds, [
    "QUEST_CH03_MAIN_001",
    "QUEST_CH03_MAIN_002",
    "QUEST_CH03_MAIN_003",
    "QUEST_CH03_MAIN_004",
    "QUEST_CH03_MAIN_005",
  ]);
  assert.equal(plan.targetStageId, "QUEST_CH03_MAIN_006_STAGE_02");
  assert.equal(plan.questSave.quests.QUEST_CH03_MAIN_006.state, "active");
  assert.equal(plan.questSave.quests.QUEST_CH03_MAIN_006.objectives.QUEST_CH03_MAIN_006_OBJ_01.completed, true);
  assert.equal(plan.inventory.R0013, undefined);
  assert.equal(plan.inventory.R0014, undefined);
  assert.equal(plan.inventory.R0015, undefined);
  assert.equal(plan.inventory.T0007, 1);
  assert.equal(plan.inventory.R0009, 1);
  assert.equal(plan.campPowerCurrent, 7);
  assert.ok(plan.interactionUsage.completedOnceIds.includes("scene3-interaction-023"));
});

test("Quest Goto 6 Stage 3 settles welding and section-8 before enabling calibration", () => {
  const plan = build({ kind: "goto", questRef: "6", stageRef: "3" });
  assert.equal(plan.targetStageId, "QUEST_CH03_MAIN_006_STAGE_03");
  assert.equal(
    plan.questSave.quests.QUEST_CH03_MAIN_006.objectives
      .QUEST_CH03_MAIN_006_OBJ_04.completed,
    true,
  );
  assert.ok(plan.interactionUsage.completedOnceIds.includes("scene3-interaction-024"));
  assert.ok(plan.story.completedEventIds.includes("chapter03-section-8"));
  assert.equal(
    plan.questSave.quests.QUEST_CH03_MAIN_006.objectives
      .QUEST_CH03_MAIN_006_OBJ_05.completed,
    false,
  );
});

test("explicit Scenario metadata covers interaction, survival, time, spawn, and teleport state", () => {
  const state = createState();
  const plan = buildQuestDebugScenarioPlan(
    questDocument,
    { kind: "goto", questRef: "1" },
    state,
    {
      itemSurvivalEffects: survivalEffects,
      metadata: [{
        questId: "QUEST_CH03_MAIN_001",
        startOutcome: {
          completedInteractionIds: ["interaction-008"],
          survivalValues: { stamina: 65, spirit: 72 },
          gameMinutes: 1234,
          worldSpawns: [{ itemId: "R0009", quantity: 2 }],
          teleportPointId: "scene3-map-center",
        },
      }],
    },
  );
  assert.ok(plan.interactionUsage.completedOnceIds.includes("interaction-008"));
  assert.equal(plan.survival.values.stamina, 65);
  assert.equal(plan.survival.values.spirit, 72);
  assert.equal(plan.survival.gameMinutes, 1234);
  assert.deepEqual(plan.worldSpawns, [{ itemId: "R0009", quantity: 2 }]);
  assert.equal(plan.teleportPointId, "scene3-map-center");
});

test("Quest Next advances from the current active main quest", () => {
  const first = build({ kind: "goto", questRef: "1" });
  const next = build(
    { kind: "next" },
    {
      ...createState(),
      questSave: first.questSave,
      inventory: first.inventory,
      survival: first.survival,
      story: first.story,
      interactionUsage: first.interactionUsage,
      campPowerCurrent: first.campPowerCurrent,
    },
  );
  assert.equal(next.targetQuestId, "QUEST_CH03_MAIN_002");
  assert.equal(next.questSave.quests.QUEST_CH03_MAIN_001.state, "completed");
  assert.equal(next.questSave.quests.QUEST_CH03_MAIN_002.state, "active");
});

test("Quest Next does not reapply outcomes from quests already completed in the save", () => {
  const state = createState();
  state.survival.values.thirst = 40;
  const first = build({ kind: "goto", questRef: "1" }, state);
  const toSecond = build({ kind: "next" }, {
    ...state,
    questSave: first.questSave,
    inventory: first.inventory,
    survival: first.survival,
    story: first.story,
    interactionUsage: first.interactionUsage,
  });
  const toThird = build({ kind: "next" }, {
    ...state,
    questSave: toSecond.questSave,
    inventory: toSecond.inventory,
    survival: toSecond.survival,
    story: toSecond.story,
    interactionUsage: toSecond.interactionUsage,
  });
  assert.equal(toThird.survival.values.thirst, 70);
  const toFourth = build({ kind: "next" }, {
    ...state,
    questSave: toThird.questSave,
    inventory: toThird.inventory,
    survival: toThird.survival,
    story: toThird.story,
    interactionUsage: toThird.interactionUsage,
  });
  assert.equal(toFourth.survival.values.thirst, 70);
});

test("scenario snapshot can replace runtime state without firing start/completion callbacks", () => {
  const plan = build({ kind: "goto", questRef: "5", stageRef: "3" });
  const starts = [];
  const completions = [];
  const changes = [];
  const manager = new QuestRuntimeManager(questDocument, {
    onQuestStarted: (questId) => starts.push(questId),
    onQuestCompleted: (questId) => completions.push(questId),
    onStateChanged: (questId) => changes.push(questId),
  });
  manager.replaceSaveData(plan.questSave);
  assert.equal(manager.getQuestState("QUEST_CH03_MAIN_005"), "active");
  assert.equal(manager.getCurrentStage("QUEST_CH03_MAIN_005"), "QUEST_CH03_MAIN_005_STAGE_02B");
  assert.deepEqual(starts, []);
  assert.deepEqual(completions, []);
  assert.equal(changes.length, questDocument.quests.length);
});

test("validator reports malformed quest references while keeping valid scenarios usable", () => {
  const interactionIds = new Set(
    sceneDocuments.flatMap((scene) => (scene.interactables ?? []).map((entry) => entry.id)),
  );
  const issues = validateQuestDebugConfiguration(questDocument, undefined, {
    interactionIds,
    itemIds: new Set(ITEM_DEFINITIONS.map((item) => item.id)),
  });
  assert.equal(
    issues.some(
      (issue) =>
        issue.code === "missing-objective-target" &&
        issue.objectiveId === "QUEST_CH03_MAIN_006_OBJ_05",
    ),
    false,
  );
  assert.equal(
    issues.some(
      (issue) =>
        issue.severity === "error" &&
        issue.objectiveId === "QUEST_CH04_MAIN_001_OBJ_04",
    ),
    false,
  );
  assert.equal(
    issues.some(
      (issue) =>
        issue.severity === "warning" &&
        issue.code === "missing-objective-target" &&
        issue.objectiveId === "QUEST_CH04_MAIN_001_OBJ_05",
    ),
    false,
  );
  assert.equal(
    issues.some((issue) => issue.code === "unknown-scenario-item"),
    false,
  );
});
