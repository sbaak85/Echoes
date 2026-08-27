import assert from "node:assert/strict";
import test from "node:test";
import { readFile, stat } from "node:fs/promises";

import {
  AUDIO_EVENT_CONFIG,
  BGM_CONTROL_RULES,
  BGM_TRACK_CONFIG,
  DEFAULT_BGM_USER_VOLUME,
  WELDING_SPARK_MIX_CONFIG,
  getAudioFadeDurationMilliseconds,
  getFrequencyFineAudioMix,
  getSuccessfulInteractionAudioEvent,
  getSuccessfulItemUseAudioEvent,
} from "../app/audio-event-manager.ts";
import {
  applyBgmRuleExitPolicy,
  doesBgmRuleMatch,
  getBgmTrackTransitionEnvelope,
  resolveBgmControlPlan,
} from "../app/bgm-director.ts";

test("BGM 素材庫保留目前預設曲目並登記 MAIN_001 到 MAIN_002 音量區段", () => {
  assert.deepEqual(BGM_TRACK_CONFIG.default.sources, [
    "./audio/alien-night-1.mp3",
    "./audio/alien-night-2.mp3",
  ]);
  assert.equal(BGM_TRACK_CONFIG.default.volume, 1);
  assert.equal(BGM_TRACK_CONFIG.default.loop, true);
  assert.equal(BGM_TRACK_CONFIG.default.rememberPosition, true);
  assert.equal(DEFAULT_BGM_USER_VOLUME, 0.35);
  assert.equal("bgm" in AUDIO_EVENT_CONFIG, false);
  const main1Rule = BGM_CONTROL_RULES.find(
    (rule) => rule.id === "quest-ch03-main-001-bgm-half",
  );
  const main2Rule = BGM_CONTROL_RULES.find(
    (rule) => rule.id === "quest-ch03-main-002-bgm-full",
  );
  assert.ok(
    typeof main1Rule?.targetVolume === "number" &&
    main1Rule.targetVolume >= 0 &&
    main1Rule.targetVolume <= 1,
  );
  assert.equal(main1Rule?.fadeOutSeconds, 1);
  assert.equal(main1Rule?.state, "active|completed");
  assert.equal(main2Rule?.targetVolume, 1);
  assert.equal(main2Rule?.fadeInSeconds, 1);
  assert.ok(main1Rule && main2Rule);
  assert.ok(main2Rule.priority > main1Rule.priority);

  const makeQuestLookup = (main1State, main2State) =>
    (triggerType, targetId) => {
      if (triggerType !== "quest") return null;
      if (targetId === "QUEST_CH03_MAIN_001") return main1State;
      if (targetId === "QUEST_CH03_MAIN_002") return main2State;
      return null;
    };
  assert.equal(
    resolveBgmControlPlan(
      BGM_CONTROL_RULES,
      makeQuestLookup("active", "locked"),
    ).volumeMultiplier,
    main1Rule.targetVolume,
  );
  assert.equal(
    resolveBgmControlPlan(
      BGM_CONTROL_RULES,
      makeQuestLookup("completed", "locked"),
    ).volumeMultiplier,
    main1Rule.targetVolume,
  );
  assert.equal(
    resolveBgmControlPlan(
      BGM_CONTROL_RULES,
      makeQuestLookup("completed", "active"),
    ).volumeMultiplier,
    1,
  );
});

