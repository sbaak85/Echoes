// 船艙受損後的火焰與火星：參數與火源位置來自 output/fire-preview 預覽頁定稿的設定（saved-params.json）。
// chapter02-section-16 播完（黑畫面全黑時）後開始，第二章期間在船艙裡一直燒著；讀檔時依對話紀錄恢復。
// 粒子在預覽圖座標（1600×1600）模擬，畫的時候再放大到世界座標。
// 預覽頁的「環境變暗」「紅色警戒」只是模擬實機紅色警戒光照，不在這裡。

export const SHIP_FIRE_SCENE_ID = "ship_interior";
/** 播完這段對話後開始著火（section-16 的黑畫面期間） */
export const SHIP_FIRE_START_DIALOGUE = "chapter02-section-16";

export const SHIP_FIRE_SETTINGS = {
  fireSize: 1,
  fireRate: 45,
  fireHeight: 1,
  fireSway: 1,
  glow: 1,
  smoke: 0.45,
  sparkInterval: 2.5,
  sparkCount: 26,
  sparkSpeed: 1,
  gravity: 1,
  sparkTrail: 1,
  embers: 0.6,
} as const;

/** 預覽圖的邊長；火源座標與粒子大小都以這張圖為準 */
const PREVIEW_SIZE = 1600;

export type ShipFireEmitter = { type: "fire" | "spark"; x: number; y: number; scale: number };

export const SHIP_FIRE_EMITTERS: readonly ShipFireEmitter[] = [
  { type: "spark", x: 1086, y: 791, scale: 1 },
  { type: "spark", x: 966, y: 690, scale: 1 },
  { type: "spark", x: 809, y: 937, scale: 1 },
  { type: "spark", x: 814, y: 525, scale: 1 },
  { type: "spark", x: 605, y: 667, scale: 1 },
  { type: "spark", x: 650, y: 447, scale: 1 },
  { type: "spark", x: 447, y: 545, scale: 1 },
  { type: "spark", x: 446, y: 351, scale: 1 },
  { type: "fire", x: 1021, y: 1010, scale: 1 },
  { type: "fire", x: 875, y: 1035, scale: 1 },
  { type: "fire", x: 1180, y: 785, scale: 1 },
  { type: "fire", x: 693, y: 953, scale: 1 },
  { type: "fire", x: 910, y: 619, scale: 1 },
  { type: "fire", x: 746, y: 507, scale: 1 },
  { type: "fire", x: 507, y: 665, scale: 1 },
  { type: "fire", x: 393, y: 646, scale: 1 },
  { type: "fire", x: 547, y: 429, scale: 1 },
  { type: "spark", x: 433, y: 695, scale: 1 },
  { type: "spark", x: 337, y: 644, scale: 1 },
  { type: "spark", x: 939, y: 779, scale: 1 },
  { type: "spark", x: 1307, y: 957, scale: 1 },
  { type: "fire", x: 1090, y: 1138, scale: 1 },
];

export function isShipFireActive(
  sceneId: string,
  chapter: number,
  hasDialogueCompleted: (dialogueId: string) => boolean,
): boolean {
  return sceneId === SHIP_FIRE_SCENE_ID && chapter === 2 && hasDialogueCompleted(SHIP_FIRE_START_DIALOGUE);
}

type EmitterState = ShipFireEmitter & { acc: number; next: number; seed: number };
type Flame = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; seed: number; emitter: EmitterState };
type Smoke = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };
type Spark = {
  x: number; y: number; vx: number; vy: number; floor: number; bounces: number;
  life: number; max: number; heat: number; width: number; small: boolean;
};
type Flash = { x: number; y: number; life: number; max: number; size: number };

function makeSprite(size: number, stops: [number, string][]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return canvas;
}

