import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ChapterFlowManager } from "../app/chapter-flow-manager.ts";
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
  assert.deepEqual(
    STORY_DIALOGUES["chapter03-section-9"],
    STORY_DIALOGUES["chapter03-final"],
  );

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
  assert.deepEqual(targetDialogue, sourceDialogue);
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
      keepBlack: false,
    },
    { type: "unlockInput" },
  ]);
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
    (action) => action.type === "showCenteredText",
  );
  assert.ok(centeredText);
  assert.equal(centeredText.fadeInMs, 1500);
  assert.equal(centeredText.holdMs, 8000);
  assert.equal(centeredText.fadeOutMs, 1500);
  assert.equal(CHAPTER_3_START_FLOW.chapter, 3);
  assert.equal(CHAPTER_3_START_FLOW.once, true);
  assert.equal(CHAPTER_3_SECTION_1_DIALOGUE_ID, "chapter03-section-1");

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
