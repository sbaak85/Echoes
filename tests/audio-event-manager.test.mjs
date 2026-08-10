import assert from "node:assert/strict";
import test from "node:test";
import { stat } from "node:fs/promises";

import { AUDIO_EVENT_CONFIG } from "../app/audio-event-manager.ts";

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
