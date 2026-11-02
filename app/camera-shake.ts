// 第二章緊急事件的鏡頭震動：黑畫面亮回後開始，每 5～10 秒震一次並持續循環；
// chapter02-section-11 播完後改為較強的震動。數值先寫在這裡，之後再調整或做成編輯工具。

/** 每次震動開始時隨機播放其中一支（AudioEventManager 事件） */
export const CHAPTER02_SHAKE_AUDIO_EVENTS = ["chapter02ShakeImpact1", "chapter02ShakeImpact2"] as const;

/** 黑畫面亮回後開啟（第一段震動） */
export const CHAPTER02_SHAKE_FLAG = "chapter02-emergency-shake";
/** chapter02-section-11 播完後開啟（第二段、較強的震動） */
export const CHAPTER02_SHAKE_STRONG_FLAG = "chapter02-emergency-shake-strong";

export type CameraShakeSettings = {
  /** X、Y 方向的最大位移（世界座標像素，±） */
  amplitudeX: number;
  amplitudeY: number;
  /** 一次震動持續多久（秒） */
  durationSeconds: number;
  /** 一次震動內來回幾次 */
  count: number;
  /** 兩次震動之間的間隔（秒），每次在範圍內隨機 */
  intervalMinSeconds: number;
  intervalMaxSeconds: number;
};

export const CHAPTER02_SHAKE_LEVELS = {
  normal: { amplitudeX: 5, amplitudeY: 5, durationSeconds: 0.5, count: 5, intervalMinSeconds: 5, intervalMaxSeconds: 10 },
  strong: { amplitudeX: 10, amplitudeY: 10, durationSeconds: 0.75, count: 10, intervalMinSeconds: 5, intervalMaxSeconds: 10 },
} as const satisfies Record<string, CameraShakeSettings>;

/** 白畫面開始淡出時的指定震動：以第一段較弱的震動為準，總長 2 秒、來回頻率不變 */
export const CHAPTER02_WARP_EXIT_SHAKE_DURATION_SECONDS = 2;
/** 最後這段比例內，震幅漸漸收小到 0 */
export const CHAPTER02_WARP_EXIT_SHAKE_FADE_PORTION = 0.2;
export const CHAPTER02_WARP_EXIT_SHAKE = {
  amplitudeX: CHAPTER02_SHAKE_LEVELS.normal.amplitudeX,
  amplitudeY: CHAPTER02_SHAKE_LEVELS.normal.amplitudeY,
  durationSeconds: CHAPTER02_WARP_EXIT_SHAKE_DURATION_SECONDS,
  count: Math.round(CHAPTER02_SHAKE_LEVELS.normal.count * CHAPTER02_WARP_EXIT_SHAKE_DURATION_SECONDS / CHAPTER02_SHAKE_LEVELS.normal.durationSeconds),
} as const;

/** section-16 line-003 的指定震動：一次 0.35 秒（同一般震動的來回數壓縮進 0.35 秒）、±5px、連續 1.5 秒 */
export const CHAPTER02_CIRCUIT_SHAKE_SECONDS_PER_SHAKE = 0.35;
export const CHAPTER02_CIRCUIT_SHAKE_DURATION_SECONDS = 1.5;
/** 最後這段比例內，震幅漸漸收小到 0（避免停在半途突然跳回） */
export const CHAPTER02_CIRCUIT_SHAKE_FADE_PORTION = 0.2;
export const CHAPTER02_CIRCUIT_SHAKE = {
  amplitudeX: 5,
  amplitudeY: 5,
  durationSeconds: CHAPTER02_CIRCUIT_SHAKE_DURATION_SECONDS,
  count: CHAPTER02_SHAKE_LEVELS.normal.count * CHAPTER02_CIRCUIT_SHAKE_DURATION_SECONDS / CHAPTER02_CIRCUIT_SHAKE_SECONDS_PER_SHAKE,
} as const;

/**
 * section-16 line-003 主震動結束後的持續餘震：每次 ±3px、3 秒（頭尾各 20% 淡入／淡出），
 * 每次之間隨機間隔 0.5～1.5 秒，一直循環到 line-011（黑畫面）。來回頻率與 line-003 主震動相同。
 */
export const CHAPTER02_CIRCUIT_AFTERSHOCK_FADE_PORTION = 0.2;
export const CHAPTER02_CIRCUIT_AFTERSHOCK = {
  amplitudeX: 3,
  amplitudeY: 3,
  durationSeconds: 3,
  count: CHAPTER02_SHAKE_LEVELS.normal.count * 3 / CHAPTER02_CIRCUIT_SHAKE_SECONDS_PER_SHAKE,
  intervalMinSeconds: 0.5,
  intervalMaxSeconds: 1.5,
} as const satisfies CameraShakeSettings;
/** 停止（line-011）時，正在震的那一次在這段時間內收到 0，避免鏡頭突然跳回 */
export const CHAPTER02_CIRCUIT_AFTERSHOCK_STOP_FADE_MS = 300;