test("BGM 規則以狀態事件與優先權組成換曲、音量與靜音計畫", () => {
  const states = new Map([
    ["questStage:STAGE_02", "active"],
    ["minigame:welding-route", "playing"],
  ]);
  const lookup = (triggerType, targetId) =>
    states.get(`${triggerType}:${targetId}`) ?? null;
  const rules = [
    {
      id: "stage-track",
      label: "Stage 換曲",
      enabled: true,
      triggerType: "questStage",
      targetId: "STAGE_02",
      state: "active",
      action: "switch",
      trackId: "danger",
      targetVolume: 0.8,
      fadeOutSeconds: 2,
      fadeInSeconds: 3,
      priority: 10,
      durationSeconds: 0,
      restoreMode: "resume",
    },
    {
      id: "minigame-duck",
      label: "小遊戲壓低 BGM",
      enabled: true,
      triggerType: "minigame",
      targetId: "welding-route",
      state: "*",
      action: "volume",
      targetVolume: 0.35,
      fadeOutSeconds: 0.4,
      fadeInSeconds: 0.6,
      priority: 20,
      durationSeconds: 0,
      restoreMode: "resume",
    },
  ];

  assert.equal(doesBgmRuleMatch(rules[0], lookup), true);
  const plan = resolveBgmControlPlan(rules, lookup);
  assert.equal(plan.trackId, "danger");
  assert.equal(plan.trackTransition, "switch");
  assert.equal(plan.volumeMultiplier, 0.35);
  assert.deepEqual(plan.activeRuleIds, ["minigame-duck", "stage-track"]);
  assert.equal(plan.fadeOutSeconds, 0.4);
  assert.equal(plan.fadeInSeconds, 0.6);

  const mutePlan = resolveBgmControlPlan([
    ...rules,
    {
      ...rules[1],
      id: "event-mute",
      triggerType: "event",
      targetId: "cutscene",
      state: "triggered",
      action: "mute",
      priority: 50,
    },
  ], (triggerType, targetId) =>
    triggerType === "event" && targetId === "cutscene"
      ? "triggered"
      : lookup(triggerType, targetId));
  assert.equal(mutePlan.trackId, "danger");
  assert.equal(mutePlan.volumeMultiplier, 0);

  const restoredPlan = applyBgmRuleExitPolicy(
    plan,
    resolveBgmControlPlan([], () => null),
    [{ ...rules[1], restoreMode: "default" }],
  );
  assert.equal(restoredPlan.trackId, "default");
  assert.equal(restoredPlan.fadeOutSeconds, 0.4);
  assert.equal(restoredPlan.fadeInSeconds, 0.6);
  assert.equal(restoredPlan.restoreMode, "default");
});

