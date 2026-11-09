// 第二章迫降：大氣進入效果（星空漸變成大氣天空、立體雲朵、艦首燃燒噴焰、星空／星雲／光痕加速）。
// 預覽調整頁 app/atmosphere-preview 與遊戲共用這份程式；數值記在 public/effects/chapter02_atmosphere_entry.json。

export type Curve = "linear" | "easeIn" | "easeOut" | "easeInOut";

export type AtmosphereEntryParams = {
  duration: number;
  loop: boolean;
  zoom: number;
  // 大氣天空
  skyStart: number;
  skyDuration: number;
  skyCurve: Curve;
  skyMaxOpacity: number;
  skyTopColor: string;
  skyBottomColor: string;
  skyAngle: number;
  starResidual: number;
  /** 雲量：進入大氣時由起始數量增加到最終數量 */
  cloudCountStart: number;
  cloudCountEnd: number;
  cloudGrowStart: number;
  cloudGrowDuration: number;
  cloudGrowCurve: Curve;
  /** 新出現的雲紋淡入秒數（避免突然冒出來） */
  cloudFadeInSeconds: number;
  cloudOpacity: number;
  cloudSize: number;
  cloudStretch: number;
  cloudSpeed: number;
  cloudColor: string;
  /** 立體雲：下端陰影色／強度／從圓團哪個高度開始變暗（0＝頂、1＝底）、上緣亮度、整朵底部陰影、每朵圓團數 */
  cloudShadowColor: string;
  cloudShadowStrength: number;
  cloudShadowStart: number;
  cloudHighlight: number;
  cloudBaseShadow: number;
  cloudPuffs: number;
  /** 邊緣不規則程度、邊緣柔和度 */
  cloudIrregularity: number;
  cloudEdgeSoftness: number;
  heatIntensity: number;
  heatColor: string;
  // 艦首燃燒噴焰
  flameEnabled: boolean;
  flameShowMarker: boolean;
  /** back：畫在船底圖下方（船殼遮住，只露出船身外側）；front：畫在船上方 */
  flameLayer: "back" | "front";
  flameX: number;
  flameY: number;
  flameStart: number;
  flameDuration: number;
  flameCurve: Curve;
  flameScale: number;
  flameLength: number;
  flameWidth: number;
  flameSpread: number;
  flameRate: number;
  flameStretch: number;
  flameOpacity: number;
  flameGlowRadius: number;
  flameFlicker: number;
  flameCoreColor: string;
  flameMidColor: string;
  flameOuterColor: string;
  // 加速
  accelStart: number;
  accelDuration: number;
  accelCurve: Curve;
  speedFrom: number;
  speedTo: number;
  hullBoost: number;
  showHull: boolean;
  nebulaOpacity: number;
  density: number;
  flowAngle: number;
};

/** 程式內建預設值；實際使用的數值記在 public/effects/chapter02_atmosphere_entry.json */
export const ATMOSPHERE_ENTRY_BASE_PARAMS: AtmosphereEntryParams = {
  duration: 12,
  loop: true,
  zoom: 0.42,
  skyStart: 1,
  skyDuration: 8,
  skyCurve: "easeInOut",
  skyMaxOpacity: 1,
  skyTopColor: "#16365e",
  skyBottomColor: "#8fb7d8",
  skyAngle: 90,
  starResidual: 0.1,
  cloudCountStart: 4,
  cloudCountEnd: 60,
  cloudGrowStart: 1,
  cloudGrowDuration: 9,
  cloudGrowCurve: "easeIn",
  cloudFadeInSeconds: 0.8,
  cloudOpacity: 0.55,
  cloudSize: 260,
  cloudStretch: 3.2,
  cloudSpeed: 1,
  cloudColor: "#eef4fa",
  cloudShadowColor: "#6d7f96",
  cloudShadowStrength: 0.7,
  cloudShadowStart: 0.45,
  cloudHighlight: 0.35,
  cloudBaseShadow: 0.35,
  cloudPuffs: 7,
  cloudIrregularity: 0.6,
  cloudEdgeSoftness: 0.45,
  heatIntensity: 0.45,
  heatColor: "#ff7a36",
  flameEnabled: true,
  flameShowMarker: false,
  flameLayer: "back",
  flameX: 340,
  flameY: 590,
  flameStart: 1,
  flameDuration: 9,
  flameCurve: "easeIn",
  flameScale: 1.6,
  flameLength: 520,
  flameWidth: 260,
  flameSpread: 0.5,
  flameRate: 260,
  flameStretch: 2.2,
  flameOpacity: 0.9,
  flameGlowRadius: 260,
  flameFlicker: 0.35,
  flameCoreColor: "#fff3c4",
  flameMidColor: "#ff9a3a",
  flameOuterColor: "#c8341c",
  accelStart: 0,
  accelDuration: 10,
  accelCurve: "easeIn",
  speedFrom: 0.2,
  speedTo: 1.2,
  hullBoost: 1,
  showHull: true,
  nebulaOpacity: 1,
  density: 0.45,
  flowAngle: 33,
};

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export function ease(t: number, curve: Curve) {
  const x = clamp01(t);
  if (curve === "easeIn") return x * x * x;
  if (curve === "easeOut") return 1 - Math.pow(1 - x, 3);
  if (curve === "easeInOut") return x * x * (3 - 2 * x);
  return x;
}
export const segment = (time: number, start: number, duration: number, curve: Curve) =>
  ease(duration <= 0 ? (time >= start ? 1 : 0) : (time - start) / duration, curve);

