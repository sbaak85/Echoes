const { chromium } = require(process.env.CODEX_PLAYWRIGHT_PATH || 'C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const scene = require('../public/maps/map_scene_06B.scene.json');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1488, height: 1002 }, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.testPad = { id: 'Simulated pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      navigator.getGamepads = () => [window.testPad];
      localStorage.setItem('echoes:interaction-key', 'f');
    });
    await page.goto('http://127.0.0.1:3000/phototropic-preview'); await page.waitForTimeout(1000);
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    const padPress = async index => {
      await page.evaluate(i => window.testPad.buttons[i] = { pressed: true, value: 1 }, index); await page.waitForTimeout(90);
      await page.evaluate(i => window.testPad.buttons[i] = { pressed: false, value: 0 }, index); await page.waitForTimeout(90);
    };
    for (const side of ['L', 'R']) {
      const id = `scene6-interaction-0${side === 'L' ? '20' : '21'}`, lines = scene.interactables.find(i => i.id === id).dialogue.lines;
      await page.getByRole('button', { name: side === 'L' ? '互動 020 · 左側' : '互動 021 · 右側' }).click();
      const box = page.locator('.dialogue-box'); await box.waitFor();
      assert.equal(await box.getAttribute('data-dialogue-id'), id);
      assert.equal(await page.locator('.dialogue-history-trigger, .plant-controls-unframed').count(), 0);
      assert.equal(await page.getByRole('button', { name: '繼續對話' }).count(), 0);
      await padPress(6); assert.equal(await page.locator('.dialogue-history-overlay').count(), 0);
      await page.waitForFunction(text => document.querySelector('.dialogue-text')?.textContent === text, lines[0].text);
      await page.keyboard.press('f'); // Use the same user-remapped interaction key.
      await page.waitForFunction(id => document.querySelector('.dialogue-box')?.getAttribute('data-line-id') === id, lines[1].lineId);
      const review = page.locator('.dialogue-history-trigger'); await review.waitFor();
      assert.ok(await review.evaluate(element => {
        const box = element.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('.dialogue-history-trigger') === element;
      }), 'review hint must appear above the illustration and receive pointer input');
      await review.click(); await page.locator('.dialogue-history-overlay').waitFor();
      await page.keyboard.press('Escape'); await page.locator('.dialogue-history-overlay').waitFor({ state: 'detached' });
      await box.click({ button: 'right' });
      await page.locator('.dialogue-history-overlay').waitFor();
      assert.equal(await page.locator('.dialogue-history-entry p').innerText(), lines[0].text);
      const paused = await page.locator('.dialogue-text').innerText();
      await page.waitForTimeout(400); assert.equal(await page.locator('.dialogue-text').innerText(), paused);
      await page.keyboard.press('Escape'); await page.locator('.dialogue-history-overlay').waitFor({ state: 'detached' });
      await padPress(6); await page.locator('.dialogue-history-overlay').waitFor();
      assert.ok(await page.locator('.dialogue-history-close [data-gamepad-glyph="LT"]').count());
      await padPress(1); await page.locator('.dialogue-history-overlay').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.plant-controls-unframed').count(), 0);
      await page.waitForFunction(text => document.querySelector('.dialogue-text')?.textContent === text, lines[1].text);
      if (process.env.PLANT_SUCCESS_SCREENSHOT_DIR) await page.screenshot({ path: process.env.PLANT_SUCCESS_SCREENSHOT_DIR + `/plant-intro-shared-${side}.png` });
      if (side === 'L') await padPress(0); else await box.tap();
      await page.locator('.plant-controls-unframed').waitFor();
      assert.equal(await box.count(), 0); assert.equal(await page.locator('.dialogue-history-overlay').count(), 0);
      // The closing A/tap cannot place a glowstick in the newly revealed puzzle.
      assert.equal(await page.locator('.plant-slots button[aria-pressed=true]').count(), 0);
      await page.keyboard.press('Escape'); await page.locator('.plant-puzzle-overlay').waitFor({ state: 'detached' });
    }
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storage, 'preview does not write player saves or progress');
    assert.deepEqual(errors, []);
    console.log('PASS both real Scene 6 intro scripts: production typewriter/view/history; remapped keyboard interaction; right mouse/LT review; typing pause/resume; Escape/B close history; A/touch completion; no click-through placement; no player-storage writes. Controller and touch input are simulated.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
