import test from 'node:test';
import assert from 'node:assert/strict';
import { installCardDrag } from './drag.mjs';
import { CARDS } from './model.mjs';

test('drag cancellation, capture loss and drop cleanup do not leak a trailing click',()=>{
  const events=new Map(), windowEvents=new Map(), elements=[];
  const dispatch=(type,event)=>{for(const callback of events.get(type)||[]) callback(event);};
  class Element {
    constructor(id='',classes=[],rect={left:0,right:200,top:0,bottom:100}){
      this.id=id; this.classes=new Set(classes); this.rect=rect; this.capture=new Set(); this.style={setProperty(){}}; this.disabled=false;
      this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),remove:(...names)=>names.forEach(name=>this.classes.delete(name)),contains:name=>this.classes.has(name),toggle:(name,flag)=>flag?this.classes.add(name):this.classes.delete(name)};
      elements.push(this);
    }
    getBoundingClientRect(){return this.rect;}
    closest(selector){return selector.split(',').some(name=>this.classes.has(name.slice(1)))?this:null;}
    setPointerCapture(id){this.capture.add(id);}
    hasPointerCapture(id){return this.capture.has(id);}
    releasePointerCapture(id){this.capture.delete(id);dispatch('lostpointercapture',{pointerId:id});}
    setAttribute(){}
    querySelector(){return this.caption||=( {textContent:''} );}
    remove(){this.removed=true;}
  }
  const slot0=new Element('slot-0',['slot']);
  const slot1=new Element('slot-1',['slot'],{left:250,right:450,top:0,bottom:100});
  const cardA=new Element('card-A',['bus-card']);
  const drawer=new Element('drawer',['card-drawer']);
  globalThis.document={
    body:{dataset:{},append(element){element.appended=true;}},
    createElement:()=>new Element(),
    getElementById:id=>elements.find(element=>element.id===id),
    querySelector:()=>drawer,
    querySelectorAll:selector=>elements.filter(element=>!element.removed&&selector.split(',').some(name=>element.classes.has(name.slice(1)))),
    elementFromPoint:(x,y)=>y>=0&&y<=100?(x<=200?slot0:slot1):drawer,
    addEventListener:(name,callback)=>events.set(name,[...(events.get(name)||[]),callback]),
  };
  globalThis.window={addEventListener:(name,callback)=>windowEvents.set(name,callback)};
  let slots=['A','B',null,null],detachCount=0,cancellations=[],drops=[];
  const drag=installCardDrag({cards:CARDS,readSlots:()=>slots,snapshot:()=>({moves:4,selected:null}),onStart(){},onDetach(){slots[0]=null;detachCount++;},onDrop:(session,intent)=>drops.push(intent),onCancel:session=>{cancellations.push(session);if(session.detached) slots[0]=session.card;}});
  const event=(x=100,y=50)=>({target:slot0,pointerId:1,pointerType:'mouse',button:0,isPrimary:true,clientX:x,clientY:y,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
  const ghosts=()=>elements.filter(element=>element.appended&&!element.removed);
  const start=()=>{dispatch('pointerdown',event());dispatch('pointermove',event(300,50));};
  for(const cause of ['blur','pointercancel','lostpointercapture','owner']){
    start(); assert.equal(slots[0],null); assert.equal(ghosts().length,1); assert.equal(document.body.dataset.dragging,'A');
    assert.equal(slot1.classes.has('drop-swap'),true);
    assert.match(ghosts()[0].querySelector().textContent,/放開交換 A \/ B/);
    if(cause==='blur') windowEvents.get('blur')();
    else if(cause==='owner') drag.cancel();
    else dispatch(cause,event(300,50));
    assert.equal(slots[0],'A'); assert.equal(drag.active,false); assert.equal(ghosts().length,0);
    assert.equal(document.body.dataset.dragging,undefined); assert.equal(slot0.capture.size,0);
    assert.equal(slot0.classes.has('drag-origin'),false); assert.equal(slot1.classes.has('drop-ready'),false);
    assert.equal(slot1.classes.has('drop-swap'),false); assert.equal(slots[1],'B');
    const click={...event(),detail:1};dispatch('click',click);assert.equal(click.stopped,true);
  }
  assert.equal(detachCount,4);assert.equal(cancellations.length,4);
  assert.equal(cancellations[0].before.moves,4);
  dispatch('pointerdown',event());drag.cancel();
  const pendingClick={...event(),detail:1};dispatch('click',pendingClick);
  assert.equal(pendingClick.stopped,true,'cancel before threshold also suppresses release click');
  assert.equal(cancellations.length,4,'a pending click did not mutate the board');
  slots[1]=null;
  start();dispatch('pointerup',event(300,50));
  assert.deepEqual(drops,[{type:'insert',slot:1}]);assert.equal(ghosts().length,0);assert.equal(slot0.capture.size,0);
  const click={...event(),detail:1};dispatch('click',click);assert.equal(click.stopped,true);
  const keyboardClick={...event(),detail:0};dispatch('click',keyboardClick);assert.equal(keyboardClick.stopped,undefined);
  slots=['A','B','C',null];
  start();dispatch('pointerup',event(300,50));
  assert.deepEqual(drops[1],{type:'swap',slot:1});
  assert.equal(slot1.classes.has('drop-swap'),false); assert.equal(ghosts().length,0);
  const swapClick={...event(),detail:1};dispatch('click',swapClick);assert.equal(swapClick.stopped,true);
});
