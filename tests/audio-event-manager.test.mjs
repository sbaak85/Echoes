import assert from "node:assert/strict";
import test from "node:test";
import { readFile, stat } from "node:fs/promises";

import {
  AUDIO_EVENT_CONFIG,
  AudioEventManager,
  BGM_CONTROL_RULES,
  BGM_TRACK_CONFIG,
  DEFAULT_BGM_USER_VOLUME,
  LINE_SE_CONFIG,
  WELDING_SPARK_MIX_CONFIG,
  getAudioFadeDurationMilliseconds,
  getFrequencyFineAudioMix,
  getLineSeNextLineBehavior,
  getSuccessfulInteractionAudioEvent,
  getSuccessfulItemUseAudioEvent,
} from "../app/audio-event-manager.ts";
import {
  applyBgmRuleExitPolicy,
  doesBgmRuleMatch,
  getBgmTrackTransitionEnvelope,
  resolveBgmControlPlan,
} from "../app/bgm-director.ts";

test("Line SE 預設自然播完，並可逐列改成切句停止", async () => {
  assert.deepEqual(LINE_SE_CONFIG, []);
  assert.equal(getLineSeNextLineBehavior({}), "finish");
  assert.equal(
    getLineSeNextLineBehavior({ nextLineBehavior: "finish" }),
    "finish",
  );
  assert.equal(
    getLineSeNextLineBehavior({ nextLineBehavior: "stop" }),
    "stop",
  );

  const [audioSource, movementSource, editorFormSource, lineEditorSource] =
    await Promise.all([
      readFile(new URL("../app/audio-event-manager.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../AudioEventManager/AudioEventEditorForm.cs", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../AudioEventManager/LineSeConfigEditorControl.cs",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  assert.match(audioSource, /LINE_SE_CONFIG_START[\s\S]*LINE_SE_CONFIG_END/);
  assert.match(audioSource, /triggerDialogueLineSe\(lineId: string\)/);
  assert.match(audioSource, /runtime\.audio\.loop = false/);
  assert.match(audioSource, /getLineSeNextLineBehavior\(runtime\.definition\) === "stop"/);
  assert.match(movementSource, /triggerDialogueLineSe\(lineId\)/);
  assert.match(movementSource, /clearDialogueLineSe\(\)/);
  assert.match(editorFormSource, /new TabPage\("Line SE 管理"\)/);
  assert.match(lineEditorSource, /自然播完（預設）/);
  assert.match(lineEditorSource, /new\("stop", "停止"\)/);
  assert.match(lineEditorSource, /FadeOut 秒/);
});

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
  assert.match(movementLabSource, /line\.lineId[\s\S]{0,600}?triggerDialogueLine\(lineId\)/);
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

test("任務、生存與小地圖的展開及收折音效分開集中管理", async () => {
  const expanded = AUDIO_EVENT_CONFIG.hudExpanded;
  const collapsed = AUDIO_EVENT_CONFIG.hudCollapsed;

  assert.deepEqual(expanded.sourceAssetPaths, ["Assets/Audio/介面展開.mp3"]);
  assert.deepEqual(expanded.sources, ["./audio/hud-expand.mp3"]);
  assert.equal(expanded.volume, 1);
  assert.equal(expanded.delaySeconds, 0);
  assert.match(expanded.trigger, /任務提示 UI/);
  assert.match(expanded.trigger, /生存計量 UI/);
  assert.match(expanded.trigger, /小地圖 UI/);

  assert.deepEqual(collapsed.sourceAssetPaths, [
    "Assets/Audio/互動操作音_#1-1785307011343.mp3",
  ]);
  assert.deepEqual(collapsed.sources, ["./audio/interaction-success-1.mp3"]);
  assert.equal(collapsed.volume, 1);
  assert.equal(collapsed.delaySeconds, 0);

  assert.ok((await stat(new URL("../public/audio/hud-expand.mp3", import.meta.url))).size > 0);
  assert.ok((await stat(new URL("../public/audio/interaction-success-1.mp3", import.meta.url))).size > 0);
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

test("採礦、拆面板與五種生存道具成功音效集中登記並綁定穩定 ID", async () => {
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
    {
      eventName: "spiritFocusMedicineConsumed",
      sourceAsset: "Assets/Audio/精神藥劑.mp3",
      publicSource: "./audio/spirit-focus-medicine.mp3",
      resolved: getSuccessfulItemUseAudioEvent("R0016"),
    },
    {
      eventName: "energySupplyDrinkConsumed",
      sourceAsset: "Assets/Audio/飲用提神飲料.mp3",
      publicSource: "./audio/energy-supply-drink.mp3",
      resolved: getSuccessfulItemUseAudioEvent("R0017"),
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

test("七種新音效只接在成功的互動與道具結算路徑", async () => {
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

test("章節結束存檔確認視窗彈出時透過 AudioEventManager 單次播放提示音效", async () => {
  const event = AUDIO_EVENT_CONFIG.chapterEndSavePromptOpened;
  assert.deepEqual(event.sourceAssetPaths, ["Assets/Audio/存檔確認.mp3"]);
  assert.deepEqual(event.sources, ["./audio/chapter-end-save-confirmation.mp3"]);
  assert.equal(event.volume, 1);
  assert.equal(event.delaySeconds, 0);
  assert.equal(event.loop, undefined);
  assert.match(event.trigger, /由關閉轉為開啟時播放一次/);
  assert.match(event.trigger, /React 重繪期間不重複播放/);

  const [sourceBytes, publicBytes, movementLabSource] = await Promise.all([
    readFile(new URL("../Assets/Audio/存檔確認.mp3", import.meta.url)),
    readFile(new URL("../public/audio/chapter-end-save-confirmation.mp3", import.meta.url)),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(publicBytes, sourceBytes);
  assert.match(
    movementLabSource,
    /const openChapter04SavePrompt = \(\) => \{[\s\S]*?const wasOpen = chapter04SavePromptOpenRef\.current;[\s\S]*?if \(!wasOpen\) playOneShotAudio\("chapterEndSavePromptOpened"\)/,
  );
  assert.equal(
    (movementLabSource.match(/playOneShotAudio\("chapterEndSavePromptOpened"\)/g) ?? []).length,
    1,
  );
});

test("星際牌發射池與分層爆炸池集中登記且允許多路重疊", async () => {
  const ui = AUDIO_EVENT_CONFIG.starCardsUiInput;
  const dealt = AUDIO_EVENT_CONFIG.starCardsCardDealt;
  const flipped = AUDIO_EVENT_CONFIG.starCardsCardFlipped;
  const laneChanged = AUDIO_EVENT_CONFIG.starCardsLaneChanged;
  const laserEvents = [
    AUDIO_EVENT_CONFIG.starCardsLaserFire1,
    AUDIO_EVENT_CONFIG.starCardsLaserFire2,
    AUDIO_EVENT_CONFIG.starCardsLaserFire3,
    AUDIO_EVENT_CONFIG.starCardsLaserFire4,
    AUDIO_EVENT_CONFIG.starCardsLaserFire5,
    AUDIO_EVENT_CONFIG.starCardsLaserFire6,
    AUDIO_EVENT_CONFIG.starCardsLaserFire7,
  ];
  const missileEvents = [
    AUDIO_EVENT_CONFIG.starCardsMissileFire1,
    AUDIO_EVENT_CONFIG.starCardsMissileFire2,
    AUDIO_EVENT_CONFIG.starCardsMissileFire3,
    AUDIO_EVENT_CONFIG.starCardsMissileFire4,
    AUDIO_EVENT_CONFIG.starCardsMissileFire5,
    AUDIO_EVENT_CONFIG.starCardsMissileFire6,
  ];
  const shieldAttackEvents = [
    AUDIO_EVENT_CONFIG.starCardsShieldAttackLayer1,
    AUDIO_EVENT_CONFIG.starCardsShieldAttackLayer2,
  ];
  const tie = AUDIO_EVENT_CONFIG.starCardsTie;
  const explosionEvents = Array.from(
    { length: 8 },
    (_, index) => AUDIO_EVENT_CONFIG[`starCardsExplosion${index + 1}`],
  );
  const explosionFinishEvents = [
    AUDIO_EVENT_CONFIG.starCardsExplosionFinish1,
    AUDIO_EVENT_CONFIG.starCardsExplosionFinish2,
    AUDIO_EVENT_CONFIG.starCardsExplosionFinish3,
  ];
  const explosionHeavyFinish = AUDIO_EVENT_CONFIG.starCardsExplosionHeavyFinish;

  assert.deepEqual(ui.sourceAssetPaths, ["Assets/Audio/InPut.mp3"]);
  assert.deepEqual(ui.sources, ["./audio/ui-input.mp3"]);
  assert.match(ui.trigger, /DRAW/);
  assert.match(ui.trigger, /BATTLE/);

  assert.deepEqual(dealt.sourceAssetPaths, ["Assets/Audio/飛牌.mp3"]);
  assert.deepEqual(dealt.sources, ["./audio/star-cards-card-dealt.mp3"]);
  assert.match(dealt.trigger, /開場我方三張與對手三張共六次/);
  assert.match(dealt.trigger, /每次 DRAW 我方與對手各一次/);
  assert.match(dealt.trigger, /任意 200ms 內最多開始三聲/);
  assert.equal(dealt.maxPlaysPerWindow, 3);
  assert.equal(dealt.playLimitWindowMs, 200);
  assert.equal(dealt.maxOverlappingVoices, 3);

  assert.deepEqual(flipped.sourceAssetPaths, ["Assets/Audio/翻面.mp3"]);
  assert.deepEqual(flipped.sources, ["./audio/star-cards-card-flipped.mp3"]);
  assert.match(flipped.trigger, /正面翻到背面/);
  assert.match(flipped.trigger, /背面翻回正面/);
  assert.match(flipped.trigger, /我方與對手共用/);
  assert.match(flipped.trigger, /我方序列比對手晚 0\.1 秒開始/);
  assert.match(flipped.trigger, /同時翻面的兩張仍各自播放/);
  assert.equal(flipped.maxPlaysPerWindow, 6);
  assert.equal(flipped.playLimitWindowMs, 200);
  assert.equal(flipped.maxOverlappingVoices, 6);

  assert.deepEqual(laneChanged.sourceAssetPaths, ["Assets/Audio/換格2.mp3"]);
  assert.deepEqual(laneChanged.sources, ["./audio/star-cards-lane-changed.mp3"]);
  assert.equal(laneChanged.volume, 0.5);
  assert.match(laneChanged.trigger, /A、B、C 任一格/);
  assert.match(laneChanged.trigger, /停留在同一格內不重複播放/);
  assert.deepEqual(
    await readFile(new URL("../public/audio/star-cards-lane-changed.mp3", import.meta.url)),
    await readFile(new URL("../Assets/Audio/換格2.mp3", import.meta.url)),
  );

  const laserSourceAssets = [
    "Assets/Audio/The_sound_of_a_power_#1-1788199126794.mp3",
    "Assets/Audio/The_sound_of_a_power_#3-1788199017585.mp3",
    "Assets/Audio/The_sound_of_a_power_#4-1788199021817.mp3",
    "Assets/Audio/The_sound_of_a_power_#4-1788199120487.mp3",
    "Assets/Audio/FX_RailgunBulletShoot01.mp3",
    "Assets/Audio/FX_RailgunBulletShoot02.mp3",
    "Assets/Audio/FX_RailgunBulletShoot03.mp3",
  ];
  for (const [index, event] of laserEvents.entries()) {
    assert.deepEqual(event.sourceAssetPaths, [laserSourceAssets[index]]);
    assert.deepEqual(event.sources, [`./audio/star-cards-laser-fire-${index + 1}.mp3`]);
    assert.match(event.trigger, /開始發射光束/);
    assert.match(event.trigger, /七首雷射發射音效池/);
    assert.match(event.trigger, /允許重複抽到同一支/);
    assert.match(event.trigger, /0\.2～0\.4 秒/);
    assert.match(event.trigger, /發射池，不包含卡牌命中爆炸聲/);
    assert.match(event.trigger, /多路雷射發射可重疊且互不截斷/);
    const [sourceBytes, publicBytes] = await Promise.all([
      readFile(new URL(`../${event.sourceAssetPaths[0].replaceAll("#", "%23")}`, import.meta.url)),
      readFile(new URL(`../public/${event.sources[0].replace(/^\.\//, "")}`, import.meta.url)),
    ]);
    assert.deepEqual(publicBytes, sourceBytes);
  }

  const missileSourceAssets = [
    "Assets/Audio/SplitBullet_Fire01.mp3",
    "Assets/Audio/SplitBullet_Fire02.mp3",
    "Assets/Audio/SplitBullet_Fire03.mp3",
    "Assets/Audio/ChargeBullet_Fire01.mp3",
    "Assets/Audio/ChargeBullet_Fire02.mp3",
    "Assets/Audio/ChargeBullet_Fire03.mp3",
  ];
  for (const [index, event] of missileEvents.entries()) {
    assert.deepEqual(event.sourceAssetPaths, [missileSourceAssets[index]]);
    assert.deepEqual(event.sources, [`./audio/star-cards-missile-fire-${index + 1}.mp3`]);
    assert.match(event.trigger, /飛彈武器開始發射/);
    assert.match(event.trigger, /六首飛彈發射音效池/);
    assert.match(event.trigger, /允許重複抽到同一支/);
    assert.match(event.trigger, /0\.2～0\.3 秒/);
    assert.match(event.trigger, /發射池，不包含卡牌命中爆炸聲/);
    assert.match(event.trigger, /多路飛彈發射可重疊且互不截斷/);
    const [sourceBytes, publicBytes] = await Promise.all([
      readFile(new URL(`../${event.sourceAssetPaths[0]}`, import.meta.url)),
      readFile(new URL(`../public/${event.sources[0].replace(/^\.\//, "")}`, import.meta.url)),
    ]);
    assert.deepEqual(publicBytes, sourceBytes);
  }

  for (const [index, event] of shieldAttackEvents.entries()) {
    assert.deepEqual(event.sourceAssetPaths, [`Assets/Audio/護盾${index + 1}.mp3`]);
    assert.deepEqual(event.sources, [`./audio/star-cards-shield-attack-${index + 1}.mp3`]);
    assert.equal(event.volume, 0.2);
    assert.match(event.trigger, /護盾艦開始發射護盾攻擊/);
    assert.match(event.trigger, /同一幀同步播放/);
    assert.match(event.trigger, /兩層合計視為一組護盾攻擊音效/);
    assert.match(event.trigger, /不進行隨機抽選/);
    const [sourceBytes, publicBytes] = await Promise.all([
      readFile(new URL(`../${event.sourceAssetPaths[0]}`, import.meta.url)),
      readFile(new URL(`../public/${event.sources[0].replace(/^\.\//, "")}`, import.meta.url)),
    ]);
    assert.deepEqual(publicBytes, sourceBytes);
  }

  assert.deepEqual(tie.sourceAssetPaths, ["Assets/Audio/平手.mp3"]);
  assert.deepEqual(tie.sources, ["./audio/star-cards-tie.mp3"]);
  assert.equal(tie.volume, 0.2);
  assert.match(tie.trigger, /判定為平手/);
  assert.match(tie.trigger, /平手碰撞特效的同一時間/);
  assert.match(tie.trigger, /每一路平手各自觸發/);
  const [tieSourceBytes, tiePublicBytes] = await Promise.all([
    readFile(new URL("../Assets/Audio/平手.mp3", import.meta.url)),
    readFile(new URL("../public/audio/star-cards-tie.mp3", import.meta.url)),
  ]);
  assert.deepEqual(tiePublicBytes, tieSourceBytes);

  const explosionSourceAssets = [
    "Assets/Audio/The_sound_of_a_missi_#1-1788199534339.mp3",
    "Assets/Audio/The_sound_of_a_missi_#1-1788199550101.mp3",
    "Assets/Audio/The_sound_of_a_missi_#2-1788199534341.mp3",
    "Assets/Audio/The_sound_of_a_missi_#2-1788199552869.mp3",
    "Assets/Audio/The_sound_of_a_missi_#3-1788199534341.mp3",
    "Assets/Audio/The_sound_of_a_missi_#3-1788199552869.mp3",
    "Assets/Audio/The_sound_of_a_missi_#4-1788199534342.mp3",
    "Assets/Audio/The_sound_of_a_missi_#4-1788199552869.mp3",
  ];
  for (const [index, event] of explosionEvents.entries()) {
    assert.deepEqual(event.sourceAssetPaths, [explosionSourceAssets[index]]);
    assert.deepEqual(event.sources, [`./audio/star-cards-explosion-${index + 1}.mp3`]);
    assert.match(event.trigger, /卡牌真正被命中並進入爆炸／摧毀效果/);
    assert.match(event.trigger, /十二首共用爆炸池/);
    assert.match(event.trigger, /隨機抽出 2～3 支作為前段/);
    assert.match(event.trigger, /允許重複抽到同一支/);
    assert.match(event.trigger, /雷射、飛彈或其他武器造成的爆炸皆共用/);
    assert.match(event.trigger, /平手不播放/);
    assert.match(event.trigger, /整套總共 3～4 聲/);
    assert.match(event.trigger, /最後一聲依被擊敗卡牌點數指定收尾/);
    assert.match(event.trigger, /0\.2～0\.4 秒/);
    assert.match(event.trigger, /多路爆炸可重疊且互不截斷/);
    const [sourceBytes, publicBytes] = await Promise.all([
      readFile(new URL(`../${event.sourceAssetPaths[0].replaceAll("#", "%23")}`, import.meta.url)),
      readFile(new URL(`../public/${event.sources[0].replace(/^\.\//, "")}`, import.meta.url)),
    ]);
    assert.deepEqual(publicBytes, sourceBytes);
  }

  const finishSourceAssets = [
    "Assets/Audio/FX_Mon_Dead01.mp3",
    "Assets/Audio/FX_Mon_Dead02.mp3",
    "Assets/Audio/FX_Mon_Dead03.mp3",
  ];
  for (const [index, event] of explosionFinishEvents.entries()) {
    assert.deepEqual(event.sourceAssetPaths, [finishSourceAssets[index]]);
    assert.deepEqual(event.sources, [`./audio/star-cards-explosion-finish-${index + 1}.mp3`]);
    assert.match(event.trigger, /1 點或 2 點卡牌被擊敗/);
    assert.match(event.trigger, /十二首共用爆炸池/);
    assert.match(event.trigger, /最後一聲必須從 FX_Mon_Dead01～03/);
    assert.match(event.trigger, /3 點卡牌，最後一聲不使用本音效/);
    const [sourceBytes, publicBytes] = await Promise.all([
      readFile(new URL(`../${event.sourceAssetPaths[0]}`, import.meta.url)),
      readFile(new URL(`../public/${event.sources[0].replace(/^\.\//, "")}`, import.meta.url)),
    ]);
    assert.deepEqual(publicBytes, sourceBytes);
  }

  assert.deepEqual(
    explosionHeavyFinish.sourceAssetPaths,
    ["Assets/Audio/Fx_PantagonExplode_In.mp3"],
  );
  assert.deepEqual(
    explosionHeavyFinish.sources,
    ["./audio/star-cards-explosion-heavy-finish.mp3"],
  );
  assert.match(explosionHeavyFinish.trigger, /被擊敗的卡牌為 3 點牌/);
  assert.match(explosionHeavyFinish.trigger, /最後一聲固定播放 Fx_PantagonExplode_In/);
  assert.match(explosionHeavyFinish.trigger, /十二首共用爆炸池/);
  const [heavySourceBytes, heavyPublicBytes] = await Promise.all([
    readFile(new URL("../Assets/Audio/Fx_PantagonExplode_In.mp3", import.meta.url)),
    readFile(new URL("../public/audio/star-cards-explosion-heavy-finish.mp3", import.meta.url)),
  ]);
  assert.deepEqual(heavyPublicBytes, heavySourceBytes);

  assert.equal(AUDIO_EVENT_CONFIG.starCardsMissileAttack1, undefined);

  for (const event of laserEvents) assert.equal(event.volume, 0.17);
  for (const event of missileEvents) assert.equal(event.volume, 0.2);
  for (const event of [
    ...explosionEvents,
    ...explosionFinishEvents,
    explosionHeavyFinish,
  ]) assert.equal(event.volume, 0.15);

  for (const event of [
    ui,
    dealt,
    flipped,
    ...laserEvents,
    ...missileEvents,
    ...shieldAttackEvents,
    tie,
    ...explosionEvents,
  ]) {
    assert.equal(event.delaySeconds, 0);
    assert.equal(event.fadeInPercent, 0);
    assert.equal(event.fadeOutPercent, 0);
    assert.ok(
      (await stat(
        new URL(`../public/${event.sources[0].replace(/^\.\//, "")}`, import.meta.url),
      )).size > 0,
    );
  }
  for (const event of [...explosionFinishEvents, explosionHeavyFinish]) {
    assert.equal(event.delaySeconds, 0);
    assert.equal(event.fadeInPercent, 0);
    assert.equal(event.fadeOutPercent, 10);
    assert.ok(
      (await stat(
        new URL(`../public/${event.sources[0].replace(/^\.\//, "")}`, import.meta.url),
      )).size > 0,
    );
  }

  const audioManagerSource = await readFile(
    new URL("../app/audio-event-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(audioManagerSource, /overlap\?: boolean/);
  assert.match(audioManagerSource, /playOverlappingOneShot\(runtime\)/);
  assert.match(audioManagerSource, /new Audio\(runtime\.definition\.sources\[0\]\)/);
});

test("AudioEventManager 限制發牌為三軌並允許六張卡牌各自翻面發聲", async () => {
  const originalAudio = globalThis.Audio;
  const created = [];

  class FakeAudio {
    constructor(source = "") {
      this.src = source;
      this.preload = "";
      this.volume = 1;
      this.loop = false;
      this.paused = true;
      this.currentTime = 0;
      this.playCount = 0;
      this.listeners = new Map();
      created.push(this);
    }

    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    }

    removeEventListener(name, listener) {
      if (this.listeners.get(name) === listener) this.listeners.delete(name);
    }

    load() {}

    pause() {
      this.paused = true;
    }

    play() {
      this.paused = false;
      this.playCount += 1;
      return Promise.resolve();
    }
  }

  globalThis.Audio = FakeAudio;
  try {
    const manager = new AudioEventManager();
    const configuredRuntimeCount = created.length;
    await Promise.all([
      manager.play("starCardsCardDealt", { overlap: true }),
      manager.play("starCardsCardDealt", { overlap: true }),
      manager.play("starCardsCardDealt", { overlap: true }),
      manager.play("starCardsCardDealt", { overlap: true }),
      manager.play("starCardsCardDealt", { overlap: true }),
      manager.play("starCardsCardDealt", { overlap: true }),
    ]);
    const dealtVoices = created.slice(configuredRuntimeCount);
    assert.equal(dealtVoices.length, 3);
    assert.deepEqual(dealtVoices.map((voice) => voice.src), [
      "./audio/star-cards-card-dealt.mp3",
      "./audio/star-cards-card-dealt.mp3",
      "./audio/star-cards-card-dealt.mp3",
    ]);
    assert.deepEqual(dealtVoices.map((voice) => voice.playCount), [1, 1, 1]);

    await Promise.all(Array.from(
      { length: 6 },
      () => manager.play("starCardsCardFlipped", { overlap: true }),
    ));
    const flippedVoices = created.slice(configuredRuntimeCount + dealtVoices.length);
    assert.equal(flippedVoices.length, 6);
    assert.deepEqual(
      flippedVoices.map((voice) => voice.src),
      Array(6).fill("./audio/star-cards-card-flipped.mp3"),
    );
    manager.dispose();
    assert.deepEqual(
      [...dealtVoices, ...flippedVoices].map((voice) => voice.paused),
      Array(9).fill(true),
    );
  } finally {
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test("自然死亡模糊轉黑與 Game Over 插圖淡入分別播放指定音效", async () => {
  const breathing = AUDIO_EVENT_CONFIG.deathImminentBreathing;
  assert.deepEqual(breathing.sourceAssetPaths, ["Assets/Audio/呼吸急促1.mp3"]);
  assert.deepEqual(breathing.sources, ["./audio/death-imminent-breathing-1.mp3"]);
  assert.equal(breathing.volume, 1);
  assert.equal(breathing.delaySeconds, 0);
  assert.equal(breathing.loop, undefined);
  assert.match(breathing.trigger, /最後 1 個遊戲分鐘/);
  assert.match(breathing.trigger, /模糊並同步淡入黑幕/);

  const gameOver = AUDIO_EVENT_CONFIG.gameOverImageRevealed;
  assert.deepEqual(gameOver.sourceAssetPaths, ["Assets/Audio/Gameover1.mp3"]);
  assert.deepEqual(gameOver.sources, ["./audio/game-over-1.mp3"]);
  assert.equal(gameOver.volume, 1);
  assert.equal(gameOver.delaySeconds, 0);
  assert.equal(gameOver.loop, undefined);
  assert.match(gameOver.trigger, /Gameover 插圖開始 1 秒 FadeIn/);

  const bgmFade = BGM_CONTROL_RULES.find(
    (rule) => rule.id === "survival-death-imminent-bgm-fadeout",
  );
  assert.ok(bgmFade);
  assert.equal(bgmFade.triggerType, "event");
  assert.equal(bgmFade.targetId, "survival-death-imminent");
  assert.equal(bgmFade.state, "triggered");
  assert.equal(bgmFade.action, "mute");
  assert.equal(bgmFade.targetVolume, 0);
  assert.equal(bgmFade.fadeOutSeconds, 2);
  assert.equal(bgmFade.durationSeconds, 0);
  assert.ok(
    bgmFade.priority >
      Math.max(...BGM_CONTROL_RULES.filter((rule) => rule !== bgmFade).map((rule) => rule.priority)),
  );
  const mutedPlan = resolveBgmControlPlan(
    BGM_CONTROL_RULES,
    (triggerType, targetId) =>
      triggerType === "event" && targetId === "survival-death-imminent"
        ? "triggered"
        : null,
  );
  assert.equal(mutedPlan.volumeMultiplier, 0);
  assert.equal(mutedPlan.fadeOutSeconds, 2);

  const [
    breathingSource,
    breathingPublic,
    gameOverSource,
    gameOverPublic,
    movementLabSource,
  ] = await Promise.all([
    readFile(new URL("../Assets/Audio/呼吸急促1.mp3", import.meta.url)),
    readFile(new URL("../public/audio/death-imminent-breathing-1.mp3", import.meta.url)),
    readFile(new URL("../Assets/Audio/Gameover1.mp3", import.meta.url)),
    readFile(new URL("../public/audio/game-over-1.mp3", import.meta.url)),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(breathingPublic, breathingSource);
  assert.deepEqual(gameOverPublic, gameOverSource);
  assert.match(
    movementLabSource,
    /deathWarningAudioReasonRef\.current === reason[\s\S]*triggerEvent\("survival-death-imminent"\)[\s\S]*playOneShotAudio\("deathImminentBreathing"\)/,
  );
  assert.match(
    movementLabSource,
    /!survivalState\.gameOverReason[\s\S]*clearEvent\("survival-death-imminent"\)/,
  );
  assert.match(
    movementLabSource,
    /gameOverAudioReasonRef\.current === reason[\s\S]*playOneShotAudio\("gameOverImageRevealed"\)/,
  );
  assert.equal(
    (movementLabSource.match(/playOneShotAudio\("deathImminentBreathing"\)/g) ?? []).length,
    1,
  );
  assert.equal(
    (movementLabSource.match(/playOneShotAudio\("gameOverImageRevealed"\)/g) ?? []).length,
    1,
  );
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
