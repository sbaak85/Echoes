import type { ChapterFlowDefinition } from "./chapter-flow-manager";
import type { SceneBackdropConfig } from "./scene-starfield";
import type { HullStreamLane } from "./scene-hull-streams";

export const CHAPTER02_WHITE_RIFT_TRIGGER = "chapter02-section-12";
export const CHAPTER02_WHITE_RIFT_DIALOGUE = "chapter02-section-13";
export const CHAPTER02_WHITE_RIFT_REVEAL_LINE = "chapter02-section-13-line-002";
/** Accepted live preview values: 12 / 150% / 80%. Do not read preview localStorage in the game. */
export const WHITE_RIFT_SETTINGS = { spotCount: 12, density: 1.5, spotSize: 0.8 } as const;
export const WHITE_RIFT_TIMING = { fadeInMs: 2000, holdMs: 2000, fadeOutMs: 2000 } as const;
/** Saved while the transition is unfinished, so a reload or loaded save replays it instead of stranding the story. */
export const CHAPTER02_WHITE_RIFT_PENDING_FLAG = "chapter02-white-rift-pending";
/** Set at full white: the ship has left warp, so the starfield keeps warp streaks but flows slower until chapter 2 ends. */
export const CHAPTER02_WARP_EXITED_FLAG = "chapter02-warp-exited";
export const CHAPTER02_WARP_EXIT_STARFIELD_SPEED = 0.2;
const slowedBackdrops = new WeakMap<SceneBackdropConfig, SceneBackdropConfig>();
export function resolveChapter02Backdrop<T extends SceneBackdropConfig | undefined>(
  backdrop: T, storyFlags: Record<string, boolean | undefined>, chapter: number, sceneId: string,
): T {
  if (!backdrop || chapter !== 2 || sceneId !== "ship_interior" || storyFlags[CHAPTER02_WARP_EXITED_FLAG] !== true) return backdrop;
  let slowed = slowedBackdrops.get(backdrop);
  if (!slowed) slowedBackdrops.set(backdrop, slowed = { ...backdrop, mode: "warp", speed: CHAPTER02_WARP_EXIT_STARFIELD_SPEED });
  return slowed as T;
}
/** The hull streaks outside the ship slow down by the same ratio as the starfield (0.6 → 0.2 = ×1/3). */
const slowedHullStreams = new WeakMap<HullStreamLane[], HullStreamLane[]>();
export function resolveChapter02HullStreams<T extends HullStreamLane[] | undefined>(
  lanes: T, backdrop: SceneBackdropConfig | undefined, storyFlags: Record<string, boolean | undefined>, chapter: number, sceneId: string,
): T {
  if (!lanes || resolveChapter02Backdrop(backdrop, storyFlags, chapter, sceneId) === backdrop) return lanes;
  let slowed = slowedHullStreams.get(lanes);
  if (!slowed) {
    const ratio = CHAPTER02_WARP_EXIT_STARFIELD_SPEED / Math.max(0.01, backdrop?.speed ?? 1);
    slowedHullStreams.set(lanes, slowed = lanes.map(lane => ({ ...lane, speed: (lane.speed ?? 1) * ratio })));
  }
  return slowed as T;
}
export function shouldResumeChapter02WhiteRift(storyFlags: Record<string, boolean | undefined>, chapter: number, sceneId: string) {
  return chapter === 2 && sceneId === "ship_interior" && storyFlags[CHAPTER02_WHITE_RIFT_PENDING_FLAG] === true;
}
export const CHAPTER02_WHITE_RIFT_FLOW: ChapterFlowDefinition = {
  id: "chapter02-white-rift", chapter: 2,
  actions: [{ type: "lockInput" }, { type: "whiteRiftTransition" }, { type: "unlockInput" }],
};

