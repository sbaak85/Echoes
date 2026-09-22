import test from "node:test";
import assert from "node:assert/strict";
import { CRAFTING_RECIPES, COOKING_RECIPES, WORKBENCH_RECIPES, isCookingMaterial, isWorkbenchMaterial, craftInventoryRecipe } from "../app/crafting-recipes.ts";

test("料理素材背包僅保留十五項食品素材並隱藏十四項非食材", () => {
 const allowed=['R0004','R0012',...Array.from({length:13},(_,i)=>`R${String(i+23).padStart(4,'0')}`)];
 assert.deepEqual([...ITEM_BY_ID.values()].filter(item=>isCookingMaterial(item.id)).map(item=>item.id).sort(),allowed.sort());
 for(const id of ['R0001','R0002','R0003','R0007','R0008','R0009','R0010','R0011','R0018','R0019','R0020','R0021','R0022','R0036']) {
  assert.equal(isCookingMaterial(id),false,id);
 }
 assert.equal(isCookingMaterial('unknown'),false);
});
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
test("folding knife requires two sharp metal fragments, one metal part and one heat-fused ceramic shard",()=>{
 const recipe=WORKBENCH_RECIPES.find(r=>ITEM_BY_ID.get(r.id).englishName==='multifunction-folding-knife');
 assert.ok(recipe);
 assert.deepEqual(recipe.req.map(([id,count])=>[ITEM_BY_ID.get(id).englishName,count]),[
  ['sharp-metal-fragment',2],['metal-parts',1],['heat-fused-ceramic-shard',1],
 ]);
 const withoutCeramic=Object.fromEntries(recipe.req.slice(0,2));
 const before={...withoutCeramic};
 assert.equal(craftInventoryRecipe(withoutCeramic,recipe.id).ok,false);
 assert.deepEqual(withoutCeramic,before);
 const result=craftInventoryRecipe(Object.fromEntries(recipe.req),recipe.id);
 assert.equal(result.ok,true);
 assert.equal(result.inventory[recipe.id],1);
 for(const [id] of recipe.req)assert.equal(result.inventory[id]??0,0);
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

test("workbench hides food and all thirteen food materials without changing cooking visibility",()=>{
 for(const item of ITEM_BY_ID.values()) {
  if(item.category==='food')assert.equal(isWorkbenchMaterial(item.id),false,item.name);
 }
 for(let n=23;n<=35;n++) {
  const id=`R${String(n).padStart(4,'0')}`;
  for(const recipe of WORKBENCH_RECIPES)assert.equal(isWorkbenchMaterial(id,recipe.id),false,ITEM_BY_ID.get(id).name);
  assert.equal(isCookingMaterial(id),true);
 }
 assert.equal(isWorkbenchMaterial('missing'),false);
});

test("workbench hides the fifteen requested tools and story items without hiding other materials",()=>{
 const hidden=['T0003','T0004','T0005','T0006','T0007','T0008','T0009','Q0001','Q0002','Q0003','Q0004','R0013','R0014','R0015','M0001'];
 for(const id of hidden) {
  assert.ok(ITEM_BY_ID.has(id));
  assert.equal(isWorkbenchMaterial(id),false,id);
  for(const recipe of WORKBENCH_RECIPES)assert.equal(isWorkbenchMaterial(id,recipe.id),false,id);
 }
 for(const id of ['T0001','R0001','R0002','R0003','R0018','R0019','R0020','R0021','R0036'])assert.equal(isWorkbenchMaterial(id),true,id);
});

test("alien seeds remain edible and appear only for a workbench recipe requiring them",()=>{
 const seed=ITEM_BY_ID.get('R0006');
 assert.equal(seed.englishName,'alien-spore');
 assert.equal(seed.category,'food');
 assert.equal(seed.usable,true);
 for(const recipe of WORKBENCH_RECIPES) {
  assert.equal(isWorkbenchMaterial(seed.id,recipe.id),recipe.req.some(([id])=>id===seed.id));
  for(const [id] of recipe.req)assert.equal(isWorkbenchMaterial(id,recipe.id),true,`${recipe.name}: ${id}`);
 }
});
