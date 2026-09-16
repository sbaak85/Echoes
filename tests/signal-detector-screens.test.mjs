import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { drawSignalDetectorScreens, isSignalDetectorIllustration } from "../app/signal-detector-screens.ts";

test("signal detector binding matches decoded filename only", () => {
  for (const path of ["/ui/interaction-illustrations/訊號探測儀_C.png", "/other/訊號探測儀_C.png?v=2", "/ui/" + encodeURIComponent("訊號探測儀_C.png")]) {
    assert.equal(isSignalDetectorIllustration(path), true);
  }
  for (const path of ["/ui/訊號探測儀_B.png", "/ui/訊號探測儀_C.png.backup", "/ui/%invalid"]) {
    assert.equal(isSignalDetectorIllustration(path), false);
  }
});

test("animated screens draw repeated frames with balanced canvas state", () => {
  let depth = 0, strokes = 0;
  const ctx = new Proxy({
    save() { depth++; }, restore() { assert.ok(--depth >= 0); },
    stroke() { strokes++; },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
  }, {
    get(target, key) { return target[key] ?? (() => {}); },
    set(target, key, value) {
      if (typeof value === "number") assert.ok(Number.isFinite(value));
      target[key] = value; return true;
    },
  });
  for (let ms = 0; ms <= 6000; ms += 50) {
    drawSignalDetectorScreens(ctx, ms);
    assert.equal(depth, 0);
  }
  assert.ok(strokes > 180 * 121);
});

test("artwork composite shares the original 200ms closing animation and cleans up RAF", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const component = readFileSync(new URL("../app/signal-detector-illustration.tsx", import.meta.url), "utf8");
  assert.match(css, /\.interaction-illustration-overlay\.is-closing > \.interaction-illustration-artwork,[\s\S]*?animation: inventory-item-inspect-fade-out 200ms ease-in both/);
  assert.match(component, /className="interaction-illustration-artwork"[\s\S]*<img[\s\S]*<canvas/);
  assert.match(component, /return \(\) => cancelAnimationFrame\(frame\)/);
});
