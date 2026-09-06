import assert from "node:assert/strict";
import test from "node:test";
import { GAMEPAD_GLYPHS, GAMEPAD_GLYPH_LABELS, getGamepadGlyphSvg, getGamepadGlyphUrl, splitGamepadHint } from "../app/gamepad-glyph.ts";

test("all approved controls and LT share self-contained vector images with accessible labels", () => {
  assert.equal(GAMEPAD_GLYPHS.length, 19);
  for (const name of GAMEPAD_GLYPHS) {
    const svg = getGamepadGlyphSvg(name);
    assert.match(svg, /viewBox="0 0 40 40"/);
    assert.ok(GAMEPAD_GLYPH_LABELS[name]);
    assert.equal(decodeURIComponent(getGamepadGlyphUrl(name).split(",")[1]), svg);
    assert.doesNotMatch(svg, /<script|<image|href=/);
  }
  for (const name of ["A", "B", "X", "Y"]) assert.match(getGamepadGlyphSvg(name), /<circle/);
  for (const name of ["LS", "RS", "L3", "R3", "DPadLeft", "DPadRight", "DPadUp", "DPadDown"]) {
    assert.doesNotMatch(getGamepadGlyphSvg(name), /<rect/);
  }
});

test("tutorial brackets, plain menu hints and stick clicks resolve without consuming surrounding text", () => {
  const text = "按 [RB] 收折，按 [A] 繼續 · LB／RB · 左搖桿 · [右搖桿] · L3／R3 · START／SELECT · [B鍵]";
  const parts = splitGamepadHint(text);
  assert.equal(parts.map(part => part.text).join(""), text);
  assert.deepEqual(parts.flatMap(part => part.glyphs ?? []), ["RB", "A", "LB", "RB", "LS", "RS", "L3", "R3", "Start", "Select", "B"]);
});

test("directional hints distinguish all four directions and preserve keyboard keys and identifiers", () => {
  const parts = splitGamepadHint("按 [◀] [▶]，十字鍵上下／十字鍵左右 · Enter／Esc／[TAB]／[M]／RB123／BATTLE／SELECTED_ITEM");
  assert.deepEqual(parts.flatMap(part => part.glyphs ?? []), ["DPadLeft", "DPadRight", "DPadUp", "DPadDown", "DPadLeft", "DPadRight"]);
  assert.ok(parts.at(-1).text.includes("Enter／Esc／[TAB]／[M]／RB123／BATTLE／SELECTED_ITEM"));
});
import { readFileSync } from "node:fs";

test("all 19 runtime glyphs exactly match the user-approved preview geometry and typography", () => {
  const approved = JSON.parse(readFileSync(new URL("./fixtures/gamepad-glyph-approved.json", import.meta.url), "utf8"));
  const normalize = svg => svg.replace(/>\s+</g, "><").trim();
  assert.equal(Object.keys(approved).length, GAMEPAD_GLYPHS.length);
  for (const name of GAMEPAD_GLYPHS) {
    assert.equal(normalize(getGamepadGlyphSvg(name)), normalize(approved[GAMEPAD_GLYPH_LABELS[name]]), name);
  }
});
