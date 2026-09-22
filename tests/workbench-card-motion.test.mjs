import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/starship-interaction-menu.css", import.meta.url), "utf8");

test("workbench cards retain their approved motion without a reduced-motion kill switch", () => {
  assert.doesNotMatch(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  for (const name of ["image-breathe", "texture-drift", "light-turn", "clockwise", "breathe"]) {
    assert.match(css, new RegExp(`@keyframes im-workbench-${name}\\s*\\{`));
  }
  assert.match(css, /var\(--im-image-breathe\) 4\.8s ease-in-out infinite/);
  assert.match(css, /im-workbench-texture-drift 2\.2627417s linear infinite/);
  assert.match(css, /im-workbench-light-turn 28s linear infinite/);
});

test("selection remains input-owner scoped and unselected cards stay paused", () => {
  assert.match(css, /\.im-view-craft \.im-row\s*\{\s*--im-fx-play: paused;\s*--im-fx-opacity: 0;/);
  assert.match(css, /\[data-control-mode="pointer"\][\s\S]*\.im-row:hover,[\s\S]*\[data-control-mode="cursor"\][\s\S]*\[data-control-mode="directional"\][\s\S]*--im-fx-play: running;/);
  assert.match(css, /animation-play-state: var\(--im-fx-play\)/);
  assert.match(css, /\.im-workbench-hover-fx\s*\{[^}]*pointer-events: none;/);
});
