import test from 'node:test';
import assert from 'node:assert/strict';
import { installInput } from './input.mjs';

test('simulated gamepad, mouse, touch and keyboard maintain one input owner', () => {
  const events = new Map(), windowEvents = new Map(), callbacks = [];
  const buttons = [['sound',800,20],['reset',900,20],['slot-0',100,420],['slot-1',300,420],['slot-2',500,420],['slot-3',700,420],['hint',900,420],['card-A',200,650],['card-B',500,650],['card-C',800,650]].map(([id,x,y]) => ({
    id, dataset:{}, disabled:false, offsetParent:{}, clicks:0,
    getBoundingClientRect:()=>({left:x,top:y,width:90,height:45}),
    focus(){ document.activeElement=this; }, blur(){ document.activeElement=null; },
    click(){ this.clicks++; }, scrollIntoView(){},
    removeAttribute(name){ if(name==='data-nav') delete this.dataset.nav; },
    closest(){ return this; },
  }));
  const pad = { axes:[0,0], buttons:Array.from({length:16},()=>({pressed:false})) };
  globalThis.HTMLElement = Object;
  globalThis.document = {
    body:{dataset:{owner:'mouse'}},activeElement:null,
    querySelector:selector=>buttons.find(button=>`#${button.id}`===selector),
    querySelectorAll:selector=>selector==='button'?buttons:buttons.filter(button=>button.dataset.nav),
    addEventListener:(name,callback)=>events.set(name,callback),
  };
  globalThis.window={addEventListener:(name,callback)=>windowEvents.set(name,callback)};
  Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[pad]},configurable:true});
  globalThis.requestAnimationFrame=callback=>callbacks.push(callback);
  let cancels=0, cancelDragOnTakeover=false;
  installInput({cancel:()=>cancels++,onOwnerChange:()=>cancelDragOnTakeover});
  const tick=time=>callbacks.shift()(time);
  const nav=()=>buttons.filter(button=>button.dataset.nav);
  const key=value=>events.get('keydown')({key:value,preventDefault(){}});
  pad.axes[0]=1; tick(10);
  assert.equal(document.body.dataset.owner,'gamepad'); assert.equal(nav().length,1);
  assert.equal(nav()[0].id,'card-B');
  pad.buttons[0].pressed=true; tick(20); tick(30);
  assert.equal(buttons.find(button=>button.id==='card-B').clicks,1,'held A activates once');
  events.get('pointerdown')({pointerType:'mouse',target:buttons[2]});
  assert.equal(document.body.dataset.owner,'mouse'); assert.equal(nav().length,0);
  tick(1000); assert.equal(document.body.dataset.owner,'mouse','held stick cannot steal mouse ownership');
  pad.axes[0]=0; pad.buttons[0].pressed=false; tick(1100);
  pad.axes[0]=-1; tick(1200); assert.equal(document.body.dataset.owner,'gamepad'); assert.equal(nav().length,1);
  events.get('pointerdown')({pointerType:'touch',target:buttons[3]});
  assert.equal(document.body.dataset.owner,'touch'); assert.equal(nav().length,0);
  events.get('pointerdown')({pointerType:'mouse',target:buttons[3]});
  assert.equal(document.body.dataset.owner,'touch','compatibility mouse event does not steal touch');
  key('Tab'); assert.equal(document.body.dataset.owner,'keyboard'); assert.equal(nav().length,1);
  key('Escape'); assert.equal(cancels,1);
  pad.axes[0]=0; tick(1300); pad.buttons[0].pressed=true; tick(1400);
  assert.equal(document.body.dataset.owner,'gamepad'); assert.equal(nav().length,1);
  pad.buttons[0].pressed=false; pad.axes[0]=0; tick(1500);
  for(let i=0;i<5;i++){pad.axes[0]=1;tick(1600+i*20);pad.axes[0]=0;tick(1610+i*20);}
  assert.equal(nav().length,1,'directional wrap keeps one valid target');
  windowEvents.get('blur')(); assert.equal(nav().length,0);
  windowEvents.get('focus')(); pad.buttons[0].pressed=true; tick(2000);
  assert.equal(nav().length,0,'focus restoration requires controls to be released');
  pad.buttons[0].pressed=false; tick(2100); pad.buttons[0].pressed=true; tick(2200);
  assert.equal(nav().length,1);
  const clicksBeforeHandoff = buttons.reduce((sum,button)=>sum+button.clicks,0);
  cancelDragOnTakeover=true;
  key('Enter');
  assert.equal(buttons.reduce((sum,button)=>sum+button.clicks,0),clicksBeforeHandoff,'confirm that cancels a pointer drag must not also activate its target');
  cancelDragOnTakeover=false;
  key('Enter');
  assert.equal(buttons.reduce((sum,button)=>sum+button.clicks,0),clicksBeforeHandoff+1,'next deliberate confirm remains usable');
});
