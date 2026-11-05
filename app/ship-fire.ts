// 船艙受損後的火焰、火星與爆炸。
// 配置在 public/effects/ship_interior.effects.json，由 tools/effect-editor（遊戲開發伺服器的 /__effect-editor/）編輯與存檔。
// - 火源起火方式 ignite（起火後都常駐）：
//   "section16" section-16 播完（黑畫面）後；"warp" 脫離曲速的白畫面淡入到全白後（section-13）；
//   "line" 指定台詞（igniteLineId）開始時；"boom" 被指定爆炸（ignitedBy）引燃。
// - 阻擋圈 blockers：可任意擺放的圓，同樣依起火方式成立後變成玩家無法通過的碰撞（activeBlockers）。
// - 爆炸 trigger "line"：指定對話句子（lineId）開始時引爆；"area"：玩家走進圓形範圍（且符合條件）時引爆。
// - 爆炸過的紀錄存在劇情旗標 ship-boom:<ID>，讀檔後不會重炸，被引燃的火源直接恢復燃燒。
// - 爆炸可指定 dialogueId：炸開後 dialogueDelayMs 毫秒播放該對話（只在真正炸開時播一次）。
// 粒子在參考座標（referenceSize，預設 1600×1600 的船艙預覽圖）模擬，畫的時候再放大到世界座標。

export type ShipFireSettings = {
  fireSize: number; fireRate: number; fireHeight: number; fireSway: number; glow: number; smoke: number;
  sparkInterval: number; sparkCount: number; sparkSpeed: number; gravity: number; sparkTrail: number; embers: number;
};
export type ShipExplosionSettings = {
  duration: number; flash: number; ring: number; debris: number; smoke: number; shake: number; scorch: number;
  /** 爆炸後多久開始起火（秒，會依距離再晚一點） */
  igniteDelay: number;
  /** 起火後多久燒到最大（秒） */
  igniteRamp: number;
};
export type ShipEffectEmitter = {
  id: string;
  type: "fire" | "spark";
  x: number;
  y: number;
  scale: number;
  ignite: ShipEmitterIgnite;
  /** ignite "boom"：引燃它的爆炸 ID（其他方式為空字串） */
  ignitedBy: string;
  /** ignite "line"：這句台詞開始時起火（其他方式為空字串） */
  igniteLineId: string;
};
export type ShipEmitterIgnite = "section16" | "warp" | "line" | "boom";
/** 阻擋圈：條件成立（與火源相同的起火方式）後變成玩家無法通過的圓；位置與火源、爆炸點無關，可任意擺放 */
export type ShipBlocker = {
  id: string;
  x: number;
  y: number;
  /** 參考座標的半徑 */
  radius: number;
  ignite: ShipEmitterIgnite;
  ignitedBy: string;
  igniteLineId: string;
};
const EMITTER_IGNITES: readonly ShipEmitterIgnite[] = ["section16", "warp", "line", "boom"];
export type ShipBoomTrigger = "line" | "area";
export type ShipBoom = {
  id: string;
  x: number;
  y: number;
  size: number;
  /** 編輯工具「自動分配」用的引燃範圍（參考座標） */
  igniteRadius: number;
  trigger: ShipBoomTrigger;
  /** trigger "line"：這句台詞開始時引爆 */
  lineId: string;
  delayMs: number;
  /** trigger "area"：玩家進入這個半徑（參考座標，正圓）時引爆 */
  radius: number;
  /** trigger "area" 的條件：此對話已播完（空字串＝不限） */
  requireDialogue: string;
  /** trigger "area" 的條件：此任務已到達此階段（任一空白＝不限） */
  requireQuestId: string;
  requireStageId: string;
  /** 爆炸後播放的對話 ID（劇情多邊形台詞或劇情段落；空字串＝不播） */
  dialogueId: string;
  /** 爆炸後多久開始播放對話（毫秒，期間鎖住操作） */
  dialogueDelayMs: number;
};
export type ShipEffectsData = {
  schemaVersion: number;
  sceneId: string;
  chapter: number;
  referenceSize: number;
  /** 播完這段對話後，常駐火源開始燃燒 */
  startDialogue: string;
  fire: ShipFireSettings;
  explosion: ShipExplosionSettings;
  emitters: ShipEffectEmitter[];
  booms: ShipBoom[];
  blockers: ShipBlocker[];
};

export const SHIP_FIRE_SCENE_ID = "ship_interior";
export const SHIP_FIRE_START_DIALOGUE = "chapter02-section-16";
export const SHIP_BOOM_FLAG_PREFIX = "ship-boom:";
/** 配置工具存檔後，開發伺服器推送新配置給遊戲頁面的 HMR 自訂事件 */
export const SHIP_EFFECTS_UPDATED_EVENT = "echoes:ship-effects-updated";
export const shipBoomFlag = (boomId: string) => `${SHIP_BOOM_FLAG_PREFIX}${boomId}`;
/** 指定台詞起火的火源：這句台詞播過的紀錄（劇情旗標） */
export const SHIP_FIRE_LINE_FLAG_PREFIX = "ship-fire-line:";
export const shipFireLineFlag = (lineId: string) => `${SHIP_FIRE_LINE_FLAG_PREFIX}${lineId}`;

