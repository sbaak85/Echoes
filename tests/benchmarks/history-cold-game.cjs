const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { QuestRuntimeManager } = require('../../app/quest-runtime-manager.ts');
const output = 'docs/performance/history-cold-game-2026-09-05';
const backgrounds = [['camp','map_test01.png'],['scene02','map_test02.png'],['ruins','map_scene_06.png'],['jungleB','map_scene_06B.png'],['jungleC','map_scene_06C.png']];
const hash = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const runtimePaths = ['app/movement-lab.tsx','app/globals.css','app/dialogue-history.ts','app/ui-asset-warmup.ts'];
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const before = Object.fromEntries(runtimePaths.map(p=>[p,hash(p)]));
 const manager = new QuestRuntimeManager(JSON.parse(fs.readFileSync('public/quests/quest-data.json','utf8')),{scheduleQuestStart:()=>{}});
 manager.completeQuest('QUEST_CH03_MAIN_001');manager.startQuest('QUEST_CH03_MAIN_002');
 const quest=manager.exportSave();
 Object.assign(quest.quests.QUEST_CH03_MAIN_001,{questCompletionPresented:true,completionTriggerCompleted:true});
 const results=[];
 for(const [id,file] of backgrounds){
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:900}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let warmupDisabled=0,backgroundReplaced=0;
   await page.route('**/api/save-data**',r=>r.request().method()==='GET'?r.fulfill({status:404,json:{error:'empty-slot'}}):r.fulfill({status:503,body:'Read-only benchmark'}));
   await page.route('**/api/native-gamepad**',r=>r.fulfill({json:{connected:false}}));
   await page.route(/\/ui-asset-warmup\.ts(?:\?|$)/,r=>{warmupDisabled++;return r.fulfill({contentType:'application/javascript',body:'export function getUiWarmupUrls(){return []} export function scheduleUiAssetWarmup(){return ()=>{}}'});});
   await page.route(/\/map_test01\.png(?:\?|$)/,r=>{backgroundReplaced++;return r.fulfill({contentType:'image/png',body:fs.readFileSync('Assets/map/'+file)});});
   await page.addInitScript(quest=>{
    localStorage.setItem('echoes:quest-runtime:v1',JSON.stringify(quest));
    localStorage.setItem('echoes:story-progress:v2',JSON.stringify({currentChapter:99,completedEventIds:[],storyFlags:{QUEST_CH03_MAIN_001_COMPLETED:true}}));
   },quest);
   await page.goto('http://127.0.0.1:3000');
   await page.waitForTimeout(18000);
   await page.locator('.dialogue-box').waitFor();
   assert.equal(await page.locator('.dialogue-history-overlay').count(),0);
   assert.equal(await page.locator('.dialogue-history-trigger').count(),0);
   await page.keyboard.press('Space');
   await page.locator('.dialogue-history-trigger').waitFor();
   await page.waitForTimeout(1500);
   assert.ok(warmupDisabled>0,'warmup module must be replaced');
   assert.ok(backgroundReplaced>0,'background must be replaced');
   const timing=await page.evaluate(()=>new Promise(resolve=>{
    const gaps=[];let last=0;let start=0;let domMs=null,paintOpportunityMs=null;
    const observer=new MutationObserver(()=>{
     if(domMs===null && document.querySelector('.dialogue-history-overlay')){
      domMs=performance.now()-start;
      requestAnimationFrame(()=>setTimeout(()=>{paintOpportunityMs=performance.now()-start;},0));
     }
    });
    observer.observe(document.body,{childList:true,subtree:true});
    requestAnimationFrame(now=>{
     last=now;start=performance.now();
     function frame(time){gaps.push(time-last);last=time;if(time-start<350)requestAnimationFrame(frame);else{observer.disconnect();resolve({domMs,paintOpportunityMs,maxFrameGapMs:Math.max(...gaps),gaps});}}
     requestAnimationFrame(frame);
     document.querySelector('.dialogue-history-trigger').click();
    });
   }));
   await page.locator('.dialogue-history-overlay').waitFor();
   assert.equal(await page.locator('.dialogue-history-entry').count(),1);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:output+'/'+id+'.png'});
   const result={id,file,sha256:hash('Assets/map/'+file),browser:browser.version(),warmupDisabled,backgroundReplaced,...timing};
   results.push(result);fs.writeFileSync(output+'/results.json',JSON.stringify(results,null,2));
   console.log(JSON.stringify(result));
  }finally{await browser.close();}
 }
 fs.writeFileSync(output+'/runtime-hashes.json',JSON.stringify({before,after:Object.fromEntries(runtimePaths.map(p=>[p,hash(p)]))},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
