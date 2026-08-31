"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DEFAULT_FREQUENCY_CALIBRATION_CONFIG,
  FREQUENCY_CALIBRATION_COMPLETION_FLAG,
  FREQUENCY_CALIBRATION_EVENT_NAME,
  FREQUENCY_COARSE_MAX,
  FREQUENCY_COARSE_MIN,
  FREQUENCY_FINE_MAX,
  FREQUENCY_FINE_MIN,
  FREQUENCY_GAMEPAD_FINE_DEAD_ZONE,
  FREQUENCY_GAMEPAD_FINE_UNITS_PER_SECOND,
  evaluateFrequencyCalibration,
  frequencyFineValueToDisplay,
  frequencyCoarseFromDialAngle,
  frequencyDialAngleFromStick,
  getFrequencyVisualSignalStrength,
  getFrequencyFineResetValue,
  stepFrequencyCoarse,
  stepFrequencyFine,
  type FrequencyCalibrationPuzzleConfig,
  type FrequencyCalibrationState,
} from "./frequency-calibration-puzzle";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url";

type FrequencyControlTarget = "coarse" | "fine" | "lock";

const FREQUENCY_COARSE_BAND_COUNT =
  FREQUENCY_COARSE_MAX - FREQUENCY_COARSE_MIN + 1;
const FREQUENCY_COARSE_BAND_ANGLE = 360 / FREQUENCY_COARSE_BAND_COUNT;
const FREQUENCY_DIAL_MINOR_TICKS_PER_BAND = 4;
const FREQUENCY_DIAL_TICK_COUNT =
  FREQUENCY_COARSE_BAND_COUNT * FREQUENCY_DIAL_MINOR_TICKS_PER_BAND;

const frequencyAssetUrl = (fileName: string) => resolveRuntimePublicAssetUrl(
  `ui/frequency-calibration/${fileName}`,
);

function coarseBandToDialAngle(coarse: number) {
  return (coarse - FREQUENCY_COARSE_MIN) * FREQUENCY_COARSE_BAND_ANGLE;
}
const FINE_SCALE_LABELS = [-3, -2, -1, 0, 1, 2, 3] as const;
const FINE_SCALE_TICK_COUNT = 31;
const SUCCESS_FEEDBACK_INTERVAL_MS = 600;
const SUCCESS_AUTO_CLOSE_DELAY_MS = 1000;
const SUCCESS_FEEDBACK_MESSAGES = [
  "頻率鎖定完成。",
  "接收波形與目標頻率完全重疊。",
  "量子通訊頻道正在建立穩定連線。",
  "量子通訊頻道頻率接收成功。",
] as const;
const FINE_TUNING_FEEDBACK_MESSAGES = [
  "正在比對目標波形…",
  "正在分析接收波形的相位差…",
  "正在排除頻段中的背景雜訊…",
  "正在校準訊號峰值與波谷…",
  "接收頻率正在進行精密校對…",
  "正在縮小與目標頻率的偏差…",
] as const;
const FAILED_LOCK_FEEDBACK_MESSAGES = [
  "頻率鎖定失敗，接收波形尚未重疊。",
  "訊號偏差過大，無法建立穩定通訊。",
  "鎖定程序中斷，請重新調整頻率。",
  "目標波形未同步，頻道連線失敗。",
  "接收訊號仍有干擾，請再次校準。",
] as const;

type FrequencyFeedbackTone = "normal" | "error";

const INVERTED_WAVEFORM_FINE_BANDS = new Set([1, 3, 4, 6]);

type FrequencyCalibrationPuzzleProps = {
  config?: FrequencyCalibrationPuzzleConfig;
  gamepadMode?: boolean;
  onCancel: () => void;
  onCoarseStep?: () => void;
  onComplete?: (state: FrequencyCalibrationState) => void;
  onFineTuning?: (strength: number) => void;
  onFineTuningStop?: () => void;
  onInput?: () => void;
  onLockAttempt?: (success: boolean) => void;
};

export type FrequencyCalibrationPuzzleController = {
  activateSelection: () => void;
  cancel: () => void;
  lockFrequency: () => void;
  moveSelection: (direction: number) => void;
  resetFrequency: () => void;
  setSelectedDeviceActive: (active: boolean) => void;
  setGamepadAnalogInput: (input: {
    leftX: number;
    leftY: number;
    rightX: number;
    deltaTime: number;
  }) => void;
};

