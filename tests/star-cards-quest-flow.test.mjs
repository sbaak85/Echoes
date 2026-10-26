import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { QuestRuntimeManager } from '../app/quest-runtime-manager.ts';
import { getStarCardsMatchWinner } from '../app/star-cards-game.ts';
import { completeStarCardsQuestMatch, STAR_CARDS_INTERACTION_ID as target, STAR_CARDS_QUEST_ID as quest, STAR_CARDS_OBJECTIVE_ID as objective } from '../app/star-cards-quest-flow.ts';
import { evaluateInteractionStageRequirement, isInteractionRetired } from '../app/interaction-flow.ts';
const doc=JSON.parse(readFileSync(new URL('../public/quests/quest-data.json',import.meta.url)));
const scene=JSON.parse(readFileSync(new URL('../public/maps/ship_interior.scene.json',import.meta.url)));

test('only a complete first-to-three match produces a winner',()=>{
  for(const result of [{playerWins:0,aiWins:0},{playerWins:1,aiWins:0},{playerWins:2,aiWins:2},{playerWins:3,aiWins:3},{playerWins:4,aiWins:0}])assert.equal(getStarCardsMatchWinner(result),null);
  for(let losses=0;losses<3;losses++) {
    assert.equal(getStarCardsMatchWinner({playerWins:3,aiWins:losses}),'player');
    assert.equal(getStarCardsMatchWinner({playerWins:losses,aiWins:3}),'ai');
  }
});

test('017 finished match (win or loss) completes only its active objective and persists',()=>{
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
  // 比賽還沒分出勝負（中途退出）不算完成
  for(const result of [{playerWins:0,aiWins:0},{playerWins:1,aiWins:0},{playerWins:2,aiWins:2}])assert.equal(completeStarCardsQuestMatch(manager,target,result),false);
  const restored=new QuestRuntimeManager(doc,{},manager.exportSave());
  assert.equal(restored.getObjectiveProgress(quest,objective).completed,false,'exit/reload without a finished match');
  assert.equal(completeStarCardsQuestMatch(restored,target,win),true);
  assert.equal(completeStarCardsQuestMatch(restored,target,win),false,'no duplicate victory');
  assert.equal(restored.getQuestState(quest),'completed');
  const reloaded=new QuestRuntimeManager(doc,{},restored.exportSave());
  assert.equal(reloaded.getObjectiveProgress(quest,objective).completed,true);
  const gate=scene.interactables.find(i=>i.id===target).useRequirements.find(r=>r.kind==='questStage');
  // 017 的開放條件仍成立，但 OBJ_03 完成時由「移除」條件撤下（見下方 isInteractionRetired），改由 018 負責重玩
  assert.equal(evaluateInteractionStageRequirement(gate,(q,s)=>reloaded.isQuestAtStage(q,s),(q,s)=>reloaded.hasQuestReachedStage(q,s),(q,o,s)=>reloaded.hasObjectiveReachedState(q,o,s)),true);
});

test('017 match end plays the result dialogue: victory section-8, defeat section-9; debug launches play none', async () => {
  const flow = await import('../app/star-cards-quest-flow.ts');
  assert.equal(flow.getStarCardsPostMatchDialogueId(target, {playerWins:3,aiWins:1}), 'chapter02-section-8');
  assert.equal(flow.getStarCardsPostMatchDialogueId(target, {playerWins:2,aiWins:3}), 'chapter02-section-9');
  assert.equal(flow.getStarCardsPostMatchDialogueId(target, {playerWins:2,aiWins:2}), null, 'match not finished');
  for (const id of [undefined, 'debug', 'shipinterior-interaction-011'])
    assert.equal(flow.getStarCardsPostMatchDialogueId(id, {playerWins:3,aiWins:0}), null);
  const lab = readFileSync(new URL('../app/movement-lab.tsx', import.meta.url), 'utf8');
  assert.match(lab, /starCardsPostMatchDialogueRef\.current =\s*getStarCardsPostMatchDialogueId\(session\?\.interactable\.id, result\);/);
  assert.match(lab, /if \(postMatchDialogueId\) playStarCardsPostMatchDialogueRef\.current\(postMatchDialogueId\);/);
});

