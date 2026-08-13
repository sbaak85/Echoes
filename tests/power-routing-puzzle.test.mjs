import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  POWER_ROUTING_CAPACITY,
  POWER_ROUTING_INTERACTION_ID,
  createInitialPowerRoutingState,
  evaluatePowerRouting,
  movePowerRoutingMenuTarget,
  togglePowerRoutingDevice,
} from "../app/power-routing-puzzle.ts";

test("解謎手把選取依設備順序移動，並可移到確認供電", () => {
  assert.equal(movePowerRoutingMenuTarget("workbenchCore", -1), "workbenchCore");
  assert.equal(movePowerRoutingMenuTarget("workbenchCore", 1), "dataTerminal");
  assert.equal(movePowerRoutingMenuTarget("heater", 1), "coolingLoop");
  assert.equal(movePowerRoutingMenuTarget("coolingLoop", 1), "apply");
  assert.equal(movePowerRoutingMenuTarget("apply", 1), "apply");
  assert.equal(movePowerRoutingMenuTarget("apply", -1), "coolingLoop");
});

test("備用電力目前只有 3 UNIT，起始 6 UNIT 負載必定過載", () => {
  const evaluation = evaluatePowerRouting(createInitialPowerRoutingState());
  assert.equal(POWER_ROUTING_CAPACITY, 3);
  assert.equal(evaluation.load, 6);
  assert.equal(evaluation.overloaded, true);
  assert.equal(evaluation.success, false);
  assert.deepEqual(
    evaluation.missingRequired.map((device) => device.id),
    ["workbenchCore", "coolingLoop"],
  );
});

test("三個關鍵系統需要 6 UNIT，目前 3 UNIT 電量仍無法完成供電", () => {
  const correct = {
    workbenchCore: true,
    dataTerminal: true,
    coolingLoop: true,
    lighting: false,
    heater: false,
  };
  const evaluation = evaluatePowerRouting(correct);
  assert.equal(evaluation.load, 6);
  assert.equal(evaluation.statusTitle, "電力過載");
  assert.equal(evaluation.overloaded, true);
  assert.equal(evaluation.success, false);

  const poweredEvaluation = evaluatePowerRouting(correct, 7);
  assert.equal(poweredEvaluation.capacity, 7);
  assert.equal(poweredEvaluation.load, 6);
  assert.equal(poweredEvaluation.statusTitle, "供電穩定");
  assert.equal(poweredEvaluation.success, true);

  assert.equal(
    evaluatePowerRouting({ ...correct, lighting: true }).success,
    false,
  );
  assert.equal(
    evaluatePowerRouting({ ...correct, coolingLoop: false }).success,
    false,
  );
});

test("目前所有開關組合都無法解開謎題", () => {
  const deviceIds = [
    "workbenchCore",
    "dataTerminal",
    "coolingLoop",
    "lighting",
    "heater",
  ];
  for (let mask = 0; mask < 2 ** deviceIds.length; mask += 1) {
    const state = Object.fromEntries(
      deviceIds.map((deviceId, index) => [deviceId, Boolean(mask & (1 << index))]),
    );
    assert.equal(evaluatePowerRouting(state).success, false);
  }
});

test("interaction-012 會先開暫代選項視窗，再選擇電力分配或調頻", async () => {
  const [scene, movementLabSource, puzzleSource] = await Promise.all([
    readFile(new URL("../public/maps/map_test01.scene.json", import.meta.url), "utf8")
      .then(JSON.parse),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/power-routing-puzzle.tsx", import.meta.url), "utf8"),
  ]);
  assert.equal(POWER_ROUTING_INTERACTION_ID, "interaction-012");
  assert.ok(
    scene.interactables.some(
      (interactable) => interactable.id === POWER_ROUTING_INTERACTION_ID,
    ),
  );
  assert.match(
    movementLabSource,
    /interactable\.id === POWER_ROUTING_INTERACTION_ID/,
  );
  assert.match(movementLabSource, /openInteractionPuzzleSelection\(interactable, source\)/);
  assert.match(movementLabSource, /chooseInteractionPuzzle/);
  assert.match(movementLabSource, />電力分配小遊戲</);
  assert.match(movementLabSource, />調頻小遊戲</);
  assert.match(movementLabSource, /openPowerRoutingPuzzle\(session\.interactable, session\.source\)/);
  assert.match(movementLabSource, /openFrequencyCalibrationPuzzle\(\)/);
  assert.match(movementLabSource, /completePowerPuzzleInteractionRef\.current/);
  assert.match(puzzleSource, /useState\(createInitialPowerRoutingState\)/);
  assert.match(puzzleSource, /evaluatePowerRouting\(state, availablePower\)/);
  assert.match(movementLabSource, /availablePower=\{campPowerState\.current\}/);
  assert.match(puzzleSource, /useImperativeHandle\(controllerRef/);
  assert.match(puzzleSource, /data-gamepad-selected/);
  assert.match(movementLabSource, /powerPuzzleControllerRef\.current\?\.moveSelection/);
  assert.match(movementLabSource, /setSelectedDeviceActive/);
  assert.match(movementLabSource, /powerPuzzleControllerRef\.current\?\.activateSelection/);
  assert.match(movementLabSource, /powerPuzzleControllerRef\.current\?\.cancel/);
  assert.match(movementLabSource, /powerPuzzleDirectionalInputActive/);
  assert.match(movementLabSource, /powerPuzzleCursorRearmRequiredRef\.current = true/);
  assert.match(
    movementLabSource,
    /cursorInputLength >= OPTIONS_CURSOR_TAKEOVER_THRESHOLD/,
  );
  const dpadModeSource = movementLabSource.match(
    /const activatePowerPuzzleDpadMode = \(\) => \{[\s\S]*?\n    \};/,
  )?.[0] ?? "";
  assert.match(dpadModeSource, /virtualCursorVisible = true/);
  assert.match(dpadModeSource, /activateGamepadCursor\(\)/);
  assert.doesNotMatch(dpadModeSource, /deactivateGamepadCursor\(\)/);
  assert.match(movementLabSource, /powerPuzzleCursorShownForSession/);
  assert.match(
    movementLabSource,
    /\.power-device-row\[data-device-id\]/,
  );
  assert.match(puzzleSource, /event\.stopPropagation\(\)/);
  assert.match(
    movementLabSource,
    /className={`cursor-layer\$\{powerPuzzleOpen \|\| campPowerConfirmationOpen \? " is-over-modal" : ""\}`}/,
  );
  assert.doesNotMatch(puzzleSource, /power-device-kind/);
  assert.match(puzzleSource, /is-unavailable/);
  assert.match(puzzleSource, /系統類型/);
});