export function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
}

type Cloud = { x: number; y: number; z: number; scale: number; seed: number; age: number };

const CLOUD_UNIT = 128; // 雲貼圖基準高度（像素），實際大小 = cloudSize
const CLOUD_VARIANTS = 8;
/** 預先繪製雲貼圖時，每算這麼多列檢查一次時間預算 */
const CLOUD_ROWS_PER_STEP = 6;

function cloudVariantKey(p: AtmosphereEntryParams) {
  return [p.cloudColor, p.cloudShadowColor, p.cloudShadowStrength, p.cloudShadowStart, p.cloudHighlight, p.cloudBaseShadow, p.cloudPuffs, p.cloudStretch, p.cloudIrregularity, p.cloudEdgeSoftness, p.flowAngle].join("|");
}

/** 可重現的隨機數（同一個 seed 每次產生相同的雲形） */
function seededRandom(seed: number) {
  let state = Math.floor(seed * 2147483646) + 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

/** 平滑雜訊（多層疊加），回傳 0～1 */
function createNoise(random: () => number) {
  const size = 64;
  const grid = Float32Array.from({ length: size * size }, () => random());
  const at = (x: number, y: number) => grid[((y % size) + size) % size * size + ((x % size) + size) % size];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const tx = smooth(x - x0), ty = smooth(y - y0);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bottom - top) * ty;
  };
  return (x: number, y: number) => {
    let total = 0, amplitude = 0.5, frequency = 1, weight = 0;
    for (let octave = 0; octave < 4; octave++) {
      total += value(x * frequency, y * frequency) * amplitude;
      weight += amplitude;
      amplitude *= 0.5;
      frequency *= 2.1;
    }
    return total / weight;
  };
}

/**
 * 一朵雲（一體成形、不規則外形）：
 *   1. 許多大小不一的團塊沿流動方向拼成雲的大致外形，模糊融合成一整塊
 *   2. 用雜訊侵蝕邊緣，得到不規則、帶點破碎的輪廓
 *   3. 依外形算光影：越靠近下緣越暗（陰影色）、上緣受光、整朵越往下越暗，內部帶一點雜訊紋理
 * 光影一律以畫面上方為受光方向，不隨流動方向旋轉。
 */
function paintCloudVariant(p: AtmosphereEntryParams, seed: number) {
  const steps = paintCloudVariantSteps(p, seed);
  for (;;) {
    const result = steps.next();
    if (result.done) return result.value;
  }
}

