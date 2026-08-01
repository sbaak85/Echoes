import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorldItemSpawnMotion,
  getWorldItemThrowDistanceBoost,
  getWorldItemSpawnPose,
} from "../app/world-item-spawn-motion.ts";

const motion = {
  startedAt: 1000,
  start: { x: 100, y: 100 },
  landing: { x: 140, y: 120 },
  end: { x: 160, y: 120 },
  arcHeight: 30,
  bounceHeight: 10,
  flightDurationMs: 400,
  bounceDurationMs: 160,
  slideDurationMs: 220,
  launchRotation: 0.2,
};

test("場上生成道具沿拋物線飛行、輕彈一次，再滑動20px減速停下", () => {
  const middleOfFlight = getWorldItemSpawnPose(motion, 1200);
  assert.equal(middleOfFlight.airborne, true);
  assert.equal(middleOfFlight.phase, "flight");
  assert.equal(middleOfFlight.finished, false);
  assert.ok(middleOfFlight.position.y < 120);
  assert.ok(middleOfFlight.rotation > 0);

  const landed = getWorldItemSpawnPose(motion, 1400);
  assert.deepEqual(landed.position, motion.landing);
  assert.equal(landed.airborne, false);
  assert.equal(landed.phase, "bounce");
  assert.ok(landed.scaleX > 1);
  assert.ok(landed.scaleY < 1);

  const middleOfBounce = getWorldItemSpawnPose(motion, 1480);
  assert.equal(middleOfBounce.phase, "bounce");
  assert.equal(middleOfBounce.airborne, true);
  assert.ok(middleOfBounce.position.y < motion.landing.y);

  const middleOfSlide = getWorldItemSpawnPose(motion, 1670);
  assert.ok(middleOfSlide.position.x > motion.landing.x);
  assert.ok(middleOfSlide.position.x < motion.end.x);
  assert.equal(middleOfSlide.phase, "slide");
  assert.equal(middleOfSlide.finished, false);

  const stopped = getWorldItemSpawnPose(motion, 1780);
  assert.deepEqual(stopped.position, motion.end);
  assert.equal(stopped.finished, true);
  assert.equal(stopped.phase, "settled");
});

test("互動生成與背包丟棄可共用同一套隨機拋出參數", () => {
  const randomValues = [0, 0.5, 1, 0.75];
  const generated = createWorldItemSpawnMotion(
    2000,
    { x: 10, y: 20 },
    { x: 40, y: 50 },
    { x: 60, y: 50 },
    () => randomValues.shift() ?? 0,
  );

  assert.equal(generated.arcHeight, 36);
  assert.equal(generated.bounceHeight, 10);
  assert.equal(generated.flightDurationMs, 420);
  assert.equal(generated.bounceDurationMs, 160);
  assert.equal(generated.slideDurationMs, 230);
  assert.equal(generated.launchRotation, 0.105);
});

test("拋出距離採較強基準值再做正負浮動，不會比舊版更輕", () => {
  assert.equal(getWorldItemThrowDistanceBoost(() => 0), 8);
  assert.equal(getWorldItemThrowDistanceBoost(() => 0.5), 16);
  assert.equal(getWorldItemThrowDistanceBoost(() => 1), 24);
  assert.equal(getWorldItemThrowDistanceBoost(() => -1), 8);
  assert.equal(getWorldItemThrowDistanceBoost(() => 2), 24);
});
