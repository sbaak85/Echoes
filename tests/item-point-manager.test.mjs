import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialItemPointProgress,
  isItemPointAvailable,
  normalizeSceneItemPoints,
  recordItemPointCollected,
} from "../app/item-point-manager.ts";

const resolveItemId = (id) => id === "R0001" ? id : null;

test("ItemPoint keeps one item, quantity, policy and minimap flag", () => {
  const [point] = normalizeSceneItemPoints([{
    id: "item-point-001",
    label: "測試晶體",
    x: 120,
    y: 240,
    itemId: "R0001",
    quantity: 3,
    spawnPolicy: "daily",
    showOnMinimap: true,
  }], resolveItemId, "Scene_Test");
  assert.deepEqual(point, {
    sceneId: "Scene_Test",
    id: "item-point-001",
    label: "測試晶體",
    x: 120,
    y: 240,
    itemId: "R0001",
    quantity: 3,
    spawnPolicy: "daily",
    showOnMinimap: true,
  });
});

test("once ItemPoint stays collected while daily ItemPoint returns next 06:00 cycle", () => {
  const session = new Set();
  let progress = createInitialItemPointProgress();
  const oncePoint = {
    sceneId: "Scene_A",
    id: "once",
    label: "一次",
    x: 1,
    y: 1,
    itemId: "R0001",
    quantity: 1,
    spawnPolicy: "once",
    showOnMinimap: false,
  };
  progress = recordItemPointCollected(oncePoint, progress, 360, session);
  assert.equal(isItemPointAvailable(oncePoint, progress, 360, session), false);
  assert.equal(isItemPointAvailable(oncePoint, progress, 1800, session), false);

  const dailyPoint = { ...oncePoint, id: "daily", spawnPolicy: "daily" };
  progress = recordItemPointCollected(dailyPoint, progress, 360, session);
  assert.equal(isItemPointAvailable(dailyPoint, progress, 360, session), false);
  assert.equal(isItemPointAvailable(dailyPoint, progress, 360 + 1440, session), true);
});

test("scene-entry ItemPoint returns only after a new scene session", () => {
  const point = {
    sceneId: "Scene_A",
    id: "scene",
    label: "進圖",
    x: 1,
    y: 1,
    itemId: "R0001",
    quantity: 1,
    spawnPolicy: "sceneEntry",
    showOnMinimap: true,
  };
  const progress = createInitialItemPointProgress();
  const session = new Set();
  recordItemPointCollected(point, progress, 360, session);
  assert.equal(isItemPointAvailable(point, progress, 360, session), false);
  assert.equal(isItemPointAvailable(point, progress, 360, new Set()), true);
});

test("ItemPoint stage requirements gate spawn before existing spawn policy", () => {
  const [currentOnly, unlocked] = normalizeSceneItemPoints([
    {
      id: "current-stage",
      label: "指定階段",
      x: 1,
      y: 1,
      itemId: "R0001",
      quantity: 1,
      spawnPolicy: "daily",
      showOnMinimap: true,
      spawnRequirement: {
        questId: "QUEST_001",
        stageId: "QUEST_001_STAGE_02",
        stageMode: "CurrentStageOnly",
      },
    },
    {
      id: "unlock-stage",
      label: "到達後持續",
      x: 2,
      y: 2,
      itemId: "R0001",
      quantity: 1,
      spawnPolicy: "once",
      showOnMinimap: false,
      spawnRequirement: {
        questId: "QUEST_001",
        stageId: "QUEST_001_STAGE_02",
        stageMode: "UnlockFromStage",
      },
    },
  ], resolveItemId, "Scene_A");
  const progress = createInitialItemPointProgress();
  const session = new Set();
  const stage2 = {
    isQuestAtStage: (_questId, stageId) => stageId === "QUEST_001_STAGE_02",
    hasQuestReachedStage: () => true,
  };
  const stage3 = {
    isQuestAtStage: () => false,
    hasQuestReachedStage: () => true,
  };

  assert.equal(isItemPointAvailable(currentOnly, progress, 360, session), false);
  assert.equal(isItemPointAvailable(currentOnly, progress, 360, session, stage2), true);
  assert.equal(isItemPointAvailable(currentOnly, progress, 360, session, stage3), false);
  assert.equal(isItemPointAvailable(unlocked, progress, 360, session, stage3), true);
});

test("相同 ItemPoint ID 在不同 Scene 會使用獨立的生成與拾取進度", () => {
  const sceneA = {
    sceneId: "Scene_A",
    id: "item-point-001",
    label: "Scene A Item",
    x: 1,
    y: 1,
    itemId: "R0001",
    quantity: 1,
    spawnPolicy: "once",
    showOnMinimap: false,
  };
  const sceneB = { ...sceneA, sceneId: "Scene_B", label: "Scene B Item" };
  const session = new Set();
  const progress = recordItemPointCollected(
    sceneA,
    createInitialItemPointProgress(),
    360,
    session,
  );

  assert.equal(isItemPointAvailable(sceneA, progress, 360, session), false);
  assert.equal(isItemPointAvailable(sceneB, progress, 360, session), true);
  assert.deepEqual(progress.onceCollectedIds, ["Scene_A:item-point-001"]);
});
