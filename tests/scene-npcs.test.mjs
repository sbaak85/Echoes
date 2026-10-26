import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NPC_DIRECTIONS, normalizeNpcCatalog, getSceneNpcRenderData,
  isSceneNpcVisible, sortSceneActors, collectSceneNpcs, isSceneNpcPresent,
  facingToward, stepFacing, getBreathingScale, isPointOnNpcBody, getNpcBodyHeight,
} from "../app/scene-npcs.ts";
import { resolvePublicAssetUrl } from "../app/public-asset-url.ts";
import { evaluateInteractionStageRequirement } from "../app/interaction-flow.ts";

const sprite = { file: "characters/idle/蕾娜/04_SE_FrontRight.png", width: 570, height: 720, anchorX: 264, anchorY: 596, bodyHeight: 514 };
const catalog = normalizeNpcCatalog({ version: 1, defaultHeight: 152, characters: [{ id: "rena", name: "蕾娜", sprites: { SE: sprite } }] });
const npc = { characterId: "rena", x: 420, y: 900, facing: "SE", scale: 1 };
const gate = { kind: "questStage", questId: "Q", stageId: "start", stageMode: "UnlockUntilCondition", disableQuestId: "Q", disableStageId: "close", removeQuestId: "Q", removeStageId: "remove" };
function query(stage, objectives = new Set()) {
  const stages = ["before", "start", "close", "remove"];
  return {
    isQuestAtStage: (quest, wanted) => quest === "Q" && wanted === stage,
    hasQuestReachedStage: (quest, wanted) => quest === "Q" && stages.indexOf(stage) >= stages.indexOf(wanted),
    hasObjectiveReachedState: (quest, objective, state) => quest === "Q" && objectives.has(`${objective}:${state}`),
  };
}

test("NPC activation, closing and removal are three distinct stages", () => {
  assert.equal(isSceneNpcVisible([gate], query("before")), false);
  assert.equal(isSceneNpcVisible([gate], query("start")), true);
  assert.equal(isSceneNpcVisible([gate], query("close")), true);
  const closed = query("close");
  assert.equal(evaluateInteractionStageRequirement(gate, closed.isQuestAtStage, closed.hasQuestReachedStage, closed.hasObjectiveReachedState), false);
  assert.equal(isSceneNpcVisible([gate], query("remove")), false);
});

test("CurrentStageOnly, permanent unlock and activation objective preserve their semantics", () => {
  const current = { ...gate, stageMode: "CurrentStageOnly" };
  assert.equal(isSceneNpcVisible([current], query("start")), true);
  assert.equal(isSceneNpcVisible([current], query("close")), false);
  assert.equal(isSceneNpcVisible([{ ...gate, stageMode: "UnlockFromStage", removeQuestId: undefined, removeStageId: undefined }], query("remove")), true);
  const withObjective = { ...gate, objectiveId: "talk", objectiveState: "completed" };
  assert.equal(isSceneNpcVisible([withObjective], query("start")), false);
  assert.equal(isSceneNpcVisible([withObjective], query("close", new Set(["talk:completed"]))), true);
});

test("NPC appearance uses all target activation gates, not item or interaction-only success gates", () => {
  assert.equal(isSceneNpcVisible([], query("before")), true);
  assert.equal(isSceneNpcVisible([{ ...gate, scope: "interaction" }], query("before")), true);
  assert.equal(isSceneNpcVisible([{ ...gate, scope: "prompt" }], query("before")), false);
  assert.equal(isSceneNpcVisible([gate, { ...gate, stageId: "close" }], query("start")), false);
  assert.equal(isSceneNpcVisible([{ kind: "item", itemId: "anything", quantity: 50 }], query("before")), true);
  assert.equal(isSceneNpcVisible([{ ...gate, scope: "interaction" }], query("remove")), false);
});

test("independent remove objective and legacy combined remove remain supported", () => {
  const requirement = { ...gate, removeObjectiveId: "leave", removeObjectiveState: "completed" };
  assert.equal(isSceneNpcVisible([requirement], query("remove")), true);
  assert.equal(isSceneNpcVisible([requirement], query("remove", new Set(["leave:completed"]))), false);
  const legacy = { ...gate, removeQuestId: undefined, removeStageId: undefined, removeWhenDisabled: true };
  assert.equal(isSceneNpcVisible([legacy], query("start")), true);
  assert.equal(isSceneNpcVisible([legacy], query("close")), false);
});

test("full-image drawing keeps the foot anchor fixed at every scale without width distortion", () => {
  for (const scale of [0.5, 1, 4]) {
    const r = getSceneNpcRenderData({ ...npc, scale }, catalog);
    assert.ok(r);
    assert.equal(r.bodyHeight, 152 * scale);
    assert.ok(Math.abs(r.left + sprite.anchorX * r.pixelScale - npc.x) < 1e-10);
    assert.ok(Math.abs(r.top + sprite.anchorY * r.pixelScale - npc.y) < 1e-10);
    assert.ok(Math.abs(r.width / r.height - 570 / 720) < 1e-10);
  }
});

