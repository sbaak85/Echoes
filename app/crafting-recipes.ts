import { ITEM_DEFINITIONS, ITEM_BY_ID, grantInventoryItem, removeInventoryItem, type PlayerInventory } from "./item-database.ts";

export type CraftingRecipe = { id:string; name:string; en:string; type:string; req:[string,number][]; desc:string; weight:string };
/** Initial approved workbench recipes. Edit this table to rebalance material requirements. */
const INITIAL_RECIPES: CraftingRecipe[] = [
  {id:'tracking-module',name:'訊號探測儀',en:'SIGNAL DETECTOR',type:'探索裝備',req:[['metal-parts',3],['crystal-shard',2],['battery',1]],desc:'用於標定近距離異常訊號來源。將散落的線索，轉化為前進的方向。',weight:'0.25 kg'},
  {id:'utility-rope',name:'繩索',en:'UTILITY ROPE',type:'基礎工具',req:[['fiber-bundle',3],['toughened-vine-bark',2]],desc:'以耐磨纖維與藤皮編製，適合固定設備及野外探索。',weight:'0.6 kg'},
  {id:'medkit',name:'醫療包',en:'FIELD MEDKIT',type:'生存補給',req:[['synthetic-cloth',2],['fiber-bundle',1],['alien-spore',1]],desc:'將清潔布料與應急用品整理成便攜醫療包，為下一段旅程做好準備。',weight:'1.1 kg'},
  {id:'lantern',name:'螢光棒',en:'GLOW STICK',type:'探索裝備',req:[['empty-test-tube',1],['luminescent-sac',2]],desc:'將螢光包囊的發光內容物封入試管瓶，製成在昏暗環境中提供柔和光源的便攜照明道具。',weight:'0.9 kg'},
  {id:'digging-shovel',name:'挖掘鏟',en:'DIGGING SHOVEL',type:'採集工具',req:[['metal-scrap',4],['metal-parts',2],['fiber-bundle',1]],desc:'加固的鏟面與纖維握柄，適合探索地表下埋藏的資源。',weight:'1.2 kg'},
  {id:'repair-kit',name:'多功能工具箱',en:'REPAIR KIT',type:'維修工具',req:[['metal-parts',4],['synthetic-cloth',2]],desc:'收納維修與組裝所需的基本工具。',weight:'1.5 kg'},
  {id:'multifunction-folding-knife',name:'多功能折刀',en:'FOLDING KNIFE',type:'基礎工具',req:[['sharp-metal-fragment',2],['metal-parts',1],['heat-fused-ceramic-shard',1]],desc:'輕巧的折疊工具，可供野外切割與簡易加工。',weight:'0.3 kg'},
  {id:'welding-tool',name:'焊接工具',en:'WELDING TOOL',type:'維修工具',req:[['metal-parts',3],['battery',2],['calibration-component',1]],desc:'將回收元件重新接合，延長設備的使用壽命。',weight:'1.2 kg'},
  {id:'communication-array-panel',name:'通訊陣列面板',en:'COMMUNICATION PANEL',type:'電子元件',req:[['quantum-transmitter',1],['calibration-component',2],['metal-parts',3]],desc:'以精密元件組成的訊號處理面板。',weight:'0.8 kg'},
  {id:'grass-stem-tea',name:'草莖茶',en:'GRASS STEM TEA',type:'生存補給',req:[['plain-grass-stem',2],['water-bottle',1]],desc:'以草莖與淨水沖泡的溫和飲品。',weight:'0.3 kg'},
  {id:'mixed-meat-mash',name:'雜燉肉泥',en:'MIXED MEAT MASH',type:'生存補給',req:[['cultured-meat-powder',2],['concentrated-sauce-packet',1]],desc:'以保存食材調製的簡單餐食。',weight:'0.4 kg'},
  {id:'rock-mushroom-chowder',name:'岩菇濃湯',en:'ROCK MUSHROOM CHOWDER',type:'生存補給',req:[['rock-mushroom',3],['water-bottle',1],['sodium-chloride-crystal-salt',1]],desc:'以岩菇熬製，適合長途探索後補充能量。',weight:'0.4 kg'},
  {id:'starch-flatbread',name:'澱粉烤餅',en:'STARCH FLATBREAD',type:'生存補給',req:[['dried-starch-block',2],['egg-powder',1]],desc:'以澱粉與蛋粉調製的便攜食物。',weight:'0.2 kg'},
  {id:'roasted-seed-crisps',name:'烤種子脆片',en:'ROASTED SEED CRISPS',type:'生存補給',req:[['vacuum-dried-seeds',2],['sodium-chloride-crystal-salt',1]],desc:'經烘烤後便於保存的種子補給。',weight:'0.15 kg'},
  {id:'nutrient-gel',name:'營養凝膠',en:'NUTRIENT GEL',type:'生存補給',req:[['soft-core-moss',2],['alien-fruit',1],['water-bottle',1]],desc:'混合可食素材製成的濃縮營養補給。',weight:'0.2 kg'},
  {id:'salt-roasted-rock-mushroom',name:'鹽烤岩菇',en:'SALT ROASTED ROCK MUSHROOM',type:'料理',req:[['rock-mushroom',2],['sodium-chloride-crystal-salt',1]],desc:'將岩菇撒鹽烘烤成香氣濃郁的便攜菜餚。',weight:'0.18 kg'},
  {id:'salted-soft-eggs',name:'鹽味嫩蛋',en:'SALTED SOFT EGGS',type:'料理',req:[['egg-powder',2],['water-bottle',1],['sodium-chloride-crystal-salt',1]],desc:'以蛋粉與淨水調製，加入少量鹽烹成柔嫩鹹食。',weight:'0.2 kg'},
  {id:'sweet-stewed-fruit',name:'甜煮果實',en:'SWEET STEWED FRUIT',type:'料理',req:[['alien-fruit',2],['sweet-leaf',1],['water-bottle',1]],desc:'以甜味葉片與淨水慢煮果實，製成溫潤甜食。',weight:'0.25 kg'},
  {id:'shoot-and-seed-salad',name:'嫩芽種子拌菜',en:'SHOOT AND SEED SALAD',type:'料理',req:[['curled-tender-shoots',2],['vacuum-dried-seeds',1],['concentrated-sauce-packet',1]],desc:'將嫩芽與種子拌入醬汁，製成清爽菜餚。',weight:'0.22 kg'},
  {id:'moss-algae-thick-soup',name:'苔藻芡湯',en:'MOSS ALGAE THICK SOUP',type:'料理',req:[['soft-core-moss',2],['dried-starch-block',1],['water-bottle',1]],desc:'以苔藻與淨水熬煮，再以澱粉勾芡。',weight:'0.4 kg'},
  {id:'sweet-seed-energy-bar',name:'甜味種子能量棒',en:'SWEET SEED ENERGY BAR',type:'料理',req:[['vacuum-dried-seeds',2],['sweet-leaf',1],['nutrient-gel',1]],desc:'將種子、甜味葉片與營養膠壓製成便攜能量棒。',weight:'0.18 kg'},
  {id:'mixed-compressed-ration-bar',name:'綜合壓縮棒',en:'MIXED COMPRESSED RATION BAR',type:'料理',req:[['dried-starch-block',2],['cultured-meat-powder',1],['nutrient-gel',1]],desc:'將澱粉、培養肉粉與營養膠加工壓製成高密度口糧。',weight:'0.3 kg'},
];
function itemId(name:string):string {
 const item=ITEM_DEFINITIONS.find(item=>item.englishName===name);
 if(!item)throw new Error(`Unknown crafting item: ${name}`);
 return item.id;
}
export const CRAFTING_RECIPES: readonly CraftingRecipe[] = INITIAL_RECIPES.map(recipe=>({
 ...recipe,id:itemId(recipe.id),req:recipe.req.map(([name,count])=>[itemId(name),count])
}));
/** Food recipes remain available for the separate cooking entry. */
const HIDDEN_WORKBENCH_ITEMS = new Set([
 'tracking-module','digging-shovel','welding-tool',
 'communication-array-panel','nutrient-gel','repair-kit',
].map(itemId));
export const WORKBENCH_RECIPES = CRAFTING_RECIPES.filter(recipe=>
 ITEM_BY_ID.get(recipe.id)?.category!=="food"&&!HIDDEN_WORKBENCH_ITEMS.has(recipe.id)
);
export const COOKING_RECIPES = CRAFTING_RECIPES.filter(recipe=>ITEM_BY_ID.get(recipe.id)?.category==="food")
 .sort((a,b)=>a.id.localeCompare(b.id));
