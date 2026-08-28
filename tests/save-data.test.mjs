import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deleteSaveDataSlot,
  getManualSaveSlotId,
  isSaveDataSlotId,
  listSaveDataSlots,
  normalizeEchoesSaveData,
  readSaveDataSlot,
  writeSaveDataSlot,
} from "../app/save-data.ts";
import {
  CHAPTER04_ENTERED_FLAG_ID,
  CHAPTER04_ID,
  CHAPTER04_NAME,
  createChapter04EntryStoryProgress,
} from "../app/chapter04-transition.ts";

function createSave() {
  return {
    format: "EchoesSaveData",
    schemaVersion: 1,
    savedAt: "2026-08-27T00:00:00.000Z",
    slotKind: "manual",
    summary: {
      chapterId: "chapter-3",
      chapterName: "第三章",
      questId: "QUEST_TEST",
      questName: "測試任務",
      stageId: "STAGE_02",
      stageName: "第二階段",
    },
    progress: {
      sceneId: "Scene_3",
      survival: {
        values: { stamina: 61, hunger: 62, thirst: 63, spirit: 64 },
        gameMinutes: 800,
        zeroDurationMinutes: { hunger: 0, thirst: 0, spirit: 0 },
        gameOverReason: null,
      },
      inventory: { T0007: 1, R0001: 2 },
      quest: {
        schemaVersion: 1,
        quests: {
          QUEST_TEST: {
            state: "active",
            currentStageId: "STAGE_02",
            objectives: {
              OBJ_01: { currentAmount: 1, completed: true },
              OBJ_02: { currentAmount: 0, completed: false },
            },
            tracked: true,
            startedAtDay: 3,
            startedAtTime: 420,
            rewardClaimed: false,
          },
        },
      },
      story: { currentChapter: 3, completedEventIds: ["intro"], storyFlags: {} },
      campPower: { current: 5, dailyConsumptionEnabled: false, lastProcessedCycle: 0 },
      interactionUsage: { cycle: 0, counts: { "interaction-006": 1 }, completedOnceIds: [] },
      itemPointProgress: { onceCollectedIds: ["Scene_3:scene3-item-point-001"], dailyCollectedCycles: {} },
      collectedWorldItemIds: ["placed-001"],
      droppedWorldItems: [{
        id: "drop-001",
        sceneId: "Scene_3",
        itemId: "R0001",
        quantity: 1,
        position: { x: 123.5, y: 456.25 },
        interactionPoint: { x: 125, y: 470, facing: "S" },
        pickRadius: 26,
        activationDistance: 48,
        createdFromInventory: true,
      }],
    },
  };
}

test("第三章章末存檔快照會以 chapter04 命名並包含完成旗標", () => {
  const next = createChapter04EntryStoryProgress({
    currentChapter: 3,
    completedEventIds: ["earlier-event"],
    storyFlags: { preserved: true },
  }, "story-subtitle:chapter03-End:1");
  assert.equal(next.currentChapter, 4);
  assert.equal(CHAPTER04_ID, "chapter04");
  assert.equal(CHAPTER04_NAME, "第四章");
  assert.deepEqual(next.completedEventIds, [
    "earlier-event",
    "story-subtitle:chapter03-End:1",
  ]);
  assert.equal(next.storyFlags.preserved, true);
  assert.equal(next.storyFlags[CHAPTER04_ENTERED_FLAG_ID], true);
});

