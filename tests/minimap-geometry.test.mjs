import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMiniMapGeometry,
  isMiniMapCellWalkable,
} from "../app/minimap-geometry.ts";

test("低解析度遮罩會合併相鄰 NavMesh，不產生中間分隔輪廓", () => {
  const geometry = buildMiniMapGeometry(
    { width: 100, height: 60 },
    [
      [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 50 }],
      [{ x: 50, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 50 }, { x: 50, y: 50 }],
    ],
    [],
    100,
  );

  assert.equal(isMiniMapCellWalkable(geometry, 25, 30), true);
  assert.equal(isMiniMapCellWalkable(geometry, 75, 30), true);
  assert.equal(
    geometry.contours.some(([start, end]) =>
      start.x === 50 && end.x === 50 && start.y > 10 && end.y < 50),
    false,
  );
});

test("Collision 會從 NavMesh 遮罩扣除並擷取內部輪廓", () => {
  const geometry = buildMiniMapGeometry(
    { width: 100, height: 100 },
    [[{ x: 5, y: 5 }, { x: 95, y: 5 }, { x: 95, y: 95 }, { x: 5, y: 95 }]],
    [{
      kind: "polygon",
      points: [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }],
    }],
    100,
  );

  assert.equal(isMiniMapCellWalkable(geometry, 50, 50), false);
  assert.equal(isMiniMapCellWalkable(geometry, 30, 50), true);
  assert.ok(geometry.contours.length > 0);
});

test("圓形 Collision 同樣會形成不可行走黑影", () => {
  const geometry = buildMiniMapGeometry(
    { width: 80, height: 80 },
    [[{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }, { x: 0, y: 80 }]],
    [{ kind: "circle", x: 40, y: 40, radius: 12 }],
    80,
  );

  assert.equal(isMiniMapCellWalkable(geometry, 40, 40), false);
  assert.equal(isMiniMapCellWalkable(geometry, 20, 40), true);
});
