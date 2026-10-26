import type { DialogueChoiceOutcome, InteractionDialogueScript } from "./interaction-flow";

export type DialogueManagerRequest<TContext = unknown> = {
  id: string;
  script: InteractionDialogueScript;
  context: TContext;
};

export type DialogueManagerResult = {
  completed: boolean;
  /** 對話有選項時，玩家選定的結果 */
  choiceAction?: DialogueChoiceOutcome["choiceAction"];
  choiceId?: string;
};

export type DialoguePresenter<TContext = unknown> = (
  request: DialogueManagerRequest<TContext>,
  complete: (outcome?: DialogueChoiceOutcome) => void,
) => (() => void) | void;

export type DialogueCompletionListener<TContext = unknown> = (
  request: DialogueManagerRequest<TContext>,
) => void;

type DialogueQueueItem<TContext> = DialogueManagerRequest<TContext> & {
  resolve: (result: DialogueManagerResult) => void;
  onComplete?: () => void;
};

/**
 * Central dialogue entry point shared by world interactions and story flows.
 * The manager owns registration, queuing and completion; the React host only
 * presents the current script.
 */
export class DialogueManager<TContext = unknown> {
  private readonly scripts = new Map<string, InteractionDialogueScript>();
  private readonly queue: DialogueQueueItem<TContext>[] = [];
  private presenter: DialoguePresenter<TContext> | null = null;
  private completionListener: DialogueCompletionListener<TContext> | null = null;
  private active: DialogueQueueItem<TContext> | null = null;
  private cancelPresentation: (() => void) | null = null;

  setPresenter(presenter: DialoguePresenter<TContext>) {
    this.presenter = presenter;
    this.pump();
  }

  setCompletionListener(listener: DialogueCompletionListener<TContext> | null) {
    this.completionListener = listener;
  }

  register(id: string, script: InteractionDialogueScript) {
    this.scripts.set(id, script);
  }

  get(id: string) {
    return this.scripts.get(id) ?? null;
  }

  play(
    id: string,
    script: InteractionDialogueScript,
    context: TContext,
    onComplete?: () => void,
  ): Promise<DialogueManagerResult> {
    return new Promise<DialogueManagerResult>((resolve) => {
      this.queue.push({ id, script, context, resolve, onComplete });
      this.pump();
    });
  }

  playUnique(
    id: string,
    script: InteractionDialogueScript,
    context: TContext,
    onComplete?: () => void,
  ): Promise<DialogueManagerResult> {
    if (
      this.active?.id === id ||
      this.queue.some((queued) => queued.id === id)
    ) {
      return Promise.resolve({ completed: false });
    }
    return this.play(id, script, context, onComplete);
  }

  playRegistered(id: string, context: TContext, onComplete?: () => void): Promise<DialogueManagerResult> {
    const script = this.scripts.get(id);
    if (!script) {
      return Promise.resolve({ completed: false });
    }
    return this.play(id, script, context, onComplete);
  }

  isPlaying() {
    return this.active !== null;
  }

  completeCurrent(outcome?: DialogueChoiceOutcome) {
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.cancelPresentation = null;
    // 選了「cancel」的選項：對話正常結束，但不執行呼叫端接在對話後的互動（例如開始小遊戲）
    if (outcome?.choiceAction !== "cancel") active.onComplete?.();
    try {
      this.completionListener?.({
        id: active.id,
        script: active.script,
        context: active.context,
      });
    } catch (error) {
      // A quest handoff listener must not strand the dialogue queue. The
      // caller still receives a completed result and the next dialogue pumps.
      console.error("[DialogueManager] Completion listener failed.", error);
    }
    // 沒有選項的對話維持原本的 { completed: true }
    active.resolve(outcome?.choiceAction
      ? { completed: true, choiceAction: outcome.choiceAction, choiceId: outcome.choiceId }
      : { completed: true });
    this.pump();
  }

  cancelCurrent() {
    const active = this.active;
    if (!active) return;
    this.cancelPresentation?.();
    this.cancelPresentation = null;
    this.active = null;
    active.resolve({ completed: false });
    this.pump();
  }

  clearQueue() {
    for (const queued of this.queue.splice(0)) {
      queued.resolve({ completed: false });
    }
  }

  private pump() {
    if (this.active || !this.presenter || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.active = next;
    const cancel = this.presenter(next, (outcome) => {
      if (this.active !== next) return;
      this.completeCurrent(outcome);
    });
    this.cancelPresentation = typeof cancel === "function" ? cancel : null;
  }
}