test("chapter03-End 儲存確認介面阻擋黑幕淡出並支援手把操作", async () => {
  const [movementLabSource, globalsSource, flowSource] = await Promise.all([
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/chapter-flow-manager.ts", import.meta.url), "utf8"),
  ]);
  assert.match(movementLabSource, /要手動儲存目前的遊戲進度嗎\?/);
  assert.match(movementLabSource, />自動儲存</);
  assert.match(movementLabSource, /queuePortableSaveWrite\("autosave", "auto", nextStory\)/);
  assert.match(movementLabSource, /chapter04ManualSaveActiveRef\.current = true;[\s\S]*setOptionsPanelOpen\(true\)/);
  assert.match(movementLabSource, /chapter04SavePromptMenuOpen[\s\S]*gamepadInput\.confirmPressed[\s\S]*activateChapter04SaveChoice/);
  assert.match(flowSource, /afterSubtitleFadeOutCheckpointId[\s\S]*await this\.wait\(action\.fadeOutMs[\s\S]*await this\.host\.runBlackSubtitleCheckpoint/);
  assert.match(flowSource, /runBlackSubtitleCheckpoint[\s\S]*fadeFromBlack\(action\.fadeOutMs\)/);
  assert.match(globalsSource, /\.chapter04-save-confirmation-actions button\.is-autosave strong \{[\s\S]*color: #ff91c8/);
  assert.match(globalsSource, /\.chapter04-save-confirmation-actions button \{[\s\S]*outline: 0 !important/);
  assert.match(globalsSource, /chapter04-save-confirmation-enter[\s\S]*scale\(0\.92\)/);
});

test("空欄位的確認儲存按鈕直接提交 confirm，不依賴延遲後的焦點狀態", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /executeSaveDataDialogChoice = async \(\s*explicitChoice\?: SaveDataDialogChoice/);
  assert.match(source, /const choice = explicitChoice \?\? saveDataDialogChoiceRef\.current/);
  assert.match(source, /onClick=\{\(\) => void executeSaveDataDialogChoice\("confirm"\)\}/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => void executeSaveDataDialogChoice\(\), 0\)/);
});

test("章節結束的手動存檔在黑幕輸入鎖期間仍可由滑鼠、鍵盤與虛擬游標確認", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /timePassInputLockedRef\.current &&\s*!chapter04SavePromptOpenRef\.current &&\s*!optionsOpenRef\.current/,
  );
  assert.match(
    source,
    /isChapterTransitionUiClick[\s\S]{0,500}\.chapter04-save-confirmation-overlay, \.options-overlay[\s\S]{0,500}timePassInputLockedRef\.current[\s\S]{0,200}!isChapterTransitionUiClick/,
  );
  assert.match(
    source,
    /Options follows the last active control method[\s\S]{0,500}shouldUseOptionsCursor\(optionsGamepadModeRef\.current\)[\s\S]{0,180}const cursorResult = activateVirtualCursorUi\(\)[\s\S]{0,320}activateOptionsMenuSelection\(\)/,
  );
  assert.match(
    source,
    /cursorResult !== "activated" &&\s*\(saveDataDialogRef\.current \|\| restartConfirmationOpenRef\.current\)/,
  );
  assert.match(
    source,
    /optionsGamepadModeRef\.current = chapter04SavePromptGamepadModeRef\.current/,
  );
  assert.match(
    source,
    /chapter04ManualSaveActiveRef\.current \|\|\s*chapter04SaveCheckpointResolveRef\.current !== null/,
  );
});

test("Debug 快進抵達章末時可明確存檔，成功進入第四章後解除存檔隔離", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const blockedReasonStart = source.indexOf("const getManualSaveBlockedReason = () => {");
  const blockedReasonEnd = source.indexOf("const setSelectedSaveSlotIndexValue", blockedReasonStart);
  const blockedReasonSource = source.slice(blockedReasonStart, blockedReasonEnd);
  const chapterCheckpointBypass = blockedReasonSource.indexOf(
    'if (chapter04ManualSaveActiveRef.current) return "";',
  );
  const debugIsolationGuard = blockedReasonSource.indexOf(
    'if (debugSaveIsolationRef.current) return "Debug Scenario 不會寫入正式存檔。";',
  );

  assert.ok(chapterCheckpointBypass >= 0);
  assert.ok(debugIsolationGuard > chapterCheckpointBypass);

  const completionStart = source.indexOf("const completeChapter04SaveCheckpoint =");
  const completionEnd = source.indexOf("const chooseChapter04ManualSave", completionStart);
  assert.match(
    source.slice(completionStart, completionEnd),
    /debugSaveIsolationRef\.current = false/,
  );
});

test("portable save preserves scene and exact ground item positions without player transform", () => {
  const normalized = normalizeEchoesSaveData(createSave());
  assert.ok(normalized);
  assert.equal(normalized.progress.sceneId, "Scene_3");
  assert.deepEqual(normalized.progress.droppedWorldItems[0].position, { x: 123.5, y: 456.25 });
  assert.deepEqual(normalized.progress.droppedWorldItems[0].interactionPoint, {
    x: 125,
    y: 470,
    facing: "S",
  });
  assert.equal("playerPosition" in normalized.progress, false);
  assert.equal("playerFacing" in normalized.progress, false);
  assert.equal(normalized.progress.quest.quests.QUEST_TEST.objectives.OBJ_01.completed, true);
});

