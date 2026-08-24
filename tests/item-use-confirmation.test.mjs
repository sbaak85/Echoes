import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatItemUseActionEffect,
  moveItemUseConfirmationChoice,
  resolveItemUseActionVerb,
} from "../app/item-use-confirmation.ts";

test("使用動詞可自訂，空白設定回退為使用", () => {
  assert.equal(resolveItemUseActionVerb(" 打開 "), "打開");
  assert.equal(resolveItemUseActionVerb("拆除"), "拆除");
  assert.equal(resolveItemUseActionVerb(""), "使用");
  assert.equal(resolveItemUseActionVerb(undefined), "使用");
});

test("useAction 在道具資訊中顯示自訂動詞、產物名稱與數量", () => {
  const itemNames = new Map([
    ["R0009", "金屬碎片"],
    ["T0007", "銲槍工具"],
  ]);
  const resolveItemName = (itemId) => itemNames.get(itemId);

  assert.equal(
    formatItemUseActionEffect(
      {
        verb: "拆解",
        rewards: [{ itemId: "R0009", quantity: 3 }],
      },
      resolveItemName,
    ),
    "可拆解成　金屬碎片+3",
  );
  assert.equal(
    formatItemUseActionEffect(
      {
        verb: "打開",
        rewards: [{ itemId: "T0007", quantity: 1 }],
      },
      resolveItemName,
    ),
    "可打開成　銲槍工具+1",
  );

  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(source, /hasConfiguredInventoryItemInformationEffect\(selectedInventoryItem\)/);
  assert.match(source, /formatInventoryItemInformationEffect\(selectedInventoryItem\)/);
  assert.match(source, /if \(useActionEffect\) return useActionEffect/);
  assert.match(source, /\? `生存影響　\$\{survivalEffect\}`/);
  assert.doesNotMatch(
    source,
    /生存影響　\{formatInventoryItemInformationEffect\(selectedInventoryItem\)\}/,
  );
  assert.match(styles, /\.inventory-survival-effects\.is-configured[\s\S]*background:/);
});

test("確認視窗的兩個按鈕支援左右循環選擇", () => {
  assert.equal(moveItemUseConfirmationChoice("cancel", 1), "confirm");
  assert.equal(moveItemUseConfirmationChoice("confirm", 1), "cancel");
  assert.equal(moveItemUseConfirmationChoice("cancel", -1), "confirm");
  assert.equal(moveItemUseConfirmationChoice("confirm", -1), "cancel");
  assert.equal(moveItemUseConfirmationChoice("cancel", 0), "cancel");
});

test("背包與快捷列共用 useAction 確認入口，確認後才規劃生成與消耗", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const executionStart = source.indexOf("function executeInventoryItemUseAction");
  const executionEnd = source.indexOf("function openItemUseConfirmation", executionStart);
  const executionSource = source.slice(executionStart, executionEnd);

  assert.match(source, /activateHotbarItem[\s\S]*useInventoryItem\(item\.id, slotIndex\)/);
  assert.match(source, /activateInventoryItem[\s\S]*useInventoryItem\(item\.id, -1\)/);
  assert.match(source, /if \(item\.useAction\) \{[\s\S]*openItemUseConfirmation/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /autoFocus/);
  assert.match(source, /trigger\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /確認\{itemUseConfirmationVerb\}/);
  assert.match(source, /confirmItemUseAction\(\)/);
  assert.match(source, /moveItemUseConfirmationChoice/);
  assert.match(source, /itemUseConfirmationChoiceRef\.current === "confirm"/);
  assert.ok(
    executionSource.indexOf("findSpawnedWorldItemPlacement") <
      executionSource.indexOf("removeInventoryItem"),
  );
  assert.match(executionSource, /createdFromInventory: false/);
  assert.match(
    executionSource,
    /for \(let instanceIndex = 0; instanceIndex < reward\.quantity; instanceIndex \+= 1\)/,
  );
  assert.match(executionSource, /quantity: 1,[\s\S]*createdFromInventory: false/);
  assert.doesNotMatch(
    executionSource,
    /itemId: reward\.item\.id,[\s\S]{0,80}quantity: reward\.quantity/,
  );
  assert.match(executionSource, /item-use:\$\{SCENE_DATA\.sceneId\}/);
  assert.match(executionSource, /saveDroppedWorldItems\(nextDroppedWorldItems\)/);
  assert.match(executionSource, /publishItemUsedQuestEvent\(item\.id\)/);
});

