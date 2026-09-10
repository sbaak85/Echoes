import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), 'utf8');
test('assignment frame and pointer use one outline and the same gradient for edge and bloom', () => {
  const frame = read('quick-assign-frame.tsx');
  assert.equal((frame.match(/d=\{path\}/g) || []).length, 2);
  assert.equal((frame.match(/stroke=\{`url\(#\$\{id\}-edge\)`\}/g) || []).length, 2);
  assert.ok(frame.includes('[x,h+9]'));
  assert.ok(frame.includes('attributeFilter:["style"]'));
  assert.ok(read('movement-lab.tsx').includes('<AssignFrame />'));
});
test('bubble has no independent triangle and its buttons retain an opaque corner-gradient base', () => {
  const css = read('globals.css');
  const skin = css.slice(css.indexOf('/* Approved quick-assignment bubble:'));
  assert.match(skin, /\.quick-assign-panel::after\s*\{\s*content:none;/);
  assert.match(skin, /transparent 55%\),#07131c/);
  assert.match(skin, /--assign-button-glow:rgba\(99,191,216,\.27\)/);
});
