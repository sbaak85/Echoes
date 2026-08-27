import {
  BGM_CONTROL_RULES,
  BGM_TRACK_CONFIG,
  type BgmControlRuleDefinition,
  type BgmRestoreMode,
  type BgmRuleTriggerType,
  type BgmTrackDefinition,
} from "./audio-event-manager.ts";

export type BgmStateLookup = (
  triggerType: BgmRuleTriggerType,
  targetId: string,
) => string | null;

export type BgmControlPlan = {
  activeRuleIds: string[];
  trackId: string;
  trackTransition: "switch" | "fade";
  volumeMultiplier: number;
  fadeOutSeconds: number;
  fadeInSeconds: number;
  restoreMode: BgmRestoreMode;
};

export type BgmTrackTransitionEnvelope = {
  oldVolumeMultiplier: number;
  newVolumeMultiplier: number;
  complete: boolean;
};

export type BgmQuestSnapshotEntry = {
  state: string;
  currentStageId?: string;
  objectives?: Readonly<Record<string, { state?: string }>>;
};

const clampVolume = (value: number) => Math.min(1, Math.max(0, value));
const clampSeconds = (value: number) => Math.min(60, Math.max(0, value));
const smoothStep = (progress: number) =>
  progress * progress * (3 - 2 * progress);

export function getBgmTrackTransitionEnvelope(
  transition: BgmControlPlan["trackTransition"],
  elapsedSeconds: number,
  fadeOutSeconds: number,
  fadeInSeconds: number,
): BgmTrackTransitionEnvelope {
  const elapsed = Math.max(0, elapsedSeconds);
  const fadeOut = clampSeconds(fadeOutSeconds);
  const fadeIn = clampSeconds(fadeInSeconds);
  const outProgress = fadeOut <= 0 ? 1 : Math.min(1, elapsed / fadeOut);
  const fadeInElapsed = transition === "fade"
    ? elapsed
    : Math.max(0, elapsed - fadeOut);
  const inProgress = fadeIn <= 0 ? 1 : Math.min(1, fadeInElapsed / fadeIn);
  const totalSeconds = transition === "fade"
    ? Math.max(fadeOut, fadeIn)
    : fadeOut + fadeIn;
  return {
    oldVolumeMultiplier: clampVolume(1 - smoothStep(outProgress)),
    newVolumeMultiplier: transition === "switch" && elapsed < fadeOut
      ? 0
      : clampVolume(smoothStep(inProgress)),
    complete: elapsed >= totalSeconds,
  };
}

export function doesBgmRuleMatch(
  rule: BgmControlRuleDefinition,
  lookup: BgmStateLookup,
) {
  if (!rule.enabled) return false;
  const currentState = lookup(rule.triggerType, rule.targetId);
  if (currentState === null) return false;
  const acceptedStates = rule.state
    .split("|")
    .map((state) => state.trim())
    .filter(Boolean);
  return acceptedStates.includes("*") || acceptedStates.includes(currentState);
}

export function resolveBgmControlPlan(
  rules: readonly BgmControlRuleDefinition[],
  lookup: BgmStateLookup,
  defaultTrackId = "default",
): BgmControlPlan {
  const activeRules = rules
    .filter((rule) => doesBgmRuleMatch(rule, lookup))
    .sort((left, right) => right.priority - left.priority);
  const trackRule = activeRules.find(
    (rule) =>
      (rule.action === "switch" || rule.action === "fade") &&
      Boolean(rule.trackId),
  );
  const volumeRule = activeRules.find(
    (rule) => rule.action === "mute" || rule.action === "volume",
  ) ?? trackRule;
  const transitionRule = activeRules[0];

  return {
    activeRuleIds: activeRules.map((rule) => rule.id),
    trackId: trackRule?.trackId || defaultTrackId,
    trackTransition: trackRule?.action === "fade" ? "fade" : "switch",
    volumeMultiplier: volumeRule?.action === "mute"
      ? 0
      : clampVolume(volumeRule?.targetVolume ?? 1),
    fadeOutSeconds: clampSeconds(transitionRule?.fadeOutSeconds ?? 0),
    fadeInSeconds: clampSeconds(transitionRule?.fadeInSeconds ?? 0),
    restoreMode: transitionRule?.restoreMode ?? "resume",
  };
}

