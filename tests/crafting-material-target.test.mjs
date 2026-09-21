import test from 'node:test';
import assert from 'node:assert/strict';
import {findCraftMaterialTarget} from '../app/crafting-material-target.ts';

test('material shortcut follows backpack order rather than recipe order',()=>{
 assert.deepEqual(findCraftMaterialTarget(['a','b','c'],['c','a'],new Set()),{id:'a',index:0,page:0});
});
test('skip assigned materials and navigate to the pending material page',()=>{
 const ids=Array.from({length:30},(_,i)=>`item-${i}`);
 assert.deepEqual(findCraftMaterialTarget(ids,['item-25','item-13','item-1'],new Set(['item-1'])),{id:'item-13',index:13,page:1});
 assert.deepEqual(findCraftMaterialTarget(ids,['item-25','item-13','item-1'],new Set(['item-1','item-13'])),{id:'item-25',index:25,page:2});
});
test('filtered inventory uses its own page and exhausted or missing materials return no target',()=>{
 assert.deepEqual(findCraftMaterialTarget(['a','c'],['a','c'],new Set(['a'])),{id:'c',index:1,page:0});
 assert.equal(findCraftMaterialTarget(['a'],['a'],new Set(['a'])),null);
 assert.equal(findCraftMaterialTarget(['a'],['b'],new Set()),null);
});
