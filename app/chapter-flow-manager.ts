export type ChapterFlowAction =
  | { type: "lockInput" }
  | { type: "unlockInput" }
  | { type: "setBlack"; visible: boolean }
  | { type: "wait"; durationMs: number }
  | {
      type: "showCenteredText";
      lines: string[];
      fontSizesPx?: number[];
      fadeInMs: number;
      holdMs: number;
      fadeOutMs: number;
      fadeOnly?: boolean;
      holdSkipConfirmAfterMs?: number;
    }
  | {
      type: "showBlackSubtitle";
      lines: string[];
      fontSizesPx?: number[];
      fadeInMs: number;
      holdMs: number;
      fadeOutMs: number;
      keepBlack: boolean;
      fadeOnly?: boolean;
      beforeFadeOutCheckpointId?: string;
      afterSubtitleFadeOutCheckpointId?: string;
    }
  | { type: "playDialogue"; dialogueId: string }
  | { type: "startQuest"; questId: string }
  | { type: "fadeFromBlack"; durationMs: number }
  | { type: "showMainObjectiveMarker"; durationMs: number };

export type ChapterFlowDefinition = {
  id: string;
  chapter: number;
  once?: boolean;
  keepBlackAfterComplete?: boolean;
  actions: ChapterFlowAction[];
  skipActions?: ChapterFlowAction[];
};

export type ChapterFlowHost = {
  setInputLocked: (locked: boolean) => void;
  setBlack: (visible: boolean) => void;
  fadeToBlack: (durationMs: number) => void;
  fadeFromBlack: (durationMs: number) => void;
  showCenteredText: (action: Extract<
    ChapterFlowAction,
    { type: "showCenteredText" | "showBlackSubtitle" }
  >) => void;
  restartCenteredTextFadeOut?: (durationMs: number) => void;
  hideCenteredText: () => void;
  setCenteredTextHoldSkipPrompt?: (visible: boolean) => void;
  playDialogue: (dialogueId: string) => Promise<unknown>;
  startQuest?: (questId: string) => void | Promise<void>;
  showMainObjectiveMarker?: (durationMs: number) => void;
  cancelDialogue: () => void;
  runBlackSubtitleCheckpoint?: (
    checkpointId: string,
    flowId: string,
  ) => Promise<void>;
  markCompleted: (flowId: string) => void;
  isCompleted: (flowId: string) => boolean;
  onActiveChanged?: (
    active: boolean,
    flowId: string | null,
    keepBlackAfterComplete?: boolean,
  ) => void;
  onPausedChanged?: (paused: boolean) => void;
};

const now = () => typeof performance === "undefined" ? Date.now() : performance.now();

export type CenteredTextHoldSkipResult =
  | "unavailable"
  | "armed"
  | "skipped";

type ActiveCenteredTextHoldSkip = {
  armed: boolean;
  confirmAfterMs: number;
  elapsedMs: number;
  skipRequested: boolean;
};

/** Runs pause-aware, skippable story action sequences. */
export class ChapterFlowManager {
  private readonly host: ChapterFlowHost;
  private activeFlow: ChapterFlowDefinition | null = null;
  private paused = false;
  private skipRequested = false;
  private waitWake: (() => void) | null = null;
  private activeCenteredTextHoldSkip: ActiveCenteredTextHoldSkip | null = null;

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

