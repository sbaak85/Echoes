import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cursorOwnership } from "../app/cursor-ownership.ts";
import * as glyphs from "../app/gamepad-glyph.ts";
import * as puzzle from "../app/phototropic-puzzle.ts";
import * as plantGamepad from "../app/phototropic-gamepad.ts";
import * as plantSuccess from "../app/phototropic-success-transition.ts";

// Exercise the actual JSX without running client-only drawing effects. Asset
// resolution is mocked because its Vite import.meta environment is not present.
function loadJsx(file, dependencies) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(id => {
    if (!(id in dependencies)) throw Error(`Unexpected dependency ${id}`);
    return dependencies[id];
  }, module, module.exports);
  return module.exports;
}
const icons = loadJsx("../app/gamepad-button-icon.tsx", { "react/jsx-runtime": jsxRuntime, "./gamepad-glyph": glyphs });
const { PhototropicPuzzleOverlay } = loadJsx("../app/phototropic-puzzle-ui.tsx", {
  react: React, "react/jsx-runtime": jsxRuntime, "./cursor-ownership": { cursorOwnership },
  "./gamepad-button-icon": icons, "./phototropic-puzzle.css": {},
  "./phototropic-gamepad": plantGamepad,
  "./phototropic-success-transition": plantSuccess,
  "./public-asset-url": { resolveRuntimePublicAssetUrl: path => `/${path}` },
  "./phototropic-vines": {}, "./phototropic-vine-geometry.js": {}, "./phototropic-puzzle": puzzle,
});

test("B appears inside the existing return button for the active gamepad owner, without a duplicate return hint", () => {
  try {
    for (const [owner, gamepadMode, expected] of [
      ["directional", true, true], ["gamepad", true, true],
      ["directional", false, false], ["mouse", true, false], ["touch", true, false],
    ]) {
      cursorOwnership.owner = owner;
      const html = renderToStaticMarkup(React.createElement(PhototropicPuzzleOverlay, {
        view: { side: "L", imagePath: "/plant.png", initial: { ...puzzle.initialPhototropicState(), introduced: true } },
        gamepadMode, onFinish() {},
      }));
      assert.equal(html.includes('data-gamepad-glyph="B"'), expected, `${owner}/${gamepadMode}`);
      if (expected) assert.match(footer(html), /data-gamepad-glyph="B"[^>]*\/>.*?<span>返回場景<\/span>/);
      assert.equal((html.match(/返回場景/g) || []).length, 1);
      assert.doesNotMatch(html, /plant-return-tip/);
    }
  } finally { cursorOwnership.reset(); }
});
test("only gamepad entry preselects center and displays the approved position/placement tips", () => {
  try {
    for (const [owner, gamepadMode, tips] of [["mouse", false, false], ["directional", false, false], ["touch", true, false], ["mouse", true, false], ["directional", true, true], ["gamepad", true, true]]) {
      cursorOwnership.owner = owner;
      const html = renderToStaticMarkup(React.createElement(PhototropicPuzzleOverlay, {
        view: { side: "R", imagePath: "/plant.png", initial: { ...puzzle.initialPhototropicState(), introduced: true } },
        gamepadMode, onFinish() {},
      }));
      assert.equal(html.includes('class="plant-position-tip"'), tips);
      assert.equal(html.includes('class="plant-place-tip"'), tips);
      if (tips) {
        assert.match(html, /aria-label="R2" aria-pressed="false" data-selected="true"/);
        for (const glyph of ["LS", "A"]) assert.ok(html.includes(`data-gamepad-glyph="${glyph}"`));
        assert.doesNotMatch(html, /data-gamepad-glyph="DPad/);
        assert.equal((html.match(/data-selected="true"/g) || []).length, 1);
      } else if (!gamepadMode) assert.doesNotMatch(html, /data-selected="true"/);
      assert.doesNotMatch(html, /plant-confirm-arrows/);
      assert.match(html, /plant-controls-heading[\s\S]*class="plant-note"[\s\S]*<\/header>/);
    }
  } finally { cursorOwnership.reset(); }
});

function createOverlayRig(initial = { ...puzzle.initialPhototropicState(), introduced: true }, gamepadMode = true) {
  // A minimal hook host exercises the real imperative controller and JSX;
  // drawing effects are omitted, just as in server rendering above.
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0;
  const hooks = {
    ...React,
    useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; },
    useEffect() {}, useLayoutEffect() {},
    useImperativeHandle(ref, create) { ref.current = create(); },
  };
  const module = loadJsx("../app/phototropic-puzzle-ui.tsx", {
    react: hooks, "react/jsx-runtime": jsxRuntime, "./cursor-ownership": { cursorOwnership },
    "./gamepad-button-icon": icons, "./phototropic-puzzle.css": {}, "./phototropic-gamepad": plantGamepad,
    "./phototropic-success-transition": plantSuccess,
    "./public-asset-url": { resolveRuntimePublicAssetUrl: path => `/${path}` },
    "./phototropic-vines": {}, "./phototropic-vine-geometry.js": {}, "./phototropic-puzzle": puzzle,
  });
  const ref = { current: null }, finished = [];
  const props = { view: { side: "L", imagePath: "/plant.png", initial }, gamepadMode, onFinish(state) { finished.push(state); } };
  function render() { stateIndex = refIndex = 0; return renderToStaticMarkup(module.PhototropicPuzzleOverlay.render(props, ref)); }
  return { ref, props, finished, render, transitionTo(phase) {
    const index = states.findIndex(value => ["cover", "black", "reveal", "hold", "dialogue", "exit"].includes(value));
    assert.ok(index >= 0); states[index] = phase;
  } };
}
const primaryCount = html => (html.match(/data-gamepad-glyph="A"/g) || []).length;
const footer = html => html.match(/<button class="plant-confirm"[\s\S]*?<\/button>/)?.[0];

