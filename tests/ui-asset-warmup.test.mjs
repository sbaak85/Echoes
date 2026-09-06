import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { getUiWarmupUrls, scheduleUiAssetWarmup } from '../app/ui-asset-warmup.ts';

function environment(t, fail = false) {
  const timers = new Map(), idle = new Map(), images = [];
  let id = 0;
  const original = new Map(['window','document','navigator','Image'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const install = (key,value)=>Object.defineProperty(globalThis,key,{configurable:true,value});
  install('window', {
    setTimeout: fn=>{timers.set(++id,fn);return id;}, clearTimeout: id=>timers.delete(id),
    requestIdleCallback: fn=>{idle.set(++id,fn);return id;}, cancelIdleCallback: id=>idle.delete(id),
  });
  install('document',{hidden:false}); install('navigator',{connection:{saveData:false}});
  install('Image',class {
    naturalWidth=40;naturalHeight=40;
    constructor(){images.push(this);}
    decode(){return fail ? Promise.reject(new Error('optional asset unavailable')) : Promise.resolve();}
  });
  t.after(()=>{for(const [k,d] of original){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
  const flush = async () => {
    for(const [key,fn] of [...timers]){timers.delete(key);fn();}
    for(const [key,fn] of [...idle]){idle.delete(key);fn({timeRemaining:()=>10});}
    await Promise.resolve();await Promise.resolve();
  };
  return {timers,idle,images,flush};
}

test('warmup loads actual runtime assets, with no reserve keyboard designs',()=>{
  const urls=getUiWarmupUrls();
  assert.equal(new Set(urls).size,urls.length);
  for(const url of urls.filter(s=>!s.startsWith('data:')))assert.ok(existsSync(new URL(`../public${url}`,import.meta.url)),url);
  assert.equal(urls.filter(s=>s.startsWith('data:')).length,19);
});
test('idle warmup pauses during UI ownership, serializes decode and cancels queued work',async t=>{
  const env=environment(t);let allowed=false;
  const stop=scheduleUiAssetWarmup(()=>allowed);
  assert.equal(env.images.length,0);
  await env.flush();assert.equal(env.images.length,0);
  allowed=true;await env.flush();assert.equal(env.images.length,1);
  assert.equal(env.images[0].fetchPriority,'low');
  document.hidden=true;await env.flush();assert.equal(env.images.length,1);
  stop();await env.flush();assert.equal(env.images.length,1);assert.equal(env.timers.size,0);
});
test('decode failure is nonfatal and does not strand the queue',async t=>{
  const env=environment(t,true);const stop=scheduleUiAssetWarmup(()=>true);
  await env.flush();await env.flush();assert.equal(env.images.length,2);stop();
});
test('data saver disables optional warmup',async t=>{
  const env=environment(t);navigator.connection.saveData=true;
  scheduleUiAssetWarmup(()=>true)();await env.flush();assert.equal(env.images.length,0);
});
