const { chromium } = require(process.env.CODEX_PLAYWRIGHT_PATH || 'C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const scene = require('../public/maps/map_scene_06B.scene.json');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1488, height: 1002 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.vineVoices = []; window.vineSamples = [];
      const actualPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        if (/\/audio\/vine_\d\.mp3$/.test(this.src) && this.loop && !window.vineVoices.includes(this)) window.vineVoices.push(this);
        return actualPlay.apply(this, args);
      };
      const sample = () => {
        const active = window.vineVoices.filter(audio => !audio.paused && audio.volume > 0);
        if (active.length) window.vineSamples.push(active.map(audio => ({ source: audio.src, volume: audio.volume })));
        requestAnimationFrame(sample);
      }; requestAnimationFrame(sample);
    });
    await page.goto(process.env.PLANT_PREVIEW_URL || 'http://127.0.0.1:3000/phototropic-preview'); await page.waitForTimeout(1000);
    const activeCount = () => page.evaluate(() => window.vineVoices.filter(audio => !audio.paused && audio.volume > 0).length);
    const waitMoving = () => page.waitForFunction(() => window.vineVoices.filter(audio => !audio.paused && audio.volume > 0).length === 2);
    const waitStopped = () => page.waitForFunction(() => window.vineVoices.every(audio => audio.paused && audio.volume === 0), null, { timeout: 15000 });
    const open = async () => {
      await page.getByRole('button', { name: '互動 020 · 左側' }).click();
      const intro = page.locator('.dialogue-box'); await intro.waitFor();
      for (const line of scene.interactables.find(item => item.id === 'scene6-interaction-020').dialogue.lines) {
        await page.waitForFunction(line => document.querySelector('.dialogue-box')?.dataset.lineId === line.lineId && document.querySelector('.dialogue-text')?.textContent === line.text, line);
        await intro.click();
      }
      await page.locator('.plant-puzzle-overlay').waitFor();
    };
    await open(); await waitMoving();
    await page.locator('.plant-controls-unframed').waitFor(); await waitStopped();
    assert.equal(await page.evaluate(() => window.vineVoices.length), 2, 'entrance plays exactly one continuous voice per side');
    const entrance = await page.evaluate(() => window.vineSamples);
    assert.ok(entrance.length > 20);
    for (const frame of entrance) {
      assert.ok(frame.length <= 2);
      if (frame.length === 2) assert.notEqual(frame[0].source, frame[1].source);
      for (const audio of frame) assert.ok(audio.volume >= .1 && audio.volume <= .8);
    }
    const volumes = entrance.flat().map(audio => audio.volume);
    assert.ok(Math.max(...volumes) > .79 && Math.min(...volumes) < .2, 'initial growth audibly follows acceleration and deceleration');
    for (let i = 1; i <= 3; i++) {
      const response = await page.request.get(`http://127.0.0.1:3000/audio/vine_${i}.mp3`); assert.equal(response.status(), 200);
    }
    await page.getByRole('button', { name: 'L1', exact: true }).click(); await waitMoving(); await waitStopped();
    assert.equal(await page.evaluate(() => window.vineVoices.length), 4, 'retraction starts a fresh pair without per-frame replay');
    await page.getByRole('button', { name: 'L3', exact: true }).click(); await waitMoving();
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(80); assert.equal(await activeCount(), 0);
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await waitMoving();
    await page.keyboard.press('Escape'); await page.locator('.plant-puzzle-overlay').waitFor({ state: 'detached' }); await waitStopped();
    const beforeReopen = await page.evaluate(() => window.vineVoices.length);
    await open(); await page.locator('.plant-controls-unframed').waitFor(); await page.waitForTimeout(1200);
    assert.equal(await activeCount(), 0); assert.equal(await page.evaluate(() => window.vineVoices.length), beforeReopen, 'restoring stationary vines makes no false growth sound');
    await page.getByRole('slider', { name: '照射角度' }).press('ArrowRight'); await waitMoving();
    await page.keyboard.press('Escape'); await page.locator('.plant-puzzle-overlay').waitFor({ state: 'detached' }); await waitStopped();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ pass: true, pool: 3, entranceVoices: 2, volumeRange: [Math.min(...volumes), Math.max(...volumes)], verified: ['growth', 'retraction', 'extension', 'angle movement', 'distinct left/right tracks', 'no per-frame restart', 'stop at equilibrium', 'blur/focus', 'unmount', 'stationary reopen'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
