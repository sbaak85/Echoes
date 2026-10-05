// Verify real media calls through the production puzzle UI and preview input host.
const { chromium } = require(process.env.CODEX_PLAYWRIGHT_PATH || 'C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const scene = require('../public/maps/map_scene_06B.scene.json');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.testPad = { id: 'Simulated pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      navigator.getGamepads = () => [window.testPad];
      window.plantUiPlays = [];
      const actualPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        if (this.src.endsWith('/audio/ui-input.mp3')) window.plantUiPlays.push({ source: this.src, volume: this.volume });
        return actualPlay.apply(this, args);
      };
    });
    await page.goto(process.env.PLANT_PREVIEW_URL || 'http://127.0.0.1:3000/phototropic-preview');
    await page.waitForTimeout(1000); // Allow the server-rendered buttons to hydrate before opening.
    const audioCount = () => page.evaluate(() => window.plantUiPlays.length);
    const expectInput = async (input, delta, description) => {
      const before = await audioCount(); await input();
      assert.equal(await audioCount(), before + delta, description);
    };
    const axis = async (x, y = 0, duration = 90) => {
      await page.evaluate(({ x, y }) => { window.testPad.axes[0] = x; window.testPad.axes[1] = y; }, { x, y });
      await page.waitForTimeout(duration);
      await page.evaluate(() => { window.testPad.axes[0] = 0; window.testPad.axes[1] = 0; });
      await page.waitForTimeout(90);
    };
    const press = async (index, duration = 90) => {
      await page.evaluate(i => { window.testPad.buttons[i] = { pressed: true, value: 1 }; }, index);
      await page.waitForTimeout(duration);
      await page.evaluate(i => { window.testPad.buttons[i] = { pressed: false, value: 0 }; }, index);
      await page.waitForTimeout(90);
    };
    const open = async side => {
      await page.getByRole('button', { name: side === 'L' ? '互動 020 · 左側' : '互動 021 · 右側' }).click();
      const id = side === 'L' ? 'scene6-interaction-020' : 'scene6-interaction-021';
      const intro = page.locator(`.dialogue-box[data-dialogue-id="${id}"]`); await intro.waitFor();
      for (const line of scene.interactables.find(item => item.id === id).dialogue.lines) {
        await page.waitForFunction(line => document.querySelector('.dialogue-box')?.dataset.lineId === line.lineId && document.querySelector('.dialogue-text')?.textContent === line.text, line);
        await intro.click();
      }
      await page.locator('.plant-controls-unframed').waitFor();
      await page.mouse.move(24, 24); await page.waitForTimeout(120);
    };
    for (const side of ['L', 'R']) {
      await open(side);
      const slots = [1, 2, 3].map(index => page.getByRole('button', { name: side + index, exact: true }));
      const selected = page.locator('.plant-panel [data-selected=true]');
      await expectInput(() => axis(1, 0, 240), 1, 'entering gamepad navigation sounds once, without replay during intermediate held frames');
      assert.equal(await selected.getAttribute('aria-label'), side + '3');
      await expectInput(() => axis(-1), 1, 'selecting center sounds once');
      await expectInput(() => axis(-1), 1, 'selecting left sounds once');
      await expectInput(() => axis(1), 1, 'selecting center again sounds once');
      await expectInput(() => axis(0, 1, 500), 1, 'switching to return sounds once, even while holding vertically');
      assert.equal(await selected.getAttribute('class'), 'plant-confirm');
      await expectInput(() => axis(0, -1), 1, 'switching back to a slot sounds once');
      await expectInput(() => press(0, 350), 1, 'A placement sounds once; holding A and its automatic focus handoff add no extra sound');
      assert.equal(await slots[1].getAttribute('aria-pressed'), 'true');
      assert.equal(await selected.getAttribute('class'), 'plant-confirm');
      await expectInput(async () => {
        await page.evaluate(() => { window.testPad.axes[2] = 1; }); await page.waitForTimeout(150);
        await page.evaluate(() => { window.testPad.axes[2] = 0; }); await page.waitForTimeout(90);
      }, 0, 'continuous angle movement does not emit per-frame UI focus sounds');
      await expectInput(() => axis(0, -1), 1, 'switching to the occupied slot sounds once');
      await expectInput(() => press(0), 0, 'occupied-slot A performs no action or input sound');
      await expectInput(() => axis(0, 1), 1, 'switching to confirmation sounds once');
      await expectInput(() => press(0, 350), 1, 'A confirmation sounds once and cannot replay while held');
      await page.locator('.plant-puzzle-overlay').waitFor({ state: 'detached' });
      await open(side);
      await expectInput(() => axis(0, 1), 1, 'saved-session return focus sounds once');
      await expectInput(() => press(1, 350), 1, 'B return sounds once and cannot replay while held');
      await page.locator('.plant-puzzle-overlay').waitFor({ state: 'detached' });
      console.log(`PASS ${side}: three-slot navigation, return/confirmation focus, A placement/confirmation, B return, no held-frame or automatic-focus replay.`);
    }
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => window.plantUiPlays.length > 0 && window.plantUiPlays.every(play => play.volume === .7)));
    console.log('PASS production UI media path: ui-input.mp3 at the shared 70% volume. Gamepad inputs are simulated.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
