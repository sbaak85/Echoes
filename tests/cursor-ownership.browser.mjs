// Standalone, isolated browser verification; does not connect to a user's tabs.
// PLAYWRIGHT_MODULE_PATH may point to a bundled Playwright installation.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const ts = require("typescript");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setContent(`<div class="options-overlay"><section class="options-dialog">
    <button id="option">Option</button></section></div>
    <div class="welding-puzzle-overlay"><section class="welding-puzzle-dialog is-intro">
    <button id="weld-button">Weld</button><button id="disabled" disabled>Disabled</button>
    <div class="welding-puzzle-board" id="board"></div></section></div>
    <div class="dialogue-box" id="dialogue">Dialogue</div>`);
  await page.addStyleTag({ content: await readFile(new URL("../app/globals.css", import.meta.url), "utf8") });
  const source = await readFile(new URL("../app/cursor-ownership.ts", import.meta.url), "utf8");
  await page.addScriptTag({ type: "module", content: ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText + `
    window.cursorState = cursorOwnership;
    window.virtualPoint = {x:640,y:450};
    cursorOwnership.subscribe((owner, previous) => {
      document.documentElement.dataset.cursorOwner = owner;
      if(owner === 'gamepad' && previous === 'mouse' && cursorOwnership.lastMouse)
        window.virtualPoint = {...cursorOwnership.lastMouse};
    });
    window.addEventListener('pointermove', e => cursorOwnership.recordMouse(e.clientX,e.clientY));
  ` });
  await page.waitForFunction(() => Boolean(window.cursorState));
  let checks = 0;
  for (const phase of ["intro", "ready", "welding", "failure", "success"]) {
    for (const owner of ["gamepad", "directional", "touch"]) {
      await page.evaluate(({ phase, owner }) => {
        document.querySelector('.welding-puzzle-dialog').className = `welding-puzzle-dialog is-${phase}`;
        document.documentElement.className = 'gamepad-cursor-active gamepad-input-active dialogue-cursor-active';
        window.cursorState.take(owner);
      }, { phase, owner });
      for (const selector of ['#weld-button', '#disabled', '#board', '#dialogue', '#option']) {
        assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).cursor), 'none', `${phase}/${owner}/${selector}`);
        checks++;
      }
    }
  }
  await page.evaluate(() => { document.documentElement.className = ''; window.cursorState.take('mouse'); });
  assert.equal(await page.locator('#weld-button').evaluate(el => getComputedStyle(el).cursor), 'pointer');
  await page.mouse.move(287, 364);
  await page.evaluate(() => window.cursorState.take('gamepad'));
  assert.deepEqual(await page.evaluate(() => window.virtualPoint), { x: 287, y: 364 });
  await page.evaluate(() => {
    window.virtualPoint = {x:600,y:400};
    window.cursorState.take('directional');
    window.cursorState.take('gamepad');
  });
  assert.deepEqual(await page.evaluate(() => window.virtualPoint), { x: 600, y: 400 });
  await page.mouse.move(510, 410);
  assert.equal(await page.evaluate(() => window.cursorState.owner), 'mouse');
  console.log(`${checks} computed-cursor checks passed; mouse/gamepad/directional position handoff passed.`);

  const presentationSource = await readFile(new URL("../app/cursor-presentation.ts", import.meta.url), "utf8");
  const restartScript = ts.transpileModule(source + '\n' + presentationSource.replace(/import type[^;]+;/, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText + `
    window.cursorState=cursorOwnership;
    window.guard=new CursorPresentationGuard(document);
    const point=parseCursorPosition(sessionStorage.getItem(CURSOR_POSITION_STORAGE_KEY),innerWidth,innerHeight);
    if(point)cursorOwnership.recordMouse(point.x,point.y);
    cursorOwnership.subscribe(owner=>window.guard.reconcile(owner,cursorOwnership.lastMouse));
    addEventListener('pointermove',e=>cursorOwnership.recordMouse(e.clientX,e.clientY));
    addEventListener('pagehide',()=>sessionStorage.setItem(CURSOR_POSITION_STORAGE_KEY,JSON.stringify(cursorOwnership.lastMouse)));
    window.showVirtual=()=>{cursorOwnership.take('gamepad');return window.guard.reconcile('gamepad',cursorOwnership.lastMouse)};
  `;
  const restart = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await restart.route('http://cursor-restart.local/**', route => route.fulfill({ contentType: 'text/html', body:
    `<style>body{margin:0}#black{position:fixed;inset:0;background:black;color:white;cursor:default!important}</style>
    <div id="black">第三章 Chapter.3</div><script type="module">${restartScript}</script>` }));
  await restart.goto('http://cursor-restart.local/');
  await restart.waitForFunction(() => Boolean(window.showVirtual));
  await restart.mouse.move(350, 220);
  await restart.reload(); // Deliberately do NOT move the physical mouse again.
  await restart.waitForFunction(() => Boolean(window.showVirtual));
  assert.deepEqual(await restart.evaluate(() => window.cursorState.lastMouse), { x:350, y:220 });
  assert.equal(await restart.evaluate(() => window.showVirtual()), true);
  assert.equal(await restart.locator('#black').evaluate(el => getComputedStyle(el).cursor), 'none');
  // Same owner, but DOM presentation was lost/overridden after an overlay update.
  await restart.evaluate(() => {
    delete document.documentElement.dataset.cursorOwner;
    document.documentElement.style.removeProperty('cursor');
    document.getElementById('black').style.setProperty('cursor','crosshair','important');
  });
  assert.equal(await restart.evaluate(() => window.showVirtual()), true);
  assert.equal(await restart.locator('#black').evaluate(el => getComputedStyle(el).cursor), 'none');
  await restart.evaluate(() => {
    const modal=document.createElement('div');modal.id='late-overlay';
    modal.style.cssText='position:fixed;inset:0;z-index:10;cursor:pointer!important';
    document.body.append(modal);
  });
  assert.equal(await restart.evaluate(() => window.showVirtual()), true);
  assert.equal(await restart.locator('#late-overlay').evaluate(el => getComputedStyle(el).cursor), 'none');
  await restart.mouse.move(400, 240);
  assert.equal(await restart.locator('#late-overlay').evaluate(el => getComputedStyle(el).cursor), 'pointer');
  console.log('Stationary mouse + reload + virtual admission, same-owner DOM repair, late overlay, mouse restoration passed.');

  // Mount the actual welding component with a simulated controller in an
  // isolated page. No game save, live server, or user browser is involved.
  const viteRequire = createRequire(require.resolve("vite/package.json"));
  const { build } = viteRequire("esbuild");
  const { fileURLToPath } = await import("node:url");
  const bundle = await build({
    stdin: { contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {WeldingRoutePuzzle} from './app/welding-route-puzzle.tsx';
      import {cursorOwnership} from './app/cursor-ownership.ts';
      window.cursorState=cursorOwnership;
      window.pad={connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
      Object.defineProperty(navigator,'getGamepads',{value:()=>[window.pad]});
      cursorOwnership.subscribe(owner=>document.documentElement.dataset.cursorOwner=owner);
      window.addEventListener('pointermove',e=>cursorOwnership.recordMouse(e.clientX,e.clientY),true);
      window.addEventListener('pointerdown',e=>cursorOwnership.recordMouse(e.clientX,e.clientY,true),true);
      createRoot(document.getElementById('root')).render(<WeldingRoutePuzzle onCancel={()=>{}}
        onComplete={()=>{}} onFail={()=>{}} />);
    `, resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    resolveExtensions: [".ts", ".tsx", ".mjs", ".js", ".json"],
    define: { "import.meta.env.BASE_URL": '"/"', "process.env.NODE_ENV": '"production"' },
  });
  const welding = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await welding.route('http://cursor-test.local/ui/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes('..')) return route.abort();
    try {
      const body = await readFile(new URL(`../public${pathname}`, import.meta.url));
      await route.fulfill({ body, contentType: pathname.endsWith('.webp') ? 'image/webp' : 'image/png' });
    } catch { await route.abort(); }
  });
  const runtimeErrors = [];
  welding.on('pageerror', error => runtimeErrors.push(error.message));
  await welding.setContent('<base href="http://cursor-test.local/"><div id="root"></div>');
  await welding.addStyleTag({ content: await readFile(new URL("../app/globals.css", import.meta.url), "utf8") });
  await welding.addScriptTag({ content: bundle.outputFiles[0].text });
  await welding.getByRole('button', { name: '開始預覽路線' }).click();
  await welding.locator('.welding-puzzle-dialog.is-ready').waitFor({ timeout: 45000 });
  const bounds = await welding.locator('.welding-puzzle-board').boundingBox();
  const point = { x: bounds.x + bounds.width * .5, y: bounds.y + bounds.height * .5 };
  await welding.mouse.move(point.x, point.y);
  await welding.locator('.welding-gun-cursor').waitFor({ state: 'attached' });
  const before = await welding.locator('.welding-gun-cursor').evaluate(el => parseFloat(el.style.left));
  await welding.evaluate(() => { window.pad.axes[2] = .6; });
  await welding.waitForFunction(() => window.cursorState.owner === 'gamepad');
  const after = await welding.locator('.welding-gun-cursor').evaluate(el => parseFloat(el.style.left));
  assert.ok(Math.abs(after - before) < 10, 'welding gun takes over near the current mouse, not route origin');
  assert.equal(await welding.locator('.welding-puzzle-board').evaluate(el => getComputedStyle(el).cursor), 'none');
  await welding.mouse.move(point.x + 40, point.y + 20);
  await welding.waitForFunction(() => window.cursorState.owner === 'mouse');
  await welding.waitForTimeout(180);
  assert.equal(await welding.evaluate(() => window.cursorState.owner), 'mouse', 'held stick cannot steal back');
  await welding.evaluate(() => { window.pad.axes[2] = 0; });
  await welding.waitForTimeout(80);
  await welding.evaluate(() => { window.pad.axes[2] = .6; });
  await welding.waitForFunction(() => window.cursorState.owner === 'gamepad');
  assert.deepEqual(runtimeErrors, []);
  console.log('Actual welding component: mouse → stick → mouse (held stick) → neutral → stick passed.');
} finally {
  await browser.close();
}
