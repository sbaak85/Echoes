import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ChapterFlowManager } from "../app/chapter-flow-manager.ts";
import {
  CHAPTER04_START_DIALOGUE_ID,
  CHAPTER04_START_FLOW,
  CHAPTER04_START_FLOW_ID,
  CHAPTER04_START_OBJECTIVE_IDS,
  QUEST_STAGE_EVENT_FLOWS,
} from "../app/chapter04-quest-flow.ts";
import { DialogueManager } from "../app/dialogue-manager.ts";
import {
  CHAPTER_3_START_DIALOGUE,
  CHAPTER_3_START_FLOW,
  CHAPTER_3_SECTION_1_DIALOGUE_ID,
  STORY_CHAPTERS,
  STORY_DIALOGUES,
  STORY_EVENT_FLOWS,
} from "../app/story-content.ts";
import { StoryEventManager } from "../app/story-event-manager.ts";
import {
  CHAPTER04_ENTRY_SAVE_CHECKPOINT_ID,
  createStorySubtitleFlow,
  findStorySubtitleEvents,
  getStorySubtitleCompletedCount,
} from "../app/story-subtitle-flow.ts";

test("ChapterScriptEditor owns chapter-scoped story trigger polygon dialogue", async () => {
  const [editorSource, codecSource, storyContentSource, movementLabSource] =
    await Promise.all([
      readFile(new URL("../ChapterScriptEditor/MainForm.cs", import.meta.url), "utf8"),
      readFile(
        new URL("../ChapterScriptEditor/StoryContentCodec.cs", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/story-content.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(editorSource, /CreateStoryTriggerDialogueArea/);
  assert.match(editorSource, /"劇情多邊形台詞"/);
  assert.match(editorSource, /StoryTriggerDialogues/);
  assert.match(editorSource, /lowerContent\.SplitterDistance/);
  assert.match(
    codecSource,
    /chapter\.DialogueSections\.Concat\(chapter\.StoryTriggerDialogues\)/,
  );
  assert.match(storyContentSource, /"storyTriggerDialogues": \[/);
  assert.match(storyContentSource, /"chapter03-lower-left-not-ready": \{/);
  assert.doesNotMatch(movementLabSource, /LOWER_LEFT_STORY_ZONE_DIALOGUE/);
});

test("chapter03-section-9 複製 chapter03-final 的完整人物與腳本", async () => {
  const section9 = STORY_DIALOGUES["chapter03-section-9"];
  const chapterFinal = STORY_DIALOGUES["chapter03-final"];
  assert.equal(section9.characterDelaySeconds, chapterFinal.characterDelaySeconds);
  assert.deepEqual(section9.speakers, chapterFinal.speakers);
  assert.deepEqual(
    section9.lines.map(({ speaker, text }) => ({ speaker, text })),
    chapterFinal.lines.map(({ speaker, text }) => ({ speaker, text })),
  );
  assert.ok(section9.lines.every((line) =>
    line.lineId?.startsWith("chapter03-section-9-line-")));

  const source = await readFile(
    new URL("../app/story-content.ts", import.meta.url),
    "utf8",
  );
  const encoded = source.match(
    /\/\* CHAPTER_SCRIPT_EDITOR_DATA_BEGIN\s+([A-Za-z0-9+/=\r\n]+?)\s+CHAPTER_SCRIPT_EDITOR_DATA_END \*\//,
  )?.[1];
  assert.ok(encoded);
  const document = JSON.parse(
    Buffer.from(encoded.replace(/\s/g, ""), "base64").toString("utf8"),
  );
  const chapter = document.chapters.find((entry) => entry.id === "chapter03");
  const sourceDialogue = chapter.storyTriggerDialogues.find(
    (entry) => entry.id === "chapter03-final",
  )?.dialogue;
  const targetDialogue = chapter.dialogueSections.find(
    (entry) => entry.id === "chapter03-section-9",
  )?.dialogue;
  assert.equal(targetDialogue.characterDelaySeconds, sourceDialogue.characterDelaySeconds);
  assert.deepEqual(targetDialogue.speakers, sourceDialogue.speakers);
  assert.deepEqual(
    targetDialogue.lines.map(({ speaker, text }) => ({ speaker, text })),
    sourceDialogue.lines.map(({ speaker, text }) => ({ speaker, text })),
  );
  assert.ok(targetDialogue.lines.every((line) =>
    line.lineId?.startsWith("chapter03-section-9-line-")));
});

test("chapter03-End 由章節編輯器在 section-9 後播放黑幕白字幕", async () => {
  const matches = findStorySubtitleEvents(
    STORY_CHAPTERS,
    "afterDialogue",
    "chapter03-section-9",
  );
  assert.equal(matches.length, 1);
  const { chapterNumber, event } = matches[0];
  assert.equal(event.id, "chapter03-End");
  assert.equal(event.text, "第三章結束");
  assert.deepEqual(event.lines, [{ text: "第三章結束", fontSizePx: 38 }]);
  assert.equal(event.fadeInMs, 500);
  assert.equal(event.holdMs, 4000);
  assert.equal(event.fadeOutMs, 2000);
  assert.equal(event.keepBlack, false);
  assert.equal(event.lockInput, true);

  const flow = createStorySubtitleFlow(chapterNumber, event, 1);
  assert.deepEqual(flow.actions, [
    { type: "lockInput" },
    {
      type: "showBlackSubtitle",
      lines: ["第三章結束"],
      fontSizesPx: [38],
      fadeInMs: 500,
      holdMs: 4000,
      fadeOutMs: 2000,
      keepBlack: true,
      fadeOnly: true,
      afterSubtitleFadeOutCheckpointId: CHAPTER04_ENTRY_SAVE_CHECKPOINT_ID,
    },
  ]);
  assert.equal(flow.keepBlackAfterComplete, true);
  assert.equal(
    getStorySubtitleCompletedCount([flow.id], "chapter03-End"),
    1,
  );

  const styledFlow = createStorySubtitleFlow(
    chapterNumber,
    {
      ...event,
      id: "styled-subtitle-test",
      text: "第一句\n第二句",
      lines: [
        { text: "第一句", fontSizePx: 46 },
        { text: "第二句", fontSizePx: 22 },
      ],
    },
    1,
  );
  assert.deepEqual(styledFlow.actions[1], {
    type: "showBlackSubtitle",
    lines: ["第一句", "第二句"],
    fontSizesPx: [46, 22],
    fadeInMs: 500,
    holdMs: 4000,
    fadeOutMs: 2000,
    keepBlack: false,
    fadeOnly: true,
  });
  const legacyFlow = createStorySubtitleFlow(
    chapterNumber,
    {
      ...event,
      id: "legacy-subtitle-test",
      text: "舊第一句\n舊第二句",
      lines: undefined,
    },
    1,
  );
  assert.deepEqual(legacyFlow.actions[1], {
    type: "showBlackSubtitle",
    lines: ["舊第一句", "舊第二句"],
    fadeInMs: 500,
    holdMs: 4000,
    fadeOutMs: 2000,
    keepBlack: false,
    fadeOnly: true,
  });

  const [storyContentSource, movementLabSource, globalsSource] = await Promise.all([
    readFile(new URL("../app/story-content.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const encoded = storyContentSource.match(
    /\/\* CHAPTER_SCRIPT_EDITOR_DATA_BEGIN\s+([A-Za-z0-9+/=\r\n]+?)\s+CHAPTER_SCRIPT_EDITOR_DATA_END \*\//,
  )?.[1];
  assert.ok(encoded);
  const document = JSON.parse(
    Buffer.from(encoded.replace(/\s/g, ""), "base64").toString("utf8"),
  );
  const embeddedEvent = document.chapters
    .find((chapter) => chapter.id === "chapter03")
    ?.subtitleEvents.find((candidate) => candidate.id === "chapter03-End");
  assert.deepEqual(embeddedEvent, event);
  assert.match(
    movementLabSource,
    /void runAfterDialogueSubtitleEvents\(request\.id\)/,
  );
  assert.match(movementLabSource, /storyCenteredText\.fontSizesPx\?\.\[index\]/);
  assert.match(movementLabSource, /fontSize: `\$\{fontSizePx\}px`/);
  assert.match(globalsSource, /\.story-centered-text p \{[\s\S]*?white-space: pre-line;/);
});

test("章末存檔保持黑幕，下一章字幕直接接手並只在最後淡出點亮", async () => {
  const calls = [];
  let releaseCheckpoint;
  const checkpoint = new Promise((resolve) => { releaseCheckpoint = resolve; });
  const manager = new ChapterFlowManager({
    setInputLocked: () => {},
    setBlack: () => {},
    fadeToBlack: () => calls.push("fade-to"),
    fadeFromBlack: () => calls.push("fade-from"),
    showCenteredText: () => calls.push("text:show"),
    hideCenteredText: () => calls.push("text:hide"),
    playDialogue: async () => {},
    cancelDialogue: () => {},
    markCompleted: () => {},
    isCompleted: () => false,
    runBlackSubtitleCheckpoint: async (checkpointId, flowId) => {
      calls.push(`checkpoint:${checkpointId}:${flowId}`);
      await checkpoint;
    },
  });

  const running = manager.run(createStorySubtitleFlow(3, {
    id: "chapter03-End",
    name: "第三章結束",
    text: "第三章結束",
    triggerType: "afterDialogue",
    triggerValue: "chapter03-section-9",
    triggerCount: 1,
    delayBeforeMs: 0,
    fadeInMs: 0,
    holdMs: 0,
    fadeOutMs: 20,
    delayAfterMs: 0,
    keepBlack: false,
    lockInput: true,
  }, 1));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(calls.some((call) => call.startsWith("checkpoint:")), false);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(calls.includes("fade-from"), false);
  assert.match(calls.join("|"), /checkpoint:chapter04-entry-save:story-subtitle:chapter03-End:1/);
  assert.ok(calls.indexOf("text:hide") < calls.findIndex((call) => call.startsWith("checkpoint:")));
  releaseCheckpoint();
  await running;
  assert.equal(calls.includes("fade-from"), false);

  const chapterOpen = manager.run({
    id: "story-subtitle:chapter04-Open:1",
    chapter: 4,
    actions: [{
      type: "showBlackSubtitle",
      lines: ["第四章\nChapter.4"],
      fadeInMs: 10,
      holdMs: 0,
      fadeOutMs: 10,
      keepBlack: false,
      blackAlreadyVisible: true,
    }],
  });
  await chapterOpen;
  assert.equal(calls.filter((call) => call === "fade-to").length, 1);
  assert.equal(calls.filter((call) => call === "fade-from").length, 1);
});

test("chapter04-Open 完整歸屬第四章頁籤", async () => {
  const chapterThree = STORY_CHAPTERS.find((chapter) => chapter.id === "chapter03");
  const chapterFour = STORY_CHAPTERS.find((chapter) => chapter.id === "chapter04");
  assert.ok(chapterThree);
  assert.ok(chapterFour);
  assert.equal(
    chapterThree.subtitleEvents.some((event) => event.id === "chapter04-Open"),
    false,
  );

  const event = chapterFour.subtitleEvents.find(
    (candidate) => candidate.id === "chapter04-Open",
  );
  assert.deepEqual(event, {
    id: "chapter04-Open",
    name: "第四章開場",
    text: "第四章\r\nChapter.4",
    lines: [{ text: "第四章\r\nChapter.4", fontSizePx: 38 }],
    triggerType: "chapterStart",
    triggerValue: "",
    triggerCount: 1,
    delayBeforeMs: 0,
    fadeInMs: 1000,
    holdMs: 2000,
    fadeOutMs: 2000,
    delayAfterMs: 100,
    keepBlack: false,
    lockInput: true,
    chapterStartTimeMode: "clock",
    chapterStartElapsedMinutes: 0,
    chapterStartClockMinuteOfDay: 420,
  });

  const source = await readFile(
    new URL("../app/story-content.ts", import.meta.url),
    "utf8",
  );
  const encoded = source.match(
    /\/\* CHAPTER_SCRIPT_EDITOR_DATA_BEGIN\s+([A-Za-z0-9+/=\r\n]+?)\s+CHAPTER_SCRIPT_EDITOR_DATA_END \*\//,
  )?.[1];
  assert.ok(encoded);
  const document = JSON.parse(
    Buffer.from(encoded.replace(/\s/g, ""), "base64").toString("utf8"),
  );
  const embeddedChapterThree = document.chapters.find(
    (chapter) => chapter.id === "chapter03",
  );
  const embeddedChapterFour = document.chapters.find(
    (chapter) => chapter.id === "chapter04",
  );
  assert.equal(
    embeddedChapterThree.subtitleEvents.some(
      (candidate) => candidate.id === "chapter04-Open",
    ),
    false,
  );
  assert.deepEqual(
    embeddedChapterFour.subtitleEvents.find(
      (candidate) => candidate.id === "chapter04-Open",
    ),
    event,
  );
});

test("第四章首階段延遲播放開場腳本並在結束後啟用 OBJ 02、03", async () => {
  const questDocument = JSON.parse(await readFile(
    new URL("../public/quests/quest-data.json", import.meta.url),
    "utf8",
  ));
  const quest = questDocument.quests.find(
    (candidate) => candidate.id === "QUEST_CH04_MAIN_001",
  );
  const chapter = questDocument.chapters.find(
    (candidate) => candidate.id === "CH04",
  );
  const stage = quest?.stages.find(
    (candidate) => candidate.id === "QUEST_CH04_MAIN_001_STAGE_01",
  );
  assert.ok(stage);
  assert.equal(chapter?.openingEventFlowId, "");
  assert.equal(stage.startEventFlowId, CHAPTER04_START_FLOW_ID);
  assert.equal(
    stage.objectives.find(
      (objective) => objective.id === "QUEST_CH04_MAIN_001_OBJ_01",
    )?.activationMode,
    "immediate",
  );
  for (const objectiveId of CHAPTER04_START_OBJECTIVE_IDS) {
    assert.equal(
      stage.objectives.find((objective) => objective.id === objectiveId)
        ?.activationMode,
      "event",
    );
  }

  assert.equal(QUEST_STAGE_EVENT_FLOWS[CHAPTER04_START_FLOW_ID], CHAPTER04_START_FLOW);
  assert.ok(STORY_DIALOGUES[CHAPTER04_START_DIALOGUE_ID]);
  assert.deepEqual(CHAPTER04_START_FLOW.actions, [
    { type: "wait", durationMs: 3000 },
    { type: "playDialogue", dialogueId: "chapter04-start" },
    { type: "wait", durationMs: 500 },
    { type: "activateObjective", objectiveId: "QUEST_CH04_MAIN_001_OBJ_02" },
    { type: "activateObjective", objectiveId: "QUEST_CH04_MAIN_001_OBJ_03" },
  ]);
  assert.deepEqual(CHAPTER04_START_FLOW.skipActions, [
    { type: "wait", durationMs: 500 },
    { type: "activateObjective", objectiveId: "QUEST_CH04_MAIN_001_OBJ_02" },
    { type: "activateObjective", objectiveId: "QUEST_CH04_MAIN_001_OBJ_03" },
  ]);
});

test("ChapterFlowManager 的任務腳本可依序啟用多個 OBJ", async () => {
  const activated = [];
  const manager = new ChapterFlowManager({
    setInputLocked: () => {},
    setBlack: () => {},
    fadeToBlack: () => {},
    fadeFromBlack: () => {},
    showCenteredText: () => {},
    hideCenteredText: () => {},
    playDialogue: async () => {},
    activateObjective: async (objectiveId) => activated.push(objectiveId),
    cancelDialogue: () => {},
    markCompleted: () => {},
    isCompleted: () => false,
  });

  await manager.run({
    id: "activate-objectives-test",
    chapter: 4,
    actions: [
      { type: "activateObjective", objectiveId: "OBJ_02" },
      { type: "activateObjective", objectiveId: "OBJ_03" },
    ],
  });
  assert.deepEqual(activated, ["OBJ_02", "OBJ_03"]);
});

test("blank dialogue speaker stays blank instead of inheriting the previous line", async () => {
  const [movementLabSource, dialogueEditorSource] = await Promise.all([
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../MapEditor/DialogueEditorForm.cs", import.meta.url), "utf8"),
  ]);
  const resolverSource = movementLabSource.slice(
    movementLabSource.indexOf("function resolveDialogueSpeaker"),
    movementLabSource.indexOf("function distanceToSegment"),
  );
  assert.match(resolverSource, /lines\[lineIndex\]\?\.speaker\?\.trim\(\) \?\? ""/);
  assert.doesNotMatch(resolverSource, /for \(|lineIndex; index >= 0/);
  assert.match(dialogueEditorSource, /發話者（空白＝不顯示發話者）/);
  assert.doesNotMatch(dialogueEditorSource, /其餘空白＝延續上一位/);
});

test("story trigger zones reuse interaction requirements and completion effects", async () => {
  const [movementLabSource, mainFormSource, sceneModelsSource] = await Promise.all([
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../MapEditor/MainForm.cs", import.meta.url), "utf8"),
    readFile(new URL("../MapEditor/SceneModels.cs", import.meta.url), "utf8"),
  ]);

  assert.match(movementLabSource, /survivalRequirements\?: SurvivalRequirements/);
  assert.match(movementLabSource, /useRequirements\?: InteractionUseRequirement\[\]/);
  assert.match(
    movementLabSource,
    /if \(!result\.completed \|\| !completeStoryTriggerRef\.current\(zone\)\) return/,
  );
  const storyActivationSource = movementLabSource.slice(
    movementLabSource.indexOf("canActivateStoryTriggerRef.current ="),
    movementLabSource.indexOf("const isInteractableConditionActive"),
  );
  assert.match(storyActivationSource, /isInteractableLocked\(trigger\)/);
  assert.match(storyActivationSource, /hasInteractionRequirementFailures\(trigger\)/);
  assert.match(
    storyActivationSource,
    /getInteractionUseRequirementFailure\(trigger, "all"\)/,
  );
  assert.match(
    movementLabSource,
    /id: `story-trigger:\$\{SCENE_DATA\.sceneId\}:\$\{zone\.id\}`/,
  );

  const storyContactSource = movementLabSource.slice(
    movementLabSource.indexOf("const shouldRecheckTouchingStoryTriggers"),
    movementLabSource.indexOf("minimapSyncElapsed += deltaTime"),
  );
  assert.doesNotMatch(storyContactSource, /0\.1|setInterval|Elapsed/);
  assert.match(
    storyContactSource,
    /!wasTouching \|\| shouldRecheckTouchingStoryTriggers/,
  );
  assert.match(storyContactSource, /canActivateStoryTriggerRef\.current\(zone\)/);
  assert.match(storyContactSource, /eligibleStoryTriggerZoneIds\.has\(zone\.id\)/);
  assert.match(storyContactSource, /emit\("storyZoneEntered"/);
  assert.match(
    movementLabSource,
    /touchingStorySurvivalConditionBecameEligible/,
  );
  assert.match(
    movementLabSource,
    /requestStoryTriggerContactCheckRef\.current\(\)/,
  );

  const storyCompletionSource = movementLabSource.slice(
    movementLabSource.indexOf("completeStoryTriggerRef.current ="),
    movementLabSource.indexOf("const completeInteraction"),
  );
  assert.match(storyCompletionSource, /grantInteractionItemRewards\(trigger\)/);
  assert.match(storyCompletionSource, /settleInteractionSurvival/);
  assert.match(storyCompletionSource, /runTimePassTransition/);
  assert.match(storyCompletionSource, /recordInteractionUse/);

  assert.match(mainFormSource, /OpenStoryTriggerEffectEditor/);
  assert.match(mainFormSource, /new SurvivalEffectEditorForm\(/);
  assert.match(sceneModelsSource, /class StoryTriggerZone : ITriggerConfiguration/);
});

test("editors store task and story-trigger delays without assigning a polygon", async () => {
  const [questModelsSource, mapModelsSource, mapFormSource, questData] =
    await Promise.all([
      readFile(new URL("../QuestEditor/QuestModels.cs", import.meta.url), "utf8"),
      readFile(new URL("../MapEditor/SceneModels.cs", import.meta.url), "utf8"),
      readFile(new URL("../MapEditor/MainForm.cs", import.meta.url), "utf8"),
      readFile(new URL("../public/quests/quest-data.json", import.meta.url), "utf8")
        .then(JSON.parse),
    ]);

  assert.match(questModelsSource, /StartDelaySeconds/);
  assert.match(questModelsSource, /StartPresentationDelaySeconds/);
  assert.match(questModelsSource, /CompletionPresentationDelaySeconds/);
  assert.match(questModelsSource, /啟動延遲（秒）/);
  assert.match(mapModelsSource, /TriggerDelaySeconds/);
  assert.match(mapModelsSource, /StartQuestIds/);
  assert.match(mapModelsSource, /QuestState/);
  assert.match(mapFormSource, /觸發延遲（秒）/);
  assert.match(mapFormSource, /showQuestStartOptions: true/);
  assert.match(questModelsSource, /CompletionInterfaceAction/);

  const nextQuest = questData.quests.find(
    (quest) => quest.id === "QUEST_CH03_MAIN_002",
  );
  assert.equal(nextQuest.startDelaySeconds, 0.2);
  assert.equal(
    questData.quests.some((quest) => quest.startDelaySeconds == null),
    false,
  );
  assert.equal(
    questData.quests.some((quest) =>
      quest.stages.some((stage) => stage.startDelaySeconds == null)),
    false,
  );
  assert.equal(
    questData.quests.some((quest) =>
      quest.stages.some((stage) => stage.completionDelaySeconds == null)),
    false,
  );
  assert.equal(
    questData.quests.some((quest) =>
      quest.stages.some((stage) =>
        stage.objectives.some((objective) => objective.startDelaySeconds == null))),
    false,
  );
  assert.equal(
    questData.quests.some((quest) =>
      quest.stages.some((stage) =>
        stage.objectives.some((objective) => objective.completionDelaySeconds == null))),
    false,
  );
});

test("第三章開場腳本與流程符合第一版規格", () => {
  assert.equal(CHAPTER_3_START_DIALOGUE.lines.length, 9);
  assert.deepEqual(
    CHAPTER_3_START_DIALOGUE.lines.map((line) => line.speaker),
    ["", "", "???", "飛船輔助系統", "飛船輔助系統", "Sbaak", "飛船輔助系統", "Sbaak", "Sbaak"],
  );
  assert.ok(CHAPTER_3_START_DIALOGUE.lines.at(-1)?.text.trim());
  const lowerLeftStoryZoneDialogue =
    STORY_DIALOGUES["chapter03-lower-left-not-ready"];
  assert.equal(lowerLeftStoryZoneDialogue?.lines[0]?.speaker, "Sbaak");
  assert.equal(lowerLeftStoryZoneDialogue?.lines[0]?.text, "現在我還沒準備好。");
  const sectionNine = STORY_DIALOGUES["chapter03-section-9"];
  assert.equal(sectionNine?.lines[9]?.lineId, "chapter03-section-9-line-010");
  assert.equal(sectionNine?.lines[9]?.text, "警告——偵測到非預期訊號來源。");
  const storyLineIds = Object.values(STORY_DIALOGUES)
    .flatMap((dialogue) => dialogue.lines)
    .map((line) => line.lineId);
  assert.equal(storyLineIds.every((lineId) => typeof lineId === "string" && lineId.length > 0), true);
  assert.equal(new Set(storyLineIds).size, storyLineIds.length);

  const centeredText = CHAPTER_3_START_FLOW.actions.find(
    (action) =>
      action.type === "showCenteredText" &&
      action.lines.some((line) => line.includes("墜落後第3天")),
  );
  assert.ok(centeredText);
  assert.equal(centeredText.fadeInMs, 1500);
  assert.equal(centeredText.holdMs, 8000);
  assert.equal(centeredText.fadeOutMs, 1500);
  assert.equal(centeredText.fadeOnly, true);
  assert.equal(centeredText.holdSkipConfirmAfterMs, 2000);
  assert.equal(CHAPTER_3_START_FLOW.chapter, 3);
  assert.equal(CHAPTER_3_START_FLOW.once, true);
  assert.equal(CHAPTER_3_SECTION_1_DIALOGUE_ID, "chapter03-section-1");

  const chapterOpenIndex = CHAPTER_3_START_FLOW.actions.findIndex(
    (action) =>
      action.type === "showCenteredText" &&
      action.lines.some((line) => line.includes("Chapter.3")),
  );
  const openingCardIndex = CHAPTER_3_START_FLOW.actions.findIndex(
    (action) =>
      action.type === "showCenteredText" &&
      action.lines.some((line) => line.includes("墜落後第3天")),
  );
  assert.ok(chapterOpenIndex >= 0);
  assert.ok(openingCardIndex > chapterOpenIndex);
  assert.equal(CHAPTER_3_START_FLOW.actions[chapterOpenIndex].fadeOnly, true);
  assert.equal(
    CHAPTER_3_START_FLOW.actions.some(
      (action) =>
        action.type === "showCenteredText" &&
        action.lines.some((line) => line.includes("Chapter.4")),
    ),
    false,
  );

  const fadeIndex = CHAPTER_3_START_FLOW.actions.findIndex(
    (action) => action.type === "fadeFromBlack",
  );
  assert.deepEqual(
    CHAPTER_3_START_FLOW.actions.slice(fadeIndex, fadeIndex + 6),
    [
      { type: "fadeFromBlack", durationMs: 1000 },
      { type: "lockInput" },
      { type: "wait", durationMs: 1000 },
      { type: "playDialogue", dialogueId: CHAPTER_3_SECTION_1_DIALOGUE_ID },
      { type: "startQuest", questId: "QUEST_CH03_MAIN_001" },
      { type: "unlockInput" },
    ],
  );
  assert.equal(
    CHAPTER_3_START_FLOW.actions.some(
      (action) => action.type === "showMainObjectiveMarker",
    ),
    false,
  );
  assert.equal(
    CHAPTER_3_START_FLOW.skipActions?.some(
      (action) => action.type === "showMainObjectiveMarker",
    ),
    false,
  );
  assert.equal(
    CHAPTER_3_START_FLOW.skipActions?.some(
      (action) => action.type === "startQuest" && action.questId === "QUEST_CH03_MAIN_001",
    ),
    true,
  );
  assert.deepEqual(CHAPTER_3_START_FLOW.skipActions?.at(-1), {
    type: "unlockInput",
  });
  assert.equal(STORY_EVENT_FLOWS[CHAPTER_3_START_FLOW.id], CHAPTER_3_START_FLOW);
});

test("DialogueManager 依序播放已登錄腳本", async () => {
  const manager = new DialogueManager();
  const presented = [];
  const completions = [];
  manager.setPresenter((request, complete) => {
    presented.push(request.id);
    completions.push(complete);
  });
  manager.register("first", STORY_DIALOGUES["chapter03-lower-left-not-ready"]);

  const first = manager.playRegistered("first", undefined);
  const second = manager.play("second", CHAPTER_3_START_DIALOGUE, undefined);
  assert.deepEqual(presented, ["first"]);
  completions.shift()();
  assert.deepEqual(await first, { completed: true });
  assert.deepEqual(presented, ["first", "second"]);
  completions.shift()();
  assert.deepEqual(await second, { completed: true });
});

test("DialogueManager 不會排入相同互動的重複播放", async () => {
  const manager = new DialogueManager();
  const presented = [];
  const completions = [];
  manager.setPresenter((request, complete) => {
    presented.push(request.id);
    completions.push(complete);
  });

  const first = manager.playUnique(
    "interaction:campfire",
    STORY_DIALOGUES["chapter03-lower-left-not-ready"],
    undefined,
  );
  const duplicate = manager.playUnique(
    "interaction:campfire",
    STORY_DIALOGUES["chapter03-lower-left-not-ready"],
    undefined,
  );

  assert.deepEqual(presented, ["interaction:campfire"]);
  assert.deepEqual(await duplicate, { completed: false });
  completions.shift()();
  assert.deepEqual(await first, { completed: true });
  assert.deepEqual(presented, ["interaction:campfire"]);
});

test("DialogueManager only emits the common completion event after a real finish", async () => {
  const manager = new DialogueManager();
  const completions = [];
  let finishCurrent;
  manager.setPresenter((_request, complete) => {
    finishCurrent = complete;
  });
  manager.setCompletionListener((request) => completions.push(request.id));

  const chapterFlowDialogue = manager.play(
    "chapter03-section-test",
    CHAPTER_3_START_DIALOGUE,
    { type: "chapter-flow" },
  );
  finishCurrent();
  assert.deepEqual(await chapterFlowDialogue, { completed: true });
  assert.deepEqual(completions, ["chapter03-section-test"]);

  const cancelledInteractionDialogue = manager.play(
    "interaction:interaction-test",
    CHAPTER_3_START_DIALOGUE,
    { type: "interaction" },
  );
  manager.cancelCurrent();
  assert.deepEqual(await cancelledInteractionDialogue, { completed: false });
  assert.deepEqual(completions, ["chapter03-section-test"]);
});

test("StoryEventManager 依登錄順序派送事件", async () => {
  const manager = new StoryEventManager();
  const received = [];
  manager.on("chapterStarted", ({ chapter }) => received.push(`first:${chapter}`));
  manager.on("chapterStarted", async ({ chapter }) => received.push(`second:${chapter}`));
  await manager.emit("chapterStarted", { chapter: 3 });
  assert.deepEqual(received, ["first:3", "second:3"]);
});

test("ChapterFlowManager 可執行並以 skipActions 結束", async () => {
  const calls = [];
  const completed = new Set();
  const manager = new ChapterFlowManager({
    setInputLocked: (locked) => calls.push(`lock:${locked}`),
    setBlack: (visible) => calls.push(`black:${visible}`),
    fadeToBlack: (durationMs) => calls.push(`fade-to:${durationMs}`),
    fadeFromBlack: (durationMs) => calls.push(`fade:${durationMs}`),
    showCenteredText: () => calls.push("text:show"),
    hideCenteredText: () => calls.push("text:hide"),
    playDialogue: async (dialogueId) => calls.push(`dialogue:${dialogueId}`),
    startQuest: async (questId) => calls.push(`quest:${questId}`),
    cancelDialogue: () => calls.push("dialogue:cancel"),
    markCompleted: (flowId) => completed.add(flowId),
    isCompleted: (flowId) => completed.has(flowId),
  });

  const run = manager.run({
    id: "test-flow",
    chapter: 3,
    once: true,
    actions: [
      { type: "lockInput" },
      { type: "setBlack", visible: true },
      { type: "wait", durationMs: 100 },
      { type: "playDialogue", dialogueId: "should-not-play" },
    ],
    skipActions: [
      { type: "fadeFromBlack", durationMs: 1 },
      { type: "startQuest", questId: "QUEST_TEST" },
      { type: "unlockInput" },
    ],
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(manager.requestSkip(), true);
  assert.equal(await run, true);
  assert.equal(completed.has("test-flow"), true);
  assert.equal(calls.includes("dialogue:should-not-play"), false);
  assert.equal(calls.includes("fade:1"), true);
  assert.equal(calls.includes("quest:QUEST_TEST"), true);
  assert.equal(calls.includes("lock:false"), true);
  assert.equal(await manager.run({ id: "test-flow", chapter: 3, once: true, actions: [] }), false);
});

test("開場字幕需兩次 A 才略過停留，並保留後續對話", async () => {
  const calls = [];
  const completed = new Set();
  const manager = new ChapterFlowManager({
    setInputLocked: () => {},
    setBlack: () => {},
    fadeToBlack: () => {},
    fadeFromBlack: () => {},
    showCenteredText: () => calls.push("text:show"),
    restartCenteredTextFadeOut: (durationMs) =>
      calls.push(`text:fade-out:${durationMs}`),
    hideCenteredText: () => calls.push("text:hide"),
    setCenteredTextHoldSkipPrompt: (visible) =>
      calls.push(`prompt:${visible}`),
    playDialogue: async (dialogueId) => calls.push(`dialogue:${dialogueId}`),
    cancelDialogue: () => calls.push("dialogue:cancel"),
    markCompleted: (flowId) => completed.add(flowId),
    isCompleted: (flowId) => completed.has(flowId),
  });

  const running = manager.run({
    id: "opening-card-micro-skip-test",
    chapter: 3,
    once: true,
    actions: [
      {
        type: "showCenteredText",
        lines: ["第三章開場"],
        fadeInMs: 5,
        holdMs: 100,
        fadeOutMs: 10,
        fadeOnly: true,
        holdSkipConfirmAfterMs: 8,
      },
      { type: "playDialogue", dialogueId: "chapter03-start" },
    ],
  });

  assert.equal(manager.requestActiveCenteredTextHoldSkip(), "unavailable");
  await new Promise((resolve) => setTimeout(resolve, 24));
  assert.equal(manager.requestActiveCenteredTextHoldSkip(), "armed");
  assert.equal(calls.includes("prompt:true"), true);
  assert.equal(manager.requestActiveCenteredTextHoldSkip(), "skipped");
  assert.equal(await running, true);
  assert.equal(calls.includes("text:fade-out:10"), true);
  assert.equal(calls.includes("dialogue:chapter03-start"), true);
  assert.equal(calls.includes("dialogue:cancel"), false);
  assert.equal(calls.includes("prompt:false"), true);
  assert.equal(completed.has("opening-card-micro-skip-test"), true);
});

test("開場字幕微略過使用純淡入淡出並維持編輯器輸出設定", async () => {
  const [movementLabSource, globalsSource, editorCodecSource] = await Promise.all([
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../ChapterScriptEditor/StoryContentCodec.cs", import.meta.url), "utf8"),
  ]);
  assert.match(movementLabSource, /requestActiveCenteredTextHoldSkip\(\)/);
  assert.match(movementLabSource, /centeredTextHoldSkipResult === "unavailable"/);
  assert.match(globalsSource, /story-centered-text\.is-fade-only/);
  assert.match(globalsSource, /story-centered-text-fade-only-in/);
  const centeredTextIn = globalsSource.match(
    /@keyframes story-centered-text-in\s*\{([\s\S]*?)\n\}/,
  )?.[1] ?? "";
  const centeredTextOut = globalsSource.match(
    /@keyframes story-centered-text-out\s*\{([\s\S]*?)\n\}/,
  )?.[1] ?? "";
  assert.doesNotMatch(centeredTextIn, /calc\(|translateY|scale\(|rotate\(/);
  assert.doesNotMatch(centeredTextOut, /calc\(|translateY|scale\(|rotate\(/);
  assert.match(centeredTextIn, /from \{ opacity: 0; transform: translate\(-50%, -50%\); \}/);
  assert.match(centeredTextOut, /to \{ opacity: 0; transform: translate\(-50%, -50%\); \}/);
  assert.match(globalsSource, /story-centered-text-hold-skip-prompt/);
  assert.match(movementLabSource, /story-centered-text-hold-skip-prompt[\s\S]*?<span aria-hidden="true">SKIP<\/span>/);
  assert.doesNotMatch(globalsSource, /story-centered-text-hold-skip-prompt > span \{[^}]*border-bottom:/);
  assert.match(editorCodecSource, /chapter03-opening-card/);
  assert.match(editorCodecSource, /holdSkipConfirmAfterMs: 2000/);
  assert.match(
    editorCodecSource,
    /item\.Id\.StartsWith\("chapter03-", StringComparison\.OrdinalIgnoreCase\)/,
  );
});

test("ChapterFlowManager 從暫停狀態 SKIP 後仍會關閉黑幕並解鎖", async () => {
  let blackVisible = false;
  let inputLocked = false;
  let paused = false;
  const manager = new ChapterFlowManager({
    setInputLocked: (locked) => { inputLocked = locked; },
    setBlack: (visible) => { blackVisible = visible; },
    fadeToBlack: () => {},
    fadeFromBlack: () => {},
    showCenteredText: () => {},
    hideCenteredText: () => {},
    playDialogue: async () => {},
    cancelDialogue: () => {},
    markCompleted: () => {},
    isCompleted: () => false,
    onPausedChanged: (value) => { paused = value; },
  });

  const run = manager.run({
    id: "paused-skip-flow",
    chapter: 3,
    actions: [
      { type: "lockInput" },
      { type: "setBlack", visible: true },
      { type: "wait", durationMs: 1000 },
    ],
    skipActions: [
      { type: "setBlack", visible: true },
      { type: "fadeFromBlack", durationMs: 1 },
      { type: "unlockInput" },
    ],
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  manager.pause();
  assert.equal(paused, true);
  assert.equal(manager.requestSkip(), true);
  assert.equal(await run, true);
  assert.equal(paused, false);
  assert.equal(blackVisible, false);
  assert.equal(inputLocked, false);
});

test("黑幕白字幕會同步淡入淡出，結束時強制回到完全點亮", async () => {
  const calls = [];
  let blackVisible = false;
  let inputLocked = false;
  const manager = new ChapterFlowManager({
    setInputLocked: (locked) => {
      inputLocked = locked;
      calls.push(`lock:${locked}`);
    },
    setBlack: (visible) => {
      blackVisible = visible;
      calls.push(`black:${visible}`);
    },
    fadeToBlack: (durationMs) => {
      blackVisible = true;
      calls.push(`fade-to:${durationMs}`);
    },
    // 模擬 RAF 動畫被中斷：這裡刻意不把 blackVisible 改回 false。
    fadeFromBlack: (durationMs) => calls.push(`fade-from:${durationMs}`),
    showCenteredText: () => calls.push("text:show"),
    hideCenteredText: () => calls.push("text:hide"),
    playDialogue: async () => {},
    cancelDialogue: () => {},
    markCompleted: () => {},
    isCompleted: () => false,
  });

  await manager.run({
    id: "black-subtitle-test",
    chapter: 3,
    actions: [
      { type: "lockInput" },
      {
        type: "showBlackSubtitle",
        lines: ["第三章結束"],
        fadeInMs: 2,
        holdMs: 3,
        fadeOutMs: 4,
        keepBlack: false,
      },
      { type: "unlockInput" },
    ],
  });

  assert.deepEqual(calls, [
    "lock:true",
    "text:show",
    "fade-to:2",
    "fade-from:4",
    "text:hide",
    "black:false",
    "lock:false",
    "text:hide",
    "black:false",
    "lock:false",
  ]);
  assert.equal(blackVisible, false);
  assert.equal(inputLocked, false);
});

test("非持續黑幕流程即使中途拋錯也會強制點亮並解除輸入鎖定", async () => {
  let blackVisible = false;
  let inputLocked = false;
  const manager = new ChapterFlowManager({
    setInputLocked: (locked) => { inputLocked = locked; },
    setBlack: (visible) => { blackVisible = visible; },
    fadeToBlack: () => { blackVisible = true; },
    fadeFromBlack: () => {},
    showCenteredText: () => {},
    hideCenteredText: () => {},
    playDialogue: async () => { throw new Error("dialogue failed"); },
    cancelDialogue: () => {},
    markCompleted: () => {},
    isCompleted: () => false,
  });

  await assert.rejects(
    manager.run({
      id: "blackout-error-failsafe",
      chapter: 3,
      actions: [
        { type: "lockInput" },
        { type: "setBlack", visible: true },
        { type: "playDialogue", dialogueId: "broken-dialogue" },
      ],
    }),
    /dialogue failed/,
  );

  assert.equal(blackVisible, false);
  assert.equal(inputLocked, false);
});
