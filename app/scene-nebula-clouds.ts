// 流動星雲：幾團多色漸層的星雲沿星空流動方向緩慢飄過，離開畫面後從上游重新出現（循環）。
// 曲速時加快並沿流動方向拉長。每團星雲在建立時預先畫成一張貼圖，之後每幀只需貼圖，成本很低。
// 由 scene-starfield 在「背景之後、星星之前」呼叫；場景 JSON 的 backdrop.clouds 為 true 時才會出現。

type Rgb = readonly [number, number, number];

/** 每團星雲從其中一組配色挑 3 色混合，帶出不同顏色的漸層 */
const PALETTES: readonly (readonly Rgb[])[] = [
  [[70, 170, 230], [130, 90, 230], [210, 110, 230]], // 青藍 → 紫
  [[230, 80, 160], [250, 150, 90], [150, 70, 210]], // 洋紅 → 橘
  [[60, 200, 180], [90, 130, 240], [235, 195, 110]], // 藍綠 → 金
  [[90, 140, 255], [160, 205, 255], [110, 80, 210]], // 冷藍
  [[250, 120, 120], [200, 90, 200], [90, 110, 230]], // 玫瑰 → 藍
];
// 貼圖為橫向長條（長軸沿流動方向），雲團呈不規則的帶狀而不是圓球
const SPRITE_WIDTH = 320;
const SPRITE_HEIGHT = 176;
const BASE_CLOUD_COUNT = 6;
const CRUISE_SPEED = 16;
const WARP_SPEED = 620;
const BREATH_SPEED = 0.00025;

type Cloud = {
  u: number; // 沿流動方向的座標（旋轉後）
  v: number; // 垂直流動方向的座標
  z: number; // 0.3～1，越大越近：越快、越大、越亮
  radius: number; // 長軸的一半
  aspect: number; // 短軸相對貼圖比例的倍率，讓每團胖瘦不同
  alpha: number;
  phase: number;
  sprite: HTMLCanvasElement;
};

const random = (min: number, max: number) => min + Math.random() * (max - min);

function paintCloudSprite(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_WIDTH;
  canvas.height = SPRITE_HEIGHT;
  const context = canvas.getContext("2d")!;
  const cx = SPRITE_WIDTH / 2;
  const cy = SPRITE_HEIGHT / 2;
  const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  // 雲帶沿長軸微微彎曲，避免每團都是對稱的橢圓
  const bend = random(-0.18, 0.18) * SPRITE_HEIGHT;

  // 多個大小不一的柔邊色塊沿長軸散開，以「濾色」疊合成彩色漸層的雲帶
  context.globalCompositeOperation = "screen";
  const blobs = 8 + Math.floor(Math.random() * 4);
  for (let i = 0; i < blobs; i++) {
    const t = random(-1, 1);
    const x = cx + t * SPRITE_WIDTH * 0.3;
    const y = cy + t * t * bend + random(-0.16, 0.16) * SPRITE_HEIGHT;
    const r = SPRITE_WIDTH * random(0.08, 0.2) * (1 - Math.abs(t) * 0.35);
    // 依位置在三色之間漸變：一端偏第一色、另一端偏第三色
    const colorIndex = Math.min(2, Math.max(0, Math.round((t + 1) + random(-0.6, 0.6))));
    const [red, green, blue] = palette[colorIndex];
    const gradient = context.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(${red},${green},${blue},${random(0.5, 0.75)})`);
    gradient.addColorStop(0.5, `rgba(${red},${green},${blue},${random(0.18, 0.3)})`);
    gradient.addColorStop(1, `rgba(${red},${green},${blue},0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
  }

  // 在偏離中心的位置挖出幾個小缺口，帶出絲縷感
  context.globalCompositeOperation = "destination-out";
  const holes = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < holes; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = cx + side * random(0.08, 0.3) * SPRITE_WIDTH;
    const y = cy + random(-0.22, 0.22) * SPRITE_HEIGHT;
    const r = SPRITE_WIDTH * random(0.03, 0.07);
    const gradient = context.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(0,0,0,${random(0.25, 0.45)})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
  }

  // 橢圓形外框淡出，避免貼圖邊緣出現方形
  context.globalCompositeOperation = "destination-in";
  context.save();
  context.translate(cx, cy);
  context.scale(1, SPRITE_HEIGHT / SPRITE_WIDTH);
  const mask = context.createRadialGradient(0, 0, SPRITE_WIDTH * 0.2, 0, 0, SPRITE_WIDTH * 0.5);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = mask;
  context.fillRect(-cx, -SPRITE_WIDTH / 2, SPRITE_WIDTH, SPRITE_WIDTH);
  context.restore();
  return canvas;
}

