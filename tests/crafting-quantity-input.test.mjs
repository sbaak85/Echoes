import test from 'node:test';
import assert from 'node:assert/strict';
import { idleCraftQuantityHold, stepCraftQuantityHold } from '../app/crafting-quantity-input.ts';

test('quantity trigger changes once immediately, repeats after 500ms then every 100ms',()=>{
 let state=idleCraftQuantityHold();
 for(const [now,expected] of [[0,1],[100,0],[499,0],[500,1],[599,0],[600,1]]){
  const step=stepCraftQuantityHold(state,false,true,now,true);state=step.state;assert.equal(step.delta,expected);
 }
 const release=stepCraftQuantityHold(state,false,false,700,true);
 assert.equal(stepCraftQuantityHold(release.state,true,false,710,true).delta,-1);
});
test('held input across phases or simultaneous triggers requires release before rearming',()=>{
 let state=stepCraftQuantityHold(idleCraftQuantityHold(),false,true,0,false).state;
 assert.equal(stepCraftQuantityHold(state,false,true,900,true).delta,0);
 state=stepCraftQuantityHold(state,false,false,1000,true).state;
 assert.equal(stepCraftQuantityHold(state,false,true,1001,true).delta,1);
 state=stepCraftQuantityHold(state,true,true,1100,true).state;
 assert.equal(stepCraftQuantityHold(state,true,false,1200,true).delta,0);
});
