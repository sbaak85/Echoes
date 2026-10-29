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
