import test from 'node:test';
import assert from 'node:assert/strict';
import { createVineGeometry, vineGeometryAtReach, smoothVineProgress } from '../app/phototropic-vine-geometry.js';

const path = 'M -90 450 C 105 388 130 70 339 112 S 602 176 738 68 Q 804 11 929 88';
const geometry = createVineGeometry(path);

test('growth retains the original cubic and quadratic silhouette at full reach', () => {
  const full = vineGeometryAtReach(geometry, 1);
  assert.equal(full.curves.length, 3);
  assert.deepEqual(full.curves[0], [{ x: -90, y: 450 }, { x: 105, y: 388 }, { x: 130, y: 70 }, { x: 339, y: 112 }]);
  assert.deepEqual(full.curves[1][1], { x: 548, y: 154 });
  assert.deepEqual(full.tip, { x: 929, y: 88 });
  assert.deepEqual(vineGeometryAtReach(geometry, 0).tip, { x: -90, y: 450 });
});

test('the tip stays continuous across curve joins and beyond full reach', () => {
  const boundaries = geometry.table.filter(entry => entry.t === 1).map(entry => entry.length / geometry.length);
  for (const reach of boundaries) {
    const before = vineGeometryAtReach(geometry, reach - 1e-7).tip;
    const after = vineGeometryAtReach(geometry, reach + 1e-7).tip;
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < .001);
  }
  for (let frame = 0; frame <= 240; frame++) {
    const visible = vineGeometryAtReach(geometry, frame / 240 * 1.25);
    assert.ok(visible.curves.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
});

test('60Hz and 120Hz reach identical positions at matching times, with smaller intermediate steps at 120Hz', () => {
  const sample = hz => Array.from({ length: hz + 1 }, (_, frame) => vineGeometryAtReach(geometry, smoothVineProgress(frame / hz)).tip);
  const at60 = sample(60), at120 = sample(120);
  at60.forEach((tip, frame) => assert.deepEqual(tip, at120[frame * 2]));
  const largestStep = points => Math.max(...points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y)));
  assert.ok(largestStep(at120) < largestStep(at60) * .52);
  // The start and finish have no abrupt velocity change.
  assert.ok(smoothVineProgress(.001) < .000004);
  assert.ok(1 - smoothVineProgress(.999) < .000004);
});
