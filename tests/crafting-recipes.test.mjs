import test from "node:test";
import assert from "node:assert/strict";
import { CRAFTING_RECIPES, craftInventoryRecipe } from "../app/crafting-recipes.ts";
import { ITEM_BY_ID } from "../app/item-database.ts";
test("all 15 initial recipes resolve to valid catalog items and positive quantities",()=>{
 assert.equal(CRAFTING_RECIPES.length,15);
 for(const recipe of CRAFTING_RECIPES){
  assert.ok(ITEM_BY_ID.has(recipe.id));
  assert.equal(new Set(recipe.req.map(([id])=>id)).size,recipe.req.length);
  for(const [id,n] of recipe.req){assert.ok(ITEM_BY_ID.has(id));assert.ok(Number.isInteger(n)&&n>0);}
 }
});
test("every recipe consumes exact material counts, grants one result, and preserves unrelated inventory",()=>{
 for(const recipe of CRAFTING_RECIPES){
  const inventory=Object.fromEntries(recipe.req.map(([id,n])=>[id,n+2]));
  inventory[recipe.id]=4;
  const before={...inventory},result=craftInventoryRecipe(inventory,recipe.id);
  assert.equal(result.ok,true);assert.deepEqual(inventory,before);
  for(const [id] of recipe.req)assert.equal(result.inventory[id],2);
  assert.equal(result.inventory[recipe.id],5);
 }
});
test("shortage and unknown recipes reject atomically; exact stock cannot craft twice",()=>{
 for(const recipe of CRAFTING_RECIPES){
  const inventory=Object.fromEntries(recipe.req);
  const missing={...inventory,[recipe.req.at(-1)[0]]:0},before={...missing};
  assert.equal(craftInventoryRecipe(missing,recipe.id).ok,false);assert.deepEqual(missing,before);
  const first=craftInventoryRecipe(inventory,recipe.id);assert.equal(first.ok,true);
  assert.equal(craftInventoryRecipe(first.inventory,recipe.id).ok,false);
 }
 assert.equal(craftInventoryRecipe({},"missing").ok,false);
});
