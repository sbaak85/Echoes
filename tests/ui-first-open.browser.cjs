// Local browser regression. All file-backed save reads/writes are isolated.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/save-data**',r=>r.fulfill({status:404,json:{error:'empty-slot'}}));
    await page.route('**/api/native-gamepad',r=>r.fulfill({json:{connected:false}}));
    await page.addInitScript(()=>{
      localStorage.setItem('echoes:story-progress:v2',JSON.stringify({currentChapter:99,completedEventIds:[],storyFlags:{}}));
      performance.setResourceTimingBufferSize(5000);
      window.waveResizes=[];
      for(const key of ['width','height']) {
        const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,key);
        Object.defineProperty(HTMLCanvasElement.prototype,key,{...descriptor,set(value){
          if(this.closest('.frequency-puzzle-dialog'))window.waveResizes.push({key,value});
          descriptor.set.call(this,value);
        }});
      }
    });
    await page.goto(process.env.ECHOES_TEST_URL || 'http://127.0.0.1:3000');
    await page.waitForTimeout(18000);
    const command=async text=>{
      await page.keyboard.press('Backquote');
      await page.locator('.debug-item-spawner input').fill(text);
      await page.locator('.debug-item-spawner input').press('Enter');
    };
    await command('Game 2');
    await page.locator('.frequency-puzzle-dialog').waitFor();
    await page.waitForTimeout(700);
    const first=await page.evaluate(()=>window.waveResizes);
    assert.equal(first.length,2,'entrance animation must allocate bitmap width/height only once');
    const waveform=page.locator('.frequency-wave-canvas-wrap canvas');
    const initial=await waveform.evaluate(n=>({width:n.width,height:n.height}));
    await page.setViewportSize({width:1280,height:720});
    // This desktop puzzle keeps a minimum column width at these viewports.
    // Resize the actual observed canvas box as well to exercise its observer.
    await waveform.evaluate(n=>{n.style.width='70%';});
    await page.waitForTimeout(500);
    const resized=await waveform.evaluate(n=>({width:n.width,height:n.height,cssWidth:n.clientWidth}));
    assert.notEqual(resized.width,initial.width,'real layout resize updates bitmap');
    await page.waitForTimeout(200);
    const count=await page.evaluate(()=>window.waveResizes.length);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>window.waveResizes.length),count,'idle waveform does not reallocate');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await page.locator('.frequency-puzzle-dialog').waitFor({state:'detached'});
    await command('Game 2');
    await page.locator('.frequency-puzzle-dialog').waitFor();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.locator('.frequency-puzzle-dialog').waitFor({state:'detached'});
    await page.locator('.inventory-trigger').click();
    await page.locator('.inventory-selected-panel').waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS cold/repeated puzzle open, one entrance allocation, actual resize, keyboard close and return to inventory');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
