// 紅色警戒光照（船艙）：參數與光源來自 output/red-alert 預覽頁定稿的設定。
// 每間艙室一盞紅色點光源，以牆壁圖層（含高家具）當遮擋物逐光源射線烘焙影子；
// 紅光集中在房間邊緣與牆面、中央最弱。引擎室與盥洗室維持原貌（羽化的中性光）。
// 合成：世界畫面 × 光照圖（multiply），船艙外透明處不受影響。

/** 劇情旗標：chapter02 緊急事件黑畫面全黑時開啟，第二章期間維持。 */
export const RED_ALERT_STORY_FLAG = "chapter02-red-alert";
export const RED_ALERT_SCENE_ID = "ship_interior";

export type RedAlertLight = {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  /** 有設定時為中性光（維持原貌）：不閃爍、不套邊緣打光 */
  color?: string;
  strength?: number;
  feather?: number;
};

export const RED_ALERT_SETTINGS = {
  ambient: 0.83,
  power: 0.98,
  bloom: 0,
  fill: 0.54,
  centerLevel: 0.5,
  alarmPeriodSeconds: 1.6,
  pulse: true,
  redColor: "255,62,48",
} as const;

export const RED_ALERT_LIGHTS: readonly RedAlertLight[] = [
  { id: "bridge", name: "駕駛艙", x: 560, y: 720, r: 340 },
  { id: "lobby", name: "全息桌大廳", x: 845, y: 915, r: 330 },
  { id: "machinery", name: "管線機房", x: 895, y: 640, r: 210 },
  { id: "navroom", name: "航線監測室", x: 1115, y: 745, r: 240 },
  { id: "kitchen", name: "廚房", x: 1290, y: 915, r: 270 },
  { id: "lockers", name: "左側置物走道", x: 575, y: 1065, r: 230 },
  { id: "bathroom", name: "盥洗室（維持原貌）", x: 850, y: 1185, r: 230, color: "255,244,240", strength: 0.95, feather: 7 },
  { id: "bunk1", name: "臥鋪 1", x: 1015, y: 1240, r: 240 },
  { id: "bunk2", name: "臥鋪 2", x: 1240, y: 1390, r: 240 },
  { id: "corridorA", name: "中央走道 A", x: 1180, y: 1080, r: 270 },
  { id: "corridorB", name: "中央走道 B", x: 1450, y: 1290, r: 270 },
  { id: "corridorC", name: "後段走道", x: 1810, y: 1570, r: 260 },
  { id: "tanks", name: "氣瓶艙", x: 1560, y: 1535, r: 280 },
  { id: "cargo", name: "貨物艙", x: 1660, y: 1740, r: 290 },
  { id: "frame", name: "支架艙", x: 1635, y: 1390, r: 190 },
  { id: "workshop", name: "工作間", x: 2055, y: 1440, r: 310 },
  { id: "engine", name: "引擎室（維持原貌）", x: 1665, y: 1140, r: 340, color: "255,240,236", strength: 1, feather: 9 },
];

const RAYS = 900;
const RAY_STEP = 0.5;
const WALL_PENETRATION = 6;

type BakedLight = { main: HTMLCanvasElement; fill: HTMLCanvasElement };

function makeCanvas(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return canvas;
}

function tint(mask: HTMLCanvasElement, color: string) {
  const out = makeCanvas(mask.width);
  const g = out.getContext("2d")!;
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = `rgb(${color})`;
  g.fillRect(0, 0, out.width, out.height);
  return out;
}

/**
 * 烘焙與每幀合成。prepare() 在黑畫面期間呼叫一次（約數十毫秒）；draw() 在世界座標系下、
 * 角色與前景圖層畫完之後呼叫。
 */
export class RedAlertLighting {
  private readonly worldSize: number;
  private readonly bakeSize: number;
  /** 所有紅光（主光＋補光）預先合成一張；每幀只依閃爍調整強度 */
  private redSum: HTMLCanvasElement | null = null;
  /** 維持原貌的中性光（引擎室、盥洗室），不閃爍 */
  private neutralSum: HTMLCanvasElement | null = null;
  private shipMask: HTMLCanvasElement | null = null;
  private lightmap: HTMLCanvasElement | null = null;
  private ready = false;

