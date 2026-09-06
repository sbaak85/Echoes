const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { QuestRuntimeManager } = require('../app/quest-runtime-manager.ts');

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const document=JSON.parse(fs.readFileSync('public/quests/quest-data.json','utf8'));
    const manager=new QuestRuntimeManager(document,{scheduleQuestStart:()=>{}});
    manager.completeQuest('QUEST_CH03_MAIN_001');manager.startQuest('QUEST_CH03_MAIN_002');
    const quest=manager.exportSave();
    Object.assign(quest.quests.QUEST_CH03_MAIN_001,{questCompletionPresented:true,completionTriggerCompleted:true});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/save-data**',r=>r.request().method()==='GET'
      ?r.fulfill({status:404,json:{error:'empty-slot'}}):r.fulfill({status:503,body:'Read-only regression'}));
    await page.route('**/api/native-gamepad',r=>r.fulfill({json:{connected:false}}));
    await page.addInitScript(quest=>{
      localStorage.setItem('echoes:quest-runtime:v1',JSON.stringify(quest));
      localStorage.setItem('echoes:story-progress:v2',JSON.stringify({currentChapter:99,completedEventIds:[],storyFlags:{QUEST_CH03_MAIN_001_COMPLETED:true}}));
      window.pad={id:'Xbox standard',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0})),timestamp:0};
      Object.defineProperty(navigator,'getGamepads',{value:()=>[window.pad]});
    },quest);
    const press=async index=>{
      await page.evaluate(i=>window.pad.buttons[i]={pressed:true,value:1},index);await page.waitForTimeout(130);
      await page.evaluate(i=>window.pad.buttons[i]={pressed:false,value:0},index);await page.waitForTimeout(170);
    };
    await page.goto(process.env.ECHOES_TEST_URL || 'http://127.0.0.1:3000');
    await page.waitForTimeout(18000);
    await page.locator('.dialogue-box').waitFor();
    const firstText=await page.locator('.dialogue-text').textContent();
    assert.equal(await page.locator('.dialogue-history-trigger').count(),0);
    await page.locator('.dialogue-box').click({button:'right'});
    assert.equal(await page.locator('.dialogue-history-overlay').count(),0);
    await press(6);
    assert.equal(await page.locator('.dialogue-history-overlay').count(),0);
    assert.equal(await page.locator('.dialogue-text').textContent(),firstText);
    assert.equal(await page.locator('.dialogue-history-trigger').count(),0);
    console.log('PASS first script line: hint absent, mouse right and LT blocked, dialogue not advanced');
    await page.keyboard.press('Space');
    await page.locator('.dialogue-history-trigger').waitFor();
    await page.waitForTimeout(500);
    const requests=[];page.on('request',r=>requests.push(r.url()));
    await page.evaluate(()=>{
      window.historyFrameGaps=[];let last=performance.now();const end=last+650;
      const frame=now=>{window.historyFrameGaps.push(now-last);last=now;if(now<end)requestAnimationFrame(frame)};requestAnimationFrame(frame);
    });
    await page.locator('.dialogue-history-trigger').click();
    await page.locator('.dialogue-history-overlay').waitFor();
    assert.equal(await page.locator('.dialogue-history-entry').count(),1);
    assert.equal(await page.locator('.dialogue-history-entry p').textContent(),firstText);
    await page.waitForTimeout(150);
    // Exercise content sizing and the story-flow specificity that formerly put
    // the ordinary dialogue behind the backdrop. Extra rows are layout fixtures.
    const layout = await page.evaluate(()=>{
      const shell=document.querySelector('.game-shell');
      const box=document.querySelector('.dialogue-box');
      const overlay=document.querySelector('.dialogue-history-overlay');
      const panel=document.querySelector('.dialogue-history-panel');
      const list=document.querySelector('.dialogue-history-list');
      const short=panel.getBoundingClientRect();
      const wasStory=shell.classList.contains('is-story-flow');
      shell.classList.add('is-story-flow');
      const above=Number(getComputedStyle(box).zIndex)>Number(getComputedStyle(overlay).zIndex);
      const copies=[];
      for(let i=0;i<30;i++){const copy=list.firstElementChild.cloneNode(true);list.append(copy);copies.push(copy);}
      const tall=panel.getBoundingClientRect();
      const scrolls=list.scrollHeight>list.clientHeight;
      copies.forEach(copy=>copy.remove());
      if(!wasStory)shell.classList.remove('is-story-flow');
      return {shortHeight:short.height,tallHeight:tall.height,bottomDelta:Math.abs(tall.bottom-short.bottom),top:tall.top,scrolls,above};
    });
    assert.ok(layout.tallHeight>layout.shortHeight+100,JSON.stringify(layout));
    assert.ok(layout.bottomDelta<1,JSON.stringify(layout));
    assert.ok(layout.top>=0 && layout.scrolls && layout.above,JSON.stringify(layout));
    console.log('PASS bottom-anchored content height, capped scrolling and story-flow foreground',layout);
    const paused=await page.locator('.dialogue-text').textContent();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.dialogue-text').textContent(),paused);
    console.log(JSON.stringify({historyFirstOpenMaxFrameMs:await page.evaluate(()=>Math.max(...window.historyFrameGaps)),scriptFetches:requests.filter(url=>/quests|scene\.json|story-content/.test(url))}));
    assert.equal(requests.filter(url=>/quests|scene\.json|story-content/.test(url)).length,0);
    await press(6);await page.locator('.dialogue-history-overlay').waitFor({state:'detached'});
    await press(6);await page.locator('.dialogue-history-overlay').waitFor();
    assert.equal(await page.locator('.dialogue-history-entry').count(),1);
    await page.locator('.dialogue-history-overlay').click({button:'right',position:{x:20,y:20}});
    await page.locator('.dialogue-history-overlay').waitFor({state:'detached'});
    assert.equal(await page.locator('.dialogue-box').count(),1);
    assert.deepEqual(errors,[]);
    console.log('PASS second line: exact prior script line, typing pause, LT reopen/close and mouse takeover');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
