const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createInitialSurvivalState } = require('../app/survival-manager.ts');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/save-data**', route => route.request().method() === 'GET'
      ? route.fulfill({ status: 404, json: { error: 'empty-slot' } })
      : route.fulfill({ status: 503, body: 'Read-only regression' }));
    await page.route('**/api/native-gamepad', route => route.fulfill({ json: { connected: false } }));
    await page.addInitScript(survival => {
      localStorage.setItem('echoes:survival-state:v1', JSON.stringify(survival));
      localStorage.setItem('echoes:story-progress:v2', JSON.stringify({ currentChapter: 99, completedEventIds: [], storyFlags: {} }));
    }, createInitialSurvivalState());
    await page.goto(process.env.ECHOES_TEST_URL || 'http://127.0.0.1:3000');
    await page.waitForTimeout(18000);
    const readSaved = () => page.evaluate(() => JSON.parse(localStorage.getItem('echoes:survival-state:v1')));
    await page.evaluate(() => {
      const meter = document.querySelector('.survival-stat.is-thirst .survival-meter i');
      if (!meter) throw new Error('Missing survival HUD');
      window.survivalChanges = [];
      window.survivalObserver = new MutationObserver(() => window.survivalChanges.push(performance.now()));
      window.survivalObserver.observe(meter, { attributes: true, attributeFilter: ['style'] });
    });
    await page.waitForTimeout(3200);
    const changes = await page.evaluate(() => window.survivalChanges.length);
    assert.ok(changes >= 2 && changes <= 5, `Expected roughly one HUD update/sec, got ${changes}`);
    console.log(`PASS ${changes} survival HUD updates in 3.2 seconds`);

    await page.evaluate(() => {
      const clock = document.querySelector('.survival-clock > span:last-child strong');
      if (!clock) throw new Error('Missing clock');
      let previous = clock.textContent;
      window.clockChanges = [];
      window.clockObserver = new MutationObserver(() => {
        if (clock.textContent === previous) return;
        previous = clock.textContent;
        window.clockChanges.push({ time: performance.now(), text: previous });
      });
      window.clockObserver.observe(clock, { childList: true, characterData: true, subtree: true });
    });
    await page.waitForTimeout(10500);
    const minutes = await page.evaluate(() => window.clockChanges);
    assert.ok(minutes.length >= 4, `Expected four clock transitions, got ${minutes.length}`);
    const intervals = minutes.slice(1).map((minute, index) => (minute.time - minutes[index].time) / 1000);
    intervals.forEach(seconds => assert.ok(Math.abs(seconds - 2.5) < 0.15, `Uneven clock: ${seconds}s`));
    console.log(`PASS independent minute intervals: ${intervals.map(seconds => seconds.toFixed(3)).join(', ')} seconds`);
    const readClock = () => page.locator('.survival-clock').first().textContent();

    await page.locator('.survival-pause-trigger').click();
    await page.waitForTimeout(1200);
    const paused = await readSaved();
    const pausedClock = await readClock();
    await page.waitForTimeout(2200);
    assert.deepEqual(await readSaved(), paused);
    assert.equal(await readClock(), pausedClock);
    await page.locator('.survival-pause-trigger').click();
    await page.waitForTimeout(1200);
    const resumed = await readSaved();
    assert.ok(resumed.gameMinutes > paused.gameMinutes);
    assert.ok(resumed.gameMinutes - paused.gameMinutes < 0.8, 'Pause time was charged on resume');
    console.log('PASS pause/resume excludes paused time');

    await page.locator('.inventory-trigger').click();
    await page.locator('.inventory-dialog').waitFor();
    await page.waitForTimeout(1200);
    const inventoryPaused = await readSaved();
    const inventoryClock = await readClock();
    await page.waitForTimeout(2200);
    assert.deepEqual(await readSaved(), inventoryPaused);
    assert.equal(await readClock(), inventoryClock);
    await page.keyboard.press('Tab');
    await page.locator('.inventory-dialog').waitFor({ state: 'hidden' });
    await page.waitForTimeout(1400);
    const closed = await readSaved();
    assert.ok(closed.gameMinutes > inventoryPaused.gameMinutes);
    assert.ok(closed.gameMinutes - inventoryPaused.gameMinutes < 1);
    assert.deepEqual(errors, []);
    console.log('PASS inventory open/close settles once and excludes menu time');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
