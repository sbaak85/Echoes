const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { QuestRuntimeManager } = require('../app/quest-runtime-manager.ts');
const { createInitialSurvivalState } = require('../app/survival-manager.ts');
const document = JSON.parse(fs.readFileSync('public/quests/quest-data.json', 'utf8'));
const questId = 'QUEST_CH03_MAIN_002';
const objectiveId = 'QUEST_CH03_MAIN_002_OBJ_02';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const input of ['mouse', 'gamepad', 'inventory']) {
      const manager = new QuestRuntimeManager(document, { scheduleQuestStart: () => {} });
      manager.completeQuest('QUEST_CH03_MAIN_001');
      manager.startQuest(questId);
      const quest = manager.exportSave();
      // Fixture: prerequisite presentation has finished; no interrupted dialogue to resume.
      Object.assign(quest.quests.QUEST_CH03_MAIN_001, { questCompletionPresented: true, completionTriggerCompleted: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/save-data**', route => route.request().method() === 'GET'
        ? route.fulfill({ status: 404, json: { error: 'empty-slot' } })
        : route.fulfill({ status: 503, body: 'Read-only regression' }));
      await page.route('**/api/native-gamepad', route => route.fulfill({ json: { connected: false } }));
      await page.addInitScript(({ quest, survival }) => {
        localStorage.setItem('echoes:quest-runtime:v1', JSON.stringify(quest));
        localStorage.setItem('echoes:survival-state:v1', JSON.stringify(survival));
        localStorage.setItem('echoes:player-inventory:v1', JSON.stringify({ R0004: 3, R0005: 2 }));
        localStorage.setItem('echoes:hotbar-assignments:v1', JSON.stringify(['R0004', 'R0005']));
        localStorage.setItem('echoes:story-progress:v2', JSON.stringify({ currentChapter: 99, completedEventIds: [], storyFlags: { QUEST_CH03_MAIN_001_COMPLETED: true } }));
        window.pad = { id: 'Xbox standard', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), timestamp: 0 };
        Object.defineProperty(navigator, 'getGamepads', { value: () => [window.pad] });
      }, { quest, survival: createInitialSurvivalState() });
      await page.goto(process.env.ECHOES_TEST_URL || 'http://127.0.0.1:3000');
      // Fixture setup freezes survival before startup finishes; use actions below are real input.
      await page.locator('.survival-pause-trigger').dispatchEvent('click');
      await page.waitForTimeout(18000);
      // The saved prerequisite can trigger the two-line backpack introduction.
      // Finish it through the normal dialogue control before testing item use.
      for (let step = 0; step < 10 && await page.locator('.dialogue-box').count(); step++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(100);
      }
      assert.equal(await page.locator('.dialogue-box').count(), 0);
      const read = () => page.evaluate(() => ({
        survival: JSON.parse(localStorage.getItem('echoes:survival-state:v1')),
        inventory: JSON.parse(localStorage.getItem('echoes:player-inventory:v1')),
        quest: JSON.parse(localStorage.getItem('echoes:quest-runtime:v1')),
      }));
      // A startup frame may precede the pause click; this is still inside the
      // normal blocked range (>99). Exact 100 is covered by the unit regression.
      assert.ok((await read()).survival.values.thirst > 99);
      const initialCount = (await read()).inventory.R0004;
      await page.evaluate(() => {
        window.itemUseSurvivalWrites = [];
        const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (key === 'echoes:survival-state:v1') window.itemUseSurvivalWrites.push(JSON.parse(value));
          return write.call(this, key, value);
        };
      });
      if (input === 'inventory') {
        await page.locator('.inventory-trigger').click();
        await page.locator('.inventory-item').filter({ hasText: '淨水瓶' }).click();
        await page.locator('[data-inventory-action="use"]').click();
      } else if (input === 'mouse') {
        await page.locator('[data-hotbar-index="0"]').click();
      } else {
        await page.evaluate(() => window.pad.buttons[3] = { pressed: true, value: 1 });
        await page.waitForTimeout(150);
        await page.evaluate(() => window.pad.buttons[3] = { pressed: false, value: 0 });
      }
      await page.waitForTimeout(100);
      const result = await read();
      assert.equal(result.inventory.R0004, initialCount - 1, JSON.stringify({ input,
        feedback: await page.locator('.hotbar-feedback').allTextContents(),
        shell: await page.locator('.game-shell').getAttribute('class'),
        dialogs: await page.locator('[role="dialog"], .dialogue-box, .new-player-tutorial-overlay').allTextContents(),
        quest: result.quest.quests[questId], errors }));
      // Inventory completion may resume the world before this assertion. Verify
      // the actual use write reached 100, with no write ever exceeding the cap.
      const writes = await page.evaluate(() => window.itemUseSurvivalWrites);
      assert.ok(writes.some(state => state.values.thirst === 100));
      assert.ok(writes.every(state => state.values.thirst <= 100));
      assert.equal(result.quest.quests[questId].objectives[objectiveId].completed, true);
      if (input !== 'inventory') {
        await page.locator('[data-hotbar-index="0"]').click();
        assert.equal((await read()).inventory.R0004, initialCount - 1);
        assert.match(await page.locator('.hotbar-feedback').textContent(), /未消耗道具/);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${input}: bypass full-meter gate, consume one, complete objective, cap at 100`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