test("a correct answer enters the success presentation instead of closing on return, and locks input", () => {
  try {
    cursorOwnership.owner = "directional";
    for (const side of ["L", "R"]) for (const back of ["Escape", "B", "A"]) {
      const initial = { ...puzzle.initialPhototropicState(), introduced: true, L: { slot: 0, angle: 40 }, R: { slot: 0, angle: 40 } };
      const rig = createOverlayRig(initial); rig.props.view.side = side;
      rig.render(); rig.ref.current.pad(0, 0, false, false, .05);
      if (back === "Escape") rig.ref.current.key("escape", false);
      else if (back === "B") rig.ref.current.pad(0, 0, false, true, .05);
      else { rig.ref.current.pad(0, 1, false, false, .05); rig.ref.current.pad(0, 0, true, false, .05); }
      let html = rig.render();
      assert.match(html, /data-success-phase="cover"/);
      assert.match(html, /aria-busy="true"/);
      assert.match(html, /class="plant-panel plant-controls-unframed" inert=""/);
      assert.match(html, /class="plant-success-curtain" aria-hidden="true"/);
      assert.doesNotMatch(html, /data-gamepad-glyph=|plant-angle-input-icon/);
      assert.equal(rig.finished.length, 0);
      rig.ref.current.key("escape", false); rig.ref.current.key("arrowright", false);
      assert.equal(rig.ref.current.pad(1, 1, true, true, .05, 1, 1), false);
      assert.equal(rig.render(), html, "no input can skip success or mutate its answer");
      assert.equal(rig.finished.length, 0);
    }
  } finally { cursorOwnership.reset(); }
});

