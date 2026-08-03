import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("development-only fake quest HUD triggers are removed", () => {
  assert.equal(source.includes("MOCK_QUEST_HUD"), false);
  assert.equal(source.includes("questHudDemo"), false);
  assert.equal(source.includes("echoes:quest-hud-test"), false);
});

test("objective completion and delayed next-stage visuals are wired", () => {
  assert.match(source, /kind:\s*"next"/);
  assert.match(source, /}, 3000\);/);
  assert.match(source, /is-completion-pop/);
  assert.match(styles, /quest-objective-completion-pop/);
  assert.match(styles, /quest-header-next-glow/);
});
