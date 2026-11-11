// Isolated browser: mounts the production chapter menu and prologue, with a simulated pad.
// PLAYWRIGHT_MODULE_PATH can point to an installed/bundled Playwright package.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const folder = new URL('../output/prologue-input-check/', import.meta.url);
await mkdir(folder, { recursive: true });
await writeFile(new URL('index.html', folder), '<div id="root"></div><script type="module" src="./main.jsx"></script>');
await writeFile(new URL('main.jsx', folder), `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {GameEntry} from '/app/game-entry.tsx';
import {cursorOwnership} from '/app/cursor-ownership.ts';
import '/app/globals.css';
window.cursorState=cursorOwnership;
window.pad={connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};
Object.defineProperty(navigator,'getGamepads',{value:()=>window.pad?[window.pad]:[]});
createRoot(document.getElementById('root')).render(<GameEntry/>);
`);
const server = await createServer({ configFile: false, cacheDir: 'output/prologue-input-check/vite-cache',
  plugins: [react(), {
    name: 'omit-unmounted-world',
    resolveId(id, importer) {
      if (id === './movement-lab' && importer?.endsWith('/app/game-entry.tsx')) return '\0test-world';
    },
    load(id) { if (id === '\0test-world') return 'export const MovementLab=()=>null;export const prepareChapterStart=()=>{};'; },
  }], server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/output/prologue-input-check/index.html`);
  await page.locator('.chapter-entry').waitFor();
  const pad = async (buttons = [], axes = [0,0,0,0]) => {
    await page.evaluate(({buttons,axes}) => {
      window.pad.axes=axes;
      window.pad.buttons.forEach((b,i)=>b.pressed=buttons.includes(i));
    }, { buttons, axes });
    await page.waitForTimeout(90);
  };
  const owner = async value => assert.equal(await page.evaluate(()=>window.cursorState.owner), value);
  const pointer = () => page.locator('.prologue-pointer');
  const point = () => pointer().evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
  await page.mouse.move(180,180);
  await pad();
  await pad([0]); // Held menu-confirm must not advance the newly mounted story.
  await page.locator('.prologue-stage').waitFor();
  await owner('directional');
  assert.equal(await pointer().count(),0);
  await pad();
  await pad([], [0,0,1,0]);
  await owner('gamepad');
  assert.equal(await pointer().count(),1);
  await pad();
  const moved = await point();
  assert.ok(moved.x>180);
  await pad([], [1,0,0,0]);
  await owner('directional');
  assert.equal(await pointer().count(),0);
  await pad();
  await pad([], [0,0,0,1]);
  await pad();
  assert.equal((await point()).x,moved.x); // Directional mode must preserve coordinates.
  await page.mouse.move(300,200);
  await owner('mouse');
  await pad([], [0,0,1,0]);
  await owner('gamepad');
  await page.mouse.move(310,210); // Held outgoing stick cannot immediately retake ownership.
  await page.waitForTimeout(160);
  await owner('mouse');
  await pad();
  await pad([], [0,0,1,0]);
  await owner('gamepad');
  await pad();
  await page.locator('.dialogue-box').waitFor({ timeout: 60000 });
  await page.waitForTimeout(400);
  await pad([], [1,0,0,0]);
  await pad();
  assert.equal(await page.locator('.dialogue-box').evaluate(el=>getComputedStyle(el).cursor),'none');
  const firstLine = await page.locator('.dialogue-box').getAttribute('data-line-id');
  await pad([0]); await pad(); // Reveal current line.
  await pad([0]); await pad(); // Next line.
  assert.notEqual(await page.locator('.dialogue-box').getAttribute('data-line-id'), firstLine);
  await page.locator('.dialogue-history-trigger').waitFor();
  // Place shared pointer on the real history button; right stick takes over without snapping.
  const box = await page.locator('.dialogue-history-trigger').boundingBox();
  await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await pad([], [0,0,0.2,0]); await pad();
  await owner('gamepad');
  await pad([0]);
  await page.locator('.dialogue-history-overlay').waitFor();
  assert.equal(await pointer().count(),0);
  const historyLine = await page.locator('.dialogue-box').getAttribute('data-line-id');
  await pad(); await pad([0]); // Close, keep holding A.
  assert.equal(await page.locator('.dialogue-history-overlay').count(),0);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.dialogue-box').getAttribute('data-line-id'),historyLine);
  await pad(); await pad([6]); await pad();
  await page.locator('.dialogue-history-overlay').waitFor();
  await pad([], [0,0,0,-1]);
  await owner('directional');
  assert.equal(await pointer().count(),0);
  assert.equal(await page.locator('.dialogue-history-close').evaluate(el=>getComputedStyle(el).cursor),'none');
  await pad(); await pad([1]); await pad();
  assert.equal(await page.locator('.dialogue-history-overlay').count(),0);
  // Simulated touch and keyboard ownership, including return to the right stick.
  await page.dispatchEvent('.prologue-stage', 'pointerdown', {pointerType:'touch', clientX:90, clientY:90});
  await owner('touch');
  assert.equal(await pointer().count(),0);
  await pad(); await pad([], [0,0,1,0]); await pad();
  await owner('gamepad');
  await page.keyboard.press('Enter');
  await owner('directional');
  assert.equal(await pointer().count(),0);
  await page.mouse.move(400,250);
  await owner('mouse');
  await page.dispatchEvent('.prologue-stage', 'pointerdown', {pointerType:'touch', clientX:90, clientY:90});
  await owner('touch');
  await page.mouse.move(420,260);
  await owner('mouse');
  await pad(); await pad([], [0,0,1,0]); await pad();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await owner('directional');
  assert.equal(await pointer().count(),0);
  await pad(); await pad([], [0,0,1,0]); await pad();
  await page.evaluate(()=>{window.pad=null;});
  await page.waitForTimeout(100);
  assert.equal(await pointer().count(),0);
  assert.deepEqual(errors,[]);
  await page.screenshot({ path: new URL('verified.png',folder).pathname.replace(/^\/(\w:)/,'$1') });
  console.log('Production menu/prologue passed: held A entry, right-stick movement, directional position retention, mouse takeover/rearm, A hit-testing, history close without click-through, history scroll ownership, touch/keyboard handoff, blur and disconnect.');
} finally { await browser.close(); await server.close(); }
