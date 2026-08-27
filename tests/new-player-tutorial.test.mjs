import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  NEW_PLAYER_TUTORIAL_STEPS,
  getNextNewPlayerTutorialStep,
  getNewPlayerTutorialStep,
} from "../app/new-player-tutorial.ts";

const source = await readFile(
  new URL("../app/movement-lab.tsx", import.meta.url),
  "utf8",
);
const overlaySource = await readFile(
  new URL("../app/new-player-tutorial-overlay.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("四個新手指引孔位與提示內容依照示意圖固定記錄", () => {
  assert.deepEqual(
    NEW_PLAYER_TUTORIAL_STEPS.map((step) => ({
      id: step.id,
      selector: step.targetSelector,
      placement: step.hintPlacement,
      shape: step.spotlightShape,
      action: step.actionLabel,
    })),
    [
      { id: "quest", selector: ".quest-hud", placement: "left", shape: "rectangle", action: "繼續" },
      { id: "survival", selector: ".survival-hud", placement: "right", shape: "rectangle", action: "繼續" },
      { id: "hotbar", selector: ".hotbar-slots", placement: "above", shape: "rectangle", action: "繼續" },
      { id: "minimap", selector: ".minimap-hud", placement: "left", shape: "circle", action: "結束" },
    ],
  );
  assert.equal(
    getNewPlayerTutorialStep("quest").message,
    "當主要故事推動時，可經由此任務提示介面\n了解當前應該進行的事項。",
  );
  assert.equal(
    getNewPlayerTutorialStep("survival").message,
    "想在異星生存必須隨時注意身體狀況，\n關注生存計量介面以滿足身體機能所需。",
  );
  assert.equal(
    getNewPlayerTutorialStep("hotbar").message,
    "可以將背包中的東西加入快捷使用介面，\n在此按下 [Y] 即可快速使用該道具。",
  );
  assert.equal(
    getNewPlayerTutorialStep("minimap").message,
    "可以透過小地圖介面了解活動地圖，\n若出現重要道具會以光點標示位置。",
  );
  assert.ok(
    NEW_PLAYER_TUTORIAL_STEPS.every((step) => step.spotlightPadding <= 4),
    "開孔應縮小並貼合目標 HUD",
  );
});

