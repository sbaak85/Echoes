import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { QuestRuntimeManager } from '../app/quest-runtime-manager.ts';
import { normalizeStoryProgress } from '../app/story-progress.ts';
import { createNewGameProgress } from '../app/new-game-reset.ts';
import { normalizeEchoesSaveData } from '../app/save-data.ts';
import { craftInventoryRecipe, isWorkbenchMaterial } from '../app/crafting-recipes.ts';
import { publishSuccessfulCraftQuestProgress } from '../app/starship-crafting-quest-flow.ts';
import { ITEM_DEFINITIONS } from '../app/item-database.ts';
import { findCraftMaterialTarget } from '../app/crafting-material-target.ts';
import {
  STARSHIP_CRAFTING_TUTORIAL_QUEST as questId, STARSHIP_CRAFTING_TUTORIAL_OBJECTIVE as objectiveId,
  STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG as flag, STARSHIP_CRAFTING_TUTORIAL_STEPS as steps,
  STARSHIP_CRAFTING_TUTORIAL_VISUALS as visuals, advanceStarshipCraftingTutorial,
  shouldStartStarshipCraftingTutorial, positionStarshipCraftingTip,
  starshipTutorialNavigationKeys, starshipTutorialButtonSelectors,
} from '../app/starship-crafting-tutorial.ts';

test('requires OBJ17 in progress and an absent completion flag, not another objective', () => {
  const calls = [];
  for (const active of [false, true]) for (const completed of [false, true]) {
    const manager = { isObjectiveInProgress: (q, o) => { calls.push([q, o]); return active; } };
    assert.equal(shouldStartStarshipCraftingTutorial(manager, { [flag]: completed }), active && !completed);
  }
  assert.ok(calls.every(([q, o]) => q === questId && o === objectiveId));
  assert.equal(shouldStartStarshipCraftingTutorial(null, {}), false);
  assert.equal(shouldStartStarshipCraftingTutorial({isObjectiveInProgress:()=>true}, {'tutorial:starship-crafting:completed:v1':true}), true);
});

test('actual QuestRuntimeManager distinguishes locked, active, completed and wrong-stage OBJ17', async () => {
  const document = JSON.parse(await readFile(new URL('../public/quests/quest-data.json', import.meta.url), 'utf8'));
  const base = new QuestRuntimeManager(document).exportSave();
  const stage = document.quests.find(q => q.id === questId).stages.find(s => s.objectives.some(o => o.id === objectiveId));
  for (const state of ['locked', 'active', 'completed']) {
    const restored = structuredClone(base), entry = restored.quests[questId];
    entry.state = 'active'; entry.currentStageId = stage.id;
    Object.assign(entry.objectives[objectiveId], { state, unlocked: state !== 'locked', completed: state === 'completed', activatedByEventId: 'tutorial-gate-test' });
    const manager = new QuestRuntimeManager(document, {}, restored);
    assert.equal(shouldStartStarshipCraftingTutorial(manager, {}), state === 'active', state);
    assert.equal(shouldStartStarshipCraftingTutorial(manager, { [flag]: true }), false);
    const wrongStage = manager.exportSave(); wrongStage.quests[questId].currentStageId = 'not-the-current-stage';
    assert.equal(shouldStartStarshipCraftingTutorial(new QuestRuntimeManager(document, {}, wrongStage), {}), false);
  }
});

test('overview is 500ms on entry and 250ms before the first material; all stages share the visual contract', () => {
  assert.deepEqual(steps.filter(step => step.holdMs > 0).map(step => [step.id, step.holdMs]), [['ship-menu',500],['first-material',250]]);
  assert.deepEqual(visuals, { blackOpacity: .7, holeBlurPx: 6, fadeMs: 250 });
  assert.ok(steps.every(step => step.message.trim() && !step.message.includes('暫時留空')));
});

