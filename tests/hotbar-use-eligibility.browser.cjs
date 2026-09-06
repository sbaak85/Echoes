// Isolated runtime checks: never read or overwrite the player's portable save.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createInitialSurvivalState } = require('../app/survival-manager.ts');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const initialValue of [100, 60]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/save-data**', route => route.request().method() === 'GET'
        ? route.fulfill({ status: 404, json: { error: 'empty-slot' } })
        : route.fulfill({ status: 503, body: 'Read-only regression' }));
      await page.route('**/api/native-gamepad', route => route.fulfill({ json: { connected: false } }));
      const survival = createInitialSurvivalState();
      for (const metric of Object.keys(survival.values)) survival.values[metric] = initialValue;
      await page.addInitScript(survival => {
        localStorage.setItem('echoes:player-inventory:v1', JSON.stringify({ R0004: 3, R0005: 3 }));
        localStorage.setItem('echoes:hotbar-assignments:v1', JSON.stringify(['R0004', 'R0005']));
        localStorage.setItem('echoes:survival-state:v1', JSON.stringify(survival));
        // Test the hotbar outside chapter/tutorial scripts that overwrite survival.
        localStorage.setItem('echoes:story-progress:v2', JSON.stringify({ currentChapter: 99, completedEventIds: [], storyFlags: {} }));
        window.pad = { id: 'Xbox standard', index: 0, connected: true, mapping: 'standard',
          axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), timestamp: 0 };
        Object.defineProperty(navigator, 'getGamepads', { value: () => [window.pad] });
      }, survival);
      const press = async index => {
        await page.evaluate(index => window.pad.buttons[index] = { pressed: true, value: 1 }, index);
        await page.waitForTimeout(130);
        await page.evaluate(index => window.pad.buttons[index] = { pressed: false, value: 0 }, index);
        await page.waitForTimeout(160);
      };
      const slot = index => page.locator(`[data-hotbar-index="${index}"]`);
      const count = index => slot(index).locator('.hotbar-count').textContent();
      await page.goto(process.env.ECHOES_TEST_URL || 'http://127.0.0.1:3000');
      await page.waitForTimeout(18000);
      assert.equal(await count(0), '3');
      assert.equal(await count(1), '3');

      // Actual mouse hotbar path, followed by gamepad Y takeover on that slot.
      await slot(0).click();
      const waterCount = initialValue === 100 ? '3' : '2';
      assert.equal(await count(0), waterCount);
      if (initialValue === 100) {
        assert.match(await page.locator('.hotbar-feedback').textContent(), /未消耗道具/);
        await press(3);
        assert.equal(await count(0), '3');
      } else {
        await press(3); // 90 -> 100, exactly one more bottle.
        assert.equal(await count(0), '1');
        await press(3); // One frame's natural decay must not reopen eligibility.
        assert.equal(await count(0), '1');
      }

      // Mouse selects/uses ration; switch to Y, then back to mouse at full values.
      await slot(1).click();
      if (initialValue === 60) {
        assert.equal(await count(1), '2');
        await press(3); // stamina remains below the gate, so one use is valid.
        assert.equal(await count(1), '1');
      }
      const rationCount = initialValue === 100 ? '3' : '1';
      await press(3);
      await slot(1).click();
      assert.equal(await count(1), rationCount);
      assert.match(await page.locator('.hotbar-feedback').textContent(), /未消耗道具/);

      // The inventory's explicit Use action must honor the same gate.
      await page.locator('.inventory-trigger').click();
      const water = page.locator('.inventory-item').filter({ hasText: '淨水瓶' });
      await water.click();
      await page.locator('[data-inventory-action="use"]').click();
      assert.equal(await count(0), initialValue === 100 ? '3' : '1');
      assert.match(await page.locator('.hotbar-feedback').textContent(), /未消耗道具/);
      assert.deepEqual(errors, []);
      console.log(`PASS initial ${initialValue}: mouse, simulated Y, repeated use, ownership handoff, inventory gate`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