const COOKING_INGREDIENT_IDS = new Set(COOKING_RECIPES.flatMap(recipe=>recipe.req.map(([id])=>id)));
const FOOD_MATERIAL_IDS = new Set([...COOKING_INGREDIENT_IDS,itemId("fermentation-powder")]);
const EDIBLE_WORKBENCH_MATERIAL_ID = itemId("alien-spore");
/** Hide these items only from the workbench material picker, not the inventory or recipes. */
const HIDDEN_WORKBENCH_MATERIAL_IDS = new Set([
 'repair-kit','tracking-module','medkit','lantern','welding-tool','digging-shovel',
 'multifunction-folding-knife','navigation-data','memory-charm','ancient-plate','ruin-key',
 'communication-array-panel','quantum-transmitter','calibration-component','time-crystal',
].map(itemId));
/** Workbench visibility only: edible recipe exceptions retain their food/use metadata. */
export function isWorkbenchMaterial(id:string,recipeId?:string) {
 const item=ITEM_BY_ID.get(id);
 if(!item||item.backpackCapacityKg||HIDDEN_WORKBENCH_MATERIAL_IDS.has(id))return false;
 if(id===EDIBLE_WORKBENCH_MATERIAL_ID)return WORKBENCH_RECIPES.some(recipe=>
  recipe.id===recipeId&&recipe.req.some(([requiredId])=>requiredId===id)
 );
 return item.category!=="food"&&!FOOD_MATERIAL_IDS.has(id);
}
export function isCookingMaterial(id:string) {
 return FOOD_MATERIAL_IDS.has(id);
}
export type CraftingResult = {ok:true;inventory:PlayerInventory;itemId:string;quantity:number}|{ok:false;reason:string};
export function craftInventoryRecipe(inventory:PlayerInventory,recipeId:string,quantity=1):CraftingResult {
 if(!Number.isSafeInteger(quantity)||quantity<1)return {ok:false,reason:"製作數量無效"};
 const recipe=CRAFTING_RECIPES.find(recipe=>recipe.id===recipeId);
 if(!recipe)return {ok:false,reason:"找不到製作配方"};
 const required=new Map<string,number>();
 for(const [id,count] of recipe.req)required.set(id,(required.get(id)||0)+count*quantity);
 for(const [id,count] of required)if((inventory[id]||0)<count)return {ok:false,reason:`${ITEM_BY_ID.get(id)?.name||id}數量不足`};
 let next=inventory;
 for(const [id,count] of required)next=removeInventoryItem(next,id,count);
 return {ok:true,inventory:grantInventoryItem(next,recipe.id,quantity),itemId:recipe.id,quantity};
}
