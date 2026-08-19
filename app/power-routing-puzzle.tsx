"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  POWER_ROUTING_CAPACITY,
  POWER_ROUTING_DEVICE_CELL_COUNT,
  POWER_ROUTING_DISPLAY_CELL_COUNT,
  POWER_ROUTING_RESERVE_MAX_CAPACITY,
  POWER_ROUTING_DEVICES,
  createInitialPowerRoutingState,
  evaluatePowerRouting,
  movePowerRoutingMenuTarget,
  togglePowerRoutingDevice,
  type PowerRoutingDeviceId,
  type PowerRoutingMenuTarget,
} from "./power-routing-puzzle";

const STARTUP_MESSAGES = [
  "正在初始化備用電路…",
  "供電穩定…",
  "冷卻循環穩定…",
  "資料終端上線…",
  "工作臺已啟動",
] as const;

type PowerRoutingPuzzleProps = {
  availablePower?: number;
  onCancel: () => void;
  onComplete: () => void;
  onInput?: () => void;
  onSuccessStart?: () => void;
};

export type PowerRoutingPuzzleController = {
  activateSelection: () => void;
  cancel: () => void;
  moveSelection: (direction: number) => void;
  setSelectedDeviceActive: (active: boolean) => void;
};

export const PowerRoutingPuzzle = forwardRef<
  PowerRoutingPuzzleController,
  PowerRoutingPuzzleProps
