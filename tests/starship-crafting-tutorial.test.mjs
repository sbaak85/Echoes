import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { QuestRuntimeManager } from '../app/quest-runtime-manager.ts';
import { normalizeStoryProgress } from '../app/story-progress.ts';
import { createNewGameProgress } from '../app/new-game-reset.ts';
import { normalizeEchoesSaveData } from '../app/save-data.ts';
import {
  STARSHIP_CRAFTING_TUTORIAL_QUEST as questId, STARSHIP_CRAFTING_TUTORIAL_OBJECTIVE as objectiveId,
  STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG as flag, STARSHIP_CRAFTING_TUTORIAL_STEPS as steps,
  STARSHIP_CRAFTING_TUTORIAL_VISUALS as visuals, advanceStarshipCraftingTutorial,
  shouldStartStarshipCraftingTutorial, positionStarshipCraftingTip,
} from '../app/starship-crafting-tutorial.ts';

test('requires OBJ17 in progress and an absent completion flag, not another objective', () => {
  const calls = [];
  for (const active of [false, true]) for (const completed of [false, true]) {
    const manager = { isObjectiveInProgress: (q, o) => { calls.push([q, o]); return active; } };
    assert.equal(shouldStartStarshipCraftingTutorial(manager, { [flag]: completed }), active && !completed);
  }
  assert.ok(calls.every(([q, o]) => q === questId && o === objectiveId));
  assert.equal(shouldStartStarshipCraftingTutorial(null, {}), false);
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

test('overview is 500ms only on the first screen; every step uses shared 70 percent, 6px and 250ms', () => {
  assert.deepEqual(steps.map(step => step.holdMs), [500, 0, 0]);
  assert.deepEqual(visuals, { blackOpacity: .7, holeBlurPx: 6, fadeMs: 250 });
  assert.equal(steps[0].message, '經由工作艙可以製作新的道具或料理食物。');
  assert.ok(steps.slice(1).every(step => step.message === '暫時留空，我等會再補'));
});

test('only successful intended actions advance, and completion follows the final recipe selection', () => {
  let step = steps[0];
  for (const wrong of ['sleep', 'repair', 'cooking', 'recipe:T0005']) assert.equal(advanceStarshipCraftingTutorial(step, wrong), step);
  step = advanceStarshipCraftingTutorial(step, 'craft'); assert.equal(step, steps[1]);
  step = advanceStarshipCraftingTutorial(step, 'workbench'); assert.equal(step, steps[2]);
  assert.equal(advanceStarshipCraftingTutorial(step, 'recipe:T0005'), step);
  assert.equal(advanceStarshipCraftingTutorial(step, 'recipe:T0006'), null);
});

test('glow stick target remains semantic after reordering; Tips use equilateral vertical arrows', async () => {
  assert.equal(steps[2].target, '[data-tutorial-item-id="T0006"] .recipe-row');
  const workbench = await readFile(new URL('../app/crafting-workbench.tsx', import.meta.url), 'utf8');
  assert.match(workbench, /data-tutorial-item-id=\{recipe.id\}/);
  assert.match(workbench, /findIndex\(recipe=>recipe.id===props.tutorial!.recipeId\)/);
  for (const width of [360, 800, 1500]) {
    const target = { x: width * .7, y: 420, left: width * .7, right: width - 14, top: 420, bottom: 490, width: width * .3 - 14, height: 70 };
    const tip = positionStarshipCraftingTip(steps[2], target, null, { width, height: 850 });
    assert.ok(tip.x >= 12 && tip.x + tip.width <= width - 12);
    assert.ok(tip.y + tip.height <= target.top); assert.equal(tip.arrowDirection, 'down');
    assert.equal(positionStarshipCraftingTip(steps[0], { ...target, top: 200 }, { ...target, top: 500 }, { width, height: 850 }).arrowDirection, 'up');
  }
  const css = await readFile(new URL('../app/starship-crafting-tutorial.css', import.meta.url), 'utf8');
  assert.match(css, /width:12px;height:10.3923px/); assert.doesNotMatch(css, /rotate\(|backdrop-filter/);
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
  assert.match(menu, /onClickCapture=\{gateTutorialEvent\}/);
  assert.match(menu, /onPointerDownCapture=\{gateTutorialEvent\}/);
  assert.match(menu, /onWheelCapture=\{blockTutorialEvent\}/);
  assert.match(menu, /if \(tutorialRuntime.current.step\) return;/);
  assert.doesNotMatch(menu, /(?:^|\s)disabled=\{tutorial|\.disabled\s*=/);
  assert.match(workbench, /if\(latest.current.tutorial\)/);
  assert.match(workbench, /props.onRecipeSelected\?\.\(recipe.id\)/);
});