export function applyBgmRuleExitPolicy(
  previousPlan: BgmControlPlan,
  nextPlan: BgmControlPlan,
  rules: readonly BgmControlRuleDefinition[],
  defaultTrackId = "default",
): BgmControlPlan {
  const nextRuleIds = new Set(nextPlan.activeRuleIds);
  const endedRuleId = previousPlan.activeRuleIds.find(
    (ruleId) => !nextRuleIds.has(ruleId),
  );
  const endedRule = rules.find((rule) => rule.id === endedRuleId);
  if (!endedRule) return nextPlan;
  return {
    ...nextPlan,
    trackId: endedRule.restoreMode === "default"
      ? defaultTrackId
      : nextPlan.trackId,
    trackTransition: endedRule.action === "fade" ? "fade" :
      endedRule.action === "switch" ? "switch" : nextPlan.trackTransition,
    fadeOutSeconds: clampSeconds(endedRule.fadeOutSeconds),
    fadeInSeconds: clampSeconds(endedRule.fadeInSeconds),
    restoreMode: endedRule.restoreMode,
  };
}

type BgmDeck = {
  audio: HTMLAudioElement;
  trackId: string | null;
  sourceIndex: number;
};

type SavedTrackPosition = {
  sourceIndex: number;
  currentTime: number;
};

export class BgmDirector {
  private readonly tracks: Readonly<Record<string, BgmTrackDefinition>>;
  private readonly rules: readonly BgmControlRuleDefinition[];
  private readonly defaultTrackId: string;
  private readonly decks: [BgmDeck, BgmDeck];
  private readonly states = new Map<string, string>();
  private readonly savedPositions = new Map<string, SavedTrackPosition>();
  private readonly eventTimerIds = new Map<string, number>();
  private readonly questStageByQuest = new Map<string, string>();
  private readonly objectiveIdsByQuest = new Map<string, Set<string>>();
  private activeDeckIndex = 0;
  private activePlan: BgmControlPlan;
  private transitionFrameId: number | null = null;
  private transitionRequestId = 0;
  private userVolume = 1;
  private enabled = true;
  private disposed = false;

  constructor(
    tracks: Readonly<Record<string, BgmTrackDefinition>> = BGM_TRACK_CONFIG,
    rules: readonly BgmControlRuleDefinition[] = BGM_CONTROL_RULES,
    defaultTrackId = "default",
  ) {
    if (!tracks[defaultTrackId]) {
      throw new Error(`Unknown default BGM track: ${defaultTrackId}`);
    }
    this.tracks = tracks;
    this.rules = rules;
    this.defaultTrackId = defaultTrackId;
    this.decks = [this.createDeck(), this.createDeck()];
    this.activePlan = resolveBgmControlPlan(
      this.rules,
      this.lookupState,
      this.defaultTrackId,
    );
    this.loadTrack(this.decks[0], this.defaultTrackId, "restart");
    this.decks[0].audio.volume = this.getPlanVolume(this.activePlan);
  }

  setEnabled(enabled: boolean) {
    if (this.disposed || this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) {
      void this.play();
    } else {
      this.pause();
    }
  }

  setUserVolume(volume: number) {
    this.userVolume = clampVolume(volume);
    this.applyCurrentVolume(0);
  }

  isPlaying() {
    const deck = this.decks[this.activeDeckIndex];
    return deck.trackId === this.activePlan.trackId && !deck.audio.paused;
  }

  play() {
    if (this.disposed || !this.enabled) return Promise.resolve();
    const currentDeck = this.decks[this.activeDeckIndex];
    if (currentDeck.trackId === this.activePlan.trackId) {
      currentDeck.audio.volume = this.getPlanVolume(this.activePlan);
      return currentDeck.audio.play();
    }

    // A rule can change tracks while browser autoplay is blocked. Keep that
    // plan pending, then retry the intended deck on the next real player input
    // instead of accidentally resuming the old track.
    const nextDeckIndex = this.activeDeckIndex === 0 ? 1 : 0;
    const nextDeck = this.decks[nextDeckIndex];
    if (nextDeck.trackId !== this.activePlan.trackId) {
      nextDeck.audio.pause();
      const restoreMode = this.activePlan.restoreMode === "default"
        ? "restart"
        : this.activePlan.restoreMode;
      if (!this.loadTrack(nextDeck, this.activePlan.trackId, restoreMode)) {
        return Promise.reject(
          new Error(`Unknown BGM track: ${this.activePlan.trackId}`),
        );
      }
    }
    nextDeck.audio.volume = 0;
    const requestId = ++this.transitionRequestId;
    return nextDeck.audio.play().then(() => {
      if (this.disposed || requestId !== this.transitionRequestId) return;
      this.activeDeckIndex = nextDeckIndex;
      this.transitionTracks(
        currentDeck,
        nextDeck,
        this.getPlanVolume(this.activePlan),
        this.activePlan.fadeOutSeconds,
        this.activePlan.fadeInSeconds,
        this.activePlan.trackTransition,
      );
    });
  }

