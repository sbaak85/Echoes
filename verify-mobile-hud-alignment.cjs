const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 const css=fs.readFileSync('I:/Codex/專案型/Echoes/app/globals.css','utf8').replace(/^@import.*$/gm,'');
 const art='<span class="hud-frame-art"><span class="hud-frame-glow"></span></span>';
 await page.setContent(`<style>${css}</style><style>body{margin:0}.game-shell{position:relative;height:100vh;width:100vw}.survival-hud:not(.is-mobile-mini){height:200px}</style><div class="game-shell"><header class="survival-clock survival-clock-mobile"><span>${art}Day 3</span><span>${art}10:07</span></header><section class="quest-hud is-mobile-mini">${art}<header class="quest-header">任務</header><div class="quest-list-mask">目標</div></section><section class="survival-hud is-mobile-mini" style="--survival-frame-top:6px"><header class="survival-clock survival-clock-desktop"></header><div class="survival-mobile-minimal-panel">${art}♥</div><div class="survival-frame-shell">${art}</div><div class="survival-content-mask"><div class="survival-panel">生存</div></div><button class="survival-toggle-hitbox"></button></section></div>`);
 for(const size of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);
  for(const [s,q] of [[false,false],[true,false],[false,true],[true,true]]){
   await page.evaluate(({s,q})=>{document.querySelector('.survival-hud').className='survival-hud '+(s?'is-expanded is-info-expanded':'is-mobile-mini');document.querySelector('.quest-hud').className='quest-hud '+(q?'':'is-mobile-mini is-collapsed');},{s,q});
   const result=await page.evaluate(s=>{const survival=document.querySelector('.survival-hud'),quest=document.querySelector('.quest-hud'),clock=document.querySelector('.survival-clock-mobile');return {tops:[survival.querySelector(s?'.survival-frame-shell':'.survival-mobile-minimal-panel'),quest,clock.querySelector('span')].map(e=>e.getBoundingClientRect().top),z:[survival,quest,clock].map(e=>Number(getComputedStyle(e).zIndex))};},s);
   assert(result.tops.every(t=>Math.abs(t-14)<.1),JSON.stringify(result));assert.deepEqual(result.z,[8,7,6]);console.log(`PASS ${size.width}x${size.height} survival=${s} quest=${q}: top 14px; layers 8 > 7 > 6`);
  }
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