test("unknown characters, missing directions and invalid geometry skip safely", () => {
  for (const value of [null, {}, { ...npc, characterId: "unknown" }, { ...npc, facing: "N" },
    { ...npc, x: NaN }, { ...npc, y: Infinity }, { ...npc, scale: 0 }, { ...npc, scale: -1 },
    { ...npc, scale: Infinity }, { ...npc, facing: "wrong" }]) assert.equal(getSceneNpcRenderData(value, catalog), null);
  const unsafe = normalizeNpcCatalog({ version: 1, characters: [{ id: "rena", sprites: { SE: { ...sprite, file: "characters/idle/../secret.png" } } }] });
  assert.equal(getSceneNpcRenderData(npc, unsafe), null);
  assert.deepEqual(Object.keys(normalizeNpcCatalog({ version: 99 }).characters), []);
});

test("foot Y controls player/NPC order and equal-depth ties are deterministic", () => {
  const actors = [
    { id: "player", kind: "player", footY: 150 },
    { id: "near", kind: "npc", footY: 200 },
    { id: "far", kind: "npc", footY: 100 },
    { id: "same", kind: "npc", footY: 150 },
  ];
  assert.deepEqual(sortSceneActors(actors).map(a => a.id), ["far", "same", "player", "near"]);
  assert.equal(actors[0].id, "player");
});