/** 爆炸時從這四支隨機抽一支播放（AudioEventManager 事件，可疊播） */
export const SHIP_BOOM_AUDIO_EVENTS = ["chapter02ShipBoom1", "chapter02ShipBoom2", "chapter02ShipBoom3", "chapter02ShipBoom4"] as const;
export const pickShipBoomAudioEvent = (random: () => number = Math.random) =>
  SHIP_BOOM_AUDIO_EVENTS[Math.min(SHIP_BOOM_AUDIO_EVENTS.length - 1, Math.floor(random() * SHIP_BOOM_AUDIO_EVENTS.length))];

/**
 * 第二章船艙接力環境音（Seamless_looping_spa_3）：chapter02-start 播完後開始，section-16 之後照常持續，
 * 離開船艙或第二章結束時停止。
 * 同一支音檔掛在兩個事件（兩條音軌）上接力：每支頭尾各 20% 淡入淡出，播到 80%（開始淡出）就由另一條從頭淡入；
 * 只有剛開始的第一支改用 1.8 秒淡入。
 */
export const SHIP_AMBIENCE_AUDIO_EVENTS = ["chapter02ShipAmbienceA", "chapter02ShipAmbienceB"] as const;
export type ShipAmbienceAudioEvent = (typeof SHIP_AMBIENCE_AUDIO_EVENTS)[number];
export const SHIP_AMBIENCE_START_DIALOGUE_ID = "chapter02-start";
export const SHIP_AMBIENCE_FIRST_FADE_IN_SECONDS = 1.8;
export const SHIP_AMBIENCE_HANDOFF_RATIO = 0.8;

/**
 * 火焰燃燒環境音：BOOM_03 引爆後開始（section-16 播完後也一定在播），三支隨機接力、持續循環，
 * 離開船艙或第二章結束時停止。
 */
export const SHIP_FIRE_LOOP_AUDIO_EVENTS = ["chapter02ShipFireLoop1", "chapter02ShipFireLoop2", "chapter02ShipFireLoop3"] as const;
export type ShipFireLoopAudioEvent = (typeof SHIP_FIRE_LOOP_AUDIO_EVENTS)[number];
export const SHIP_FIRE_LOOP_START_BOOM_ID = "BOOM_03";
export const SHIP_FIRE_LOOP_START_DIALOGUE_ID = "chapter02-section-16";
/** 每支音檔播到這個比例（＝開始 FadeOut 20%）時就接下一支 */
export const SHIP_FIRE_LOOP_HANDOFF_RATIO = 0.8;

export type ShipFireLoopPlayback = { currentTime: number; duration: number; paused: boolean; ended: boolean };

/**
 * 音檔接力：每幀呼叫 update，回傳這一幀要從頭播放的事件（沒有則 null）。
 * 每支的淡入淡出由 AudioEventManager 的 FadeIn／FadeOut % 處理；這裡只決定何時接下一支：
 * 目前這支播到 handoffRatio（開始淡出）就隨機挑另一支（不挑還在播的）開始淡入。
 * active 變成 false 後不再接下一支，正在播的那支照常播完淡出。
 */
export class AudioRelayScheduler<T extends string> {
  private current: T | null = null;
  private currentStarted = false;

  private readonly events: readonly T[];
  private readonly handoffRatio: number;

  constructor(events: readonly T[], handoffRatio: number) {
    this.events = events;
    this.handoffRatio = handoffRatio;
  }

  /** 目前沒有在接力中（下一次回傳的會是第一支） */
  get idle() {
    return this.current === null;
  }

  update(
    active: boolean,
    getPlayback: (eventName: T) => ShipFireLoopPlayback | null,
    random: () => number = Math.random,
  ): T | null {
    if (!active) {
      this.current = null;
      this.currentStarted = false;
      return null;
    }
    if (this.current) {
      const playback = getPlayback(this.current);
      if (!playback) return null;
      // play() 是非同步：真正開始播放（時間前進）之前不判斷接力，避免把剛要播的那支當成已播完
      if (!this.currentStarted) {
        if (playback.currentTime > 0 && !playback.paused) this.currentStarted = true;
        else return null;
      }
      const reachedHandoff = playback.ended || playback.paused
        || (Number.isFinite(playback.duration) && playback.duration > 0
          && playback.currentTime >= playback.duration * this.handoffRatio);
      if (!reachedHandoff) return null;
    }
    const candidates = this.events.filter((eventName) => {
      if (eventName === this.current) return false;
      const playback = getPlayback(eventName);
      return !playback || playback.paused || playback.ended;
    });
    if (!candidates.length) return null;
    const next = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
    this.current = next;
    this.currentStarted = false;
    return next;
  }

  /** 離開船艙等需要立刻安靜時呼叫（呼叫端負責停掉音檔） */
  reset() {
    this.current = null;
    this.currentStarted = false;
  }
}

/** 火焰環境音：三支隨機接力，播到 80% 換下一支 */
export class ShipFireLoopScheduler extends AudioRelayScheduler<ShipFireLoopAudioEvent> {
  constructor() {
    super(SHIP_FIRE_LOOP_AUDIO_EVENTS, SHIP_FIRE_LOOP_HANDOFF_RATIO);
  }
}

