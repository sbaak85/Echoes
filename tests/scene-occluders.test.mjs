import assert from "node:assert/strict";
import test from "node:test";
import { isInFrontOfOccluder, normalizeSceneOccluders, occluderFoot, sortSceneDrawables } from "../app/scene-occluders.ts";

const layerIds = new Set(["wall-layer"]);
// 一段往右下斜的牆（等角視角常見）：牆腳線 (100,300) → (300,400)
const slanted = {
  id: "wall-a", layerId: "wall-layer",
  points: [{ x: 100, y: 180 }, { x: 300, y: 280 }, { x: 300, y: 400 }, { x: 100, y: 300 }],
  baselineStart: { x: 100, y: 300 }, baselineEnd: { x: 300, y: 400 },
};

test("occluders: invalid, duplicate, unknown-layer and degenerate entries are skipped", () => {
  const result = normalizeSceneOccluders([
    slanted,
    { ...slanted },
    { ...slanted, id: "other-layer", layerId: "missing" },
    { ...slanted, id: "two-points", points: slanted.points.slice(0, 2) },
    { ...slanted, id: "flat-baseline", baselineEnd: { x: 100.2, y: 300.3 } },
    { ...slanted, id: "nan", points: [...slanted.points.slice(0, 3), { x: NaN, y: 1 }] },
    null, "text",
  ], layerIds);
  assert.deepEqual(result.map(item => item.id), ["wall-a"]);
  assert.deepEqual(result[0].bounds, { left: 100, right: 300, top: 180, bottom: 400 });
  assert.deepEqual(normalizeSceneOccluders(undefined, layerIds), []);
});

test("front/back uses the slanted wall-foot line, not a single sort point", () => {
  const [wall] = normalizeSceneOccluders([slanted], layerIds);
  // 線在 x=280 的高度是 390：腳底 y=370 在牆後（雖然比牆中點 y=350 還低）
  assert.equal(isInFrontOfOccluder({ x: 280, y: 370 }, wall), false);
  assert.equal(isInFrontOfOccluder({ x: 280, y: 395 }, wall), true);
  // 線在 x=120 的高度是 310：腳底 y=330 在牆前（雖然比牆中點 y=350 還高）
  assert.equal(isInFrontOfOccluder({ x: 120, y: 330 }, wall), true);
  assert.equal(isInFrontOfOccluder({ x: 120, y: 305 }, wall), false);
  // 往兩端延伸
  assert.equal(isInFrontOfOccluder({ x: 0, y: 260 }, wall), true);
  // 幾乎垂直的線退回用中點
  assert.equal(isInFrontOfOccluder({ x: 50, y: 160 }, { baselineStart: { x: 50, y: 100 }, baselineEnd: { x: 50, y: 200 } }), true);
  assert.deepEqual(occluderFoot(wall), { x: 200, y: 350 });
});

const box = (x, y, size = 150) => ({ left: x - 60, right: x + 60, top: y - size, bottom: y + 8 });
const actor = (id, kind, x, y) => ({ id, kind, footX: x, footY: y, bounds: box(x, y) });

test("characters in front of a wall draw after it; characters behind draw before it", () => {
  const [wall] = normalizeSceneOccluders([slanted], layerIds);
  const occluder = { id: "occluder:wall-a", kind: "occluder", ...{ footX: 200, footY: 350 }, bounds: wall.bounds, occluder: wall };
  const front = actor("player", "player", 120, 330);
  const behind = actor("ian", "npc", 280, 370);
  const order = sortSceneDrawables([front, occluder, behind]).map(item => item.id);
  assert.ok(order.indexOf("ian") < order.indexOf("occluder:wall-a"), "behind the wall: the wall covers the character");
  assert.ok(order.indexOf("occluder:wall-a") < order.indexOf("player"), "in front of the wall: the character covers the wall");
});

test("without occluders the order equals plain foot-Y sorting with NPCs before the player on ties", () => {
  const items = [actor("player", "player", 0, 200), actor("b", "npc", 400, 100), actor("a", "npc", 10, 200), actor("c", "npc", 900, 300)];
  assert.deepEqual(sortSceneDrawables(items).map(item => item.id), ["b", "a", "player", "c"]);
});

test("non-overlapping occluders do not constrain far-away characters", () => {
  const [wall] = normalizeSceneOccluders([slanted], layerIds);
  const occluder = { id: "occluder:wall-a", kind: "occluder", footX: 200, footY: 350, bounds: wall.bounds, occluder: wall };
  const far = actor("owen", "npc", 2000, 100);
  const order = sortSceneDrawables([occluder, far]).map(item => item.id);
  assert.deepEqual(order, ["owen", "occluder:wall-a"], "falls back to depth order");
});
