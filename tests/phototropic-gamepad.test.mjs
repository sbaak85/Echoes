import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPlantPadState, stepPlantPad, PLANT_ANGLE_SPEED, PLANT_ANGLE_MAX_SPEED, plantAngleSpeedForAxis } from "../app/phototropic-gamepad.ts";

function rig() {
  const state = createPlantPadState();
  const input = { x: 0, y: 0, rightX: 0, confirm: false, back: false, dt: 1 / 60, selected: 0, lamp: { slot: 0, angle: 60 } };
  function step(overrides = {}) {
    Object.assign(input, overrides);
    const result = stepPlantPad(state, input);
    input.selected = result.selected;
    if (result.angle !== null) input.lamp.angle = result.angle;
    return result;
  }
  step();
  return { state, input, step };
}
test("gamepad starts at center, and its first horizontal input immediately selects an adjacent socket", () => {
  assert.equal(createPlantPadState().slot, 1);
  for (const [x, expected] of [[-1, 0], [1, 2]]) for (const selected of [-1, 1]) {
    const r = rig();
    assert.equal(r.step({ selected, x }).selected, expected);
  }
  const r = rig();
  assert.equal(r.step({ selected: -1, confirm: true }).selected, 1);
});
test("left horizontal wraps sockets only, even when the keyboard last selected the dial", () => {
  const r = rig();
  assert.equal(r.step({ x: 1 }).selected, 1);
  r.step({ x: 0 });
  assert.equal(r.step({ x: 1 }).selected, 2);
  r.step({ x: 0 });
  assert.equal(r.step({ x: 1 }).selected, 0);
  r.step({ x: 0, selected: 3 });
  assert.equal(r.step({ x: -1 }).selected, 2);
  assert.equal(r.input.lamp.angle, 60);
});
test("vertical switches between the remembered socket and return, not the dial; held input does not bounce", () => {
  const r = rig();
  assert.equal(r.step({ y: 1, selected: 2 }).selected, 4);
  for (let i = 0; i < 90; i++) assert.equal(r.step().selected, 4);
  r.step({ y: 0 });
  assert.equal(r.step({ y: -1 }).selected, 2);
  r.step({ y: 0 });
  r.step({ y: 1 });
  assert.equal(r.step({ y: 0, x: 1 }).selected, 0);
});
test("right analog eases from 40 to 60 degrees per second by pressure, independent of frame rate and focus", () => {
  assert.equal(PLANT_ANGLE_SPEED, 40);
  assert.equal(PLANT_ANGLE_MAX_SPEED, 60);
  for (const axis of [0, .2, .55, -.55, NaN]) assert.equal(plantAngleSpeedForAxis(axis), 0);
  assert.ok(Math.abs(plantAngleSpeedForAxis(.550001) - 40) < .001);
  assert.equal(plantAngleSpeedForAxis(.775), 45);
  assert.equal(plantAngleSpeedForAxis(-.775), 45);
  assert.equal(plantAngleSpeedForAxis(1), 60);
  assert.equal(plantAngleSpeedForAxis(2), 60);
  for (const fps of [30, 60, 120]) for (const [axis, expected] of [[.550001, 70], [.775, 75], [1, 90]]) {
    const r = rig();
    r.input.lamp.angle = 30;
    for (let i = 0; i < fps; i++) {
      assert.equal(r.step({ rightX: axis, selected: 4, dt: 1 / fps }).selected, 4);
    }
    assert.equal(r.input.lamp.angle, expected);
    assert.equal(r.step({ rightX: -axis }).selected, 4);
    for (let i = 1; i < fps; i++) r.step();
    assert.equal(r.input.lamp.angle, 30);
  }
});
test("simultaneous sticks independently move socket focus and change angle; A/B retain their actions", () => {
  const r = rig();
  const result = r.step({ x: 1, rightX: 1, dt: .05, confirm: true });
  assert.equal(result.selected, 1); assert.equal(result.angle, 63);
  assert.equal(result.activate, true); assert.equal(result.back, false);
  assert.equal(r.step({ x: 0, rightX: 0, confirm: false, back: true }).back, true);
});
test("uninserted lamps ignore angle, drift is ignored, and bounds are clamped", () => {
  const r = rig();
  assert.equal(r.step({ rightX: 1, lamp: { slot: null, angle: 60 } }).angle, null);
  assert.equal(r.step({ rightX: .2, lamp: { slot: 1, angle: 60 } }).angle, null);
  for (const [rightX, angle] of [[1, 120], [-1, 0]]) {
    for (let i = 0; i < 60; i++) assert.equal(r.step({ rightX, lamp: { slot: 1, angle } }).angle, angle);
  }
});
test("entry and handoff require neutral on BOTH sticks and buttons", () => {
  const r = rig(); r.state.armed = false;
  assert.equal(r.step({ rightX: 1, x: 0 }).active, false);
  assert.equal(r.step({ rightX: 0, confirm: true }).active, false);
  assert.equal(r.state.armed, false);
  r.step({ confirm: false }); assert.equal(r.state.armed, true);
  assert.equal(r.step({ rightX: 1 }).active, true);
});
test("production and preview route right X exclusively to the plant dial", () => {
  const runtime = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../app/phototropic-preview/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/phototropic-puzzle.css", import.meta.url), "utf8");
  assert.match(runtime, /const menuCursorCanTakeControl =\s*!plantController\.isOpen &&/);
  assert.match(runtime, /hasGamepadActivity && !plantController\.isOpen/);
  const branch = runtime.split("} else if (plantController.isOpen) {")[1].split("} else if (illustrationController")[0];
  assert.match(branch, /plantController\.pad\(x, y, confirm, backJustPressed, deltaTime, gamepadInput\.cursorX\)/);
  assert.doesNotMatch(branch, /activateVirtualCursorUi/);
  assert.match(preview, /controller\.current\.pad\(x, y, confirm && !a, back && !b, dt, rightX\)/);
  assert.match(css, /width: min\(216px, calc\(100% - 12px\)\)/);
  assert.match(css, /scale\(1\.3\)/);
});
