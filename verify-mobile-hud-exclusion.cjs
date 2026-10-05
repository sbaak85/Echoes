const fs=require('node:fs'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {chromium}=require('C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=fs.readFileSync('I:/Codex/專案型/Echoes/app/movement-lab.tsx','utf8');
const setters=source.slice(source.indexOf('  const setSurvivalMobileMode = useCallback'),source.indexOf('  const [activeQuestHud,'));
for(const survival of ['mini','collapsed','expanded'])for(const quest of ['mini','collapsed','expanded'])for(const owner of ['survival','quest'])for(const mode of ['mini','collapsed','expanded']){
 let state={survival,quest};
 const api=new Function('useCallback','setMobileHudModes',stripTypeScriptTypes(setters)+';return {survival:setSurvivalMobileMode,quest:setQuestMobileMode};')(fn=>fn,fn=>{state=fn(state)});
 api[owner](mode);
 assert.equal(state[owner],mode);
 if(mode!=='mini')assert.equal(state[owner==='quest'?'survival':'quest'],'mini');
}
console.log('PASS all 54 mobile state transitions, including programmatic expansion');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({hasTouch:true});
 const css=fs.readFileSync('I:/Codex/專案型/Echoes/app/globals.css','utf8').replace(/^@import.*$/gm,'');
 await page.setContent(`<style>${css}</style><style>html,body{margin:0}.game-shell{position:relative;width:100vw;height:100dvh;min-height:0}</style><main class="game-shell"><aside class="survival-hud"><div class="survival-frame-shell"></div><div class="survival-mobile-minimal-panel"></div><div class="survival-content-mask"><div class="survival-panel">生存狀態</div></div><button class="survival-toggle-hitbox"></button></aside><aside class="quest-hud"><div class="quest-header"><span class="quest-type-icon"></span><div class="quest-title"><small>MAIN OBJECTIVE</small><strong>整理背包</strong></div></div><div class="quest-list-mask">使用道具進行任務</div><button class="quest-collapse"></button></aside></main>`);
 for(const [width,height] of [[320,740],[390,844],[680,900],[844,390]]){
  await page.setViewportSize({width,height});
  for(const owner of ['survival','quest'])for(const large of [false,true]){
   await page.evaluate(({owner,large})=>{document.querySelector('.survival-hud').className='survival-hud '+(owner==='survival'?(large?'is-expanded is-info-expanded':''):'is-mobile-mini');document.querySelector('.quest-hud').className='quest-hud '+(owner==='quest'?(large?'':'is-collapsed'):'is-mobile-mini is-collapsed');},{owner,large});
   const r=await page.evaluate(()=>{const s=document.querySelector('.survival-hud').getBoundingClientRect(),q=document.querySelector('.quest-hud').getBoundingClientRect();return {gap:q.left-s.right,st:s.top,qt:q.top,sw:s.width,qw:q.width};});
   assert(Math.abs(r.gap-12)<.1,JSON.stringify(r));assert.equal(r.st,r.qt);assert(Math.abs(r[owner==='survival'?'sw':'qw']-(width-122))<.1);
   console.log(`PASS ${width}x${height} ${owner} ${large?'large':'medium'}: 12px gap, equal top`);
  }
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