export const DEFAULT_SHIP_FIRE_SETTINGS: ShipFireSettings = {
  fireSize: 1, fireRate: 45, fireHeight: 1, fireSway: 1, glow: 1, smoke: 0.45,
  sparkInterval: 2.5, sparkCount: 26, sparkSpeed: 1, gravity: 1, sparkTrail: 1, embers: 0.6,
};
export const DEFAULT_SHIP_EXPLOSION_SETTINGS: ShipExplosionSettings = {
  duration: 1, flash: 1, ring: 1, debris: 1, smoke: 1, shake: 1, scorch: 0.6, igniteDelay: 0.4, igniteRamp: 1.5,
};

// ---- 資料整理（遊戲與編輯工具存檔 API 共用） ----

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const n = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const BOOM_ID = /^[A-Za-z0-9_-]{1,40}$/;

function normalizeSettings<T extends Record<string, number>>(source: unknown, defaults: T, limits: Record<keyof T, [number, number]>): T {
  const raw = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const [min, max] = limits[key];
    (result as Record<keyof T, number>)[key] = num(raw[key as string], defaults[key], min, max);
  }
  return result;
}

const FIRE_LIMITS: Record<keyof ShipFireSettings, [number, number]> = {
  fireSize: [0.1, 5], fireRate: [1, 200], fireHeight: [0.1, 5], fireSway: [0, 3], glow: [0, 3], smoke: [0, 1],
  sparkInterval: [0.1, 20], sparkCount: [1, 200], sparkSpeed: [0.1, 5], gravity: [0, 5], sparkTrail: [0.1, 5], embers: [0, 3],
};
const EXPLOSION_LIMITS: Record<keyof ShipExplosionSettings, [number, number]> = {
  duration: [0.1, 5], flash: [0, 3], ring: [0, 3], debris: [0, 3], smoke: [0, 3], shake: [0, 3], scorch: [0, 1],
  igniteDelay: [0, 10], igniteRamp: [0.05, 10],
};

/** 檢查並補齊資料；格式錯誤時丟出 Error（訊息給編輯工具顯示） */
export function normalizeShipEffectsData(source: unknown): ShipEffectsData {
  if (!source || typeof source !== "object") throw new Error("資料不是物件");
  const raw = source as Record<string, unknown>;
  const referenceSize = num(raw.referenceSize, 1600, 100, 10000);
  const booms: ShipBoom[] = [];
  const boomIds = new Set<string>();
  for (const item of Array.isArray(raw.booms) ? raw.booms : []) {
    const b = (item ?? {}) as Record<string, unknown>;
    const id = str(b.id);
    if (!BOOM_ID.test(id)) throw new Error(`爆炸 ID「${id}」只能用英數字、底線、減號`);
    if (boomIds.has(id)) throw new Error(`爆炸 ID「${id}」重複`);
    boomIds.add(id);
    booms.push({
      id,
      x: num(b.x, 0, -referenceSize, referenceSize * 2),
      y: num(b.y, 0, -referenceSize, referenceSize * 2),
      size: num(b.size, 1, 0.1, 5),
      igniteRadius: num(b.igniteRadius, 240, 0, referenceSize * 2),
      trigger: b.trigger === "area" ? "area" : "line",
      lineId: str(b.lineId),
      delayMs: num(b.delayMs, 0, 0, 60000),
      radius: num(b.radius, 120, 5, referenceSize * 2),
      requireDialogue: str(b.requireDialogue),
      requireQuestId: str(b.requireQuestId),
      requireStageId: str(b.requireStageId),
      dialogueId: str(b.dialogueId),
      dialogueDelayMs: num(b.dialogueDelayMs, 800, 0, 60000),
    });
  }
  const emitters: ShipEffectEmitter[] = [];
  const emitterIds = new Set<string>();
  (Array.isArray(raw.emitters) ? raw.emitters : []).forEach((item, index) => {
    const e = (item ?? {}) as Record<string, unknown>;
    let id = str(e.id) || `E${String(index + 1).padStart(2, "0")}`;
    while (emitterIds.has(id)) id = `${id}_`;
    emitterIds.add(id);
    emitters.push({
      id,
      type: e.type === "spark" ? "spark" : "fire",
      x: num(e.x, 0, -referenceSize, referenceSize * 2),
      y: num(e.y, 0, -referenceSize, referenceSize * 2),
      scale: num(e.scale, 1, 0.1, 5),
      ...normalizeIgnite(e, boomIds),
    });
  });
  const blockers: ShipBlocker[] = [];
  const blockerIds = new Set<string>();
  (Array.isArray(raw.blockers) ? raw.blockers : []).forEach((item, index) => {
    const b = (item ?? {}) as Record<string, unknown>;
    let id = str(b.id) || `K${String(index + 1).padStart(2, "0")}`;
    while (blockerIds.has(id)) id = `${id}_`;
    blockerIds.add(id);
    blockers.push({
      id,
      x: num(b.x, 0, -referenceSize, referenceSize * 2),
      y: num(b.y, 0, -referenceSize, referenceSize * 2),
      radius: num(b.radius, 60, 5, referenceSize),
      ...normalizeIgnite(b, boomIds),
    });
  });
  return {
    schemaVersion: 1,
    sceneId: str(raw.sceneId) || SHIP_FIRE_SCENE_ID,
    chapter: Math.round(num(raw.chapter, 2, 0, 99)),
    referenceSize,
    startDialogue: str(raw.startDialogue) || SHIP_FIRE_START_DIALOGUE,
    fire: normalizeSettings(raw.fire, DEFAULT_SHIP_FIRE_SETTINGS, FIRE_LIMITS),
    explosion: normalizeSettings(raw.explosion, DEFAULT_SHIP_EXPLOSION_SETTINGS, EXPLOSION_LIMITS),
    emitters,
    booms,
    blockers,
  };
}

