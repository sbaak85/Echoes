import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { NAV_TERMINAL_INTERACTION_ID, isNavTerminalCleared } from '../app/nav-terminal-minigame.ts';
import { QuestRuntimeManager } from '../app/quest-runtime-manager.ts';

const doc = JSON.parse(readFileSync(new URL('../public/quests/quest-data.json', import.meta.url), 'utf8'));
const questId = 'QUEST_CH02_MAIN_004';
const objectiveId = 'QUEST_CH02_MAIN_004_OBJ_04';

test('only a report with all three BLOCKs calibrated counts as cleared', () => {
  assert.equal(isNavTerminalCleared(['A', 'B', 'C']), true);
  assert.equal(isNavTerminalCleared(['C', 'A', 'B']), true);
  for (const solved of [undefined, null, [], ['A', 'B'], ['A', 'A', 'B'], ['A', 'B', 'C', 'D'], 'ABC']) {
    assert.equal(isNavTerminalCleared(solved), false);
  }
});

test('OBJ04 completes only after the nav terminal minigame is cleared, not on interacting and leaving', () => {
  const objective = doc.quests.find(q => q.id === questId).stages[0].objectives.find(o => o.id === objectiveId);
  assert.equal(objective.type, 'puzzleCompleted');
  assert.equal(objective.targetId, NAV_TERMINAL_INTERACTION_ID);
  const manager = new QuestRuntimeManager(doc);
  manager.startQuest(questId);
  assert.equal(manager.isObjectiveInProgress(questId, objectiveId), true);
  // 互動一次（播完對話開啟小遊戲）後立刻退出：不會打勾
  for (const type of ['interactionStarted', 'interactionSucceeded']) {
    manager.handleEvent({ type, targetId: NAV_TERMINAL_INTERACTION_ID });
    assert.equal(manager.getObjectiveProgress(questId, objectiveId).completed, false);
  }
  manager.handleEvent({ type: 'puzzleCompleted', targetId: 'shipinterior-interaction-008' });
  assert.equal(manager.getObjectiveProgress(questId, objectiveId).completed, false);
  const restored = new QuestRuntimeManager(doc, {}, manager.exportSave());
  assert.equal(restored.getObjectiveProgress(questId, objectiveId).completed, false, 'exit/reload must not complete the objective');
  // 三組都校對完成
  restored.handleEvent({ type: 'puzzleCompleted', targetId: NAV_TERMINAL_INTERACTION_ID, eventId: 'nav-terminal-success' });
  assert.equal(restored.getObjectiveProgress(questId, objectiveId).completed, true);
  assert.equal(new QuestRuntimeManager(doc, {}, restored.exportSave()).getObjectiveProgress(questId, objectiveId).completed, true);
});

test('MAIN_004 STAGE_01 completes after the cockpit (021), the nav terminal minigame (019) and the engine (020)', () => {
  const stage = doc.quests.find(q => q.id === questId).stages[0];
  const targets = Object.fromEntries(stage.objectives.map(o => [o.id, [o.type, o.targetId]]));
  assert.deepEqual(targets, {
    QUEST_CH02_MAIN_004_OBJ_03: ['interactionSucceeded', 'shipinterior-interaction-021'],
    QUEST_CH02_MAIN_004_OBJ_04: ['puzzleCompleted', NAV_TERMINAL_INTERACTION_ID],
    QUEST_CH02_MAIN_004_OBJ_05: ['interactionSucceeded', 'shipinterior-interaction-020'],
  });
  const manager = new QuestRuntimeManager(doc);
  manager.startQuest(questId);
  manager.handleEvent({ type: 'interactionSucceeded', targetId: 'shipinterior-interaction-021' });
  manager.handleEvent({ type: 'interactionSucceeded', targetId: 'shipinterior-interaction-020' });
  assert.equal(manager.getObjectiveProgress(questId, 'QUEST_CH02_MAIN_004_OBJ_03').completed, true);
  assert.equal(manager.getObjectiveProgress(questId, 'QUEST_CH02_MAIN_004_OBJ_05').completed, true);
  assert.equal(manager.isObjectiveInProgress(questId, 'QUEST_CH02_MAIN_004_OBJ_04'), true, 'stage still waits for the minigame');
  manager.handleEvent({ type: 'puzzleCompleted', targetId: NAV_TERMINAL_INTERACTION_ID });
  assert.equal(manager.getObjectiveProgress(questId, 'QUEST_CH02_MAIN_004_OBJ_04').completed, true);
});
