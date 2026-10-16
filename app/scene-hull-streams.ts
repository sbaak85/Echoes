// 船身流動光痕：沿場景 JSON 的 hullStreams 流動帶，讓光痕沿船身方向流過，帶出飛船高速航行的立體感。
//   - layer "front"：畫在船與牆圖（前景圖層）之上；"back"：畫在船底圖之下，被船殼遮住一部分。
//   - 光痕座標貼著地圖（跟船一起捲動），再加一點視差：前層移動比船多、後層比船少，帶出前後距離。
//   - 跟隨 backdrop.mode：曲速時又多又長又快；巡航時保留零星幾條慢慢滑過；切換有過渡。
//   - 流動帶 visible: false 時寫在資料裡但不顯示。
//   - 參數放在可修改的 HULL_STREAM_STYLE／HULL_STREAM_SETTINGS，每幀讀取（預覽用調整面板可即時修改）。
//     預設值為 2026-10-16 在 3062 預覽調整面板定案的數值。
export type HullStreamLane = {
  layer: "front" | "back";
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** 流動帶寬度（地圖像素） */
  width: number;
  /** 光痕數量倍率 */
  density?: number;
  /** 速度倍率 */
  speed?: number;
  /** 亮度倍率 */
  opacity?: number;
  /** false 時保留資料但不顯示（預設顯示） */
  visible?: boolean;
};

export type HullStreamLayerStyle = {
  /** 每 2000 地圖像素長的流動帶有幾條光痕 */
  count: number;
  cruiseSpeed: number;
  warpSpeed: number;
  cruiseLength: [number, number];
  warpLength: [number, number];
  alpha: [number, number];
  thickness: [number, number];
  /** 視差：正值移動比船多（較近），負值比船少（較遠） */
  parallax: number;
  tint: [number, number, number];
};