/** 火源與阻擋圈共用的起火方式整理 */
function normalizeIgnite(source: Record<string, unknown>, boomIds: Set<string>) {
  const ignitedBy = str(source.ignitedBy);
  const igniteLineId = str(source.igniteLineId);
  // 舊資料沒有 ignite：有 ignitedBy 就是被爆炸引燃，否則 section-16 後
  let ignite: ShipEmitterIgnite = EMITTER_IGNITES.includes(source.ignite as ShipEmitterIgnite)
    ? source.ignite as ShipEmitterIgnite
    : ignitedBy ? "boom" : "section16";
  // 指向不存在的爆炸、或沒填台詞時當作 section-16 後，避免永遠不會成立
  if (ignite === "boom" && !boomIds.has(ignitedBy)) ignite = "section16";
  if (ignite === "line" && !igniteLineId) ignite = "section16";
  return {
    ignite,
    ignitedBy: ignite === "boom" ? ignitedBy : "",
    igniteLineId: ignite === "line" ? igniteLineId : "",
  };
}

export function isShipEffectsScene(data: ShipEffectsData, sceneId: string, chapter: number) {
  return sceneId === data.sceneId && chapter === data.chapter;
}

/** 常駐火源是否該燒了（startDialogue 播完） */
export function isShipFireActive(
  data: ShipEffectsData,
  sceneId: string,
  chapter: number,
  hasDialogueCompleted: (dialogueId: string) => boolean,
): boolean {
  return isShipEffectsScene(data, sceneId, chapter) && hasDialogueCompleted(data.startDialogue);
}

export function findLineBooms(data: ShipEffectsData, lineId: string): ShipBoom[] {
  return data.booms.filter((boom) => boom.trigger === "line" && boom.lineId !== "" && boom.lineId === lineId);
}

export function isBoomConditionMet(
  boom: ShipBoom,
  hasDialogueCompleted: (dialogueId: string) => boolean,
  hasQuestReachedStage: (questId: string, stageId: string) => boolean,
) {
  if (boom.requireDialogue && !hasDialogueCompleted(boom.requireDialogue)) return false;
  if (boom.requireQuestId && boom.requireStageId && !hasQuestReachedStage(boom.requireQuestId, boom.requireStageId)) return false;
  return true;
}

/** 玩家（參考座標）目前站在哪些還沒炸過、條件成立的範圍爆炸裡 */
export function findAreaBoomsToTrigger(
  data: ShipEffectsData,
  player: { x: number; y: number },
  isBoomDone: (boomId: string) => boolean,
  isConditionMet: (boom: ShipBoom) => boolean,
): ShipBoom[] {
  return data.booms.filter((boom) => (
    boom.trigger === "area" &&
    !isBoomDone(boom.id) &&
    Math.hypot(player.x - boom.x, player.y - boom.y) <= boom.radius &&
    isConditionMet(boom)
  ));
}

// ---- 繪製 ----

type EmitterState = ShipEffectEmitter & { acc: number; next: number; seed: number; heat: number; igniteAt: number | null };
type Flame = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; seed: number; emitter: EmitterState };
type Smoke = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; boom: boolean };
type Spark = {
  x: number; y: number; vx: number; vy: number; floor: number; bounces: number;
  life: number; max: number; heat: number; width: number; small: boolean;
};
type Flash = { x: number; y: number; life: number; max: number; size: number };
type BoomGlow = { x: number; y: number; life: number; max: number; size: number };
type Fireball = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };
type Ring = { x: number; y: number; life: number; max: number; radius: number };
type Debris = {
  x: number; y: number; vx: number; vy: number; floor: number; rot: number; vr: number;
  size: number; verts: [number, number][]; life: number; max: number; bounces: number;
};
type Scorch = { x: number; y: number; size: number; alpha: number };

export type ShipFireFrameEnv = {
  /** 常駐火源是否燒起來（startDialogue 播完） */
  fireStarted: boolean;
  /** 脫離曲速的白畫面已淡入到全白（ignite "warp" 的火源起火） */
  warpExited: boolean;
  /** 這句台詞已經播過（ignite "line" 的火源讀檔時直接恢復燃燒） */
  isLineFired: (lineId: string) => boolean;
  isBoomDone: (boomId: string) => boolean;
  /** 玩家世界座標；null＝不檢查範圍爆炸（對話中、轉場中…） */
  player: { x: number; y: number } | null;
  isAreaConditionMet: (boom: ShipBoom) => boolean;
};

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

