import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_FREQUENCY_CALIBRATION_CONFIG,
  evaluateFrequencyCalibration,
  frequencyCoarseFromDialAngle,
  frequencyDialAngleFromStick,
  stepFrequencyCoarse,
  stepFrequencyFine,
} from "../app/frequency-calibration-puzzle.ts";

test("第一版調頻謎題只有指定粗調與微調範圍可鎖定", () => {
  const target = DEFAULT_FREQUENCY_CALIBRATION_CONFIG.target;
  assert.equal(evaluateFrequencyCalibration(target).canLock, true);
  assert.equal(evaluateFrequencyCalibration({ coarse: 7, fine: 84 }).canLock, true);
  assert.equal(evaluateFrequencyCalibration({ coarse: 7, fine: 86 }).canLock, true);
  assert.equal(evaluateFrequencyCalibration({ coarse: 6, fine: 85 }).canLock, false);
  assert.equal(evaluateFrequencyCalibration({ coarse: 7, fine: 83 }).canLock, false);
});

test("接近目標時訊號強度會單調提升", () => {
  const initial = evaluateFrequencyCalibration({ coarse: 4, fine: 50 }).strength;
  const closer = evaluateFrequencyCalibration({ coarse: 6, fine: 70 }).strength;
  const target = evaluateFrequencyCalibration({ coarse: 7, fine: 85 }).strength;
  assert.ok(initial < closer);
  assert.ok(closer < target);
  assert.equal(target, 100);
});

test("粗調與微調步進不會超出允許範圍", () => {
  assert.equal(stepFrequencyCoarse(1, -1), 1);
  assert.equal(stepFrequencyCoarse(8, 1), 8);
  assert.equal(stepFrequencyFine(0, -1), 0);
  assert.equal(stepFrequencyFine(100, 1), 100);
});

test("左搖桿以正上方為零度並可完整對應 360 度旋鈕", () => {
  assert.equal(frequencyDialAngleFromStick(0, -1), 0);
  assert.equal(frequencyDialAngleFromStick(1, 0), 90);
  assert.equal(frequencyDialAngleFromStick(0, 1), 180);
  assert.equal(frequencyDialAngleFromStick(-1, 0), 270);
  assert.equal(frequencyDialAngleFromStick(0.05, 0.05), null);
  assert.equal(frequencyCoarseFromDialAngle(0), 1);
  assert.equal(frequencyCoarseFromDialAngle(45), 2);
  assert.equal(frequencyCoarseFromDialAngle(90), 3);
  assert.equal(frequencyCoarseFromDialAngle(315), 8);
  assert.equal(frequencyCoarseFromDialAngle(359), 1);
});

test("遊戲提供本機側邊面板試玩入口與完成事件", async () => {
  const [component, movementLab] = await Promise.all([
    readFile(new URL("../app/frequency-calibration-puzzle.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(component, /drawFrequencyWaveform/);
  assert.match(component, /echoes:frequency-calibration-complete|FREQUENCY_CALIBRATION_EVENT_NAME/);
  assert.match(movementLab, /frequencyCalibrationPreview/);
  assert.match(movementLab, /FrequencyCalibrationPuzzle/);
  assert.match(component, /setGamepadAnalogInput/);
  assert.match(component, /updateDialAngle\(coarseBandToDialAngle\(nextCoarse\)\)/);
  assert.doesNotMatch(component, /updateDialAngle\(dialAngle\)/);
  assert.match(component, />預調頻率</);
});

test("校頻成功會記錄旗標、播放世界觀訊息並在末句停留一秒後關閉", async () => {
  const [component, movementLab] = await Promise.all([
    readFile(new URL("../app/frequency-calibration-puzzle.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(component, /setFeedback\("(?:左|右)搖桿/);
  assert.match(component, /量子通訊頻道頻率接收成功。/);
  assert.match(component, /SUCCESS_AUTO_CLOSE_DELAY_MS = 1000/);
  assert.match(component, /completionFlagId: FREQUENCY_CALIBRATION_COMPLETION_FLAG/);
  assert.match(movementLab, /setStoryFlag\(FREQUENCY_CALIBRATION_COMPLETION_FLAG, true\)/);
});