  requestActiveCenteredTextHoldSkip(): CenteredTextHoldSkipResult {
    const state = this.activeCenteredTextHoldSkip;
    if (
      !state ||
      this.paused ||
      state.skipRequested ||
      state.elapsedMs < state.confirmAfterMs
    ) {
      return "unavailable";
    }
    if (!state.armed) {
      state.armed = true;
      this.host.setCenteredTextHoldSkipPrompt?.(true);
      return "armed";
    }
    state.skipRequested = true;
    this.host.setCenteredTextHoldSkipPrompt?.(false);
    this.waitWake?.();
    return "skipped";
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
      this.clearActiveCenteredTextHoldSkip();
      this.host.hideCenteredText();
      if (flow.keepBlackAfterComplete !== true) {
        // Every non-persistent blackout flow must end in a lit, interactive
        // scene even when an action throws before its ordinary cleanup path.
        this.host.setBlack(false);
        this.host.setInputLocked(false);
      }
      this.paused = false;
      this.skipRequested = false;
      this.activeFlow = null;
      this.host.onPausedChanged?.(false);
      this.host.onActiveChanged?.(
        false,
        flow.id,
        flow.keepBlackAfterComplete === true,
      );
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
          if (action.holdSkipConfirmAfterMs === undefined) {
            await this.wait(
              action.fadeInMs + action.holdMs + action.fadeOutMs,
              allowSkip,
            );
          } else {
            const holdSkipState: ActiveCenteredTextHoldSkip = {
              armed: false,
              confirmAfterMs: Math.max(0, action.holdSkipConfirmAfterMs),
              elapsedMs: 0,
              skipRequested: false,
            };
            this.activeCenteredTextHoldSkip = holdSkipState;
            try {
              await this.wait(
                action.fadeInMs + action.holdMs,
                allowSkip,
                () => holdSkipState.skipRequested,
                (elapsedMs) => { holdSkipState.elapsedMs = elapsedMs; },
              );
              if (allowSkip && this.skipRequested) {
                this.host.hideCenteredText();
                return;
              }
              if (holdSkipState.skipRequested) {
                this.host.restartCenteredTextFadeOut?.(action.fadeOutMs);
              }
              await this.wait(action.fadeOutMs, allowSkip);
            } finally {
              if (this.activeCenteredTextHoldSkip === holdSkipState) {
                this.clearActiveCenteredTextHoldSkip();
              }
            }
          }
          this.host.hideCenteredText();
          break;
        case "showBlackSubtitle":
          this.host.showCenteredText(action);
          this.host.fadeToBlack(action.fadeInMs);
          await this.wait(action.fadeInMs + action.holdMs, allowSkip);
          if (allowSkip && this.skipRequested) {
            this.host.hideCenteredText();
            return;
          }
          if (action.beforeFadeOutCheckpointId) {
            this.host.hideCenteredText();
            await this.host.runBlackSubtitleCheckpoint?.(
              action.beforeFadeOutCheckpointId,
              this.activeFlow?.id ?? "",
            );
            if (allowSkip && this.skipRequested) return;
          }
          if (action.afterSubtitleFadeOutCheckpointId) {
            // This is an explicit persistent-black handoff: let the subtitle's
            // configured fade-out finish first, but keep the blackout opaque
            // while the checkpoint modal owns input. Once saving succeeds,
            // reuse the configured fade-out duration to light the scene.
            await this.wait(action.fadeOutMs, allowSkip);
            this.host.hideCenteredText();
            if (allowSkip && this.skipRequested) return;
            await this.host.runBlackSubtitleCheckpoint?.(
              action.afterSubtitleFadeOutCheckpointId,
              this.activeFlow?.id ?? "",
            );
            if (allowSkip && this.skipRequested) return;
            if (!action.keepBlack) {
              this.host.fadeFromBlack(action.fadeOutMs);
              await this.wait(action.fadeOutMs, allowSkip);
              this.host.setBlack(false);
            }
            break;
          }
          if (!action.keepBlack) {
            this.host.fadeFromBlack(action.fadeOutMs);
          }
          await this.wait(action.fadeOutMs, allowSkip);
          this.host.hideCenteredText();
          if (!action.keepBlack) {
            // 動畫影格可能因分頁隱藏、系統暫停或其他 RAF 中斷而未跑到
            // 最後一格；流程計時完成時仍必須強制回到完全點亮。
            this.host.setBlack(false);
          }
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

  private clearActiveCenteredTextHoldSkip() {
    this.activeCenteredTextHoldSkip = null;
    this.host.setCenteredTextHoldSkipPrompt?.(false);
  }

  private wait(
    durationMs: number,
    allowSkip: boolean,
    shouldFinish?: () => boolean,
    onElapsed?: (elapsedMs: number) => void,
  ) {
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
        onElapsed?.(elapsed);
        previous = current;
        if (
          (allowSkip && this.skipRequested) ||
          shouldFinish?.() ||
          elapsed >= target
        ) {
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