  pause() {
    this.decks.forEach((deck) => deck.audio.pause());
  }

  setState(
    triggerType: BgmRuleTriggerType,
    targetId: string,
    state: string | null,
  ) {
    if (this.disposed || !targetId.trim()) return;
    const key = this.stateKey(triggerType, targetId);
    if (state === null || !state.trim()) this.states.delete(key);
    else this.states.set(key, state.trim());
    this.refreshPlan();
  }

  syncQuestState(
    questId: string,
    state: string,
    currentStageId?: string,
    objectives?: Readonly<Record<string, { state?: string }>>,
  ) {
    this.assignQuestState(questId, state, currentStageId, objectives);
    this.refreshPlan();
  }

  syncQuestSnapshot(
    quests: Readonly<Record<string, BgmQuestSnapshotEntry>>,
  ) {
    if (this.disposed) return;
    this.clearType("quest");
    this.clearType("questStage");
    this.clearType("objective");
    this.questStageByQuest.clear();
    this.objectiveIdsByQuest.clear();
    Object.entries(quests).forEach(([questId, entry]) => {
      this.assignQuestState(
        questId,
        entry.state,
        entry.currentStageId,
        entry.objectives,
      );
    });
    this.refreshPlan();
  }

  private assignQuestState(
    questId: string,
    state: string,
    currentStageId?: string,
    objectives?: Readonly<Record<string, { state?: string }>>,
  ) {
    this.states.set(this.stateKey("quest", questId), state);

    const previousStageId = this.questStageByQuest.get(questId);
    if (previousStageId && previousStageId !== currentStageId) {
      this.states.delete(this.stateKey("questStage", previousStageId));
    }
    if (state === "active" && currentStageId) {
      this.questStageByQuest.set(questId, currentStageId);
      this.states.set(this.stateKey("questStage", currentStageId), "active");
    } else {
      this.questStageByQuest.delete(questId);
      if (previousStageId) {
        this.states.delete(this.stateKey("questStage", previousStageId));
      }
    }

    const previousObjectiveIds = this.objectiveIdsByQuest.get(questId) ?? new Set();
    const nextObjectiveIds = new Set(Object.keys(objectives ?? {}));
    previousObjectiveIds.forEach((objectiveId) => {
      if (!nextObjectiveIds.has(objectiveId)) {
        this.states.delete(this.stateKey("objective", objectiveId));
      }
    });
    Object.entries(objectives ?? {}).forEach(([objectiveId, objective]) => {
      this.states.set(
        this.stateKey("objective", objectiveId),
        objective.state?.trim() || "locked",
      );
    });
    this.objectiveIdsByQuest.set(questId, nextObjectiveIds);
  }

  setMinigameState(minigameId: string, state: string | null) {
    this.setState("minigame", minigameId, state);
  }

  setChapter(chapter: number) {
    this.clearType("chapter");
    this.setState("chapter", String(chapter), "active");
  }

  setScene(sceneId: string) {
    this.clearType("scene");
    this.setState("scene", sceneId, "active");
  }

  /**
   * Dialogue-line cues are latched: a configured cue remains active until a
   * later configured Line ID replaces it. Ordinary lines without a BGM rule do
   * not cancel the previous cue.
   */
  triggerDialogueLine(lineId: string, state = "triggered") {
    const normalizedLineId = lineId.trim();
    if (!normalizedLineId || !this.rules.some(
      (rule) => rule.enabled &&
        rule.triggerType === "dialogueLine" &&
        rule.targetId === normalizedLineId,
    )) return;
    this.clearType("dialogueLine");
    this.setState("dialogueLine", normalizedLineId, state);
  }

