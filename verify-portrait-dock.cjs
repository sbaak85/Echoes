const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({channel:'msedge', headless:true});
  try {
    const page = await browser.newPage({hasTouch:true});
    const css = fs.readFileSync('I:/Codex/專案型/Echoes/app/globals.css','utf8').replace(/^@import.*$/gm,'');
    const source = fs.readFileSync('I:/Codex/專案型/Echoes/app/movement-lab.tsx','utf8');
    const start = source.indexOf('    const update = () => {', source.indexOf('const dock = quickDockRef.current;'));
    const update = source.slice(start, source.indexOf('    update();', start));
    await page.setContent(`<style>${css}</style><style>html,body{margin:0}.game-shell{position:relative;width:100vw;height:100dvh;min-height:0}</style><main class="game-shell"><section class="inventory-hotbar"><span class="quick-dock-texture"></span><button class="options-trigger">設定</button><div class="hotbar-slots">${Array.from({length:6},(_,i)=>`<button class="hotbar-slot">${i+1}</button>`).join('')}</div><button class="inventory-trigger">背包</button></section></main>`);
    await page.evaluate(update => {
      const dock = document.querySelector('.inventory-hotbar'), host = dock.parentElement;
      const fn = new Function('dock','host',`${update};return update;`)(dock,host);
      new ResizeObserver(fn).observe(host);
      window.addEventListener('resize',fn); fn();
    }, update);
    for (const [width,height] of [[320,740],[360,800],[390,844],[480,900],[768,1024],[1024,768],[390,844]]) {
      await page.setViewportSize({width,height});
      await page.waitForFunction(() => {
        const dock=document.querySelector('.inventory-hotbar'), host=dock.parentElement;
        const style=getComputedStyle(dock), centered=style.getPropertyValue('--dock-centered').trim()==='1';
        const available=host.clientWidth-(centered?16:(parseFloat(style.left)||0)+8);
        return Math.abs(parseFloat(dock.style.getPropertyValue('--dock-scale'))-Math.min(1,available/dock.offsetWidth))<.001;
      });
      const result = await page.evaluate(() => {
        const dock=document.querySelector('.inventory-hotbar'), d=dock.getBoundingClientRect();
        const children=[...dock.querySelectorAll('.hotbar-slot,.inventory-trigger')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}});
        return {x:d.x,y:d.y,w:d.width,right:d.right,bottom:d.bottom,children,scale:parseFloat(dock.style.getPropertyValue('--dock-scale'))};
      });
      assert(result.x>=7.5 && result.right<=width-7.5, JSON.stringify(result));
      if(height>width){assert(Math.abs(result.x+result.w/2-width/2)<1);assert(Math.abs(result.bottom-(height-8))<1);}
      for(const c of result.children){assert(Math.abs(c.w-c.h)<.1);assert(c.x>=result.x&&c.right<=result.right+.1&&c.bottom<=result.bottom+.1);assert(Math.abs(c.y-result.children[0].y)<.1);assert(Math.abs(c.w-54*result.scale)<.1);}
      console.log(`PASS ${width}x${height}: ${Math.round(result.w)}px whole dock, scale ${result.scale.toFixed(3)}`);
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
