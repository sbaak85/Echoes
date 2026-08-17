import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getUnmetInteractionUseRequirements,
  normalizeInteractionUseRequirements,
} from "../app/interaction-flow.ts";
import { resolveItemId } from "../app/item-database.ts";

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (
      (currentPoint.y > point.y) !== (previousPoint.y > point.y) &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

test("Scene_2 石壁上下層各有一個位於不同 NavMesh 的傳送 Point", async () => {
  const scene = JSON.parse(
    await readFile(new URL("../public/maps/map_test02.scene.json", import.meta.url), "utf8"),
  );
  const upper = scene.teleportPoints.find(
    (point) => point.id === "teleport-point-scene2-cliff-upper",
  );
  const lower = scene.teleportPoints.find(
    (point) => point.id === "teleport-point-scene2-cliff-lower",
  );
  assert.ok(upper);
  assert.ok(lower);
  for (const point of [upper, lower]) {
    assert.equal(point.blackoutEnabled, true);
    assert.equal(point.blackoutFadeSeconds, 0.3);
    assert.equal(point.blackoutHoldSeconds, 0);
  }
  assert.deepEqual(
    scene.navMesh.filter((navMesh) => pointInPolygon(upper, navMesh.points)).map((navMesh) => navMesh.id),
    ["nav-001"],
  );
  assert.deepEqual(
    scene.navMesh.filter((navMesh) => pointInPolygon(lower, navMesh.points)).map((navMesh) => navMesh.id),
    ["nav-002"],
  );
});

test("Scene_2 兩個唯一 interaction ID 依任務階段開放並以繩索為不消耗條件互傳", async () => {
  const scene = JSON.parse(
    await readFile(new URL("../public/maps/map_test02.scene.json", import.meta.url), "utf8"),
  );
  const interactions = new Map(
    scene.interactables.map((interactable) => [interactable.id, interactable]),
  );
  const upper = interactions.get("scene2-interaction-001");
  const lower = interactions.get("scene2-interaction-002");
  assert.equal(
    upper.completionTeleportPointId,
    "teleport-point-scene2-cliff-lower",
  );
  assert.equal(
    lower.completionTeleportPointId,
    "teleport-point-scene2-cliff-upper",
  );

  for (const interactable of [upper, lower]) {
    const requirements = normalizeInteractionUseRequirements(
      interactable.useRequirements,
      resolveItemId,
    );
    const stageRequirement = requirements.find(
      (requirement) => requirement.kind === "questStage",
    );
    const itemRequirement = requirements.find(
      (requirement) => requirement.kind === "item",
    );
    assert.deepEqual(stageRequirement, {
      kind: "questStage",
      questId: "QUEST_CH03_MAIN_004",
      stageId: "QUEST_CH03_MAIN_004_STAGE_01",
      stageMode: "UnlockFromStage",
    });
    assert.deepEqual(itemRequirement, {
      kind: "item",
      itemId: "T0001",
      quantity: 1,
      ...(interactable.id === "scene2-interaction-001"
        ? { scope: "interaction" }
        : {}),
    });
    const inventory = { T0001: 1 };
    assert.deepEqual(
      getUnmetInteractionUseRequirements([itemRequirement], inventory, 3),
      [],
    );
    assert.deepEqual(inventory, { T0001: 1 });
  }
});

test("遊戲端與 MapEditor 都保留互動完成傳送欄位", async () => {
  const [movementSource, modelSource, editorSource] = await Promise.all([
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../MapEditor/SceneModels.cs", import.meta.url), "utf8"),
    readFile(new URL("../MapEditor/SurvivalEffectEditorForm.cs", import.meta.url), "utf8"),
  ]);
  assert.match(movementSource, /scheduleInteractionTeleport\(interactable\)/);
  assert.match(movementSource, /completionTeleportPointId/);
  assert.match(movementSource, /camera\.x = getCameraCoordinate/);
  assert.match(movementSource, /fadeBlackScreen\(255, fadeMilliseconds, teleportAtFullBlack\)/);
  assert.match(movementSource, /playerTeleportHandlerRef\.current = teleportPlayerWithTransition/);
  assert.match(modelSource, /CompletionTeleportPointId/);
  assert.match(modelSource, /BlackoutFadeSeconds/);
  assert.match(editorSource, /完成後傳送 Point/);
});
