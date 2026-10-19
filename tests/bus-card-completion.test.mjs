import test from 'node:test';
import assert from 'node:assert/strict';
import { SUCCESS_MESSAGE, createCompletionSequence } from '../public/minigames/bus-card/completion.mjs';

test('success fades in for 0.5s, holds 1s, fades out 0.5s, and finishes once at 2.2s', () => {
  let visible;
  const finished = [];
  const sequence = createCompletionSequence({ present: state => { visible = state; }, finish: slots => finished.push(slots) });
  const solution = ['C', 'A', null, 'B'];
  assert.equal(SUCCESS_MESSAGE, '電流已重新導通，重新更新負載');
  assert.equal(sequence.start(100, solution), true);
  assert.equal(sequence.start(200, solution), false, 'repeated success cannot restart the deadline');
  assert.deepEqual(visible, { phase: 'fade-in', opacity: 0 });
  for (const [elapsed, phase, opacity] of [[250, 'fade-in', .5], [500, 'hold', 1], [1499, 'hold', 1], [1500, 'fade-out', 1], [1750, 'fade-out', .5], [2000, 'hidden', 0], [2199, 'hidden', 0]]) {
    sequence.tick(100 + elapsed);
    assert.deepEqual(visible, { phase, opacity });
    assert.equal(sequence.active, true);
    assert.equal(finished.length, 0, `must not notify host at ${elapsed} ms`);
  }
  solution[0] = null;
  sequence.tick(2300);
  assert.equal(sequence.active, false);
  assert.deepEqual(finished, [['C', 'A', null, 'B']], 'report the validated success snapshot');
  sequence.tick(5000);
  assert.equal(finished.length, 1);
});

test('cleanup cancels a pending result and a later attempt starts a fresh sequence', () => {
  let visible, finished = 0;
  const sequence = createCompletionSequence({ present: state => { visible = state; }, finish: () => finished++ });
  sequence.start(0, ['C', 'A', null, 'B']);
  sequence.tick(750);
  sequence.cancel();
  assert.deepEqual(visible, { phase: 'hidden', opacity: 0 });
  sequence.tick(3000);
  assert.equal(finished, 0);
  sequence.start(4000, ['C', 'A', null, 'B']);
  sequence.tick(6200);
  assert.equal(finished, 1);
});
