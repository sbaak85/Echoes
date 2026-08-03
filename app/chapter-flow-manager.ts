export type ChapterFlowAction =
  | { type: "lockInput" }
  | { type: "unlockInput" }
  | { type: "setBlack"; visible: boolean }
  | { type: "wait"; durationMs: number }
  | {
      type: "showCenteredText";
      lines: string[];
      fadeInMs: number;
      holdMs: number;
      fadeOutMs: number;
    }
  | { type: "playDialogue"; dialogueId: string }
  | { type: "startQuest"; questId: string }
  | { type: "fadeFromBlack"; durationMs: number }
  | { type: "showMainObjectiveMarker"; durationMs: number };

export type ChapterFlowDefinition = {
  id: string;
  chapter: number;
  once?: boolean;
  actions: ChapterFlowAction[];
  skipActions?: ChapterFlowAction[];
};

export type ChapterFlowHost = {
  setInputLocked: (locked: boolean) => void;
  setBlack: (visible: boolean) => void;
  fadeFromBlack: (durationMs: number) => void;
  showCenteredText: (action: Extract<ChapterFlowAction, { type: "showCenteredText" }>) => void;
  hideCenteredText: () => void;
  playDialogue: (dialogueId: string) => Promise<unknown>;
  startQuest?: (questId: string) => void | Promise<void>;
  showMainObjectiveMarker?: (durationMs: number) => void;
  cancelDialogue: () => void;
  markCompleted: (flowId: string) => void;
  isCompleted: (flowId: string) => boolean;
  onActiveChanged?: (active: boolean, flowId: string | null) => void;
  onPausedChanged?: (paused: boolean) => void;
};

const now = () => typeof performance === "undefined" ? Date.now() : performance.now();

/** Runs pause-aware, skippable story action sequences. */
export class ChapterFlowManager {
  private readonly host: ChapterFlowHost;
  private activeFlow: ChapterFlowDefinition | null = null;
  private paused = false;
  private skipRequested = false;
  private waitWake: (() => void) | null = null;

  constructor(host: ChapterFlowHost) {
    this.host = host;
  }

  isActive() {
    return this.activeFlow !== null;
  }

  isPaused() {
    return this.paused;
  }

  getActiveFlowId() {
    return this.activeFlow?.id ?? null;
  }

  pause() {
    if (!this.activeFlow || this.paused) return;
    this.paused = true;
    this.host.onPausedChanged?.(true);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.host.onPausedChanged?.(false);
    this.waitWake?.();
  }

  requestSkip() {
    if (!this.activeFlow) return false;
    this.skipRequested = true;
    // SKIP 是結束劇情流程的保底路徑，不能繼承 Options 暫停狀態，
    // 否則 skipActions 內的黑幕淡出等待會永遠停住。
    if (this.paused) {
      this.paused = false;
      this.host.onPausedChanged?.(false);
    }
    try {
      this.host.cancelDialogue();
    } finally {
      // A presentation cleanup failure must never leave the chapter flow asleep.
      this.waitWake?.();
    }
    return true;
  }

  async run(flow: ChapterFlowDefinition) {
    if (this.activeFlow) return false;
    if (flow.once && this.host.isCompleted(flow.id)) return false;

    this.activeFlow = flow;
    this.skipRequested = false;
    this.paused = false;
    this.host.onActiveChanged?.(true, flow.id);

    try {
      await this.runActions(flow.actions, true);
      if (this.skipRequested) {
        this.skipRequested = false;
        this.paused = false;
        try {
          await this.runActions(flow.skipActions ?? [], false);
        } finally {
          // 不論略過發生在哪個 action，都必須回到可遊玩的亮畫面。
          this.host.hideCenteredText();
          this.host.setBlack(false);
          this.host.setInputLocked(false);
        }
      }
      if (flow.once) this.host.markCompleted(flow.id);
      return true;
    } finally {
      this.host.hideCenteredText();
      this.paused = false;
      this.skipRequested = false;
      this.activeFlow = null;
      this.host.onPausedChanged?.(false);
      this.host.onActiveChanged?.(false, null);
    }
  }

  private async runActions(
    actions: readonly ChapterFlowAction[],
    allowSkip: boolean,
  ) {
    for (const action of actions) {
      if (allowSkip && this.skipRequested) return;
      switch (action.type) {
        case "lockInput":
          this.host.setInputLocked(true);
          break;
        case "unlockInput":
          this.host.setInputLocked(false);
          break;
        case "setBlack":
          this.host.setBlack(action.visible);
          break;
        case "wait":
          await this.wait(action.durationMs, allowSkip);
          break;
        case "showCenteredText":
          this.host.showCenteredText(action);
          await this.wait(
            action.fadeInMs + action.holdMs + action.fadeOutMs,
            allowSkip,
          );
          this.host.hideCenteredText();
          break;
        case "playDialogue":
          await this.host.playDialogue(action.dialogueId);
          break;
        case "startQuest":
          await this.host.startQuest?.(action.questId);
          break;
        case "fadeFromBlack":
          this.host.fadeFromBlack(action.durationMs);
          await this.wait(action.durationMs, allowSkip);
          this.host.setBlack(false);
          break;
        case "showMainObjectiveMarker":
          this.host.showMainObjectiveMarker?.(action.durationMs);
          break;
      }
    }
  }

  private wait(durationMs: number, allowSkip: boolean) {
    const target = Math.max(0, durationMs);
    return new Promise<void>((resolve) => {
      let elapsed = 0;
      let previous = now();
      let timer: ReturnType<typeof setTimeout> | null = null;
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        if (timer !== null) clearTimeout(timer);
        this.waitWake = null;
        resolve();
      };
      const tick = () => {
        if (done) return;
        const current = now();
        if (!this.paused) elapsed += Math.max(0, current - previous);
        previous = current;
        if ((allowSkip && this.skipRequested) || elapsed >= target) {
          finish();
          return;
        }
        timer = setTimeout(tick, 16);
      };
      this.waitWake = () => {
        previous = now();
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(tick, 0);
      };
      tick();
    });
  }
}