/** update + draw 合在 frame() 裡；context 目前必須是世界座標（地圖左上角為原點）。 */
export class ShipFireEffect {
  readonly data: ShipEffectsData;
  private readonly worldScale: number;
  private readonly emitters: EmitterState[];
  private readonly flames: Flame[] = [];
  private readonly smokes: Smoke[] = [];
  private readonly sparks: Spark[] = [];
  private readonly flashes: Flash[] = [];
  private readonly boomGlows: BoomGlow[] = [];
  private readonly fireballs: Fireball[] = [];
  private readonly rings: Ring[] = [];
  private readonly debris: Debris[] = [];
  private readonly scorches: Scorch[] = [];
  private readonly pending: { at: number; boom: ShipBoom }[] = [];
  /** 這次遊玩中已經引爆或排程的爆炸（避免重複） */
  private readonly fired = new Set<string>();
  /** 讀檔時已炸過、只補上焦痕的爆炸 */
  private readonly restored = new Set<string>();
  private screenFlash = 0;
  private simTime = 0;
  private sprites: {
    tinted: HTMLCanvasElement[]; smoke: HTMLCanvasElement; glow: HTMLCanvasElement; flash: HTMLCanvasElement; scorch: HTMLCanvasElement;
  } | null = null;
  private lastTimeMs: number | null = null;
  /** 爆炸發生時呼叫（記錄旗標、鏡頭震動、音效） */
  onBoom: ((boom: ShipBoom) => void) | null = null;
  /** 有火源因這句台詞起火時呼叫（記錄旗標，讀檔恢復用） */
  onLineIgnite: ((lineId: string) => void) | null = null;
  /** 上一幀的白畫面狀態；null＝還沒更新過（讀檔進來時直接恢復燃燒，不播起火過程） */
  private lastWarpExited: boolean | null = null;
  /** 最近一幀的狀態（activeBlockers 用） */
  private lastEnv: ShipFireFrameEnv | null = null;
  /** 這次遊玩中真的炸開的爆炸（排程中、還沒炸的不算） */
  private readonly exploded = new Set<string>();
  /** 這次遊玩中已觸發的起火台詞 */
  private readonly firedLines = new Set<string>();

  constructor(worldSize: number, data: ShipEffectsData) {
    this.data = data;
    this.worldScale = worldSize / data.referenceSize;
    this.emitters = data.emitters.map((emitter) => ({
      ...emitter, acc: 0, next: Math.random() * 1.5, seed: Math.random() * 1000, heat: 0, igniteAt: null,
    }));
  }

  /** 編輯工具：火源增刪或移動後同步（保留既有火源的燃燒狀態） */
  refreshEmitters() {
    const previous = new Map(this.emitters.map((e) => [e.id, e]));
    this.emitters.length = 0;
    for (const emitter of this.data.emitters) {
      const old = previous.get(emitter.id);
      this.emitters.push(old
        ? Object.assign(old, emitter)
        : { ...emitter, acc: 0, next: Math.random() * 1.5, seed: Math.random() * 1000, heat: 0, igniteAt: null });
    }
    const alive = new Set(this.emitters);
    for (let i = this.flames.length - 1; i >= 0; i--) if (!alive.has(this.flames[i].emitter)) this.flames.splice(i, 1);
  }

  /** 編輯工具：不管有沒有炸過，直接在這個爆炸點炸一次 */
  testBoom(boomId: string) {
    const boom = this.data.booms.find((b) => b.id === boomId);
    if (boom) this.explode(boom);
  }

  /** 對話句子開始時呼叫；有綁定這句的爆炸就排程引爆 */
  triggerLine(lineId: string, isBoomDone: (boomId: string) => boolean) {
    for (const boom of findLineBooms(this.data, lineId)) this.schedule(boom, isBoomDone);
    // 指定這句台詞起火的火源：稍微錯開陸續燒起來
    let ignited = this.data.blockers.some((b) => b.ignite === "line" && b.igniteLineId === lineId);
    for (const e of this.emitters) {
      if (e.ignite !== "line" || e.igniteLineId !== lineId) continue;
      ignited = true;
      if (e.heat > 0 || e.igniteAt !== null) continue;
      e.igniteAt = this.simTime + Math.random() * 0.4;
    }
    if (ignited) {
      this.firedLines.add(lineId);
      this.onLineIgnite?.(lineId);
    }
  }

  /** 目前成立的阻擋圈（世界座標）；遊戲把它們加進碰撞，玩家無法通過 */
  activeBlockers(): { id: string; x: number; y: number; radius: number }[] {
    const env = this.lastEnv;
    if (!env) return [];
    const s = this.worldScale;
    return this.data.blockers
      .filter((b) => (
        b.ignite === "section16" ? env.fireStarted
        : b.ignite === "warp" ? env.warpExited
        : b.ignite === "line" ? this.firedLines.has(b.igniteLineId) || env.isLineFired(b.igniteLineId)
        : this.exploded.has(b.ignitedBy) || this.restored.has(b.ignitedBy)
      ))
      .map((b) => ({ id: b.id, x: b.x * s, y: b.y * s, radius: b.radius * s }));
  }

