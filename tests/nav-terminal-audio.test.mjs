import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { AudioEventManager, AUDIO_EVENT_CONFIG } from '../app/audio-event-manager.ts';

test('standalone preview resolves input/clear assets and restarts each press at configured volume', async t => {
  const voices = [];
  class FakeAudio extends EventTarget {
    paused = true; currentTime = 0; plays = 0;
    constructor(src) { super(); this.src = src; voices.push(this); }
    play() { this.plays++; this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const original = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  t.after(() => { if (original) globalThis.Audio = original; else delete globalThis.Audio; });
  const manager = new AudioEventManager({ eventNames: ['uiInput', 'navTerminalCleared', 'navTerminalInputRejected', 'navTerminalBlockCalibrated'], assetBaseUrl: 'https://example.test/Echoes/' });
  assert.equal(voices.length, 4, 'preview must not preload unrelated game or dialogue audio');
  const input = manager.getAudio('uiInput');
  const clear = manager.getAudio('navTerminalCleared');
  assert.equal(input.src, 'https://example.test/Echoes/audio/ui-input.mp3');
  assert.equal(input.volume, AUDIO_EVENT_CONFIG.uiInput.volume);
  assert.equal(clear.src, 'https://example.test/Echoes/audio/interaction-denied.mp3');
  assert.equal(clear.volume, AUDIO_EVENT_CONFIG.navTerminalCleared.volume);
  await manager.play('uiInput', { restart: true });
  input.currentTime = 0.2;
  await manager.play('uiInput', { restart: true });
  assert.equal(input.plays, 2);
  assert.equal(input.currentTime, 0);
  await manager.play('navTerminalCleared', { restart: true });
  assert.equal(clear.plays, 1);
  assert.equal(input.plays, 2, 'clear must not also play uiInput');
  const rejected = manager.getAudio('navTerminalInputRejected');
  assert.equal(rejected.src, 'https://example.test/Echoes/audio/star-cards-tie.mp3');
  assert.equal(rejected.volume, AUDIO_EVENT_CONFIG.navTerminalInputRejected.volume);
  await manager.play('navTerminalInputRejected', { restart: true });
  assert.equal(rejected.plays, 1);
  const calibrated = manager.getAudio('navTerminalBlockCalibrated');
  assert.equal(calibrated.src, 'https://example.test/Echoes/audio/frequency-lock-success.mp3');
  assert.equal(calibrated.volume, 0.6);
  await manager.play('navTerminalBlockCalibrated', { restart: true });
  assert.equal(calibrated.plays, 1);
  manager.dispose();
  assert.equal(input.paused, true);
  assert.equal(clear.paused, true);
});

test('submit sounds distinguish error, first calibration and already calibrated input', () => {
  const html = readFileSync(new URL('../public/minigames/nav-terminal/index.html', import.meta.url), 'utf8');
  const submitSource = html.match(/const submit = \(\) => \{[\s\S]*?\n  \};/)[0];
  for (const embedded of [true, false]) {
    for (const [code, solved, expected] of [['0000000', false, 1], ['1234567', false, 0], ['1234567', true, 0]]) {
      const events = [], classes = [];
      const context = {
        embedded, code, inputLocked: false, statusTimer: null,
        blocks: [{ fixed: '1234567', letter: 'A', solved, el: { classList: { add() {} } } }],
        codeReadout: { offsetWidth: 0, classList: { remove() {}, add(name) { classes.push(name); } } },
        clearTimeout() {}, setTimeout() {}, setStatus() {}, finishGame() {}, renderCode() {},
        notifyHost(type) { events.push(type); },
        window: { dispatchEvent(event) { events.push(event.type); } }, Event,
      };
      runInNewContext(`${submitSource}\nsubmit();`, context);
      const expectedType = expected ? 'input-rejected' : solved ? null : 'block-calibrated';
      assert.equal(events.length, expectedType ? 1 : 0);
      assert.equal(classes.includes('is-wrong'), Boolean(expected));
      if (expectedType) assert.equal(events[0], embedded ? expectedType : `nav-terminal-${expectedType}`);
      // 再輸入同一組已完成的數字，不重播成功音效。
      if (expectedType === 'block-calibrated') {
        events.length = 0;
        runInNewContext('submit();', context);
        assert.equal(events.length, 0);
      }
    }
  }
});

test('all terminal keys send exactly one input event; locked/unknown input is silent', () => {
  const html = readFileSync(new URL('../public/minigames/nav-terminal/index.html', import.meta.url), 'utf8');
  const pressKeySource = html.match(/const pressKey = label => \{[\s\S]*?\n  \};/)[0];
  for (const embedded of [true, false]) {
    const events = [];
    const context = {
      embedded, inputLocked: false, KEYS: ['1','2','3','4','5','6','7','8','9','*','0','<'],
      keyButtons: Array(12).fill({}), code: '', CODE_LENGTH: 7, statusTimer: null,
      codeReadout: { classList: { remove() {}, add() {} }, offsetWidth: 0 },
      flash() {}, backspace() {}, setStatus() {}, renderCode() {}, clearTimeout() {},
      submit() { context.inputLocked = true; },
      notifyHost(type) { events.push(type); },
      window: { dispatchEvent(event) { events.push(event.type); } }, Event,
    };
    runInNewContext(`${pressKeySource}\nthis.press = pressKey;`, context);
    for (const key of ['1', '<', '*', '1','2','3','4','5','6','7']) context.press(key);
    assert.equal(events.length, 10, 'seventh digit must sound once before submit locks input');
    context.press('8');
    assert.equal(events.length, 10);
    context.inputLocked = false;
    context.press('Escape');
    assert.equal(events.length, 10);
    assert.deepEqual(events, ['input', 'input', 'clear', ...Array(7).fill('input')]
      .map(type => embedded ? type : `nav-terminal-${type}`));
  }
});

test('matrix scan plays once per scan with 18% head/tail fades, rests after the 2.78s file, and fades out early only when the scan stops mid-way', async t => {
  const voices = [];
  class FakeAudio extends EventTarget {
    paused = true; ended = false; currentTime = 0; plays = 0; volume = 1; loop = false; duration = 2.784;
    constructor(src) { super(); this.src = src; voices.push(this); }
    play() { this.plays++; this.paused = false; this.ended = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  let now = 0; const frames = [];
  const originals = { Audio: globalThis.Audio, window: globalThis.window, now: globalThis.performance.now };
  globalThis.Audio = FakeAudio;
  globalThis.window = { requestAnimationFrame: cb => { frames.push(cb); return frames.length; }, cancelAnimationFrame: id => { frames[id - 1] = null; }, setTimeout, clearTimeout };
  globalThis.performance.now = () => now;
  t.after(() => {
    if (originals.Audio) globalThis.Audio = originals.Audio; else delete globalThis.Audio;
    if (originals.window) globalThis.window = originals.window; else delete globalThis.window;
    globalThis.performance.now = originals.now;
  });
  const manager = new AudioEventManager({ eventNames: ['navTerminalMatrixScan'], assetBaseUrl: 'https://example.test/Echoes/' });
  const scan = manager.getAudio('navTerminalMatrixScan');
  // 播放位置推進到 ms（音檔自帶的頭尾淡化依 currentTime 計算）
  const playTo = ms => { now += 16; scan.currentTime = ms / 1000; if (ms >= 2784) { scan.ended = true; scan.paused = true; } frames.splice(0).forEach(cb => cb?.(now)); };
  const cfg = AUDIO_EVENT_CONFIG.navTerminalMatrixScan;
  assert.equal(scan.src, 'https://example.test/Echoes/audio/electronic-se.mp3');
  const full = cfg.volume; assert.ok(full > 0 && full <= 1); assert.equal(cfg.loop, undefined, 'not looped');
  assert.equal(scan.loop, false);
  assert.ok(Math.abs(cfg.fadeInPercent / 100 * 2.784 - 0.5) < 0.01 && cfg.fadeInPercent === cfg.fadeOutPercent, '18% of 2.78s is about 0.5s');
  manager.setNavTerminalMatrixScanActive(true); await Promise.resolve(); await Promise.resolve();
  assert.equal(scan.plays, 1); assert.equal(scan.volume, 0);
  playTo(250); assert.ok(scan.volume > full * 0.3 && scan.volume < full * 0.7, `fade-in ${scan.volume}`);
  playTo(1400); assert.equal(scan.volume, full);
  playTo(2534); assert.ok(scan.volume > full * 0.3 && scan.volume < full * 0.7, `fade-out ${scan.volume}`);
  playTo(2784); assert.equal(scan.paused, true, 'file ends before the 3s scan, no loop');
  manager.setNavTerminalMatrixScanActive(false);
  assert.equal(frames.length, 0, 'scan end after natural finish does nothing');
  // 下一輪刷動：從頭重播
  manager.setNavTerminalMatrixScanActive(true); await Promise.resolve(); await Promise.resolve();
  assert.equal(scan.plays, 2); assert.equal(scan.currentTime, 0);
  playTo(1400); assert.equal(scan.volume, full);
  // 中途全部校對完成：0.5 秒提前淡出後停止
  manager.setNavTerminalMatrixScanActive(false);
  now += 250; frames.splice(0).forEach(cb => cb?.(now)); now += 1; frames.splice(0).forEach(cb => cb?.(now));
  assert.ok(scan.volume > full * 0.3 && scan.volume < full * 0.7, `early fade ${scan.volume}`);
  now += 300; frames.splice(0).forEach(cb => cb?.(now));
  assert.equal(scan.volume, 0); assert.equal(scan.paused, true); assert.equal(scan.currentTime, 0);
  manager.dispose();
});