test("BGM fade 操作會同步交叉淡化，switch 則先淡出再淡入", async () => {
  const baseRule = {
    id: "track-transition",
    label: "換曲轉場",
    enabled: true,
    triggerType: "event",
    targetId: "change-track",
    state: "triggered",
    action: "fade",
    trackId: "danger",
    targetVolume: 1,
    fadeOutSeconds: 1,
    fadeInSeconds: 1,
    priority: 10,
    durationSeconds: 0,
    restoreMode: "resume",
  };
  const lookup = (triggerType, targetId) =>
    triggerType === "event" && targetId === "change-track"
      ? "triggered"
      : null;
  const fadePlan = resolveBgmControlPlan([baseRule], lookup);
  assert.equal(fadePlan.trackId, "danger");
  assert.equal(fadePlan.trackTransition, "fade");

  const fadeHalfway = getBgmTrackTransitionEnvelope("fade", 0.5, 1, 1);
  assert.equal(fadeHalfway.oldVolumeMultiplier, 0.5);
  assert.equal(fadeHalfway.newVolumeMultiplier, 0.5);
  assert.equal(fadeHalfway.complete, false);

  const switchHalfway = getBgmTrackTransitionEnvelope("switch", 0.5, 1, 1);
  assert.equal(switchHalfway.oldVolumeMultiplier, 0.5);
  assert.equal(switchHalfway.newVolumeMultiplier, 0);
  assert.equal(switchHalfway.complete, false);
  const switchFadeInHalfway = getBgmTrackTransitionEnvelope(
    "switch",
    1.5,
    1,
    1,
  );
  assert.equal(switchFadeInHalfway.oldVolumeMultiplier, 0);
  assert.equal(switchFadeInHalfway.newVolumeMultiplier, 0.5);

  const [editorSource, readme] = await Promise.all([
    readFile(
      new URL("../AudioEventManager/AudioEventEditorForm.cs", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../AudioEventManager/README.md", import.meta.url), "utf8"),
  ]);
  assert.match(editorSource, /"volume", "mute", "switch", "fade"/);
  assert.match(editorSource, /rule\.Action == "fade"/);
  assert.match(readme, /fade.*Crossfade/s);
});

test("三個小遊戲 Playing 時同步交叉淡化至專用 BGM，退出後續播原場景 BGM", async () => {
  const minigames = [
    ["power-routing", "電力分配"],
    ["frequency-calibration", "調頻"],
    ["welding-route", "焊接"],
  ];

  for (const [id, label] of minigames) {
    const track = BGM_TRACK_CONFIG[id];
    assert.ok(track, `${label}應登記專用 BGM Track`);
    assert.deepEqual(track.sourceAssetPaths, [`Assets/Audio/${id}.mp3`]);
    assert.deepEqual(track.sources, [`./audio/${id}.mp3`]);
    assert.equal(track.loop, true);
    assert.equal(track.rememberPosition, false);
    const [originalBytes, publicBytes] = await Promise.all([
      readFile(new URL(`../Assets/Audio/${id}.mp3`, import.meta.url)),
      readFile(new URL(`../public/audio/${id}.mp3`, import.meta.url)),
    ]);
    assert.deepEqual(publicBytes, originalBytes);

    const rule = BGM_CONTROL_RULES.find(
      (entry) => entry.triggerType === "minigame" && entry.targetId === id,
    );
    assert.ok(rule, `${label}應登記 Playing 規則`);
    assert.equal(rule.state, "playing");
    assert.equal(rule.action, "fade");
    assert.equal(rule.trackId, id);
    assert.equal(rule.targetVolume, 1);
    assert.equal(rule.fadeOutSeconds, 1);
    assert.equal(rule.fadeInSeconds, 1);
    assert.equal(rule.restoreMode, "resume");

    const playingPlan = resolveBgmControlPlan(
      BGM_CONTROL_RULES,
      (triggerType, targetId) =>
        triggerType === "minigame" && targetId === id ? "playing" : null,
    );
    assert.equal(playingPlan.trackId, id);
    assert.equal(playingPlan.trackTransition, "fade");
    assert.equal(playingPlan.volumeMultiplier, 1);

    const restoredPlan = applyBgmRuleExitPolicy(
      playingPlan,
      resolveBgmControlPlan(BGM_CONTROL_RULES, () => null),
      BGM_CONTROL_RULES,
    );
    assert.equal(restoredPlan.trackId, "default");
    assert.equal(restoredPlan.trackTransition, "fade");
    assert.equal(restoredPlan.fadeOutSeconds, 1);
    assert.equal(restoredPlan.fadeInSeconds, 1);
    assert.equal(restoredPlan.restoreMode, "resume");
  }
});

test("Section 9 指定 Line ID 於台詞開始時用 1 秒將 BGM 淡出至 0", async () => {
  const cueRule = BGM_CONTROL_RULES.find(
    (rule) => rule.id === "chapter03-section-9-line-010-bgm-silence",
  );
  assert.ok(cueRule);
  assert.equal(cueRule.triggerType, "dialogueLine");
  assert.equal(cueRule.targetId, "chapter03-section-9-line-010");
  assert.equal(cueRule.state, "triggered");
  assert.equal(cueRule.action, "volume");
  assert.equal(cueRule.targetVolume, 0);
  assert.equal(cueRule.fadeOutSeconds, 1);
  assert.equal(cueRule.durationSeconds, 0);

  const plan = resolveBgmControlPlan(BGM_CONTROL_RULES, (triggerType, targetId) =>
    triggerType === "dialogueLine" &&
    targetId === "chapter03-section-9-line-010"
      ? "triggered"
      : null);
  assert.equal(plan.volumeMultiplier, 0);
  assert.equal(plan.fadeOutSeconds, 1);

  const [movementLabSource, directorSource] = await Promise.all([
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/bgm-director.ts", import.meta.url), "utf8"),
  ]);
  assert.match(movementLabSource, /line\.lineId[\s\S]{0,300}?triggerDialogueLine\(lineId\)/);
  assert.match(directorSource, /triggerDialogueLine\(lineId:[\s\S]{0,500}?clearType\("dialogueLine"\)/);
});

test("BGM Director 由任務、章節、場景、小遊戲與特殊事件入口驅動", async () => {
  const movementLabSource = await readFile(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  assert.match(movementLabSource, /new BgmDirector\(\)/);
  assert.match(movementLabSource, /syncQuestState\(/);
  assert.match(movementLabSource, /syncQuestSnapshot\(/);
  assert.match(
    movementLabSource,
    /onQuestStarted:\s*\(questId, entry\)\s*=>\s*\{[\s\S]{0,500}?bgmDirectorRef\.current\?\.syncQuestState\(/,
  );
  assert.match(movementLabSource, /setChapter\(chapter\)/);
  assert.match(movementLabSource, /setScene\(SCENE_DATA\.sceneId\)/);
  assert.match(
    movementLabSource,
    /setMinigameState\("welding-route", "playing"\)/,
  );
  assert.match(
    movementLabSource,
    /addEventListener\("echoes:bgm-control", onBgmControlEvent\)/,
  );
});

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
  assert.match(event.trigger, /新手教學每次有效換卡/);
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

test("interaction-013 成功灌入晶體並增加營地電力後播放一次灌入音效", async () => {
  const event = AUDIO_EVENT_CONFIG.campPowerCrystalInserted;
  assert.deepEqual(event.sourceAssetPaths, ["Assets/Audio/灌入晶體1.mp3"]);
  assert.deepEqual(event.sources, ["./audio/camp-power-crystal-inserted.mp3"]);
  assert.equal(event.volume, 1);
  assert.equal(event.delaySeconds, 0);
  assert.equal(event.loop, undefined);
  assert.match(event.trigger, /interaction-013/);
  assert.match(event.trigger, /營地電力確實增加/);
  assert.match(event.trigger, /不播放/);

  const [sourceBytes, publicBytes, movementLabSource] = await Promise.all([
    readFile(new URL("../Assets/Audio/灌入晶體1.mp3", import.meta.url)),
    readFile(new URL("../public/audio/camp-power-crystal-inserted.mp3", import.meta.url)),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(publicBytes, sourceBytes);

  const refillSuccessFlow = movementLabSource.slice(
    movementLabSource.indexOf("const previousPower = campPowerStateRef.current.current;"),
    movementLabSource.indexOf("completeInteraction(interactable, source);", movementLabSource.indexOf("const previousPower = campPowerStateRef.current.current;")),
  );
  assert.ok(refillSuccessFlow.length > 0);
  assert.ok(
    refillSuccessFlow.indexOf("applyCampPowerState(nextPower);") <
      refillSuccessFlow.indexOf('playOneShotAudio("campPowerCrystalInserted");'),
  );
  assert.match(
    refillSuccessFlow,
    /playOneShotAudio\("campPowerCrystalInserted"\)/,
  );
});

test("任務 COMPLETE、NEXT、新增 OBJ 與 OBJ 過關使用集中管理的單次音效", () => {
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

  const objectiveAdded = AUDIO_EVENT_CONFIG.questObjectiveAdded;
  assert.deepEqual(objectiveAdded.sourceAssetPaths, ["Assets/Audio/任務新增.mp3"]);
  assert.deepEqual(objectiveAdded.sources, ["./audio/quest-objective-added.mp3"]);
  assert.equal(objectiveAdded.delaySeconds, 0);
  assert.equal(objectiveAdded.loop, undefined);
  assert.match(objectiveAdded.trigger, /事件型 OBJ/);
  assert.match(objectiveAdded.trigger, /Stage 開始時立即列出的 OBJ.*不播放/);

  const objectiveCompleted = AUDIO_EVENT_CONFIG.questObjectiveCompleted;
  assert.deepEqual(objectiveCompleted.sourceAssetPaths, ["Assets/Audio/任務OBJ過關.mp3"]);
  assert.deepEqual(objectiveCompleted.sources, ["./audio/quest-objective-complete.mp3"]);
  assert.equal(objectiveCompleted.delaySeconds, 0);
  assert.equal(objectiveCompleted.loop, undefined);
  assert.match(objectiveCompleted.trigger, /核取方塊打勾/);
  assert.match(objectiveCompleted.trigger, /讀檔恢復已完成狀態.*不播放/);
});

test("互動失敗紅圈第一次繪製時統一播放否定音效", async () => {
  const event = AUDIO_EVENT_CONFIG.interactionDenied;
  assert.deepEqual(event.sourceAssetPaths, ["Assets/Audio/互動否定.mp3"]);
  assert.deepEqual(event.sources, ["./audio/interaction-denied.mp3"]);
  assert.equal(event.volume, 0.3);
  assert.equal(event.delaySeconds, 0);
  assert.equal(event.loop, undefined);

  const [sourceBytes, publicBytes, movementLabSource] = await Promise.all([
    readFile(new URL("../Assets/Audio/互動否定.mp3", import.meta.url)),
    readFile(new URL("../public/audio/interaction-denied.mp3", import.meta.url)),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(publicBytes, sourceBytes);

  const drawTouchEffect = movementLabSource.slice(
    movementLabSource.indexOf("const drawTouchEffect ="),
    movementLabSource.indexOf("const drawTouchJoystick ="),
  );
  assert.match(
    drawTouchEffect,
    /!touchEffect\.reachable && !touchEffect\.denialAudioPlayed[\s\S]*touchEffect\.denialAudioPlayed = true;[\s\S]*playOneShotAudio\("interactionDenied"\)/,
  );
});

test("任務提示音效的遊戲載入檔案已存在", async () => {
  const completeAudio = await stat(
    new URL("../public/audio/quest-complete.mp3", import.meta.url),
  );
  const startAudio = await stat(
    new URL("../public/audio/quest-start.mp3", import.meta.url),
  );
  const objectiveAddedAudio = await stat(
    new URL("../public/audio/quest-objective-added.mp3", import.meta.url),
  );
  const objectiveCompletedAudio = await stat(
    new URL("../public/audio/quest-objective-complete.mp3", import.meta.url),
  );
  const [objectiveAddedSourceBytes, objectiveAddedPublicBytes] = await Promise.all([
    readFile(new URL("../Assets/Audio/任務新增.mp3", import.meta.url)),
    readFile(new URL("../public/audio/quest-objective-added.mp3", import.meta.url)),
  ]);
  assert.ok(completeAudio.size > 0);
  assert.ok(startAudio.size > 0);
  assert.ok(objectiveAddedAudio.size > 0);
  assert.ok(objectiveCompletedAudio.size > 0);
  assert.deepEqual(objectiveAddedPublicBytes, objectiveAddedSourceBytes);

  const [objectiveCompletedSourceBytes, objectiveCompletedPublicBytes] = await Promise.all([
    readFile(new URL("../Assets/Audio/任務OBJ過關.mp3", import.meta.url)),
    readFile(new URL("../public/audio/quest-objective-complete.mp3", import.meta.url)),
  ]);
  assert.deepEqual(objectiveCompletedPublicBytes, objectiveCompletedSourceBytes);
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

test("焊接預覽 3、2、1 每次顯示時透過 AudioEventManager 播放倒數音效", async () => {
  const event = AUDIO_EVENT_CONFIG.weldingPreviewCountdown;
  assert.deepEqual(event.sourceAssetPaths, ["Assets/Audio/倒數計時.mp3"]);
  assert.deepEqual(event.sources, ["./audio/welding-preview-countdown.mp3"]);
  assert.equal(event.volume, 1);
  assert.equal(event.delaySeconds, 0);
  assert.equal(event.loop, undefined);
  assert.match(event.trigger, /3、2、1/);
  assert.match(event.trigger, /各播放一次/);

  const [sourceBytes, publicBytes, puzzleSource, movementLabSource] = await Promise.all([
    readFile(new URL("../Assets/Audio/倒數計時.mp3", import.meta.url)),
    readFile(new URL("../public/audio/welding-preview-countdown.mp3", import.meta.url)),
    readFile(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(publicBytes, sourceBytes);
  assert.match(
    puzzleSource,
    /updatePhase\("countdown"\);\s*onPreviewCountdownTickRef\.current\?\.\(3\)/,
  );
  assert.match(
    puzzleSource,
    /const nextCountdown = previewCountdown - 1;[\s\S]*onPreviewCountdownTickRef\.current\?\.\(nextCountdown\)/,
  );
  assert.match(
    movementLabSource,
    /onPreviewCountdownTick=\{\(\) => playOneShotAudio\("weldingPreviewCountdown"\)\}/,
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
