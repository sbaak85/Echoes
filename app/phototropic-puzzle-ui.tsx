"use client";
import { forwardRef, useEffect, useLayoutEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import { cursorOwnership } from "./cursor-ownership";
import "./phototropic-puzzle.css";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url";
import { createPlantVines } from "./phototropic-vines";
import { initialPhototropicState, isPhototropicClear, loadPhototropicState, normalizePhototropicState, plantAngleFromPoint, plantEquilibrium, plantPresentationStart, PLANT_GROW_MS, savePhototropicState, type PhototropicState, type PlantSide } from "./phototropic-puzzle";

type PlantView = { id?: number; side: PlantSide; imagePath: string; initial: PhototropicState };
export type PlantUiController = {
  key: (key: string, repeat: boolean) => void;
  pad: (x: number, y: number, confirm: boolean, back: boolean, dt: number) => void;
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
    pad(x: number, y: number, confirm: boolean, back: boolean, dt: number) { control.current?.pad(x, y, confirm, back, dt); },
    point(x: number, y: number) { control.current?.point(x, y); },
  });
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  return { view, controller: api.current, control };
}

function Socket({ occupied, angle }: { occupied: boolean; angle: number }) {
  return <span className={`plant-socket${occupied ? " occupied" : ""}`} style={{ "--plant-beam-angle": `${angle - 60}deg` } as CSSProperties} aria-hidden="true">
    <span className="plant-stick-beam" />
    <img src={resolveRuntimePublicAssetUrl("ui/phototropic/glow-stick.png")} className="plant-stick" alt="" draggable={false} />
    <span className="plant-base"><span className="plant-hole" /><span className="plant-rim" /></span>
  </span>;
}