  triggerEvent(eventId: string, state = "triggered", durationSeconds?: number) {
    this.setState("event", eventId, state);
    const configuredDuration = this.rules
      .filter(
        (rule) =>
          rule.enabled &&
          rule.triggerType === "event" &&
          rule.targetId === eventId &&
          (rule.state === "*" || rule.state === state),
      )
      .reduce((duration, rule) => Math.max(duration, rule.durationSeconds), 0);
    const duration = durationSeconds ?? configuredDuration;
    const previousTimer = this.eventTimerIds.get(eventId);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    if (!(duration > 0)) return;
    const timerId = window.setTimeout(() => {
      this.eventTimerIds.delete(eventId);
      this.setState("event", eventId, null);
    }, duration * 1000);
    this.eventTimerIds.set(eventId, timerId);
  }

  clearEvent(eventId: string) {
    const timerId = this.eventTimerIds.get(eventId);
    if (timerId !== undefined) window.clearTimeout(timerId);
    this.eventTimerIds.delete(eventId);
    this.setState("event", eventId, null);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelTransition();
    this.eventTimerIds.forEach((timerId) => window.clearTimeout(timerId));
    this.eventTimerIds.clear();
    this.decks.forEach((deck) => {
      deck.audio.pause();
      deck.audio.removeAttribute("src");
      deck.audio.load();
    });
  }

  private readonly lookupState: BgmStateLookup = (triggerType, targetId) =>
    this.states.get(this.stateKey(triggerType, targetId)) ?? null;

  private stateKey(triggerType: BgmRuleTriggerType, targetId: string) {
    return `${triggerType}:${targetId.trim()}`;
  }

  private clearType(triggerType: BgmRuleTriggerType) {
    const prefix = `${triggerType}:`;
    [...this.states.keys()].forEach((key) => {
      if (key.startsWith(prefix)) this.states.delete(key);
    });
  }

  private createDeck(): BgmDeck {
    const deck: BgmDeck = {
      audio: new Audio(),
      trackId: null,
      sourceIndex: 0,
    };
    deck.audio.preload = "auto";
    deck.audio.addEventListener("ended", () => this.advanceDeck(deck));
    return deck;
  }

  private advanceDeck(deck: BgmDeck) {
    if (this.disposed || !deck.trackId) return;
    const track = this.tracks[deck.trackId];
    if (!track || track.sources.length === 0) return;
    const nextSourceIndex = deck.sourceIndex + 1;
    if (nextSourceIndex >= track.sources.length && !track.loop) return;
    deck.sourceIndex = nextSourceIndex % track.sources.length;
    deck.audio.src = track.sources[deck.sourceIndex];
    deck.audio.load();
    if (this.enabled && deck === this.decks[this.activeDeckIndex]) {
      deck.audio.volume = this.getPlanVolume(this.activePlan);
      void deck.audio.play().catch(() => {});
    }
  }

  private loadTrack(
    deck: BgmDeck,
    trackId: string,
    restoreMode: BgmRestoreMode,
  ) {
    const track = this.tracks[trackId];
    if (!track || track.sources.length === 0) return false;
    deck.trackId = trackId;
    const saved = restoreMode === "resume" && track.rememberPosition
      ? this.savedPositions.get(trackId)
      : undefined;
    deck.sourceIndex = Math.min(
      track.sources.length - 1,
      Math.max(0, saved?.sourceIndex ?? 0),
    );
    deck.audio.src = track.sources[deck.sourceIndex];
    deck.audio.loop = Boolean(track.loop && track.sources.length === 1);
    deck.audio.load();
    if (saved && saved.currentTime > 0) {
      const restorePosition = () => {
        deck.audio.currentTime = Math.min(
          saved.currentTime,
          Number.isFinite(deck.audio.duration)
            ? Math.max(0, deck.audio.duration - 0.05)
            : saved.currentTime,
        );
      };
      if (deck.audio.readyState >= 1) restorePosition();
      else deck.audio.addEventListener("loadedmetadata", restorePosition, { once: true });
    }
    return true;
  }

  private rememberDeck(deck: BgmDeck) {
    if (!deck.trackId) return;
    const track = this.tracks[deck.trackId];
    if (!track?.rememberPosition) {
      this.savedPositions.delete(deck.trackId);
      return;
    }
    this.savedPositions.set(deck.trackId, {
      sourceIndex: deck.sourceIndex,
      currentTime: Number.isFinite(deck.audio.currentTime)
        ? deck.audio.currentTime
        : 0,
    });
  }

