import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { changePhototropicLamp, filterPhototropicUseRequirements, initialPhototropicState, normalizePhototropicState, plantInfluence, plantEquilibrium, plantPresentationStart, isPhototropicClear, plantAngleFromPoint, plantDialAngle, PLANT_DIAL, plantSideForInteraction, PLANT_OBJECTIVE_ID } from "../app/phototropic-puzzle.ts";
import { removeInventoryItem, loadPlayerInventory } from "../app/item-database.ts";
import { getUnmetInteractionUseRequirements } from "../app/interaction-flow.ts";
import { normalizeEchoesSaveData, applySaveDataToRuntimeStorage, SAVE_DATA_FORMAT } from "../app/save-data.ts";
import { runPhototropicInteractionFlow } from "../app/phototropic-interaction-flow.ts";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
test("interaction sides and empty initial sockets are explicit", () => {
  assert.equal(plantSideForInteraction("scene6-interaction-020"), "L"); assert.equal(plantSideForInteraction("scene6-interaction-021"), "R"); assert.equal(plantSideForInteraction("scene6-interaction-019"), null);
  const state = initialPhototropicState(); assert.equal(state.L.slot, null); assert.equal(state.R.slot, null); assert.deepEqual(plantEquilibrium(state), { left: 0, right: 0 }); assert.equal(isPhototropicClear(state), false);
});
test("120 degree fan maps both boundaries and center", () => {
  assert.equal(plantAngleFromPoint(-86.6025, -50), 0); assert.equal(plantAngleFromPoint(0, -100), 60); assert.equal(plantAngleFromPoint(86.6025, -50), 120);
  assert.equal(plantAngleFromPoint(100, 100), 120); assert.equal(plantAngleFromPoint(-100, 100), 0);
});
test("only the installed side bypasses its glowstick gate; other Items, stages and interactions retain their requirements", () => {
  const requirements = [
    { kind: "item", itemId: "T0006", quantity: 1, scope: "both" },
    { kind: "quest", questId: "QUEST_CH04_MAIN_001" },
  ];
  const state = { ...initialPhototropicState(), L: { slot: 2, angle: 95 } };
  const unmet = (id, active = true) => getUnmetInteractionUseRequirements(filterPhototropicUseRequirements(id, requirements, state), {}, 4, () => active);
  assert.equal(unmet("scene6-interaction-020").length, 0);
  assert.equal(unmet("scene6-interaction-021")[0].itemId, "T0006");
  assert.equal(unmet("scene6-interaction-019")[0].itemId, "T0006");
  assert.equal(unmet("scene6-interaction-020", false)[0].kind, "quest");
  const otherItem = { kind: "item", itemId: "R0036", quantity: 1 };
  assert.deepEqual(filterPhototropicUseRequirements("scene6-interaction-020", [...requirements, otherItem], state), [requirements[1], otherItem]);
  assert.equal(filterPhototropicUseRequirements("scene6-interaction-021", requirements, state), requirements);
});
test("partial portable saves restore the inventory debit and each installed slot together without charging on restoration", () => {
  let inventory = { T0006: 2, R0020: 5 }, state = initialPhototropicState(), debits = 0;
  const consume = () => { inventory = removeInventoryItem(inventory, "T0006", 1); debits++; return true; };
  const storage = new Map(), previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  try {
    for (const [side, slot, angle] of [["R", 2, 101], ["L", 1, 82]]) {
      state = changePhototropicLamp(state, side, slot, angle, consume);
      const candidate = { format: SAVE_DATA_FORMAT, schemaVersion: 1, summary: {}, progress: { sceneId: "Scene_6", quest: { schemaVersion: 1, quests: {} }, phototropic: state, inventory } };
      const save = normalizeEchoesSaveData(JSON.parse(JSON.stringify(candidate)));
      applySaveDataToRuntimeStorage(save);
      assert.deepEqual(save.progress.phototropic, state);
      assert.deepEqual(loadPlayerInventory(), inventory);
      assert.equal(save.progress.phototropic.solved, false, "partial save does not complete a puzzle");
      const moved = changePhototropicLamp(save.progress.phototropic, side, 0, 39, () => assert.fail("loaded installation cannot charge again"));
      assert.equal(moved[side].slot, 0);
    }
    assert.equal(debits, 2); assert.equal(inventory.T0006 ?? 0, 0);
  } finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});
