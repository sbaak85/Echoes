import test from 'node:test';
import assert from 'node:assert/strict';
import {CRAFT_COMPLETION,completionItemDelay,craftingCompletionTimeline,craftingCompletionBurstSlots} from '../app/crafting-completion-timing.ts';

test('opening plays once before three synchronized item events at 250 ms intervals',()=>{
 assert.deepEqual([0,1,2].map(completionItemDelay),[1250,1500,1750]);
 assert.deepEqual(craftingCompletionTimeline(3),{lastItemMs:1750,fadeStartMs:4800,endMs:5400});
});
test('one item and large batches wait exactly one second after all effects and messages before shared fade',()=>{
 for(const count of [1,3,7,8,20,99,1000]){
  const t=craftingCompletionTimeline(count);
  const playbackEnd=Math.max(CRAFT_COMPLETION.introMs,t.lastItemMs+CRAFT_COMPLETION.burstMs,t.lastItemMs+CRAFT_COMPLETION.messageMs);
  assert.equal(t.fadeStartMs-playbackEnd,1000);
  assert.ok(t.fadeStartMs>=t.lastItemMs+CRAFT_COMPLETION.burstMs+CRAFT_COMPLETION.idleMs);
  assert.ok(t.fadeStartMs>=CRAFT_COMPLETION.introMs+CRAFT_COMPLETION.idleMs);
  assert.equal(t.endMs-t.fadeStartMs,600);
 }
});
test('bounded burst pool produces exactly one burst per item with no extra repeats',()=>{
 for(const count of [1,3,7,8,20,99,1000]){
  const slots=craftingCompletionBurstSlots(count);
  assert.ok(slots.length<=7);
  assert.ok(slots.every(s=>s.repeatMs>CRAFT_COMPLETION.burstMs));
  const starts=slots.flatMap(s=>Array.from({length:s.count},(_,i)=>s.delayMs+i*s.repeatMs)).sort((a,b)=>a-b);
  assert.deepEqual(starts,Array.from({length:count},(_,i)=>completionItemDelay(i)));
 }
});
test('invalid quantities cannot create unbounded completion loops',()=>{
 for(const count of [0,-1,1.5,NaN,Infinity])assert.throws(()=>craftingCompletionTimeline(count),RangeError);
});
