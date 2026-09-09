// Isolated DOM/style/Tween regression. Real devices and quest event sequencing
// still require gameplay testing. Never writes game saves or controls user tabs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const ts = require('typescript');
const source = await readFile(new URL('../app/movement-lab.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
const tween = source.slice(source.indexOf('function easeInOutCubic('), source.indexOf('function getDefaultSurvivalExpanded('));
const browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const game = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await game.route('**/api/**', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await game.goto(process.env.HUD_TEST_URL || 'http://localhost:3035/');
  await game.locator('.survival-content-mask').waitFor({ state: 'attached' });
  const markup = await game.evaluate(() => ['.survival-hud', '.quest-hud'].map(selector => {
    const clone = document.querySelector(selector).cloneNode(true);
    clone.removeAttribute('style');
    return clone.outerHTML;
  }).join(''));
  await game.close();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setContent(markup);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: ts.transpileModule(`const activeHudPanelTweens = new WeakMap(); const HUD_PANEL_TWEEN_DURATION_MS = 300; const HUD_PANEL_TWEEN_FRAME_EVENT = 'hud-test-frame'; ${tween}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText });
  const results = await page.evaluate(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const results = [];
    for (const kind of ['survival', 'quest']) {
      const panel = document.querySelector(`.${kind}-hud`);
      panel.className = `${kind}-hud`;
      if (kind === 'survival') panel.classList.add('is-expanded', 'is-info-expanded');
      await wait(220);
      function toggle() {
        const start = panel.getBoundingClientRect().height;
        panel.classList.toggle(kind === 'survival' ? 'is-expanded' : 'is-collapsed');
        const open = kind === 'survival' ? panel.classList.contains('is-expanded') : !panel.classList.contains('is-collapsed');
        if (kind === 'survival' && open) panel.classList.add('is-info-expanded');
        playHudPanelHeightTween(panel, start, progress => {
          if (kind === 'survival' && !open && progress >= .5) panel.classList.remove('is-info-expanded');
        });
        return open;
      }
      for (let n = 0; n < 2; n++) {
        const open = toggle();
        const rows = [];
        await new Promise(resolve => {
          let start;
          function frame(t) {
            start ??= t;
            const mask = panel.querySelector(kind === 'quest' ? '.quest-list-mask' : '.survival-content-mask');
            const info = panel.querySelector(kind === 'quest' ? '.quest-list-mask > div' : '.survival-panel');
            rows.push({ t: t - start, height: panel.getBoundingClientRect().height, mask: mask.getBoundingClientRect().height, top: info.getBoundingClientRect().top - panel.getBoundingClientRect().top, opacity: +getComputedStyle(info).opacity, infoExpanded: panel.classList.contains('is-info-expanded') });
            if (t - start < 450) requestAnimationFrame(frame); else resolve();
          }
          requestAnimationFrame(frame);
        });
        results.push({ kind, open, steps: new Set(rows.map(row => row.height)).size, fixed: Math.max(...rows.map(row => row.top)) - Math.min(...rows.map(row => row.top)) < .1, finalMask: rows.at(-1).mask, finalOpacity: rows.at(-1).opacity, switchedAt: kind === 'survival' && !open ? rows.find(row => !row.infoExpanded)?.t : null, cleaned: !panel.style.height });
      }
      toggle(); await wait(100);
      const before = panel.getBoundingClientRect().height;
      toggle();
      results.push({ kind, reverseJump: Math.abs(panel.getBoundingClientRect().height - before) });
      await wait(420);
    }
    return results;
  });
  for (const result of results) {
    if ('reverseJump' in result) { assert.ok(result.reverseJump < 1); continue; }
    assert.ok(result.steps >= 5, JSON.stringify(result));
    assert.ok(result.fixed && result.cleaned, JSON.stringify(result));
    if (result.kind === 'quest' && !result.open) assert.equal(result.finalMask, 0);
    if (result.kind === 'survival') {
      assert.equal(result.finalOpacity, result.open ? 1 : 0);
      if (!result.open) assert.ok(result.switchedAt >= 140 && result.switchedAt < 220);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const hidden = await page.evaluate(() => {
    const s = document.querySelector('.survival-hud'), q = document.querySelector('.quest-hud');
    s.classList.add('is-mobile-mini'); q.classList.add('is-mobile-mini');
    return [s.querySelector('.survival-content-mask'), s.querySelector('.survival-frame-shell'), q.querySelector('.quest-list-mask')].every(e => getComputedStyle(e).display === 'none');
  });
  assert.ok(hidden, 'Mobile minimal mode must not reveal masked full content or shell');
  console.log(JSON.stringify(results, null, 2));
  console.log('HUD mask, 50% crossfade, reversal and mobile-minimal checks passed.');
} finally { await browser.close(); }