/** 同 paintCloudVariant，但每算完一批列就暫停（yield），讓預先繪製可以分散到多個畫格 */
function* paintCloudVariantSteps(p: AtmosphereEntryParams, seed: number): Generator<void, HTMLCanvasElement, void> {
  const random = seededRandom(seed);
  const noise = createNoise(random);
  const radians = (p.flowAngle * Math.PI) / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const radius = CLOUD_UNIT / 2;
  const half = Math.max(0, (CLOUD_UNIT * p.cloudStretch) / 2 - radius * 0.6);
  const pad = radius * 0.9;
  const width = Math.ceil(2 * (Math.abs(cos) * half + radius + pad));
  const height = Math.ceil(2 * (Math.abs(sin) * half + radius + pad));

  // 1. 大致外形
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskContext = mask.getContext("2d")!;
  maskContext.fillStyle = "#fff";
  const lumps = Math.max(3, Math.round(p.cloudPuffs * 4));
  for (let i = 0; i < lumps; i++) {
    const u = (random() * 2 - 1) * half;
    const profile = Math.sqrt(Math.max(0, 1 - Math.pow(u / (half + radius * 0.8), 2)));
    const r = radius * profile * (0.25 + random() * 0.45);
    const v = (random() + random() - 1) * radius * 0.55 * profile;
    maskContext.beginPath();
    maskContext.arc(width / 2 + cos * u - sin * v, height / 2 + sin * u + cos * v, Math.max(2, r), 0, Math.PI * 2);
    maskContext.fill();
  }
  const blurred = document.createElement("canvas");
  blurred.width = width;
  blurred.height = height;
  const blurContext = blurred.getContext("2d")!;
  blurContext.filter = `blur(${Math.max(1, radius * (0.12 + p.cloudEdgeSoftness * 0.3))}px)`;
  blurContext.drawImage(mask, 0, 0);
  yield;
  const shape = blurContext.getImageData(0, 0, width, height).data;
  yield;
  const density = (x: number, y: number) => {
    const ix = Math.min(width - 1, Math.max(0, Math.round(x)));
    const iy = Math.min(height - 1, Math.max(0, Math.round(y)));
    return shape[(iy * width + ix) * 4 + 3] / 255;
  };

  // 2＋3. 不規則邊緣與光影
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d")!;
  const image = outputContext.createImageData(width, height);
  const [cr, cg, cb] = hexToRgb(p.cloudColor);
  const [sr, sg, sb] = hexToRgb(p.cloudShadowColor);
  const noiseScale = 5 / CLOUD_UNIT;
  const reach = radius * (0.15 + p.cloudShadowStart * 0.9); // 陰影範圍：往下看多遠
  const edgeLow = 0.3, edgeWidth = 0.08 + p.cloudEdgeSoftness * 0.3;
  for (let y = 0; y < height; y++) {
    if (y > 0 && y % CLOUD_ROWS_PER_STEP === 0) yield;
    for (let x = 0; x < width; x++) {
      const base = density(x, y);
      if (base <= 0.01) continue;
      const n = noise(x * noiseScale, y * noiseScale);
      const d = base + (n - 0.5) * p.cloudIrregularity * 0.9;
      const edge = Math.min(1, Math.max(0, (d - edgeLow) / edgeWidth));
      if (edge <= 0) continue;
      const alpha = edge * edge * (3 - 2 * edge);
      // 下緣：往下 reach 的位置已經快出雲 → 暗；上緣：往上 reach 的位置已經出雲 → 亮
      const below = density(x, y + reach) + (noise(x * noiseScale + 9.1, (y + reach) * noiseScale) - 0.5) * p.cloudIrregularity * 0.6;
      const above = density(x, y - reach * 0.8);
      const underside = Math.min(1, Math.max(0, 1 - below * 1.25));
      const topLight = Math.min(1, Math.max(0, 1 - above * 1.4));
      const vertical = y / height;
      const texture = 0.8 + 0.4 * noise(x * noiseScale * 2.3 + 3.7, y * noiseScale * 2.3);
      const shade = Math.min(1, (underside * p.cloudShadowStrength + vertical * vertical * p.cloudBaseShadow) * texture);
      const light = topLight * p.cloudHighlight * (1 - shade);
      const index = (y * width + x) * 4;
      image.data[index] = Math.min(255, cr + (sr - cr) * shade + (255 - cr) * light);
      image.data[index + 1] = Math.min(255, cg + (sg - cg) * shade + (255 - cg) * light);
      image.data[index + 2] = Math.min(255, cb + (sb - cb) * shade + (255 - cb) * light);
      image.data[index + 3] = alpha * 255 * (0.88 + 0.12 * n);
    }
  }
  outputContext.putImageData(image, 0, 0);
  return output;
}