test("at full black the second image replaces the first and all controls and beams disappear, while both vines survive through dialogue and exit", () => {
  const initial = { ...puzzle.initialPhototropicState(), introduced: true, L: { slot: 0, angle: 40 }, R: { slot: 0, angle: 40 } };
  const rig = createOverlayRig(initial);
  rig.render(); rig.ref.current.key("escape", false); rig.render();
  for (const phase of ["black", "reveal", "hold", "dialogue", "exit"]) {
    rig.transitionTo(phase); const html = rig.render();
    assert.match(html, /class="plant-puzzle-background" src="\/ui\/interaction-illustrations\/趨光植物背景_2.png"/);
    assert.match(html, /class="plant-vines plant-vines-left"/); assert.match(html, /class="plant-vines plant-vines-right"/);
    assert.doesNotMatch(html, /<section|<button|plant-angle|plant-stick-beam|plant-controls-heading|plant-position-tip|plant-place-tip|data-gamepad-glyph/);
    assert.equal(rig.finished.length, 0);
  }
});

test("production and preview hand success-dialogue input to the registered dialogue host", () => {
  const runtime = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(runtime, /onSuccessDialogue=\{id => dialogueManager.playRegistered\(id,/);
  assert.match(runtime, /if \(plantController.isOpen && !dialoguePlaybackRef.current\)/);
  assert.match(runtime, /else if \(plantController.isOpen && dialoguePlaybackRef.current\) \{[\s\S]*?confirmPressed && !wasGamepadConfirmPressed\) advanceDialogue\(\);/);
  const preview = readFileSync(new URL("../app/phototropic-preview/page.tsx", import.meta.url), "utf8");
  assert.match(preview, /Object.entries\(STORY_DIALOGUES\)/);
  assert.match(preview, /onSuccessDialogue=\{id => dialogueManager.playRegistered\(id, \{\}\)\}/);
  for (const source of [runtime, preview]) {
    assert.match(source, /createDialoguePlayer/);
    assert.match(source, /<DialoguePlayerView/);
  }
  assert.doesNotMatch(preview, /繼續對話|advanceSuccessDialogue|successTypingTimer/);
});

test("reopening a saved solution uses the supplied second illustration directly", () => {
  const initial = { ...puzzle.initialPhototropicState(), introduced: true, solved: true, L: { slot: 0, angle: 40 }, R: { slot: 0, angle: 40 } };
  const html = renderToStaticMarkup(React.createElement(PhototropicPuzzleOverlay, {
    view: { side: "R", imagePath: "/plant.png", initial }, onFinish() {},
  }));
  assert.match(html, /class="plant-puzzle-background" src="\/ui\/interaction-illustrations\/趨光植物背景_2.png"/);
  assert.doesNotMatch(html, /data-success-phase=/);
});

test("both sides keep one A target and use B only for the existing return action", () => {
  try {
    cursorOwnership.owner = "directional";
    for (const side of ["L", "R"]) for (const occupied of [null, 0, 1, 2]) for (const pending of [false, true]) {
      const initial = { ...puzzle.initialPhototropicState(), introduced: true, [side]: { slot: occupied, angle: 62 } };
      const rig = createOverlayRig(initial); rig.props.view.side = side;
      let html = rig.render(); rig.ref.current.pad(0, 0, false, false, .05);
      if (pending) {
        if (occupied === null) rig.ref.current.pad(0, 0, true, false, .05);
        else rig.ref.current.pad(0, 0, false, false, .05, 1);
        html = rig.render();
      }
      assert.match(html, pending ? /設定已變更 · 返回時保存/ : occupied === null ? /尚未放置螢光棒/ : /目前設定已保存/);
      const lamp = pending && occupied === null ? 1 : occupied;
      for (let step = 0; step < 3; step++) {
        rig.ref.current.pad(0, 0, false, false, .05);
        rig.ref.current.pad(1, 0, false, false, .05);
        html = rig.render();
        const selected = Number(html.match(new RegExp(`aria-label="${side}(\\d)" aria-pressed="(?:true|false)" data-selected="true"`))[1]) - 1;
        assert.equal(primaryCount(html), selected === lamp ? 0 : 1);
        assert.equal((html.match(/data-gamepad-glyph="B"/g) || []).length, pending ? 0 : 1);
        if (pending) assert.doesNotMatch(footer(html), /data-gamepad-glyph=/);
        else assert.match(footer(html), /data-gamepad-glyph="B"[^>]*\/><span>返回場景<\/span>/);
        assert.doesNotMatch(html, /plant-return-tip/);
      }
      rig.ref.current.pad(0, 1, false, false, .05); html = rig.render();
      assert.equal(primaryCount(html), 1);
      assert.match(footer(html), /data-selected="true"[\s\S]*data-gamepad-glyph="A"/);
      assert.doesNotMatch(footer(html), /data-gamepad-glyph="B"/);
      rig.ref.current.pad(0, 0, true, false, .05);
      assert.equal(rig.finished.length, 1);
      assert.equal(rig.finished[0][side].slot, lamp);
    }
  } finally { cursorOwnership.reset(); }
});

test("B and Escape return exactly once with the advertised retained settings from any focus", () => {
  try {
    cursorOwnership.owner = "directional";
    for (const side of ["L", "R"]) for (const target of ["occupied", "empty", "confirm", "dial"]) for (const back of ["B", "Escape"]) {
      const initial = { ...puzzle.initialPhototropicState(), introduced: true, [side]: { slot: 1, angle: 62 } };
      const rig = createOverlayRig(initial); rig.props.view.side = side;
      rig.render(); rig.ref.current.pad(0, 0, false, false, .05);
      rig.ref.current.pad(0, 0, false, false, .05, 1); // 62 -> 65; pending angle-only edit.
      if (target === "empty") rig.ref.current.pad(1, 0, false, false, .05);
      if (target === "confirm") rig.ref.current.pad(0, 1, false, false, .05);
      if (target === "dial") { rig.ref.current.key("tab", false); rig.ref.current.key("tab", false); rig.props.gamepadMode = false; }
      const html = rig.render(); assert.match(html, /設定已變更 · 返回時保存/);
      if (back === "B") {
        rig.ref.current.pad(0, 0, false, false, .05);
        rig.ref.current.pad(0, 0, false, true, .05);
        rig.ref.current.pad(0, 0, false, true, .05);
      } else { rig.ref.current.key("escape", false); rig.ref.current.key("escape", false); }
      assert.equal(rig.finished.length, 1, `${side}/${target}/${back}`);
      assert.deepEqual(rig.finished[0][side], { slot: 1, angle: 65 });
      assert.deepEqual(initial[side], { slot: 1, angle: 62 }, "entry snapshot remains unchanged");
    }
  } finally { cursorOwnership.reset(); }
});

test("actual overlay A placement hands focus to confirmation and retains the socket navigation anchor", () => {
  try {
    cursorOwnership.owner = "directional";
    const { ref, finished, render } = createOverlayRig();
    assert.match(render(), /aria-label="L2" aria-pressed="false" data-selected="true"/);
    ref.current.pad(0, 0, false, false, .05); // Neutral/rearm after the opening dialogue.
    ref.current.pad(0, 0, true, false, .05);
    let html = render();
    assert.equal(finished.length, 0);
    assert.match(html, /aria-label="L2" aria-pressed="true"/);
    assert.match(html, /class="plant-confirm" type="button" data-selected="true"/);
    assert.equal((html.match(/data-selected="true"/g) || []).length, 1);
    assert.doesNotMatch(html, /class="plant-place-tip"/);
    assert.equal(primaryCount(html), 1);
    assert.match(html, /data-gamepad-glyph="A"[^>]*\/><span>確定擺放<\/span>/);
    ref.current.pad(0, 0, false, false, .05, 1);
    html = render();
    assert.match(html, /aria-valuenow="3"/); // Full pressure 60 degrees/sec, internal 60 -> 63.
    assert.match(html, /class="plant-confirm" type="button" data-selected="true"/);
    ref.current.pad(1, 0, false, false, .05);
    html = render();
    assert.match(html, /aria-label="L3" aria-pressed="false" data-selected="true"/);
    assert.equal(primaryCount(html), 1);
    assert.doesNotMatch(footer(html), /data-gamepad-glyph=/);
    ref.current.pad(0, 0, true, false, .05);
    assert.match(render(), /class="plant-confirm" type="button" data-selected="true"/);
    ref.current.pad(0, 0, false, false, .05);
    ref.current.pad(0, 0, true, false, .05);
    assert.equal(finished.length, 1);
    assert.equal(finished[0].L.slot, 2);
    assert.equal(finished[0].L.angle, 63);
  } finally { cursorOwnership.reset(); }
});

test("reopening selects the placed lamp; an occupied target advertises and performs no placement", () => {
  try {
    cursorOwnership.owner = "directional";
    for (const slot of [0, 1, 2]) {
      const initial = { ...puzzle.initialPhototropicState(), introduced: true, L: { slot, angle: 75 } };
      const { ref, finished, render } = createOverlayRig(initial);
      let html = render();
      assert.match(html, new RegExp(`aria-label="L${slot + 1}" aria-pressed="true" data-selected="true"`));
      assert.equal(primaryCount(html), 0);
      assert.doesNotMatch(html, /class="plant-place-tip"/);
      assert.match(footer(html), /data-gamepad-glyph="B"[\s\S]*返回場景/);
      ref.current.pad(0, 0, false, false, .05);
      ref.current.pad(0, 0, true, false, .05);
      assert.equal(render(), html, "A on the occupied slot does not change focus or state");
      assert.equal(finished.length, 0);
      ref.current.pad(0, 1, false, false, .05);
      html = render();
      assert.equal(primaryCount(html), 1);
      assert.match(footer(html), /data-selected="true"[\s\S]*data-gamepad-glyph="A"[\s\S]*返回場景/);
      ref.current.pad(0, 0, true, false, .05);
      assert.deepEqual(finished[0].L, initial.L);
    }
  } finally { cursorOwnership.reset(); }
});

test("moving back to the occupied slot removes A placement without attaching B to confirmation", () => {
  try {
    cursorOwnership.owner = "directional";
    const { ref, finished, render } = createOverlayRig();
    render(); ref.current.pad(0, 0, false, false, .05);
    ref.current.pad(0, 0, true, false, .05); render();
    ref.current.pad(1, 0, false, false, .05); render();
    ref.current.pad(0, 0, false, false, .05);
    ref.current.pad(-1, 0, false, false, .05);
    let html = render();
    assert.match(html, /aria-label="L2" aria-pressed="true" data-selected="true"/);
    assert.equal(primaryCount(html), 0); assert.match(footer(html), /確定擺放/);
    assert.doesNotMatch(footer(html), /data-gamepad-glyph=/);
    assert.doesNotMatch(html, /plant-return-tip|data-gamepad-glyph="B"/);
    ref.current.pad(0, 0, false, false, .05);
    ref.current.pad(0, 0, true, false, .05);
    assert.equal(render(), html);
    ref.current.pad(1, 0, true, true, .05, 1);
    assert.equal(finished.length, 1);
    assert.deepEqual(finished[0].L, { slot: 1, angle: 60 }, "B returns the existing draft without a simultaneous A or stick mutation");
    ref.current.key("escape", false); assert.equal(finished.length, 1);
  } finally { cursorOwnership.reset(); }
});

test("returning position and angle to their entry values clears the modified confirmation label", () => {
  try {
    cursorOwnership.owner = "directional";
    const initial = { ...puzzle.initialPhototropicState(), introduced: true, L: { slot: 1, angle: 75 } };
    const { ref, render } = createOverlayRig(initial);
    render(); ref.current.pad(0, 0, false, false, .05);
    ref.current.pad(-1, 0, true, false, .05); assert.match(footer(render()), /確定擺放/);
    ref.current.pad(0, 0, false, false, .05);
    ref.current.pad(1, 0, true, false, .05); assert.match(footer(render()), /返回場景/);
    ref.current.pad(0, 0, false, false, .05, 1); assert.match(footer(render()), /確定擺放/);
    ref.current.pad(0, 0, false, false, .05, -1); assert.match(footer(render()), /返回場景/);
  } finally { cursorOwnership.reset(); }
});

test("keyboard takeover requires a fresh pad neutral and both devices wait for entrance completion", () => {
  try {
    cursorOwnership.owner = "directional";
    const { ref, render } = createOverlayRig();
    render(); ref.current.pad(0, 0, false, false, .05);
    ref.current.key("enter", false); let html = render();
    assert.match(html, /aria-label="L2" aria-pressed="true"/);
    assert.match(footer(html), /data-selected="true"/);
    assert.equal(ref.current.pad(0, 0, false, false, .05, 1), false);
    assert.equal(render(), html);
    assert.equal(ref.current.pad(0, 0, false, false, .05), false);
    assert.equal(ref.current.pad(0, 0, false, false, .05, 1), true);
    assert.match(render(), /aria-valuenow="3"/);
    const entrance = createOverlayRig(puzzle.initialPhototropicState());
    html = entrance.render(); assert.doesNotMatch(html, /data-gamepad-glyph=/);
    entrance.ref.current.key("enter", false); entrance.ref.current.key("escape", false);
    assert.equal(entrance.ref.current.pad(0, 0, true, true, .05), false);
    assert.equal(entrance.finished.length, 0); assert.equal(entrance.render(), html);
  } finally { cursorOwnership.reset(); }
});
test("empty squares have only positional labels; the occupied square alone has the glowstick and beam", () => {
  const initial = { ...puzzle.initialPhototropicState(), introduced: true };
  for (const slot of [null, 0, 1, 2]) {
    initial.L = { slot, angle: 60 };
    const html = renderToStaticMarkup(React.createElement(PhototropicPuzzleOverlay, {
      view: { side: "L", imagePath: "/plant.png", initial }, onFinish() {},
    }));
    assert.doesNotMatch(html, /plant-base|plant-hole|plant-rim|已插入|空槽/);
    assert.equal((html.match(/class="plant-stick"/g) || []).length, slot === null ? 0 : 1);
    assert.equal((html.match(/class="plant-stick-beam"/g) || []).length, slot === null ? 0 : 1);
    for (const [i, label] of ["靠左", "置中", "靠右"].entries()) {
      assert.equal(html.includes(`class="plant-slot-label">${label}</span>`), i !== slot);
    }
    assert.equal(html.includes('class="plant-slot-label">已放置</span>'), slot !== null);
    assert.match(html, /class="hud-frame-art"/);
    assert.match(html, /class="craft-action-texture"/);
  }
});
test("unframed shaded fan displays signed forward-relative angles without changing the stored 0..120 values", () => {
  for (const side of ["L", "R"]) for (const [angle, signed, text] of [[0, -60, "-60"], [30, -30, "-30"], [60, 0, "0"], [90, 30, "+30"], [120, 60, "+60"]]) {
    const initial = { ...puzzle.initialPhototropicState(), introduced: true, [side]: { slot: 1, angle } };
    const html = renderToStaticMarkup(React.createElement(PhototropicPuzzleOverlay, {
      view: { side, imagePath: "/plant.png", initial }, onFinish() {},
    }));
    assert.match(html, new RegExp(`class="plant-angle-value"[^>]*>${text.replace('+', '\\+')}<span>°</span>`));
    assert.match(html, new RegExp(`aria-valuemin="-60" aria-valuemax="60" aria-valuenow="${signed}"`));
    assert.doesNotMatch(html, /<text\b/);
    assert.match(html, /<foreignObject x="130" y="170" width="100" height="42" class="plant-dial-readout"><output class="plant-angle-value"/);
    assert.match(html, /class="plant-dial-sector"/);
    assert.doesNotMatch(html, /plant-angle-texture|plant-angle-heading|plant-angle-footer|LIGHT DIRECTION|120°|0 — 120°/);
    assert.equal(initial[side].angle, angle);
  }
  const css = readFileSync(new URL("../app/phototropic-puzzle.css", import.meta.url), "utf8");
  assert.match(css, /user-select:none;-webkit-user-select:none/);
  assert.doesNotMatch(css, /\.plant-angle-control::before|\.plant-angle-control::after|--angle-ring/);
  assert.match(css, /text-align: center/);
  assert.match(css, /plant-dial-sector \{ fill: rgba\(5, 21, 30, \.72\)/);
});

test("angle hint uses the current owner's approved mouse or right-stick and fine-adjust glyphs", () => {
  try {
    for (const [owner, gamepadMode, expected] of [
      ["mouse", false, "mouse"], ["mouse", true, "mouse"],
      ["directional", true, "RS"], ["gamepad", true, "RS"],
      ["directional", false, null], ["touch", true, null],
    ]) {
      cursorOwnership.owner = owner;
      const html = renderToStaticMarkup(React.createElement(PhototropicPuzzleOverlay, {
        view: { side: "L", imagePath: "/plant.png", initial: { ...puzzle.initialPhototropicState(), introduced: true, L: { slot: 1, angle: 60 } } },
        gamepadMode, onFinish() {},
      }));
      const hint = html.match(/<p class="plant-angle-tip">([\s\S]*?)<\/p>/)?.[1];
      assert.ok(hint);
      assert.match(hint, /<span>調整角度<\/span>/);
      assert.equal(hint.includes('/ui/input/mouse-left.svg'), expected === "mouse", `${owner}/${gamepadMode}`);
      assert.equal(hint.includes('data-gamepad-glyph="RS"'), expected === "RS", `${owner}/${gamepadMode}`);
      for (const glyph of ["DPadLeft", "DPadRight"]) assert.equal(hint.includes(`data-gamepad-glyph="${glyph}"`), expected === "RS", `${owner}/${gamepadMode}`);
      assert.equal(hint.includes('微調 1°'), expected === "RS");
      const positionHint = html.match(/<p class="plant-position-tip">([\s\S]*?)<\/p>/)?.[1] ?? "";
      assert.doesNotMatch(positionHint, /data-gamepad-glyph="DPad/);
    }
  } finally { cursorOwnership.reset(); }
});

test("actual overlay fine-adjusts either side without changing slot, confirmation focus, or A target", () => {
  try {
    cursorOwnership.owner = "directional";
    for (const side of ["L", "R"]) for (const focus of ["occupied", "empty", "confirm"]) {
      const initial = { ...puzzle.initialPhototropicState(), introduced: true, [side]: { slot: 1, angle: 60 } };
      const rig = createOverlayRig(initial); rig.props.view.side = side;
      rig.render(); rig.ref.current.pad(0, 0, false, false, .05);
      if (focus === "empty") rig.ref.current.pad(1, 0, false, false, .05);
      if (focus === "confirm") rig.ref.current.pad(0, 1, false, false, .05);
      const before = rig.render();
      const target = html => html.match(/<(?:button|div)[^>]*data-selected="true"[^>]*>/)?.[0];
      rig.ref.current.pad(0, 0, false, false, .05, 0, 1);
      let html = rig.render();
      assert.match(html, /aria-valuenow="1"/);
      assert.equal(target(html), target(before));
      assert.equal(primaryCount(html), primaryCount(before));
      assert.match(html, new RegExp(`aria-label="${side}2" aria-pressed="true"`));
      rig.ref.current.pad(0, 0, false, false, .05, 0, 1);
      assert.match(rig.render(), /aria-valuenow="1"/);
      rig.ref.current.pad(0, 0, false, false, .05, 0, 0);
      rig.ref.current.pad(0, 0, false, false, .05, 0, -1);
      assert.match(rig.render(), /aria-valuenow="0"/);
      assert.equal(rig.finished.length, 0);
    }
  } finally { cursorOwnership.reset(); }
});