// 火焰顏色：白黃核心 → 橘 → 暗紅
const FLAME_STOPS: [number, [number, number, number]][] = [
  [0, [255, 246, 200]], [0.25, [255, 196, 70]], [0.55, [255, 110, 25]], [0.85, [190, 40, 10]], [1, [90, 15, 5]],
];
function flameColor(t: number): [number, number, number] {
  for (let i = 1; i < FLAME_STOPS.length; i++) {
    if (t <= FLAME_STOPS[i][0]) {
      const [a, ca] = FLAME_STOPS[i - 1], [b, cb] = FLAME_STOPS[i];
      const k = (t - a) / (b - a);
      return [0, 1, 2].map((j) => Math.round(ca[j] + (cb[j] - ca[j]) * k)) as [number, number, number];
    }
  }
  return FLAME_STOPS[FLAME_STOPS.length - 1][1];
}

function noise(x: number) {
  const i = Math.floor(x), f = x - i;
  const h = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

/** update + draw 合在 draw() 裡；context 目前必須是世界座標（地圖左上角為原點）。 */
export class ShipFireEffect {
  private readonly worldScale: number;
  private readonly emitters: EmitterState[];
  private readonly flames: Flame[] = [];
  private readonly smokes: Smoke[] = [];
  private readonly sparks: Spark[] = [];
  private readonly flashes: Flash[] = [];
  private sprites: { tinted: HTMLCanvasElement[]; smoke: HTMLCanvasElement; glow: HTMLCanvasElement; flash: HTMLCanvasElement } | null = null;
  private lastTimeMs: number | null = null;

  constructor(worldSize: number) {
    this.worldScale = worldSize / PREVIEW_SIZE;
    this.emitters = SHIP_FIRE_EMITTERS.map((emitter) => ({
      ...emitter, acc: 0, next: Math.random() * 1.5, seed: Math.random() * 1000,
    }));
  }

  private getSprites() {
    if (this.sprites) return this.sprites;
    const flame = makeSprite(64, [[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,255,255,0.7)"], [0.7, "rgba(255,255,255,0.15)"], [1, "rgba(255,255,255,0)"]]);
    const tinted: HTMLCanvasElement[] = [];
    for (let i = 0; i <= 32; i++) {
      const [r, g, b] = flameColor(i / 32);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const t = canvas.getContext("2d")!;
      t.drawImage(flame, 0, 0);
      t.globalCompositeOperation = "source-in";
      t.fillStyle = `rgb(${r},${g},${b})`;
      t.fillRect(0, 0, 64, 64);
      tinted.push(canvas);
    }
    this.sprites = {
      tinted,
      smoke: makeSprite(64, [[0, "rgba(20,18,18,0.9)"], [0.6, "rgba(20,18,18,0.35)"], [1, "rgba(20,18,18,0)"]]),
      glow: makeSprite(128, [[0, "rgba(255,150,60,0.9)"], [0.35, "rgba(255,110,30,0.35)"], [1, "rgba(255,80,20,0)"]]),
      flash: makeSprite(128, [[0, "rgba(255,250,220,1)"], [0.25, "rgba(255,200,120,0.6)"], [1, "rgba(255,140,60,0)"]]),
    };
    return this.sprites;
  }

  private spawnFlame(e: EmitterState) {
    const p = SHIP_FIRE_SETTINGS;
    const s = p.fireSize * e.scale;
    this.flames.push({
      x: e.x + (Math.random() - 0.5) * 30 * s,
      y: e.y + (Math.random() - 0.5) * 10 * s,
      vx: (Math.random() - 0.5) * 12,
      vy: -(30 + Math.random() * 60) * p.fireHeight * Math.sqrt(s),
      life: 0,
      max: 0.55 + Math.random() * 0.55,
      size: (7 + Math.random() * 9) * s,
      seed: Math.random() * 100,
      emitter: e,
    });
  }

  private spawnSmoke(e: EmitterState) {
    const p = SHIP_FIRE_SETTINGS;
    const s = p.fireSize * e.scale;
    this.smokes.push({
      x: e.x + (Math.random() - 0.5) * 24 * s,
      y: e.y - 40 * s * p.fireHeight,
      vx: (Math.random() - 0.5) * 8 + 6,
      vy: -(22 + Math.random() * 18),
      life: 0,
      max: 1.8 + Math.random() * 1.4,
      size: (18 + Math.random() * 16) * s,
    });
  }

  private spawnSpark(x: number, y: number, speedScale: number, small: boolean) {
    // 大多往側面與下方噴，少數往上
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7;
    const speed = (small ? 30 + Math.random() * 50 : 120 + Math.random() * 260) * speedScale;
    this.sparks.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * (small ? 1 : 0.8) - (small ? 40 : 0),
      floor: y + (small ? 30 + Math.random() * 40 : 20 + Math.random() * 70),
      bounces: 0,
      life: 0,
      max: small ? 0.8 + Math.random() * 0.9 : 0.6 + Math.random() * 1.1,
      heat: small ? 0.6 : 1,
      width: small ? 1.1 : 1.2 + Math.random() * 1.3,
      small,
    });
  }

  private burst(e: EmitterState) {
    const p = SHIP_FIRE_SETTINGS;
    const n = Math.round(p.sparkCount * (0.6 + Math.random() * 0.8));
    for (let i = 0; i < n; i++) this.spawnSpark(e.x, e.y, p.sparkSpeed, false);
    this.flashes.push({ x: e.x, y: e.y, life: 0, max: 0.18 + Math.random() * 0.1, size: 70 + Math.random() * 40 });
  }

  private update(dt: number, time: number) {
    const p = SHIP_FIRE_SETTINGS;
    for (const e of this.emitters) {
      if (e.type === "fire") {
        e.acc += dt * p.fireRate * e.scale;
        while (e.acc >= 1) { e.acc -= 1; this.spawnFlame(e); }
        if (Math.random() < dt * 6 * p.smoke * e.scale) this.spawnSmoke(e);
        // 火焰本身偶爾飄出的小火星
        if (Math.random() < dt * 2.2 * p.embers * e.scale) {
          const s = p.fireSize * e.scale;
          this.spawnSpark(e.x + (Math.random() - 0.5) * 20 * s, e.y - 20 * s * p.fireHeight, 1, true);
        }
      } else {
        e.next -= dt;
        if (e.next <= 0) {
          this.burst(e);
          // 間隔帶一點隨機，偶爾連噴兩下
          e.next = Math.random() < 0.25 ? 0.12 + Math.random() * 0.2 : p.sparkInterval * (0.5 + Math.random());
        }
      }
    }
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i];
      f.life += dt;
      if (f.life >= f.max) { this.flames.splice(i, 1); continue; }
      const sway = (noise(time * 2.3 + f.seed) - 0.5) * 90 * p.fireSway;
      f.vx += (sway - f.vx) * dt * 3;
      // 往中心收攏，讓火焰呈尖頂
      f.vx += (f.emitter.x - f.x) * dt * 2.2;
      f.vy -= 30 * dt * p.fireHeight;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.life += dt;
      if (s.life >= s.max) { this.smokes.splice(i, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy *= 1 - dt * 0.3;
    }
    const gravity = 520 * p.gravity;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt;
      if (s.life >= s.max) { this.sparks.splice(i, 1); continue; }
      const drag = s.small ? 1.8 : 1.1;
      s.vx *= 1 - dt * drag;
      s.vy *= 1 - dt * drag;
      s.vy += gravity * dt * (s.small ? 0.25 : 1);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y > s.floor && s.vy > 0 && !s.small) {
        // 落地彈跳：彈幾下就散掉
        s.y = s.floor;
        s.vy *= -(0.25 + Math.random() * 0.2);
        s.vx *= 0.55;
        s.bounces++;
        if (s.bounces > 2) s.max = Math.min(s.max, s.life + 0.15);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life += dt;
      if (this.flashes[i].life >= this.flashes[i].max) this.flashes.splice(i, 1);
    }
  }

  /** 停止繪製一段時間（離開船艙、暫停）後再回來時，不要一次補算整段時間 */
  reset() {
    this.lastTimeMs = null;
  }

  draw(context: CanvasRenderingContext2D, timeMs: number) {
    const dt = this.lastTimeMs === null ? 0 : Math.min(0.05, Math.max(0, (timeMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = timeMs;
    const time = timeMs / 1000;
    this.update(dt, time);
    const p = SHIP_FIRE_SETTINGS;
    const { tinted, smoke, glow, flash } = this.getSprites();

    context.save();
    context.scale(this.worldScale, this.worldScale);

    // 火光照亮周圍（隨火焰閃爍）與火星噴發的閃光
    context.globalCompositeOperation = "lighter";
    for (const e of this.emitters) {
      if (e.type !== "fire") continue;
      const flicker = 0.7 + 0.3 * noise(time * 9 + e.seed) + 0.15 * noise(time * 23 + e.seed * 2);
      const r = 170 * p.fireSize * e.scale * (0.9 + 0.2 * flicker);
      context.globalAlpha = Math.min(1, 0.55 * p.glow * flicker);
      context.drawImage(glow, e.x - r, e.y - r * 0.75, r * 2, r * 1.5);
    }
    for (const f of this.flashes) {
      const k = 1 - f.life / f.max;
      context.globalAlpha = k * k;
      const r = f.size * (1 + (1 - k) * 0.6);
      context.drawImage(flash, f.x - r, f.y - r, r * 2, r * 2);
    }

    // 黑煙（一般混合，在火焰後面）
    context.globalCompositeOperation = "source-over";
    for (const s of this.smokes) {
      const t = s.life / s.max;
      const a = Math.sin(Math.PI * t) * 0.55 * p.smoke;
      if (a <= 0.01) continue;
      const r = s.size * (1 + t * 2.2);
      context.globalAlpha = a;
      context.drawImage(smoke, s.x - r, s.y - r, r * 2, r * 2);
    }

    // 火焰：只有剛冒出時是黃白，大部分時間是橘紅；稍微拉長成火舌
    context.globalCompositeOperation = "lighter";
    for (const f of this.flames) {
      const t = f.life / f.max;
      const sprite = tinted[Math.min(32, Math.floor((0.12 + t * 0.88) * 32))];
      const r = f.size * (1 - t * 0.55);
      context.globalAlpha = Math.min(1, (1 - t) * 1.8) * 0.42;
      context.drawImage(sprite, f.x - r * 0.8, f.y - r * 1.6, r * 1.6, r * 3.2);
    }
    // 火焰底部的亮核心（小、跟著閃爍）
    for (const e of this.emitters) {
      if (e.type !== "fire") continue;
      const s = p.fireSize * e.scale;
      context.globalAlpha = 0.5 * (0.75 + 0.25 * noise(time * 14 + e.seed));
      context.drawImage(tinted[3], e.x - 16 * s, e.y - 12 * s, 32 * s, 18 * s);
    }

    // 火星：用線段畫出拖尾
    context.lineCap = "round";
    for (const s of this.sparks) {
      const t = s.life / s.max;
      const heat = Math.max(0, s.heat - t * 0.9);
      const [r, g, b] = flameColor(Math.min(1, 0.05 + t * 0.85));
      const trail = p.sparkTrail * (s.small ? 0.03 : 0.045);
      context.globalAlpha = Math.min(1, (1 - t) * 1.4);
      context.strokeStyle = `rgb(${r},${g},${b})`;
      context.lineWidth = s.width * (s.small ? 1 : 1 + heat * 0.6);
      context.beginPath();
      context.moveTo(s.x - s.vx * trail, s.y - s.vy * trail);
      context.lineTo(s.x, s.y);
      context.stroke();
      if (heat > 0.3 && !s.small) {
        context.globalAlpha = heat * 0.35 * (1 - t);
        context.drawImage(tinted[4], s.x - 6, s.y - 6, 12, 12);
      }
    }
    context.restore();
  }
}