/** 大氣雲朵：立體雲貼圖（數種形狀輪流使用）沿流動方向高速流過 */
export function createAtmosphereClouds() {
  let clouds: Cloud[] = [];
  let width = 0, height = 0;
  let variants: HTMLCanvasElement[] = [];
  let variantKey = "";
  let variantPaintedAt = -Infinity;
  // 分批預先繪製中的雲貼圖（避免時間軸一開始、第一次出現雲時一口氣畫 8 張造成卡頓）
  let pending: { key: string; params: AtmosphereEntryParams; done: HTMLCanvasElement[]; steps: Generator<void, HTMLCanvasElement, void> | null } | null = null;
  const runPending = (budgetMs: number) => {
    if (!pending) return;
    const job = pending;
    const deadline = performance.now() + budgetMs;
    while (job.done.length < CLOUD_VARIANTS) {
      job.steps ??= paintCloudVariantSteps(job.params, (job.done.length + 1) / (CLOUD_VARIANTS + 1));
      const result = job.steps.next();
      if (result.done) {
        job.done.push(result.value);
        job.steps = null;
      }
      if (performance.now() >= deadline && job.done.length < CLOUD_VARIANTS) return;
    }
    variants = job.done;
    variantKey = job.key;
    variantPaintedAt = performance.now();
    pending = null;
  };
  /**
   * 預先分批畫好雲貼圖：每次呼叫最多花 budgetMs 毫秒，畫完回傳 true。
   * 參數相同就不重畫；之後 draw 用到同一組參數時直接沿用。
   */
  const prewarm = (p: AtmosphereEntryParams, budgetMs = 3) => {
    const key = cloudVariantKey(p);
    if (key === variantKey && variants.length === CLOUD_VARIANTS) return true;
    if (!pending || pending.key !== key) pending = { key, params: { ...p }, done: [], steps: null };
    runPending(budgetMs);
    return pending === null;
  };
  const spawn = (initial: boolean, angle: number): Cloud => {
    const radians = (angle * Math.PI) / 180;
    const cloud = { x: Math.random() * width, y: Math.random() * height, z: 0.35 + Math.random() * 0.65, scale: 0.6 + Math.random() * 0.8, seed: Math.random(), age: 0 };
    if (!initial) {
      // 從上游邊緣進場
      const margin = 400;
      if (Math.abs(Math.cos(radians)) * height > Math.abs(Math.sin(radians)) * width * Math.random()) {
        cloud.x = Math.cos(radians) > 0 ? -margin : width + margin;
      } else {
        cloud.y = Math.sin(radians) > 0 ? -margin : height + margin;
      }
    }
    return cloud;
  };
  const draw = (context: CanvasRenderingContext2D, w: number, h: number, dt: number, p: AtmosphereEntryParams, speedMultiplier: number, alpha: number, cloudCount: number) => {
    if (w !== width || h !== height) { width = w; height = h; clouds = []; }
    // 雲量增加時新雲朵散落在畫面各處並淡入；減少時直接移除多出來的
    const count = Math.max(0, Math.round(cloudCount));
    while (clouds.length < count) clouds.push(spawn(true, p.flowAngle));
    if (clouds.length > count) clouds.length = count;
    const key = cloudVariantKey(p);
    // 預先繪製到一半：剩下的直接畫完（同一組參數）
    if (key !== variantKey && pending?.key === key) runPending(Infinity);
    // 雲形重畫較耗時：拖動參數條時最多每 150ms 重畫一次
    const nowMs = performance.now();
    if (key !== variantKey && (variants.length === 0 || nowMs - variantPaintedAt > 150)) {
      pending = null;
      variantKey = key;
      variantPaintedAt = nowMs;
      variants = Array.from({ length: CLOUD_VARIANTS }, (_, index) => paintCloudVariant(p, (index + 1) / (CLOUD_VARIANTS + 1)));
    }
    const radians = (p.flowAngle * Math.PI) / 180;
    const dx = Math.cos(radians), dy = Math.sin(radians);
    // 雲朵流速：以星空曲速基準（1700 px/s）的 40% 為 1 倍
    const velocity = 1700 * 0.4 * speedMultiplier * p.cloudSpeed;
    // 遠的先畫、近的後畫
    const order = [...clouds.keys()].sort((a, b) => clouds[a].z - clouds[b].z);
    context.save();
    for (const i of order) {
      const cloud = clouds[i];
      cloud.x += dx * velocity * cloud.z * dt;
      cloud.y += dy * velocity * cloud.z * dt;
      const size = p.cloudSize * cloud.scale * (0.6 + cloud.z * 0.6);
      const sprite = variants[Math.floor(cloud.seed * variants.length) % variants.length];
      const scale = size / CLOUD_UNIT;
      const drawWidth = sprite.width * scale, drawHeight = sprite.height * scale;
      const limit = Math.max(drawWidth, drawHeight) + 600;
      if (cloud.x < -limit || cloud.x > width + limit || cloud.y < -limit || cloud.y > height + limit) {
        clouds[i] = spawn(false, p.flowAngle);
        continue;
      }
      cloud.age += dt;
      const appear = p.cloudFadeInSeconds > 0 ? clamp01(cloud.age / p.cloudFadeInSeconds) : 1;
      context.globalAlpha = clamp01(alpha * appear * p.cloudOpacity * (0.35 + cloud.z * 0.65));
      context.drawImage(sprite, cloud.x - drawWidth / 2, cloud.y - drawHeight / 2, drawWidth, drawHeight);
    }
    context.restore();
  };
  return { draw, prewarm };
}

