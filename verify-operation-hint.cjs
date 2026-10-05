const fs=require('node:fs'), assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {chromium}=require('C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:736,height:500}});
  const css=fs.readFileSync('I:/Codex/專案型/Echoes/app/globals.css','utf8').replace(/^@import.*$/gm,'');
  const src=fs.readFileSync('I:/Codex/專案型/Echoes/app/movement-lab.tsx','utf8');
  const code=stripTypeScriptTypes(src.slice(src.indexOf('    const operationHint ='),src.indexOf('    const drawPlayerInfoFloats =')));
  await page.setContent(`<style>${css}</style><style>body{margin:0}main{position:relative;width:100vw;height:500px;background:#18303b}</style><main><canvas></canvas></main>`);
  await page.evaluate(code=>{
   const canvas=document.querySelector('canvas');
   const mouseLeftPromptImage=new Image(),gamepadPromptImage=new Image();
   const setup=new Function('canvas','mouseLeftPromptImage','gamepadPromptImage', `let activeInputMode='mouse',viewportWidth=736,viewportHeight=500; const clamp=(n,a,b)=>Math.min(b,Math.max(a,n)); ${code}; return {show:(mode,text,width)=>{activeInputMode=mode;viewportWidth=width;drawPromptPill(width-10,480,'操作',text,mode==='gamepad'?'A':mode==='keyboard'?'E':null,mode==='mouse');},remove:()=>operationHint.remove()}`);
   window.hintTest=setup(canvas,mouseLeftPromptImage,gamepadPromptImage);
  },code);
  for(const width of [736,320]){
   await page.setViewportSize({width,height:500});
   for(const mode of ['mouse','keyboard','gamepad']){
    for(const target of ['主控電腦','主控電腦的長物件名稱'.repeat(8)]){
     await page.evaluate(({mode,target,width})=>window.hintTest.show(mode,target,width),{mode,target,width});
     const state=await page.evaluate(()=>{const el=document.querySelector('.world-operation-hint'),r=el.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:r.width,scroll:el.scrollWidth,client:el.clientWidth,color:getComputedStyle(el.querySelector('strong')).color,pointer:getComputedStyle(el).pointerEvents,blur:getComputedStyle(el.querySelector('.hud-frame-art'),'::before').backdropFilter};});
     assert(state.left>=8&&state.right<=width-7.5&&state.bottom<=492.5,JSON.stringify(state));
     assert(state.scroll<=state.client+1); assert.equal(state.color,'rgb(185, 234, 255)'); assert.equal(state.pointer,'none'); assert.equal(state.blur,'blur(14px)');
    }
    console.log(`PASS ${width}px ${mode}: layout, long labels, blue name, blur, pointer passthrough`);
   }
  }
  await page.evaluate(()=>window.hintTest.remove());
  assert.equal(await page.locator('.world-operation-hint').count(),0);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