test("production routes every placement to the inventory transaction and captures an immediate portable snapshot", () => {
  const runtime = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(runtime, /onChange=\{\(slot, angle\) => plantController\.update\(plantPuzzle\.view!\.id, slot, angle\)\}/);
  assert.match(runtime, /removeInventoryItem\(current, PLANT_GLOW_STICK_ITEM_ID, 1\)/);
  assert.match(runtime, /filterPhototropicUseRequirements\(interactable\.id,[\s\S]*?plantController\.state\)/);
  assert.match(runtime, /if \(reason === "phototropic-inserted"\) write\(\)/);
});
test("dial keeps its angle near the pivot and off-center grabs retain the full range", () => {
  assert.equal(plantDialAngle(PLANT_DIAL.x, PLANT_DIAL.y, 93), 93);
  assert.equal(plantDialAngle(PLANT_DIAL.x - 12, PLANT_DIAL.y + 8, 41), 41);
  const pointAt = angle => {
    const radians = (angle - 60) * Math.PI / 180;
    return [PLANT_DIAL.x + Math.sin(radians) * 100, PLANT_DIAL.y - Math.cos(radians) * 100];
  };
  assert.equal(plantDialAngle(...pointAt(74), 60, -14), 60);
  assert.equal(plantDialAngle(...pointAt(134), 60, -14), 120);
  assert.equal(plantDialAngle(...pointAt(-14), 60, 14), 0);
});
test("both lights influence both plants and equilibrium never accumulates", () => {
  const state = initialPhototropicState(); state.L = { slot: 0, angle: 40 };
  const first = plantEquilibrium(state); assert.deepEqual(first, { left: -43, right: -11 });
  assert.deepEqual(plantEquilibrium(state), first);
  state.R = { slot: 0, angle: 40 }; assert.deepEqual(plantEquilibrium(state), { left: -32, right: 32 }); assert.equal(isPhototropicClear(state), true);
  state.R.angle = 120; assert.equal(isPhototropicClear(state), false);
  assert.notDeepEqual(plantInfluence({ slot: 2, angle: 90 }), plantInfluence({ slot: 2, angle: 120 }));
});
test("restoration clamps malformed values without inventing a solution", () => {
  assert.deepEqual(normalizePhototropicState(undefined), initialPhototropicState());
  const state = normalizePhototropicState({ L: { slot: 9, angle: -30 }, R: { slot: 2, angle: 180 }, solved: true });
  assert.deepEqual(state.L, { slot: null, angle: 0 }); assert.deepEqual(state.R, { slot: 2, angle: 120 }); assert.equal(state.solved, false);
});
test("portable saves preserve both lamps; legacy saves restore empty sockets", () => {
  const state = { L: { slot: 0, angle: 40 }, R: { slot: 0, angle: 40 }, solved: true, introduced: true };
  const candidate = { format: SAVE_DATA_FORMAT, schemaVersion: 1, summary: {}, progress: { sceneId: "Scene_6", quest: { schemaVersion: 1, quests: {} }, phototropic: state } };
  const save = normalizeEchoesSaveData(candidate); assert.deepEqual(save.progress.phototropic, state);
  const storage = new Map(); globalThis.window = { localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) } };
  try { applySaveDataToRuntimeStorage(save); assert.deepEqual(JSON.parse(storage.get("echoes:phototropic-puzzle:v1")), state); } finally { delete globalThis.window; }
  delete candidate.progress.phototropic; assert.deepEqual(normalizeEchoesSaveData(candidate).progress.phototropic, initialPhototropicState());
});
test("entrance is shared by both interactions and reopening resumes saved light equilibrium", () => {
  assert.deepEqual(plantPresentationStart(initialPhototropicState()), { playEntrance: true, position: { left: 0, right: 0 } });
  for (const firstSide of ["L", "R"]) {
    const state = initialPhototropicState(); state.introduced = true;
    // Returning without inserting anything still consumes the first entrance.
    assert.equal(plantPresentationStart(normalizePhototropicState(state)).playEntrance, false);
    state[firstSide] = { slot: 1, angle: 110 };
    const restored = normalizePhototropicState(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(plantPresentationStart(restored), { playEntrance: false, position: plantEquilibrium(state) });
    // Migrate old saves, regardless of which interaction was used first.
    delete state.introduced;
    assert.equal(normalizePhototropicState(state).introduced, true);
  }
  const ui = readFileSync(new URL("../app/phototropic-puzzle-ui.tsx", import.meta.url), "utf8");
  assert.match(ui, /const position = \{ \.\.\.presentation\.position \}/);
  assert.match(ui, /data-play-entrance=\{presentation\.playEntrance\}/);
  assert.match(ui, /useLayoutEffect\(\(\) => \{\s*const vines = createPlantVines/);
  assert.match(ui, /introducedRef\.current\?\.\(\)/);
  assert.match(ui, /markIntroduced\(\)[\s\S]*?persist\(\)/);
  const css = readFileSync(new URL("../app/phototropic-puzzle.css", import.meta.url), "utf8");
  assert.match(css, /\[data-play-entrance=false\] \.plant-vines\{animation:plant-vine-in 500ms/);
  assert.match(css, /@keyframes plant-vine-in\{from\{opacity:0\}to\{opacity:1\}\}/);
});
test("socket placement, 8px chamfers and B glyph follow the requested UI contract", () => {
  const css = readFileSync(new URL("../app/phototropic-puzzle.css", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../app/phototropic-puzzle-ui.tsx", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(css, /\.plant-controls-heading\{position:absolute;top:19\.4%;/);
  assert.match(css, /\.plant-controls-unframed \.plant-slots\{position:absolute;top:65\.6%;/);
  assert.match(css, /--item-shape: polygon\(8px 0, calc\(100% - 8px\)/);
  assert.match(css, /clip-path: polygon\(evenodd, 8px 0/);
  assert.match(css, /aspect-ratio: 1;/);
  assert.match(css, /\.plant-panel \.plant-slots button::before \{[^}]*opacity: \.75;[^}]*#07131c;/);
  assert.match(css, /--hud-mid: #e4b64d;/);
  assert.match(css, /bottom: calc\(50% - var\(--plant-stick-size\) \* \.25\);/);
  assert.doesNotMatch(ui, /className="plant-base"|已插入|空槽/);
  assert.match(runtime, /gamepadMode=\{questPromptInputMode === "gamepad"\}/);
});
test("production integration blocks the world and unlocks the plant objective only after OBJ18 completion", () => {
  const runtime = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(runtime, /const isWorldInteractionBlockedByUi = \(\) =>\s*plantController.isOpen/);
  assert.match(runtime, /plantController\.open\(side, imagePath\)/);
  const quests = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
  const objective = quests.quests.flatMap(q => q.stages).flatMap(s => s.objectives).find(o => o.id === PLANT_OBJECTIVE_ID);
  assert.equal(objective.activationMode, "objectiveCompleted"); assert.equal(objective.activationEventId, "QUEST_CH04_MAIN_001_OBJ_18");
});
test("dialogue completes before puzzle opens; cancelled dialogue never opens controls", async () => {
  for (const completed of [true, false]) {
    const events = [];
    await runPhototropicInteractionFlow(async () => { events.push("dialogue"); return { completed }; }, {
      showBackground() { events.push("background"); }, hideBackground() { events.push("hide"); },
      async openPuzzle() { events.push("puzzle"); return true; }, cancelPuzzle() { events.push("cleanup"); },
    }, () => events.push("complete"));
    assert.deepEqual(events, completed ? ["background", "dialogue", "puzzle", "hide", "complete", "hide", "cleanup"] : ["background", "dialogue", "hide", "cleanup"]);
  }
});
test("flow exceptions always release both blocking overlays", async () => {
  const events = [];
  await assert.rejects(runPhototropicInteractionFlow(async () => { throw Error("cancelled"); }, {
    showBackground() {}, hideBackground() { events.push("hide"); }, async openPuzzle() { return false; }, cancelPuzzle() { events.push("cleanup"); },
  }, () => assert.fail("completion must not run")), /cancelled/);
  assert.deepEqual(events, ["hide", "cleanup"]);
});
test("plant objective completion respects its activation gate", () => {
  const quests = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
  const quest = quests.quests.find(q => q.id === "QUEST_CH04_MAIN_001");
  const stage = quest.stages.find(s => s.objectives.some(o => o.id === PLANT_OBJECTIVE_ID));
  const objective = stage.objectives.find(o => o.id === PLANT_OBJECTIVE_ID);
  const document = { ...quests, quests: [{ ...quest, stages: [{ ...stage, startEventFlowId: "", completionEventFlowId: "", nextStageId: "", objectives: [objective] }] }] };
  const manager = new QuestRuntimeManager(document, {});
  manager.startQuest(quest.id);
  assert.equal(manager.completeObjective(quest.id, objective.id), false);
  assert.equal(manager.activateObjective(objective.id), true);
  assert.equal(manager.completeObjective(quest.id, objective.id), true);
  assert.equal(manager.exportSave().quests[quest.id].objectives[objective.id].completed, true);
});
