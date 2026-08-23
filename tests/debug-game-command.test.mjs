import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isDebugGameCommand,
  parseDebugGameCommand,
} from "../app/debug-game-command.ts";

test("debug game command accepts numbered minigames case-insensitively", () => {
  assert.deepEqual(parseDebugGameCommand("game 1"), { gameNumber: 1 });
  assert.deepEqual(parseDebugGameCommand(" Game 3 "), { gameNumber: 3 });
  assert.equal(parseDebugGameCommand("game"), null);
  assert.equal(parseDebugGameCommand("game x"), null);
  assert.equal(isDebugGameCommand("game x"), true);
  assert.equal(isDebugGameCommand("item all"), false);
});

test("movement lab wires Game 1 through Game 3 and remounts welding sessions", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /gameCommand\.gameNumber === 1/);
  assert.match(source, /gameCommand\.gameNumber === 2/);
  assert.match(source, /gameCommand\.gameNumber === 3/);
  assert.match(source, /setWeldingPuzzleSessionKey\(\(current\) => current \+ 1\)/);
  assert.match(source, /onFail=\{handleWeldingPuzzleFailure\}/);
  assert.match(source, /WELDING_FAILURE_MATERIAL_ITEM_ID = "R0009"/);
  assert.match(source, /removeInventoryItem\([\s\S]*WELDING_FAILURE_MATERIAL_ITEM_ID/);
  assert.match(source, /savePlayerInventory\(nextInventory\)/);
  assert.match(source, /焊接失敗，消耗「金屬碎片」/);
  assert.match(source, /powerPuzzleOpenRef\.current &&\s*!weldingPuzzleOpenRef\.current/);
  assert.match(source, /weldingPuzzleVirtualCursorAvailableRef = useRef\(false\)/);
  assert.match(source, /activateWeldingPuzzleDpadMode/);
  assert.match(source, /weldingPuzzleOpen && !weldingPuzzleVirtualCursorAvailable \? " is-hidden-for-welding"/);
  assert.match(
    source,
    /weldingPuzzleVirtualCursorAvailableRef\.current &&[\s\S]*powerPuzzleGamepadModeRef\.current === "cursor"[\s\S]*activateVirtualCursorUi\(\)/,
  );
  assert.match(source, /shouldHandleGamepadConfirm=\{shouldWeldingPuzzleHandleGamepadConfirm\}/);
});

test("debug command input recalls the last submitted command with ArrowUp", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /const lastDebugCommandRef = useRef\(""\)/);
  assert.match(source, /if \(command\.length > 0\) lastDebugCommandRef\.current = command/);
  assert.match(source, /event\.key === "ArrowUp" && lastDebugCommandRef\.current/);
  assert.match(source, /setDebugItemSpawnCommand\(recalledCommand\)/);
  assert.match(source, /input\.setSelectionRange\(recalledCommand\.length, recalledCommand\.length\)/);
});
