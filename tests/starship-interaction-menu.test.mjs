import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [movementSource, menuSource, scene] = await Promise.all([
  readFile(new URL("app/movement-lab.tsx", root), "utf8"),
  readFile(new URL("app/starship-interaction-menu.tsx", root), "utf8"),
  readFile(new URL("public/maps/map_test01.scene.json", root), "utf8").then(JSON.parse),
]);

test("craft view separates item and cooking workbenches in matching placeholder panels", () => {
  const craftView = menuSource.slice(menuSource.indexOf('{view === "craft" ? <>'), menuSource.indexOf('{view === "repair" ? <div'));
  assert.equal((craftView.match(/className="im-craft-empty"/g) ?? []).length, 2);
  assert.ok(craftView.indexOf("製作工作台") < craftView.indexOf("料理工作台"));
  assert.match(craftView, /道具的配方將在這裡顯示/);
  assert.match(craftView, /食物與飲品的配方將在這裡顯示/);
  assert.doesNotMatch(craftView, /<button|data-starship-menu-index/);
});

test("scene3 interaction 029 retains its quest gate and available dialogue", () => {
  const interaction = scene.interactables.find(({ id }) => id === "scene3-interaction-029");
  assert.ok(interaction);
  assert.ok(interaction.dialogue.lines.some(({ text }) => text.trim().length > 0));
  assert.ok(interaction.useRequirements.some(requirement =>
    requirement.kind === "questStage" &&
    requirement.questId === "QUEST_CH04_MAIN_001" &&
    requirement.stageId === "QUEST_CH04_MAIN_001_STAGE_01"
  ));
});

test("the menu opens from interaction completion after the dialogue callback", () => {
  assert.match(
    movementSource,
    /const completeTriggeredInteraction = \(\) => completeInteraction\([\s\S]*?STARSHIP_INTERACTION_MENU_INTERACTION_ID[\s\S]*?openStarshipInteractionMenu/,
  );
  assert.match(
    movementSource,
    /if \(hasDialogueSequence\) \{\s*openDialogue\(interactable, completeTriggeredInteraction\)/,
  );
});

test("the formal menu starts on the four-option screen and cancel closes it directly", () => {
  assert.match(menuSource, /useState<View>\("main"\)/);
  assert.match(menuSource, /useState\(0\)/);
  assert.match(menuSource, /取消／返回/);
  assert.match(menuSource, /onClick=\{\(\) => activate\(onClose\)\}/);
  assert.doesNotMatch(menuSource, /"closed"/);
});

test("the blocking menu supports keyboard, gamepad and touch ownership", () => {
  assert.match(menuSource, /ArrowLeft:[\s\S]*ArrowRight:[\s\S]*ArrowUp:[\s\S]*ArrowDown:/);
  assert.match(menuSource, /StarshipInteractionMenuController/);
  assert.match(menuSource, /setControlMode: \(mode: StarshipInteractionControlMode\)/);
  assert.match(menuSource, /event\.pointerType === "touch" \? "mobile" : "keyboard-mouse"/);
  assert.match(movementSource, /activateStarshipInteractionCursorMode/);
  assert.match(movementSource, /activateVirtualCursorUi\(\)/);
  assert.match(movementSource, /starshipInteractionMenuInputRearmRef\.current[\s\S]*hasHeldMenuInput/);
});

test("selection, confirm and back use the central InPut audio event", () => {
  assert.match(movementSource, /playStarshipInteractionInput[\s\S]*audioEvents\.play\("uiInput"/);
  assert.match(menuSource, /if \(next !== previous\) onInput\(\)/);
  assert.match(menuSource, /const back = useCallback\([\s\S]*onInput\(\)/);
  assert.match(menuSource, /const activate = \(action: \(\) => void\) => \{\s*onInput\(\)/);
});

test("the hero room title follows the selected main option", () => {
  for (const title of ["飛船休息艙", "工作甲板", "輪機室", "離開伊薩卡號"]) {
    assert.match(menuSource, new RegExp(title));
  }
  assert.match(menuSource, /view === "repair" \? "維修飛船" : mainTitle/);
});

test("opening input lock releases while the starship menu remains open", () => {
  const start = movementSource.indexOf("      if (starshipInteractionMenuInputRearmRef.current) {");
  const end = movementSource.indexOf("      const acceleratedWalkActive", start);
  const run = new Function("starshipInteractionMenuInputRearmRef", "gamepadInput",
    "starshipInteractionMenuOpenRef", "starshipInteractionControlModeRef",
    "deactivateGamepadCursor", "activateGamepadCursor", "setGamepadInputCursorHidden",
    "updateFootstepAudio", "deltaTime",
    "let virtualCursorVisible = false;" + movementSource.slice(start, end));
  const rearm = { current: true };
  const neutral = { stickX: 0, stickY: 0, dpadX: 0, dpadY: 0 };
  const noop = () => {};
  const frame = input => run(rearm, input, { current: true }, { current: "directional" },
    noop, noop, noop, noop, 1 / 60);
  frame({ ...neutral, confirmPressed: true });
  assert.equal(rearm.current, true);
  frame(neutral);
  assert.equal(rearm.current, false, "neutral input must release the lock even with the menu open");
});