test("shared NPC catalog includes complete real eight-direction 570x720 asset sets with shadow anchors", () => {
  const raw = JSON.parse(readFileSync(new URL("../public/characters/npc-catalog.json", import.meta.url), "utf8"));
  const normalized = normalizeNpcCatalog(raw);
  assert.equal(normalized.defaultHeight, 152);
  assert.deepEqual(Object.keys(normalized.characters).sort(), ["captain", "ian", "owen", "rena"]);
  for (const direction of NPC_DIRECTIONS) {
    // 主角站立圖的可見身高約為裁切框的 98%：NPC 100% 與主角同高
    assert.ok(normalized.bodyRatio[direction] > 0.95 && normalized.bodyRatio[direction] < 1, direction);
  }
  for (const character of Object.values(normalized.characters)) for (const direction of NPC_DIRECTIONS) {
    const asset = character.sprites[direction];
    assert.ok(asset, `${character.name} ${direction}`);
    const bytes = readFileSync(new URL(`../public/${asset.file}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), 570);
    assert.equal(bytes.readUInt32BE(20), 720);
    assert.equal(asset.width, 570); assert.equal(asset.height, 720);
    assert.ok(asset.bootAnchors, `${character.name} ${direction} boot anchors`);
    assert.equal(asset.bodyBounds.height, asset.bodyHeight);
    assert.ok(resolvePublicAssetUrl("/Echoes/", asset.file).startsWith("/Echoes/characters/idle/"));
  }
});

test("every roster folder exists and every idle character folder has a roster id", () => {
  const roster = JSON.parse(readFileSync(new URL("../public/characters/npc-roster.json", import.meta.url), "utf8"));
  const catalog = JSON.parse(readFileSync(new URL("../public/characters/npc-catalog.json", import.meta.url), "utf8"));
  assert.deepEqual(roster.characters.map(entry => entry.id), catalog.characters.map(character => character.id));
  for (const character of catalog.characters) {
    assert.ok(character.sprites.S.file.startsWith(`characters/idle/${character.folder}/`), character.id);
  }
});

const independentScene = {
  npcs: [
    { id: "npc-owen", label: "歐文", characterId: "owen", x: 100, y: 200, facing: "NE", scale: 1 },
    { id: "npc-rena", label: "蕾娜", characterId: "rena", x: 300, y: 200, facing: "S", scale: 1.05, facePlayer: false, breathing: false,
      presence: { kind: "questStage", questId: "Q", stageId: "start", stageMode: "UnlockUntilCondition", disableQuestId: "Q", disableStageId: "close" } },
    { id: "npc-owen", characterId: "owen", x: 0, y: 0, facing: "S", scale: 1 },
    { id: "broken", characterId: "owen", x: NaN, y: 0, facing: "S", scale: 1 },
  ],
  interactables: [
    { id: "talk-1", npcId: "npc-owen" }, { id: "talk-2", npcId: "npc-owen" }, { id: "talk-3", npcId: "missing" },
    { id: "legacy", label: "舊對話", npc: { characterId: "ian", x: 50, y: 60, facing: "SE", scale: 1 }, useRequirements: [gate] },
  ],
};

test("independent NPCs are shared by dialogues; duplicates, invalid NPCs and missing targets are skipped", () => {
  const { npcs, bindings } = collectSceneNpcs(independentScene);
  assert.deepEqual([...npcs.keys()], ["npc-owen", "npc-rena", "npc-legacy"]);
  assert.equal(npcs.get("npc-owen").x, 100, "first definition wins");
  assert.equal(bindings.get("talk-1"), "npc-owen");
  assert.equal(bindings.get("talk-2"), "npc-owen");
  assert.equal(bindings.has("talk-3"), false);
  assert.equal(npcs.get("npc-owen").facePlayer, true);
  assert.equal(npcs.get("npc-rena").facePlayer, false);
  assert.equal(npcs.get("npc-rena").breathing, false);
  // 舊格式轉成 npc-<互動區ID>，沿用該互動區條件
  assert.equal(bindings.get("legacy"), "npc-legacy");
  assert.deepEqual(npcs.get("npc-legacy").legacyRequirements, [gate]);
});

test("NPC presence: none = always; activation shows, closing or removal hides", () => {
  assert.equal(isSceneNpcPresent([], query("before")), true);
  const presence = { ...gate, removeQuestId: undefined, removeStageId: undefined };
  assert.equal(isSceneNpcPresent([presence], query("before")), false);
  assert.equal(isSceneNpcPresent([presence], query("start")), true);
  assert.equal(isSceneNpcPresent([presence], query("close")), false, "closing condition makes the NPC leave");
  const removable = { ...gate, stageMode: "UnlockFromStage", disableQuestId: "", disableStageId: "" };
  assert.equal(isSceneNpcPresent([removable], query("close")), true);
  assert.equal(isSceneNpcPresent([removable], query("remove")), false);
});

test("100% NPC height follows the player's visible body and size option", () => {
  const catalogV2 = normalizeNpcCatalog({ version: 2, defaultHeight: 152, reference: { bodyRatio: { SE: 0.98 } },
    characters: [{ id: "rena", sprites: { SE: sprite } }] });
  assert.ok(Math.abs(getNpcBodyHeight(catalogV2, "SE", 1) - 148.96) < 1e-9);
  assert.ok(Math.abs(getSceneNpcRenderData(npc, catalogV2, 200).bodyHeight - 196) < 1e-9);
  const render = getSceneNpcRenderData(npc, catalogV2);
  assert.ok(Math.abs(render.body.height - render.bodyHeight) < 1e-9, "body box matches visible height");
});

test("NPC body counts as a click target", () => {
  const render = getSceneNpcRenderData(npc, catalog);
  const head = { x: npc.x, y: npc.y - render.bodyHeight * 0.9 };
  assert.equal(isPointOnNpcBody(head, render.body), true);
  assert.equal(isPointOnNpcBody({ x: npc.x + 200, y: head.y }, render.body), false);
});

test("NPC turns toward the player one 45-degree step at a time", () => {
  const origin = { x: 0, y: 0 };
  assert.equal(facingToward(origin, { x: 10, y: 0 }, "N"), "E");
  assert.equal(facingToward(origin, { x: 0, y: 10 }, "N"), "S");
  assert.equal(facingToward(origin, { x: -10, y: -10 }, "S"), "NW");
  assert.equal(facingToward(origin, { x: 0.2, y: 0.2 }, "SW"), "SW", "too close keeps the current facing");
  assert.equal(stepFacing("N", "S"), "NE");
  assert.equal(stepFacing("N", "W"), "NW");
  assert.equal(stepFacing("SE", "SE"), "SE");
  let facing = "NE";
  for (let step = 0; step < 4; step++) facing = stepFacing(facing, "SW");
  assert.equal(facing, "SW");
});

test("idle breathing is subtle, foot-anchored and staggered per NPC", () => {
  let minY = Infinity, maxY = -Infinity;
  for (let time = 0; time < 8000; time += 50) {
    const scale = getBreathingScale("npc-owen", time);
    minY = Math.min(minY, scale.y); maxY = Math.max(maxY, scale.y);
    assert.ok(Math.abs(scale.x - 1) <= 0.0021);
  }
  assert.ok(maxY - minY > 0.01 && maxY <= 1.0061 && minY >= 0.9939);
  assert.notDeepEqual(getBreathingScale("npc-owen", 1000), getBreathingScale("npc-rena", 1000));
});

test("ship_interior uses independent NPCs; Owen is shared by all of his dialogues (incl. the 018 replay)", () => {
  const scene = JSON.parse(readFileSync(new URL("../public/maps/ship_interior.scene.json", import.meta.url), "utf8"));
  assert.ok(scene.interactables.every(interactable => !("npc" in interactable)), "no legacy inline npc remains");
  const { npcs, bindings } = collectSceneNpcs(scene);
  assert.deepEqual([...npcs.keys()].sort(), ["npc-captain", "npc-ian", "npc-owen", "npc-rena"]);
  const owenDialogues = [...bindings].filter(([, npcId]) => npcId === "npc-owen").map(([id]) => id.slice(-3)).sort();
  assert.deepEqual(owenDialogues, ["011", "015", "017", "018"]);
  const raw = normalizeNpcCatalog(JSON.parse(readFileSync(new URL("../public/characters/npc-catalog.json", import.meta.url), "utf8")));
  for (const definition of npcs.values()) assert.ok(getSceneNpcRenderData(definition, raw), definition.id);
});
