// 場景背景星空（船艙等宇宙中的場景）：畫在場景底圖下方，底圖透明處會露出星空。
// 兩種模式：平穩巡航（cruise，緩慢星點）、曲速穿梭（warp，拉長的光痕），切換時約 1.5 秒平滑過渡。
// 星空以畫面座標繪製，不隨地圖捲動，像窗外的遠景。backdrop.clouds 開啟時另有多色流動星雲（scene-nebula-clouds）。
// 不論系統是否開啟「減少動態效果」，一律播放（星空是場景的一部分）。
// 效能做法（2026-10-16 起）：
//   1. 曲速光痕用預先畫好的「淡出光痕」貼圖，整片星空只旋轉一次畫布，逐顆 drawImage，不再每顆星建立漸層。
//   2. 巡航星點用預先畫好的圓點貼圖，取代每顆星 beginPath + arc。
//   3. 底色星雲與曲速前方光暈畫在 1/4 解析度的快取畫布，每 200ms 或模式切換時才重畫，再放大貼上。
//   4. 星星數量依畫面面積的倍率限制在 0.6～1.2 之間，避免大螢幕／高解析度時數量暴增。

import { createNebulaClouds } from "./scene-nebula-clouds";

export type SceneStarfieldMode = "cruise" | "warp";

/** 場景 JSON 的 backdrop 欄位（目前手動填寫；MapEditor 只保留不編輯） */
export type SceneBackdropConfig = {
  type: "starfield";
  mode?: SceneStarfieldMode;
  /** 速度倍率（1 = 預設） */
  speed?: number;
  /** 星星密度倍率（1 = 預設） */
  density?: number;
  /** 星星流動方向（度；0 = 向右，順時針，與畫面座標相同）。預設 33°：沿船艙船身由船頭往船尾 */
  angle?: number;
  /** 流動星雲：多色星雲沿流動方向循環飄過（預設關閉） */
  clouds?: boolean;
  /** 流動星雲濃度倍率（1 = 預設） */
  cloudOpacity?: number;
};
const MODES = {
  cruise: { speed: 34, trail: 0, twinkle: 1, tint: [214, 232, 255] },
  warp: { speed: 1700, trail: 0.085, twinkle: 0, tint: [170, 214, 255] },
} as const;
const WARM_TINT = [255, 214, 170];
const BASE_STAR_COUNT = 520;
const MODE_TRANSITION_SECONDS = 1.5;
const EDGE_MARGIN = 120;
const AREA_FACTOR_MIN = 0.6;
const AREA_FACTOR_MAX = 1.2;
const BACKGROUND_SCALE = 0.25;
const BACKGROUND_REFRESH_MS = 200;
const STREAK_SPRITE_WIDTH = 128;
const STREAK_SPRITE_HEIGHT = 16;
const DOT_SPRITE_SIZE = 16;

type Star = { x: number; y: number; z: number; phase: number; hue: number };

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** 水平光痕：左端透明、右端（星星本體）最亮，右端帶圓頭 */
function paintStreakSprite(canvas: HTMLCanvasElement, rgb: number[]) {
  const context = canvas.getContext("2d")!;
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  const color = rgb.join(",");
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, `rgba(${color},0)`);
  gradient.addColorStop(1, `rgba(${color},1)`);
  context.fillStyle = gradient;
  const radius = height / 2;
  context.beginPath();
  context.moveTo(0, radius);
  context.lineTo(width - radius, 0);
  context.arc(width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
  context.lineTo(0, radius);
  context.fill();
}

function paintDotSprite(canvas: HTMLCanvasElement, rgb: number[]) {
  const context = canvas.getContext("2d")!;
  const size = canvas.width;
  context.clearRect(0, 0, size, size);
  context.fillStyle = `rgb(${rgb.join(",")})`;
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  context.fill();
}

