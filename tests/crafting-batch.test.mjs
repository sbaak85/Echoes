import test from 'node:test';
import assert from 'node:assert/strict';
import {CRAFTING_RECIPES,craftInventoryRecipe} from '../app/crafting-recipes.ts';

test('batch crafting consumes multiplied requirements and grants exact quantity atomically',()=>{
 for(const recipe of CRAFTING_RECIPES){
  const inventory=Object.fromEntries(recipe.req.map(([id,n])=>[id,n*3]));
  const before={...inventory};
  assert.equal(craftInventoryRecipe(inventory,recipe.id,4).ok,false);
  assert.deepEqual(inventory,before);
  const result=craftInventoryRecipe(inventory,recipe.id,3);
  assert.equal(result.ok,true);
  assert.equal(result.quantity,3);
  assert.equal(result.inventory[recipe.id],3);
  for(const [id] of recipe.req)assert.equal(result.inventory[id]||0,0);
  assert.deepEqual(inventory,before);
 }
});
test('invalid batch quantities reject without modifying inventory',()=>{
 const recipe=CRAFTING_RECIPES[0],inventory=Object.fromEntries(recipe.req),before={...inventory};
 for(const quantity of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  assert.equal(craftInventoryRecipe(inventory,recipe.id,quantity).ok,false);
  assert.deepEqual(inventory,before);
 }
});