test('losing a full 017 match also completes OBJ_03', () => {
  const manager = new QuestRuntimeManager(doc);
  manager.completeQuest('QUEST_CH02_MAIN_001');
  manager.completeQuest('QUEST_CH02_MAIN_002');
  manager.startQuest(quest);
  manager.handleEvent({type:'itemCollected',targetId:'T0015',amount:1});
  manager.handleEvent({type:'itemSubmitted',targetId:'shipinterior-interaction-016',itemId:'T0015',amount:1});
  assert.equal(manager.isObjectiveInProgress(quest, objective), true);
  assert.equal(completeStarCardsQuestMatch(manager, target, {playerWins:2, aiWins:3}), true);
  assert.equal(manager.getObjectiveProgress(quest, objective).completed, true);
});

test('017 plays section-7 once during OBJ_03, then its own dialogue; after the stage it only talks', async () => {
  const flow = await import('../app/star-cards-quest-flow.ts');
  assert.equal(flow.STAR_CARDS_INTRO_DIALOGUE_ID, 'chapter02-section-7');
  assert.equal(flow.getStarCardsInteractionPlan(true, {}), 'intro-then-match');
  assert.equal(flow.getStarCardsInteractionPlan(true, {[flow.STAR_CARDS_INTRO_PLAYED_FLAG]: true}), 'dialogue-then-match');
  assert.equal(flow.getStarCardsInteractionPlan(false, {}), 'dialogue-only');
  assert.equal(flow.getStarCardsInteractionPlan(false, {[flow.STAR_CARDS_INTRO_PLAYED_FLAG]: true}), 'dialogue-only');
  const lab = readFileSync(new URL('../app/movement-lab.tsx', import.meta.url), 'utf8');
  assert.match(lab, /playRegistered\(STAR_CARDS_INTRO_DIALOGUE_ID, interactable, \(\) => \{\s*try \{ setStoryFlag\(STAR_CARDS_INTRO_PLAYED_FLAG, true\); \}/);
  assert.match(lab, /if \(starCardsPlan && starCardsPlan !== "dialogue-only"\) \{/);
});

test('017 retires after OBJ_03; 018 opens only after it, asks with a dialogue choice and never touches the quest', async () => {
  const flow = await import('../app/star-cards-quest-flow.ts');
  const manager = new QuestRuntimeManager(doc);
  manager.completeQuest('QUEST_CH02_MAIN_001');
  manager.completeQuest('QUEST_CH02_MAIN_002');
  manager.startQuest(quest);
  manager.handleEvent({type:'itemCollected',targetId:'T0015',amount:1});
  manager.handleEvent({type:'itemSubmitted',targetId:'shipinterior-interaction-016',itemId:'T0015',amount:1});
  const i017 = scene.interactables.find(i => i.id === target);
  const i018 = scene.interactables.find(i => i.id === flow.STAR_CARDS_REPLAY_INTERACTION_ID);
  assert.ok(i018, '018 exists in ship_interior');
  const reached = (q,s) => manager.hasQuestReachedStage(q,s), at = (q,s) => manager.isQuestAtStage(q,s), obj = (q,o,s) => manager.hasObjectiveReachedState(q,o,s);
  const gate018 = i018.useRequirements.find(r => r.kind === 'questStage');
  assert.equal(evaluateInteractionStageRequirement(gate018, at, reached, obj), false, '018 hidden before the first match');
  assert.equal(isInteractionRetired(i017.useRequirements, reached, obj), false);
  assert.equal(flow.completeStarCardsQuestMatch(manager, flow.STAR_CARDS_REPLAY_INTERACTION_ID, {playerWins:3, aiWins:0}), false, 'replays never complete OBJ_03');
  assert.equal(flow.getStarCardsPostMatchDialogueId(flow.STAR_CARDS_REPLAY_INTERACTION_ID, {playerWins:3, aiWins:0}), null, 'replays play no result script');
  assert.equal(flow.completeStarCardsQuestMatch(manager, target, {playerWins:1, aiWins:3}), true);
  assert.equal(isInteractionRetired(i017.useRequirements, reached, obj), true, '017 removed after the first finished match');
  assert.equal(evaluateInteractionStageRequirement(gate018, at, reached, obj), true, '018 available afterwards');
  assert.equal(i018.npcId, 'npc-owen');
  assert.deepEqual(i018.dialogue.choice.options.map(o => [o.label, o.action, o.replyLines[0].text]),
    [['好啊', 'continue', '好啊，誰怕誰。'], ['先不用', 'cancel', '先不了，下次吧。']]);
});
