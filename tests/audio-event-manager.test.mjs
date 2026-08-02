import assert from "node:assert/strict";
import test from "node:test";

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
