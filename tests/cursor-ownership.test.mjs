import assert from "node:assert/strict";
import test from "node:test";
import { CursorOwnership, GamepadHandoffGate } from "../app/cursor-ownership.ts";
import { parseCursorPosition } from "../app/cursor-presentation.ts";
import { readFileSync } from "node:fs";

test("mouse to gamepad inherits client coordinates; directional return retains virtual position", () => {
  const state = new CursorOwnership();
  let cursor = { x: 20, y: 30 };
  state.subscribe((owner, previous) => {
    if (owner === "gamepad" && previous === "mouse" && state.lastMouse) cursor = { ...state.lastMouse };
  });
  state.recordMouse(423, 281);
  state.take("gamepad");
  assert.deepEqual(cursor, { x: 423, y: 281 });
  cursor = { x: 500, y: 350 };
  state.take("directional"); state.take("gamepad");
  assert.deepEqual(cursor, { x: 500, y: 350 });
  state.recordMouse(100, 120); state.take("gamepad");
  assert.deepEqual(cursor, { x: 100, y: 120 });
});

test("mouse needs real movement or press; repeated stationary and subpixel events cannot steal", () => {
  const state = new CursorOwnership();
  state.recordMouse(200, 300); state.take("gamepad");
  assert.equal(state.recordMouse(200, 300), false);
  assert.equal(state.recordMouse(200.5, 300.5), false);
  assert.equal(state.owner, "gamepad");
  assert.equal(state.recordMouse(203, 300), true);
  state.take("gamepad");
  assert.equal(state.recordMouse(203, 300, true), true);
  assert.equal(state.owner, "mouse");
});

test("no prior mouse position: first stationary report does not steal; touch has no native cursor", () => {
  const state = new CursorOwnership();
  state.take("gamepad");
  assert.equal(state.recordMouse(100, 100), false);
  state.take("touch"); assert.equal(state.owner, "touch");
  assert.equal(state.recordMouse(NaN, 100), false);
  state.reset(); assert.equal(state.owner, "mouse"); assert.equal(state.lastMouse, null);
});

test("handoff blocks held stick and RT until neutral, without pretending controller disconnected", () => {
  const gate = new GamepadHandoffGate();
  const held = { cursorX: 0.8, cursorY: 0, rightTriggerPressed: true, connected: true, label: "test" };
  gate.requireNeutral();
  for (let i = 0; i < 10; i++) assert.deepEqual(gate.filter(held), {
    cursorX: 0, cursorY: 0, rightTriggerPressed: false, connected: true, label: "test",
  });
  const neutral = { ...held, cursorX: 0, rightTriggerPressed: false };
  assert.deepEqual(gate.filter(neutral), neutral);
  assert.deepEqual(gate.filter(held), held);
});

test("welding subscribes to shared ownership, releases held welding and converts mouse coordinates", () => {
  const welding = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(welding, /cursorOwnership.subscribe\(syncOwner\)/);
  assert.match(welding, /releasePointerCapture\(captured\)/);
  assert.match(welding, /getBoardPoint\(cursorOwnership.lastMouse.x, cursorOwnership.lastMouse.y\)/);
  assert.match(welding, /gamepadRearmRef.current/);
  assert.match(welding, /inputModeRef.current === "gamepad"/);
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /gamepadHandoffGate.filter\(/);
  assert.match(source, /cursorPresentation.reconcile\(owner, cursorOwnership.lastMouse\)/);
  assert.match(source, /cursorOwnership.owner === "directional" \|\| cursorOwnership.owner === "touch"/);
});

test("restart cursor position accepts only finite in-viewport coordinates", () => {
  assert.deepEqual(parseCursorPosition('{"x":350,"y":220}', 1280, 900), { x:350, y:220 });
  for (const input of [null, '{}', 'null', 'broken', '{"x":-1,"y":20}', '{"x":3500,"y":220}', '{"x":"35","y":220}']) {
    assert.equal(parseCursorPosition(input, 1280, 900), null);
  }
});

test("virtual cursor admission repairs browser presentation even without a new owner event", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  for (const method of ["activateGamepadCursor", "drawPointerCursor"]) {
    const code = source.slice(source.indexOf(`const ${method} =`));
    assert.match(code.slice(0, 1500), /cursorPresentation.reconcile\("gamepad", cursorOwnership.lastMouse\)/);
  }
  assert.match(source, /window.addEventListener\("pagehide", rememberMousePosition\)/);
});