export function createSceneStarfield() {
  let stars: Star[] = [];
  let width = 0;
  let height = 0;
  let seededDensity = -1;
  let mix: number | null = null;
  let lastTime: number | null = null;
  const nebulaClouds = createNebulaClouds();

  // 貼圖快取：冷色依目前 tint 重畫（只在模式過渡期間會變），暖色固定
  let coolTintKey = "";
  const coolStreak = createCanvas(STREAK_SPRITE_WIDTH, STREAK_SPRITE_HEIGHT);
  const coolDot = createCanvas(DOT_SPRITE_SIZE, DOT_SPRITE_SIZE);
  const warmStreak = createCanvas(STREAK_SPRITE_WIDTH, STREAK_SPRITE_HEIGHT);
  const warmDot = createCanvas(DOT_SPRITE_SIZE, DOT_SPRITE_SIZE);
  paintStreakSprite(warmStreak, WARM_TINT);
  paintDotSprite(warmDot, WARM_TINT);

  // 背景（底色＋星雲＋曲速光暈）快取
  let background: HTMLCanvasElement | null = null;
  let backgroundTime = -Infinity;
  let backgroundWarp = -1;
  let backgroundAngle = NaN;

  const directionOf = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return { x: Math.cos(radians), y: Math.sin(radians) };
  };
  const respawnUpstream = (star: Star, direction: { x: number; y: number }) => {
    const horizontalWeight = Math.abs(direction.x) * height;
    const verticalWeight = Math.abs(direction.y) * width;
    if (Math.random() * (horizontalWeight + verticalWeight) < horizontalWeight) {
      star.x = direction.x > 0 ? -EDGE_MARGIN * Math.random() : width + EDGE_MARGIN * Math.random();
      star.y = Math.random() * height;
    } else {
      star.x = Math.random() * width;
      star.y = direction.y > 0 ? -EDGE_MARGIN * Math.random() : height + EDGE_MARGIN * Math.random();
    }
  };
  const seed = (density: number) => {
    const areaFactor = Math.min(AREA_FACTOR_MAX, Math.max(AREA_FACTOR_MIN, (width * height) / (1400 * 800)));
    const count = Math.round(BASE_STAR_COUNT * density * areaFactor);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: Math.pow(Math.random(), 1.8) * 0.85 + 0.15,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random(),
    }));
    seededDensity = density;
  };

  const paintBackground = (time: number, warp: number, direction: { x: number; y: number }) => {
    if (!background) background = createCanvas(width * BACKGROUND_SCALE, height * BACKGROUND_SCALE);
    const context = background.getContext("2d")!;
    const w = background.width;
    const h = background.height;
    context.fillStyle = "#04080f";
    context.fillRect(0, 0, w, h);
    const drift = time * 0.000015;
    const span = Math.max(w, h);
    for (const nebula of [
      { x: 0.25 + Math.sin(drift) * 0.03, y: 0.3, r: 0.55, color: "60,90,160" },
      { x: 0.78, y: 0.72 + Math.cos(drift * 1.3) * 0.03, r: 0.5, color: "110,60,140" },
    ]) {
      const gradient = context.createRadialGradient(nebula.x * w, nebula.y * h, 0, nebula.x * w, nebula.y * h, nebula.r * span);
      gradient.addColorStop(0, `rgba(${nebula.color},${0.16 - warp * 0.06})`);
      gradient.addColorStop(1, `rgba(${nebula.color},0)`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, w, h);
    }
    if (warp > 0.01) {
      const cx = w / 2 - direction.x * w * 0.55;
      const cy = h / 2 - direction.y * h * 0.55;
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, span * 0.7);
      glow.addColorStop(0, `rgba(150,200,255,${0.22 * warp})`);
      glow.addColorStop(1, "rgba(150,200,255,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, w, h);
    }
    backgroundTime = time;
    backgroundWarp = warp;
  };

  const draw = (
    context: CanvasRenderingContext2D,
    viewportWidth: number,
    viewportHeight: number,
    time: number,
    config: SceneBackdropConfig,
  ) => {
    const density = Math.max(0.1, config.density ?? 1);
    if (viewportWidth !== width || viewportHeight !== height || density !== seededDensity) {
      width = viewportWidth;
      height = viewportHeight;
      background = null;
      seed(density);
    }
    const goal = config.mode === "warp" ? 1 : 0;
    if (mix === null) mix = goal;
    const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    mix += Math.sign(goal - mix) * Math.min(Math.abs(goal - mix), dt / MODE_TRANSITION_SECONDS);
    const warp = smooth(mix);
    const angle = config.angle ?? 33;
    const direction = directionOf(angle);

    if (
      !background || angle !== backgroundAngle ||
      time - backgroundTime >= BACKGROUND_REFRESH_MS || Math.abs(warp - backgroundWarp) > 0.02
    ) {
      backgroundAngle = angle;
      paintBackground(time, warp, direction);
    }
    context.save();
    context.imageSmoothingEnabled = true;
    context.drawImage(background!, 0, 0, width, height);
    if (config.clouds) {
      nebulaClouds.draw(context, width, height, time, dt, angle, warp, config.speed ?? 1, config.cloudOpacity ?? 1);
    }

    const speed = lerp(MODES.cruise.speed, MODES.warp.speed, warp * warp) * Math.max(0, config.speed ?? 1);
    const trail = lerp(MODES.cruise.trail, MODES.warp.trail, warp);
    const twinkle = lerp(MODES.cruise.twinkle, MODES.warp.twinkle, warp);
    const tint = MODES.cruise.tint.map((value, index) => Math.round(lerp(value, MODES.warp.tint[index], warp)));
    const tintKey = tint.join(",");
    if (tintKey !== coolTintKey) {
      coolTintKey = tintKey;
      paintStreakSprite(coolStreak, tint);
      paintDotSprite(coolDot, tint);
    }

    // 移動星星（畫面座標），再轉到「沿流動方向」的旋轉座標一次畫完
    const cos = direction.x;
    const sin = direction.y;
    context.rotate((angle * Math.PI) / 180);
    for (const star of stars) {
      const velocity = speed * star.z * star.z;
      star.x += cos * velocity * dt;
      star.y += sin * velocity * dt;
      if (
        star.x < -EDGE_MARGIN || star.x > width + EDGE_MARGIN ||
        star.y < -EDGE_MARGIN || star.y > height + EDGE_MARGIN
      ) {
        respawnUpstream(star, direction);
      }
      const size = 0.5 + star.z * 1.9;
      const flicker = twinkle > 0
        ? 1 - twinkle * 0.35 * (0.5 + 0.5 * Math.sin(time * 0.002 * (0.6 + star.hue) + star.phase))
        : 1;
      context.globalAlpha = Math.min(1, (0.25 + star.z * 0.85) * flicker);
      const warm = star.hue < 0.12;
      // 旋轉座標：u 沿流動方向，v 垂直
      const u = star.x * cos + star.y * sin;
      const v = -star.x * sin + star.y * cos;
      const length = velocity * trail;
      if (length > 1.5) {
        context.drawImage(warm ? warmStreak : coolStreak, u - length, v - size / 2, length + size / 2, size);
      } else {
        const dot = size * 1.2;
        context.drawImage(warm ? warmDot : coolDot, u - dot / 2, v - dot / 2, dot, dot);
      }
    }
    context.restore();
  };

  const reset = () => {
    mix = null;
    lastTime = null;
  };

  return { draw, reset };
}