test("第一個主線任務延後一秒啟用四段連續教學", () => {
  const questStartedSource = source.slice(
    source.indexOf("onQuestStarted:"),
    source.indexOf("onObjectiveCompleted:"),
  );
  assert.match(
    questStartedSource,
    /questId === FIRST_MAIN_QUEST_ID[\s\S]*?triggerQuestHudVisual\("accepted", view\)[\s\S]*?startNewPlayerQuestTutorial\(\)/,
  );
  const startSource = source.slice(
    source.indexOf("const startNewPlayerQuestTutorial"),
    source.indexOf("const [dialogueView"),
  );
  assert.match(startSource, /newPlayerTutorialOpenRef\.current = true/);
  assert.match(startSource, /setNewPlayerTutorialStep\(null\)/);
  assert.match(startSource, /window\.setTimeout\([\s\S]*?setNewPlayerTutorialStep\("quest"\)[\s\S]*?1000/);
  assert.equal(getNextNewPlayerTutorialStep("quest")?.id, "survival");
  assert.equal(getNextNewPlayerTutorialStep("survival")?.id, "hotbar");
  assert.equal(getNextNewPlayerTutorialStep("hotbar")?.id, "minimap");
  assert.equal(getNextNewPlayerTutorialStep("minimap"), null);
  assert.match(source, /const advanceNewPlayerTutorial = \(\) => \{[\s\S]*?getNextNewPlayerTutorialStep/);
});

test("遮罩為 70% 黑、柔邊開孔，提示框會呼吸發亮", () => {
  assert.match(overlaySource, /fill="rgba\(0, 0, 0, 0\.7\)"/);
  assert.match(overlaySource, /feGaussianBlur stdDeviation="10"/);
  assert.match(overlaySource, /step\.spotlightShape === "circle"/);
  assert.match(overlaySource, /target\.getBoundingClientRect|spotlight\.x/);
  assert.match(styles, /\.new-player-tutorial-overlay\s*{[\s\S]*?z-index:\s*100;[\s\S]*?pointer-events:\s*auto/);
  assert.match(styles, /new-player-tutorial-overlay-in 300ms/);
  assert.match(styles, /new-player-tutorial-hint-breathe 1\.8s/);
  assert.match(styles, /@keyframes new-player-tutorial-hint-breathe/);
  assert.match(styles, /\.new-player-tutorial-hint\s*{[\s\S]*?rgba\(11, 39, 43, 0\.97\)/);
  assert.match(styles, /\.new-player-tutorial-hint > span\s*{[\s\S]*?white-space:\s*pre-line/);
  assert.match(styles, /\.new-player-tutorial-hint > span\s*{[\s\S]*?font-size:\s*16px/);
  assert.match(styles, /\.new-player-tutorial-hint > span\s*{[\s\S]*?font-weight:\s*400/);
  assert.match(styles, /\.new-player-tutorial-hint > strong > span\s*{\s*color:\s*#f2fbfa/);
  assert.match(styles, /\.new-player-tutorial-hint > strong\s*{[\s\S]*?font-weight:\s*400/);
  assert.match(styles, /new-player-tutorial-prompt-breathe 1\.25s/);
  assert.match(styles, /@keyframes new-player-tutorial-prompt-breathe/);
});

test("教學期間封鎖世界與角色，空白鍵或手把 A 每次只前進一步", () => {
  const keyboardGuard = source.slice(
    source.indexOf("if (newPlayerTutorialOpenRef.current && key !== \"escape\")"),
    source.indexOf(
      "key === \"tab\"",
      source.indexOf("if (newPlayerTutorialOpenRef.current && key !== \"escape\")"),
    ),
  );
  const tutorialGamepadBranch = source.slice(
    source.indexOf("} else if (newPlayerTutorialMenuOpen)"),
    source.indexOf("} else if (inventoryMenuOpen)"),
  );
  assert.match(source, /const isWorldInteractionBlockedByUi = \(\) =>[\s\S]*?newPlayerTutorialOpenRef\.current/);
  assert.match(source, /storyInputLockedRef\.current \|\|\s*newPlayerTutorialOpenRef\.current \|\|\s*timePassInputLockedRef\.current/);
  assert.match(keyboardGuard, /event\.code === "Space" && !event\.repeat/);
  assert.match(keyboardGuard, /advanceNewPlayerTutorial\(\)/);
  assert.match(tutorialGamepadBranch, /gamepadInput\.confirmPressed/);
  assert.match(tutorialGamepadBranch, /!wasGamepadConfirmPressed/);
  assert.match(tutorialGamepadBranch, /advanceNewPlayerTutorial\(\)/);
  assert.match(tutorialGamepadBranch, /virtualCursorVisible = false/);
  assert.match(tutorialGamepadBranch, /deactivateGamepadCursor\(\)/);
  assert.doesNotMatch(tutorialGamepadBranch, /secondaryActionPressed|actionPressed/);
  const advanceSource = source.slice(
    source.indexOf("const advanceNewPlayerTutorial"),
    source.indexOf("const startNewPlayerQuestTutorial"),
  );
  assert.match(advanceSource, /audioEventManagerRef\.current/);
  assert.match(advanceSource, /\.play\("uiInput", \{ restart: true \}\)/);
});

test("教學遮罩開啟時 Options 仍可用且位於遮罩上方", () => {
  assert.match(source, /startJustPressed[\s\S]*?toggleOptionsPanel\(\)/);
  assert.match(
    source,
    /if \(key === "escape"\)[\s\S]*?newPlayerTutorialOpenRef\.current[\s\S]*?setOptionsPanelOpen\(!optionsOpenRef\.current\)/,
  );
  assert.match(styles, /\.game-shell\.is-new-player-tutorial \.options-trigger\s*{\s*z-index:\s*121;/);
  assert.match(styles, /\.options-overlay\s*{[\s\S]*?z-index:\s*120;/);
});
