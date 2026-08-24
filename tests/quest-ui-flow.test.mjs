import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("development-only fake quest HUD triggers are removed", () => {
  assert.equal(source.includes("MOCK_QUEST_HUD"), false);
  assert.equal(source.includes("questHudDemo"), false);
  assert.equal(source.includes("echoes:quest-hud-test"), false);
});

test("inventory opening and successful item use publish quest events", () => {
  const inventoryOpenSource = source.slice(
    source.indexOf("const setInventoryPanelOpen"),
    source.indexOf("const setSpeedValue"),
  );
  const itemUseSource = source.slice(
    source.indexOf("function useInventoryItem"),
    source.indexOf("const getHotbarSlotAtPoint"),
  );
  const itemUsedPublisherSource = source.slice(
    source.indexOf("const publishItemUsedQuestEvent"),
    source.indexOf("function executeInventoryItemUseAction"),
  );
  assert.match(inventoryOpenSource, /open && !wasOpen/);
  assert.match(inventoryOpenSource, /type: "interfaceOpened"/);
  assert.match(inventoryOpenSource, /targetId: "Inventory"/);
  assert.match(itemUseSource, /result\.status === "not-owned"/);
  assert.match(itemUsedPublisherSource, /type: "itemUsed"/);
  assert.match(itemUsedPublisherSource, /targetId: itemId/);
  assert.match(itemUseSource, /publishItemUsedQuestEvent\(item\.id\)/);
  assert.ok(
    itemUseSource.indexOf("publishItemUsedQuestEvent(item.id)") >
      itemUseSource.indexOf("} else {"),
  );
  assert.match(source, /startAvailableAutomaticQuests\(/);
});

test("objective completion can open or close registered interfaces once", () => {
  const completionHandler = source.slice(
    source.indexOf("onObjectiveCompleted:"),
    source.indexOf("onStageTransitionStarted:"),
  );
  assert.match(completionHandler, /completionInterfaceAction !== "none"/);
  assert.match(completionHandler, /window\.queueMicrotask/);
  assert.match(completionHandler, /case "Inventory":[\s\S]*setInventoryPanelOpen\(open\)/);
  assert.match(completionHandler, /case "Options":[\s\S]*setOptionsPanelOpen\(open\)/);
});

test("objective completion and delayed next-stage visuals are wired", () => {
  assert.match(source, /kind:\s*"next"/);
  assert.match(source, /}, 3000\);/);
  assert.match(source, /is-completion-pop/);
  assert.match(styles, /quest-objective-completion-pop/);
  assert.match(
    styles,
    /\.quest-objective\.is-unlock-enter \.quest-objective-check,[\s\S]*?\.quest-objective\.is-unlock-enter \.quest-objective-label\s*{[\s\S]*?animation:\s*quest-objective-completion-pop 1s/,
  );
  assert.match(styles, /quest-header-next-glow/);
  assert.match(
    source,
    /\[questPanelCollapsed, activeQuestHud\?\.stageId, completedQuestHistory\.length\]/,
  );
  assert.match(source, /questStageEntering\s*\?\s*" is-stage-entering"/);
  assert.match(source, /questStageEntryPending\s*\?\s*" is-stage-entry-pending"/);
  assert.match(source, /key=\{activeQuestHud!\.stageId\}/);
  assert.match(
    styles,
    /\.quest-hud\.is-event-next \.quest-objectives\s*{[\s\S]*?quest-stage-objectives-leave 0\.3s ease 2\.7s both;/,
  );
  assert.match(
    styles,
    /\.quest-hud\.is-stage-entering \.quest-objectives\s*{[\s\S]*?quest-stage-objectives-enter 0\.3s/,
  );
  assert.match(
    styles,
    /\.quest-hud\.is-event-next \.quest-summary-progress\s*{[\s\S]*?quest-summary-progress-next 2\.1s[\s\S]*?both;/,
  );
  assert.match(
    styles,
    /@keyframes quest-summary-progress-next\s*{[\s\S]*?0%, 82%\s*{\s*opacity:\s*1;[\s\S]*?100%\s*{\s*opacity:\s*0;/,
  );
  assert.match(
    styles,
    /\.quest-hud\.is-event-next \.quest-header::before\s*{[\s\S]*?rgba\(255, 195, 66, 0\.96\)[\s\S]*?box-shadow:\s*inset 0 0 30px/,
  );
  assert.match(
    styles,
    /@keyframes quest-title-covered\s*{[\s\S]*?28%, 82%\s*{\s*opacity:\s*0;/,
  );
  assert.match(
    styles,
    /@keyframes quest-header-next-glow\s*{[\s\S]*?clip-path:\s*inset\(0 100% 0 0\)[\s\S]*?clip-path:\s*inset\(0 0 0 0\)[\s\S]*?100%\s*{\s*opacity:\s*0;/,
  );
  assert.match(
    styles,
    /@keyframes quest-header-result-glow\s*{[\s\S]*?clip-path:\s*inset\(0 100% 0 0\)[\s\S]*?clip-path:\s*inset\(0 0 0 0\)[\s\S]*?100%\s*{\s*opacity:\s*0;/,
  );
  const nextGlowKeyframes = styles.slice(
    styles.indexOf("@keyframes quest-header-next-glow"),
    styles.indexOf("@keyframes quest-header-result-glow"),
  );
  const resultGlowKeyframes = styles.slice(
    styles.indexOf("@keyframes quest-header-result-glow"),
    styles.indexOf("@keyframes quest-title-accepted"),
  );
  assert.doesNotMatch(nextGlowKeyframes, /10%\s*{/);
  assert.doesNotMatch(resultGlowKeyframes, /(?:^|\n)\s*8%\s*{/);
  assert.match(
    styles,
    /@keyframes quest-event-frame-expand\s*{[\s\S]*?0%\s*{\s*opacity:\s*0;\s*transform:\s*scale\(1\);[\s\S]*?scale\(1\.1, 1\.2\)/,
  );
  assert.doesNotMatch(
    styles,
    /@keyframes quest-event-frame-expand\s*{[^@]*scale\(0\.92\)/,
  );
});

test("任務與生存面板共用 300ms 高度 Tween，寬度不隨收折改變", () => {
  const panelTweenSource = source.slice(
    source.indexOf("function playHudPanelHeightTween"),
    source.indexOf("function getDefaultSurvivalExpanded"),
  );
  assert.match(source, /HUD_PANEL_TWEEN_DURATION_MS = 300/);
  assert.match(panelTweenSource, /window\.requestAnimationFrame\(updateTween\)/);
  assert.match(panelTweenSource, /easeInOutCubic/);
  assert.doesNotMatch(panelTweenSource, /easeOutBack/);
  assert.doesNotMatch(source, /prefers-reduced-motion: reduce/);
  assert.match(panelTweenSource, /element\.offsetHeight/);
  assert.doesNotMatch(panelTweenSource, /scaleX|scaleY|translateX|translateY/);
  assert.match(styles, /\.survival-hud\s*{[\s\S]*?width:\s*300px/);
  assert.match(styles, /\.quest-hud\s*{[\s\S]*?width:\s*370px/);
  assert.doesNotMatch(styles, /\.quest-hud\.is-collapsed\s*{[^}]*width:/);
});

test("survival and quest headers keep one layout and balanced typography", () => {
  assert.doesNotMatch(styles, /\.survival-hud\.is-expanded\s+\.survival-clock/);
  assert.doesNotMatch(styles, /\.quest-hud\.is-collapsed\s+\.quest-header(?:\s|\{|small|strong)/);
  assert.match(styles, /\.survival-clock\s*>\s*span\s*{[\s\S]*?font-size:\s*18px/);
  assert.match(styles, /\.survival-clock\s+strong\s*{[\s\S]*?font-size:\s*20px/);
  assert.match(styles, /\.survival-stat-label\s*{[\s\S]*?font-size:\s*18px/);
  assert.match(styles, /\.quest-header\s+small\s*{[\s\S]*?font-size:\s*12px/);
  assert.match(styles, /\.quest-header\s+strong\s*{[\s\S]*?font-size:\s*20px/);
  assert.match(styles, /\.quest-summary-progress\s*{[\s\S]*?font-size:\s*17px/);
  assert.match(styles, /\.quest-objective-label\s*{[\s\S]*?font-size:\s*18px/);
  assert.doesNotMatch(styles, /\.quest-hud\s*{[^}]*transform:\s*scale/);
});

test("quest decorations are removed and survival meters crossfade under the height mask", () => {
  assert.doesNotMatch(styles, /\.quest-hud::before|\.quest-hud::after/);
  assert.match(styles, /\.quest-collapse\s+span\s*{[\s\S]*?top:\s*34px/);
  assert.doesNotMatch(styles, /\.quest-collapse\s+span\s*{[^}]*top:\s*50%/);
  assert.match(styles, /\.survival-mini-panel\s*{[\s\S]*?transition:\s*opacity\s+120ms\s+ease\s+170ms/);
  assert.match(styles, /\.survival-panel\s*{[\s\S]*?display:\s*grid[\s\S]*?transition:\s*opacity\s+120ms\s+ease\s+170ms/);
  assert.doesNotMatch(styles, /\.survival-hud\.is-expanded\s+\.survival-mini-panel\s*{[^}]*display:\s*none/);
  assert.match(source, /className="survival-panel"\s+aria-hidden={!survivalPanelExpanded}/);
});

test("gameplay HUD shortcuts map Q and RB to quest, R and LB to survival", () => {
  assert.match(source, /\(key === "q" \|\| key === "r"\)/);
  assert.match(source, /if \(key === "q"\) toggleQuestPanel\(\);\s*else toggleSurvivalPanel\(\);/);
  assert.match(source, /leftBumperJustPressed\) \{\s*toggleSurvivalPanel\(\);/);
  assert.match(source, /rightBumperJustPressed\) \{\s*toggleQuestPanel\(\);/);
  assert.match(source, /const toggleQuestPanel = \(\) => \{[\s\S]*?setQuestCollapsed\(\(current\) => !current\);/);
  assert.doesNotMatch(source, /if \(!hasActiveQuestRef\.current\) return/);
  assert.match(source, /aria-keyshortcuts="Q"/);
  assert.match(source, /aria-keyshortcuts="R"/);
});

test("quest completion trigger starts only after the COMPLETE UI finishes", () => {
  const completionHandler = source.slice(
    source.indexOf("onQuestCompleted:"),
    source.indexOf("onQuestFailed:"),
  );
  assert.match(
    completionHandler,
    /triggerQuestHudVisual\("completed", view, completePresentation\)/,
  );
  assert.match(completionHandler, /else\s*{\s*completePresentation\(\);/);
});

test("all registered dialogue paths share one quest handoff after completion", () => {
  const completionListener = source.slice(
    source.indexOf("dialogueManager.setCompletionListener"),
    source.indexOf("Object.entries(STORY_DIALOGUES)"),
  );
  assert.match(completionListener, /type: "dialogueCompleted"/);
  assert.match(completionListener, /targetId: request\.id/);
  assert.match(
    completionListener,
    /startAvailableAfterDialogueQuests\(\s*request\.id,/,
  );

  const chapterFlowHost = source.slice(
    source.indexOf("playDialogue: (dialogueId)"),
    source.indexOf("startQuest: (questId)"),
  );
  assert.match(chapterFlowHost, /dialogueManager\.playRegistered\(/);

  const storyInteraction = source.slice(
    source.indexOf("if (interactable.storyDialogueId)"),
    source.indexOf("const dialogue = getInteractionDialogue"),
  );
  assert.match(
    storyInteraction,
    /dialogueManager\.playRegistered\(\s*interactable\.storyDialogueId,/,
  );

  const storyZone = source.slice(
    source.indexOf('events.on("storyZoneEntered"'),
    source.indexOf("storyEventManagerRef.current = events"),
  );
  assert.match(
    storyZone,
    /dialogueManager\.playRegistered\(\s*zone\.dialogueId,/,
  );
});

test("quest HUD result animations start their managed audio once", () => {
  const hudVisual = source.slice(
    source.indexOf("const triggerQuestHudVisual"),
    source.indexOf("const triggerQuestObjectiveTween"),
  );
  assert.match(
    hudVisual,
    /kind === "completed"[\s\S]*?playOneShotAudio\("questCompleted"\)/,
  );
  assert.match(
    hudVisual,
    /kind === "accepted"[\s\S]*?playOneShotAudio\("questStarted"\)/,
  );

  const stageTransition = source.slice(
    source.indexOf("const triggerQuestStageTransition"),
    source.indexOf("const scheduleQuestTeleport"),
  );
  assert.match(stageTransition, /playOneShotAudio\("questStarted"\)/);

  const objectiveCompletion = source.slice(
    source.indexOf("const triggerQuestObjectiveTween"),
    source.indexOf("const triggerQuestObjectiveUnlockTween"),
  );
  assert.match(
    objectiveCompletion,
    /currentView\?\.id === view\.id && currentView\.stageId !== view\.stageId[\s\S]*?return;[\s\S]*?playOneShotAudio\("questObjectiveCompleted"\)[\s\S]*?setQuestObjectiveTween/,
  );

  const objectiveActivation = source.slice(
    source.indexOf("onObjectiveActivated:"),
    source.indexOf("onStageTransitionStarted:"),
  );
  assert.match(
    objectiveActivation,
    /scheduleQuestPresentation\(objective\?\.startPresentationDelaySeconds,[\s\S]*?playOneShotAudio\("questObjectiveAdded"\)[\s\S]*?triggerQuestObjectiveUnlockTween\(view, objectiveId\)/,
  );

  const objectiveUnlockTween = source.slice(
    source.indexOf("const triggerQuestObjectiveUnlockTween"),
    source.indexOf("const triggerQuestStageTransition"),
  );
  assert.match(
    objectiveUnlockTween,
    /questObjectiveUnlockTweenTimerRef\.current !== null[\s\S]*?window\.clearTimeout\(questObjectiveUnlockTweenTimerRef\.current\)/,
  );
  assert.match(objectiveUnlockTween, /setQuestObjectiveUnlockTween\(null\);[\s\S]*?}, 1000\);/);
});

test("stage completion presentation keeps the completed HUD and reveals delayed Stage OBJ only once", () => {
  const stageTransition = source.slice(
    source.indexOf("const triggerQuestStageTransition"),
    source.indexOf("const scheduleQuestTeleport"),
  );
  assert.match(stageTransition, /questHudStageTransitionPresentationRef\.current = \{[\s\S]*?questId: view\.id,[\s\S]*?stageId: view\.stageId/);
  assert.match(stageTransition, /setActiveQuestHud\(view\)/);
  assert.match(stageTransition, /setActiveQuestHud\(getFirstActiveQuestHud\(\)\)/);
  assert.match(
    stageTransition,
    /const finishStageEntry[\s\S]*?setQuestStageEntryPending\(false\)[\s\S]*?setActiveQuestHud\(getFirstActiveQuestHud\(\)\)[\s\S]*?showStageEntering\(\)/,
  );
  assert.match(
    stageTransition,
    /if \(startEffectDelay <= 0\)[\s\S]*?finishStageEntry\(\)[\s\S]*?setQuestStageEntryPending\(true\)[\s\S]*?window\.setTimeout\([\s\S]*?finishStageEntry\(\)[\s\S]*?startEffectDelay/,
  );
  assert.match(
    styles,
    /\.quest-hud\.is-stage-entry-pending \.quest-objectives\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;/,
  );
  assert.match(
    source,
    /const isHoldingCompletedStage = presentation\?\.questId === questId[\s\S]*?presentation\.stageId !== view\?\.stageId[\s\S]*?if \(view && !isHoldingCompletedStage\) setActiveQuestHud\(view\)/,
  );
});

test("quest TAB prompt follows the latest keyboard, gamepad, or mobile input", () => {
  const promptRenderer = source.slice(
    source.indexOf("function renderQuestObjectiveLabel"),
    source.indexOf("type QuestHistoryView"),
  );
  assert.match(promptRenderer, /label\.includes\("\[TAB\]"\)/);
  assert.match(promptRenderer, /split\(\/\(\\\[TAB\\\]\)\/g\)/);
  assert.match(promptRenderer, /inputMode === "keyboard-mouse"[\s\S]*?>\[TAB\]</);
  assert.match(promptRenderer, /inputMode === "gamepad"[\s\S]*?>\[B鍵\]</);
  assert.match(promptRenderer, /className="quest-input-key-prompt"/);
  assert.match(promptRenderer, /className="quest-input-backpack-prompt"/);
  assert.match(promptRenderer, /className="inventory-trigger-icon"/);
  assert.match(
    source,
    /renderQuestObjectiveLabel\(objective\.label, questPromptInputMode\)/,
  );

  assert.match(source, /event\.pointerType === "touch" \? "mobile" : "keyboard-mouse"/);
  assert.match(source, /activateQuestPromptInputMode\("gamepad"\)/);
  assert.match(source, /activateQuestPromptInputMode\("keyboard-mouse"\)/);
  assert.match(
    source,
    /if \(questPromptInputModeRef\.current === mode\) return;/,
  );
  assert.match(styles, /\.quest-input-backpack-prompt\s*{/);
  assert.match(
    styles,
    /\.quest-input-key-prompt,[\s\S]*?\.quest-input-backpack-prompt\s*{[\s\S]*?color:\s*#ffd36f/,
  );
});

test("empty quest HUD expands into a three-item completed history", () => {
  assert.match(
    source,
    /const questPanelCollapsed = mobileHudLayout\s*\? questMobileMode !== "expanded"\s*:\s*questCollapsed/,
  );
  assert.match(source, /manager\.getCompletedQuestIds\(3\)/);
  assert.match(source, /const EMPTY_QUEST_TITLE = "這個階段沒有任務"/);
  assert.match(
    source,
    /if \(activeQuestHud !== null \|\| questHudEvent !== null\) return;\s*setQuestCollapsed\(true\);\s*setQuestMobileMode\("mini"\);/,
  );
  assert.match(
    source,
    /setQuestCollapsed\(\s*mobileHud \? true : initialQuestHud \? getDefaultQuestCollapsed\(\) : true,?\s*\)/,
  );
  assert.doesNotMatch(source, /QUEST HISTORY|任務歷程/);
  assert.match(source, /className="quest-history"/);
  assert.match(source, /className="quest-history-check"[^>]*>☑</);
  assert.match(source, /className="quest-history-title"/);
  assert.match(source, /尚無已完成的任務/);
  assert.doesNotMatch(source, /aria-disabled=\{!hasActiveQuest\}/);
  assert.match(styles, /\.quest-history-check\s*{[\s\S]*?rgba\(164, 175, 172, 0\.7\)/);
  assert.match(styles, /\.quest-history-title\s*{[\s\S]*?rgba\(178, 188, 185, 0\.74\)/);
});

test("mobile quest and survival HUDs default to mini and cycle through three states", () => {
  assert.match(source, /type MobileHudPanelMode = "mini" \| "collapsed" \| "expanded"/);
  assert.match(source, /useState<MobileHudPanelMode>\("mini"\)/);
  assert.match(
    source,
    /current === "mini"\s*\? "collapsed"\s*:\s*current === "collapsed"\s*\? "expanded"\s*:\s*"mini"/,
  );
  assert.match(source, /className="survival-mobile-minimal-panel"/);
  assert.match(source, /survivalMobileMode === "mini" \? " is-mobile-mini"/);
  assert.match(source, /questMobileMode === "mini" \? " is-mobile-mini"/);
  assert.match(styles, /\.survival-hud\.is-mobile-mini\s*{/);
  assert.match(styles, /\.quest-hud\.is-mobile-mini\s*{/);
});

test("visible black screen absorbs pointer input and blocks world actions", () => {
  assert.match(
    styles,
    /\.black-screen-image\[data-input-blocking="true"\]\s*{[^}]*pointer-events:\s*auto\s*!important/,
  );
  assert.match(
    source,
    /image\.dataset\.inputBlocking = next > 0 \? "true" : "false"/,
  );
  assert.match(source, /data-input-blocking="true"/);

  const assignWorldActionSource = source.slice(
    source.indexOf("const assignWorldAction"),
    source.indexOf("const clearPointerInteractionGuard"),
  );
  assert.match(assignWorldActionSource, /blackScreenOpacityRef\.current > 0/);

  const pointerDownSource = source.slice(
    source.indexOf("const onPointerDown"),
    source.indexOf("const onDialoguePointerDown"),
  );
  assert.match(pointerDownSource, /blackScreenOpacityRef\.current > 0/);

  const cursorSource = source.slice(
    source.indexOf("const drawPointerCursor"),
    source.indexOf("const render ="),
  );
  assert.doesNotMatch(cursorSource, /blackScreenOpacityRef\.current > 0/);

  const mouseMoveSource = source.slice(
    source.indexOf("const onPhysicalMouseMove"),
    source.indexOf("const endHeldPointer"),
  );
  assert.match(
    mouseMoveSource,
    /if \(blackScreenOpacityRef\.current > 0\)[\s\S]*?virtualCursorVisible = true/,
  );
  assert.match(source, /draggable={false}/);
  assert.match(styles, /\.black-screen-image\s*{[^}]*-webkit-user-drag:\s*none/);
});
