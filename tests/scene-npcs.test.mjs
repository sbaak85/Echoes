import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NPC_DIRECTIONS, normalizeNpcCatalog, getSceneNpcRenderData,
  isSceneNpcVisible, sortSceneActors,
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

test("shared NPC catalog includes four complete real eight-direction 570x720 asset sets", () => {
  const raw = JSON.parse(readFileSync(new URL("../public/characters/npc-catalog.json", import.meta.url), "utf8"));
  const normalized = normalizeNpcCatalog(raw);
  assert.equal(normalized.defaultHeight, 152);
  assert.deepEqual(Object.keys(normalized.characters).sort(), ["captain", "ian", "owen", "rena"]);
  for (const character of Object.values(normalized.characters)) for (const direction of NPC_DIRECTIONS) {
    const asset = character.sprites[direction];
    assert.ok(asset, `${character.name} ${direction}`);
    const bytes = readFileSync(new URL(`../public/${asset.file}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), 570);
    assert.equal(bytes.readUInt32BE(20), 720);
    assert.equal(asset.width, 570); assert.equal(asset.height, 720);
    assert.ok(resolvePublicAssetUrl("/Echoes/", asset.file).startsWith("/Echoes/characters/idle/"));
  }
});
