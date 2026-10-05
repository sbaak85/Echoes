const fs=require('node:fs'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {chromium}=require('C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='I:/Codex/專案型/Echoes';
const src=fs.readFileSync(root+'/app/movement-lab.tsx','utf8');
const tween=stripTypeScriptTypes(src.slice(src.indexOf('type ActiveHudPanelTween ='),src.indexOf('function getDefaultSurvivalExpanded()')));
const tracksMode=/\}, \[questPanelCollapsed, questMobileMode,/.test(src);
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({hasTouch:true});
const css=fs.readFileSync(root+'/app/globals.css','utf8').replace(/^@import.*$/gm,'');
for(const width of [320,390,844]){
await page.setViewportSize({width,height:width===844?390:844});
await page.setContent(`<style>${css}</style><style>body{margin:0}.game-shell{width:100vw;height:100vh;position:relative}</style><main class="game-shell"><aside class="quest-hud is-collapsed is-mobile-mini"><div class="quest-header"><div class="quest-title"><small>MAIN OBJECTIVE</small><strong>整理背包</strong></div></div><div class="quest-list-mask"><div style="height:140px">打開背包<br>飲用淨水瓶</div></div></aside></main>`);
await page.evaluate(tween=>{window.runTween=new Function('const HUD_PANEL_TWEEN_DURATION_MS=300;const HUD_PANEL_TWEEN_FRAME_EVENT="hud-test-frame";'+tween+';return playHudPanelHeightTween;')();},tween);
const result=await page.evaluate(async tracksMode=>{
const el=document.querySelector('.quest-hud');let prev=null;
const settle=()=>new Promise(resolve=>{let count=0;const tick=()=>{if(!el.style.height&&++count>2)resolve();else requestAnimationFrame(tick)};requestAnimationFrame(tick)});
prev=window.runTween(el,prev);
el.classList.remove('is-mobile-mini');
if(tracksMode)prev=window.runTween(el,prev);
await settle();
const medium=el.getBoundingClientRect().height,top=el.getBoundingClientRect().top;
el.classList.remove('is-collapsed');prev=window.runTween(el,prev);
const heights=[el.getBoundingClientRect().height],tops=[el.getBoundingClientRect().top];
await new Promise(resolve=>{const sample=()=>{heights.push(el.getBoundingClientRect().height);tops.push(el.getBoundingClientRect().top);if(el.style.height)requestAnimationFrame(sample);else resolve()};requestAnimationFrame(sample)});
return {medium,heights,tops,top};
},tracksMode);
assert(result.heights.every(h=>h>=result.medium-.5),`retracted below medium: ${JSON.stringify(result)}`);
assert(result.heights.every((h,i)=>!i||h>=result.heights[i-1]-.5));
assert(result.tops.every(t=>Math.abs(t-result.top)<.5));
console.log(`PASS ${width}px: medium ${result.medium}px -> large ${result.heights.at(-1)}px, no upward retraction`);
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