  private refreshPlan() {
    const nextPlan = applyBgmRuleExitPolicy(
      this.activePlan,
      resolveBgmControlPlan(
        this.rules,
        this.lookupState,
        this.defaultTrackId,
      ),
      this.rules,
      this.defaultTrackId,
    );
    const planUnchanged =
      nextPlan.trackId === this.activePlan.trackId &&
      nextPlan.trackTransition === this.activePlan.trackTransition &&
      nextPlan.volumeMultiplier === this.activePlan.volumeMultiplier &&
      nextPlan.activeRuleIds.join("|") === this.activePlan.activeRuleIds.join("|");
    this.activePlan = nextPlan;
    if (planUnchanged) {
      const currentDeck = this.decks[this.activeDeckIndex];
      const targetVolume = this.getPlanVolume(nextPlan);
      if (
        this.transitionFrameId === null &&
        currentDeck.trackId === nextPlan.trackId &&
        Math.abs(currentDeck.audio.volume - targetVolume) > 0.001
      ) {
        this.fadeDecks(
          currentDeck,
          targetVolume,
          targetVolume < currentDeck.audio.volume
            ? nextPlan.fadeOutSeconds
            : nextPlan.fadeInSeconds,
        );
      }
      return;
    }
    this.applyPlan(nextPlan);
  }

  private applyPlan(plan: BgmControlPlan) {
    const currentDeck = this.decks[this.activeDeckIndex];
    if (currentDeck.trackId === plan.trackId) {
      const targetVolume = this.getPlanVolume(plan);
      this.fadeDecks(
        currentDeck,
        targetVolume,
        targetVolume < currentDeck.audio.volume
          ? plan.fadeOutSeconds
          : plan.fadeInSeconds,
      );
      return;
    }

    this.rememberDeck(currentDeck);
    const nextDeckIndex = this.activeDeckIndex === 0 ? 1 : 0;
    const nextDeck = this.decks[nextDeckIndex];
    nextDeck.audio.pause();
    const restoreMode = plan.restoreMode === "default" ? "restart" : plan.restoreMode;
    if (!this.loadTrack(nextDeck, plan.trackId, restoreMode)) return;
    nextDeck.audio.volume = 0;
    const requestId = ++this.transitionRequestId;
    const beginTransition = () => {
      if (this.disposed || requestId !== this.transitionRequestId) return;
      this.activeDeckIndex = nextDeckIndex;
      this.transitionTracks(
        currentDeck,
        nextDeck,
        this.getPlanVolume(plan),
        plan.fadeOutSeconds,
        plan.fadeInSeconds,
        plan.trackTransition,
      );
    };
    if (!this.enabled || document.hidden) {
      currentDeck.audio.pause();
      this.activeDeckIndex = nextDeckIndex;
      return;
    }
    void nextDeck.audio.play().then(beginTransition).catch(() => {
      // Autoplay blocked: keep the old deck audible until the next player input retries.
    });
  }

  private transitionTracks(
    oldDeck: BgmDeck,
    newDeck: BgmDeck,
    targetVolume: number,
    fadeOutSeconds: number,
    fadeInSeconds: number,
    transition: BgmControlPlan["trackTransition"],
  ) {
    if (transition === "fade") {
      this.crossfade(
        oldDeck,
        newDeck,
        targetVolume,
        fadeOutSeconds,
        fadeInSeconds,
      );
      return;
    }
    this.switchTracksSequentially(
      oldDeck,
      newDeck,
      targetVolume,
      fadeOutSeconds,
      fadeInSeconds,
    );
  }

  private getPlanVolume(plan: BgmControlPlan) {
    const track = this.tracks[plan.trackId];
    return clampVolume(
      this.userVolume * (track?.volume ?? 1) * plan.volumeMultiplier,
    );
  }

  private applyCurrentVolume(durationSeconds: number) {
    this.fadeDecks(
      this.decks[this.activeDeckIndex],
      this.getPlanVolume(this.activePlan),
      durationSeconds,
    );
  }