  constructor(worldSize: number, bakeSize = Math.round(worldSize / 4)) {
    this.worldSize = worldSize;
    this.bakeSize = bakeSize;
  }

  isReady() {
    return this.ready;
  }

  /** floorImage：場景底圖（決定船艙外透明範圍）；wallImage：牆壁前景圖層（遮擋物）。 */
  prepare(floorImage: CanvasImageSource, wallImage: CanvasImageSource) {
    const size = this.bakeSize;
    const wallCanvas = makeCanvas(size);
    const wg = wallCanvas.getContext("2d", { willReadFrequently: true })!;
    wg.drawImage(wallImage, 0, 0, size, size);
    const alpha = wg.getImageData(0, 0, size, size).data;
    const wall = new Uint8Array(size * size);
    for (let i = 0; i < wall.length; i++) wall[i] = alpha[i * 4 + 3] > 140 ? 1 : 0;

    this.shipMask = makeCanvas(size);
    this.shipMask.getContext("2d")!.drawImage(floorImage, 0, 0, size, size);
    this.lightmap = makeCanvas(size);
    const s = size / this.worldSize;
    this.redSum = makeCanvas(size);
    this.neutralSum = makeCanvas(size);
    const red = this.redSum.getContext("2d")!, neutral = this.neutralSum.getContext("2d")!;
    red.globalCompositeOperation = neutral.globalCompositeOperation = "lighter";
    for (const light of RED_ALERT_LIGHTS) {
      const { main, fill } = this.bakeLight(light, wall, s);
      if (light.color) {
        neutral.globalAlpha = Math.min(1, light.strength ?? 1);
        neutral.drawImage(tint(main, light.color), 0, 0);
        continue;
      }
      red.globalAlpha = 1;
      red.drawImage(tint(main, RED_ALERT_SETTINGS.redColor), 0, 0);
      if (RED_ALERT_SETTINGS.fill > 0) {
        red.globalAlpha = Math.min(1, RED_ALERT_SETTINGS.fill);
        red.drawImage(tint(fill, RED_ALERT_SETTINGS.redColor), 0, 0);
      }
    }
    this.ready = true;
  }