test('selection, material jump, allocation and successful fabrication are distinct gated steps', () => {
  let step = steps[0];
  for (const wrong of ['sleep', 'repair', 'cooking', 'recipe:T0005']) assert.equal(advanceStarshipCraftingTutorial(step, wrong), step);
  step = advanceStarshipCraftingTutorial(step, 'craft'); assert.equal(step, steps[1]);
  step = advanceStarshipCraftingTutorial(step, 'workbench'); assert.equal(step, steps[2]);
  assert.equal(advanceStarshipCraftingTutorial(step, 'recipe:T0005'), step);
  for(const action of ['recipe:T0006','materials:T0006','material:R0020','auto-fill','prepare','quantity-confirm','crafted:T0006','tutorial-finish']) {
    assert.equal(advanceStarshipCraftingTutorial(step,'wrong-action'),step);
    step = advanceStarshipCraftingTutorial(step,action);
    if(action!=='tutorial-finish')assert.ok(step,'must not complete before the final acknowledgement');
  }
  assert.equal(step,null);
});

test('targets follow item identity and quantity allows only its own controls', () => {
  const materialStep=steps.find(step=>step.order===4), quantityStep=steps.find(step=>step.order===7);
  assert.equal(materialStep.target,'[data-craft-nav="material-R0020"]');
  assert.deepEqual(starshipTutorialNavigationKeys(steps[2],0),['recipe-0']);
  assert.deepEqual(starshipTutorialNavigationKeys(steps[2],8),['recipe-8']);
  assert.deepEqual(new Set(starshipTutorialNavigationKeys(quantityStep,0)),new Set(['quantity-minus','quantity-plus','quantity-confirm']));
  assert.equal(starshipTutorialButtonSelectors(quantityStep).some(selector=>selector.includes('prepare')),false);
  const ids=ITEM_DEFINITIONS.filter(entry=>isWorkbenchMaterial(entry.id,'T0006')).map(entry=>entry.id);
  const target=findCraftMaterialTarget(ids,['R0020'],new Set());
  assert.equal(target.id,'R0020');assert.equal(target.page,Math.floor(ids.indexOf('R0020')/12));
  assert.equal(findCraftMaterialTarget(ids.filter(id=>id!=='R0020'),['R0020'],new Set()),null);
});

test('crafted acquisition progresses actual OBJ18 exactly once per transaction', async () => {
  const document=JSON.parse(await readFile(new URL('../public/quests/quest-data.json',import.meta.url),'utf8'));
  const quest=document.quests.find(q=>q.id===questId),stage=quest.stages.find(s=>s.objectives.some(o=>o.id.endsWith('_18')));
  const manager=new QuestRuntimeManager({...document,chapters:[],quests:[{...quest,stages:[stage]}]});
  manager.startQuest(questId);manager.activateObjective('QUEST_CH04_MAIN_001_OBJ_18');
  const result=craftInventoryRecipe({R0020:2,R0036:2},'T0006',2);assert.equal(result.ok,true);
  manager.syncCurrentInventory(result.inventory);
  assert.equal(manager.getObjectiveProgress(questId,'QUEST_CH04_MAIN_001_OBJ_18').currentAmount,0);
  publishSuccessfulCraftQuestProgress(manager,result,'itemCrafted:test:1');
  publishSuccessfulCraftQuestProgress(manager,result,'itemCrafted:test:1');
  const progress=manager.getObjectiveProgress(questId,'QUEST_CH04_MAIN_001_OBJ_18');
  assert.equal(progress.currentAmount,2);assert.equal(progress.completed,true);
  const movement=await readFile(new URL('../app/movement-lab.tsx',import.meta.url),'utf8');
  assert.match(movement,/publishSuccessfulCraftQuestProgress\(craftQuestManager, result, `itemCrafted:\$\{crypto.randomUUID\(\)\}`\)/);
});

