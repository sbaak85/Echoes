// Local-server regression: isolated browser inventory, with all save writes blocked.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { ITEM_DEFINITIONS } = require('../app/item-database.ts');

(async () => {
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/save-data**', route => route.request().method() === 'GET'
      ? route.fulfill({status:404,json:{error:'empty-slot'}}) : route.fulfill({status:503,body:'Read-only regression'}));
    await page.route('**/api/native-gamepad', route => route.fulfill({status:200,json:{connected:false}}));
    await page.addInitScript(inventory => {
      localStorage.setItem('echoes:story-progress:v2',JSON.stringify({currentChapter:99,completedEventIds:[],storyFlags:{}}));
      localStorage.setItem('echoes:player-inventory:v1',JSON.stringify(inventory));
      window.pad = {id:'Xbox standard',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0})),timestamp:0};
      Object.defineProperty(navigator,'getGamepads',{value:()=>[window.pad]});
    }, Object.fromEntries(ITEM_DEFINITIONS.slice(0,20).map(item=>[item.id,1])));
    const press = async (index, duration=130) => {
      await page.evaluate(index=>window.pad.buttons[index]={pressed:true,value:1},index);
      await page.waitForTimeout(duration);
      await page.evaluate(index=>window.pad.buttons[index]={pressed:false,value:0},index);
      await page.waitForTimeout(160);
    };
    const currentPage = () => page.locator('.inventory-pages').getAttribute('data-page');
    const selectedIsFirst = async () => {
      assert.equal(await page.locator('.inventory-item.is-selected').count(),1);
      assert.equal(await page.locator('.inventory-item.is-selected').getAttribute('data-inventory-index'),await page.locator('.inventory-item').first().getAttribute('data-inventory-index'));
    };
    await page.goto(process.env.ECHOES_TEST_URL || 'http://127.0.0.1:3000');
    await page.waitForTimeout(18000);
    await page.locator('.inventory-trigger').click();
    await page.locator('.inventory-item').first().waitFor();
    assert.equal(await page.locator('.inventory-pages').getAttribute('data-page-count'),'2');
    assert.equal(await page.locator('.inventory-item').count(),16);
    await page.locator('.inventory-item').last().click();
    await press(15);
    assert.equal(await currentPage(),'1'); await selectedIsFirst();
    console.log('PASS slot 16 right enters next page, with one first-item selection');
    await press(14);
    assert.equal(await currentPage(),'0');
    assert.equal(await page.locator('.inventory-item.is-selected').count(),1);
    assert.equal(await page.locator('.inventory-item.is-selected').getAttribute('data-inventory-index'),await page.locator('.inventory-item').last().getAttribute('data-inventory-index'));
    await press(15);
    assert.equal(await currentPage(),'1'); await selectedIsFirst();
    console.log('PASS partial-page first slot left returns to previous page last slot, and right returns to next page first slot');
    await page.locator('.inventory-item').last().click();
    await press(15);
    assert.equal(await currentPage(),'1'); await selectedIsFirst();
    console.log('PASS final partial page wraps locally when there is no next page');
    await press(6);
    assert.equal(await currentPage(),'0'); await selectedIsFirst();
    await press(14);
    assert.equal(await currentPage(),'0');
    assert.equal(await page.locator('.inventory-item.is-selected').getAttribute('data-inventory-index'),await page.locator('.inventory-item').last().getAttribute('data-inventory-index'));
    console.log('PASS first-page first slot left wraps to its own last slot');
    await press(7,700);
    assert.equal(await currentPage(),'1'); await selectedIsFirst();
    assert.equal(await page.locator('.inventory-pages [data-gamepad-glyph]').count(),2);
    assert.deepEqual(await page.locator('.inventory-pages img.gamepad-button-icon').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).transform)),['matrix(1, 0, 0, 1, 0, 1)','matrix(1, 0, 0, 1, 0, 1)']);
    console.log('PASS LT/RT page through current state and a held trigger fires only once');
    if (process.env.ECHOES_TEST_SCREENSHOT) await page.locator('.inventory-pages').screenshot({path:process.env.ECHOES_TEST_SCREENSHOT});
    await page.locator('.inventory-item').first().hover();
    assert.equal(await page.locator('.inventory-pages [data-gamepad-glyph]').count(),0);
    await press(6);
    assert.equal(await currentPage(),'0');
    assert.equal(await page.locator('.inventory-pages [data-gamepad-glyph]').count(),2);
    console.log('PASS mouse/gamepad takeover updates page prompts');
    await page.locator('.inventory-categories button').filter({hasText:'食物'}).click();
    await page.locator('.inventory-item').last().click();
    await press(15);
    assert.equal(await currentPage(),'0'); await selectedIsFirst();
    await press(7); await press(6);
    assert.equal(await currentPage(),'0');
    assert.equal(await page.locator('.inventory-pages button:disabled').count(),2);
    assert.equal(await page.locator('.inventory-pages [data-gamepad-glyph]').count(),2);
    assert.equal(await page.locator('.inventory-pages button').first().evaluate(e=>getComputedStyle(e).opacity),'0.28');
    console.log('PASS single-page navigation wraps locally and both trigger hints are dimmed and inactive');
    await page.locator('.inventory-categories button').filter({hasText:'全部'}).click();
    await page.locator('.inventory-item').first().click();
    await page.locator('[data-inventory-action="inspect"]').click();
    await press(7);
    assert.equal(await currentPage(),'0');
    assert.equal(await page.locator('.inventory-item-inspect-overlay').count(),1);
    console.log('PASS inspect modal blocks underlying trigger pagination');
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
