const fs=require('node:fs'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {chromium}=require('C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({hasTouch:true});
 const css=fs.readFileSync('I:/Codex/專案型/Echoes/app/globals.css','utf8').replace(/^@import.*$/gm,'');
 const source=fs.readFileSync('I:/Codex/專案型/Echoes/app/movement-lab.tsx','utf8');
 const start=source.indexOf('    const update = () => {',source.indexOf('const dock = quickDockRef.current;'));
 const update=stripTypeScriptTypes(source.slice(start,source.indexOf('    update();',start)));
 await page.setContent(`<style>${css}</style><style>html,body{margin:0}.game-shell{position:relative;width:100vw;height:100dvh;min-height:0}</style><main class="game-shell"><section class="inventory-hotbar"><button class="options-trigger">設定</button><div class="hotbar-slots">${Array.from({length:6},()=>'<button class="hotbar-slot"></button>').join('')}</div><button class="inventory-trigger">背包</button></section><div class="minimap-hud"></div><button class="fullscreen-trigger"></button><button class="mobile-interaction-trigger is-visible"></button></main>`);
 await page.evaluate(update=>{const dock=document.querySelector('.inventory-hotbar'),host=dock.parentElement;window.updatePlacement=new Function('dock','host',`${update};return update;`)(dock,host);new ResizeObserver(window.updatePlacement).observe(host);window.addEventListener('resize',window.updatePlacement);window.updatePlacement();},update);
 for(const [width,height] of [[320,740],[390,844],[844,390]]){
  await page.setViewportSize({width,height});
  for(const collapsed of [false,true]){
   await page.evaluate(collapsed=>{document.querySelector('.minimap-hud').classList.toggle('is-collapsed',collapsed);window.updatePlacement();},collapsed);
   const result=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};return {settings:rect('.options-trigger'),fullscreen:rect('.fullscreen-trigger'),hand:rect('.mobile-interaction-trigger'),map:rect('.minimap-hud'),scale:Number(document.querySelector('.inventory-hotbar').style.getPropertyValue('--dock-scale'))};});
   assert(Math.abs(result.settings.left-result.fullscreen.left)<1,JSON.stringify(result));
   assert(Math.abs(result.settings.top-result.fullscreen.bottom-8*result.scale)<1,JSON.stringify(result));
   assert(Math.abs(result.settings.width-result.fullscreen.width)<1,JSON.stringify(result));
   assert(result.map.left-result.hand.right>=5,JSON.stringify(result));
   assert(Math.abs(result.settings.bottom-result.map.bottom)<1,JSON.stringify(result));
   assert(Math.abs(result.settings.bottom-result.hand.bottom)<1,JSON.stringify(result));
   const dockTop=await page.locator('.inventory-hotbar').evaluate(el=>el.getBoundingClientRect().top);
   assert(dockTop-result.map.bottom>=8*result.scale-.5,JSON.stringify(result));
   console.log(`PASS ${width}x${height}, collapsed=${collapsed}: fullscreen above Settings; hand clears minimap`);
  }
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
