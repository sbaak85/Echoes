import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readScene = name => JSON.parse(readFileSync(new URL(`../public/maps/${name}`, import.meta.url), "utf8"));
const scene3 = readScene("map_test01.scene.json");
const scene6 = readScene("map_scene_06B.scene.json");
const scene2 = readScene("map_test02.scene.json");
const runtime = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

test("Scene 6 is registered alongside Scene 3 and Scene 2 with its background asset", () => {
  assert.match(runtime, /import mapScene06BScene from "\.\.\/public\/maps\/map_scene_06B\.scene\.json"/);
  assert.match(runtime, /\[mapTest01Scene, mapTest02Scene, mapScene06BScene\]\.map/);
  assert.equal(new Set([scene3.sceneId, scene2.sceneId, scene6.sceneId]).size, 3);
  assert.equal(existsSync(new URL(`../public/maps/${scene6.image.file}`, import.meta.url)), true);
});

for (const [source, target, entryId, triggerMode, transferMode] of [
  [scene3, scene6, "entry-scene6-from-scene3", "choice", "pathfind"],
  [scene6, scene3, "entry-scene3-from-scene6", "auto", "teleport"],
]) {
  test(`${source.sceneId} -> ${target.sceneId} resolves the correct walkable entry`, () => {
    const exit = source.connections.find(c => c.targetSceneId === target.sceneId);
    assert.ok(exit);
    assert.equal(exit.targetEntryPointId, entryId);
    assert.equal(exit.triggerMode, triggerMode);
    assert.equal(exit.transitionMode, "seamless");
    assert.equal(exit.transferMode, transferMode);
    const entry = target.entryPoints.find(p => p.id === exit.targetEntryPointId);
    assert.ok(entry);
    // Placement is editor-owned: validate the current position, not an old snapshot.
    assert.ok(target.navMesh.some(nav => inside(entry, nav.points)));
    assert.ok(entry.x >= 0 && entry.y >= 0 && entry.x <= target.world.width && entry.y <= target.world.height);
    assert.equal(target.collisions.some(c => c.points
      ? inside(entry, c.points)
      : Math.hypot(entry.x - c.x, entry.y - c.y) < c.radius), false);
  });
}

test("arrival lock still prevents immediate automatic return and Scene 2 route is preserved", () => {
  assert.match(runtime, /sceneArrivalLockedRef\.current = true/);
  assert.match(runtime, /touchingSceneConnections\.length === 0\s*&&\s*distanceFromArrival >= 48/);
  const exit = scene3.connections.find(c => c.targetSceneId === "Scene_2");
  assert.equal(exit.targetEntryPointId, "entry-scene2-from-scene3");
  assert.ok(scene2.entryPoints.some(p => p.id === exit.targetEntryPointId));
  assert.equal(scene2.connections.find(c => c.targetSceneId === "Scene_3").targetEntryPointId, "entry-scene3-from-scene2");
});
