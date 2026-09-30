import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {ITEM_BY_ID,ITEM_DATABASE} from '../app/item-database.ts';
const source=await readFile(new URL('../app/movement-lab.tsx',import.meta.url),'utf8');
const handlers=source.slice(source.indexOf('  const isBackpackEquipmentAtPoint ='),source.indexOf('  const discardInventoryItem ='));
function harness(itemId,overEquipment,hotbar=2){
 const calls=[],pending={current:null};let timer;
 const ctx={ITEM_BY_ID,ITEM_DATABASE,pendingInventoryDragRef:pending,suppressInventoryClickRef:{current:false},document:{elementFromPoint:()=>({closest:()=>overEquipment?{}:null})},window:{clearTimeout(){},setTimeout(f){timer=f;return 1}},navigator:{vibrate(){}},getGameShellPointerPosition:(x,y)=>({x,y}),setInventoryContextMenu(){},setInventoryDrag(){},setBackpackDropTarget:v=>calls.push(['highlight',v]),setHotbarDropTarget(){},getHotbarSlotAtPoint:()=>hotbar,setHotbarSlotAssignment:(...a)=>calls.push(['hotbar',...a]),openItemUseConfirmation:(...a)=>calls.push(['equip',...a])};
 const api=runInNewContext(stripTypeScriptTypes(handlers+'\n({beginInventoryDrag,moveInventoryDrag,finishInventoryDrag,cancelInventoryDrag})'),ctx);
 const event={button:0,pointerId:1,pointerType:'mouse',clientX:0,clientY:0,currentTarget:{setPointerCapture(){}},preventDefault(){}};
 api.beginInventoryDrag(event,itemId);event.clientX=20;api.moveInventoryDrag(event);
 return {api,event,calls,pending};
}
test('背包拖到裝備格只開啟既有裝備確認，並清除拖曳狀態',()=>{
 const h=harness('T0012',true);h.api.finishInventoryDrag(h.event);
 assert.equal(h.calls.filter(c=>c[0]==='equip').length,1);assert.equal(h.calls.find(c=>c[0]==='equip')[1],'T0012');assert.equal(h.calls.filter(c=>c[0]==='hotbar').length,0);assert.equal(h.pending.current,null);assert.deepEqual(h.calls.at(-1),['highlight',false]);
});
test('背包拖到快捷格或其他位置不裝備、不設快捷',()=>{const h=harness('T0013',false);h.api.finishInventoryDrag(h.event);assert.equal(h.calls.filter(c=>['equip','hotbar'].includes(c[0])).length,0)});
test('普通道具仍拖放至快捷格；取消背包拖曳不執行裝備',()=>{const h=harness('R0001',false);h.api.finishInventoryDrag(h.event);assert.equal(h.calls.filter(c=>c[0]==='hotbar').length,1);const bag=harness('T0012',true);bag.api.cancelInventoryDrag(bag.event);assert.equal(bag.calls.filter(c=>c[0]==='equip').length,0);assert.equal(bag.pending.current,null)});