type FlameParticle = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; spin: number };

/** 艦首燃燒噴焰（地圖座標）：艦首高溫光暈＋沿流動方向往船尾拖的火舌粒子，強度 0～1 決定大小與數量 */
export function createBowFlame() {
  let particles: FlameParticle[] = [];
  let carry = 0;
  const sprites = new Map<string, HTMLCanvasElement>();
  const spriteFor = (color: string) => {
    let sprite = sprites.get(color);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = sprite.height = 64;
      const context = sprite.getContext("2d")!;
      const [r, g, b] = hexToRgb(color);
      const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, `rgba(${r},${g},${b},1)`);
      gradient.addColorStop(0.4, `rgba(${r},${g},${b},0.55)`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 64, 64);
      sprites.set(color, sprite);
    }
    return sprite;
  };
  const draw = (context: CanvasRenderingContext2D, dt: number, time: number, p: AtmosphereEntryParams, intensity: number) => {
    const radians = (p.flowAngle * Math.PI) / 180;
    const fx = Math.cos(radians), fy = Math.sin(radians);
    const nx = -fy, ny = fx;
    const scale = p.flameScale * (0.25 + 0.75 * intensity);
    // 產生火舌：艦首前緣一段弧形範圍內出生，往船尾（流動方向）噴
    if (intensity > 0.001 && dt > 0) {
      carry += p.flameRate * intensity * dt;
      while (carry >= 1) {
        carry -= 1;
        const across = (Math.random() + Math.random() - 1) * p.flameWidth * scale;
        const ahead = -Math.random() * 18 * scale;
        const speed = (p.flameLength * scale / 0.55) * (0.7 + Math.random() * 0.6);
        const spread = across / Math.max(1, p.flameWidth * scale) * p.flameSpread;
        particles.push({
          x: p.flameX + nx * across + fx * ahead,
          y: p.flameY + ny * across + fy * ahead,
          vx: fx * speed + nx * speed * spread,
          vy: fy * speed + ny * speed * spread,
          age: 0,
          life: 0.35 + Math.random() * 0.35,
          size: (18 + Math.random() * 22) * scale,
          spin: Math.random(),
        });
      }
    }
    if (particles.length > 1600) particles = particles.slice(-1600);
    for (const particle of particles) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    particles = particles.filter((particle) => particle.age < particle.life);
    if (intensity <= 0.001 && particles.length === 0) return;

    context.save();
    context.globalCompositeOperation = "lighter";
    // 艦首高溫光暈：中心稍微偏向前方（逆流方向），閃爍
    const flicker = 1 - p.flameFlicker * 0.5 * (0.5 + 0.5 * Math.sin(time * 0.031) * Math.sin(time * 0.017 + 1.3));
    const glowRadius = p.flameGlowRadius * scale * flicker;
    if (glowRadius > 1 && intensity > 0.001) {
      const gx = p.flameX - fx * glowRadius * 0.15, gy = p.flameY - fy * glowRadius * 0.15;
      const [cr, cg, cb] = hexToRgb(p.flameCoreColor);
      const [mr, mg, mb] = hexToRgb(p.flameMidColor);
      const [or, og, ob] = hexToRgb(p.flameOuterColor);
      const glow = context.createRadialGradient(gx, gy, 0, gx, gy, glowRadius);
      glow.addColorStop(0, `rgba(${cr},${cg},${cb},${0.95 * intensity})`);
      glow.addColorStop(0.25, `rgba(${mr},${mg},${mb},${0.7 * intensity})`);
      glow.addColorStop(0.6, `rgba(${or},${og},${ob},${0.35 * intensity})`);
      glow.addColorStop(1, `rgba(${or},${og},${ob},0)`);
      context.fillStyle = glow;
      context.fillRect(gx - glowRadius, gy - glowRadius, glowRadius * 2, glowRadius * 2);
    }
    // 火舌：越老越大、顏色由白熱→橘→暗紅，沿速度方向拉長
    for (const particle of particles) {
      const life = particle.age / particle.life;
      const color = life < 0.22 ? p.flameCoreColor : life < 0.55 ? p.flameMidColor : p.flameOuterColor;
      const size = particle.size * (0.6 + life * 1.4);
      const stretch = 1.6 + p.flameStretch * (1 - life);
      context.globalAlpha = clamp01((1 - life) * (1 - life) * 0.85 * p.flameOpacity);
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(Math.atan2(particle.vy, particle.vx));
      context.drawImage(spriteFor(color), -size * stretch * 0.7, -size / 2, size * stretch, size);
      context.restore();
    }
    context.restore();
  };
  const reset = () => { particles = []; carry = 0; };
  return { draw, reset };
}

