import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { QuestRuntimeManager } from '../app/quest-runtime-manager.ts';
import { getStarCardsMatchWinner } from '../app/star-cards-game.ts';
import { completeStarCardsQuestMatch, STAR_CARDS_INTERACTION_ID as target, STAR_CARDS_QUEST_ID as quest, STAR_CARDS_OBJECTIVE_ID as objective } from '../app/star-cards-quest-flow.ts';
import { evaluateInteractionStageRequirement } from '../app/interaction-flow.ts';
const doc=JSON.parse(readFileSync(new URL('../public/quests/quest-data.json',import.meta.url)));
const scene=JSON.parse(readFileSync(new URL('../public/maps/ship_interior.scene.json',import.meta.url)));

test('only a complete first-to-three match produces a winner',()=>{
  for(const result of [{playerWins:0,aiWins:0},{playerWins:1,aiWins:0},{playerWins:2,aiWins:2},{playerWins:3,aiWins:3},{playerWins:4,aiWins:0}])assert.equal(getStarCardsMatchWinner(result),null);
  for(let losses=0;losses<3;losses++) {
    assert.equal(getStarCardsMatchWinner({playerWins:3,aiWins:losses}),'player');
    assert.equal(getStarCardsMatchWinner({playerWins:losses,aiWins:3}),'ai');
  }
});

test('017 victory completes only its active objective, persists and disables the interaction',()=>{
  const manager=new QuestRuntimeManager(doc);
  const win={playerWins:3,aiWins:2};
  assert.equal(completeStarCardsQuestMatch(manager,target,win),false,'locked quest');
  manager.completeQuest('QUEST_CH02_MAIN_001');
  manager.completeQuest('QUEST_CH02_MAIN_002');
  manager.startQuest(quest);
  assert.equal(completeStarCardsQuestMatch(manager,target,win),false,'wrong stage');
  manager.handleEvent({type:'itemCollected',targetId:'T0015',amount:1});
  manager.handleEvent({type:'itemSubmitted',targetId:'shipinterior-interaction-016',itemId:'T0015',amount:1});
  assert.equal(manager.isObjectiveInProgress(quest,objective),true);
  for(const type of ['interactionStarted','interactionSucceeded'])manager.handleEvent({type,targetId:target});
  assert.equal(manager.getObjectiveProgress(quest,objective).completed,false);
  for(const id of [undefined,'debug','shipinterior-interaction-011'])assert.equal(completeStarCardsQuestMatch(manager,id,win),false);
  for(const result of [{playerWins:1,aiWins:0},{playerWins:2,aiWins:2},{playerWins:2,aiWins:3}])assert.equal(completeStarCardsQuestMatch(manager,target,result),false);
  const restored=new QuestRuntimeManager(doc,{},manager.exportSave());
  assert.equal(restored.getObjectiveProgress(quest,objective).completed,false,'exit/reload without victory');
  assert.equal(completeStarCardsQuestMatch(restored,target,win),true);
  assert.equal(completeStarCardsQuestMatch(restored,target,win),false,'no duplicate victory');
  assert.equal(restored.getQuestState(quest),'completed');
  const reloaded=new QuestRuntimeManager(doc,{},restored.exportSave());
  assert.equal(reloaded.getObjectiveProgress(quest,objective).completed,true);
  const gate=scene.interactables.find(i=>i.id===target).useRequirements.find(r=>r.kind==='questStage');
  assert.equal(evaluateInteractionStageRequirement(gate,(q,s)=>reloaded.isQuestAtStage(q,s),(q,s)=>reloaded.hasQuestReachedStage(q,s),(q,o,s)=>reloaded.hasObjectiveReachedState(q,o,s)),false);
});
