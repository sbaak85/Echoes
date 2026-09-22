import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync, existsSync} from "node:fs";
import {AudioEventManager, AUDIO_EVENT_CONFIG} from "../app/audio-event-manager.ts";

test("workbench audio is indexed in the editor config with deployed original MP3s", () => {
  for(const [id,file] of [["workbenchToolHover","製作工具"],["workbenchCookingHover","煮食切菜"],["workbenchToolOpen","開啟工具2"],["workbenchCookingOpen","開啟料理2"]]) {
    const config=AUDIO_EVENT_CONFIG[id];
    assert.equal(config.delaySeconds,0);
    assert.equal(config.sources[0],`./audio/${file}.mp3`);
    assert.ok(existsSync(new URL(`../public/audio/${file}.mp3`,import.meta.url)));
    assert.deepEqual(readFileSync(new URL(`../public/audio/${file}.mp3`,import.meta.url)),readFileSync(new URL(`../Assets/Audio/${file}.mp3`,import.meta.url)));
  }
});

test("A-B-A starts immediately; previous voices fade in 100ms without pausing or rewinding", async t => {
  const audios=[],frames=new Map();let frame=0,now=0;
  class FakeAudio extends EventTarget {
    currentTime=0; volume=1; paused=true; ended=false; duration=10;
    constructor(src){super();this.src=src;audios.push(this);}
    play(){this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}
    load(){}
  }
  t.mock.method(performance,"now",()=>now);
  const oldAudio=globalThis.Audio,oldWindow=globalThis.window;
  globalThis.Audio=FakeAudio;
  globalThis.window={requestAnimationFrame:cb=>{frames.set(++frame,cb);return frame;},cancelAnimationFrame:id=>frames.delete(id),clearTimeout(){}};
  t.after(()=>{globalThis.Audio=oldAudio;globalThis.window=oldWindow;});
  const manager=new AudioEventManager();
  const tick=time=>{now=time;const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(now));};
  await manager.playWorkbenchHover("workbenchToolHover");const a=audios.at(-1);a.currentTime=2;
  await manager.playWorkbenchHover("workbenchCookingHover");const b=audios.at(-1);
  assert.equal(b.paused,false);assert.equal(a.paused,false);assert.equal(b.volume,.7);
  tick(50);assert.ok(Math.abs(a.volume-.35)<1e-9);
  await manager.playWorkbenchHover("workbenchToolHover");const a2=audios.at(-1);
  assert.notEqual(a2,a);assert.equal(a.currentTime,2);assert.equal(a2.paused,false);
  tick(100);assert.equal(a.volume,0);assert.equal(a.paused,false);assert.ok(Math.abs(b.volume-.35)<1e-9);
  tick(150);assert.equal(b.volume,0);assert.equal(b.paused,false);assert.equal(a2.volume,.7);
  await manager.playWorkbenchHover(null);tick(250);assert.equal(a2.volume,0);assert.equal(a2.paused,false);
  a.dispatchEvent(new Event("ended"));b.dispatchEvent(new Event("ended"));
  manager.dispose();assert.equal(a2.paused,true);assert.equal(frames.size,0);
});