function surfaceValue(
  x: number,
  y: number,
  coarse: number,
  fine: number,
  target: boolean,
) {
  const frequency = target ? 7 : coarse;
  const tuning = target
    ? 85
    : INVERTED_WAVEFORM_FINE_BANDS.has(coarse)
      ? 100 - fine
      : fine;
  const shiftX = (frequency - 5) * 0.055;
  const shiftY = (tuning - 50) * 0.0028;
  const peakA = Math.exp(
    -((x + 0.24 - shiftX) ** 2 * 5.8 + (y + 0.02 + shiftY) ** 2 * 8.2),
  );
  const peakB =
    0.76 *
    Math.exp(
      -((x - 0.3 + shiftX * 0.45) ** 2 * 8.5 +
        (y - 0.12 - shiftY * 0.6) ** 2 * 10.2),
    );
  const radial = Math.sqrt(x * x + y * y);
  const ripple =
    Math.sin(radial * (9.5 + frequency * 0.34) + tuning * 0.025) *
    Math.exp(-radial * 2.15) *
    0.16;
  return peakA + peakB + ripple;
}

function drawFrequencyWaveform(
  canvas: HTMLCanvasElement,
  state: FrequencyCalibrationState,
  phase: number,
) {
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(320, Math.round(bounds.width * ratio));
  const height = Math.max(220, Math.round(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);

  const project = (x: number, y: number, z: number) => ({
    x: width * 0.5 + (x - y) * width * 0.31,
    y: height * 0.7 + (x + y) * height * 0.17 - z * height * 0.3,
  });

  context.save();
  context.strokeStyle = "rgba(56, 137, 139, 0.17)";
  context.lineWidth = ratio * 0.7;
  for (let index = -8; index <= 8; index += 1) {
    const value = index / 8;
    const a = project(-1, value, 0);
    const b = project(1, value, 0);
    const c = project(value, -1, 0);
    const d = project(value, 1, 0);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.moveTo(c.x, c.y);
    context.lineTo(d.x, d.y);
    context.stroke();
  }
  context.restore();

  const drawSurface = (
    target: boolean,
    color: string,
    glow: string,
    opacity: number,
  ) => {
    const divisions = 34;
    context.save();
    context.globalAlpha = opacity;
    context.strokeStyle = color;
    context.shadowColor = glow;
    context.shadowBlur = target ? ratio * 5 : ratio * 8;
    context.lineWidth = target ? ratio * 0.65 : ratio * 0.85;

    for (let row = 0; row <= divisions; row += 2) {
      const y = -1 + (row / divisions) * 2;
      context.beginPath();
      for (let column = 0; column <= divisions; column += 1) {
        const x = -1 + (column / divisions) * 2;
        const shimmer = target ? 0 : Math.sin(phase + column * 0.12) * 0.006;
        const point = project(
          x,
          y,
          surfaceValue(x, y, state.coarse, state.fine, target) + shimmer,
        );
        if (column === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
    }
    for (let column = 0; column <= divisions; column += 2) {
      const x = -1 + (column / divisions) * 2;
      context.beginPath();
      for (let row = 0; row <= divisions; row += 1) {
        const y = -1 + (row / divisions) * 2;
        const shimmer = target ? 0 : Math.cos(phase + row * 0.11) * 0.006;
        const point = project(
          x,
          y,
          surfaceValue(x, y, state.coarse, state.fine, target) + shimmer,
        );
        if (row === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
    }
    context.restore();
  };

  drawSurface(true, "rgba(255, 189, 77, 0.95)", "#ffae37", 0.68);
  drawSurface(false, "rgba(67, 221, 255, 0.98)", "#29d7ff", 0.88);
}

export const FrequencyCalibrationPuzzle = forwardRef<
  FrequencyCalibrationPuzzleController,
  FrequencyCalibrationPuzzleProps
>(function FrequencyCalibrationPuzzle(
  {
    config = DEFAULT_FREQUENCY_CALIBRATION_CONFIG,
    gamepadMode = false,
    onCancel,
    onCoarseStep,
    onComplete,
    onFineTuning,
    onFineTuningStop,
    onInput,
    onLockAttempt,
  },
  controllerRef,
) {
  const [state, setState] = useState<FrequencyCalibrationState>(config.initial);
  const [selectedControl, setSelectedControl] =
    useState<FrequencyControlTarget>("coarse");
  const [selectionFrameVisible, setSelectionFrameVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState("調整預調與微調頻率，使兩組波形完全重疊。");
  const [feedbackTone, setFeedbackTone] =
    useState<FrequencyFeedbackTone>("normal");
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  const fineInputRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef(state);
  const lockedRef = useRef(locked);
  const dialAngleRef = useRef(coarseBandToDialAngle(config.initial.coarse));
  const fineAnalogRemainderRef = useRef(0);
  const fineFeedbackIndexRef = useRef(0);
  const failedLockFeedbackIndexRef = useRef(0);
  const visualSignalStrengthRef = useRef(
    getFrequencyVisualSignalStrength(config.initial),
  );
  const successSequenceTimersRef = useRef<number[]>([]);
  const evaluation = useMemo(
    () => evaluateFrequencyCalibration(state, config),
    [config, state],
  );
  const fineProgress =
    ((state.fine - FREQUENCY_FINE_MIN) /
      (FREQUENCY_FINE_MAX - FREQUENCY_FINE_MIN)) *
    100;
  const fineThumbProgress = 1.6 + fineProgress * 0.968;
  const fineScaleValue = frequencyFineValueToDisplay(state.fine);
  const fineScaleOutput = `${fineScaleValue >= 0 ? "+" : ""}${fineScaleValue
    .toFixed(2)
    .replace(/\.?0+$/, "")}`;
  stateRef.current = state;
  lockedRef.current = locked;

  const updateDialAngle = (angleDegrees: number) => {
    const normalizedAngle = ((angleDegrees % 360) + 360) % 360;
    const currentAngle = dialAngleRef.current;
    const currentNormalizedAngle = ((currentAngle % 360) + 360) % 360;
    let shortestDelta = normalizedAngle - currentNormalizedAngle;
    if (shortestDelta > 180) shortestDelta -= 360;
    if (shortestDelta < -180) shortestDelta += 360;
    const continuousAngle = currentAngle + shortestDelta;
    dialAngleRef.current = continuousAngle;
    dialRef.current?.style.setProperty(
      "--frequency-dial-angle",
      `${continuousAngle}deg`,
    );
  };

  const clearSuccessSequenceTimers = () => {
    successSequenceTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    successSequenceTimersRef.current = [];
  };

  const playSuccessSequence = () => {
    clearSuccessSequenceTimers();
    setFeedbackTone("normal");
    setFeedback(SUCCESS_FEEDBACK_MESSAGES[0]);
    SUCCESS_FEEDBACK_MESSAGES.slice(1).forEach((message, index) => {
      const timerId = window.setTimeout(() => {
        setFeedback(message);
      }, (index + 1) * SUCCESS_FEEDBACK_INTERVAL_MS);
      successSequenceTimersRef.current.push(timerId);
    });
    const finalMessageDelay =
      (SUCCESS_FEEDBACK_MESSAGES.length - 1) * SUCCESS_FEEDBACK_INTERVAL_MS;
    const closeTimerId = window.setTimeout(() => {
      onCancel();
    }, finalMessageDelay + SUCCESS_AUTO_CLOSE_DELAY_MS);
    successSequenceTimersRef.current.push(closeTimerId);
  };

  const changeCoarse = (
    nextValue: number,
    options: { angleDegrees?: number; playInput?: boolean } = {},
  ) => {
    if (lockedRef.current) return;
    const currentState = stateRef.current;
    updateDialAngle(options.angleDegrees ?? coarseBandToDialAngle(nextValue));
    setSelectedControl("coarse");
    if (currentState.coarse === nextValue) return;
    if (options.playInput !== false) onCoarseStep?.();
    const nextState = {
      ...currentState,
      coarse: nextValue,
      fine: getFrequencyFineResetValue(nextValue),
    };
    stateRef.current = nextState;
    setState(nextState);
    visualSignalStrengthRef.current = getFrequencyVisualSignalStrength(nextState);
    setFeedbackTone("normal");
    setFeedback("已切換預調頻段，微調頻率已重新校準。 ");
  };

  const changeFine = (
    nextValue: number,
    options: { playInput?: boolean } = {},
  ) => {
    if (lockedRef.current) return;
    const currentState = stateRef.current;
    if (currentState.fine === nextValue) return;
    setSelectedControl("fine");
    const nextState = { ...currentState, fine: nextValue };
    stateRef.current = nextState;
    setState(nextState);
    if (options.playInput !== false) {
      visualSignalStrengthRef.current = getFrequencyVisualSignalStrength(nextState);
      onFineTuning?.(visualSignalStrengthRef.current);
    }
    setFeedbackTone("normal");
    setFeedback(
      FINE_TUNING_FEEDBACK_MESSAGES[
        fineFeedbackIndexRef.current++ % FINE_TUNING_FEEDBACK_MESSAGES.length
      ],
    );
  };

  const lockFrequency = () => {
    if (lockedRef.current) return;
    onFineTuningStop?.();
    const currentEvaluation = evaluateFrequencyCalibration(stateRef.current, config);
    onLockAttempt?.(currentEvaluation.canLock);
    if (!currentEvaluation.canLock) {
      setFeedbackTone("error");
      setFeedback(
        FAILED_LOCK_FEEDBACK_MESSAGES[
          failedLockFeedbackIndexRef.current++ % FAILED_LOCK_FEEDBACK_MESSAGES.length
        ],
      );
      return;
    }
    lockedRef.current = true;
    setLocked(true);
    playSuccessSequence();
    window.dispatchEvent(
      new CustomEvent(FREQUENCY_CALIBRATION_EVENT_NAME, {
        detail: {
          id: config.id,
          completionFlagId: FREQUENCY_CALIBRATION_COMPLETION_FLAG,
          state: stateRef.current,
        },
      }),
    );
    onComplete?.(stateRef.current);
  };

  const reset = () => {
    onFineTuningStop?.();
    onInput?.();
    clearSuccessSequenceTimers();
    lockedRef.current = false;
    setLocked(false);
    setFeedbackTone("normal");
    setState(config.initial);
    visualSignalStrengthRef.current = getFrequencyVisualSignalStrength(config.initial);
    updateDialAngle(coarseBandToDialAngle(config.initial.coarse));
    fineAnalogRemainderRef.current = 0;
    setSelectionFrameVisible(true);
    setSelectedControl("coarse");
    setFeedback("頻率已重設。重新搜尋目標訊號。");
  };

  const moveSelection = (direction: number) => {
    if (direction === 0 || lockedRef.current) return;
    onInput?.();
    setSelectionFrameVisible(true);
    const controls: FrequencyControlTarget[] = ["coarse", "fine", "lock"];
    setSelectedControl((current) => {
      const currentIndex = controls.indexOf(current);
      return controls[
        Math.min(controls.length - 1, Math.max(0, currentIndex + Math.sign(direction)))
      ];
    });
  };

  const adjustSelected = (direction: number) => {
    if (direction === 0 || lockedRef.current) return;
    if (selectedControl === "coarse") {
      changeCoarse(stepFrequencyCoarse(stateRef.current.coarse, direction));
    } else if (selectedControl === "fine") {
      changeFine(stepFrequencyFine(stateRef.current.fine, direction));
    }
  };

  const setGamepadAnalogInput = ({
    leftX,
    leftY,
    rightX,
    deltaTime,
  }: {
    leftX: number;
    leftY: number;
    rightX: number;
    deltaTime: number;
  }) => {
    if (lockedRef.current) return;

    const dialAngle = frequencyDialAngleFromStick(leftX, leftY);
    if (dialAngle !== null) {
      const nextCoarse = frequencyCoarseFromDialAngle(dialAngle);
      const coarseChanged = nextCoarse !== stateRef.current.coarse;
      setSelectedControl("coarse");
      if (coarseChanged) {
        onCoarseStep?.();
        updateDialAngle(coarseBandToDialAngle(nextCoarse));
        const nextState = {
          ...stateRef.current,
          coarse: nextCoarse,
          fine: getFrequencyFineResetValue(nextCoarse),
        };
        stateRef.current = nextState;
        setState(nextState);
        visualSignalStrengthRef.current = getFrequencyVisualSignalStrength(nextState);
        setFeedbackTone("normal");
        setFeedback("預調頻率已切換，微調頻率已回到該頻段預設值。");
      }
    }

    if (Math.abs(rightX) < FREQUENCY_GAMEPAD_FINE_DEAD_ZONE) {
      fineAnalogRemainderRef.current = 0;
      return;
    }

    fineAnalogRemainderRef.current +=
      rightX *
      FREQUENCY_GAMEPAD_FINE_UNITS_PER_SECOND *
      Math.min(0.05, Math.max(0, deltaTime));
    const fineStep = Math.trunc(fineAnalogRemainderRef.current);
    if (fineStep === 0) return;
    fineAnalogRemainderRef.current -= fineStep;
    const nextFine = Math.min(
      FREQUENCY_FINE_MAX,
      Math.max(FREQUENCY_FINE_MIN, stateRef.current.fine + fineStep),
    );
    fineInputRef.current?.blur();
    setSelectionFrameVisible(false);
    setSelectedControl("fine");
    if (nextFine !== stateRef.current.fine) {
      const nextState = { ...stateRef.current, fine: nextFine };
      stateRef.current = nextState;
      setState(nextState);
      visualSignalStrengthRef.current = getFrequencyVisualSignalStrength(nextState);
      onFineTuning?.(visualSignalStrengthRef.current);
      setFeedbackTone("normal");
      setFeedback(
        FINE_TUNING_FEEDBACK_MESSAGES[
          fineFeedbackIndexRef.current++ % FINE_TUNING_FEEDBACK_MESSAGES.length
        ],
      );
    }
  };

  useImperativeHandle(controllerRef, () => ({
    activateSelection: () => {
      setSelectionFrameVisible(true);
      if (selectedControl === "lock") lockFrequency();
      else adjustSelected(1);
    },
    cancel: onCancel,
    lockFrequency,
    moveSelection,
    resetFrequency: reset,
    setSelectedDeviceActive: (active: boolean) => {
      setSelectionFrameVisible(true);
      adjustSelected(active ? 1 : -1);
    },
    setGamepadAnalogInput,
  }));

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    let animationFrame = 0;
    let lastDraw = 0;
    const draw = (time: number) => {
      if (time - lastDraw >= 34) {
        drawFrequencyWaveform(canvas, stateRef.current, time * 0.0015);
        lastDraw = time;
      }
      animationFrame = window.requestAnimationFrame(draw);
    };
    animationFrame = window.requestAnimationFrame(draw);
    const observer = new ResizeObserver(() => {
      drawFrequencyWaveform(canvas, stateRef.current, performance.now() * 0.0015);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => () => clearSuccessSequenceTimers(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "range") return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancel();
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopImmediatePropagation();
        moveSelection(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        event.stopImmediatePropagation();
        adjustSelected(event.key === "ArrowRight" ? 1 : -1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (selectedControl === "lock") lockFrequency();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  const handleDialPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (locked) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (bounds.left + bounds.width / 2);
    const y = event.clientY - (bounds.top + bounds.height / 2);
    let angle = Math.atan2(y, x) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    const angleDegrees = (angle * 180) / Math.PI;
    const value = frequencyCoarseFromDialAngle(angleDegrees);
    changeCoarse(value, {
      angleDegrees,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return (
    <div className="frequency-puzzle-overlay" data-frequency-puzzle-open="true">
      <section
        className={`frequency-puzzle-dialog is-${evaluation.status}${locked ? " is-locked" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={config.title}
      >
        <header className="frequency-puzzle-header">
          <div>
            <h2>{config.title}</h2>
            <p>{config.stageLabel}</p>
          </div>
          <p>調整頻率，使接收訊號與目標波形重疊，並達到最佳強度。</p>
          <button type="button" aria-label="關閉頻率調校" onClick={onCancel}>×</button>
        </header>

        <div className="frequency-puzzle-body">
          <section className="frequency-coarse-panel">
            <h3>預調頻率</h3>
            <div
              ref={dialRef}
              className={`frequency-dial${selectedControl === "coarse" ? " is-selected" : ""}`}
              style={{
                "--frequency-dial-angle": `${dialAngleRef.current}deg`,
              } as CSSProperties}
              role="slider"
              aria-label="預調頻率"
              aria-valuemin={FREQUENCY_COARSE_MIN}
              aria-valuemax={FREQUENCY_COARSE_MAX}
              aria-valuenow={state.coarse}
              tabIndex={0}
              onPointerDown={handleDialPointer}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  handleDialPointer(event);
                }
              }}
              onWheel={(event) => {
                event.preventDefault();
                changeCoarse(stepFrequencyCoarse(state.coarse, event.deltaY < 0 ? 1 : -1));
              }}
            >
              <span className="frequency-dial-ticks" aria-hidden="true">
                {Array.from({ length: FREQUENCY_DIAL_TICK_COUNT }, (_, index) => (
                  <i
                    className={
                      index % FREQUENCY_DIAL_MINOR_TICKS_PER_BAND === 0
                        ? "is-major"
                        : undefined
                    }
                    style={{
                      transform: `rotate(${index * (360 / FREQUENCY_DIAL_TICK_COUNT)}deg)`,
                    }}
                    key={index}
                  />
                ))}
              </span>
              {Array.from({ length: FREQUENCY_COARSE_BAND_COUNT }, (_, index) => {
                const coarseValue = FREQUENCY_COARSE_MIN + index;
                const angle =
                  (index / FREQUENCY_COARSE_BAND_COUNT) * Math.PI * 2 - Math.PI / 2;
                return (
                  <b
                    className={state.coarse === coarseValue ? "is-active" : undefined}
                    style={{
                      left: `${50 + Math.cos(angle) * 48.5}%`,
                      top: `${50 + Math.sin(angle) * 48.5}%`,
                    }}
                    key={index}
                  >
                    {coarseValue}
                  </b>
                );
              })}
              <img
                className="frequency-dial-knob"
                src={frequencyAssetUrl("coarse-dial-knob.png")}
                alt=""
                draggable={false}
              />
              <span
                className="frequency-dial-pointer"
              ><i /></span>
            </div>
            <dl
              className="frequency-current-band"
              style={{
                backgroundImage: `url("${frequencyAssetUrl("current-band-frame.png")}")`,
              }}
            >
              <dt>目前頻段</dt>
              <dd>{state.coarse}</dd>
            </dl>
          </section>

          <section className="frequency-wave-panel">
            <header>
              <span><i className="is-received" />接收波形</span>
              <strong>波形比較</strong>
              <span>目標波形<i className="is-target" /></span>
            </header>
            <div className="frequency-wave-canvas-wrap">
              <canvas ref={waveformCanvasRef} aria-label="即時三維波形比較" />
            </div>
            <label className={`frequency-fine-control${selectedControl === "fine" && selectionFrameVisible ? " is-selected" : ""}`}>
              <span>微調頻率</span>
              <span className="frequency-fine-slider">
                <span className="frequency-fine-scale" aria-hidden="true">
                  {FINE_SCALE_LABELS.map((value, index) => (
                    <b key={value} style={{ left: `${(index / (FINE_SCALE_LABELS.length - 1)) * 100}%` }}>
                      {value > 0 ? `+${value}` : value}
                    </b>
                  ))}
                  {Array.from({ length: FINE_SCALE_TICK_COUNT }, (_, index) => (
                    <i
                      className={index % 5 === 0 ? "is-major" : undefined}
                      key={index}
                      style={{ left: `${(index / (FINE_SCALE_TICK_COUNT - 1)) * 100}%` }}
                    />
                  ))}
                </span>
                <img
                  className="frequency-fine-slider-track"
                  src={frequencyAssetUrl("fine-slider-rail-retro.png")}
                  alt=""
                  draggable={false}
                />
                <img
                  className="frequency-fine-slider-thumb"
                  src={frequencyAssetUrl("fine-slider-lever-retro.png")}
                  alt=""
                  draggable={false}
                  style={{ left: `${fineThumbProgress}%` }}
                />
                <input
                  ref={fineInputRef}
                  type="range"
                  min={FREQUENCY_FINE_MIN}
                  max={FREQUENCY_FINE_MAX}
                  value={state.fine}
                  disabled={locked}
                  onFocus={() => {
                    setSelectionFrameVisible(true);
                    setSelectedControl("fine");
                  }}
                  onChange={(event) => changeFine(Number(event.currentTarget.value))}
                  onPointerUp={onFineTuningStop}
                  onPointerCancel={onFineTuningStop}
                  onBlur={onFineTuningStop}
                />
              </span>
              <strong>{fineScaleOutput}</strong>
            </label>
          </section>
        </div>

        <footer className="frequency-puzzle-footer">
          <p className={feedbackTone === "error" ? "is-error" : undefined} aria-live="polite"><span aria-hidden="true">⌁</span>{feedback}</p>
          <button type="button" onClick={reset}>
            {gamepadMode ? <span className="frequency-trigger-key" aria-hidden="true">LT</span> : <span aria-hidden="true">↻</span>}
            重設頻率
          </button>
          <button
            className={`is-ready${selectedControl === "lock" && selectionFrameVisible ? " is-selected" : ""}`}
            type="button"
            onFocus={() => {
              setSelectionFrameVisible(true);
              setSelectedControl("lock");
            }}
            onClick={lockFrequency}
          >
            {gamepadMode ? <span className="frequency-trigger-key" aria-hidden="true">RT</span> : <span aria-hidden="true">▣</span>}
            {locked ? "頻率已鎖定" : "鎖定頻率"}
          </button>
        </footer>
      </section>
    </div>
  );
});
