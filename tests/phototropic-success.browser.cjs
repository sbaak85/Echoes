// Run against the local development server with CODEX_PLAYWRIGHT_PATH pointing
// at the bundled Playwright module. Only the isolated preview state is changed.
const { chromium } = require(process.env.CODEX_PLAYWRIGHT_PATH || 'C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const scene6 = JSON.parse(readFileSync('public/maps/map_scene_06B.scene.json', 'utf8'));
const { createHash } = require('node:crypto');
const output = process.env.PLANT_SUCCESS_SCREENSHOT_DIR;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1488, height: 1002 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.testPad = { id: 'Simulated pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      navigator.getGamepads = () => [window.testPad];
    });
    await page.goto(process.env.PLANT_PREVIEW_URL || 'http://127.0.0.1:3000/phototropic-preview');
    await page.waitForTimeout(1000); // Wait for client hydration before the first click.
    const open = async side => {
      await page.getByRole('button', { name: side === 'L' ? '互動 020 · 左側' : '互動 021 · 右側' }).click();
      const id = side === 'L' ? 'scene6-interaction-020' : 'scene6-interaction-021';
      const intro = page.locator(`.dialogue-box[data-dialogue-id="${id}"]`);
      await intro.waitFor();
      assert.equal(await page.getByRole('button', { name: '繼續對話' }).count(), 0);
      for (const line of scene6.interactables.find(i => i.id === id).dialogue.lines) {
        await page.waitForFunction(line => document.querySelector('.dialogue-box')?.getAttribute('data-line-id') === line.lineId && document.querySelector('.dialogue-text')?.textContent === line.text, line);
        await intro.click();
      }
      await page.locator('.plant-controls-unframed').waitFor();
      await page.getByRole('button', { name: side + '1', exact: true }).click();
      for (let i = 0; i < 20; i++) await page.getByRole('slider', { name: '照射角度' }).press('ArrowLeft');
      assert.equal(await page.getByRole('slider', { name: '照射角度' }).getAttribute('aria-valuenow'), '-20');
    };
    const padButton = async (index, pressed) => {
      await page.evaluate(({ index, pressed }) => { window.testPad.buttons[index] = { pressed, value: Number(pressed) }; }, { index, pressed });
      await page.waitForTimeout(70);
    };
    const padPress = async index => { await padButton(index, true); await padButton(index, false); };
    const waitPhase = phase => page.waitForFunction(phase => !!document.querySelector(`.plant-puzzle-overlay[data-success-phase=${phase}]`), phase);
    await page.evaluate(() => {
      window.phases = []; window.samples = []; let last = null;
      const sample = () => {
        const root = document.querySelector('.plant-puzzle-overlay[role=dialog]'), phase = root?.dataset.successPhase || null;
        if (phase !== last) { window.phases.push({ phase, time: performance.now() }); last = phase; }
        if (phase) {
          const curtain = root.querySelector('.plant-success-curtain'), bg = root.querySelector('.plant-puzzle-background');
          window.samples.push({ phase, black: Number(getComputedStyle(curtain).opacity), overlay: Number(getComputedStyle(root).opacity), controls: !!root.querySelector('.plant-controls-unframed'), beams: root.querySelectorAll('.plant-stick-beam').length, vines: root.querySelectorAll('.plant-vines .vine-art').length, src: bg.getAttribute('src'), loaded: bg.complete && bg.naturalWidth > 0, dialogue: !!document.querySelector('.dialogue-box') });
        }
        requestAnimationFrame(sample);
      }; requestAnimationFrame(sample);
    });
    await open('L'); await page.locator('.plant-confirm').click();
    await open('R'); await waitPhase('cover');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.testPad.axes = [1, 1, 1, 0]; window.testPad.buttons[0] = { pressed: true, value: 1 }; });
    await waitPhase('black');
    assert.equal(await page.locator('.plant-controls-unframed, .plant-stick-beam').count(), 0);
    assert.equal(await page.locator('.plant-success-curtain').evaluate(e => getComputedStyle(e).opacity), '1');
    await waitPhase('hold');
    assert.equal(await page.locator('.dialogue-box').count(), 0);
    assert.equal(await page.locator('.plant-vines .vine-art').count(), 2);
    if (output) await page.screenshot({ path: output + '/plant-success-vines-only.png' });
    await waitPhase('dialogue');
    const dialogue = page.locator('.dialogue-box');
    await dialogue.waitFor();
    assert.equal(await dialogue.getAttribute('data-dialogue-id'), 'chapter04-section-99');
    await page.waitForTimeout(1600);
    assert.match(await dialogue.innerText(), /!! 真的移開了!/);
    assert.equal(await dialogue.getAttribute('data-line-id'), 'chapter04-section-99-line-001', 'held A at handoff must not consume dialogue');
    const newSrc = await page.locator('.plant-puzzle-background').getAttribute('src');
    assert.ok(decodeURIComponent(newSrc).endsWith('/趨光植物背景_2.png'));
    assert.equal(await page.locator('.plant-controls-unframed, .plant-stick-beam').count(), 0);
    const image = await page.locator('.plant-puzzle-background').evaluate(e => ({ width: e.naturalWidth, height: e.naturalHeight, fit: getComputedStyle(e).objectFit, filter: getComputedStyle(e).filter, mask: getComputedStyle(e).maskImage }));
    assert.deepEqual(image, { width: 2048, height: 1152, fit: 'contain', filter: 'none', mask: 'none' });
    await page.keyboard.press('Escape'); await padPress(1);
    assert.equal(await dialogue.getAttribute('data-line-id'), 'chapter04-section-99-line-001');
    if (output) await page.screenshot({ path: output + '/plant-success-script-99.png' });
    await page.evaluate(() => { window.testPad.axes = [0, 0, 0, 0]; window.testPad.buttons[0] = { pressed: false, value: 0 }; });
    await page.waitForTimeout(80);
    await padPress(0); // A advances the completed first line exactly once.
    assert.equal(await dialogue.getAttribute('data-line-id'), 'chapter04-section-99-line-002');
    await page.waitForTimeout(1100);
    await page.keyboard.press('Space');
    assert.equal(await dialogue.getAttribute('data-line-id'), 'chapter04-section-99-line-003');
    await page.waitForTimeout(1100);
    await dialogue.click();
    assert.equal(await dialogue.getAttribute('data-line-id'), 'chapter04-section-99-line-004');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.plant-puzzle-overlay[role=dialog]').count(), 1, 'last line remains until explicitly completed');
    assert.equal(await page.getByRole('button', { name: '互動 020 · 左側' }).isEnabled(), false);
    await page.keyboard.press('Enter'); await waitPhase('exit');
    assert.equal(await dialogue.count(), 0);
    await page.locator('.plant-puzzle-overlay[role=dialog]').waitFor({ state: 'detached' });
    await page.waitForTimeout(100);
    const audit = await page.evaluate(() => ({ phases: window.phases, samples: window.samples }));
    const phases = audit.phases.filter(p => p.phase), durations = phases.slice(1).map((p, i) => Math.round(p.time - phases[i].time));
    assert.deepEqual(phases.map(p => p.phase), ['cover', 'black', 'reveal', 'hold', 'dialogue', 'exit']);
    for (const [i, expected] of [1000, 250, 1000, 500].entries()) assert.ok(Math.abs(durations[i] - expected) < 130, `${phases[i].phase} lasted ${durations[i]}ms`);
    assert.ok(Math.abs(audit.phases.at(-1).time - phases.at(-1).time - 500) < 130);
    assert.ok(audit.samples.some(s => s.phase === 'cover' && s.black > .1 && s.black < .9));
    assert.ok(audit.samples.filter(s => s.phase === 'black').every(s => s.black === 1 && !s.controls && !s.beams));
    assert.ok(audit.samples.some(s => s.phase === 'reveal' && s.black > .1 && s.black < .9));
    assert.ok(audit.samples.filter(s => ['hold', 'dialogue', 'exit'].includes(s.phase)).every(s => s.black === 0 && !s.controls && !s.beams && s.vines === 2 && s.loaded));
    assert.ok(audit.samples.some(s => s.phase === 'exit' && s.overlay > 0 && s.overlay < .9));
    assert.equal(await page.locator('.plant-success-curtain, .dialogue-box').count(), 0);
    assert.match(await page.locator('.plant-preview-choices').innerText(), /L1 · 40°[\s\S]*R1 · 40°/);
    assert.equal(await page.getByRole('button', { name: '互動 020 · 左側' }).isEnabled(), true);
    const response = await page.request.get(new URL(newSrc, page.url()).href), hash = b => createHash('sha256').update(b).digest('hex');
    assert.equal(hash(await response.body()), hash(readFileSync('public/ui/interaction-illustrations/趨光植物背景_2.png')));
    // Reload while the asynchronous dialogue is pending: no old return fires.
    await page.reload(); await page.waitForTimeout(1000);
    await open('L'); await page.locator('.plant-confirm').click(); await open('R'); await waitPhase('dialogue');
    await page.reload(); await page.waitForTimeout(3300);
    assert.equal(await page.locator('.plant-puzzle-overlay, .plant-success-curtain, .dialogue-box').count(), 0);
    assert.match(await page.locator('.plant-preview-choices').innerText(), /左側：未放置\s+右側：未放置/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ phases: phases.map(p => p.phase), durationsMs: durations, image }));
    console.log('PASS: timed cover/black/reveal/hold; exact supplied PNG; controls and beams removed; vines retained; all four real script lines; held-pad handoff; A/Space/pointer/Enter dialogue; no early return; 500ms final fade; cancellation cleanup.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