test("只有成功生成地面 useAction 產物時才關閉背包，純生存道具保持開啟", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const executionStart = source.indexOf("function executeInventoryItemUseAction");
  const executionEnd = source.indexOf("function openItemUseConfirmation", executionStart);
  const executionSource = source.slice(executionStart, executionEnd);
  const worldSpawnStart = executionSource.indexOf("if (plannedWorldItems.length > 0)");
  const worldSpawnEnd = executionSource.indexOf("publishItemUsedQuestEvent", worldSpawnStart);
  const worldSpawnSource = executionSource.slice(worldSpawnStart, worldSpawnEnd);

  assert.ok(worldSpawnStart >= 0, "應只在實際有地面產物時進入生成流程");
  assert.match(worldSpawnSource, /applyDroppedWorldItems\(nextDroppedWorldItems\)/);
  assert.match(worldSpawnSource, /setInventoryPanelOpen\(false\)/);

  const survivalUseStart = source.indexOf("function useInventoryItem");
  const survivalUseEnd = source.indexOf("const getHotbarSlotAtPoint", survivalUseStart);
  const survivalUseSource = source.slice(survivalUseStart, survivalUseEnd);

  assert.ok(survivalUseStart >= 0, "應能找到食品與生存數值道具的使用流程");
  assert.doesNotMatch(survivalUseSource, /setInventoryPanelOpen\(false\)/);
});

test("確認視窗隱藏原生 focus，並保留遊戲自訂選取狀態", () => {
  const styles = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(styles, /\.item-use-confirmation-actions button:focus-visible[\s\S]*outline: none/);
  assert.match(styles, /\.scene-connection-confirmation-actions button\.is-selected/);
});

test("useAction 與任務投入共用 Item 變化圖示，通訊陣列採用 240px 目標圖", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const targetIcon = readFileSync(
    new URL(
      "../public/ui/interactions/communication-array-tower-icon.png",
      import.meta.url,
    ),
  );

  assert.match(source, /function ItemChangeVisualization/);
  assert.match(source, /sources=\{itemUseConfirmationSources\}/);
  assert.match(source, /targets=\{itemUseConfirmationTargets\}/);
  assert.match(source, /sources=\{questItemSubmissionSources\}/);
  assert.match(source, /targets=\{questItemSubmissionTargets\}/);
  assert.match(source, /communication-array-tower-icon\.png/);
  assert.match(source, /requirement\.completed[\s\S]*"submitted"/);
  assert.match(source, /"available"[\s\S]*"missing"/);
  assert.match(styles, /\.item-change-visual-card\.is-missing/);
  assert.match(styles, /\.item-change-visual-card\.is-submitted/);
  assert.match(styles, /\.item-change-visual-check/);
  assert.equal(targetIcon.readUInt32BE(16), 240);
  assert.equal(targetIcon.readUInt32BE(20), 240);
});

