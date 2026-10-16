// 場景背景星空（船艙等宇宙中的場景）：畫在場景底圖下方，底圖透明處會露出星空。
// 兩種模式：平穩巡航（cruise，緩慢星點）、曲速穿梭（warp，拉長的光痕），切換時約 1.5 秒平滑過渡。
// 星空以畫面座標繪製，不隨地圖捲動，像窗外的遠景。設計稿：output/device-preview/starfield.html

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
};

const MODES = {
  cruise: { speed: 34, trail: 0, twinkle: 1, tint: [214, 232, 255] },
  warp: { speed: 1700, trail: 0.085, twinkle: 0, tint: [170, 214, 255] },
} as const;
const BASE_STAR_COUNT = 520;
const MODE_TRANSITION_SECONDS = 1.5;
const EDGE_MARGIN = 120;

type Star = { x: number; y: number; z: number; phase: number; hue: number };

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

export function createSceneStarfield() {
  let stars: Star[] = [];
  let width = 0;
  let height = 0;
  let seededDensity = -1;
  let mix: number | null = null; // 0 = 巡航、1 = 曲速
  let lastTime: number | null = null;
  const reduceMotion = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const directionOf = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return { x: Math.cos(radians), y: Math.sin(radians) };
  };
  // 從星星流入的那一側畫面邊緣重新出現
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
    const count = Math.round(
      BASE_STAR_COUNT * density * Math.max(0.6, (width * height) / (1400 * 800)),
    );
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: Math.pow(Math.random(), 1.8) * 0.85 + 0.15, // 越大越近：近的快、亮、大
      phase: Math.random() * Math.PI * 2,
      hue: Math.random(),
    }));
    seededDensity = density;
  };

  /** 在畫面座標（未套用鏡頭變換）繪製整片星空；time 為毫秒 */
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
      seed(density);
    }
    const goal = config.mode === "warp" ? 1 : 0;
    if (mix === null) mix = goal; // 進場直接是設定的模式，之後切換才過渡
    const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    mix += Math.sign(goal - mix) * Math.min(Math.abs(goal - mix), dt / MODE_TRANSITION_SECONDS);
    const warp = smooth(mix);

    // 深空底色＋兩團緩慢漂移的星雲；曲速時船頭前方亮起
    context.save();
    context.fillStyle = "#04080f";
    context.fillRect(0, 0, width, height);
    const drift = time * 0.000015;
    const span = Math.max(width, height);
    for (const nebula of [
      { x: 0.25 + Math.sin(drift) * 0.03, y: 0.3, r: 0.55, color: "60,90,160" },
      { x: 0.78, y: 0.72 + Math.cos(drift * 1.3) * 0.03, r: 0.5, color: "110,60,140" },
    ]) {
      const gradient = context.createRadialGradient(
        nebula.x * width, nebula.y * height, 0, nebula.x * width, nebula.y * height, nebula.r * span,
      );
      gradient.addColorStop(0, `rgba(${nebula.color},${0.16 - warp * 0.06})`);
      gradient.addColorStop(1, `rgba(${nebula.color},0)`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    }
    const direction = directionOf(config.angle ?? 33);
    if (warp > 0.01) {
      const cx = width / 2 - direction.x * width * 0.55;
      const cy = height / 2 - direction.y * height * 0.55;
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, span * 0.7);
      glow.addColorStop(0, `rgba(150,200,255,${0.22 * warp})`);
      glow.addColorStop(1, "rgba(150,200,255,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
    }

    const speed = lerp(MODES.cruise.speed, MODES.warp.speed, warp * warp) * Math.max(0, config.speed ?? 1);
    const trail = lerp(MODES.cruise.trail, MODES.warp.trail, warp);
    const twinkle = lerp(MODES.cruise.twinkle, MODES.warp.twinkle, warp);
    const tint = MODES.cruise.tint.map((value, index) => Math.round(lerp(value, MODES.warp.tint[index], warp)));
    context.lineCap = "round";
    for (const star of stars) {
      const velocity = speed * star.z * star.z;
      if (!reduceMotion) {
        star.x += direction.x * velocity * dt;
        star.y += direction.y * velocity * dt;
      }
      if (
        star.x < -EDGE_MARGIN || star.x > width + EDGE_MARGIN ||
        star.y < -EDGE_MARGIN || star.y > height + EDGE_MARGIN
      ) {
        respawnUpstream(star, direction);
      }
      const size = 0.5 + star.z * 1.9;
      const flicker = 1 - twinkle * 0.35 * (0.5 + 0.5 * Math.sin(time * 0.002 * (0.6 + star.hue) + star.phase));
      const alpha = Math.min(1, (0.25 + star.z * 0.85) * flicker);
      const color = star.hue < 0.12 ? "255,214,170" : tint.join(",");
      const length = reduceMotion ? 0 : velocity * trail;
      if (length > 1.5) {
        const tailX = star.x - direction.x * length;
        const tailY = star.y - direction.y * length;
        const gradient = context.createLinearGradient(tailX, tailY, star.x, star.y);
        gradient.addColorStop(0, `rgba(${color},0)`);
        gradient.addColorStop(1, `rgba(${color},${alpha})`);
        context.strokeStyle = gradient;
        context.lineWidth = size;
        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(star.x, star.y);
        context.stroke();
      } else {
        context.fillStyle = `rgba(${color},${alpha})`;
        context.beginPath();
        context.arc(star.x, star.y, size * 0.6, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  };

  /** 離開場景時重設，下次進場直接使用設定的模式 */
  const reset = () => {
    mix = null;
    lastTime = null;
  };

  return { draw, reset };
}