  private bakeLight(light: RedAlertLight, wall: Uint8Array, s: number): BakedLight {
    const size = this.bakeSize;
    const centerLevel = RED_ALERT_SETTINGS.centerLevel;
    const free = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < size && y < size && !wall[Math.round(y) * size + Math.round(x)];
    let lx = light.x * s, ly = light.y * s;
    const radius = light.r * s;
    // 光源落在牆壁圖層上時，移到最近的空地
    if (!free(lx, ly)) {
      search: for (let ring = 1; ring < 40; ring++) {
        for (let k = 0; k < ring * 8; k++) {
          const a = (k / (ring * 8)) * Math.PI * 2;
          const x = lx + Math.cos(a) * ring, y = ly + Math.sin(a) * ring;
          if (free(x, y)) { lx = x; ly = y; break search; }
        }
      }
    }
    const rays: { dx: number; dy: number; hit: number; end: number }[] = [];
    for (let k = 0; k < RAYS; k++) {
      const a = (k / RAYS) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let d = 0, hitAt = -1;
      while (d < radius) {
        const x = Math.round(lx + dx * d), y = Math.round(ly + dy * d);
        if (x < 0 || y < 0 || x >= size || y >= size) break;
        if (wall[y * size + x]) {
          if (hitAt < 0) hitAt = d;
          if (d - hitAt > WALL_PENETRATION) break;
        } else if (hitAt >= 0) {
          break;
        }
        d += RAY_STEP;
      }
      rays.push({ dx, dy, hit: hitAt, end: Math.min(d, radius) });
    }
    const raw = makeCanvas(size);
    const g = raw.getContext("2d")!;
    for (let k = 0; k < RAYS; k++) {
      const r0 = rays[k], r1 = rays[(k + 1) % RAYS];
      const end = Math.max(r0.end, r1.end);
      if (end <= 0.5) continue;
      const wallAt = Math.max(r0.hit, r1.hit);
      const grad = g.createRadialGradient(lx, ly, 0, lx, ly, end);
      if (light.color) {
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.55, "rgba(255,255,255,0.95)");
        grad.addColorStop(1, `rgba(255,255,255,${wallAt > 0 ? 0.55 : 0})`);
      } else if (wallAt > 0) {
        const at = Math.min(1, wallAt / end);
        grad.addColorStop(0, `rgba(255,255,255,${centerLevel})`);
        grad.addColorStop(at * 0.55, `rgba(255,255,255,${Math.min(1, centerLevel * 1.6)})`);
        grad.addColorStop(at * 0.85, "rgba(255,255,255,0.55)");
        grad.addColorStop(at, "rgba(255,255,255,1)");
        grad.addColorStop(1, "rgba(255,255,255,0.9)");
      } else {
        grad.addColorStop(0, `rgba(255,255,255,${centerLevel})`);
        grad.addColorStop(0.6, `rgba(255,255,255,${Math.min(1, centerLevel * 1.4)})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
      }
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(lx, ly);
      g.lineTo(lx + r0.dx * r0.end, ly + r0.dy * r0.end);
      g.lineTo(lx + r1.dx * r1.end, ly + r1.dy * r1.end);
      g.closePath();
      g.fill();
    }
    const main = makeCanvas(size);
    const mg = main.getContext("2d")!;
    mg.filter = `blur(${light.feather ?? 2.2}px)`;
    mg.drawImage(raw, 0, 0);
    // 補光：不受遮擋、中央弱外圈強（牆壁圖層含床架等家具，不能讓它們全暗）
    const fill = makeCanvas(size);
    const fg = fill.getContext("2d")!;
    const fr = radius * 0.85;
    const fgrad = fg.createRadialGradient(lx, ly, 0, lx, ly, fr);
    fgrad.addColorStop(0, `rgba(255,255,255,${centerLevel})`);
    fgrad.addColorStop(0.65, "rgba(255,255,255,0.7)");
    fgrad.addColorStop(0.85, "rgba(255,255,255,0.5)");
    fgrad.addColorStop(1, "rgba(255,255,255,0)");
    fg.fillStyle = fgrad;
    fg.fillRect(0, 0, size, size);
    return { main, fill };
  }

  /** context 目前必須是世界座標（地圖左上角為原點）。 */
  draw(context: CanvasRenderingContext2D, timeMs: number) {
    if (!this.ready || !this.lightmap || !this.shipMask || !this.redSum || !this.neutralSum) return;
    const settings = RED_ALERT_SETTINGS;
    const size = this.bakeSize;
    const pulse = settings.pulse
      ? 0.72 + 0.28 * Math.pow(0.5 + 0.5 * Math.sin((timeMs / 1000) * Math.PI * 2 / settings.alarmPeriodSeconds), 1.6)
      : 1;
    const lm = this.lightmap.getContext("2d")!;
    lm.globalCompositeOperation = "source-over";
    lm.globalAlpha = 1;
    const a = settings.ambient;
    lm.fillStyle = `rgb(${Math.round(255 * a * 0.85)},${Math.round(255 * a * 0.42)},${Math.round(255 * a * 0.45)})`;
    lm.fillRect(0, 0, size, size);
    lm.globalCompositeOperation = "lighter";
    lm.drawImage(this.neutralSum, 0, 0);
    lm.globalAlpha = Math.min(1, settings.power * pulse);
    lm.drawImage(this.redSum, 0, 0);
    // 船艙外（底圖透明處）維持白色＝不改變星空背景
    lm.globalAlpha = 1;
    lm.globalCompositeOperation = "destination-in";
    lm.drawImage(this.shipMask, 0, 0);
    lm.globalCompositeOperation = "destination-over";
    lm.fillStyle = "#fff";
    lm.fillRect(0, 0, size, size);
    lm.globalCompositeOperation = "source-over";

    context.save();
    context.globalCompositeOperation = "multiply";
    context.imageSmoothingEnabled = true;
    context.drawImage(this.lightmap, 0, 0, this.worldSize, this.worldSize);
    context.restore();
  }
}
