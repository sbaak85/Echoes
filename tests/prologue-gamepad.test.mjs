import assert from 'node:assert/strict';
import test from 'node:test';
import { PrologueGamepadInput } from '../app/prologue-gamepad.ts';

const pad = (pressed = [], axes = [0, 0, 0, 0]) => ({
  axes, buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.includes(index) })),
});

test('entering from the menu requires release before A can advance, once per press', () => {
  const input = new PrologueGamepadInput();
  assert.equal(input.sample(pad([0])).confirm, false);
  assert.equal(input.sample(pad([0])).confirm, false);
  input.sample(pad());
  assert.equal(input.sample(pad([0])).confirm, true);
  assert.equal(input.sample(pad([0])).confirm, false);
  input.sample(pad());
  assert.equal(input.sample(pad([0])).confirm, true);
});

test('right stick moves the pointer; left stick and D-pad own directional mode', () => {
  const input = new PrologueGamepadInput();
  input.sample(pad());
  const right = input.sample(pad([], [0, 0, 0.8, -0.7]));
  assert.equal(right.directional, false);
  assert.equal(right.x, 0.8);
  assert.equal(right.y, -0.7);
  assert.equal(input.sample(pad([], [0.8, 0, 0, 0])).directional, true);
  assert.equal(input.sample(pad([12])).directional, true);
  assert.equal(input.sample(pad([], [0, 0, 0.17, -0.17])).x, 0);
  assert.equal(input.sample(pad([], [0, 0, NaN, Infinity])).y, 0);
});

test('modal close, mouse takeover, blur and reconnect cannot replay held controls', () => {
  for (const disconnect of [false, true]) {
    const input = new PrologueGamepadInput();
    input.sample(pad());
    assert.equal(input.sample(pad([6])).history, true);
    if (disconnect) input.sample(null); else input.reset();
    assert.equal(input.sample(pad([6], [0, 0, 1, 0])).history, false);
    assert.equal(input.sample(pad([], [0, 0, 1, 0])).x, 0);
    input.sample(pad());
    assert.equal(input.sample(pad([], [0, 0, 1, 0])).x, 1);
  }
});