test("道具轉換數量置於框外，任務投入放大框內數量與自適應名稱", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(source, /quantityPlacement\?: ItemChangeQuantityPlacement/);
  assert.match(source, /quantityPlacement="outside"/);
  assert.match(
    source,
    /entry\.quantity && quantityPlacement === "outside"[\s\S]*item-change-visual-quantity is-outside/,
  );
  assert.match(
    source,
    /entry\.quantity && quantityPlacement === "inside"[\s\S]*item-change-visual-quantity/,
  );
  assert.match(
    styles,
    /\.item-change-visual-card > \.item-change-visual-quantity\.is-outside[\s\S]*font-size:\s*30px/,
  );
  assert.match(
    styles,
    /\.quest-item-submission-visualization \.item-change-visual-icon > \.item-change-visual-quantity[\s\S]*font-size:\s*18px/,
  );
  assert.match(
    styles,
    /\.quest-item-submission-visualization \.item-change-visual-card > small[\s\S]*font-size:\s*clamp\(10px, 14cqi, 16px\)/,
  );
  assert.match(
    styles,
    /\.item-use-change-visualization \.item-change-visual-card > small[\s\S]*font-size:\s*16px/,
  );
  assert.match(
    styles,
    /\.item-change-visual-card\.has-outside-quantity\s*\{[\s\S]*?"icon quantity"[\s\S]*?"label \."/,
  );
  assert.match(
    styles,
    /\.item-use-change-visualization \.item-change-visual-card > small\s*\{[\s\S]*?width:\s*max-content;/,
  );
});

test("任務投入目前持有列出全部需求道具及各自背包數量", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /questItemSubmissionPrompt\.requirements[\s\S]*requirement\.itemName[\s\S]*playerInventory\[requirement\.itemId\][\s\S]*\.join\("　／　"\)/,
  );
  assert.match(source, /`目前持有：\$\{questItemSubmissionInventoryText\}`/);
  assert.doesNotMatch(
    source,
    /`目前持有：\$\{questItemSubmissionPrompt\.itemName\}/,
  );
});

test("任務最後一項投入後先顯示完成勾選，再延遲關閉視窗", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const flowStart = source.indexOf("const showQuestItemSubmissionPrompt");
  const flowEnd = source.indexOf(
    "const openQuestItemSubmissionConfirmation",
    flowStart,
  );
  const flowSource = source.slice(flowStart, flowEnd);

  assert.ok(flowStart >= 0 && flowEnd > flowStart);
  assert.match(flowSource, /const refreshedRequirements = prompt\.requirements\.map/);
  assert.match(flowSource, /completed: questManager\.getObjectiveProgress/);
  assert.match(
    flowSource,
    /if \(remaining\.length === 0\) \{[\s\S]*setQuestItemSubmissionPrompt\(\{[\s\S]*requirements: refreshedRequirements/,
  );
  assert.match(
    flowSource,
    /questItemSubmissionCompletingRef\.current = true[\s\S]*window\.setTimeout\(\(\) => \{[\s\S]*closeCampPowerConfirmation\(true\)[\s\S]*completeInteraction[\s\S]*QUEST_ITEM_SUBMISSION_COMPLETION_PREVIEW_MS/,
  );
  assert.match(
    flowSource,
    /showQuestItemSubmissionPrompt\(\{[\s\S]*requirements: refreshedRequirements/,
  );

  assert.match(source, /disabled=\{questItemSubmissionCompleting\}/);
  assert.match(
    source,
    /questItemSubmissionCompleting \|\| !canConfirmQuestItemSubmission/,
  );
  assert.match(
    flowSource,
    /confirmCampPowerRefillRef\.current = \(\) => \{[\s\S]*if \(questItemSubmissionCompletingRef\.current\) return/,
  );
  assert.match(
    source,
    /const closeCampPowerConfirmation = \(force = false\)[\s\S]*questItemSubmissionCompletingRef\.current && !force/,
  );
});

test("滑鼠開啟 useAction 確認視窗時，已連線但閒置的手把不會搶走游標", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /itemUseConfirmationCursorShownForSession/);
  assert.doesNotMatch(
    source,
    /itemUseConfirmationOpenRef\.current[\s\S]{0,180}gamepadInput\.connected[\s\S]{0,180}activateGamepadCursor\(\)/,
  );
  assert.match(
    source,
    /cursorInputLength >= OPTIONS_CURSOR_TAKEOVER_THRESHOLD[\s\S]*itemUseConfirmationGamepadModeRef\.current = "cursor"/,
  );
});