export const PhototropicPuzzleOverlay = forwardRef<PlantUiController, { view: PlantView; onFinish: (state: PhototropicState, solved: boolean) => void; onIntroduced?: () => void }>(function PhototropicPuzzleOverlay({ view, onFinish, onIntroduced }, ref) {
  const [draft, setDraft] = useState(() => normalizePhototropicState(view.initial));
  const draftRef = useRef(draft); draftRef.current = draft;
  const presentation = useRef(plantPresentationStart(view.initial)).current;
  const [ready, setReady] = useState(!presentation.playEntrance);
  const readyRef = useRef(!presentation.playEntrance);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(0);
  const [mode, setMode] = useState(cursorOwnership.owner);
  const leftHost = useRef<HTMLDivElement>(null), rightHost = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const finishRef = useRef(onFinish); finishRef.current = onFinish;
  const introducedRef = useRef(onIntroduced); introducedRef.current = onIntroduced;
  const repeat = useRef({ dir: "", seconds: 0, armed: false });
  const change = (slot: number | null, angle = draftRef.current[view.side].angle) => {
    if (!readyRef.current || closing.current) return;
    setDirty(true);
    const next = { ...draftRef.current, [view.side]: { slot, angle: Math.max(0, Math.min(120, Math.round(angle))) } };
    draftRef.current = next; setDraft(next);
  };
  const finish = (solved = false) => {
    if (closing.current) return;
    closing.current = true; finishRef.current(draftRef.current, solved);
  };
  const select = (index: number) => { selectedRef.current = index; setSelected(index); };
  const navigate = (direction: string) => {
    if (!readyRef.current || closing.current) return;
    cursorOwnership.take("directional");
    const lamp = draftRef.current[view.side], index = selectedRef.current;
    if (index === 3 && (direction === "left" || direction === "right")) change(lamp.slot, lamp.angle + (direction === "left" ? -1 : 1));
    else { const options = lamp.slot === null ? [0, 1, 2, 4] : [0, 1, 2, 3, 4]; select(options[(options.indexOf(index) + (direction === "left" || direction === "up" ? -1 : 1) + options.length) % options.length]); }
  };
  const activate = () => {
    if (!readyRef.current) return;
    const index = selectedRef.current;
    if (index < 3) change(index);
    else if (index === 4) finish();
  };
  useImperativeHandle(ref, () => ({
    point(x, y) {
      const dial = overlay.current?.querySelector(".plant-angle-dial");
      if (!dial || draftRef.current[view.side].slot === null) return;
      const box = dial.getBoundingClientRect();
      change(draftRef.current[view.side].slot, plantAngleFromPoint((x - box.left) / box.width * 300 - 150, (y - box.top) / box.height * 185 - 150));
    },
    key(key, held) {
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "tab", "enter", " ", "escape"].includes(key)) cursorOwnership.take("directional");
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "tab"].includes(key)) navigate(key === "tab" ? "down" : key.slice(5));
      else if (!held && ["enter", " "].includes(key)) activate();
      else if (!held && key === "escape") finish();
    },
    pad(x, y, confirm, back, dt) {
      const r = repeat.current, dir = Math.abs(x) > .55 ? (x > 0 ? "right" : "left") : Math.abs(y) > .55 ? (y > 0 ? "down" : "up") : "";
      if (!r.armed) { if (!dir && !confirm && !back) r.armed = true; return; }
      if (dir) { r.seconds -= dt; if (dir !== r.dir || r.seconds <= 0) { navigate(dir); r.seconds = dir !== r.dir ? .36 : .115; } } else r.seconds = 0;
      r.dir = dir;
      if (confirm) { cursorOwnership.take("directional"); activate(); }
      if (back) finish();
    },
  }));
  useEffect(() => {
    return cursorOwnership.subscribe(owner => { setMode(owner); document.activeElement instanceof HTMLElement && document.activeElement.blur(); if (owner === "mouse" || owner === "touch") repeat.current = { dir: "", seconds: 0, armed: false }; });
  }, []);
  useEffect(() => {
    const reset = () => { repeat.current = { dir: "", seconds: 0, armed: false }; };
    window.addEventListener("blur", reset); window.addEventListener("gamepaddisconnected", reset);
    return () => { window.removeEventListener("blur", reset); window.removeEventListener("gamepaddisconnected", reset); };
  }, []);
  useLayoutEffect(() => {
    const vines = createPlantVines(leftHost.current!, rightHost.current!);
    let raf = 0, previous = performance.now(), started = previous, hold = 0;
    const position = { ...presentation.position };
    // Paint the saved equilibrium immediately; reopening must never grow from zero.
    vines.update(position.left, position.right, previous / 1000, 0, presentation.playEntrance ? 0 : 1);
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(.05, (now - previous) / 1000)); previous = now;
      const growth = presentation.playEntrance ? Math.max(0, Math.min(1, (now - started) / PLANT_GROW_MS)) : 1;
      if (growth >= 1 && !readyRef.current) {
        draftRef.current = { ...draftRef.current, introduced: true };
        setDraft(draftRef.current); readyRef.current = true; setReady(true);
        introducedRef.current?.();
      }
      const target = readyRef.current ? plantEquilibrium(draftRef.current) : { left: 0, right: 0 };
      const k = 1 - Math.exp(-dt * 1.6);
      position.left += (target.left - position.left) * k; position.right += (target.right - position.right) * k;
      vines.update(position.left, position.right, now / 1000, dt, growth);
      hold = readyRef.current && !draftRef.current.solved && isPhototropicClear(draftRef.current) && position.left <= -31.5 && position.right >= 31.5 ? hold + dt : 0;
      if (hold >= 1 && !closing.current) { closing.current = true; finishRef.current(draftRef.current, true); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); vines.dispose(); };
  }, []);
  const lamp = draft[view.side];
  const phi = (lamp.angle - 60) * Math.PI / 180, knobX = 150 + Math.sin(phi) * 100, knobY = 150 - Math.cos(phi) * 100;
  const dialPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    change(lamp.slot, plantAngleFromPoint((event.clientX - box.left) / box.width * 300 - 150, (event.clientY - box.top) / box.height * 185 - 150));
  };
  return <div ref={overlay} className="plant-puzzle-overlay" data-control-mode={mode} data-play-entrance={presentation.playEntrance} data-restored-left={presentation.position.left} data-restored-right={presentation.position.right} role="dialog" aria-modal="true" aria-label={`${view.side === "L" ? "左" : "右"}側趨光植物光源調整`}
    onPointerDown={e => { e.stopPropagation(); if (e.pointerType === "touch") cursorOwnership.take("touch"); else cursorOwnership.recordMouse(e.clientX, e.clientY, true); }}
    onPointerMove={e => { if (e.pointerType === "mouse") cursorOwnership.recordMouse(e.clientX, e.clientY); }} onPointerCancel={() => { repeat.current.armed = false; }}>
    <img className="plant-puzzle-background" src={view.imagePath} alt="趨光植物背景" draggable={false} />
    <div className="plant-vines plant-vines-left" ref={leftHost} /><div className="plant-vines plant-vines-right" ref={rightHost} />
    {!ready && <p className="plant-growing-message" role="status">藤蔓正在延伸，擋住中央通道…</p>}
    {ready && <section className="plant-panel plant-controls-unframed">
      <p className="plant-eyebrow">PHOTOTROPIC FIELD CONTROL</p>
      <h2>{view.side === "L" ? "左側光源" : "右側光源"}</h2>
      <p className="plant-description">插入螢光棒，觀察兩叢藤蔓，再調整照射方向。</p>
      <div className="plant-slots">{[0, 1, 2].map(i => <button key={i} type="button" aria-label={`${view.side}${i + 1}`} aria-pressed={lamp.slot === i} data-selected={mode === "directional" && selected === i || undefined} className={lamp.slot === i ? "is-inserted" : ""} onClick={() => change(i)}>
        <Socket occupied={lamp.slot === i} angle={lamp.angle} /><strong>{view.side}{i + 1}</strong><small>{lamp.slot === i ? "已插入" : "空槽"}</small>
      </button>)}</div>
      {lamp.slot !== null && <div className="plant-angle-control">
        <div className="plant-angle-heading"><span>照射角度</span><output>{lamp.angle}°</output></div>
        <svg viewBox="0 0 300 185" className="plant-angle-dial" role="slider" aria-label="照射角度" aria-valuemin={0} aria-valuemax={120} aria-valuenow={lamp.angle} tabIndex={0} data-selected={mode === "directional" && selected === 3 || undefined}
          onFocus={() => select(3)} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); dialPoint(e); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) dialPoint(e); }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}>
          <path d="M150 150 L63.4 100 A100 100 0 0 1 236.6 100 Z" className="plant-dial-sector" />
          <path d="M63.4 100 A100 100 0 0 1 236.6 100" className="plant-dial-track" />
          {Array.from({ length: 13 }, (_, i) => { const t = (i * 10 - 60) * Math.PI / 180; return <line key={i} x1={150 + Math.sin(t) * 90} y1={150 - Math.cos(t) * 90} x2={150 + Math.sin(t) * 100} y2={150 - Math.cos(t) * 100} className="plant-dial-tick" />; })}
          <line x1="150" y1="150" x2={knobX} y2={knobY} className="plant-dial-pointer" /><circle cx="150" cy="150" r="12" className="plant-dial-pivot" /><circle cx={knobX} cy={knobY} r="9" className="plant-dial-handle" />
          <text x="44" y="127">0°</text><text x="137" y="32">60°</text><text x="242" y="127">120°</text>
        </svg><small>按住扇形旋鈕拖曳 · 方向控制選到旋鈕後左右微調</small>
      </div>}
      <button className="plant-confirm" type="button" data-selected={mode === "directional" && selected === 4 || undefined} onClick={() => finish()}>{dirty ? "擺放確定" : "返回場景"}</button>
      <p className="plant-note">本側調整會同時牽動兩叢植物 · 確定後保留設定</p>
    </section>}
  </div>;
});