export const HULL_STREAM_DEFAULT_STYLE: Record<"front" | "back", HullStreamLayerStyle> = {
  front: { count: 12, cruiseSpeed: 150, warpSpeed: 1200, cruiseLength: [40, 120], warpLength: [150, 320], alpha: [0.45, 1], thickness: [2, 5.5], parallax: 0.08, tint: [185, 230, 255] },
  back: { count: 10, cruiseSpeed: 90, warpSpeed: 1300, cruiseLength: [35, 80], warpLength: [180, 420], alpha: [0.25, 0.55], thickness: [1, 2.6], parallax: -0.05, tint: [150, 200, 255] },
};
export const HULL_STREAM_DEFAULT_SETTINGS = {
  showFront: true,
  showBack: true,
  /** 巡航時保留的光痕比例 */
  cruiseVisibleFraction: 0.14,
  /** 巡航／曲速切換的過渡秒數 */
  transitionSeconds: 1.5,
  /** 每條光痕各自的速度倍率範圍 */
  streakSpeedMin: 0.65,
  streakSpeedMax: 1.35,
  /** 兩端淡出所佔流動帶長度比例 */
  endFade: 0.12,
  /** 除錯：用虛線框標出流動帶範圍（前層黃、後層洋紅） */
  showLaneGuides: false,
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export const HULL_STREAM_STYLE = clone(HULL_STREAM_DEFAULT_STYLE);
export const HULL_STREAM_SETTINGS = clone(HULL_STREAM_DEFAULT_SETTINGS);

// 每條光痕存 0～1 的隨機位置，實際長度／亮度／粗細／速度每幀依目前參數換算，調整立即生效
type Streak = { s: number; n: number; lengthT: number; speedT: number; alphaT: number; thicknessT: number; threshold: number };
type LaneState = { key: string; streaks: Streak[] };

const SPRITE_WIDTH = 128;
const SPRITE_HEIGHT = 16;

const random = (min: number, max: number) => min + Math.random() * (max - min);
const between = ([min, max]: readonly number[], t: number) => min + (max - min) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

function paintStreakSprite(rgb: readonly number[]) {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_WIDTH;
  canvas.height = SPRITE_HEIGHT;
  const context = canvas.getContext("2d")!;
  const color = rgb.join(",");
  // 外層柔光
  const glow = context.createLinearGradient(0, 0, SPRITE_WIDTH, 0);
  glow.addColorStop(0, `rgba(${color},0)`);
  glow.addColorStop(1, `rgba(${color},0.35)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
  // 內層亮芯：尾端細、頭部粗且接近白色
  const core = context.createLinearGradient(0, 0, SPRITE_WIDTH, 0);
  core.addColorStop(0, `rgba(${color},0)`);
  core.addColorStop(0.75, `rgba(${color},0.75)`);
  core.addColorStop(1, "rgba(255,255,255,1)");
  context.fillStyle = core;
  const mid = SPRITE_HEIGHT / 2;
  context.beginPath();
  context.moveTo(0, mid);
  context.lineTo(SPRITE_WIDTH - mid * 0.6, mid - mid * 0.45);
  context.arc(SPRITE_WIDTH - mid * 0.6, mid, mid * 0.45, -Math.PI / 2, Math.PI / 2);
  context.closePath();
  context.fill();
  // 上下邊緣淡出，避免貼圖出現硬邊
  context.globalCompositeOperation = "destination-in";
  const fade = context.createLinearGradient(0, 0, 0, SPRITE_HEIGHT);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(0.5, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = fade;
  context.fillRect(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
  return canvas;
}

export function createHullStreams() {
  const sprites = new Map<string, HTMLCanvasElement>();
  const spriteFor = (tint: readonly number[]) => {
    const key = tint.map((value) => Math.round(value)).join(",");
    let sprite = sprites.get(key);
    if (!sprite) {
      sprite = paintStreakSprite(tint);
      sprites.set(key, sprite);
    }
    return sprite;
  };
  const lanes = new Map<number, LaneState>();
  let mix: number | null = null;
  let lastTime: number | null = null;
  let lastMixTime = -1;

  const createStreak = (laneLength: number, initial: boolean): Streak => ({
    s: initial ? random(0, laneLength) : -random(0, laneLength * 0.35),
    // 越靠帶子中央的光痕越多，邊緣自然淡出
    n: (Math.random() + Math.random() - 1) * 0.5,
    lengthT: Math.random(),
    speedT: Math.random(),
    alphaT: Math.random(),
    thicknessT: Math.random(),
    threshold: Math.random(),
  });

  const stateFor = (index: number, lane: HullStreamLane, laneLength: number) => {
    const style = HULL_STREAM_STYLE[lane.layer];
    const count = Math.max(1, Math.round(style.count * (lane.density ?? 1) * (laneLength / 2000)));
    let state = lanes.get(index);
    const key = `${lane.layer}:${Math.round(laneLength)}`;
    if (!state || state.key !== key) {
      state = { key, streaks: Array.from({ length: count }, () => createStreak(laneLength, true)) };
      lanes.set(index, state);
    }
    // 數量改變時只增減，不重置正在流動的光痕
    while (state.streaks.length < count) state.streaks.push(createStreak(laneLength, true));
    if (state.streaks.length > count) state.streaks.length = count;
    return state;
  };

  const advanceLane = (index: number, lane: HullStreamLane, dt: number, warp: number) => {
    const style = HULL_STREAM_STYLE[lane.layer];
    const laneLength = Math.hypot(lane.to.x - lane.from.x, lane.to.y - lane.from.y);
    if (laneLength < 1) return;
    const state = stateFor(index, lane, laneLength);
    const baseSpeed = (style.cruiseSpeed + (style.warpSpeed - style.cruiseSpeed) * warp * warp) * Math.max(0, lane.speed ?? 1);
    const maxLength = Math.max(style.warpLength[1], style.cruiseLength[1]);
    for (let i = 0; i < state.streaks.length; i++) {
      const streak = state.streaks[i];
      streak.s += baseSpeed * between([HULL_STREAM_SETTINGS.streakSpeedMin, HULL_STREAM_SETTINGS.streakSpeedMax], streak.speedT) * dt;
      if (streak.s - maxLength > laneLength) state.streaks[i] = createStreak(laneLength, false);
    }
  };

  /**
   * 在地圖座標（已套用鏡頭變換）繪製指定層。time：毫秒；mode：backdrop.mode。
   * 同一幀前後層各呼叫一次，模式過渡與移動只在每幀第一次呼叫時推進。
   */
  const draw = (
    context: CanvasRenderingContext2D,
    laneList: HullStreamLane[] | undefined,
    layer: "front" | "back",
    time: number,
    mode: string | undefined,
  ) => {
    if (typeof document === "undefined" || !laneList?.length) return;

    if (time !== lastMixTime) {
      const goal = mode === "warp" ? 1 : 0;
      if (mix === null) mix = goal;
      const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      lastMixTime = time;
      const transition = Math.max(0.01, HULL_STREAM_SETTINGS.transitionSeconds);
      mix += Math.sign(goal - mix) * Math.min(Math.abs(goal - mix), dt / transition);
      const advanceWarp = smooth(mix);
      for (const [index, lane] of laneList.entries()) {
        if (lane.visible !== false) advanceLane(index, lane, dt, advanceWarp);
      }
    }
    if (layer === "front" ? !HULL_STREAM_SETTINGS.showFront : !HULL_STREAM_SETTINGS.showBack) return;
    const warp = smooth(mix ?? 0);
    const cruiseFraction = Math.min(1, Math.max(0, HULL_STREAM_SETTINGS.cruiseVisibleFraction));
    const visibleFraction = cruiseFraction + (1 - cruiseFraction) * warp;
    const endFade = Math.max(0.001, HULL_STREAM_SETTINGS.endFade);

    // 鏡頭中心（地圖座標），用來計算視差
    const inverse = context.getTransform().inverse();
    const canvas = context.canvas;
    const cameraX = inverse.a * (canvas.width / 2) + inverse.c * (canvas.height / 2) + inverse.e;
    const cameraY = inverse.b * (canvas.width / 2) + inverse.d * (canvas.height / 2) + inverse.f;

    for (const [index, lane] of laneList.entries()) {
      if (lane.layer !== layer || lane.visible === false) continue;
      const style = HULL_STREAM_STYLE[lane.layer];
      const dx = lane.to.x - lane.from.x;
      const dy = lane.to.y - lane.from.y;
      const laneLength = Math.hypot(dx, dy);
      if (laneLength < 1) continue;
      const state = stateFor(index, lane, laneLength);
      const midX = (lane.from.x + lane.to.x) / 2;
      const midY = (lane.from.y + lane.to.y) / 2;
      const offsetX = -(cameraX - midX) * style.parallax;
      const offsetY = -(cameraY - midY) * style.parallax;
      const opacity = Math.max(0, lane.opacity ?? 1);
      const sprite = spriteFor(style.tint);

      context.save();
      context.globalCompositeOperation = "lighter";
      context.translate(lane.from.x + offsetX, lane.from.y + offsetY);
      context.rotate(Math.atan2(dy, dx));
      for (const streak of state.streaks) {
        if (streak.threshold > visibleFraction) continue;
        const length = between(style.cruiseLength, streak.lengthT) * (1 - warp) + between(style.warpLength, streak.lengthT) * warp;
        // 兩端與兩側淡出
        const along = Math.min(1, Math.max(0, streak.s / (laneLength * endFade)), Math.max(0, (laneLength - (streak.s - length)) / (laneLength * endFade)));
        const across = 1 - Math.pow(Math.abs(streak.n) * 2, 2);
        const alpha = between(style.alpha, streak.alphaT) * opacity * along * Math.max(0, across);
        if (alpha <= 0.01 || length <= 0) continue;
        context.globalAlpha = Math.min(1, alpha);
        const thickness = between(style.thickness, streak.thicknessT) * (1 + warp * 0.4) * 3; // 貼圖上下有淡出區，實際亮芯約為三分之一
        context.drawImage(sprite, streak.s - length, streak.n * lane.width - thickness / 2, length, thickness);
      }
      if (HULL_STREAM_SETTINGS.showLaneGuides) {
        // 範圍框一律畫在最上層看得到的位置：後層的框也畫在這裡，但被船遮住的部分會照常被蓋住
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = 1;
        context.setLineDash([18, 10]);
        context.lineWidth = 4;
        context.strokeStyle = lane.layer === "front" ? "#ffe347" : "#ff4fd8";
        context.strokeRect(0, -lane.width / 2, laneLength, lane.width);
        context.setLineDash([]);
        context.fillStyle = context.strokeStyle;
        context.font = "bold 42px system-ui, sans-serif";
        context.fillText(lane.layer === "front" ? "前層" : "後層（在船下方）", 24, -lane.width / 2 - 14);
      }
      context.restore();
    }
  };

  return { draw };
}