/** 某個時間點（秒）各效果的進度 */
export type AtmosphereEntryState = {
  /** 天空不透明度 0～1（已乘上最終不透明度） */
  skyProgress: number;
  /** 星空／星雲速度倍率（光痕 = 此值 ÷ 場景 backdrop.speed × hullBoost） */
  speed: number;
  /** 艦首噴焰強度 0～1 */
  flameIntensity: number;
  /** 雲量（片） */
  cloudCount: number;
};

export function resolveAtmosphereEntryState(p: AtmosphereEntryParams, time: number): AtmosphereEntryState {
  const accel = segment(time, p.accelStart, p.accelDuration, p.accelCurve);
  return {
    skyProgress: segment(time, p.skyStart, p.skyDuration, p.skyCurve) * p.skyMaxOpacity,
    speed: p.speedFrom + (p.speedTo - p.speedFrom) * accel,
    flameIntensity: segment(time, p.flameStart, p.flameDuration, p.flameCurve),
    cloudCount: p.cloudCountStart + (p.cloudCountEnd - p.cloudCountStart) * segment(time, p.cloudGrowStart, p.cloudGrowDuration, p.cloudGrowCurve),
  };
}

/** 天空漸層底色＋摩擦光（畫面座標） */
export function drawAtmosphereSky(context: CanvasRenderingContext2D, width: number, height: number, p: AtmosphereEntryParams, skyProgress: number) {
  const radians = (p.skyAngle * Math.PI) / 180;
  const cx = width / 2, cy = height / 2, reach = Math.hypot(width, height) / 2;
  const gradient = context.createLinearGradient(
    cx - Math.cos(radians) * reach, cy - Math.sin(radians) * reach,
    cx + Math.cos(radians) * reach, cy + Math.sin(radians) * reach,
  );
  gradient.addColorStop(0, p.skyTopColor);
  gradient.addColorStop(1, p.skyBottomColor);
  context.save();
  context.globalAlpha = skyProgress;
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  if (p.heatIntensity > 0) {
    // 摩擦光：從流動方向的上游（船頭方向）照進來，天空淡入到一半最強
    const flow = (p.flowAngle * Math.PI) / 180;
    const hx = cx - Math.cos(flow) * reach * 0.9, hy = cy - Math.sin(flow) * reach * 0.9;
    const [r, g, b] = hexToRgb(p.heatColor);
    const bell = Math.sin(Math.PI * clamp01(skyProgress / Math.max(0.001, p.skyMaxOpacity)));
    const glow = context.createRadialGradient(hx, hy, 0, hx, hy, reach * 1.3);
    glow.addColorStop(0, `rgba(${r},${g},${b},${0.85 * p.heatIntensity * bell})`);
    glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "lighter";
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }
  context.restore();
}

