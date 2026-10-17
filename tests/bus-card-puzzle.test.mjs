import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BUS_CARD_INTERACTION_ID, BUS_CARD_OBJECTIVE_ID, isBusCardSolution } from '../app/bus-card-puzzle.ts';
import { QuestRuntimeManager } from '../app/quest-runtime-manager.ts';

const doc = JSON.parse(readFileSync(new URL('../public/quests/quest-data.json', import.meta.url), 'utf8'));
const questId = 'QUEST_CH02_MAIN_001';
const objective = doc.quests.find(q => q.id === questId).stages[0].objectives.find(o => o.id === BUS_CARD_OBJECTIVE_ID);
test('three distinct cards must form the complete source-to-core chain', () => {
  for (const slots of [['A','C','B',null],['A',null,'C','B'],['C','A',null,'B']]) assert.equal(isBusCardSolution(slots), true);
  for (const slots of [null, [], ['A','A',null,'B'], ['A',null,null,null], ['B','C','A',null], ['A','C','B','X'], ['A','C','B',null,null]]) assert.equal(isBusCardSolution(slots), false);
});
test('OBJ03 remains gated behind breakfast and accepts only this puzzle completion', () => {
  assert.equal(objective.type, 'puzzleCompleted');
  assert.equal(objective.targetId, BUS_CARD_INTERACTION_ID);
  assert.equal(objective.activationEventId, 'QUEST_CH02_MAIN_001_OBJ_02');
  const manager = new QuestRuntimeManager(doc);
  manager.startQuest(questId);
  manager.handleEvent({ type:'puzzleCompleted', targetId:BUS_CARD_INTERACTION_ID });
  assert.equal(manager.getObjectiveProgress(questId, BUS_CARD_OBJECTIVE_ID).completed, false);
  manager.handleEvent({ type:'interactionSucceeded', targetId:'shipinterior-interaction-009' });
  manager.handleEvent({ type:'inventoryChanged', targetId:'R0050', amount:1 });
  assert.equal(manager.isObjectiveInProgress(questId, BUS_CARD_OBJECTIVE_ID), true);
  for (const type of ['interactionStarted','interactionSucceeded']) {
    manager.handleEvent({ type, targetId:BUS_CARD_INTERACTION_ID });
    assert.equal(manager.getObjectiveProgress(questId, BUS_CARD_OBJECTIVE_ID).completed, false);
  }
  manager.handleEvent({ type:'puzzleCompleted', targetId:'different-puzzle' });
  assert.equal(manager.getObjectiveProgress(questId, BUS_CARD_OBJECTIVE_ID).completed, false);
  const savedBefore = manager.exportSave();
  const restored = new QuestRuntimeManager(doc, {}, savedBefore);
  assert.equal(restored.getObjectiveProgress(questId, BUS_CARD_OBJECTIVE_ID).completed, false, 'exit/reload must not complete the objective');
  restored.handleEvent({ type:'puzzleCompleted', targetId:BUS_CARD_INTERACTION_ID, eventId:'bus-success' });
  assert.equal(restored.getObjectiveProgress(questId, BUS_CARD_OBJECTIVE_ID).completed, true);
  assert.equal(new QuestRuntimeManager(doc, {}, restored.exportSave()).getObjectiveProgress(questId, BUS_CARD_OBJECTIVE_ID).completed, true);
});