test("save slot ids are restricted to autosave and 25 manual slots", () => {
  assert.equal(getManualSaveSlotId(1), "slot-01");
  assert.equal(getManualSaveSlotId(25), "slot-25");
  assert.equal(isSaveDataSlotId("autosave"), true);
  assert.equal(isSaveDataSlotId("slot-25"), true);
  assert.equal(isSaveDataSlotId("slot-26"), false);
  assert.equal(isSaveDataSlotId("../slot-01"), false);
});

test("web build falls back to movable browser-session slots", async () => {
  const storage = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("local api unavailable"); };
  try {
    assert.equal(await writeSaveDataSlot("slot-03", createSave()), "browser-session");
    const loaded = await readSaveDataSlot("slot-03");
    assert.equal(loaded.backend, "browser-session");
    assert.equal(loaded.save?.progress.sceneId, "Scene_3");
    const slots = await listSaveDataSlots();
    assert.equal(slots.length, 26);
    assert.equal(slots.find((slot) => slot.slotId === "slot-03")?.exists, true);
    assert.equal(await deleteSaveDataSlot("slot-03"), "browser-session");
    assert.equal((await readSaveDataSlot("slot-03")).save, null);
    await assert.rejects(() => deleteSaveDataSlot("autosave"));
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
  }
});

test("local API write failures are surfaced instead of pretending to save in the browser", async () => {
  const storage = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: "write-failed", detail: "disk unavailable" }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
  try {
    await assert.rejects(
      () => writeSaveDataSlot("slot-04", createSave()),
      /save-data-write-500:disk unavailable/,
    );
    assert.equal(storage.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
  }
});

test("Options exposes Save first with 26 rows, delete confirmation, and gamepad navigation", async () => {
  const [source, css, ignore] = await Promise.all([
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  ]);
  assert.match(source, /type OptionsTab = "save" \| "display"/);
  assert.match(source, /\{ id: "save", label: "存檔" \}[\s\S]*\{ id: "display", label: "畫面" \}/);
  assert.match(source, /SAVE_DATA_MANUAL_SLOT_COUNT = 25|SAVE_DATA_MANUAL_SLOT_COUNT/);
  assert.match(source, /SAVE_DATA_SLOT_IDS\.map\(\(slotId, index\)/);
  assert.match(source, /mode: "delete"/);
  assert.match(source, /deleteSaveDataSlot\(dialog\.slotId\)/);
  assert.match(source, /secondaryActionPressed[\s\S]*saveDataDialogRef\.current[\s\S]*setOptionsPanelOpen\(false\)/);
  assert.match(source, /Math\.abs\(gamepadInput\.y\) >= 0\.55/);
  assert.match(source, /Math\.abs\(gamepadInput\.x\) >= 0\.55/);
  assert.match(css, /\.options-tabs[\s\S]*grid-template-columns: repeat\(5, 1fr\)/);
  assert.match(css, /\.save-data-row\[data-gamepad-selected="true"\]/);
  assert.match(css, /\.save-data-row\.is-empty[\s\S]*opacity: 0\.56/);
  assert.match(css, /\.save-data-row\.is-empty:hover,[\s\S]*data-gamepad-selected="true"[\s\S]*opacity: 0\.9/);
  assert.match(css, /\.save-data-heading\s*\{[^}]*position: static;/);
  assert.doesNotMatch(css, /\.save-data-heading\s*\{[^}]*position: sticky;/);
  assert.match(css, /\.options-dialog button:focus[\s\S]*outline: none/);
  assert.match(ignore, /^\/SaveData\/$/m);
});

test("runtime snapshot source never reads player coordinates or facing", async () => {
  const source = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const buildPortableSave =");
  const end = source.indexOf("const refreshSaveDataSlots", start);
  assert.notEqual(start, -1);
  const snapshotBuilder = source.slice(start, end);
  assert.doesNotMatch(snapshotBuilder, /playerPositionRef|playerFacingRef|position:/);
  assert.match(snapshotBuilder, /sceneId: SCENE_DATA\.sceneId/);
  assert.match(snapshotBuilder, /droppedWorldItems: droppedWorldItemsRef\.current/);
});
