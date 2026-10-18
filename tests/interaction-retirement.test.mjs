import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { evaluateInteractionStageRequirement, isInteractionRetired, normalizeInteractionUseRequirements, shouldExposeInteraction } from '../app/interaction-flow.ts';
import { QuestRuntimeManager } from '../app/quest-runtime-manager.ts';

const gate = {
  kind:'questStage', scope:'interaction', questId:'Q', stageId:'S1', stageMode:'UnlockUntilCondition',
  disableQuestId:'Q', disableStageId:'S2', removeQuestId:'Q', removeStageId:'S3',
};
const definition = {schemaVersion:1, chapters:[{id:'CH02',name:'Test',completionQuestIds:[]}],quests:[{
  id:'Q',name:'Test',chapterId:'CH02',type:'main',grantMethod:'automatic',prerequisiteQuestIds:[],
  stages:[1,2,3].map(n=>({id:`S${n}`,name:`S${n}`,completionMode:'all',nextStageId:n<3?`S${n+1}`:'',
    objectives:[{id:`O${n}`,displayText:'Step',type:'interactionSucceeded',targetId:`I${n}`,requiredAmount:1}]})),
}]};
const retired = (manager, requirement=gate) => isInteractionRetired([requirement],
  (q,s)=>manager.hasQuestReachedStage(q,s), (q,o,s)=>manager.hasObjectiveReachedState(q,o,s));

test('enable at S1, close at S2, remove only at S3; removal survives completion and reload',()=>{
  let manager=new QuestRuntimeManager(definition);
  const enabled=()=>evaluateInteractionStageRequirement(gate,
    (q,s)=>manager.isQuestAtStage(q,s), (q,s)=>manager.hasQuestReachedStage(q,s));
  assert.equal(retired(manager),false);
  manager.startQuest('Q');assert.equal(retired(manager),false);
  assert.equal(enabled(),true);
  manager.handleEvent({type:'interactionSucceeded',targetId:'I1'});
  assert.equal(enabled(),false,'the ordinary closing stage is already reached');
  assert.equal(retired(manager),false,'closing must not retire the interaction early');
  assert.equal(shouldExposeInteraction(true,true,retired(manager)),true,'failed attempts remain available during the closed interval');
  manager.handleEvent({type:'interactionSucceeded',targetId:'I2'});
  assert.equal(retired(manager),true);
  assert.equal(shouldExposeInteraction(false,true,retired(manager)),false,'retirement overrides failed-attempt setting');
  manager.handleEvent({type:'interactionSucceeded',targetId:'I3'});
  manager=new QuestRuntimeManager(definition,{},manager.exportSave());
  assert.equal(retired(manager),true);
  assert.equal(manager.getQuestState('Q'),'completed');
  assert.equal(manager.getObjectiveProgress('Q','O1').completed,true);
  assert.equal(retired(new QuestRuntimeManager(definition)),false,'new game starts clean');
});

test('optional removal OBJ waits independently of the closing OBJ',()=>{
  const manager=new QuestRuntimeManager(definition);manager.startQuest('Q');
  manager.handleEvent({type:'interactionSucceeded',targetId:'I1'});
  const objectiveGate={...gate,removeStageId:'S2',removeObjectiveId:'O2',removeObjectiveState:'completed',
    disableObjectiveId:'O1',disableObjectiveState:'completed'};
  assert.equal(retired(manager,objectiveGate),false);
  assert.equal(retired(manager,{...objectiveGate,removeObjectiveState:'unlocked'}),true);
  manager.handleEvent({type:'interactionSucceeded',targetId:'I2'});
  assert.equal(retired(manager,objectiveGate),true);
});

test('missing or incomplete independent removal conditions do not retire interactions',()=>{
  for(const value of [{...gate,removeQuestId:undefined,removeStageId:undefined},{...gate,removeStageId:''}]) {
    const normalized=normalizeInteractionUseRequirements([value],()=>null);
    assert.equal(isInteractionRetired(normalized,()=>true,()=>true),false);
  }
  assert.equal(shouldExposeInteraction(true,true),true);
  const normalized=normalizeInteractionUseRequirements([{...gate,removeObjectiveId:' O2 ',removeObjectiveState:'completed'}],()=>null);
  assert.equal(normalized[0].removeStageId,'S3');
  assert.equal(normalized[0].removeObjectiveId,'O2');
  assert.equal(isInteractionRetired([{...gate,scope:'prompt'},{kind:'item',itemId:'T0015',quantity:1}],()=>true),true);
});

test('removal can use another quest and works without closing conditions in every enable mode',()=>{
  for(const stageMode of ['CurrentStageOnly','UnlockFromStage','UnlockUntilCondition']) {
    const normalized=normalizeInteractionUseRequirements([{...gate,stageMode,
      disableQuestId:'',disableStageId:'',removeQuestId:'OTHER',removeStageId:'OTHER_S2'}],()=>null);
    assert.equal(isInteractionRetired(normalized,(q,s)=>q==='Q'&&s==='S3'),false);
    assert.equal(isInteractionRetired(normalized,(q,s)=>q==='OTHER'&&s==='OTHER_S2'),true);
  }
});

test('old combined close/remove setting migrates, but explicit removal takes precedence',()=>{
  const legacy={...gate,removeQuestId:undefined,removeStageId:undefined,removeWhenDisabled:true,
    disableObjectiveId:'O2',disableObjectiveState:'completed'};
  const normalized=normalizeInteractionUseRequirements([legacy],()=>null);
  assert.equal(normalized[0].removeQuestId,'Q');
  assert.equal(normalized[0].removeStageId,'S2');
  assert.equal(normalized[0].removeObjectiveId,'O2');
  assert.equal(normalized[0].removeWhenDisabled,undefined);
  assert.equal(isInteractionRetired([{...gate,removeWhenDisabled:true}],(q,s)=>s==='S2'),false);
});

test('runtime rejects stale activation, settlement and failure dialogue, and applies retirement to visibility',()=>{
  const source=readFileSync(new URL('../app/movement-lab.tsx',import.meta.url),'utf8');
  for(const name of ['triggerInteraction','completeInteraction','openInteractionFailureDialogue']) {
    const start=source.indexOf(`const ${name} = (`);
    assert.ok(start>0);
    assert.match(source.slice(start,start+430),/if \(isInteractableRetired\(interactable\)\) return false;/);
  }
  const start=source.indexOf('const isInteractableConditionActive = (');
  assert.match(source.slice(start,start+450),/shouldExposeInteraction\([\s\S]*isInteractableRetired\(interactable\)/);
});
