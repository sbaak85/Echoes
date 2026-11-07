"use client";

// 迫降大氣漸變預覽：船艙背景星空漸變成大氣天空，同時星空／星雲／船身光痕逐漸加速。
// 星空、星雲、光痕直接使用遊戲本身的模組（scene-starfield、scene-hull-streams），天空層為本頁新做的預覽。
// 開啟：http://127.0.0.1:3000/atmosphere-preview
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createSceneStarfield, type SceneBackdropConfig } from "../scene-starfield";
import { createHullStreams, type HullStreamLane } from "../scene-hull-streams";
import shipScene from "../../public/maps/ship_interior.scene.json";
// 已記下的參數（2026-11-08 定案）：作為預設值，「還原預設」回到這組
import savedParams from "../../public/effects/chapter02_atmosphere_entry.json";
import "./preview.css";
import {
  ATMOSPHERE_ENTRY_BASE_PARAMS, createAtmosphereBackdrop, createBowFlame, resolveAtmosphereEntryState,
  type AtmosphereEntryParams, type Curve,
} from "../atmosphere-entry";

type Params = AtmosphereEntryParams;

const BASE_PARAMS: Params = ATMOSPHERE_ENTRY_BASE_PARAMS;

const DEFAULT_PARAMS: Params = { ...BASE_PARAMS, ...(savedParams as Partial<Params>) };

const STORAGE_KEY = "echoes:atmosphere-preview:v1";
/** 遊戲中光痕速度 = 星空速度倍率 ÷ 0.6（場景 JSON 的 backdrop.speed） */
const SCENE_BACKDROP_SPEED = (shipScene as { backdrop?: { speed?: number } }).backdrop?.speed ?? 0.6;
const WORLD = (shipScene as { world: { width: number; height: number } }).world;
const HULL_LANES = ((shipScene as { hullStreams?: HullStreamLane[] }).hullStreams ?? []) as HullStreamLane[];

function loadParams(): Params {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_PARAMS;
    const { cloudCount: _legacy, ...rest } = JSON.parse(saved) as Partial<Params> & { cloudCount?: number };
    return { ...DEFAULT_PARAMS, ...rest };
  } catch {
    return DEFAULT_PARAMS;
  }
}

