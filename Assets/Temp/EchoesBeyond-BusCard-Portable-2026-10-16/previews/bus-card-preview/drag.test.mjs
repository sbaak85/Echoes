import test from 'node:test';
import assert from 'node:assert/strict';
import { moveDrag, dropIntent } from './drag.mjs';
const source = () => ({card:'A',sourceSlot:0,sourceRect:{left:0,right:200,top:0,bottom:100},startX:100,startY:50,threshold:7,started:false,detached:false});
test('a click or small pointer jitter does not unplug the card',()=>{
  const s=moveDrag(source(),103,51);
  assert.equal(s.started,false); assert.equal(s.detachNow,false);
  assert.equal(dropIntent(s,0,['A',null,null,null]).type,'click');
});
test('dragging inside original slot keeps power, crossing its boundary unplugs once',()=>{
  let s=moveDrag(source(),120,60); assert.equal(s.started,true); assert.equal(s.detached,false);
  assert.equal(dropIntent(s,0,['A',null,null,null]).type,'stay');
  s=moveDrag(s,250,70); assert.equal(s.detachNow,true);
  s=moveDrag(s,280,70); assert.equal(s.detachNow,false); assert.equal(s.detached,true);
});
test('a detached card can be reseated in its original or another free slot',()=>{
  const s=moveDrag(source(),250,70);
  assert.deepEqual(dropIntent(s,0,[null,null,'B',null]),{type:'insert',slot:0});
  assert.deepEqual(dropIntent(s,1,[null,null,'B',null]),{type:'insert',slot:1});
});
test('installed cards swap on an occupied slot but return to the deck when released outside',()=>{
  const s=moveDrag(source(),250,70);
  assert.deepEqual(dropIntent(s,2,[null,null,'B',null]),{type:'swap',slot:2});
  assert.deepEqual(dropIntent(s,null,[null,null,'B',null]),{type:'return',blocked:false});
  assert.deepEqual(dropIntent(s,2,['C',null,'B',null]),{type:'return',blocked:true});
});
test('deck dragging never unplugs a slot and can insert directly',()=>{
  const s=moveDrag({...source(),sourceSlot:null},250,70);
  assert.equal(s.detached,false); assert.equal(s.detachNow,false);
  assert.deepEqual(dropIntent(s,1,[null,null,null,null]),{type:'insert',slot:1});
  assert.deepEqual(dropIntent(s,1,[null,'B',null,null]),{type:'return',blocked:true});
});
