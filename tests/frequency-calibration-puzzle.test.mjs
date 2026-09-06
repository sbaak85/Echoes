import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_FREQUENCY_CALIBRATION_CONFIG,
  evaluateFrequencyCalibration,
  frequencyFineValueToDisplay,
  frequencyCoarseFromDialAngle,
  frequencyDialAngleFromStick,
  getFrequencyVisualSignalStrength,
  getFrequencyFineResetValue,
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

test("每個預調檔位會帶入指定的微調預設值", () => {
  const expected = [-1.3, 0.7, -0.9, -2.5, 1.2, -0.5, -2, 0.75];
  expected.forEach((displayValue, index) => {
    assert.equal(
      Number(frequencyFineValueToDisplay(getFrequencyFineResetValue(index + 1)).toFixed(2)),
      displayValue,
    );
  });
});

test("遊戲預設從第二檔與該檔微調預設值開始", () => {
  assert.equal(DEFAULT_FREQUENCY_CALIBRATION_CONFIG.initial.coarse, 2);
  assert.equal(
    Number(frequencyFineValueToDisplay(DEFAULT_FREQUENCY_CALIBRATION_CONFIG.initial.fine).toFixed(2)),
    0.7,
  );
});

test("視覺訊號只有第七檔接近 85 時快速升高且 85 為滿值", () => {
  assert.equal(getFrequencyVisualSignalStrength({ coarse: 7, fine: 85 }, 0), 100);
  assert.ok(getFrequencyVisualSignalStrength({ coarse: 7, fine: 80 }, 0) >= 93);
  assert.ok(getFrequencyVisualSignalStrength({ coarse: 7, fine: 90 }, 1) < 100);
  assert.equal(getFrequencyVisualSignalStrength({ coarse: 6, fine: 85 }, 0), 12);
  assert.equal(getFrequencyVisualSignalStrength({ coarse: 6, fine: 85 }, 1), 80);
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
  const [component, movementLab, styles] = await Promise.all([
    readFile(new URL("../app/frequency-calibration-puzzle.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /drawFrequencyWaveform/);
  assert.match(component, /echoes:frequency-calibration-complete|FREQUENCY_CALIBRATION_EVENT_NAME/);
  assert.match(movementLab, /frequencyCalibrationPreview/);
  assert.match(movementLab, /FrequencyCalibrationPuzzle/);
  assert.match(component, /setGamepadAnalogInput/);
  assert.match(component, /updateDialAngle\(coarseBandToDialAngle\(nextCoarse\)\)/);
  assert.doesNotMatch(component, /updateDialAngle\(dialAngle\)/);
  assert.match(component, />預調頻率</);
  assert.match(component, /gamepadMode \? <GamepadButtonIcon button="LT"/);
  assert.match(component, /gamepadMode \? <GamepadButtonIcon button="RT"/);
  assert.match(component, /resetFrequency: reset/);
  assert.match(component, /lockFrequency,/);
  assert.match(component, /FAILED_LOCK_FEEDBACK_MESSAGES/);
  assert.match(component, /FINE_TUNING_FEEDBACK_MESSAGES/);
  assert.doesNotMatch(component, /className="frequency-signal-row"/);
  assert.match(component, /className=\{`is-ready/);
  assert.match(movementLab, /leftTriggerJustPressed/);
  assert.match(movementLab, /rightTriggerJustPressed/);
  assert.match(movementLab, /resetFrequency\(\)/);
  assert.match(movementLab, /lockFrequency\(\)/);
  assert.match(movementLab, /frequencyCoarseTick/);
  assert.match(movementLab, /continueFrequencyFineTuningAudio/);
  assert.match(movementLab, /success \? "frequencyLocked" : "uiInput"/);
  assert.match(component, /onCoarseStep\?\.\(\)/);
  assert.match(component, /onFineTuning\?\.\(visualSignalStrengthRef\.current\)/);
  assert.match(component, /onLockAttempt\?\.\(currentEvaluation\.canLock\)/);
  const coarseAudioBlock = component.slice(
    component.indexOf("const changeCoarse"),
    component.indexOf("const changeFine"),
  );
  const fineAudioBlock = component.slice(
    component.indexOf("const changeFine"),
    component.indexOf("const lockFrequency"),
  );
  assert.doesNotMatch(coarseAudioBlock, /onInput\?\./);
  assert.doesNotMatch(fineAudioBlock, /onInput\?\./);
  assert.match(styles, /\.frequency-puzzle-overlay \*\s*\{[^}]*cursor:\s*none !important/s);
  assert.doesNotMatch(movementLab, /style=\{frequencyPuzzleOpen \? \{ display: "none" \} : undefined\}/);
  assert.match(
    movementLab,
    /if \(frequencyPuzzleOpenRef\.current\) \{[\s\S]*?virtualCursorVisible = true;[\s\S]*?return;/,
  );
  assert.match(
    movementLab,
    /virtualCursorVisible = activeInputMode === "keyboard-mouse"/,
  );
  assert.match(styles, /\.frequency-puzzle-dialog :focus-visible\s*\{[^}]*outline:\s*none !important/s);
  assert.match(component, /fineInputRef\.current\?\.blur\(\)/);
  assert.match(component, /setSelectionFrameVisible\(false\)/);
  assert.match(
    component,
    /selectedControl === "fine" && selectionFrameVisible \? " is-selected"/,
  );
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
  assert.match(
    movementLab,
    /FREQUENCY_CALIBRATION_INTERACTION_ID = "scene3-interaction-025"/,
  );
  assert.match(
    movementLab,
    /interactable\.id === FREQUENCY_CALIBRATION_INTERACTION_ID[\s\S]*selectInteractionDialogue\(interactable, "success"\)[\s\S]*openDialogue\([\s\S]*startFrequencyCalibrationPuzzle[\s\S]*availableDialogue[\s\S]*\)/,
  );
  const scene = JSON.parse(
    await readFile(new URL("../public/maps/map_test01.scene.json", import.meta.url), "utf8"),
  );
  const interaction = scene.interactables.find(
    (candidate) => candidate.id === "scene3-interaction-025",
  );
  assert.ok(interaction?.dialogue?.lines.length > 0);
  assert.match(
    interaction.dialogue.lines.at(-1).text,
    /校準介面已就緒/,
  );
  assert.match(movementLab, /completeFrequencyPuzzleInteractionRef\.current\(\)/);
  assert.match(
    movementLab,
    /completeFrequencyPuzzleInteractionRef\.current = \(\) => \{[\s\S]*publishPuzzleCompleted\(session\)/,
  );
  assert.match(
    movementLab,
    /FREQUENCY_CALIBRATION_FOLLOWUP_DIALOGUE_ID = "chapter03-section-9"/,
  );
  assert.match(
    movementLab,
    /FREQUENCY_CALIBRATION_FOLLOWUP_DIALOGUE_DELAY_MS = 1000/,
  );
  assert.match(
    movementLab,
    /publishPuzzleCompleted\(session\);[\s\S]*scheduleRegisteredStoryDialogue\([\s\S]*FREQUENCY_CALIBRATION_FOLLOWUP_DIALOGUE_ID,[\s\S]*FREQUENCY_CALIBRATION_FOLLOWUP_DIALOGUE_DELAY_MS/,
  );
  assert.doesNotMatch(movementLab, /FrequencyEpilogueFlow|frequencyEpilogueFlowRef/);
});