/**
 * 持續循環的指定震動：start(delayMs) 後等 delay＋隨機間隔開始第一次，之後每次結束再隨機等一段間隔，
 * 一直重複到 stop()。每次震動頭尾各 fadePortion 平滑淡入／淡出。
 * 循環期間（含兩次之間的空檔）active 都為 true，讓呼叫端暫停原本的背景循環震動。
 */
export class RepeatingCameraShake {
  private startRequest: number | null = null;
  private stopRequested = false;
  private running = false;
  private nextStartMs: number | null = null;
  private shakeStartMs: number | null = null;
  private stopStartMs: number | null = null;
  private phase = 0;
  private readonly settings: CameraShakeSettings;
  private readonly fadePortion: number;
  private readonly stopFadeMs: number;
  private readonly random: () => number;
  /** 每次震動開始時呼叫 */
  onShakeStart: (() => void) | null = null;

  constructor(
    settings: CameraShakeSettings = CHAPTER02_CIRCUIT_AFTERSHOCK,
    fadePortion = CHAPTER02_CIRCUIT_AFTERSHOCK_FADE_PORTION,
    stopFadeMs = CHAPTER02_CIRCUIT_AFTERSHOCK_STOP_FADE_MS,
    random: () => number = Math.random,
  ) {
    this.settings = settings;
    this.fadePortion = fadePortion;
    this.stopFadeMs = stopFadeMs;
    this.random = random;
  }

  /** 開始循環：下一次 offset() 起算，等 delayMs 再加一段隨機間隔後震第一次 */
  start(delayMs = 0) { this.startRequest = delayMs; this.stopRequested = false; }
  /** 停止循環：不再排下一次；正在震的那一次在 stopFadeMs 內收到 0 */
  stop() { if (this.running || this.startRequest !== null) this.stopRequested = true; }
  /** 立刻清掉（離開場景等） */
  cancel() {
    this.startRequest = null;
    this.stopRequested = false;
    this.reset();
  }
  get isRunning() { return this.running || this.startRequest !== null; }

  private reset() {
    this.running = false;
    this.nextStartMs = this.shakeStartMs = this.stopStartMs = null;
  }

  private gapMs() {
    const { intervalMinSeconds, intervalMaxSeconds } = this.settings;
    return (intervalMinSeconds + this.random() * (intervalMaxSeconds - intervalMinSeconds)) * 1000;
  }

  offset(timeMs: number): { x: number; y: number; active: boolean } {
    if (this.startRequest !== null) {
      this.running = true;
      this.shakeStartMs = this.stopStartMs = null;
      this.nextStartMs = timeMs + this.startRequest + this.gapMs();
      this.startRequest = null;
    }
    if (!this.running) return { x: 0, y: 0, active: false };
    if (this.stopRequested) {
      this.stopRequested = false;
      if (this.shakeStartMs === null) {
        this.reset();
        return { x: 0, y: 0, active: false };
      }
      this.stopStartMs = timeMs;
    }
    if (this.shakeStartMs === null && this.nextStartMs !== null && timeMs >= this.nextStartMs) {
      this.shakeStartMs = timeMs;
      this.phase = this.random() * Math.PI * 2;
      this.onShakeStart?.();
    }
    if (this.shakeStartMs === null) return { x: 0, y: 0, active: true };
    const progress = (timeMs - this.shakeStartMs) / (this.settings.durationSeconds * 1000);
    const stopFade = this.stopStartMs === null ? 1 : 1 - (timeMs - this.stopStartMs) / this.stopFadeMs;
    if (progress >= 1 || stopFade <= 0) {
      this.shakeStartMs = null;
      if (this.stopStartMs !== null) {
        this.reset();
        return { x: 0, y: 0, active: false };
      }
      this.nextStartMs = timeMs + this.gapMs();
      return { x: 0, y: 0, active: true };
    }
    const smooth = (value: number) => {
      const clamped = Math.min(1, Math.max(0, value));
      return clamped * clamped * (3 - 2 * clamped);
    };
    const envelope = smooth(progress / this.fadePortion) * smooth((1 - progress) / this.fadePortion) * smooth(stopFade);
    const wave = Math.PI * 2 * this.settings.count * progress;
    return {
      x: this.settings.amplitudeX * Math.sin(wave) * envelope,
      y: this.settings.amplitudeY * Math.sin(wave + this.phase) * envelope,
      active: true,
    };
  }
}

