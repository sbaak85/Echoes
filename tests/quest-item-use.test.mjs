import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { allowsFullRecoveryForQuest } from "../app/quest-item-use.ts";
import { useSurvivalInventoryItem } from "../app/item-database.ts";
import { createInitialSurvivalState } from "../app/survival-manager.ts";

const document = JSON.parse(readFileSync(new URL('../public/quests/quest-data.json', import.meta.url), 'utf8'));
const questId = 'QUEST_CH03_MAIN_002';
const objectiveId = 'QUEST_CH03_MAIN_002_OBJ_02';
const host = { now: () => 10000, scheduleQuestStart: () => {} };
function activeManager() {
  const manager = new QuestRuntimeManager(document, host);
  manager.completeQuest('QUEST_CH03_MAIN_001');
  assert.equal(manager.startQuest(questId), true);
  return manager;
}
function use(manager, itemId = 'R0004', survival = createInitialSurvivalState(), inventory = { [itemId]: 2 }) {
  return useSurvivalInventoryItem(inventory, survival, itemId, {
    allowFullRecovery: allowsFullRecoveryForQuest(itemId, manager),
  });
}

test('飲水目標進行中：滿值仍可喝一瓶、回復封頂，完成目標後立即恢復限制', () => {
  const manager = activeManager();
  const result = use(manager);
  assert.equal(result.status, 'success');
  assert.equal(result.inventory.R0004, 1);
  assert.equal(result.survival.values.thirst, 100);
  manager.handleEvent({ type: 'itemUsed', targetId: 'R0004', amount: 1, eventId: 'test-drink' });
  assert.equal(manager.getObjectiveProgress(questId, objectiveId).completed, true);
  assert.equal(manager.isQuestActive(questId), true, 'Opening inventory is still pending');
  assert.equal(use(manager, 'R0004', result.survival, result.inventory).status, 'full');
  assert.equal(result.inventory.R0004, 1);
});

test('例外僅限淨水瓶，不免除持有數量，也不讓未開始任務提前使用', () => {
  assert.equal(use(null).status, 'full');
  const manager = new QuestRuntimeManager(document, host);
  assert.equal(use(manager).status, 'full');
  manager.completeQuest('QUEST_CH03_MAIN_001');
  assert.equal(use(manager).status, 'full');
  manager.startQuest(questId);
  assert.equal(use(manager, 'R0005').status, 'full');
  assert.equal(use(manager, 'R0004', createInitialSurvivalState(), {}).status, 'not-owned');
  assert.equal(manager.getObjectiveProgress(questId, objectiveId).completed, false);
});

test('口渴值未滿仍依道具正常回復，最多 100', () => {
  const survival = createInitialSurvivalState();
  survival.values.thirst = 95;
  const result = use(activeManager(), 'R0004', survival);
  assert.equal(result.status, 'success');
  assert.equal(result.survival.values.thirst, 100);
});

test('讀檔恢復依當前目標進度判定，未到啟動時間、失敗或已完成都不放行', () => {
  const save = activeManager().exportSave();
  assert.equal(use(new QuestRuntimeManager(document, host, save)).status, 'success');
  for (const state of ['failed', 'completed']) {
    const snapshot = structuredClone(save);
    snapshot.quests[questId].state = state;
    assert.equal(use(new QuestRuntimeManager(document, host, snapshot)).status, 'full');
  }
  for (const delayTarget of ['stage', 'objective']) {
    const snapshot = structuredClone(save);
    if (delayTarget === 'stage') snapshot.quests[questId].stageAvailableAtEpochMs = 11000;
    else snapshot.quests[questId].objectives[objectiveId].availableAtEpochMs = 11000;
    assert.equal(use(new QuestRuntimeManager(document, host, snapshot)).status, 'full');
  }
});
