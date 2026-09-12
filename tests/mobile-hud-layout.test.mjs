import assert from "node:assert/strict";
import test from "node:test";
import { canShareMobileHudSpace, changeMobileHudMode, cycleMobileHudMode } from "../app/mobile-hud-layout.ts";

test("repeated HUD presses cycle through current state, including after another panel collapses it", () => {
  let state = { survival: "mini", quest: "mini" };
  for (const expected of ["collapsed", "expanded", "mini", "collapsed"]) {
    state = cycleMobileHudMode(state, "survival", false);
    assert.equal(state.survival, expected);
  }
  state = cycleMobileHudMode(state, "quest", false);
  assert.deepEqual(state, { survival: "mini", quest: "collapsed" });
  state = cycleMobileHudMode(state, "survival", true);
  assert.deepEqual(state, { survival: "collapsed", quest: "collapsed" });
  state = cycleMobileHudMode(state, "quest", true);
  assert.deepEqual(state, { survival: "collapsed", quest: "expanded" });
});

test("available space includes both HUD widths and their separating gap", () => {
  assert.equal(canShareMobileHudSpace(390 - 28, 300, 370, 12), false);
  assert.equal(canShareMobileHudSpace(768 - 28, 300, 370, 12), true);
  assert.equal(canShareMobileHudSpace(681, 300, 370, 12), false);
  assert.equal(canShareMobileHudSpace(682, 300, 370, 12), true);
  assert.equal(canShareMobileHudSpace(710 - 48, 300, 370, 12), false);
});

test("all medium/large combinations coexist when space permits", () => {
  for (const survival of ["collapsed", "expanded"]) {
    for (const quest of ["collapsed", "expanded"]) {
      const current = { survival, quest };
      assert.deepEqual(changeMobileHudMode(current, "quest", quest, true), current);
      assert.deepEqual(changeMobileHudMode(current, "survival", survival, true), current);
      assert.deepEqual(changeMobileHudMode(current, "quest", quest, false), { survival: "mini", quest });
      assert.deepEqual(changeMobileHudMode(current, "survival", survival, false), { survival, quest: "mini" });
    }
  }
});

test("closing a HUD preserves the other HUD even on a narrow screen", () => {
  assert.deepEqual(changeMobileHudMode({ survival: "expanded", quest: "expanded" }, "quest", "mini", false), {
    survival: "expanded", quest: "mini",
  });
});
