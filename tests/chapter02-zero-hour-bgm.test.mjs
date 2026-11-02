import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BGM_TRACK_CONFIG, BGM_CONTROL_RULES } from '../app/audio-event-manager.ts';
import { BgmDirector, resolveBgmControlPlan } from '../app/bgm-director.ts';
import { ChapterFlowManager } from '../app/chapter-flow-manager.ts';
import { createChapter02EmergencyFlow, CHAPTER02_ZERO_HOUR_BGM_EVENT_ID } from '../app/chapter02-emergency-flow.ts';

test('Zero Hour is a managed looping BGM and its deployed bytes match the source asset', () => {
  const track=BGM_TRACK_CONFIG['chapter02-zero-hour'];
  assert.equal(track.loop,true);
  assert.equal(track.volume,.3);
  assert.equal(track.rememberPosition,true);
  assert.equal(track.sources[0],'./audio/Zero Hour_1.mp3');
  assert.deepEqual(readFileSync(new URL('../public/audio/Zero Hour_1.mp3',import.meta.url)),readFileSync(new URL('../Assets/Audio/Zero Hour_1.mp3',import.meta.url)));
  const lookup=(type,id)=>type==='event'&&id===CHAPTER02_ZERO_HOUR_BGM_EVENT_ID?'triggered':null;
  const plan=resolveBgmControlPlan(BGM_CONTROL_RULES,lookup);
  assert.equal(plan.trackId,'chapter02-zero-hour'); assert.equal(plan.volumeMultiplier,1);
  const death=resolveBgmControlPlan(BGM_CONTROL_RULES,(type,id)=>type==='event'&&id==='survival-death-imminent'?'triggered':lookup(type,id));
  assert.equal(death.volumeMultiplier,0,'death still silences this stage music');
  const minigame=resolveBgmControlPlan(BGM_CONTROL_RULES,(type,id)=>type==='minigame'&&id==='star-cards'?'playing':lookup(type,id));
  assert.equal(minigame.trackId,'star-cards','minigame rules retain their priority');
});

for(const skip of [false,true]) test(`red-alert reveal starts Zero Hour immediately, without reviving main BGM (${skip?'skip':'normal'})`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let now=0,nextFrame=0;const frames=new Map(),audios=[],events=[];
  class FakeAudio extends EventTarget {
    currentTime=0;duration=300;readyState=1;paused=true;volume=0;
    constructor(){super();audios.push(this);}
    play(){this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}
    load(){this.currentTime=0;}
    removeAttribute(){}
  }
  const replacements={Audio:FakeAudio,document:{hidden:false},window:{clearTimeout(){}},requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id)};
  const restore=Object.entries(replacements).map(([key,value])=>{const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});return()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key];});
  t.mock.method(performance,'now',()=>now);
  const bgm=new BgmDirector();t.after(()=>{bgm.dispose();restore.forEach(fn=>fn());});
  bgm.setUserVolume(.35);await bgm.play();
  const manager=new ChapterFlowManager({
    setInputLocked(){},setBlack(){},fadeToBlack(){},showCenteredText(){},hideCenteredText(){},setStoryFlag(){},
    isCompleted:()=>false,markCompleted(){},cancelDialogue(){},
    triggerBgmEvent(id){events.push([id,now]);bgm.triggerEvent(id);},clearBgmEvent:id=>bgm.clearEvent(id),
    playAudioEvent:(name,delay)=>events.push([name,now+delay]),
    fadeFromBlack(){
      events.push(['reveal',now]);
      assert.ok(audios.some(a=>a.src==='./audio/Zero Hour_1.mp3'&&!a.paused),'new track play requested at reveal');
      assert.equal(audios[0].volume,0,'main BGM stays silent at the handoff');
    },
    playDialogue:async()=>({completed:true}),
  });
  const run=manager.run(createChapter02EmergencyFlow());if(skip)manager.requestSkip();
  for(let i=0;i<1800;i++){
    await Promise.resolve();now+=16;t.mock.timers.tick(16);await Promise.resolve();
    const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));
  }
  await run;
  const at=id=>events.find(e=>e[0]===id)?.[1];
  assert.equal(at(CHAPTER02_ZERO_HOUR_BGM_EVENT_ID),at('reveal'));
  if(!skip)assert.ok(at(CHAPTER02_ZERO_HOUR_BGM_EVENT_ID)>at('chapter02EmergencyAlarm'));
  const music=audios.find(a=>a.src==='./audio/Zero Hour_1.mp3');
  assert.equal(music.loop,true);assert.equal(music.paused,false);assert.equal(music.volume,.35*.3);
  assert.equal(audios[0].paused,true,'old music deck is stopped after switching');
  bgm.triggerDialogueLine('chapter02-section-13-line-002');
  assert.equal(music.paused,false,'later dialogue does not release the stage BGM');
  bgm.setUserVolume(0);await Promise.resolve();
  const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));
  assert.equal(music.volume,0,'Options BGM volume still applies');
});