/**
 * 背景（畫面座標）：星空先畫到獨立圖層 → 貼上 → 天空＋摩擦光 → 雲朵 → 星點透出。
 * drawStars 會拿到已設好像素比例變換、清空的星空圖層。
 */
export function createAtmosphereBackdrop() {
  const starLayer = typeof document === "undefined" ? null : document.createElement("canvas");
  const clouds = createAtmosphereClouds();
  const draw = (
    context: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number, dt: number,
    p: AtmosphereEntryParams, state: AtmosphereEntryState, drawStars: (starContext: CanvasRenderingContext2D) => void,
  ) => {
    if (!starLayer || width < 1 || height < 1) return;
    const layerWidth = Math.round(width * pixelRatio), layerHeight = Math.round(height * pixelRatio);
    if (starLayer.width !== layerWidth || starLayer.height !== layerHeight) {
      starLayer.width = layerWidth;
      starLayer.height = layerHeight;
    }
    const starContext = starLayer.getContext("2d")!;
    starContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    starContext.clearRect(0, 0, width, height);
    drawStars(starContext);
    context.drawImage(starLayer, 0, 0, width, height);
    if (state.skyProgress <= 0.001) return;
    drawAtmosphereSky(context, width, height, p, state.skyProgress);
    clouds.draw(context, width, height, dt, p, state.speed, state.skyProgress, state.cloudCount);
    if (p.starResidual > 0) {
      context.save();
      context.globalAlpha = p.starResidual * state.skyProgress;
      context.globalCompositeOperation = "lighter";
      context.drawImage(starLayer, 0, 0, width, height);
      context.restore();
    }
  };
  /** 預先分批畫好雲貼圖（見 createAtmosphereClouds 的 prewarm） */
  const prewarm = (p: AtmosphereEntryParams, budgetMs?: number) => clouds.prewarm(p, budgetMs);
  return { draw, prewarm };
}

/** 以台詞推進的時間軸區段：該句開始時，時間軸從 from 推進到 to */
export type AtmosphereEntrySegment = { lineId: string; from: number; to: number };

/**
 * 時間軸：每段在「標稱時長（to − from）」內走到 to；台詞停著不動時停在該段終點等下一句。
 * 若下一句來得比預期早（時間軸還沒走到該段起點），該段會加快、仍在標稱時長內到達終點，不會跳格。
 */
export class AtmosphereEntryTimeline {
  time = 0;
  private target = 0;
  private rate = 0;
  private readonly segments: readonly AtmosphereEntrySegment[];
  constructor(segments: readonly AtmosphereEntrySegment[]) {
    this.segments = segments;
  }
  /** 時間軸已開始（之後即使停住，天空等效果都維持） */
  get active() { return this.target > 0 || this.time > 0; }
  lineStarted(lineId: string) {
    const segment = this.segments.find((item) => item.lineId === lineId);
    if (!segment || segment.to <= this.time) return false;
    const duration = Math.max(0.001, segment.to - segment.from);
    this.target = Math.max(this.target, segment.to);
    this.rate = (this.target - this.time) / duration;
    return true;
  }
  advance(dt: number) {
    if (this.time >= this.target || dt <= 0) return this.time;
    this.time = Math.min(this.target, this.time + this.rate * dt);
    return this.time;
  }
  /** 在 seconds 秒內直接推進到 end（例：對話提早結束、黑畫面淡入期間走完） */
  finish(end: number, seconds: number) {
    if (end <= this.time) return;
    this.target = end;
    this.rate = (end - this.time) / Math.max(0.001, seconds);
  }
  reset() { this.time = this.target = this.rate = 0; }
}

/** 第二章 section-18（駕駛座迫降）：哪一句開始時，時間軸推進到幾秒 */
export const CHAPTER02_ATMOSPHERE_ENTRY_DIALOGUE_ID = "chapter02-section-18";
export const CHAPTER02_ATMOSPHERE_ENTRY_SEGMENTS: readonly AtmosphereEntrySegment[] = [
  { lineId: "chapter02-section-18-line-001", from: 0, to: 6 },
  { lineId: "chapter02-section-18-line-005", from: 6, to: 8.5 },
  { lineId: "chapter02-section-18-line-008", from: 8.5, to: 10 },
];
export const CHAPTER02_ATMOSPHERE_ENTRY_END_SECONDS = 10;