type Host = {
  setOpacity: (opacity: number) => void;
  setEmergencySuspended: (suspended: boolean) => void;
  playDialogue: (id: string) => Promise<{ completed: boolean }>;
  /** The screen just became fully white (the speed change is hidden behind it). */
  onFullWhite?: () => void;
  /** section-13 finished and the white layer is fully clear. */
  onCompleted?: () => void;
};

/** Transient presentation only: no save flags are changed while the ship is obscured. */
export class Chapter02WhiteRift {
  private active = false;
  private paused = false;
  private sequence = 0;
  private opacity = 0;
  private fadeOut: Promise<boolean> | null = null;
  private phase: "idle" | "fade-in" | "hold" | "dialogue" | "fade-out" = "idle";
  private pending = new Set<() => void>();
  private abortDialogue: (() => void) | null = null;
  private readonly host: Host;
  constructor(host: Host) { this.host = host; }
  isActive() { return this.active; }
  setPaused(paused: boolean) { this.paused = paused; }

  async run() {
    if (this.active) return;
    this.active = true;
    this.paused = false;
    this.fadeOut = null;
    const sequence = ++this.sequence;
    try {
      this.phase = "fade-in";
      this.setOpacity(0);
      if (!await this.animate(1, WHITE_RIFT_TIMING.fadeInMs)) return;
      this.host.setEmergencySuspended(true);
      this.host.onFullWhite?.();
      this.phase = "hold";
      if (!await this.wait(WHITE_RIFT_TIMING.holdMs)) return;
      this.phase = "dialogue";
      const aborted = new Promise<{ completed: boolean }>(resolve => {
        this.abortDialogue = () => resolve({ completed: false });
      });
      const result = await Promise.race([this.host.playDialogue(CHAPTER02_WHITE_RIFT_DIALOGUE), aborted]);
      this.abortDialogue = null;
      if (!this.active || sequence !== this.sequence || !result.completed) return;
      // Fast clicking or an edited/missing line must still finish a smooth, clear exit.
      if (await this.reveal() && sequence === this.sequence) this.host.onCompleted?.();
    } finally {
      if (sequence === this.sequence) this.cancel();
    }
  }

  lineStarted(dialogueId: string, lineId: string) {
    if (this.active && this.phase === "dialogue" && dialogueId === CHAPTER02_WHITE_RIFT_DIALOGUE && lineId === CHAPTER02_WHITE_RIFT_REVEAL_LINE) {
      void this.reveal();
    }
  }

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.sequence++;
    for (const cancel of [...this.pending]) cancel();
    this.abortDialogue?.();
    this.abortDialogue = null;
    this.fadeOut = null;
    this.phase = "idle";
    this.setOpacity(0);
    this.host.setEmergencySuspended(false);
  }

  private reveal() {
    if (!this.fadeOut) {
      this.phase = "fade-out";
      this.host.setEmergencySuspended(false);
      this.fadeOut = this.animate(0, WHITE_RIFT_TIMING.fadeOutMs);
    }
    return this.fadeOut;
  }
  private setOpacity(value: number) { this.opacity = value; this.host.setOpacity(value); }
  private animate(target: number, duration: number) {
    const from = this.opacity;
    return this.wait(duration, progress => {
      const smooth = progress * progress * (3 - 2 * progress);
      this.setOpacity(from + (target - from) * smooth);
    });
  }
  private wait(duration: number, update?: (progress: number) => void) {
    return new Promise<boolean>(resolve => {
      let elapsed = 0, previous = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (completed: boolean) => {
        if (timer !== undefined) clearTimeout(timer);
        this.pending.delete(cancel);
        resolve(completed);
      };
      const cancel = () => finish(false);
      this.pending.add(cancel);
      const tick = () => {
        const now = performance.now();
        if (!this.paused) elapsed += Math.max(0, now - previous);
        previous = now;
        update?.(Math.min(1, elapsed / duration));
        if (elapsed >= duration) finish(true);
        else timer = setTimeout(tick, 16);
      };
      tick();
    });
  }
}
