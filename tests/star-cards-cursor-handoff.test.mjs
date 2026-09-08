import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CursorOwnership } from "../app/cursor-ownership.ts";

const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
// Execute the actual integration block, including the held-stick latch.
const start = source.indexOf("      const starCardsDirectionalInputActive =");
const end = source.indexOf("      if (cursorInputLength <= 0.1) sharedCursorRearmRequired", start);
assert.ok(start > 0 && end > start);
const tick = new Function("state", "input", `
  let { starCardsCursorRearmRequired } = state;
  const { open, direction, right, connected = true } = input;
  const starCardsOpenRef = {current:open};
  const gamepadInput = {connected};
  const inventoryDirectionActive = direction;
  const cursorInputLength = right;
  const activateDirectionalCursor = () => state.owner.take('directional');
  ${source.slice(start, end)}
  state.starCardsCursorRearmRequired = starCardsCursorRearmRequired;
  if (connected && !starCardsCursorRearmRequired && right >= .45) state.owner.take('gamepad');
`);

test("Star Cards: directional takeover stays hidden until right stick releases and moves again", () => {
  const state = {owner:new CursorOwnership(), starCardsCursorRearmRequired:false};
  let visible = true;
  state.owner.take("gamepad");
  state.owner.subscribe(owner => {visible = owner === "gamepad";});
  tick(state, {open:true,direction:true,right:.8});
  assert.equal(visible, false);
  assert.equal(state.owner.owner, "directional");
  tick(state, {open:true,direction:false,right:.8});
  assert.equal(visible, false, "held right stick must not immediately resurrect cursor");
  tick(state, {open:true,direction:false,right:0});
  assert.equal(visible, false, "neutral by itself must not reveal cursor");
  tick(state, {open:true,direction:false,right:.05});
  assert.equal(visible, false, "minor drift must not reveal cursor");
  tick(state, {open:true,direction:false,right:.8});
  assert.equal(visible, true);
  assert.doesNotMatch(source.slice(start, end), /virtualCursor\.[xy]\s*=/, "takeover must not move the cursor");
  tick(state, {open:true,direction:true,right:0});
  tick(state, {open:false,direction:false,right:0});
  assert.equal(state.starCardsCursorRearmRequired, false, "closing clears the local latch");
});

test("all D-pad axes and left-stick axes participate; initial reveal and A activation respect ownership", () => {
  assert.match(source, /const inventoryDirectionActive = Math\.abs\(gamepadInput\.dpadX\)[\s\S]*?Math\.abs\(gamepadInput\.stickY\) >= 0\.65/);
  assert.match(source, /starCardsInitialGamepadModeRef\.current &&\s*cursorOwnership\.owner === "gamepad" &&\s*!starCardsCursorRearmRequired/);
  assert.match(source, /cursorOwnership\.owner === "gamepad" &&\s*document\.querySelector\("\.star-cards-dialog/);
  const component = readFileSync(new URL("../app/star-cards-game.tsx", import.meta.url), "utf8");
  assert.match(component, /cursorOwnership\.subscribe\(syncDirectionalOwner\)/);
  assert.match(component, /navigationRef\.current\.mode = "directional"/);
  assert.match(component, /if \(cursorOwnership\.owner !== "gamepad"\) return/);
});
