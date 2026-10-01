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
  "./public-asset-url": { resolveRuntimePublicAssetUrl: path => `/${path}` },
  "./phototropic-vines": {}, "./phototropic-vine-geometry.js": {}, "./phototropic-puzzle": puzzle,
});

test("B uses the approved glyph only for active gamepad directional or pointer ownership", () => {
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
      if (expected) assert.match(html, /data-gamepad-glyph="B"[^>]*\/>.*?<span>返回場景<\/span>/);
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
        for (const glyph of ["LS", "DPadLeft", "DPadRight", "A"]) assert.ok(html.includes(`data-gamepad-glyph="${glyph}"`));
        assert.equal((html.match(/data-selected="true"/g) || []).length, 1);
      } else if (!gamepadMode) assert.doesNotMatch(html, /data-selected="true"/);
      assert.doesNotMatch(html, /plant-confirm-arrows/);
      assert.match(html, /plant-controls-heading[\s\S]*class="plant-note"[\s\S]*<\/header>/);
    }
  } finally { cursorOwnership.reset(); }
});

test("actual overlay A placement hands focus to confirmation and retains the socket navigation anchor", () => {
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
    "./public-asset-url": { resolveRuntimePublicAssetUrl: path => `/${path}` },
    "./phototropic-vines": {}, "./phototropic-vine-geometry.js": {}, "./phototropic-puzzle": puzzle,
  });
  const ref = { current: null }, finished = [];
  const props = { view: { side: "L", imagePath: "/plant.png", initial: { ...puzzle.initialPhototropicState(), introduced: true } }, gamepadMode: true, onFinish(state) { finished.push(state); } };
  function render() { stateIndex = refIndex = 0; return renderToStaticMarkup(module.PhototropicPuzzleOverlay.render(props, ref)); }
  try {
    cursorOwnership.owner = "directional";
    assert.match(render(), /aria-label="L2" aria-pressed="false" data-selected="true"/);
    ref.current.pad(0, 0, false, false, .05); // Neutral/rearm after the opening dialogue.
    ref.current.pad(0, 0, true, false, .05);
    let html = render();
    assert.equal(finished.length, 0);
    assert.match(html, /aria-label="L2" aria-pressed="true"/);
    assert.match(html, /class="plant-confirm" type="button" data-selected="true"/);
    assert.equal((html.match(/data-selected="true"/g) || []).length, 1);
    assert.doesNotMatch(html, /class="plant-place-tip"/);
    assert.match(html, /data-gamepad-glyph="A"[^>]*\/><span>確定擺放<\/span>/);
    ref.current.pad(0, 0, false, false, .05, 1);
    html = render();
    assert.match(html, /aria-valuenow="3"/); // Full pressure 60 degrees/sec, internal 60 -> 63.
    assert.match(html, /class="plant-confirm" type="button" data-selected="true"/);
    ref.current.pad(1, 0, false, false, .05);
    assert.match(render(), /aria-label="L3" aria-pressed="false" data-selected="true"/);
    ref.current.pad(0, 0, true, false, .05);
    assert.match(render(), /class="plant-confirm" type="button" data-selected="true"/);
    ref.current.pad(0, 0, false, false, .05);
    ref.current.pad(0, 0, true, false, .05);
    assert.equal(finished.length, 1);
    assert.equal(finished[0].L.slot, 2);
    assert.equal(finished[0].L.angle, 63);
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
    assert.match(html, /<foreignObject x="130" y="86" width="100" height="42" class="plant-dial-readout"><output class="plant-angle-value"/);
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

test("angle hint uses only the current owner's approved mouse or right-stick glyph", () => {
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
    }
  } finally { cursorOwnership.reset(); }
});
