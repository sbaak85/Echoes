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
  assert.match(source, /showWeldingResultFeedback\("金屬碎片 -1"\)/);
});
