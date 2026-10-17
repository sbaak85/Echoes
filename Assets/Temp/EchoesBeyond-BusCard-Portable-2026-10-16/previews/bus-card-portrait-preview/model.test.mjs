import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, insertCard, removeCard, swapDetachedCard, evaluate, advanceCharge } from './model.mjs';
test('all 24 placements include exactly three valid three-card chains', () => {
  const solutions = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    if (new Set([a,b,c]).size !== 3) continue;
    let state = insertCard(EMPTY(), a, 'A'); state = insertCard(state, b, 'B'); state = insertCard(state, c, 'C');
    if (evaluate(state).complete) solutions.push(state);
  }
  assert.deepEqual(solutions, [['A','C','B',null],['A',null,'C','B'],['C','A',null,'B']]);
});
test('remove any linked card immediately breaks the completed chain', () => {
  const state = ['A','C','B',null];
  for (const index of [0,1,2]) assert.equal(evaluate(removeCard(state,index)).complete, false);
  assert.deepEqual(state, ['A','C','B',null]);
});
test('isolated power and a two-card shortcut never count as completion', () => {
  assert.equal(evaluate([null,'C','A','B']).chain.length,0);
  assert.equal(evaluate(['C','C',null,null]).complete,false);
  assert.equal(evaluate(['B','A','C',null]).complete,false);
});
test('cards cannot be duplicated or silently overwrite an occupied slot', () => {
  const state = insertCard(EMPTY(),0,'A');
  assert.strictEqual(insertCard(state,1,'A'),state);
  assert.strictEqual(insertCard(state,0,'B'),state);
  assert.strictEqual(insertCard(state,9,'B'),state);
});
test('charge advances, reverses from its current position, and clamps at endpoints', () => {
  const progress = advanceCharge(0,true,.5,1);
  assert.equal(progress,.5); assert.equal(advanceCharge(progress,false,.2,1),.3);
  assert.equal(advanceCharge(0,false,1),0); assert.equal(advanceCharge(.7,true,5),1);
});
test('installed-card swaps conserve every card and reversing a swap restores the board', () => {
  for (let a=0;a<4;a++) for (let b=0;b<4;b++) for (let c=0;c<4;c++) {
    if (new Set([a,b,c]).size !== 3) continue;
    const before=EMPTY(); before[a]='A'; before[b]='B'; before[c]='C';
    for (const source of [a,b,c]) for (const target of [a,b,c]) {
      if (source===target) continue;
      const detached=removeCard(before,source);
      const swapped=swapDetachedCard(detached,source,target,before[source]);
      assert.equal(swapped[source],before[target]); assert.equal(swapped[target],before[source]);
      assert.deepEqual(swapped.filter(Boolean).sort(),['A','B','C']);
      assert.deepEqual(detached,removeCard(before,source));
      assert.deepEqual(swapDetachedCard(removeCard(swapped,target),target,source,swapped[target]),before);
    }
  }
  assert.equal(evaluate(swapDetachedCard(['A',null,'C',null],1,2,'B')).complete,true);
});
test('a swap rejects invalid or stale source/target without losing installed cards', () => {
  const state=[null,'B','C',null];
  for (const [source,target,card] of [[null,1,'A'],[0,null,'A'],[0,0,'A'],[0,3,'A'],[1,2,'A'],[9,1,'A'],[0,9,'A'],[0,1,'C'],[0,1,'X']]) {
    assert.strictEqual(swapDetachedCard(state,source,target,card),state);
  }
});