export function createNebulaClouds() {
  let clouds: Cloud[] = [];
  let width = 0;
  let height = 0;
  let seededAngle = NaN;
  // 旋轉座標下，整個畫面所涵蓋的 u／v 範圍
  let bounds = { uMin: 0, uMax: 0, vMin: 0, vMax: 0 };

  const computeBounds = (cos: number, sin: number) => {
    const corners = [[0, 0], [width, 0], [0, height], [width, height]];
    const us = corners.map(([x, y]) => x * cos + y * sin);
    const vs = corners.map(([x, y]) => -x * sin + y * cos);
    bounds = { uMin: Math.min(...us), uMax: Math.max(...us), vMin: Math.min(...vs), vMax: Math.max(...vs) };
  };

  const createCloud = (initial: boolean): Cloud => {
    const z = random(0.3, 1);
    const scale = Math.min(width, height) / 800;
    const radius = random(240, 480) * (0.6 + z * 0.5) * Math.max(0.6, scale);
    const cloud: Cloud = {
      u: 0,
      v: random(bounds.vMin - radius * 0.2, bounds.vMax + radius * 0.2),
      z,
      radius,
      aspect: random(0.8, 1.35),
      alpha: random(0.55, 0.9) * (0.55 + z * 0.45),
      phase: Math.random() * Math.PI * 2,
      sprite: paintCloudSprite(),
    };
    cloud.u = initial
      ? random(bounds.uMin - radius, bounds.uMax + radius)
      : bounds.uMin - radius * random(1.6, 3);
    return cloud;
  };

  const seed = () => {
    const areaFactor = Math.min(1.5, Math.max(0.7, (width * height) / (1400 * 800)));
    const count = Math.round(BASE_CLOUD_COUNT * areaFactor);
    clouds = Array.from({ length: count }, () => createCloud(true));
  };

  /**
   * 在畫面座標繪製（未套用鏡頭變換）。
   * dt：秒；angle：流動方向（度）；warp：0＝巡航、1＝曲速；speed：速度倍率；opacity：濃度倍率。
   */
  const draw = (
    context: CanvasRenderingContext2D,
    viewportWidth: number,
    viewportHeight: number,
    time: number,
    dt: number,
    angle: number,
    warp: number,
    speed = 1,
    opacity = 1,
  ) => {
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    if (viewportWidth !== width || viewportHeight !== height || angle !== seededAngle) {
      width = viewportWidth;
      height = viewportHeight;
      seededAngle = angle;
      computeBounds(cos, sin);
      seed();
    }
    const flowSpeed = (CRUISE_SPEED + (WARP_SPEED - CRUISE_SPEED) * warp * warp) * Math.max(0, speed);
    const stretch = 1 + warp * 1.4;
    const squash = 1 - warp * 0.25;

    context.save();
    context.globalCompositeOperation = "screen";
    context.rotate(radians);
    for (let i = 0; i < clouds.length; i++) {
      const cloud = clouds[i];
      cloud.u += flowSpeed * (0.35 + cloud.z * 0.65) * dt;
      const halfLength = cloud.radius * (1 + warp * 1.4 * cloud.z);
      if (cloud.u - halfLength > bounds.uMax) {
        clouds[i] = createCloud(false); // 循環：從上游重新出現，換一組顏色與形狀
        continue;
      }
      const breath = 1 + 0.05 * Math.sin(time * BREATH_SPEED + cloud.phase);
      const rx = cloud.radius * breath * (1 + (stretch - 1) * cloud.z);
      const ry = cloud.radius * (SPRITE_HEIGHT / SPRITE_WIDTH) * cloud.aspect * breath * squash;
      context.globalAlpha = Math.min(1, cloud.alpha * Math.max(0, opacity) * (1 - warp * 0.25));
      context.drawImage(cloud.sprite, cloud.u - rx, cloud.v - ry, rx * 2, ry * 2);
    }
    context.restore();
  };

  const reset = () => {
    width = 0;
    height = 0;
  };

  return { draw, reset };
}