  private fadeDecks(
    deck: BgmDeck,
    targetVolume: number,
    durationSeconds: number,
  ) {
    this.cancelTransition();
    const startVolume = deck.audio.volume;
    const startedAt = performance.now();
    const durationMs = clampSeconds(durationSeconds) * 1000;
    const requestId = ++this.transitionRequestId;
    const update = (time: number) => {
      if (this.disposed || requestId !== this.transitionRequestId) return;
      const progress = durationMs <= 0 ? 1 : Math.min(1, (time - startedAt) / durationMs);
      const eased = progress * progress * (3 - 2 * progress);
      deck.audio.volume = clampVolume(
        startVolume + (targetVolume - startVolume) * eased,
      );
      if (progress < 1) this.transitionFrameId = requestAnimationFrame(update);
      else this.transitionFrameId = null;
    };
    this.transitionFrameId = requestAnimationFrame(update);
  }

  private crossfade(
    oldDeck: BgmDeck,
    newDeck: BgmDeck,
    targetVolume: number,
    fadeOutSeconds: number,
    fadeInSeconds: number,
  ) {
    this.cancelTransition();
    const oldStartVolume = oldDeck.audio.volume;
    const startedAt = performance.now();
    const requestId = ++this.transitionRequestId;
    const update = (time: number) => {
      if (this.disposed || requestId !== this.transitionRequestId) return;
      const elapsed = Math.max(0, time - startedAt);
      const envelope = getBgmTrackTransitionEnvelope(
        "fade",
        elapsed / 1000,
        fadeOutSeconds,
        fadeInSeconds,
      );
      oldDeck.audio.volume = clampVolume(
        oldStartVolume * envelope.oldVolumeMultiplier,
      );
      newDeck.audio.volume = clampVolume(
        targetVolume * envelope.newVolumeMultiplier,
      );
      if (!envelope.complete) {
        this.transitionFrameId = requestAnimationFrame(update);
        return;
      }
      this.transitionFrameId = null;
      oldDeck.audio.pause();
    };
    this.transitionFrameId = requestAnimationFrame(update);
  }

  private switchTracksSequentially(
    oldDeck: BgmDeck,
    newDeck: BgmDeck,
    targetVolume: number,
    fadeOutSeconds: number,
    fadeInSeconds: number,
  ) {
    this.cancelTransition();
    const oldStartVolume = oldDeck.audio.volume;
    const newTrackStartTime = Number.isFinite(newDeck.audio.currentTime)
      ? newDeck.audio.currentTime
      : 0;
    const startedAt = performance.now();
    const fadeOutMs = clampSeconds(fadeOutSeconds) * 1000;
    const requestId = ++this.transitionRequestId;
    let oldDeckStopped = false;
    const stopOldDeck = () => {
      if (oldDeckStopped) return;
      oldDeckStopped = true;
      oldDeck.audio.volume = 0;
      oldDeck.audio.pause();
      // The new deck is pre-played at volume 0 to satisfy browser autoplay
      // rules. Rewind it when its audible fade-in actually begins so switch
      // does not silently skip the opening while the old track fades out.
      try {
        newDeck.audio.currentTime = newTrackStartTime;
      } catch {
        // Some browsers briefly expose a non-seekable stream during loading.
      }
    };
    const update = (time: number) => {
      if (this.disposed || requestId !== this.transitionRequestId) return;
      const elapsed = Math.max(0, time - startedAt);
      const envelope = getBgmTrackTransitionEnvelope(
        "switch",
        elapsed / 1000,
        fadeOutSeconds,
        fadeInSeconds,
      );
      oldDeck.audio.volume = clampVolume(
        oldStartVolume * envelope.oldVolumeMultiplier,
      );
      newDeck.audio.volume = clampVolume(
        targetVolume * envelope.newVolumeMultiplier,
      );
      if (elapsed >= fadeOutMs) {
        stopOldDeck();
      }
      if (!envelope.complete) {
        this.transitionFrameId = requestAnimationFrame(update);
        return;
      }
      stopOldDeck();
      newDeck.audio.volume = clampVolume(targetVolume);
      this.transitionFrameId = null;
    };
    this.transitionFrameId = requestAnimationFrame(update);
  }

  private cancelTransition() {
    this.transitionRequestId += 1;
    if (this.transitionFrameId !== null) {
      cancelAnimationFrame(this.transitionFrameId);
      this.transitionFrameId = null;
    }
  }
}