/**
 * 指定觸發的單次震動：request() 後，下一次 offset() 開始震；前 80% 維持全強度連續震動，
 * 最後 20% 平滑收小到 0。進行中 active 為 true，呼叫端應以它為主、暫停循環震動。
 */
export class ScriptedCameraShake {
  private requested = false;
  private startMs: number | null = null;
  private phase = 0;
  private readonly settings: Omit<CameraShakeSettings, "intervalMinSeconds" | "intervalMaxSeconds">;
  private readonly fadePortion: number;
  private readonly random: () => number;
  /** 震動開始時呼叫（播放震動音效用） */
  onShakeStart: (() => void) | null = null;

  constructor(
    settings: Omit<CameraShakeSettings, "intervalMinSeconds" | "intervalMaxSeconds"> = CHAPTER02_WARP_EXIT_SHAKE,
    fadePortion = CHAPTER02_WARP_EXIT_SHAKE_FADE_PORTION,
    random: () => number = Math.random,
  ) {
    this.settings = settings;
    this.fadePortion = fadePortion;
    this.random = random;
  }

  request() { this.requested = true; }
  cancel() { this.requested = false; this.startMs = null; }

  offset(timeMs: number): { x: number; y: number; active: boolean } {
    if (this.requested) {
      this.requested = false;
      this.startMs = timeMs;
      this.phase = this.random() * Math.PI * 2;
      this.onShakeStart?.();
    }
    if (this.startMs === null) return { x: 0, y: 0, active: false };
    const progress = (timeMs - this.startMs) / (this.settings.durationSeconds * 1000);
    if (progress >= 1) {
      this.startMs = null;
      return { x: 0, y: 0, active: false };
    }
    const fadeStart = 1 - this.fadePortion;
    const fade = progress <= fadeStart ? 0 : (progress - fadeStart) / this.fadePortion;
    const envelope = 1 - fade * fade * (3 - 2 * fade);
    const wave = Math.PI * 2 * this.settings.count * progress;
    return {
      x: this.settings.amplitudeX * Math.sin(wave) * envelope,
      y: this.settings.amplitudeY * Math.sin(wave + this.phase) * envelope,
      active: true,
    };
  }
}

/**
 * 循環震動：offset() 每幀呼叫，回傳要加到鏡頭上的位移。settings 為 null 時停止並重置。
 * 第一次開啟時立刻震一次，之後每次結束後隨機等 interval 再震。
 */
export class LoopingCameraShake {
  private nextStartMs: number | null = null;
  private activeStartMs: number | null = null;
  private phase = 0;
  private active: CameraShakeSettings | null = null;
  private readonly random: () => number;
  /** 每次震動開始時呼叫（播放震動音效用） */
  onShakeStart: (() => void) | null = null;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** 被指定震動蓋過後：中斷目前這次，從 timeMs 起重新隨機等一段間隔才再震 */
  restartAfterGap(timeMs: number, settings: CameraShakeSettings) {
    this.activeStartMs = null;
    this.active = null;
    const gap = settings.intervalMinSeconds + this.random() * (settings.intervalMaxSeconds - settings.intervalMinSeconds);
    this.nextStartMs = timeMs + gap * 1000;
  }

  offset(timeMs: number, settings: CameraShakeSettings | null): { x: number; y: number } {
    if (!settings) {
      this.nextStartMs = this.activeStartMs = null;
      this.active = null;
      return { x: 0, y: 0 };
    }
    if (this.nextStartMs === null && this.activeStartMs === null) this.nextStartMs = timeMs;
    if (this.activeStartMs === null && this.nextStartMs !== null && timeMs >= this.nextStartMs) {
      this.activeStartMs = timeMs;
      this.active = settings;
      this.phase = this.random() * Math.PI * 2;   // 每次震動的方向不同
      this.onShakeStart?.();
    }
    if (this.activeStartMs === null || !this.active) return { x: 0, y: 0 };
    const shake = this.active;
    const progress = (timeMs - this.activeStartMs) / (shake.durationSeconds * 1000);
    if (progress >= 1) {
      this.activeStartMs = null;
      this.active = null;
      const gap = settings.intervalMinSeconds + this.random() * (settings.intervalMaxSeconds - settings.intervalMinSeconds);
      this.nextStartMs = timeMs + gap * 1000;
      return { x: 0, y: 0 };
    }
    const wave = Math.PI * 2 * shake.count * progress;
    const envelope = 1 - progress;   // 一開始最強，逐漸收小到 0，結尾不跳動
    return {
      x: shake.amplitudeX * Math.sin(wave) * envelope,
      y: shake.amplitudeY * Math.sin(wave + this.phase) * envelope,
    };
  }
}
