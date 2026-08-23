import assert from "node:assert/strict";
import test from "node:test";
import { readFile, stat } from "node:fs/promises";

import {
  AUDIO_EVENT_CONFIG,
  WELDING_SPARK_MIX_CONFIG,
  getAudioFadeDurationMilliseconds,
  getFrequencyFineAudioMix,
  getSuccessfulInteractionAudioEvent,
  getSuccessfulItemUseAudioEvent,
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

test("採礦、拆面板與三種生存道具成功音效集中登記並綁定穩定 ID", async () => {
  const cases = [
    {
      eventName: "crystalMiningSucceeded",
      sourceAsset: "Assets/Audio/採礦聲1.mp3",
      publicSource: "./audio/mining-1.mp3",
      resolved: getSuccessfulInteractionAudioEvent("interaction-006"),
    },
    {
      eventName: "generatorPanelOpened",
      sourceAsset: "Assets/Audio/拆開面板2.mp3",
      publicSource: "./audio/panel-open-2.mp3",
      resolved: getSuccessfulInteractionAudioEvent("interaction-020"),
    },
    {
      eventName: "emergencyRationConsumed",
      sourceAsset: "Assets/Audio/飲食1.mp3",
      publicSource: "./audio/eating-1.mp3",
      resolved: getSuccessfulItemUseAudioEvent("R0005"),
    },
    {
      eventName: "purifiedWaterConsumed",
      sourceAsset: "Assets/Audio/飲水2.mp3",
      publicSource: "./audio/drinking-2.mp3",
      resolved: getSuccessfulItemUseAudioEvent("R0004"),
    },
    {
      eventName: "alienFruitConsumed",
      sourceAsset: "Assets/Audio/吃水果.mp3",
      publicSource: "./audio/eat-fruit.mp3",
      resolved: getSuccessfulItemUseAudioEvent("R0012"),
    },
  ];

  for (const entry of cases) {
    assert.equal(entry.resolved, entry.eventName);
    const event = AUDIO_EVENT_CONFIG[entry.eventName];
    assert.deepEqual(event.sourceAssetPaths, [entry.sourceAsset]);
    assert.deepEqual(event.sources, [entry.publicSource]);
    assert.equal(event.delaySeconds, 0);
    assert.equal(event.loop, undefined);
    assert.match(event.trigger, /成功|已成功/);
    assert.match(event.trigger, /不播放/);

    const [sourceBytes, publicBytes] = await Promise.all([
      readFile(new URL(`../${entry.sourceAsset}`, import.meta.url)),
      readFile(
        new URL(
          `../public/${entry.publicSource.replace(/^\.\//, "")}`,
          import.meta.url,
        ),
      ),
    ]);
    assert.deepEqual(publicBytes, sourceBytes);
  }

  assert.equal(getSuccessfulInteractionAudioEvent("interaction-999"), null);
  assert.equal(getSuccessfulItemUseAudioEvent("R9999"), null);
});

test("五種新音效只接在成功的互動與道具結算路徑", async () => {
  const source = await readFile(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const itemUseStart = source.indexOf("function useInventoryItem");
  const itemUseEnd = source.indexOf("const getHotbarSlotAtPoint", itemUseStart);
  const itemUseSource = source.slice(itemUseStart, itemUseEnd);
  assert.ok(itemUseStart >= 0 && itemUseEnd > itemUseStart);
  assert.ok(
    itemUseSource.indexOf("publishItemUsedQuestEvent(item.id)") <
      itemUseSource.indexOf("getSuccessfulItemUseAudioEvent(item.id)"),
  );
  assert.match(
    itemUseSource,
    /getSuccessfulItemUseAudioEvent\(item\.id\)[\s\S]*\.play\(successfulUseAudioEvent, \{ restart: true \}\)/,
  );

  const interactionStart = source.indexOf("const completeInteraction");
  const interactionEnd = source.indexOf(
    "completeWeldingPuzzleInteractionRef.current",
    interactionStart,
  );
  const interactionSource = source.slice(interactionStart, interactionEnd);
  assert.ok(interactionStart >= 0 && interactionEnd > interactionStart);
  assert.ok(
    interactionSource.indexOf("!grantInteractionItemRewards(interactable)") <
      interactionSource.indexOf("getSuccessfulInteractionAudioEvent(interactable.id)"),
  );
  assert.match(
    interactionSource,
    /getSuccessfulInteractionAudioEvent\(interactable\.id\)[\s\S]*\.play\(successfulInteractionAudioEvent, \{ restart: true \}\)/,
  );
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

test("電力分配成功後三段發電機音效依序播放並在末段 15% 自然淡出", async () => {
  const first = AUDIO_EVENT_CONFIG.generatorStartup1;
  const second = AUDIO_EVENT_CONFIG.generatorStartup2;
  const running = AUDIO_EVENT_CONFIG.generatorRunning;

  assert.deepEqual(first.sourceAssetPaths, ["Assets/Audio/發電機啟動1.mp3"]);
  assert.deepEqual(second.sourceAssetPaths, ["Assets/Audio/發電機啟動2.mp3"]);
  assert.deepEqual(running.sourceAssetPaths, ["Assets/Audio/發電機運作.mp3"]);
  assert.deepEqual(
    [first.delaySeconds, second.delaySeconds, running.delaySeconds],
    [0, 1, 1.5],
  );
  assert.deepEqual(
    [first.fadeInPercent, second.fadeInPercent, running.fadeInPercent],
    [0, 0, 0],
  );
  assert.deepEqual(
    [first.fadeOutPercent, second.fadeOutPercent, running.fadeOutPercent],
    [15, 15, 15],
  );
  [first, second, running].forEach((event) => {
    assert.match(event.trigger, /成功/);
    assert.match(event.trigger, /失敗/);
  });

  const files = await Promise.all(
    [first, second, running].map((event) =>
      stat(new URL(`../public/${event.sources[0].replace(/^\.\//, "")}`, import.meta.url)),
    ),
  );
  files.forEach((file) => assert.ok(file.size > 0));
});

test("Audio Event 淡入淡出百分比會依各自音檔總長換算", () => {
  assert.equal(getAudioFadeDurationMilliseconds(3, 15), 450);
  assert.equal(getAudioFadeDurationMilliseconds(8, 25), 2000);
  assert.equal(getAudioFadeDurationMilliseconds(3, 0), 0);
  assert.equal(getAudioFadeDurationMilliseconds(3, -20), 0);
  assert.equal(getAudioFadeDurationMilliseconds(3, 150), 3000);
  assert.equal(getAudioFadeDurationMilliseconds(Number.NaN, 15), 0);
});

test("焊接火星以雙軌混音共同淡入淡出，總音量限制為八成", async () => {
  assert.deepEqual(
    WELDING_SPARK_MIX_CONFIG.layerEventNames,
    ["weldingSparksLayer1", "weldingSparksLayer2"],
  );
  assert.equal(WELDING_SPARK_MIX_CONFIG.totalVolume, 0.8);
  assert.equal(WELDING_SPARK_MIX_CONFIG.fadeInSeconds, 0.1);
  assert.equal(WELDING_SPARK_MIX_CONFIG.fadeOutSeconds, 0.5);

  const layers = WELDING_SPARK_MIX_CONFIG.layerEventNames.map(
    (eventName) => AUDIO_EVENT_CONFIG[eventName],
  );
  assert.deepEqual(
    layers.map((event) => event.sourceAssetPaths),
    [["Assets/Audio/焊接1.mp3"], ["Assets/Audio/焊接2.mp3"]],
  );
  assert.deepEqual(
    layers.map((event) => event.sources),
    [["./audio/welding-sparks-1.mp3"], ["./audio/welding-sparks-2.mp3"]],
  );
  layers.forEach((event) => {
    assert.equal(event.loop, true);
    assert.match(event.trigger, /火星/);
    assert.match(event.trigger, /混音/);
  });
  assert.equal(
    layers.reduce((total, event) => total + event.volume, 0),
    WELDING_SPARK_MIX_CONFIG.totalVolume,
  );

  const files = await Promise.all(
    layers.map((event) =>
      stat(new URL(`../public/${event.sources[0].replace(/^\.\//, "")}`, import.meta.url)),
    ),
  );
  files.forEach((file) => assert.ok(file.size > 0));
});

test("焊接失敗紅底出現時透過 AudioEventManager 單次播放失敗音效", async () => {
  const event = AUDIO_EVENT_CONFIG.weldingFailed;
  assert.deepEqual(event.sourceAssetPaths, ["Assets/Audio/焊接失敗.mp3"]);
  assert.deepEqual(event.sources, ["./audio/welding-failed.mp3"]);
  assert.equal(event.volume, 1);
  assert.equal(event.delaySeconds, 0);
  assert.equal(event.loop, undefined);
  assert.match(event.trigger, /紅色「焊接錯誤了」底板實際出現/);
  assert.match(event.trigger, /不重複播放/);

  const [sourceBytes, publicBytes, puzzleSource, movementLabSource] = await Promise.all([
    readFile(new URL("../Assets/Audio/焊接失敗.mp3", import.meta.url)),
    readFile(new URL("../public/audio/welding-failed.mp3", import.meta.url)),
    readFile(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(publicBytes, sourceBytes);
  assert.match(
    puzzleSource,
    /phase !== "failure-message" \|\| failureShownNotifiedRef\.current[\s\S]*onFailureShown\?\.\(\)/,
  );
  assert.match(
    movementLabSource,
    /onFailureShown=\{\(\) => playOneShotAudio\("weldingFailed"\)\}/,
  );
});

test("焊接成功綠底出現時透過 AudioEventManager 單次播放調頻成功音效", async () => {
  const event = AUDIO_EVENT_CONFIG.weldingSucceeded;
  assert.deepEqual(event.sourceAssetPaths, ["Assets/Audio/調頻成功.mp3"]);
  assert.deepEqual(event.sources, ["./audio/frequency-lock-success.mp3"]);
  assert.equal(event.volume, 1);
  assert.equal(event.delaySeconds, 0);
  assert.equal(event.loop, undefined);
  assert.match(event.trigger, /綠色「焊接成功」底板實際出現/);
  assert.match(event.trigger, /不重複播放/);

  const [sourceBytes, publicBytes, puzzleSource, movementLabSource] = await Promise.all([
    readFile(new URL("../Assets/Audio/調頻成功.mp3", import.meta.url)),
    readFile(new URL("../public/audio/frequency-lock-success.mp3", import.meta.url)),
    readFile(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(publicBytes, sourceBytes);
  assert.match(
    puzzleSource,
    /phase !== "success" \|\| successShownNotifiedRef\.current[\s\S]*onSuccessShown\?\.\(\)/,
  );
  assert.match(
    movementLabSource,
    /onSuccessShown=\{\(\) => playOneShotAudio\("weldingSucceeded"\)\}/,
  );
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
