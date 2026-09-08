// Isolated actual-component test; never attaches to a user's browser or save.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const { build } = createRequire(require.resolve("vite/package.json"))("esbuild");
const main = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
const start = main.indexOf("      const starCardsDirectionalInputActive =");
const end = main.indexOf("      if (cursorInputLength <= 0.1) sharedCursorRearmRequired", start);
assert.ok(start > 0 && end > start);
const bundle = await build({
  stdin: {contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {StarCardsGame} from './app/star-cards-game.tsx';
    import {cursorOwnership} from './app/cursor-ownership.ts';
    window.owner=cursorOwnership;
    window.pad={axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[window.pad]});
    cursorOwnership.subscribe(owner=>document.documentElement.dataset.cursorOwner=owner);
    cursorOwnership.take('gamepad');
    let starCardsCursorRearmRequired=false;
    window.tick=()=>{
      const starCardsOpenRef={current:true}, gamepadInput={connected:true};
      const inventoryDirectionActive=window.pad.buttons.slice(12,16).some(b=>b.pressed)||
        window.pad.axes.slice(0,2).some(a=>Math.abs(a)>=.65);
      const cursorInputLength=Math.hypot(...window.pad.axes.slice(2,4));
      const activateDirectionalCursor=()=>cursorOwnership.take('directional');
      ${main.slice(start,end)}
      if(!starCardsCursorRearmRequired&&cursorInputLength>=.45){
        cursorOwnership.take('gamepad');
        window.dispatchEvent(new CustomEvent('echoes:star-cards-cursor',{detail:{cardId:null}}));
      }
    };
    createRoot(document.getElementById('root')).render(<StarCardsGame audioEvents={null}
      onClose={()=>{}} initialGamepadMode={true} />);
  `, resolveDir:fileURLToPath(new URL("../",import.meta.url)),loader:"tsx"},
  bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
  resolveExtensions:[".ts",".tsx",".mjs",".js",".json"],
  define:{"import.meta.env.BASE_URL":'"/"',"process.env.NODE_ENV":'"production"'},
});
const browser = await chromium.launch({headless:true,channel:"msedge"});
try {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({content:await readFile(new URL("../app/globals.css",import.meta.url),"utf8")});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.locator('.star-cards-dialog').waitFor();
  for (const control of [12,13,14,15,"leftX","leftY"]) {
    await page.evaluate(control=>{
      window.pad.axes=[0,0,.8,0]; window.tick();
      if(typeof control==='number') window.pad.buttons[control].pressed=true;
      else window.pad.axes[control==='leftX'?0:1]=.8;
      window.tick();
    },control);
    await page.waitForFunction(()=>document.querySelector('.star-cards-dialog').dataset.navigationMode==='directional');
    assert.equal(await page.locator('.star-cards-dialog').evaluate(el=>getComputedStyle(el).cursor),'none');
    await page.evaluate(()=>{
      window.pad.buttons.forEach(b=>b.pressed=false); window.pad.axes[0]=window.pad.axes[1]=0;
      window.tick();
    });
    assert.equal(await page.evaluate(()=>window.owner.owner),'directional');
    await page.evaluate(()=>{window.pad.axes[2]=0;window.tick();window.pad.axes[2]=.8;window.tick();});
    await page.waitForFunction(()=>document.querySelector('.star-cards-dialog').dataset.navigationMode==='pointer');
    assert.equal(await page.evaluate(()=>window.owner.owner),'gamepad');
  }
  assert.deepEqual(errors,[]);
  console.log('Actual Star Cards component: four D-pad directions + both left-stick axes; held-right-stick suppression and rearm passed.');
} finally { await browser.close(); }
