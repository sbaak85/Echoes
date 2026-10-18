// Actual component and simulated controls; isolated from player saves.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
const main = await readFile(new URL('../app/movement-lab.tsx', import.meta.url), 'utf8');
assert.ok(!/else if \(starCardsMenuOpen && backJustPressed\)\s*\{\s*closeStarCardsGame/.test(main), 'parent must not bypass confirmation');
const bundle = await build({
  stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {StarCardsGame} from './app/star-cards-game.tsx';
    import {cursorOwnership} from './app/cursor-ownership.ts';
    window.owner=cursorOwnership; window.exits=0; window.results=[];
    window.pad={axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[window.pad]});
    cursorOwnership.subscribe(owner=>document.documentElement.dataset.cursorOwner=owner);
    document.documentElement.dataset.cursorOwner='mouse';
    const root=createRoot(document.getElementById('root'));
    root.render(<StarCardsGame audioEvents={null} onClose={()=>{window.exits++;root.unmount();}} onMatchCompleted={r=>window.results.push(r)}/>);
  `, resolveDir:fileURLToPath(new URL('../',import.meta.url)), loader:'tsx' },
  bundle:true, write:false, platform:'browser', format:'iife', jsx:'automatic',
  resolveExtensions:['.ts','.tsx','.mjs','.js','.json'],
  define:{'import.meta.env.BASE_URL':'"/"','process.env.NODE_ENV':'"production"'},
});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://starcards.test/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/')return route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="root"></div></body></html>'});
    try {await route.fulfill({body:await readFile(new URL('../public'+path,import.meta.url)),contentType:path.endsWith('.png')?'image/png':'application/octet-stream'});}
    catch {await route.fulfill({status:404,body:''});}
  });
  await page.goto('http://starcards.test/');
  await page.addStyleTag({content:await readFile(new URL('../app/globals.css',import.meta.url),'utf8')});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.locator('.star-cards-dialog').waitFor();
  await page.waitForTimeout(80);
  const modal=page.getByRole('alertdialog');
  const tick=()=>page.waitForTimeout(90);
  const button=async(index,pressed)=>{await page.evaluate(({index,pressed})=>{window.pad.buttons[index].pressed=pressed;},{index,pressed});await tick();};
  await page.keyboard.press('Escape');await modal.waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.star-cards-dialog').evaluate(el=>el.inert),true);
  assert.match(await page.locator('.star-cards-dialog').getAttribute('class'),/is-dealing/,'deal timer is paused');
  await page.keyboard.down('Escape'); // second press dismisses, held repeat must not reopen
  await page.keyboard.down('Escape');await page.keyboard.up('Escape');
  assert.equal(await modal.count(),0);
  await page.waitForTimeout(1100);
  assert.match(await page.locator('.star-cards-dialog').getAttribute('class'),/is-initial-placement/);
  await button(1,true);await modal.waitFor();await page.waitForTimeout(180);
  assert.equal(await modal.count(),1,'held B cannot dismiss its own prompt');
  await button(1,false);await button(1,true);await button(1,false);
  assert.equal(await modal.count(),0);
  await button(8,true);await button(8,false);await modal.waitFor();
  await page.evaluate(()=>{window.pad.axes[0]=.8;});await tick();
  assert.equal(await modal.locator('[data-gamepad-selected="true"]').innerText(),'放棄並退出\nLEAVE MATCH');
  await page.waitForTimeout(180);
  assert.equal(await modal.locator('[data-gamepad-selected="true"]').count(),1);
  await page.evaluate(()=>{window.pad.axes[0]=0;});await tick();
  await page.evaluate(()=>{window.pad.axes[1]=.8;});await tick();
  assert.equal(await modal.locator('[data-gamepad-selected="true"]').innerText(),'繼續牌局\nCONTINUE');
  await page.evaluate(()=>{window.pad.axes[1]=0;});await tick();
  await button(0,true);await button(0,false);assert.equal(await modal.count(),0);
  assert.equal(await page.locator('.star-card-shell.is-held').count(),0,'resume A must not select a card');
  await page.keyboard.press('Escape');await modal.waitFor();
  await page.mouse.click(10,10);assert.equal(await modal.count(),1,'scrim consumes clicks');
  await page.keyboard.press('Tab');assert.equal(await modal.locator('[data-gamepad-selected="true"]').count(),1);
  assert.equal(await modal.locator('button').first().evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  await page.evaluate(()=>{window.owner.take('gamepad');window.dispatchEvent(new CustomEvent('echoes:star-cards-cursor',{detail:{exitChoice:0}}));});
  await page.waitForFunction(()=>document.querySelector('.star-cards-exit-scrim').dataset.navigationMode==='pointer');
  assert.equal(await modal.locator('[data-gamepad-selected="true"]').count(),0);
  assert.equal(await modal.locator('[data-cursor-hover="true"]').count(),1);
  // Shared virtual cursor activates the native button's click handler.
  await modal.locator('button').first().evaluate(el=>el.click());await modal.waitFor({state:'detached'});
  await page.keyboard.press('Escape');await modal.waitFor();
  await modal.getByRole('button',{name:'繼續牌局'}).tap();assert.equal(await modal.count(),0);
  await page.keyboard.press('Escape');await modal.waitFor();
  await page.mouse.move(20,20);await page.mouse.move(25,25);
  await mkdir(new URL('../output/',import.meta.url),{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('../output/star-cards-exit-confirmation.png',import.meta.url))});
  await page.setViewportSize({width:390,height:844});await tick();
  const box=await modal.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390,'mobile panel fits');
  await page.screenshot({path:fileURLToPath(new URL('../output/star-cards-exit-confirmation-mobile.png',import.meta.url))});
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.exits===1);
  assert.deepEqual(await page.evaluate(()=>window.results),[],'abandon cannot report victory');
  assert.deepEqual(errors,[]);
  console.log('Passed: Esc / B / Select, held keys, both stick axes, A, focus trap, virtual cursor, touch, click shield, pause/resume, abandon and responsive layout.');
} finally {await browser.close();}
