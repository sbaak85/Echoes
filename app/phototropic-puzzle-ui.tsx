"use client";
import { forwardRef, useEffect, useLayoutEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import { cursorOwnership } from "./cursor-ownership";
import { createPlantPadState, plantPrimaryAction, stepPlantPad } from "./phototropic-gamepad";
import { GamepadButtonIcon } from "./gamepad-button-icon";
import "./phototropic-puzzle.css";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url";
import { createPlantVines } from "./phototropic-vines";
import { smoothVineProgress } from "./phototropic-vine-geometry.js";
import { PLANT_SUCCESS_BACKGROUND, PLANT_SUCCESS_DIALOGUE_ID, PLANT_SUCCESS_COVER_MS, PLANT_SUCCESS_REVEAL_MS, PLANT_SUCCESS_EXIT_MS, startPlantSuccessTransition, type PlantSuccessPhase } from "./phototropic-success-transition";
import { initialPhototropicState, isPhototropicClear, loadPhototropicState, normalizePhototropicState, plantDialAngle, PLANT_DIAL, plantEquilibrium, plantPresentationStart, PLANT_GROW_MS, savePhototropicState, type PhototropicState, type PlantSide } from "./phototropic-puzzle";

type PlantView = { id?: number; side: PlantSide; imagePath: string; initial: PhototropicState };
export type PlantUiController = {
  key: (key: string, repeat: boolean) => void;
  pad: (x: number, y: number, confirm: boolean, back: boolean, dt: number, rightX?: number, fineX?: number) => boolean;
  point: (x: number, y: number) => void;
};
export function usePhototropicPuzzle(onSolved: () => void, onSaved: () => void) {
  const callbacks = useRef({ onSolved, onSaved }); callbacks.current = { onSolved, onSaved };
  const [view, setView] = useState<PlantView | null>(null);
  const state = useRef(initialPhototropicState());
  const pending = useRef<((completed: boolean) => void) | null>(null);
  const control = useRef<PlantUiController | null>(null);
  const viewId = useRef(0);
  const api = useRef({
    get isOpen() { return pending.current !== null; },
    get state() { return state.current; },
    hydrate(value?: PhototropicState) { state.current = value ? normalizePhototropicState(value) : loadPhototropicState(); },
    open(side: PlantSide, imagePath: string) {
      api.current.cancel();
      setView({ id: ++viewId.current, side, imagePath, initial: structuredClone(state.current) });
      return new Promise<boolean>(resolve => { pending.current = resolve; });
    },
    finish(next: PhototropicState, solved: boolean) {
      state.current = normalizePhototropicState({ ...next, solved: next.solved || solved });
      savePhototropicState(state.current);
      const resolve = pending.current; pending.current = null; setView(null);
      callbacks.current.onSaved();
      if (solved) callbacks.current.onSolved();
      resolve?.(true);
    },
    markIntroduced() {
      if (state.current.introduced) return;
      state.current = { ...state.current, introduced: true };
      savePhototropicState(state.current);
      callbacks.current.onSaved();
    },
    cancel() { const resolve = pending.current; pending.current = null; setView(null); resolve?.(false); },
    key(key: string, repeat: boolean) { control.current?.key(key, repeat); },
    pad(x: number, y: number, confirm: boolean, back: boolean, dt: number, rightX = 0, fineX = 0) { return control.current?.pad(x, y, confirm, back, dt, rightX, fineX) ?? false; },
    point(x: number, y: number) { control.current?.point(x, y); },
  });
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  return { view, controller: api.current, control };
}

function Socket({ occupied, angle }: { occupied: boolean; angle: number }) {
  return <span className={`plant-socket${occupied ? " occupied" : ""}`} style={{ "--plant-beam-angle": `${angle - 60}deg` } as CSSProperties} aria-hidden="true">
    {occupied && <><span className="plant-stick-halo" /><span className="plant-stick-beam" />
    <img src={resolveRuntimePublicAssetUrl("ui/phototropic/glow-stick.png")} className="plant-stick" alt="" draggable={false} /></>}
  </span>;
}

export const PhototropicPuzzleOverlay = forwardRef<PlantUiController, { view: PlantView; onFinish: (state: PhototropicState, solved: boolean) => void; onSuccessDialogue: (id: string) => Promise<{ completed: boolean }>; onIntroduced?: () => void; gamepadMode?: boolean }>(function PhototropicPuzzleOverlay({ view, onFinish, onSuccessDialogue, onIntroduced, gamepadMode = false }, ref) {
  const [draft, setDraft] = useState(() => normalizePhototropicState(view.initial));
  const draftRef = useRef(draft); draftRef.current = draft;
  const presentation = useRef(plantPresentationStart(view.initial)).current;
  const [ready, setReady] = useState(!presentation.playEntrance);
  const readyRef = useRef(!presentation.playEntrance);
  const entrySlot = view.initial[view.side].slot ?? 1;
  const [selected, setSelected] = useState(gamepadMode ? entrySlot : -1);
  const selectedRef = useRef(gamepadMode ? entrySlot : -1);
  const [mode, setMode] = useState(gamepadMode && cursorOwnership.owner === "gamepad" ? "directional" : cursorOwnership.owner);
  const [dragging, setDragging] = useState(false);
  const dialDrag = useRef<{ id: number; offset: number; element: SVGSVGElement; owner: typeof cursorOwnership.owner } | null>(null);
  const leftHost = useRef<HTMLDivElement>(null), rightHost = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const [successPhase, setSuccessPhase] = useState<PlantSuccessPhase | null>(null);
  const successActive = successPhase !== null;
  const successImagePath = resolveRuntimePublicAssetUrl(PLANT_SUCCESS_BACKGROUND);
  const finishRef = useRef(onFinish); finishRef.current = onFinish;
  const dialogueRef = useRef(onSuccessDialogue); dialogueRef.current = onSuccessDialogue;
  const introducedRef = useRef(onIntroduced); introducedRef.current = onIntroduced;
  const repeat = useRef({ ...createPlantPadState(), slot: entrySlot });
  const endDialDrag = () => {
    const active = dialDrag.current; dialDrag.current = null;
    if (active?.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id);
    setDragging(false);
  };
  const dialCoordinates = (dial: SVGSVGElement, x: number, y: number) => {
    const matrix = dial.getScreenCTM();
    return matrix ? new DOMPoint(x, y).matrixTransform(matrix.inverse()) : null;
  };
  const change = (slot: number | null, angle = draftRef.current[view.side].angle) => {
    if (!readyRef.current || closing.current) return;
    const clamped = Math.max(0, Math.min(120, Math.round(angle)));
    if (draftRef.current[view.side].slot === slot && draftRef.current[view.side].angle === clamped) return;
    const next = { ...draftRef.current, [view.side]: { slot, angle: clamped } };
    draftRef.current = next; setDraft(next);
  };
  const beginSuccess = () => {
    if (closing.current) return;
    endDialDrag();
    closing.current = true;
    setSuccessPhase("cover");
  };
  const finish = () => {
    if (closing.current) return;
    if (!draftRef.current.solved && isPhototropicClear(draftRef.current)) { beginSuccess(); return; }
    endDialDrag();
    closing.current = true; finishRef.current(draftRef.current, false);
  };
  const select = (index: number) => { selectedRef.current = index; if (index >= 0 && index < 3) repeat.current.slot = index; setSelected(index); };
  const navigate = (direction: string) => {
    if (!readyRef.current || closing.current) return;
    cursorOwnership.take("directional");
    const lamp = draftRef.current[view.side], index = selectedRef.current < 0 ? repeat.current.slot : selectedRef.current;
    if (index === 3 && (direction === "left" || direction === "right")) change(lamp.slot, lamp.angle + (direction === "left" ? -1 : 1));
    else { const options = lamp.slot === null ? [0, 1, 2, 4] : [0, 1, 2, 3, 4]; select(options[(options.indexOf(index) + (direction === "left" || direction === "up" ? -1 : 1) + options.length) % options.length]); }
  };
  const place = (index: number, advanceFocus = false) => {
    if (!readyRef.current || closing.current || plantPrimaryAction(index, draftRef.current[view.side].slot) !== "place") return;
    change(index);
    // Preserve the socket as the horizontal navigation anchor, then hand A to confirmation.
    select(index);
    if (advanceFocus) select(4);
  };
  const activate = () => {
    if (!readyRef.current || closing.current) return;
    const index = selectedRef.current;
    const action = plantPrimaryAction(index, draftRef.current[view.side].slot);
    if (action === "place") place(index, true);
    else if (action === "finish") finish();
  };
  useImperativeHandle(ref, () => ({
    point(x, y) {
      const dial = overlay.current?.querySelector<SVGSVGElement>(".plant-angle-dial");
      if (!dial || draftRef.current[view.side].slot === null) return;
      const point = dialCoordinates(dial, x, y);
      if (point) change(draftRef.current[view.side].slot, plantDialAngle(point.x, point.y, draftRef.current[view.side].angle));
    },
    key(key, held) {
      if (!readyRef.current || closing.current || !["arrowleft", "arrowright", "arrowup", "arrowdown", "tab", "enter", " ", "escape"].includes(key)) return;
      // Keyboard and pad share directional ownership, but held pad input must
      // still release before it can take control back from the keyboard.
      repeat.current = { ...createPlantPadState(), slot: repeat.current.slot };
      cursorOwnership.take("directional");
      if (selectedRef.current < 0) select(repeat.current.slot);
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "tab"].includes(key)) navigate(key === "tab" ? "down" : key.slice(5));
      else if (!held && ["enter", " "].includes(key)) activate();
      else if (!held && key === "escape") finish();
    },
    pad(x, y, confirm, back, dt, rightX = 0, fineX = 0) {
      if (!readyRef.current || closing.current) return false;
      const action = stepPlantPad(repeat.current, { x, y, rightX, fineX, confirm, back, dt, selected: selectedRef.current, lamp: draftRef.current[view.side] });
      if (action.active) {
        cursorOwnership.take("directional");
        // A mouse/keyboard dial target is not part of gamepad navigation.
        select(action.selected);
      }
      if (action.angle !== null) change(draftRef.current[view.side].slot, action.angle);
      if (action.activate) activate();
      if (action.back) finish();
      return action.active;
    },
  }));
  useEffect(() => {
    if (cursorOwnership.owner === "gamepad") { cursorOwnership.take("directional"); setMode("directional"); }
    return cursorOwnership.subscribe(owner => { if (dialDrag.current && dialDrag.current.owner !== owner) endDialDrag(); setMode(owner); document.activeElement instanceof HTMLElement && document.activeElement.blur(); if (owner === "mouse" || owner === "touch") repeat.current = { ...createPlantPadState(), slot: repeat.current.slot }; });
  }, []);
  useEffect(() => {
    const reset = () => { endDialDrag(); repeat.current = { ...createPlantPadState(), slot: repeat.current.slot }; };
    window.addEventListener("blur", reset); window.addEventListener("gamepaddisconnected", reset);
    return () => { endDialDrag(); window.removeEventListener("blur", reset); window.removeEventListener("gamepaddisconnected", reset); };
  }, []);
  useEffect(() => {
    // Preload without resizing, masking or otherwise changing the supplied PNG.
    const image = new Image(); image.src = successImagePath;
  }, [successImagePath]);
  useEffect(() => {
    if (!successActive) return;
    return startPlantSuccessTransition(setSuccessPhase,
      () => dialogueRef.current(PLANT_SUCCESS_DIALOGUE_ID),
      completed => finishRef.current(draftRef.current, completed));
  }, [successActive]);
  useLayoutEffect(() => {
    const vines = createPlantVines(leftHost.current!, rightHost.current!);
    let raf = 0, previous = performance.now(), started = previous;
    const position = { ...presentation.position };
    // Paint the saved equilibrium immediately; reopening must never grow from zero.
    vines.update(position.left, position.right, previous / 1000, 0, presentation.playEntrance ? 0 : 1);
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(.05, (now - previous) / 1000)); previous = now;
      const growth = presentation.playEntrance ? smoothVineProgress((now - started) / PLANT_GROW_MS) : 1;
      if (growth >= 1 && !readyRef.current) {
        draftRef.current = { ...draftRef.current, introduced: true };
        setDraft(draftRef.current); readyRef.current = true; setReady(true);
        introducedRef.current?.();
      }
      const target = readyRef.current ? plantEquilibrium(draftRef.current) : { left: 0, right: 0 };
      const k = 1 - Math.exp(-dt * 1.6);
      position.left += (target.left - position.left) * k; position.right += (target.right - position.right) * k;
      vines.update(position.left, position.right, now / 1000, dt, growth);
      if (readyRef.current && !draftRef.current.solved && isPhototropicClear(draftRef.current) && position.left <= -31.5 && position.right >= 31.5) beginSuccess();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); vines.dispose(); };
  }, []);
  const lamp = draft[view.side];
  const initialLamp = view.initial[view.side];
  const dirty = lamp.slot !== initialLamp.slot || lamp.angle !== initialLamp.angle;
  const showPadTips = !successActive && gamepadMode && mode === "directional";
  const successImageVisible = view.initial.solved || successActive && successPhase !== "cover";
  const controlsVisible = ready && (!successActive || successPhase === "cover");
  const primaryAction = plantPrimaryAction(selected, lamp.slot);
  // Presentation is centered on the forward direction; saved puzzle angles stay 0..120.
  const displayAngle = lamp.angle - 60;
  const displayAngleText = displayAngle > 0 ? `+${displayAngle}` : String(displayAngle);
  const phi = (lamp.angle - 60) * Math.PI / 180, knobX = PLANT_DIAL.x + Math.sin(phi) * PLANT_DIAL.radius, knobY = PLANT_DIAL.y - Math.cos(phi) * PLANT_DIAL.radius;
  const dialPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = dialCoordinates(event.currentTarget, event.clientX, event.clientY);
    if (!point || Math.hypot(point.x - PLANT_DIAL.x, point.y - PLANT_DIAL.y) < PLANT_DIAL.deadZone) return;
    const active = dialDrag.current;
    change(draftRef.current[view.side].slot, plantDialAngle(point.x, point.y, draftRef.current[view.side].angle, active?.offset ?? 0));
  };
  const startDialDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!readyRef.current || closing.current || event.button !== 0) return;
    event.preventDefault();
    if (event.pointerType === "touch") cursorOwnership.take("touch");
    else cursorOwnership.recordMouse(event.clientX, event.clientY, true);
    const point = dialCoordinates(event.currentTarget, event.clientX, event.clientY);
    if (!point) return;
    const current = draftRef.current[view.side].angle;
    const onHandle = (event.target as Element).closest(".plant-dial-grip");
    const pointerAngle = Math.atan2(point.x - PLANT_DIAL.x, PLANT_DIAL.y - point.y) * 180 / Math.PI + 60;
    dialDrag.current = { id: event.pointerId, element: event.currentTarget, owner: cursorOwnership.owner, offset: onHandle ? current - pointerAngle : 0 };
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); select(3); dialPoint(event);
  };
  return <div ref={overlay} className="plant-puzzle-overlay" data-control-mode={mode} data-success-phase={successPhase ?? undefined} style={{ "--plant-success-cover": `${PLANT_SUCCESS_COVER_MS}ms`, "--plant-success-reveal": `${PLANT_SUCCESS_REVEAL_MS}ms`, "--plant-success-exit": `${PLANT_SUCCESS_EXIT_MS}ms` } as CSSProperties} data-play-entrance={presentation.playEntrance} data-restored-left={presentation.position.left} data-restored-right={presentation.position.right} role="dialog" aria-modal="true" aria-busy={successActive || undefined} aria-label={`${view.side === "L" ? "左" : "右"}側趨光植物光源調整`}
    onPointerDown={e => { e.stopPropagation(); if (e.pointerType === "touch") cursorOwnership.take("touch"); else cursorOwnership.recordMouse(e.clientX, e.clientY, true); }}
    onPointerMove={e => { if (e.pointerType === "mouse") cursorOwnership.recordMouse(e.clientX, e.clientY); }} onPointerCancel={() => { repeat.current.armed = false; }}>
    <img className="plant-puzzle-background" src={successImageVisible ? successImagePath : view.imagePath} alt="趨光植物背景" draggable={false} />
    {successActive && <div className="plant-success-curtain" aria-hidden="true" />}
    <div className="plant-vines plant-vines-left" ref={leftHost} /><div className="plant-vines plant-vines-right" ref={rightHost} />
    {!ready && <p className="plant-growing-message" role="status">藤蔓正在延伸，擋住中央通道…</p>}
    {controlsVisible && <section className="plant-panel plant-controls-unframed" inert={successActive}>
      <header className="plant-controls-heading">
      <p className="plant-eyebrow">PHOTOTROPIC FIELD CONTROL</p>
      <h2>{view.side === "L" ? "左側光源" : "右側光源"}</h2>
      <p className="plant-description">插入螢光棒，觀察兩叢藤蔓，再調整照射方向。</p>
      <p className="plant-note">本側調整會同時牽動兩叢植物 · <span className="plant-setting-status" data-pending={dirty || undefined} role="status">{dirty ? "設定已變更 · 返回時保存" : lamp.slot === null ? "尚未放置螢光棒" : "目前設定已保存"}</span></p>
      </header>
      <div className="plant-slots">
        {showPadTips && <p className="plant-position-tip"><GamepadButtonIcon button="LS" /><span>左右選格 · 上下切換確認</span></p>}
        {[0, 1, 2].map(i => <button key={i} type="button" disabled={successActive} aria-label={`${view.side}${i + 1}`} aria-pressed={lamp.slot === i} data-selected={mode === "directional" && selected === i || undefined} className={lamp.slot === i ? "is-inserted" : ""} onFocus={() => select(i)} onClick={() => place(i)}>
        <Socket occupied={lamp.slot === i} angle={lamp.angle} /><span className="plant-slot-label">{lamp.slot === i ? "已放置" : ["靠左", "置中", "靠右"][i]}</span>
        {showPadTips && selected === i && primaryAction === "place" && <span className="plant-place-tip"><GamepadButtonIcon button="A" /><span>擺放</span></span>}
      </button>)}</div>
      {lamp.slot !== null && <div className={`plant-angle-control${dragging ? " is-dragging" : ""}`} data-selected={mode === "directional" && selected === 3 || undefined}>
        <p className="plant-angle-tip">
          {!successActive && mode === "mouse" && <img className="plant-angle-input-icon" src={resolveRuntimePublicAssetUrl("ui/input/mouse-left.svg")} alt="滑鼠左鍵" draggable={false} />}
          {!successActive && gamepadMode && (mode === "directional" || mode === "gamepad") && <GamepadButtonIcon button="RS" />}
          <span>調整角度</span>
          {!successActive && gamepadMode && (mode === "directional" || mode === "gamepad") && <><span className="plant-angle-tip-divider" aria-hidden="true">·</span><GamepadButtonIcon button="DPadLeft" /><GamepadButtonIcon button="DPadRight" /><span>微調 1°</span></>}
        </p>
        <div className="plant-angle-body"><svg viewBox="0 0 360 180" className="plant-angle-dial" role="slider" aria-label="照射角度" aria-valuemin={-60} aria-valuemax={60} aria-valuenow={displayAngle} aria-valuetext={`${displayAngleText} 度`} aria-disabled={successActive || undefined} tabIndex={successActive ? -1 : 0} data-selected={mode === "directional" && selected === 3 || undefined}
          onFocus={() => select(3)} onPointerDown={startDialDrag} onPointerMove={e => { if (dialDrag.current?.id === e.pointerId) dialPoint(e); }} onPointerUp={endDialDrag} onPointerCancel={endDialDrag} onLostPointerCapture={endDialDrag}>
          <path d="M180 146 L93.397 96 A100 100 0 0 1 266.603 96 Z" className="plant-dial-sector" />
          <path d="M76.077 86 A120 120 0 0 1 283.923 86" className="plant-dial-outer" />
          <path d="M93.397 96 A100 100 0 0 1 266.603 96" className="plant-dial-track-bed" />
          <path d="M93.397 96 A100 100 0 0 1 266.603 96" className="plant-dial-track" />
          {lamp.angle > 0 && <path d={`M93.397 96 A100 100 0 0 1 ${knobX} ${knobY}`} className="plant-dial-progress" />}
          {Array.from({ length: 25 }, (_, i) => { const t = (i * 5 - 60) * Math.PI / 180, major = i % 6 === 0; return <line key={i} x1={180 + Math.sin(t) * (major ? 107 : 112)} y1={146 - Math.cos(t) * (major ? 107 : 112)} x2={180 + Math.sin(t) * 120} y2={146 - Math.cos(t) * 120} className={`plant-dial-tick${major ? " is-major" : ""}`} />; })}
          <g transform={`rotate(${lamp.angle - 60} 180 146)`}>
            <path d="M180 146 L180 46" className="plant-dial-lever-bed" /><path d="M180 134 L180 65" className="plant-dial-pointer" />
            <g className="plant-dial-grip" transform="translate(180 46)">
              <circle r="38" className="plant-dial-hit" />
              <circle r="23" className="plant-dial-handle-ring" /><rect x="-17" y="-13" width="34" height="26" rx="5" className="plant-dial-handle" />
              <path d="M-7 -5 V5 M0 -5 V5 M7 -5 V5" className="plant-dial-grip-lines" />
            </g>
          </g>
          <circle cx="180" cy="146" r="14" className="plant-dial-pivot" /><circle cx="180" cy="146" r="5" className="plant-dial-pivot-core" />
          <foreignObject x="130" y="170" width="100" height="42" className="plant-dial-readout">
            <output className="plant-angle-value" aria-label="目前照射角度" aria-live="off">{displayAngleText}<span>°</span></output>
          </foreignObject>
        </svg></div>
      </div>}
      <button className="plant-confirm" type="button" disabled={successActive} data-selected={mode === "directional" && selected === 4 || undefined} onFocus={() => select(4)} onClick={() => finish()}>
        <span className="hud-frame-art" aria-hidden="true"><span className="hud-frame-glow" /></span><span className="craft-action-texture" aria-hidden="true" />
        {showPadTips && (primaryAction === "finish" || !dirty) && <GamepadButtonIcon button={primaryAction === "finish" ? "A" : "B"} />}
        <span>{dirty ? "確定擺放" : "返回場景"}</span>
      </button>
    </section>}
  </div>;
});
