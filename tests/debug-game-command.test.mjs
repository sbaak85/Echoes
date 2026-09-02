import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isDebugDeathCommand,
  isDebugGameCommand,
  parseDebugGameCommand,
} from "../app/debug-game-command.ts";

test("debug death command accepts only dead case-insensitively", () => {
  assert.equal(isDebugDeathCommand("dead"), true);
  assert.equal(isDebugDeathCommand(" DEAD "), true);
  assert.equal(isDebugDeathCommand("dead now"), false);
  assert.equal(isDebugDeathCommand("game 3"), false);
});

test("debug game command accepts numbered minigames case-insensitively", () => {
  assert.deepEqual(parseDebugGameCommand("game 1"), { gameNumber: 1 });
  assert.deepEqual(parseDebugGameCommand(" Game 3 "), { gameNumber: 3 });
  assert.equal(parseDebugGameCommand("game"), null);
  assert.equal(parseDebugGameCommand("game x"), null);
  assert.equal(isDebugGameCommand("game x"), true);
  assert.equal(isDebugGameCommand("item all"), false);
});

test("movement lab wires Game 1 through Game 4 and remounts welding sessions", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /gameCommand\.gameNumber === 1/);
  assert.match(source, /gameCommand\.gameNumber === 2/);
  assert.match(source, /gameCommand\.gameNumber === 3/);
  assert.match(source, /gameCommand\.gameNumber === 4/);
  assert.match(source, /openStarCardsGame\(\)/);
  assert.match(source, /<StarCardsGame[\s\S]*onClose=\{closeStarCardsGame\}/);
  assert.match(source, /setWeldingPuzzleSessionKey\(\(current\) => current \+ 1\)/);
  assert.match(source, /onFail=\{handleWeldingPuzzleFailure\}/);
  assert.match(source, /WELDING_FAILURE_MATERIAL_ITEM_ID = "R0009"/);
  assert.match(source, /removeInventoryItem\([\s\S]*WELDING_FAILURE_MATERIAL_ITEM_ID/);
  assert.match(source, /savePlayerInventory\(nextInventory\)/);
  assert.match(source, /焊接失敗，消耗「金屬碎片」/);
  assert.match(source, /isDebugDeathCommand\(command\)/);
  assert.match(
    source,
    /prepareDebugNaturalDeathFinalMoment\([\s\S]*"thirst"/,
  );
  assert.match(source, /saveSurvivalState\(nextSurvival\)/);
  assert.match(
    source,
    /survivalStateRef\.current\.gameOverReason[\s\S]*event\.code === "Enter"[\s\S]*restartSurvivalTest\(\)/,
  );
  assert.match(
    source,
    /survivalStateRef\.current\.gameOverReason[\s\S]*gamepadInput\.actionPressed[\s\S]*restartSurvivalTest\(\)/,
  );
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

test("natural death presentation shakes, blurs, blacks out, then reveals the image and controls", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /getSurvivalDeathWarning\(survivalState\)/);
  assert.match(source, /survivalDeathWarning \? " is-death-imminent"/);
  assert.match(source, /src="\/ui\/gameover\.png"/);
  assert.match(source, /data-text="GAME OVER"/);
  assert.match(source, />生命跡象中止</);
  assert.match(source, />SIGNAL LOST</);
  assert.match(source, />\s*重新開始冒險旅程\s*</);
  assert.match(source, /survivalDeathWarning \? \([\s\S]*survival-death-warning-blackout/);
  assert.match(styles, /\.game-shell\.is-death-imminent\s*\{[\s\S]*survival-death-root-shake[\s\S]*survival-death-blur 2s/);
  assert.match(styles, /\.survival-death-warning-blackout\s*\{[\s\S]*survival-death-warning-blackout 2s/);
  assert.match(styles, /\.survival-game-over-blackout\s*\{[\s\S]*opacity: 1/);
  assert.match(styles, /\.survival-game-over-image\s*\{[\s\S]*survival-game-over-image-reveal 1s linear forwards/);
  assert.match(styles, /\.survival-game-over-copy\s*\{[\s\S]*survival-game-over-copy-reveal 1s ease-out 1s/);
  assert.match(styles, /survival-game-over-glitch-upper/);
  assert.match(styles, /survival-game-over-copy-dropout/);
});