type ControlProps = { label: string; hint?: string; children: ReactNode };
function Row({ label, hint, children }: ControlProps) {
  return <label className="ap-row" data-nav-row><span className="ap-label">{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

export default function AtmospherePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const timeRef = useRef(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [owner, setOwner] = useState<"mouse" | "directional">("mouse");
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState("");
  const [readout, setReadout] = useState({ sky: 0, speed: 0, clouds: 0, flame: 0 });

  useEffect(() => { setParams(loadParams()); }, []);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch { /* 預覽設定只是方便用，存不了也沒關係 */ }
  }, [params]);

  const set = useCallback(<K extends keyof Params>(key: K, value: Params[K]) => {
    setParams((current) => ({ ...current, [key]: value }));
  }, []);

  // 繪製迴圈
  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    const starfield = createSceneStarfield();
    const hull = createHullStreams();
    const backdropLayer = createAtmosphereBackdrop();
    const bowFlame = createBowFlame();
    const ship = new Image();
    ship.src = "./maps/ship_interior.png";
    const wall = new Image();
    wall.src = "./maps/ship_interior_Wall.png";
    let frame = 0;
    let last: number | null = null;
    let readoutAt = 0;
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const p = paramsRef.current;
      const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) {
        timeRef.current += dt;
        if (timeRef.current > p.duration) timeRef.current = p.loop ? 0 : p.duration;
      }
      const t = timeRef.current;
      const state = resolveAtmosphereEntryState(p, t);
      const { skyProgress, speed, flameIntensity, cloudCount } = state;

      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (width < 1 || height < 1) return;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = "#06101b";
      context.fillRect(0, 0, width, height);

      // 1＋2. 星空＋流動星雲（遊戲模組）→ 大氣天空＋摩擦光＋雲朵 → 星點透出（共用模組 atmosphere-entry）
      const backdrop: SceneBackdropConfig = {
        type: "starfield", mode: "warp", speed, density: p.density, angle: p.flowAngle, clouds: true, cloudOpacity: p.nebulaOpacity,
      };
      backdropLayer.draw(context, width, height, ratio, dt, p, state, (starContext) => starfield.draw(starContext, width, height, now, backdrop));

      // 3. 船艙（地圖座標，鏡頭置中）＋船身光痕（遊戲模組）
      context.save();
      context.translate(width / 2, height / 2);
      context.scale(p.zoom, p.zoom);
      context.translate(-WORLD.width / 2, -WORLD.height / 2);
      const hullSpeed = (speed / SCENE_BACKDROP_SPEED) * p.hullBoost;
      const lanes = HULL_LANES.map((lane) => ({ ...lane, speed: (lane.speed ?? 1) * hullSpeed }));
      if (p.showHull) hull.draw(context, lanes, "back", now, "warp");
      // 噴焰每幀只推進一次，依設定畫在船下方或上方
      if (!p.flameEnabled) bowFlame.reset();
      else if (p.flameLayer === "back") bowFlame.draw(context, dt, now, p, flameIntensity);
      if (ship.complete && ship.naturalWidth) context.drawImage(ship, 0, 0, WORLD.width, WORLD.height);
      if (wall.complete && wall.naturalWidth) context.drawImage(wall, 0, 0, WORLD.width, WORLD.height);
      if (p.flameEnabled && p.flameLayer === "front") bowFlame.draw(context, dt, now, p, flameIntensity);
      if (p.flameShowMarker || bowDragRef.current.hover || bowDragRef.current.dragging) {
        context.save();
        context.strokeStyle = "#39ff88";
        context.lineWidth = 4 / p.zoom;
        context.beginPath();
        context.arc(p.flameX, p.flameY, 14 / p.zoom, 0, Math.PI * 2);
        context.moveTo(p.flameX - 26 / p.zoom, p.flameY);
        context.lineTo(p.flameX + 26 / p.zoom, p.flameY);
        context.moveTo(p.flameX, p.flameY - 26 / p.zoom);
        context.lineTo(p.flameX, p.flameY + 26 / p.zoom);
        context.stroke();
        context.restore();
      }
      if (p.showHull) hull.draw(context, lanes, "front", now, "warp");
      context.restore();

      if (now - readoutAt > 100) {
        readoutAt = now;
        setDisplayTime(t);
        setReadout({ sky: skyProgress, speed, clouds: cloudCount, flame: flameIntensity });
      }
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  // 艦首位置：在預覽畫面上直接拖曳（游標靠近艦首標記時可抓取）
  const bowDragRef = useRef({ hover: false, dragging: false });
  const [bowCursor, setBowCursor] = useState("default");
  useEffect(() => {
    const canvas = canvasRef.current!;
    const GRAB_RADIUS = 36; // 畫面像素
    const toWorld = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const zoom = paramsRef.current.zoom;
      return {
        x: (event.clientX - rect.left - rect.width / 2) / zoom + WORLD.width / 2,
        y: (event.clientY - rect.top - rect.height / 2) / zoom + WORLD.height / 2,
      };
    };
    const nearBow = (event: PointerEvent) => {
      const p = paramsRef.current;
      const world = toWorld(event);
      return Math.hypot(world.x - p.flameX, world.y - p.flameY) * p.zoom <= GRAB_RADIUS;
    };
    const moveBow = (event: PointerEvent) => {
      const world = toWorld(event);
      setParams((current) => ({
        ...current,
        flameX: Math.round(Math.min(WORLD.width, Math.max(0, world.x))),
        flameY: Math.round(Math.min(WORLD.height, Math.max(0, world.y))),
      }));
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !nearBow(event)) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      bowDragRef.current.dragging = true;
      setBowCursor("grabbing");
      moveBow(event);
    };
    const onMove = (event: PointerEvent) => {
      if (bowDragRef.current.dragging) { moveBow(event); return; }
      const hover = nearBow(event);
      if (hover !== bowDragRef.current.hover) {
        bowDragRef.current.hover = hover;
        setBowCursor(hover ? "grab" : "default");
      }
    };
    const onUp = (event: PointerEvent) => {
      if (!bowDragRef.current.dragging) return;
      bowDragRef.current.dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      setBowCursor(nearBow(event) ? "grab" : "default");
    };
    const onLeave = () => {
      if (bowDragRef.current.dragging) return;
      bowDragRef.current.hover = false;
      setBowCursor("default");
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("lostpointercapture", () => { bowDragRef.current.dragging = false; });
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const restart = () => { timeRef.current = 0; setPlaying(true); };
  const scrub = (value: number) => { timeRef.current = value; setDisplayTime(value); };
  const copySettings = async () => {
    const text = JSON.stringify(params, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied("已複製設定");
    } catch {
      setCopied("複製失敗，請從主控台取得");
      console.info("[atmosphere-preview]", text);
    }
    window.setTimeout(() => setCopied(""), 1600);
  };

  // 手把／方向鍵：上下選列、左右調整、A 執行（只在面板範圍內）
  useEffect(() => {
    const rows = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-nav-row]") ?? []);
    const activate = (index: number, direction: number) => {
      const row = rows()[index];
      if (!row) return;
      const input = row.querySelector<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button");
      if (!input) return;
      if (direction === 0) {
        if (input instanceof HTMLButtonElement) input.click();
        else if (input instanceof HTMLInputElement && input.type === "checkbox") input.click();
        return;
      }
      if (input instanceof HTMLInputElement && input.type === "range") {
        const step = Number(input.step) || 1;
        const next = Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value) + step * direction));
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setter.call(input, String(next));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (input instanceof HTMLSelectElement) {
        const next = (input.selectedIndex + direction + input.options.length) % input.options.length;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
        setter.call(input, input.options[next].value);
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    let index = 0;
    const move = (delta: number) => {
      const count = rows().length;
      if (!count) return;
      index = (index + delta + count) % count;
      setSelected(index);
      rows()[index]?.scrollIntoView({ block: "nearest" });
    };
    const takeDirectional = () => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      setOwner("directional");
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "number") return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault(); takeDirectional(); move(event.key === "ArrowUp" ? -1 : 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); takeDirectional(); activate(index, event.key === "ArrowLeft" ? -1 : 1);
      } else if (event.key === "Enter") {
        takeDirectional(); activate(index, 0);
      } else if (event.key === " ") {
        event.preventDefault(); setPlaying((value) => !value);
      }
    };
    let frame = 0, lastMove = 0, previousA = false, previousStart = false, armed = false;
    const poll = (now: number) => {
      frame = requestAnimationFrame(poll);
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(Boolean);
      if (!pad) return;
      const up = pad.buttons[12]?.pressed || pad.axes[1] < -0.6;
      const down = pad.buttons[13]?.pressed || pad.axes[1] > 0.6;
      const left = pad.buttons[14]?.pressed || pad.axes[0] < -0.6;
      const right = pad.buttons[15]?.pressed || pad.axes[0] > 0.6;
      const a = !!pad.buttons[0]?.pressed;
      const start = !!pad.buttons[9]?.pressed;
      if (!up && !down && !left && !right && !a) armed = true;
      if (!armed) return;
      if ((up || down || left || right) && now - lastMove > 140) {
        lastMove = now;
        takeDirectional();
        if (up || down) move(up ? -1 : 1);
        else activate(index, left ? -1 : 1);
      }
      if (a && !previousA) { takeDirectional(); activate(index, 0); }
      if (start && !previousStart) setPlaying((value) => !value);
      previousA = a;
      previousStart = start;
    };
    const onMouse = (event: MouseEvent) => { if (Math.abs(event.movementX) + Math.abs(event.movementY) > 2) setOwner("mouse"); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMouse);
    frame = requestAnimationFrame(poll);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousemove", onMouse); cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    panelRef.current?.querySelectorAll("[data-nav-row]").forEach((row, index) => {
      if (owner === "directional" && index === selected) row.setAttribute("data-gamepad-selected", "");
      else row.removeAttribute("data-gamepad-selected");
    });
  });

  const range = <K extends keyof Params>(key: K, min: number, max: number, step: number, unit = "") => (
    <span className="ap-range">
      <input type="range" min={min} max={max} step={step} value={Number(params[key])}
        onChange={(event) => set(key, Number(event.target.value) as Params[K])} />
      <output>{Number(params[key]).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}{unit}</output>
    </span>
  );
  const color = (key: "skyTopColor" | "skyBottomColor" | "cloudColor" | "cloudShadowColor" | "heatColor" | "flameCoreColor" | "flameMidColor" | "flameOuterColor") => (
    <input type="color" value={params[key]} onChange={(event) => set(key, event.target.value)} />
  );
  const curve = (key: "skyCurve" | "accelCurve" | "cloudGrowCurve" | "flameCurve") => (
    <select value={params[key]} onChange={(event) => set(key, event.target.value as Curve)}>
      <option value="linear">等速</option>
      <option value="easeIn">緩入（越來越快）</option>
      <option value="easeOut">緩出（越來越慢）</option>
      <option value="easeInOut">緩入緩出</option>
    </select>
  );

  return (
    <main className="ap-root" data-owner={owner}>
      <canvas ref={canvasRef} className="ap-canvas" style={{ cursor: owner === "mouse" ? bowCursor : undefined, touchAction: "none" }} />
      <div className="ap-panel" ref={panelRef}>
        <h1>迫降大氣漸變預覽</h1>
        <p className="ap-status">
          {displayTime.toFixed(1)} / {params.duration} 秒 · 天空 {(readout.sky * 100).toFixed(0)}% · 速度倍率 {readout.speed.toFixed(2)} · 雲量 {Math.round(readout.clouds)} · 噴焰 {(readout.flame * 100).toFixed(0)}%
        </p>

        <section>
          <h2>播放</h2>
          <div className="ap-buttons" data-nav-row>
            <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "暫停" : "播放"}</button>
            <button type="button" onClick={restart}>從頭播放</button>
          </div>
          <Row label="進度（秒）">
            <span className="ap-range">
              <input type="range" min={0} max={params.duration} step={0.05} value={displayTime}
                onChange={(event) => { setPlaying(false); scrub(Number(event.target.value)); }} />
              <output>{displayTime.toFixed(1)}</output>
            </span>
          </Row>
          <Row label="總長">{range("duration", 2, 40, 0.5, " 秒")}</Row>
          <Row label="循環播放"><input type="checkbox" checked={params.loop} onChange={(event) => set("loop", event.target.checked)} /></Row>
          <Row label="畫面縮放">{range("zoom", 0.2, 1.2, 0.01)}</Row>
        </section>

        <section>
          <h2>星空 → 大氣天空</h2>
          <Row label="開始時間">{range("skyStart", 0, 30, 0.1, " 秒")}</Row>
          <Row label="淡入時長">{range("skyDuration", 0, 30, 0.1, " 秒")}</Row>
          <Row label="淡入曲線">{curve("skyCurve")}</Row>
          <Row label="天空最終不透明度">{range("skyMaxOpacity", 0, 1, 0.01)}</Row>
          <Row label="漸層起點色">{color("skyTopColor")}</Row>
          <Row label="漸層終點色">{color("skyBottomColor")}</Row>
          <Row label="漸層角度" hint="90＝上→下">{range("skyAngle", 0, 360, 1, "°")}</Row>
          <Row label="星點透出" hint="天空蓋上後仍看得到的星點">{range("starResidual", 0, 1, 0.01)}</Row>
          <Row label="摩擦光強度" hint="淡入過程中段最強">{range("heatIntensity", 0, 1, 0.01)}</Row>
          <Row label="摩擦光顏色">{color("heatColor")}</Row>
          <Row label="雲量起始" hint="剛進入大氣時">{range("cloudCountStart", 0, 150, 1)}</Row>
          <Row label="雲量最終">{range("cloudCountEnd", 0, 150, 1)}</Row>
          <Row label="雲量增加開始">{range("cloudGrowStart", 0, 30, 0.1, " 秒")}</Row>
          <Row label="雲量增加時長">{range("cloudGrowDuration", 0, 30, 0.1, " 秒")}</Row>
          <Row label="雲量增加曲線">{curve("cloudGrowCurve")}</Row>
          <Row label="新雲淡入">{range("cloudFadeInSeconds", 0, 3, 0.05, " 秒")}</Row>
          <Row label="雲紋濃度">{range("cloudOpacity", 0, 1, 0.01)}</Row>
          <Row label="雲紋大小">{range("cloudSize", 40, 700, 5, " px")}</Row>
          <Row label="雲紋拉長">{range("cloudStretch", 1, 8, 0.1, "×")}</Row>
          <Row label="雲紋流速">{range("cloudSpeed", 0, 3, 0.05, "×")}</Row>
          <Row label="雲紋顏色">{color("cloudColor")}</Row>
          <Row label="雲朵陰影色">{color("cloudShadowColor")}</Row>
          <Row label="下端陰影強度">{range("cloudShadowStrength", 0, 1, 0.01)}</Row>
          <Row label="陰影範圍" hint="從下緣往上暗多高">{range("cloudShadowStart", 0.1, 0.95, 0.01)}</Row>
          <Row label="上緣亮光">{range("cloudHighlight", 0, 1, 0.01)}</Row>
          <Row label="整朵底部陰影">{range("cloudBaseShadow", 0, 1, 0.01)}</Row>
          <Row label="外形細節" hint="拼成雲形的團塊數量">{range("cloudPuffs", 1, 16, 1)}</Row>
          <Row label="邊緣不規則">{range("cloudIrregularity", 0, 1, 0.01)}</Row>
          <Row label="邊緣柔和">{range("cloudEdgeSoftness", 0, 1, 0.01)}</Row>
        </section>

        <section>
          <h2>艦首燃燒噴焰</h2>
          <Row label="顯示噴焰"><input type="checkbox" checked={params.flameEnabled} onChange={(event) => set("flameEnabled", event.target.checked)} /></Row>
          <Row label="顯示艦首定位標記" hint="綠色十字；游標移到艦首附近也會出現，可直接在畫面上拖曳"><input type="checkbox" checked={params.flameShowMarker} onChange={(event) => set("flameShowMarker", event.target.checked)} /></Row>
          <Row label="繪製層">
            <select value={params.flameLayer} onChange={(event) => set("flameLayer", event.target.value as Params["flameLayer"])}>
              <option value="back">船底下方（被船殼遮住）</option>
              <option value="front">船上方</option>
            </select>
          </Row>
          <Row label="艦首 X" hint="地圖座標">{range("flameX", 0, 2477, 1)}</Row>
          <Row label="艦首 Y" hint="地圖座標">{range("flameY", 0, 2477, 1)}</Row>
          <Row label="開始時間">{range("flameStart", 0, 30, 0.1, " 秒")}</Row>
          <Row label="增強時長">{range("flameDuration", 0, 30, 0.1, " 秒")}</Row>
          <Row label="增強曲線">{curve("flameCurve")}</Row>
          <Row label="最終大小" hint="一開始為此值的 25%">{range("flameScale", 0.1, 4, 0.05, "×")}</Row>
          <Row label="火舌長度">{range("flameLength", 50, 1500, 10, " px")}</Row>
          <Row label="噴口寬度">{range("flameWidth", 10, 400, 5, " px")}</Row>
          <Row label="向外擴散">{range("flameSpread", 0, 1.5, 0.05)}</Row>
          <Row label="火舌數量" hint="每秒產生（最強時）">{range("flameRate", 10, 800, 10)}</Row>
          <Row label="火舌拉長">{range("flameStretch", 0, 6, 0.1, "×")}</Row>
          <Row label="火舌濃度">{range("flameOpacity", 0, 1.5, 0.05)}</Row>
          <Row label="艦首光暈半徑">{range("flameGlowRadius", 0, 800, 10, " px")}</Row>
          <Row label="閃爍">{range("flameFlicker", 0, 1, 0.01)}</Row>
          <Row label="白熱色（內）">{color("flameCoreColor")}</Row>
          <Row label="火焰色（中）">{color("flameMidColor")}</Row>
          <Row label="餘焰色（外）">{color("flameOuterColor")}</Row>
        </section>

        <section>
          <h2>星空／星雲／光痕加速</h2>
          <Row label="開始時間">{range("accelStart", 0, 30, 0.1, " 秒")}</Row>
          <Row label="加速時長">{range("accelDuration", 0, 30, 0.1, " 秒")}</Row>
          <Row label="加速曲線">{curve("accelCurve")}</Row>
          <Row label="起始速度倍率" hint="目前遊戲：脫離曲速後 0.2">{range("speedFrom", 0, 3, 0.05)}</Row>
          <Row label="結束速度倍率">{range("speedTo", 0, 5, 0.05)}</Row>
          <Row label="光痕額外倍率" hint="遊戲中光痕＝星空倍率÷0.6">{range("hullBoost", 0, 3, 0.05, "×")}</Row>
          <Row label="顯示船身光痕"><input type="checkbox" checked={params.showHull} onChange={(event) => set("showHull", event.target.checked)} /></Row>
          <Row label="流動星雲濃度">{range("nebulaOpacity", 0, 2, 0.05)}</Row>
          <Row label="星點密度">{range("density", 0.1, 2, 0.05)}</Row>
          <Row label="流動方向">{range("flowAngle", 0, 360, 1, "°")}</Row>
        </section>

        <div className="ap-buttons" data-nav-row>
          <button type="button" onClick={copySettings}>複製設定 JSON</button>
          <button type="button" onClick={() => setParams(DEFAULT_PARAMS)}>還原預設</button>
        </div>
        {copied && <p className="ap-status">{copied}</p>}
        <p className="ap-hint">空白鍵／手把 Start：播放暫停 · 方向鍵／十字鍵：上下選、左右調整 · Enter／A：執行</p>
      </div>
    </main>
  );
}
