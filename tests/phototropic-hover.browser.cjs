// Exercise real hover visibility and input handoffs in the shared puzzle UI.
const { chromium } = require(process.env.CODEX_PLAYWRIGHT_PATH || 'C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const scene = require('../public/maps/map_scene_06B.scene.json');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 978, height: 972 }, hasTouch: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.testPad = { id: 'Simulated pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      navigator.getGamepads = () => [window.testPad];
      window.hoverUiPlays = [];
      const actualPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        if (this.src.endsWith('/audio/ui-input.mp3')) window.hoverUiPlays.push({ source: this.src, volume: this.volume });
        return actualPlay.apply(this, args);
      };
    });
    await page.goto(process.env.PLANT_PREVIEW_URL || 'http://127.0.0.1:3000/phototropic-preview');
    await page.waitForTimeout(1000);
    const padPress = async index => {
      await page.evaluate(i => window.testPad.buttons[i] = { pressed: true, value: 1 }, index); await page.waitForTimeout(90);
      await page.evaluate(i => window.testPad.buttons[i] = { pressed: false, value: 0 }, index); await page.waitForTimeout(90);
    };
    const waitMode = mode => page.waitForFunction(mode => document.querySelector('.plant-puzzle-overlay')?.dataset.controlMode === mode, mode);
    const visibleTips = page.locator('.plant-place-tip:visible');
    const audioCount = () => page.evaluate(() => window.hoverUiPlays.length);
    const hover = async slot => {
      await page.mouse.move(24, 24); const before = await audioCount();
      await slot.hover(); await waitMode('mouse');
      assert.equal(await audioCount(), before + 1, 'entering a control plays the inventory input sound once');
    };
    for (const side of ['L', 'R']) {
      await page.getByRole('button', { name: side === 'L' ? '互動 020 · 左側' : '互動 021 · 右側' }).click();
      const id = side === 'L' ? 'scene6-interaction-020' : 'scene6-interaction-021';
      const intro = page.locator(`.dialogue-box[data-dialogue-id="${id}"]`); await intro.waitFor();
      for (const line of scene.interactables.find(item => item.id === id).dialogue.lines) {
        await page.waitForFunction(line => document.querySelector('.dialogue-box')?.dataset.lineId === line.lineId && document.querySelector('.dialogue-text')?.textContent === line.text, line);
        await intro.click();
      }
      await page.locator('.plant-controls-unframed').waitFor();
      const slots = [1, 2, 3].map(index => page.getByRole('button', { name: side + index, exact: true }));
      for (const slot of slots) {
        await hover(slot);
        assert.equal(await visibleTips.count(), 1);
        assert.equal(await visibleTips.innerText(), '擺放');
        const icon = visibleTips.locator('img');
        assert.ok((await icon.getAttribute('src')).endsWith('/ui/input/mouse-left.svg'));
        assert.equal(await icon.getAttribute('alt'), '滑鼠左鍵');
        await page.waitForFunction(() => document.querySelector('.plant-slots button:hover .plant-place-input-icon')?.naturalWidth > 0);
        const tileBox = await slot.boundingBox(), tipBox = await visibleTips.boundingBox();
        assert.ok(Math.abs(tileBox.x + tileBox.width / 2 - tipBox.x - tipBox.width / 2) < 1, 'hint stays centered under the hovered tile');
        assert.ok(tipBox.y >= tileBox.y + tileBox.height + 6, 'hint stays below the tile');
        assert.equal(await visibleTips.evaluate(element => getComputedStyle(element).pointerEvents), 'none');
        assert.equal(await page.locator('.plant-panel [data-selected=true]').count(), 0, 'mouse hover does not retain directional selection');
        const before = await audioCount();
        await slot.locator('.plant-slot-label').hover(); await page.waitForTimeout(120);
        await slot.hover(); await page.waitForTimeout(120);
        assert.equal(await audioCount(), before, 'movement over the same tile and its children never replays sound');
      }
      if (side === 'L' && process.env.PLANT_SUCCESS_SCREENSHOT_DIR) await page.screenshot({ path: process.env.PLANT_SUCCESS_SCREENSHOT_DIR + '/plant-slot-mouse-hover.png' });
      await page.mouse.move(24, 24); assert.equal(await visibleTips.count(), 0);
      await page.keyboard.press('ArrowRight'); await waitMode('directional'); assert.equal(await visibleTips.count(), 0, 'keyboard does not inherit mouse tips');
      await hover(slots[1]); assert.equal(await visibleTips.count(), 1);
      await page.evaluate(() => window.testPad.axes[0] = 1); await page.waitForTimeout(90);
      await page.evaluate(() => window.testPad.axes[0] = 0); await page.waitForTimeout(90);
      await waitMode('directional'); assert.equal(await visibleTips.count(), 1);
      assert.equal(await visibleTips.locator('[data-gamepad-glyph=A]').count(), 1, 'gamepad alone supplies the placement glyph');
      assert.equal(await page.locator('.plant-place-input-icon').count(), 0);
      const beforeTouch = await audioCount();
      await slots[0].tap(); await waitMode('touch'); assert.equal(await visibleTips.count(), 0, 'touch and compatibility events do not retain hover hints');
      assert.equal(await audioCount(), beforeTouch + 1, 'touch plays the click sound once without synthesized hover audio');
      assert.equal(await slots[0].getAttribute('aria-pressed'), 'true');
      await hover(slots[0]); assert.equal(await visibleTips.count(), 0, 'occupied tile has no placement hint');
      await hover(slots[1]); assert.equal(await visibleTips.count(), 1);
      await slots[1].tap(); await waitMode('touch'); assert.equal(await visibleTips.count(), 0);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); // Neutral rearm after touch takeover.
      await page.evaluate(() => window.testPad.axes[0] = 1); await page.waitForTimeout(90);
      await page.evaluate(() => window.testPad.axes[0] = 0); await page.waitForTimeout(90);
      await waitMode('directional'); assert.equal(await page.locator('.plant-place-input-icon').count(), 0);
      await hover(slots[1]); assert.equal(await visibleTips.count(), 0);
      await hover(slots[2]); assert.equal(await visibleTips.count(), 1);
      const beforeClick = await audioCount();
      await slots[2].click(); assert.equal(await visibleTips.count(), 0, 'clicking places once and removes the now-invalid hint');
      assert.equal(await audioCount(), beforeClick + 1, 'mouse click sounds once without a duplicate DOM-focus sound');
      assert.equal(await slots[2].getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.plant-slots button[aria-pressed=true]').count(), 1);
      const dial = page.getByRole('slider', { name: '照射角度' });
      await hover(dial); const beforeDrag = await audioCount();
      await dial.locator('.plant-dial-grip').hover(); await page.waitForTimeout(120);
      assert.equal(await audioCount(), beforeDrag, 'the dial handle is part of the same hover target');
      await hover(page.locator('.plant-confirm'));
      await padPress(1); await page.locator('.plant-puzzle-overlay').waitFor({ state: 'detached' });
    }
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => window.hoverUiPlays.every(play => play.volume === .7)));
    console.log('PASS both sides: mouse hints and handoffs; hover, mouse clicks and touch clicks use inventory ui-input.mp3 at 70%, without duplicate DOM-focus or synthesized-hover sound. Gamepad and touch inputs are simulated.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