  private schedule(boom: ShipBoom, isBoomDone: (boomId: string) => boolean) {
    if (this.fired.has(boom.id) || isBoomDone(boom.id)) return;
    this.fired.add(boom.id);
    this.pending.push({ at: this.simTime + boom.delayMs / 1000, boom });
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
      scorch: makeSprite(128, [[0, "rgba(8,6,5,0.95)"], [0.45, "rgba(14,10,8,0.6)"], [0.8, "rgba(20,14,10,0.18)"], [1, "rgba(20,14,10,0)"]]),
    };
    return this.sprites;
  }

  private spawnFlame(e: EmitterState) {
    const p = this.data.fire;
    const s = p.fireSize * e.scale * (0.35 + 0.65 * e.heat);
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
    const p = this.data.fire;
    const s = p.fireSize * e.scale;
    this.smokes.push({
      x: e.x + (Math.random() - 0.5) * 24 * s,
      y: e.y - 40 * s * p.fireHeight,
      vx: (Math.random() - 0.5) * 8 + 6,
      vy: -(22 + Math.random() * 18),
      life: 0,
      max: 1.8 + Math.random() * 1.4,
      size: (18 + Math.random() * 16) * s,
      boom: false,
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
    const p = this.data.fire;
    const n = Math.round(p.sparkCount * (0.6 + Math.random() * 0.8));
    for (let i = 0; i < n; i++) this.spawnSpark(e.x, e.y, p.sparkSpeed, false);
    this.flashes.push({ x: e.x, y: e.y, life: 0, max: 0.18 + Math.random() * 0.1, size: 70 + Math.random() * 40 });
  }

  private explode(boom: ShipBoom) {
    this.exploded.add(boom.id);
    const ex = this.data.explosion;
    const { x, y } = boom;
    const S = boom.size;
    const root = Math.sqrt(S);
    this.boomGlows.push({ x, y, life: 0, max: 0.5 + 0.9 * ex.duration, size: S });
    this.screenFlash = Math.min(1, this.screenFlash + 0.6 * ex.flash);
    if (ex.flash > 0) this.flashes.push({ x, y, life: 0, max: 0.3, size: 240 * S * ex.flash });
    // 火球：往外衝、很快減速，顏色由白黃冷卻成暗紅
    const nf = Math.round(70 * S);
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (40 + Math.random() * 360) * root;
      this.fireballs.push({
        x: x + (Math.random() - 0.5) * 20 * S, y: y + (Math.random() - 0.5) * 14 * S,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75 - 30,
        life: 0, max: (0.45 + Math.random() * 0.75) * ex.duration,
        size: (16 + Math.random() * 26) * S,
      });
    }
    if (ex.ring > 0) this.rings.push({ x, y, life: 0, max: 0.5, radius: 330 * S });
    // 爆散火星
    const ns = Math.round(90 * S * ex.debris);
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (180 + Math.random() * 620) * root * this.data.fire.sparkSpeed;
      this.sparks.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75 - 60,
        floor: y + (30 + Math.random() * 170) * S,
        bounces: 0, life: 0, max: 0.7 + Math.random() * 1.3,
        heat: 1, width: 1.4 + Math.random() * 1.8, small: false,
      });
    }
    // 金屬碎片
    const nd = Math.round(16 * S * ex.debris);
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (120 + Math.random() * 380) * root;
      const k = 3 + Math.floor(Math.random() * 3);
      const verts: [number, number][] = [];
      for (let j = 0; j < k; j++) {
        const va = j / k * Math.PI * 2 + Math.random() * 0.6;
        const vr = 0.5 + Math.random() * 0.6;
        verts.push([Math.cos(va) * vr, Math.sin(va) * vr]);
      }
      this.debris.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75 - 120,
        floor: y + (20 + Math.random() * 160) * S,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 18,
        size: (3 + Math.random() * 7) * S, verts,
        life: 0, max: 2.5 + Math.random() * 2, bounces: 0,
      });
    }
    // 濃煙（稍微延後才冒出來）
    const nsm = Math.round(14 * S * ex.smoke);
    for (let i = 0; i < nsm; i++) {
      this.smokes.push({
        x: x + (Math.random() - 0.5) * 80 * S, y: y + (Math.random() - 0.5) * 50 * S,
        vx: (Math.random() - 0.5) * 40 + 6, vy: -(10 + Math.random() * 30),
        life: -0.15 - Math.random() * 0.5, max: 3 + Math.random() * 2.5,
        size: (28 + Math.random() * 30) * S, boom: true,
      });
    }
    if (ex.scorch > 0) this.scorches.push({ x, y, size: 120 * S * (0.9 + Math.random() * 0.3), alpha: ex.scorch });
    // 這個爆炸負責的火源：依距離稍晚一點陸續起火
    for (const e of this.emitters) {
      if (e.ignitedBy !== boom.id || e.heat > 0 || e.igniteAt !== null) continue;
      const d = Math.hypot(e.x - x, (e.y - y) / 0.75);
      e.igniteAt = this.simTime + ex.igniteDelay * (0.7 + Math.random() * 0.6) + d / 900;
    }
    this.onBoom?.(boom);
  }

  private startIgnite(e: EmitterState) {
    e.igniteAt = null;
    if (e.type === "spark") {
      e.heat = 1;
      this.burst(e);
      e.next = 0.3 + Math.random() * this.data.fire.sparkInterval;
      return;
    }
    e.heat = 0.001;
    this.flashes.push({ x: e.x, y: e.y, life: 0, max: 0.25, size: 90 * this.data.fire.fireSize * e.scale });
  }

  private update(dt: number, time: number, env: ShipFireFrameEnv) {
    const p = this.data.fire;
    this.lastEnv = env;
    this.simTime += dt;
    this.screenFlash = Math.max(0, this.screenFlash - dt * 3.2);

    // 範圍爆炸：玩家走進圓圈
    if (env.player) {
      const k = 1 / this.worldScale;
      const player = { x: env.player.x * k, y: env.player.y * k };
      for (const boom of findAreaBoomsToTrigger(this.data, player, (id) => this.fired.has(id) || env.isBoomDone(id), env.isAreaConditionMet)) {
        this.schedule(boom, env.isBoomDone);
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.simTime >= this.pending[i].at) {
        const { boom } = this.pending[i];
        this.pending.splice(i, 1);
        this.explode(boom);
      }
    }
    // 讀檔：已經炸過的爆炸只補焦痕，不重播
    for (const boom of this.data.booms) {
      if (this.fired.has(boom.id) || this.restored.has(boom.id) || !env.isBoomDone(boom.id)) continue;
      this.restored.add(boom.id);
      if (this.data.explosion.scorch > 0) this.scorches.push({ x: boom.x, y: boom.y, size: 120 * boom.size, alpha: this.data.explosion.scorch });
    }

    // 白畫面剛淡入到全白：這些火源在白光下陸續燒起來
    if (env.warpExited && this.lastWarpExited === false) {
      for (const e of this.emitters) {
        if (e.ignite === "warp" && e.heat <= 0 && e.igniteAt === null) e.igniteAt = this.simTime + Math.random() * 0.8;
      }
    }
    this.lastWarpExited = env.warpExited;

    for (const e of this.emitters) {
      if (e.heat <= 0 && e.igniteAt === null) {
        // 條件已經成立（讀檔、section-16 黑畫面中）就直接燒；爆炸火源：讀檔時爆炸已發生就直接恢復
        const shouldBurn =
          e.ignite === "section16" ? env.fireStarted
          : e.ignite === "warp" ? env.warpExited
          : e.ignite === "line" ? env.isLineFired(e.igniteLineId)
          : this.restored.has(e.ignitedBy);
        if (shouldBurn) e.heat = 1;
      }
      if (e.igniteAt !== null && this.simTime >= e.igniteAt) this.startIgnite(e);
      if (e.heat <= 0) continue;
      if (e.type === "fire") {
        if (e.heat < 1) e.heat = Math.min(1, e.heat + dt / this.data.explosion.igniteRamp);
        e.acc += dt * p.fireRate * e.scale * (0.25 + 0.75 * e.heat);
        while (e.acc >= 1) { e.acc -= 1; this.spawnFlame(e); }
        if (Math.random() < dt * 6 * p.smoke * e.scale * e.heat) this.spawnSmoke(e);
        // 火焰本身偶爾飄出的小火星
        if (Math.random() < dt * 2.2 * p.embers * e.scale * e.heat) {
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
    for (const list of [this.flashes, this.boomGlows, this.rings] as { life: number; max: number }[][]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life += dt;
        if (list[i].life >= list[i].max) list.splice(i, 1);
      }
    }
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.life += dt;
      if (f.life >= f.max) {
        // 燒完的火球有機會變成一團煙
        if (Math.random() < 0.18 * this.data.explosion.smoke) {
          this.smokes.push({ x: f.x, y: f.y, vx: f.vx * 0.2, vy: -(15 + Math.random() * 20), life: 0, max: 2 + Math.random() * 2, size: f.size * 1.1, boom: true });
        }
        this.fireballs.splice(i, 1);
        continue;
      }
      const damp = 1 - Math.min(0.9, dt * 3.4);
      f.vx *= damp;
      f.vy = f.vy * damp - 45 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      if (d.life >= d.max) { this.debris.splice(i, 1); continue; }
      if (d.bounces > 2) continue;
      d.vx *= 1 - dt * 0.5;
      d.vy += gravity * 0.9 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      if (d.y > d.floor && d.vy > 0) {
        d.y = d.floor;
        d.vy *= -(0.2 + Math.random() * 0.2);
        d.vx *= 0.5;
        d.vr *= 0.5;
        d.bounces++;
      }
    }
  }

  /** 停止繪製一段時間（離開船艙、暫停）後再回來時，不要一次補算整段時間 */
  reset() {
    this.lastTimeMs = null;
  }

  frame(context: CanvasRenderingContext2D, timeMs: number, env: ShipFireFrameEnv) {
    const dt = this.lastTimeMs === null ? 0 : Math.min(0.05, Math.max(0, (timeMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = timeMs;
    const time = timeMs / 1000;
    this.update(dt, time, env);
    const p = this.data.fire;
    const ex = this.data.explosion;
    const { tinted, smoke, glow, flash, scorch } = this.getSprites();

    context.save();
    context.scale(this.worldScale, this.worldScale);

    // 爆炸焦痕（常駐）
    context.globalCompositeOperation = "source-over";
    for (const s of this.scorches) {
      context.globalAlpha = s.alpha;
      context.drawImage(scorch, s.x - s.size, s.y - s.size * 0.75, s.size * 2, s.size * 1.5);
    }

    // 火光照亮周圍（隨火焰閃爍）、爆炸照亮艙室、閃光
    context.globalCompositeOperation = "lighter";
    for (const e of this.emitters) {
      if (e.type !== "fire" || e.heat <= 0) continue;
      const flicker = 0.7 + 0.3 * noise(time * 9 + e.seed) + 0.15 * noise(time * 23 + e.seed * 2);
      const r = 170 * p.fireSize * e.scale * (0.9 + 0.2 * flicker) * (0.5 + 0.5 * e.heat);
      context.globalAlpha = Math.min(1, 0.55 * p.glow * flicker * e.heat);
      context.drawImage(glow, e.x - r, e.y - r * 0.75, r * 2, r * 1.5);
    }
    for (const b of this.boomGlows) {
      const k = b.life / b.max;
      context.globalAlpha = Math.min(1, (1 - k) * (1 - k) * 1.3 * Math.max(0.3, ex.flash));
      const r = 560 * b.size * (0.8 + 0.4 * k);
      context.drawImage(glow, b.x - r, b.y - r * 0.75, r * 2, r * 1.5);
    }
    for (const f of this.flashes) {
      const k = 1 - f.life / f.max;
      context.globalAlpha = k * k;
      const r = f.size * (1 + (1 - k) * 0.6);
      context.drawImage(flash, f.x - r, f.y - r, r * 2, r * 2);
    }
    // 衝擊波：快速擴散的橢圓光環
    for (const ring of this.rings) {
      const k = ring.life / ring.max;
      const r = ring.radius * (1 - Math.pow(1 - k, 3));
      const a = (1 - k) * ex.ring;
      context.beginPath();
      context.ellipse(ring.x, ring.y, r, r * 0.75, 0, 0, Math.PI * 2);
      context.globalAlpha = Math.min(1, a * 0.35);
      context.strokeStyle = "rgb(255,150,70)";
      context.lineWidth = 6 + 34 * (1 - k);
      context.stroke();
      context.globalAlpha = Math.min(1, a * 0.8);
      context.strokeStyle = "rgb(255,236,200)";
      context.lineWidth = 2 + 4 * (1 - k);
      context.stroke();
    }

    // 黑煙（一般混合，在火焰後面）
    context.globalCompositeOperation = "source-over";
    for (const s of this.smokes) {
      const t = s.life / s.max;
      if (t <= 0) continue;
      const a = Math.sin(Math.PI * t) * (s.boom ? 0.7 : 0.55 * p.smoke);
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
    // 爆炸火球：一開始白黃、迅速膨脹並冷卻成暗紅
    for (const f of this.fireballs) {
      const t = f.life / f.max;
      const sprite = tinted[Math.min(32, Math.floor(t * 32))];
      const r = f.size * (0.6 + t * 1.2);
      context.globalAlpha = Math.pow(1 - t, 1.3) * 0.6;
      context.drawImage(sprite, f.x - r, f.y - r, r * 2, r * 2);
    }
    // 火焰底部的亮核心（小、跟著閃爍）
    for (const e of this.emitters) {
      if (e.type !== "fire" || e.heat <= 0) continue;
      const s = p.fireSize * e.scale;
      context.globalAlpha = 0.5 * (0.75 + 0.25 * noise(time * 14 + e.seed)) * e.heat;
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

    // 金屬碎片：暗色碎塊，剛炸出時邊緣燒紅
    for (const d of this.debris) {
      const fade = Math.min(1, (d.max - d.life) / 0.6);
      const hot = Math.max(0, 1 - d.life / 1.4);
      context.save();
      context.translate(d.x, d.y);
      context.rotate(d.rot);
      context.scale(d.size, d.size);
      context.beginPath();
      d.verts.forEach(([vx, vy], i) => (i ? context.lineTo(vx, vy) : context.moveTo(vx, vy)));
      context.closePath();
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = fade;
      context.fillStyle = "#1c1816";
      context.fill();
      if (hot > 0) {
        context.globalCompositeOperation = "lighter";
        context.globalAlpha = hot * fade * 0.9;
        context.fillStyle = "rgb(255,120,40)";
        context.fill();
      }
      context.restore();
    }

    // 爆炸瞬間整個畫面閃白（蓋住地圖周圍一大塊，鏡頭怎麼移都看得到）
    if (this.screenFlash > 0) {
      const size = this.data.referenceSize;
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = 1;
      context.fillStyle = `rgba(255,236,205,${this.screenFlash * this.screenFlash * 0.75})`;
      context.fillRect(-size * 2, -size * 2, size * 5, size * 5);
    }
    context.restore();
  }
}
