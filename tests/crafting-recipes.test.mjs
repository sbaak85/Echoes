import test from "node:test";
import assert from "node:assert/strict";
import { CRAFTING_RECIPES, COOKING_RECIPES, WORKBENCH_RECIPES, isCookingMaterial, craftInventoryRecipe } from "../app/crafting-recipes.ts";
import { ITEM_BY_ID } from "../app/item-database.ts";
test("all 22 recipes resolve to valid catalog items and positive quantities",()=>{
 assert.equal(CRAFTING_RECIPES.length,22);
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

test("glow stick consumes one empty test tube and two luminescent sacs",()=>{
 const recipe=CRAFTING_RECIPES.find(r=>ITEM_BY_ID.get(r.id).englishName==='lantern');
 assert.deepEqual(recipe.req,[['R0036',1],['R0020',2]]);
 const before={R0036:1,R0020:2,R0018:5};
 const result=craftInventoryRecipe(before,recipe.id);
 assert.equal(result.ok,true);
 assert.equal(result.inventory.R0036??0,0);
 assert.equal(result.inventory.R0020??0,0);
 assert.equal(result.inventory.R0018,5);
 assert.equal(result.inventory[recipe.id],1);
 assert.equal(craftInventoryRecipe({R0020:2,R0018:5},recipe.id).ok,false);
});
test("cooking offers only food and retains every required ingredient",()=>{
 assert.deepEqual(COOKING_RECIPES.map(r=>r.id),Array.from({length:12},(_,i)=>`R${String(50+i).padStart(4,"0")}`));
 for(const recipe of COOKING_RECIPES){
  assert.equal(ITEM_BY_ID.get(recipe.id).category,'food');
  assert.ok(!WORKBENCH_RECIPES.some(r=>r.id===recipe.id));
  for(const [id] of recipe.req) assert.equal(isCookingMaterial(id),true);
 }
 for(const item of ITEM_BY_ID.values()) {
  if(['tool','quest','main'].includes(item.category)) assert.equal(isCookingMaterial(item.id),false);
 }
});