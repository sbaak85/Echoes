import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BUS_CARD_INTERACTION_ID, BUS_CARD_OBJECTIVE_ID, isBusCardSolution } from '../app/bus-card-puzzle.ts';
import { QuestRuntimeManager } from '../app/quest-runtime-manager.ts';
import { evaluate, routeFor } from '../public/minigames/bus-card/model.mjs';

const doc = JSON.parse(readFileSync(new URL('../public/quests/quest-data.json', import.meta.url), 'utf8'));
const questId = 'QUEST_CH02_MAIN_001';
const objective = doc.quests.find(q => q.id === questId).stages[0].objectives.find(o => o.id === BUS_CARD_OBJECTIVE_ID);
test('only C / A / empty / B connects all three cards from source to core', () => {
  const permutations = values => values.length === 0 ? [[]] : values.flatMap((value, index) =>
    permutations(values.filter((_, other) => other !== index)).map(rest => [value, ...rest]));
  const layouts = permutations(['A', 'B', 'C', null]);
  assert.equal(layouts.length, 24);
  const expected = [['C', 'A', null, 'B']];
  assert.deepEqual(layouts.filter(slots => evaluate(slots).complete), expected);
  assert.deepEqual(layouts.filter(isBusCardSolution), expected);
  assert.deepEqual(evaluate(expected[0]).chain.map(route => [route.from, route.to]), [[0, 3], [3, 4], [4, 6]]);
  for (const slots of [['A','C','B',null], ['A',null,'C','B']]) {
    assert.equal(evaluate(slots).end, 1, 'old solutions stop at the disconnected 01 terminal');
    assert.equal(isBusCardSolution(slots), false);
  }
  for (const slots of [null, [], ['A','A',null,'B'], ['A',null,null,null], ['B','C','A',null], ['A','C','B','X'], ['A','C','B',null,null]]) assert.equal(isBusCardSolution(slots), false);
});

test('S03 routes backwards from 07 and keeps every card within the existing terminals', () => {
  for (const [card, to] of [['A', 6], ['B', 5], ['C', 4]]) {
    assert.deepEqual(routeFor(2, card), { slot: 2, card, from: 7, to });
  }
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