>(function PowerRoutingPuzzle(
  {
    availablePower = POWER_ROUTING_CAPACITY,
    onCancel,
    onComplete,
    onInput,
    onSuccessStart,
  },
  controllerRef,
) {
  const [state, setState] = useState(createInitialPowerRoutingState);
  const [selectedId, setSelectedId] =
    useState<PowerRoutingDeviceId>("workbenchCore");
  const [menuSelection, setMenuSelection] =
    useState<PowerRoutingMenuTarget>("workbenchCore");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [startupStep, setStartupStep] = useState<number | null>(null);
  const completionStartedRef = useRef(false);
  const startupTimersRef = useRef<number[]>([]);
  const evaluation = useMemo(
    () => evaluatePowerRouting(state, availablePower),
    [availablePower, state],
  );
  const selectedDevice =
    POWER_ROUTING_DEVICES.find((device) => device.id === selectedId) ??
    POWER_ROUTING_DEVICES[0];
  const completing = startupStep !== null;
  const displayedStatusTitle = completing
    ? "啟動中"
    : evaluation.overloaded
      ? "電力過載"
      : feedback
        ? evaluation.statusTitle
        : evaluation.success
          ? "供電穩定"
          : "分配待確認";

  useEffect(() => () => {
    startupTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    startupTimersRef.current = [];
  }, []);

  const selectDevice = (deviceId: PowerRoutingDeviceId) => {
    if (completing) return;
    onInput?.();
    setSelectedId(deviceId);
    setMenuSelection(deviceId);
  };

  const toggleDevice = (deviceId: PowerRoutingDeviceId) => {
    if (completing) return;
    onInput?.();
    setSelectedId(deviceId);
    setMenuSelection(deviceId);
    setState((current) => togglePowerRoutingDevice(current, deviceId));
    setFeedback(null);
  };

  const applyPower = () => {
    if (completing) return;
    onInput?.();
    if (!evaluation.success) {
      setFeedback(`${evaluation.statusTitle}｜${evaluation.statusDetail}`);
      return;
    }
    if (completionStartedRef.current) return;
    completionStartedRef.current = true;
    onSuccessStart?.();
    setFeedback(null);
    setStartupStep(0);
    STARTUP_MESSAGES.forEach((_, index) => {
      startupTimersRef.current.push(
        window.setTimeout(() => setStartupStep(index), index * 380),
      );
    });
    startupTimersRef.current.push(
      window.setTimeout(onComplete, STARTUP_MESSAGES.length * 380 + 420),
    );
  };

  const moveMenuSelection = (direction: number) => {
    if (completing || direction === 0) return;
    const nextTarget = movePowerRoutingMenuTarget(menuSelection, direction);
    if (nextTarget === menuSelection) return;
    onInput?.();
    setMenuSelection(nextTarget);
    if (nextTarget !== "apply") setSelectedId(nextTarget);
  };

  const setSelectedDeviceActive = (active: boolean) => {
    if (completing || menuSelection === "apply") return;
    if (state[menuSelection] === active) return;
    onInput?.();
    setSelectedId(menuSelection);
    setState((current) => ({ ...current, [menuSelection]: active }));
    setFeedback(null);
  };

  useImperativeHandle(controllerRef, () => ({
    activateSelection: () => {
      if (menuSelection === "apply") applyPower();
      else toggleDevice(menuSelection);
    },
    cancel: () => {
      if (completing) return;
      onInput?.();
      onCancel();
    },
    moveSelection: moveMenuSelection,
    setSelectedDeviceActive,
  }));

  const loadCellCount = Math.max(
    POWER_ROUTING_DISPLAY_CELL_COUNT,
    evaluation.load,
  );
  const reserveCapacityPercent = Math.min(
    100,
    Math.max(0, (evaluation.capacity / POWER_ROUTING_RESERVE_MAX_CAPACITY) * 100),
  );

  return (
    <div className="power-puzzle-overlay" data-power-puzzle-open="true">
      <section
        className={`power-puzzle-dialog${evaluation.overloaded ? " is-overloaded" : ""}${completing ? " is-completing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="備用電力重新分配"
      >
        <header className="power-puzzle-header">
          <div className="power-puzzle-title">
            <span aria-hidden="true">⚡</span>
            <div>
              <h2>備用電力重新分配</h2>
              <p>EMERGENCY POWER MANAGEMENT</p>
            </div>
          </div>
          <div className="power-puzzle-capacity">
            <span>備用電力總量<small>TOTAL POWER AVAILABLE</small></span>
            <i
              className="power-capacity-meter"
              role="meter"
              aria-label={`備用電力目前 ${evaluation.capacity} UNIT`}
              aria-valuemin={0}
              aria-valuemax={POWER_ROUTING_RESERVE_MAX_CAPACITY}
              aria-valuenow={evaluation.capacity}
            >
              <b style={{ width: `${reserveCapacityPercent}%` }} />
            </i>
            <strong>{evaluation.capacity} UNIT</strong>
          </div>
          <div className={`power-puzzle-status is-${evaluation.overloaded ? "danger" : evaluation.success ? "stable" : "warning"}`}>
            <span aria-hidden="true">⚠</span>
            <p>供電狀態<small>POWER STATUS</small></p>
            <strong>{displayedStatusTitle}</strong>
          </div>
          <button
            className="power-puzzle-close"
            type="button"
            aria-label="關閉備用電力介面"
            disabled={completing}
            onClick={() => {
              onInput?.();
              onCancel();
            }}
          >
            ×
          </button>
        </header>

        <div className="power-puzzle-body">
          <section className="power-puzzle-device-panel" aria-label="設備清單">
            <header className="power-puzzle-column-headings">
              <span>設備清單<small>SYSTEMS</small></span>
              <span>狀態<small>STATUS</small></span>
              <span>耗電量<small>POWER USAGE</small></span>
            </header>
            <div className="power-puzzle-device-list">
              {POWER_ROUTING_DEVICES.map((device) => {
                const active = state[device.id];
                return (
                  <article
                    className={`power-device-row${selectedId === device.id ? " is-selected" : ""}`}
                    key={device.id}
                    data-device-id={device.id}
                    data-gamepad-selected={menuSelection === device.id || undefined}
                    onClick={() => selectDevice(device.id)}
                  >
                    <button
                      className="power-device-identity"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        selectDevice(device.id);
                      }}
                    >
                      <i aria-hidden="true">{device.icon}</i>
                      <span><strong>{device.name}</strong><small>{device.englishName}</small></span>
                    </button>
                    <button
                      className={`power-breaker${active ? " is-on" : ""}`}
                      type="button"
                      role="switch"
                      aria-checked={active}
                      aria-label={`${device.name}供電${active ? "開啟" : "關閉"}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleDevice(device.id);
                      }}
                    >
                      <span className="power-breaker-track"><i /></span>
                      <strong>{active ? "ON" : "OFF"}</strong>
                    </button>
                    <div className="power-device-cells" aria-label={`${active ? device.power : 0} UNIT`}>
                      {Array.from({ length: POWER_ROUTING_DEVICE_CELL_COUNT }, (_, index) => (
                        <i className={active && index < device.power ? "is-active" : ""} key={index} />
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="power-puzzle-info-panel" aria-label="設備資訊">
            <header>設備資訊<small>SYSTEM INFO</small></header>
            <div className="power-info-identity">
              <i aria-hidden="true">{selectedDevice.icon}</i>
              <span><h3>{selectedDevice.name}</h3><p>{selectedDevice.englishName}</p></span>
            </div>
            <dl>
              <div><dt>用途<small>FUNCTION</small></dt><dd>{selectedDevice.functionLabel}</dd></div>
              <div><dt>狀態<small>STATUS</small></dt><dd className={state[selectedDevice.id] ? "is-on" : ""}>● {state[selectedDevice.id] ? "ON" : "OFF"}</dd></div>
              <div><dt>耗電量<small>POWER</small></dt><dd>{selectedDevice.power} UNIT</dd></div>
              <div><dt>系統類型<small>SYSTEM TYPE</small></dt><dd className={selectedDevice.required ? "is-critical" : ""}>{selectedDevice.required ? "關鍵系統" : "輔助系統"}</dd></div>
              <div><dt>說明<small>DESCRIPTION</small></dt><dd>{selectedDevice.description}</dd></div>
            </dl>
            <figure className="power-info-illustration">
              <img
                key={selectedDevice.id}
                src={selectedDevice.image}
                alt={`${selectedDevice.name}裝置插圖`}
                draggable={false}
              />
            </figure>
          </aside>
        </div>

        <footer className="power-puzzle-footer">
          <section className="power-current-load" aria-label={`目前負載 ${evaluation.load} / ${evaluation.capacity} UNIT`}>
            <span>目前負載<small>CURRENT LOAD</small></span>
            <i className="power-cell-strip is-load" aria-hidden="true">
              {Array.from({ length: loadCellCount }, (_, index) => (
                <b
                  className={`${index >= evaluation.capacity ? "is-unavailable" : ""}${
                    index < evaluation.load
                      ? index >= evaluation.capacity
                        ? " is-active is-overload"
                        : " is-active"
                      : ""
                  }`}
                  key={index}
                />
              ))}
            </i>
            <strong>{evaluation.load} / {evaluation.capacity} UNIT</strong>
          </section>
          <section className={`power-puzzle-feedback is-${completing ? "success" : evaluation.overloaded ? "danger" : "notice"}`} aria-live="polite">
            <span aria-hidden="true">{completing ? "✓" : evaluation.overloaded ? "⚡" : "!"}</span>
            <p>
              {completing
                ? STARTUP_MESSAGES[startupStep ?? 0]
                : feedback ??
                  (evaluation.overloaded
                    ? evaluation.statusDetail
                    : evaluation.success
                      ? "必要系統已完整供電，可以啟動工作臺。"
                      : "閱讀設備資訊，將有限電力重新分配給工作臺所需系統。")}
            </p>
          </section>
          <button
            className={`power-puzzle-apply${menuSelection === "apply" ? " is-gamepad-selected" : ""}`}
            type="button"
            data-gamepad-selected={menuSelection === "apply" || undefined}
            disabled={completing}
            onClick={() => {
              setMenuSelection("apply");
              applyPower();
            }}
          >
            <strong>{completing ? "啟動中…" : "確認供電"}</strong>
            <small>{completing ? "INITIALIZING" : "APPLY POWER"}</small>
          </button>
        </footer>
      </section>
    </div>
  );
});
