import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { AUDIO_EVENT_CONFIG } from '../app/audio-event-manager.ts';
import {craftingCompletionAudioCues,CRAFT_COMPLETION,completionItemDelay,craftingCompletionTimeline,craftingCompletionBurstSlots} from '../app/crafting-completion-timing.ts';

test('craft audio events resolve to the requested public assets without extra delays',async()=>{
 const expected={craftingStarted:'製作音效2.mp3',craftingAssemblyStep2:'製作2.mp3',craftingAssemblyStep3:'製作3.mp3',craftingItemShine:'閃亮1.mp3',craftingFinished:'製作音效1.mp3'};
 for(const [event,file] of Object.entries(expected)) {
  const config=AUDIO_EVENT_CONFIG[event];
  assert.deepEqual(config.sources,[`./audio/${file}`]);
  assert.equal(config.delaySeconds,0);
  assert.equal(config.loop ?? false,false);
  await access(new URL(`../public/audio/${file}`,import.meta.url));
 }
});

test('opening plays once before three synchronized item events at 250 ms intervals',()=>{
 assert.deepEqual([0,1,2].map(completionItemDelay),[1250,1500,1750]);
 assert.deepEqual(craftingCompletionTimeline(3),{lastItemMs:1750,fadeStartMs:3350,endMs:3850});
});
test('one item and large batches start shared fade immediately after all visible effects and messages',()=>{
 for(const count of [1,3,7,8,20,99,1000]){
  const t=craftingCompletionTimeline(count);
  const playbackEnd=Math.max(CRAFT_COMPLETION.introVisibleEndMs,t.lastItemMs+CRAFT_COMPLETION.burstMs,t.lastItemMs+CRAFT_COMPLETION.messageMs);
  assert.equal(t.fadeStartMs-playbackEnd,0);
  assert.ok(t.fadeStartMs>=t.lastItemMs+CRAFT_COMPLETION.burstMs+CRAFT_COMPLETION.idleMs);
  assert.ok(t.fadeStartMs>=CRAFT_COMPLETION.introVisibleEndMs+CRAFT_COMPLETION.idleMs);
  assert.equal(t.endMs-t.fadeStartMs,500);
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

 test('single item does not wait for the invisible intro tail',()=>{
 assert.deepEqual(craftingCompletionTimeline(1),{lastItemMs:1250,fadeStartMs:2850,endMs:3350});
 });

test('craft audio follows every item burst and ends once after the last shine',()=>{
 for(const count of [1,3,8,20]) {
  const cues=craftingCompletionAudioCues(count);
  assert.deepEqual(cues.slice(0,3),[
   {event:'craftingStarted',atMs:0},
   {event:'craftingAssemblyStep2',atMs:100},
   {event:'craftingAssemblyStep3',atMs:400},
  ]);
  assert.deepEqual(cues.filter(c=>c.event==='craftingItemShine').map(c=>c.atMs),Array.from({length:count},(_,i)=>completionItemDelay(i)));
  assert.deepEqual(cues.filter(c=>c.event==='craftingFinished'),[{event:'craftingFinished',atMs:completionItemDelay(count-1)+200}]);
 }
});
