const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
const css=fs.readFileSync('I:/Codex/專案型/Echoes/app/globals.css','utf8').replace(/^@import.*$/gm,'');
await page.setContent(`<style>${css}</style><div class="game-shell"><div class="survival-hud is-mobile-mini"><div class="survival-mobile-minimal-panel"><span class="hud-frame-art"><span class="hud-frame-glow"></span></span><i>♥</i><b><em></em></b></div><button class="survival-toggle-hitbox">Toggle</button></div></div>`);
const state=await page.evaluate(()=>{const el=document.querySelector('.survival-mobile-minimal-panel'),s=getComputedStyle(el),f=el.querySelector('.hud-frame-art');return {border:s.borderTopColor,radius:s.borderRadius,background:s.backgroundColor,shadow:s.boxShadow,frame:getComputedStyle(f,'::after').clipPath,blur:getComputedStyle(f,'::before').backdropFilter};});
assert.equal(state.border,'rgba(0, 0, 0, 0)');assert.equal(state.radius,'0px');assert.equal(state.shadow,'none');assert.equal(state.background,'rgba(0, 0, 0, 0)');assert(state.frame.startsWith('polygon('));assert.equal(state.blur,'blur(14px)');console.log('PASS mobile mini: old rounded decoration absent; cut-corner frame and 14px glass retained');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
