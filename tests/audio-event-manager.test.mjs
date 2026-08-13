import assert from "node:assert/strict";
import test from "node:test";
import { stat } from "node:fs/promises";

import {
  AUDIO_EVENT_CONFIG,
  getFrequencyFineAudioMix,
} from "../app/audio-event-manager.ts";

test("介面點擊音效集中登記 InPut.mp3 與完整觸發時機", () => {
  const event = AUDIO_EVENT_CONFIG.uiInput;

  assert.deepEqual(event.sourceAssetPaths, ["Assets/Audio/InPut.mp3"]);
  assert.deepEqual(event.sources, ["./audio/ui-input.mp3"]);
  assert.match(event.trigger, /背包/);
  assert.match(event.trigger, /快捷工具格/);
  assert.match(event.trigger, /任務/);
  assert.match(event.trigger, /生存計量/);
  assert.match(event.trigger, /小地圖/);
  assert.match(event.trigger, /Options/);
  assert.match(event.trigger, /不要求操作成功/);
});

test("場上道具觸地音效集中登記 Drop.mp3 且不在飛行途中播放", () => {
  const event = AUDIO_EVENT_CONFIG.worldItemLanded;

  assert.deepEqual(event.sourceAssetPaths, ["Assets/Audio/Drop.mp3"]);
  assert.deepEqual(event.sources, ["./audio/world-item-drop.mp3"]);
  assert.match(event.trigger, /第一次碰到場上地面/);
  assert.match(event.trigger, /飛行途中/);
  assert.match(event.trigger, /不重複播放/);
});

test("成功拾取場上道具後集中播放 Pick.mp3", () => {
  const event = AUDIO_EVENT_CONFIG.worldItemPickedUp;

  assert.deepEqual(event.sourceAssetPaths, ["Assets/Audio/Pick.mp3"]);
  assert.deepEqual(event.sources, ["./audio/world-item-pickup.mp3"]);
  assert.match(event.trigger, /加入背包/);
  assert.match(event.trigger, /從場上移除/);
  assert.match(event.trigger, /不播放/);
});

test("任務 COMPLETE 與 NEXT 事件使用集中管理的單次音效", () => {
  const completed = AUDIO_EVENT_CONFIG.questCompleted;
  assert.deepEqual(completed.sourceAssetPaths, ["Assets/Audio/任務成功.mp3"]);
  assert.deepEqual(completed.sources, ["./audio/quest-complete.mp3"]);
  assert.equal(completed.delaySeconds, 0);
  assert.equal(completed.loop, undefined);

  const started = AUDIO_EVENT_CONFIG.questStarted;
  assert.deepEqual(started.sourceAssetPaths, ["Assets/Audio/任務開始.mp3"]);
  assert.deepEqual(started.sources, ["./audio/quest-start.mp3"]);
  assert.equal(started.delaySeconds, 0);
  assert.equal(started.loop, undefined);
});

test("任務提示音效的遊戲載入檔案已存在", async () => {
  const completeAudio = await stat(
    new URL("../public/audio/quest-complete.mp3", import.meta.url),
  );
  const startAudio = await stat(
    new URL("../public/audio/quest-start.mp3", import.meta.url),
  );
  assert.ok(completeAudio.size > 0);
  assert.ok(startAudio.size > 0);
});

test("調頻四種聲音事件集中登記並使用正確素材", async () => {
  const tick = AUDIO_EVENT_CONFIG.frequencyCoarseTick;
  assert.deepEqual(tick.sourceAssetPaths, ["Assets/Audio/刻度.mp3"]);
  assert.deepEqual(tick.sources, ["./audio/frequency-coarse-tick.mp3"]);
  assert.equal(tick.loop, undefined);
  assert.match(tick.trigger, /另一格/);

  const far = AUDIO_EVENT_CONFIG.frequencyFineFar;
  assert.deepEqual(far.sourceAssetPaths, ["Assets/Audio/調頻遠離.mp3"]);
  assert.deepEqual(far.sources, ["./audio/frequency-fine-far.mp3"]);
  assert.equal(far.loop, true);
  assert.match(far.trigger, /交叉淡化/);

  const near = AUDIO_EVENT_CONFIG.frequencyFineNear;
  assert.deepEqual(near.sourceAssetPaths, ["Assets/Audio/調頻接近.mp3"]);
  assert.deepEqual(near.sources, ["./audio/frequency-fine-near.mp3"]);
  assert.equal(near.loop, true);
  assert.match(near.trigger, /愈接近命中整體愈大聲/);

  const locked = AUDIO_EVENT_CONFIG.frequencyLocked;
  assert.deepEqual(locked.sourceAssetPaths, ["Assets/Audio/調頻成功.mp3"]);
  assert.deepEqual(locked.sources, ["./audio/frequency-lock-success.mp3"]);
  assert.equal(locked.loop, undefined);
  assert.match(locked.trigger, /非命中鎖定只播放一般 Input/);

  const files = await Promise.all(
    [tick, far, near, locked].map((event) =>
      stat(new URL(`../public/${event.sources[0].replace(/^\.\//, "")}`, import.meta.url)),
    ),
  );
  files.forEach((file) => assert.ok(file.size > 0));
});

test("微調遠離與接近音軌會依接近度交叉淡化並來回變化音量", () => {
  const far = getFrequencyFineAudioMix(0, 0.25);
  const near = getFrequencyFineAudioMix(100, 0.25);
  const overlap = getFrequencyFineAudioMix(50, 0.25);
  const quietFar = getFrequencyFineAudioMix(0, 0.75);
  const quietNear = getFrequencyFineAudioMix(100, 0.75);
  const closer = getFrequencyFineAudioMix(100, 0.25);
  const lessClose = getFrequencyFineAudioMix(85, 0.25);

  assert.ok(far.farVolume > 0);
  assert.equal(far.nearVolume, 0);
  assert.equal(near.farVolume, 0);
  assert.ok(near.nearVolume > 0);
  assert.ok(overlap.farVolume > 0);
  assert.ok(overlap.nearVolume > 0);
  assert.ok(quietFar.farVolume < far.farVolume);
  assert.ok(quietNear.nearVolume < near.nearVolume);
  assert.ok(closer.nearVolume > lessClose.nearVolume);
});
