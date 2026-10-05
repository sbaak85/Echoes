import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AUDIO_EVENT_CONFIG, AudioEventManager, getPlantVineMotionVolume, PLANT_VINE_MOTION_AUDIO_CONFIG } from '../app/audio-event-manager.ts';

test('the vine pool uses the three supplied MP3s without modifying their bytes', async () => {
  const definition = AUDIO_EVENT_CONFIG.plantVineMotion;
  assert.deepEqual(definition.sources, ['./audio/vine_1.mp3', './audio/vine_2.mp3', './audio/vine_3.mp3']);
  assert.equal(definition.volume, .8);
  const hashes = [
    'c584f97e2e95b9102a83e7fb88267849e158ad8178a2005cf4570320e58c2c93',
    'dae61d811c4f6164ec7b1d4e6124f0b3060d5d00a15ac85ce6c2fabb69a5fd32',
    'ed648154d381f14cdf7f0fba682689dd4b4670c94d38f768f273f655ce46b95e',
  ];
  for (let i = 0; i < 3; i++) {
    const copied = await readFile(new URL(`../public/audio/vine_${i + 1}.mp3`, import.meta.url));
    assert.equal(createHash('sha256').update(copied).digest('hex'), hashes[i]);
  }
});

test('stopped movement is silent, slow movement starts at 10%, and fastest movement caps at 80%', () => {
  const config = PLANT_VINE_MOTION_AUDIO_CONFIG;
  for (const speed of [0, -1, NaN, Infinity, config.stopSpeed]) assert.equal(getPlantVineMotionVolume(speed), 0);
  assert.ok(Math.abs(getPlantVineMotionVolume(config.stopSpeed + 1e-8) - .1) < 1e-6);
  const middle = (config.stopSpeed + config.fullVolumeSpeed) / 2;
  assert.ok(Math.abs(getPlantVineMotionVolume(middle) - .45) < 1e-10);
  assert.equal(getPlantVineMotionVolume(1), .8);
  assert.equal(getPlantVineMotionVolume(100), .8);
});

function audioRig(t, deferred = false) {
  const audios = [];
  class FakeAudio extends EventTarget {
    currentTime = 0; volume = 1; paused = true; loop = false; plays = 0;
    constructor(src) { super(); this.src = src; audios.push(this); }
    play() {
      this.plays++; this.paused = false;
      if (!deferred) return Promise.resolve();
      return new Promise(resolve => { this.resolve = () => { this.paused = false; resolve(); }; });
    }
    pause() { this.paused = true; }
    load() {}
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  globalThis.Audio = FakeAudio;
  const manager = new AudioEventManager();
  t.after(() => { manager.dispose(); if (original) Object.defineProperty(globalThis, 'Audio', original); else delete globalThis.Audio; });
  return { manager, voices: () => audios.filter(audio => audio.loop && /vine_\d\.mp3$/.test(audio.src)) };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('left/right use distinct random voices, change volume without restarting, and stop independently', async t => {
  const { manager, voices } = audioRig(t);
  manager.setPlantVineMotion({ L: 1, R: .2 }); await settle();
  const [left, right] = voices();
  assert.notEqual(left.src, right.src);
  assert.equal(left.volume, .8); assert.equal(right.volume, getPlantVineMotionVolume(.2));
  for (let i = 0; i < 240; i++) manager.setPlantVineMotion({ L: .5, R: .05 });
  assert.equal(voices().length, 2); assert.equal(left.plays, 1); assert.equal(right.plays, 1);
  manager.setPlantVineMotion({ L: 0, R: .3 });
  assert.equal(left.paused, true); assert.equal(left.volume, 0); assert.equal(left.currentTime, 0);
  assert.equal(right.paused, false); assert.equal(right.plays, 1);
  manager.setPlantVineMotion({ L: .1, R: .3 }); await settle();
  const newLeft = voices().at(-1); assert.notEqual(newLeft.src, right.src);
  manager.stopPlantVines();
  for (const voice of voices()) { assert.equal(voice.paused, true); assert.equal(voice.volume, 0); }
});

test('a stationary side never gets a voice, and late playback cannot resurrect stopped or disposed voices', async t => {
  const { manager, voices } = audioRig(t, true);
  manager.setPlantVineMotion({ L: .5, R: 0 });
  assert.equal(voices().length, 1);
  const old = voices()[0];
  manager.stopPlantVines();
  manager.setPlantVineMotion({ L: .5, R: .5 });
  const [newLeft, newRight] = voices().slice(1);
  old.resolve(); await settle();
  assert.equal(old.paused, true); assert.equal(newLeft.paused, false); assert.equal(newRight.paused, false);
  manager.dispose(); newLeft.resolve(); newRight.resolve(); await settle();
  for (const voice of voices()) { assert.equal(voice.paused, true); assert.equal(voice.volume, 0); }
  manager.setPlantVineMotion({ L: 1, R: 1 }); assert.equal(voices().length, 3);
});
