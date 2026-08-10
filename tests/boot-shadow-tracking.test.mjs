import test from "node:test";
import assert from "node:assert/strict";

import { trackBootShadowAnchors } from "../app/boot-shadow-tracking.ts";

test("雙靴影依實際左右腳底像素分開，不再擠在角色中心", () => {
  const columns = [];
  for (let x = 12; x <= 30; x += 1) columns.push({ x, bottomY: 96 });
  for (let x = 70; x <= 92; x += 1) columns.push({ x, bottomY: 92 });

  const anchors = trackBootShadowAnchors(columns, 100, 100);
  assert.ok(anchors);
  assert.ok(anchors[0].xRatio < 0.3);
  assert.ok(anchors[1].xRatio > 0.7);
  assert.ok(anchors[0].yRatio > 0.9);
  assert.ok(anchors[1].yRatio > 0.85);
});

test("抬起的腳依素材中的實際高度變淡，落地腳維持較濃", () => {
  const columns = [];
  for (let x = 10; x <= 28; x += 1) columns.push({ x, bottomY: 98 });
  for (let x = 72; x <= 90; x += 1) columns.push({ x, bottomY: 78 });

  const anchors = trackBootShadowAnchors(columns, 100, 100);
  assert.ok(anchors);
  assert.equal(anchors[0].contact, 1);
  assert.ok(anchors[1].contact < anchors[0].contact);
});