test('STEP5 spotlights requirements without granting material-return or navigation actions', () => {
  const step = steps.find(step => step.id === 'auto-fill');
  assert.deepEqual(step.visualTargets, ['#craft-requirements .requirement']);
  assert.deepEqual(starshipTutorialButtonSelectors(step), ['[data-craft-nav="auto-fill"]']);
  assert.deepEqual(starshipTutorialNavigationKeys(step, 0), ['auto-fill']);
  assert.equal(advanceStarshipCraftingTutorial(step, 'require-R0020'), step);
  assert.equal(advanceStarshipCraftingTutorial(step, 'require-R0036'), step);
  assert.equal(advanceStarshipCraftingTutorial(step, 'auto-fill').visualTargets, undefined);
});

test('glow stick target remains semantic after reordering; Tips use equilateral arrows', async () => {
  assert.equal(steps[2].target, '[data-tutorial-item-id="T0006"] .recipe-row');
  const workbench = await readFile(new URL('../app/crafting-workbench.tsx', import.meta.url), 'utf8');
  assert.match(workbench, /data-tutorial-item-id=\{recipe.id\}/);
  assert.match(workbench, /findIndex\(recipe=>recipe.id===props.tutorial!.recipeId\)/);
  for (const width of [360, 800, 1500]) {
    const target = { x: width * .7, y: 420, left: width * .7, right: width - 14, top: 420, bottom: 490, width: width * .3 - 14, height: 70 };
    const tip = positionStarshipCraftingTip(steps[2], target, null, { width, height: 850 });
    assert.ok(tip.x >= 12 && tip.x + tip.width <= width - 12);
    assert.ok(tip.y + tip.height <= target.top); assert.equal(tip.arrowDirection, 'down');
    const remeasuredTip = positionStarshipCraftingTip(steps[2], target, null, { width, height: 850 }, 190);
    assert.deepEqual(remeasuredTip, tip, 'fitted boxes must not grow or jump from their own height measurement');
    assert.equal(positionStarshipCraftingTip(steps[0], { ...target, top: 200 }, { ...target, top: 500 }, { width, height: 850 }).arrowDirection, 'up');
  }
  const css = await readFile(new URL('../app/starship-crafting-tutorial.css', import.meta.url), 'utf8');
  assert.match(css, /width:12px;height:10.3923px/); assert.doesNotMatch(css, /rotate\(|backdrop-filter/);
  const target={x:700,y:200,left:700,right:900,top:200,bottom:250,width:200,height:50};
  const side=positionStarshipCraftingTip(steps.find(step=>step.order===5),target,null,{width:1200,height:800},150);
  assert.equal(side.arrowDirection,'right');assert.ok(side.x+side.width<target.left);
});

test('Tips can follow a semantic layout anchor without moving the spotlight/action target', () => {
  const rect=(left,top,width,height)=>({x:left,y:top,left,top,width,height,right:left+width,bottom:top+height});
  const viewport={width:1280,height:720};
  const row=rect(880,370,330,52), materialsButton=rect(1100,380,100,30);
  const recipeTip=positionStarshipCraftingTip(steps.find(s=>s.id==='glow-stick'),row,row,viewport);
  const materialsTip=positionStarshipCraftingTip(steps.find(s=>s.id==='glow-stick-materials'),materialsButton,row,viewport);
  assert.deepEqual(materialsTip,recipeTip,'STEP3 retains one box as selection becomes the materials action');
  const materialStep=steps.find(s=>s.order===4),first=rect(150,280,90,90),moved=rect(260,280,90,90);
  const firstTip=positionStarshipCraftingTip(materialStep,first,null,viewport);
  const movedTip=positionStarshipCraftingTip(materialStep,moved,null,viewport);
  assert.equal(movedTip.x-firstTip.x,moved.left-first.left);
  assert.ok(movedTip.y+movedTip.height<moved.top,'the material itself stays unobstructed');
  const result=rect(880,230,330,375),finish=rect(1000,570,90,35),panel=rect(867,160,365,460);
  const completedTip=positionStarshipCraftingTip(steps.find(s=>s.order===9),result,finish,viewport,0,panel);
  assert.ok(completedTip.x+completedTip.width<finish.left);
  assert.equal(completedTip.y+completedTip.height,finish.bottom);
  assert.equal(completedTip.arrowDirection,'right');
});

test('story completion survives portable save roundtrip and is cleared by New Game', () => {
  const fresh = createNewGameProgress();
  const story = normalizeStoryProgress({ ...fresh.story, storyFlags: { [flag]: true } });
  const saved = normalizeEchoesSaveData(JSON.parse(JSON.stringify({
    format: 'EchoesSaveData', schemaVersion: 1, savedAt: '2026-10-06T00:00:00.000Z', slotKind: 'auto',
    summary: { chapterId: 'CH04', chapterName: '第四章', questId, questName: '教學測試', stageId: 'test', stageName: 'test' },
    progress: { ...fresh, sceneId: 'Scene_3', quest: { schemaVersion: 1, quests: {} }, story, collectedWorldItemIds: [] },
  })));
  assert.equal(saved.progress.story.storyFlags[flag], true);
  assert.equal(createNewGameProgress().story.storyFlags[flag], undefined);
});

test('formal integration uses real inventory and portable flags, never preview grants or session storage', async () => {
  const movement = await readFile(new URL('../app/movement-lab.tsx', import.meta.url), 'utf8');
  assert.match(movement, /setStarshipCraftingTutorialStart\(shouldStartStarshipCraftingTutorial\(\s*questRuntimeManagerRef.current, storyProgressRef.current.storyFlags/);
  assert.match(movement, /setStoryFlag\(STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG, true\)/);
  assert.match(movement, /tutorialStart=\{starshipCraftingTutorialStart\}/);
  assert.match(movement, /inventory=\{playerInventory\}/);
  assert.match(movement, /isTutorialActive\?\.\(\)[\s\S]*?activatePointerTarget\?\.\(element\) \? "activated" : "blocked"/);
  const menu = await readFile(new URL('../app/starship-interaction-menu.tsx', import.meta.url), 'utf8');
  const overlay = await readFile(new URL('../app/starship-crafting-tutorial-overlay.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(menu + overlay, /sessionStorage|PREVIEW_INVENTORY|C:\/Users/);
  assert.match(overlay, /feGaussianBlur stdDeviation=\{STARSHIP_CRAFTING_TUTORIAL_VISUALS.holeBlurPx\}/);
  assert.match(overlay, /cancelAnimationFrame\(frame\); timers.forEach\(window.clearTimeout\)/);
  assert.match(overlay, /onUnavailable\(step.id\)/);
});

test('all menu/controller input paths honor the gate without native disabled artwork blur', async () => {
  const menu = await readFile(new URL('../app/starship-interaction-menu.tsx', import.meta.url), 'utf8');
  const workbench = await readFile(new URL('../app/crafting-workbench.tsx', import.meta.url), 'utf8');
  for (const path of ['switchColumn', 'changePage', 'secondary', 'inspect']) assert.match(menu, new RegExp(`${path}:.*!tutorialRuntime.current.step`));
  assert.match(menu, /onClickCapture=\{gateMenuEvent\}/);
  assert.match(menu, /onPointerDownCapture=\{gateMenuEvent\}/);
  assert.match(menu, /onWheelCapture=\{blockTutorialEvent\}/);
  assert.match(menu, /if \(tutorialRuntime.current.step\) return;/);
  assert.doesNotMatch(menu, /(?:^|\s)disabled=\{tutorial|\.disabled\s*=/);
  assert.match(workbench, /if\(latest.current.tutorial\)/);
  assert.match(workbench, /props.onRecipeSelected\?\.\(recipe.id\)/);
});
