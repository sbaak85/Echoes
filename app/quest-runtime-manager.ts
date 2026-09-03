export type QuestState =
  | "locked"
  | "available"
  | "active"
  | "completed"
  | "failed"
  | "abandoned";

export type QuestObjectiveType =
  | "collectItem"
  | "compoundCollectItem"
  | "submitItemAtInteraction"
  | "haveItem"
  | "interfaceOpened"
  | "itemUsed"
  | "interactionStarted"
  | "interactionSucceeded"
  | "enterArea"
  | "puzzleCompleted"
  | "dialogueCompleted"
  | "objectStateReached"
  | "dayOrTimeReached"
  | "flagCondition"
  | "customProgress";

export type QuestItemRequirement = {
  itemId: string;
  requiredAmount: number;
};

export type QuestObjectiveDefinition = {
  id: string;
  displayText: string;
  startDelaySeconds?: number;
  completionDelaySeconds?: number;
  startPresentationDelaySeconds?: number;
  completionPresentationDelaySeconds?: number;
  startTeleportPointId?: string;
  startTeleportDelaySeconds?: number;
  completionTeleportPointId?: string;
  completionTeleportDelaySeconds?: number;
  type: QuestObjectiveType;
  targetId: string;
  itemRequirements?: QuestItemRequirement[];
  targetState?: string;
  requiredAmount: number;
  countMode: "accumulated" | "currentInventory";
  interactionMode: "started" | "succeeded";
  showProgress: boolean;
  showHintIcon: boolean;
  completionEventFlowId?: string;
  completionInterfaceAction?: "none" | "open" | "close";
  completionInterfaceId?: string;
  activationMode?: "immediate" | "event";
  activationEventId?: string;
  blocksStageCompletion?: boolean;
  /** Keep this objective hidden and inactive until this dialogue finishes. */
  unlockDialogueId?: string;
};

export type QuestStageDefinition = {
  id: string;
  name: string;
  startDelaySeconds?: number;
  completionDelaySeconds?: number;
  startPresentationDelaySeconds?: number;
  completionPresentationDelaySeconds?: number;
  startTeleportPointId?: string;
  startTeleportDelaySeconds?: number;
  completionTeleportPointId?: string;
  completionTeleportDelaySeconds?: number;
  completionMode: "all" | "any";
  startEventFlowId?: string;
  completionEventFlowId?: string;
  nextStageId?: string;
  objectives: QuestObjectiveDefinition[];
};

export type QuestDefinition = {
  id: string;
  name: string;
  description: string;
  chapterId: string;
  type: "main" | "side" | "longTermMain";
  prerequisiteQuestIds: string[];
  startDelaySeconds?: number;
  startPresentationDelaySeconds?: number;
  completionPresentationDelaySeconds?: number;
  startTeleportPointId?: string;
  startTeleportDelaySeconds?: number;
  completionTeleportPointId?: string;
  completionTeleportDelaySeconds?: number;
  grantMethod: "automatic" | "interaction" | "afterDialogue";
  grantSourceId?: string;
  grantCondition?: string;
  canAbandon: boolean;
  canReaccept: boolean;
  displayMode: "standard" | "mainProgress";
  completionFlagId?: string;
  completionTriggerType?: "none" | "dialogue" | "eventFlow";
  completionTriggerId?: string;
  completionTriggerDelaySeconds?: number;
  /** @deprecated Use completionTriggerType/eventFlow + completionTriggerId. */
  completionEventFlowId?: string;
  rewardItemId?: string;
  rewardItemAmount?: number;
  failureDeadline?: string;
  failureEventId?: string;
  failureMode?: "permanent" | "restartQuest";
  onFailedEventFlowId?: string;
  stages: QuestStageDefinition[];
};

export type QuestChapterDefinition = {
  id: string;
  name: string;
  startCondition?: string;
  openingEventFlowId?: string;
  completionQuestIds: string[];
  endingEventFlowId?: string;
  nextChapterId?: string;
};

export type QuestDocument = {
  schemaVersion: number;
  chapters: QuestChapterDefinition[];
  quests: QuestDefinition[];
};

export type QuestGameEvent = {
  type:
    | "itemCollected"
    | "inventoryChanged"
    | "interfaceOpened"
    | "itemUsed"
    | "itemSubmitted"
    | "interactionStarted"
    | "interactionSucceeded"
    | "areaEntered"
    | "puzzleCompleted"
    | "dialogueCompleted"
    | "storyTriggerCompleted"
    | "objectStateChanged"
    | "dayChanged"
    | "timeChanged"
    | "flagChanged"
    | "customQuestProgressAdded"
    | "questCompleted";
  targetId: string;
  itemId?: string;
  amount?: number;
  result?: string | number | boolean;
  questId?: string;
  objectiveId?: string;
  eventId?: string;
};

export type QuestObjectiveRuntime = {
  currentAmount: number;
  completed: boolean;
  state?: "locked" | "active" | "completed";
  unlocked?: boolean;
  /** Snapshot of the activation rule used when this progress was last normalized. */
  activationDefinitionKey?: string;
  /** Event target that actually unlocked this objective. */
  activatedByEventId?: string;
  itemAmounts?: Record<string, number>;
  availableAtEpochMs?: number;
  completionAvailableAtEpochMs?: number;
  completionPresented?: boolean;
  /** True only after the Objective completion dialogue/event has really finished. */
  completionEventCompleted?: boolean;
  startActionsPresented?: boolean;
};

export type QuestRuntimeEntry = {
  state: QuestState;
  currentStageId: string;
  objectives: Record<string, QuestObjectiveRuntime>;
  tracked: boolean;
  startedAtDay: number | null;
  startedAtTime: number | null;
  rewardClaimed: boolean;
  completedOrder?: number;
  stageAvailableAtEpochMs?: number;
  stageStartEventExecutedForId?: string;
  stageCompletionAvailableAtEpochMs?: number;
  stageCompletionEventExecutedForId?: string;
  questCompletionPresented?: boolean;
  completionTriggerAvailableAtEpochMs?: number;
  completionTriggerCompleted?: boolean;
  /** Persistent counters used by conditional objective activation rules. */
  eventCounters?: Record<string, number>;
};

export type QuestSaveData = {
  schemaVersion: 1;
  quests: Record<string, QuestRuntimeEntry>;
  processedEventIds?: string[];
  completionSequence?: number;
};

export const QUEST_RUNTIME_STORAGE_KEY = "echoes:quest-runtime:v1";

export function loadQuestSaveData(): QuestSaveData | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUEST_RUNTIME_STORAGE_KEY) ?? "null");
    if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.quests !== "object") {
      return undefined;
    }
    return parsed as QuestSaveData;
  } catch {
    return undefined;
  }
}

export function saveQuestSaveData(saveData: QuestSaveData): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUEST_RUNTIME_STORAGE_KEY, JSON.stringify(saveData));
}

export type QuestRuntimeHost = {
  requestTeleport?: (
    pointId: string,
    delayMilliseconds: number,
    source: {
      questId: string;
      stageId?: string;
      objectiveId?: string;
      phase: "start" | "completion";
    },
  ) => void;
  runEventFlow?: (eventFlowId: string) => boolean | void | Promise<boolean | void>;
  runCompletionTrigger?: (
    type: "dialogue" | "eventFlow",
    triggerId: string,
    sourceQuestId: string,
  ) => boolean | void | Promise<boolean | void>;
  giveItem?: (itemId: string, amount: number) => void;
  setFlag?: (flagId: string, value: boolean) => void;
  onStateChanged?: (questId: string, entry: QuestRuntimeEntry) => void;
  onQuestStarted?: (questId: string, entry: QuestRuntimeEntry) => void;
  onQuestCompleted?: (
    questId: string,
    entry: QuestRuntimeEntry,
    completePresentation: () => void,
  ) => void;
  onQuestFailed?: (questId: string, entry: QuestRuntimeEntry) => void;
  onQuestAbandoned?: (questId: string, entry: QuestRuntimeEntry) => void;
  scheduleQuestStart?: (delayMilliseconds: number, start: () => void) => void;
  now?: () => number;
  onObjectiveCompleted?: (
    questId: string,
    objectiveId: string,
    stageId: string,
    entry: QuestRuntimeEntry,
    objective: QuestObjectiveDefinition,
  ) => void;
  onObjectiveActivated?: (
    questId: string,
    objectiveId: string,
    stageId: string,
    entry: QuestRuntimeEntry,
    objective: QuestObjectiveDefinition,
  ) => void;
  onStageTransitionStarted?: (
    questId: string,
    currentStageId: string,
    nextStageId: string,
    entry: QuestRuntimeEntry,
  ) => void;
};

const emptySave = (): QuestSaveData => ({
  schemaVersion: 1,
  quests: {},
  processedEventIds: [],
});

export class QuestRuntimeManager {
  private readonly definitions = new Map<string, QuestDefinition>();
  private readonly host: QuestRuntimeHost;
  private readonly startingQuestIds = new Set<string>();
  private readonly pendingStageCompletionDelays = new Set<string>();
  private readonly pendingQuestStarts = new Set<string>();
  private readonly pendingCompletionTriggers = new Set<string>();
  private readonly pendingObjectiveCompletionEvents = new Set<string>();
  private currentInventorySnapshot: Readonly<Record<string, number>> | null = null;
  private saveData: QuestSaveData;

  constructor(
    document: QuestDocument,
    host: QuestRuntimeHost = {},
    restoredSave?: QuestSaveData,
  ) {
    this.host = host;
    for (const quest of document.quests) this.definitions.set(quest.id, quest);
    this.saveData = restoredSave
      ? structuredClone(restoredSave)
      : emptySave();
    this.saveData.processedEventIds ??= [];
    for (const quest of document.quests) this.ensureEntry(quest);
    this.saveData.completionSequence = Math.max(
      this.saveData.completionSequence ?? 0,
      ...Object.values(this.saveData.quests).map(entry => entry.completedOrder ?? 0),
    );
    this.refreshAvailability();
    for (const definition of document.quests) {
      const entry = this.saveData.quests[definition.id];
      if (!entry) continue;
      if (entry.state === "active") this.restoreStageActivation(definition, entry);
      this.restoreCompletionScheduling(definition, entry);
    }
  }

  exportSave(): QuestSaveData {
    return structuredClone(this.saveData);
  }

  /**
   * Replace the current inventory snapshot and immediately re-evaluate every
   * active `haveItem` objective in the active Quest stages. Locked event
   * objectives keep the snapshot without progressing until they are unlocked.
   */
  syncCurrentInventory(inventory: Readonly<Record<string, number>>): void {
    this.currentInventorySnapshot = Object.fromEntries(
      Object.entries(inventory).map(([itemId, amount]) => [
        itemId,
        Math.max(0, Math.floor(Number(amount) || 0)),
      ]),
    );
    for (const definition of this.definitions.values()) {
      const entry = this.requireEntry(definition.id);
      if (entry.state !== "active") continue;
      this.refreshCurrentInventoryObjectives(definition, entry);
    }
  }

  /**
   * Atomically replace the runtime snapshot without replaying quest dialogue,
   * rewards, teleports, or delayed presentation callbacks. Debug scenarios use
   * this to materialize the final state that normal play would have produced.
   */
  replaceSaveData(saveData: QuestSaveData, notify = true): void {
    this.pendingStageCompletionDelays.clear();
    this.pendingQuestStarts.clear();
    this.pendingCompletionTriggers.clear();
    this.pendingObjectiveCompletionEvents.clear();
    this.saveData = structuredClone(saveData);
    this.saveData.processedEventIds ??= [];
    for (const definition of this.definitions.values()) this.ensureEntry(definition);
    this.saveData.completionSequence = Math.max(
      this.saveData.completionSequence ?? 0,
      ...Object.values(this.saveData.quests).map(entry => entry.completedOrder ?? 0),
    );
    this.refreshAvailability();
    if (notify) {
      for (const definition of this.definitions.values()) this.notify(definition.id);
    }
  }

  getQuestState(questId: string): QuestState {
    return this.requireEntry(questId).state;
  }

  isQuestActive(questId: string): boolean {
    return this.saveData.quests[questId]?.state === "active";
  }

  isQuestInState(questId: string, state: QuestState): boolean {
    return this.saveData.quests[questId]?.state === state;
  }

  getCurrentStage(questId: string): string {
    return this.requireEntry(questId).currentStageId;
  }

  isQuestAtStage(questId: string, stageId: string): boolean {
    return this.isQuestActive(questId) &&
      this.saveData.quests[questId]?.currentStageId === stageId;
  }

  hasQuestReachedStage(questId: string, stageId: string): boolean {
    const definition = this.definitions.get(questId);
    const entry = this.saveData.quests[questId];
    if (!definition || !entry || entry.state === "locked" || entry.state === "available") {
      return false;
    }
    const targetIndex = definition.stages.findIndex(stage => stage.id === stageId);
    const currentIndex = definition.stages.findIndex(stage => stage.id === entry.currentStageId);
    return targetIndex >= 0 && currentIndex >= targetIndex;
  }

  getObjectiveProgress(questId: string, objectiveId: string): QuestObjectiveRuntime {
    const progress = this.requireEntry(questId).objectives[objectiveId];
    if (!progress) throw new Error(`Unknown objective: ${questId}/${objectiveId}`);
    return structuredClone(progress);
  }

  getEventCounter(questId: string, counterId: string): number {
    const normalizedId = counterId.trim();
    if (!normalizedId) return 0;
    return Math.max(0, this.requireEntry(questId).eventCounters?.[normalizedId] ?? 0);
  }

  incrementEventCounter(questId: string, counterId: string, amount = 1): number {
    const normalizedId = counterId.trim();
    const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
    const entry = this.requireEntry(questId);
    if (!normalizedId || normalizedAmount <= 0 || entry.state !== "active") {
      return this.getEventCounter(questId, normalizedId);
    }
    entry.eventCounters ??= {};
    const next = this.getEventCounter(questId, normalizedId) + normalizedAmount;
    entry.eventCounters[normalizedId] = next;
    this.notify(questId);
    return next;
  }

  getActiveItemSubmissionObjectives(interactionId: string): Array<{
    questId: string;
    stageId: string;
    objective: QuestObjectiveDefinition;
    progress: QuestObjectiveRuntime;
  }> {
    return this.getCurrentItemSubmissionObjectives(interactionId).filter(
      entry => !entry.progress.completed,
    );
  }

  getCurrentItemSubmissionObjectives(interactionId: string): Array<{
    questId: string;
    stageId: string;
    objective: QuestObjectiveDefinition;
    progress: QuestObjectiveRuntime;
  }> {
    const normalizedInteractionId = interactionId.trim();
    if (!normalizedInteractionId) return [];
    const matches: Array<{
      questId: string;
      stageId: string;
      objective: QuestObjectiveDefinition;
      progress: QuestObjectiveRuntime;
    }> = [];
    for (const definition of this.definitions.values()) {
      const entry = this.saveData.quests[definition.id];
      if (!entry || entry.state !== "active" || !this.isStageActive(entry)) continue;
      const stage = definition.stages.find(candidate => candidate.id === entry.currentStageId);
      if (!stage) continue;
      for (const objective of stage.objectives) {
        const progress = entry.objectives[objective.id];
        if (
          objective.type !== "submitItemAtInteraction" ||
          objective.targetId !== normalizedInteractionId ||
          !progress ||
          (!progress.completed && !this.isObjectiveActive(entry, progress))
        ) continue;
        matches.push({
          questId: definition.id,
          stageId: stage.id,
          objective: structuredClone(objective),
          progress: structuredClone(progress),
        });
      }
    }
    return matches;
  }

  activateObjective(objectiveId: string, activatedByEventId?: string): boolean {
    const normalizedId = objectiveId.trim();
    if (!normalizedId) return false;
    for (const definition of this.definitions.values()) {
      const entry = this.requireEntry(definition.id);
      if (entry.state !== "active") continue;
      const objectiveStage = definition.stages.find(stage =>
        stage.objectives.some(candidate => candidate.id === normalizedId)
      );
      const objective = objectiveStage?.objectives.find(candidate => candidate.id === normalizedId);
      if (!objective) continue;
      const progress = entry.objectives[objective.id];
      if (!progress || progress.completed || this.isObjectiveUnlocked(progress)) return false;
      progress.unlocked = true;
      progress.state = "active";
      progress.activationDefinitionKey = this.objectiveActivationDefinitionKey(objective);
      progress.activatedByEventId = activatedByEventId?.trim() || undefined;
      this.host.onObjectiveActivated?.(
        definition.id,
        objective.id,
        objectiveStage.id,
        structuredClone(entry),
        structuredClone(objective),
      );
      this.refreshCurrentInventoryObjective(definition, entry, objective);
      this.notify(definition.id);
      this.advanceIfComplete(definition, entry);
      return true;
    }
    return false;
  }

  startQuest(questId: string, day: number | null = null, time: number | null = null): boolean {
    const definition = this.requireDefinition(questId);
    const entry = this.requireEntry(questId);
    if (!["available", "abandoned"].includes(entry.state)) return false;
    if (entry.state === "abandoned" && !definition.canReaccept) return false;
    this.pendingQuestStarts.delete(questId);
    entry.state = "active";
    entry.startedAtDay = day;
    entry.startedAtTime = time;
    entry.currentStageId = definition.stages[0]?.id ?? "";
    entry.tracked = true;
    this.requestTeleport(definition.startTeleportPointId, definition.startTeleportDelaySeconds, {
      questId: definition.id,
      phase: "start",
    });
    this.startingQuestIds.add(questId);
    try {
      this.configureStageActivation(definition, entry);
      this.host.onQuestStarted?.(questId, structuredClone(entry));
    } finally {
      this.startingQuestIds.delete(questId);
    }
    this.refreshCurrentInventoryObjectives(definition, entry);
    this.notify(questId);
    return true;
  }

  getCompletedQuestIds(limit = 3): string[] {
    const safeLimit = Math.max(0, Math.floor(limit));
    const definitionOrder = new Map(
      [...this.definitions.keys()].map((questId, index) => [questId, index]),
    );
    return [...this.definitions.keys()]
      .filter(questId => this.saveData.quests[questId]?.state === "completed")
      .sort((left, right) => {
        const leftEntry = this.saveData.quests[left];
        const rightEntry = this.saveData.quests[right];
        const leftOrder = leftEntry.completedOrder == null
          ? definitionOrder.get(left) ?? 0
          : 1_000_000 + leftEntry.completedOrder;
        const rightOrder = rightEntry.completedOrder == null
          ? definitionOrder.get(right) ?? 0
          : 1_000_000 + rightEntry.completedOrder;
        return rightOrder - leftOrder;
      })
      .slice(0, safeLimit);
  }

  requestQuestStart(
    questId: string,
    day: number | null = null,
    time: number | null = null,
  ): boolean {
    const definition = this.requireDefinition(questId);
    const entry = this.requireEntry(questId);
    if (!["available", "abandoned"].includes(entry.state)) return false;
    if (entry.state === "abandoned" && !definition.canReaccept) return false;
    if (this.pendingQuestStarts.has(questId)) return false;

    const delaySeconds = Number.isFinite(definition.startDelaySeconds)
      ? Math.max(0, definition.startDelaySeconds ?? 0)
      : 0;
    if (delaySeconds <= 0) return this.startQuest(questId, day, time);

    this.pendingQuestStarts.add(questId);
    const start = () => {
      this.pendingQuestStarts.delete(questId);
      this.startQuest(questId, day, time);
    };
    if (this.host.scheduleQuestStart) {
      this.host.scheduleQuestStart(delaySeconds * 1000, start);
    } else {
      globalThis.setTimeout(start, delaySeconds * 1000);
    }
    return true;
  }

  startAvailableAutomaticQuests(
    day: number | null = null,
    time: number | null = null,
    chapterId?: string,
  ): string[] {
    const started: string[] = [];
    const normalizedChapterId = chapterId?.trim().toLocaleLowerCase() ?? "";
    for (const definition of this.definitions.values()) {
      if (definition.grantMethod !== "automatic") continue;
      if (
        normalizedChapterId &&
        definition.chapterId.trim().toLocaleLowerCase() !== normalizedChapterId
      ) continue;
      const entry = this.requireEntry(definition.id);
      if (entry.state !== "available") continue;
      if (this.requestQuestStart(definition.id, day, time)) started.push(definition.id);
    }
    return started;
  }

  startAvailableAfterDialogueQuests(
    dialogueId: string,
    day: number | null = null,
    time: number | null = null,
  ): string[] {
    const started: string[] = [];
    for (const definition of this.definitions.values()) {
      if (definition.grantMethod !== "afterDialogue") continue;
      if ((definition.grantSourceId ?? "").toLocaleLowerCase() !== dialogueId.toLocaleLowerCase()) continue;
      const entry = this.requireEntry(definition.id);
      if (entry.state !== "available") continue;
      if (this.requestQuestStart(definition.id, day, time)) started.push(definition.id);
    }
    return started;
  }

  completeQuest(questId: string): boolean {
    const definition = this.requireDefinition(questId);
    const entry = this.requireEntry(questId);
    if (entry.state === "completed") return false;
    this.recordQuestCompletion(definition, entry);
    this.presentQuestCompletion(definition, entry);
    return true;
  }

  private recordQuestCompletion(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
  ) {
    entry.state = "completed";
    this.saveData.completionSequence = (this.saveData.completionSequence ?? 0) + 1;
    entry.completedOrder = this.saveData.completionSequence;
    entry.questCompletionPresented = false;
    if (!entry.rewardClaimed) {
      if (definition.rewardItemId && (definition.rewardItemAmount ?? 0) > 0)
        this.host.giveItem?.(definition.rewardItemId, definition.rewardItemAmount ?? 0);
      if (definition.completionFlagId) this.host.setFlag?.(definition.completionFlagId, true);
      entry.rewardClaimed = true;
    }
    this.refreshAvailability();
    const trigger = this.getCompletionTrigger(definition);
    if (trigger) {
      entry.completionTriggerCompleted = false;
      entry.completionTriggerAvailableAtEpochMs = undefined;
    } else {
      entry.completionTriggerCompleted = true;
      entry.completionTriggerAvailableAtEpochMs = undefined;
    }
    this.notify(definition.id);
  }

  private presentQuestCompletion(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
  ) {
    if (entry.questCompletionPresented) return;
    entry.questCompletionPresented = true;
    this.requestTeleport(definition.completionTeleportPointId,
      definition.completionTeleportDelaySeconds, {
        questId: definition.id,
        phase: "completion",
      });
    let presentationCompleted = false;
    const completePresentation = () => {
      if (presentationCompleted) return;
      presentationCompleted = true;
      const current = this.saveData.quests[definition.id];
      if (!current || current.state !== "completed") return;
      this.armQuestCompletionTrigger(definition, current);
    };
    if (this.host.onQuestCompleted) {
      this.host.onQuestCompleted(
        definition.id,
        structuredClone(entry),
        completePresentation,
      );
    } else {
      completePresentation();
    }
    this.notify(definition.id);
  }

  failQuest(questId: string): boolean {
    const definition = this.requireDefinition(questId);
    const entry = this.requireEntry(questId);
    if (entry.state !== "active") return false;
    if (definition.failureMode === "restartQuest") {
      this.host.onQuestFailed?.(questId, structuredClone(entry));
      return this.restartQuest(questId);
    }
    entry.state = "failed";
    if (definition.onFailedEventFlowId) this.host.runEventFlow?.(definition.onFailedEventFlowId);
    this.host.onQuestFailed?.(questId, structuredClone(entry));
    this.notify(questId);
    return true;
  }

  abandonQuest(questId: string): boolean {
    const definition = this.requireDefinition(questId);
    const entry = this.requireEntry(questId);
    if (entry.state !== "active" || !definition.canAbandon) return false;
    entry.state = "abandoned";
    entry.tracked = false;
    this.host.onQuestAbandoned?.(questId, structuredClone(entry));
    this.notify(questId);
    return true;
  }

  restartQuest(questId: string): boolean {
    const definition = this.requireDefinition(questId);
    this.saveData.quests[questId] = this.createEntry(definition);
    this.saveData.quests[questId].state = "available";
    this.notify(questId);
    return true;
  }

  completeObjective(questId: string, objectiveId: string): boolean {
    const definition = this.requireDefinition(questId);
    const entry = this.requireEntry(questId);
    if (entry.state !== "active") return false;
    const objective = this.findObjective(definition, objectiveId);
    const progress = entry.objectives[objectiveId];
    if (!this.isObjectiveActive(entry, progress)) return false;
    if (progress.completed) return false;
    progress.currentAmount = Math.max(progress.currentAmount, objective.requiredAmount);
    if (objective.type === "compoundCollectItem") {
      progress.itemAmounts = Object.fromEntries(
        normalizeItemRequirements(objective).map((requirement) => [
          requirement.itemId,
          requirement.requiredAmount,
        ]),
      );
    }
    progress.completed = true;
    this.recordObjectiveCompletion(definition, entry, objective);
    return true;
  }

  addObjectiveProgress(questId: string, objectiveId: string, amount: number): boolean {
    const current = this.getObjectiveProgress(questId, objectiveId).currentAmount;
    return this.setObjectiveProgress(questId, objectiveId, current + amount);
  }

  setObjectiveProgress(questId: string, objectiveId: string, amount: number): boolean {
    const definition = this.requireDefinition(questId);
    const entry = this.requireEntry(questId);
    if (entry.state !== "active") return false;
    const objective = this.findObjective(definition, objectiveId);
    const progress = entry.objectives[objectiveId];
    if (!this.isObjectiveActive(entry, progress)) return false;
    progress.currentAmount = Math.max(0, amount);
    let completedNow = false;
    if (!progress.completed && progress.currentAmount >= objective.requiredAmount) {
      progress.completed = true;
      completedNow = true;
    }
    if (completedNow) {
      this.recordObjectiveCompletion(definition, entry, objective);
    } else {
      this.notify(questId);
    }
    return true;
  }

  handleEvent(event: QuestGameEvent): void {
    if (event.eventId && this.saveData.processedEventIds?.includes(event.eventId)) return;
    let matchedObjective = false;
    for (const definition of this.definitions.values()) {
      const entry = this.requireEntry(definition.id);
      if (entry.state !== "active") continue;
      const stage = definition.stages.find(candidate => candidate.id === entry.currentStageId);
      if (!stage || !this.isStageActive(entry)) continue;
      for (const objective of stage.objectives) {
        const progress = entry.objectives[objective.id];
        if (!progress) continue;
        const activationEventId = this.objectiveActivationEventId(objective);
        const legacyDialogueMatch = event.type === "dialogueCompleted" &&
          objective.unlockDialogueId === event.targetId;
        if (!this.isObjectiveUnlocked(progress) &&
            ((activationEventId.length > 0 && activationEventId === event.targetId) ||
             legacyDialogueMatch)) {
          progress.unlocked = true;
          progress.state = "active";
          progress.activationDefinitionKey = this.objectiveActivationDefinitionKey(objective);
          progress.activatedByEventId = event.targetId;
          matchedObjective = true;
          this.host.onObjectiveActivated?.(
            definition.id,
            objective.id,
            stage.id,
            structuredClone(entry),
            structuredClone(objective),
          );
          this.refreshCurrentInventoryObjective(definition, entry, objective);
          this.notify(definition.id);
        }
        if (entry.state !== "active" || entry.currentStageId !== stage.id) continue;
        if (!this.isObjectiveActive(entry, progress)) continue;
        if (objective.type === "compoundCollectItem") {
          if (event.type !== "itemCollected") continue;
          const requirement = normalizeItemRequirements(objective).find(
            (candidate) => candidate.itemId === event.targetId,
          );
          if (!requirement) continue;
          matchedObjective = true;
          this.addCompoundItemProgress(
            definition,
            entry,
            objective,
            event.targetId,
            event.amount ?? 1,
          );
          continue;
        }
        const update = evaluateQuestObjective(objective, event);
        if (update === null) continue;
        matchedObjective = true;
        if (update.mode === "add") this.addObjectiveProgress(definition.id, objective.id, update.amount);
        else if (update.mode === "set") this.setObjectiveProgress(definition.id, objective.id, update.amount);
        else this.completeObjective(definition.id, objective.id);
      }
    }
    if (event.eventId && matchedObjective) {
      this.saveData.processedEventIds = [
        ...(this.saveData.processedEventIds ?? []),
        event.eventId,
      ].slice(-500);
    }
  }

  private addCompoundItemProgress(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
    objective: QuestObjectiveDefinition,
    itemId: string,
    amount: number,
  ) {
    const progress = entry.objectives[objective.id];
    if (!progress || progress.completed) return;
    const requirements = normalizeItemRequirements(objective);
    const requirement = requirements.find((candidate) => candidate.itemId === itemId);
    if (!requirement) return;
    progress.itemAmounts ??= {};
    progress.itemAmounts[itemId] = Math.min(
      requirement.requiredAmount,
      Math.max(0, (progress.itemAmounts[itemId] ?? 0) + Math.max(0, amount)),
    );
    progress.currentAmount = requirements.reduce(
      (total, candidate) => total + Math.min(
        candidate.requiredAmount,
        progress.itemAmounts?.[candidate.itemId] ?? 0,
      ),
      0,
    );
    if (requirements.length > 0 && requirements.every(
      (candidate) => (progress.itemAmounts?.[candidate.itemId] ?? 0) >= candidate.requiredAmount,
    )) {
      progress.completed = true;
      this.recordObjectiveCompletion(definition, entry, objective);
      return;
    }
    this.advanceIfComplete(definition, entry);
    this.notify(definition.id);
  }

  private recordObjectiveCompletion(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
    objective: QuestObjectiveDefinition,
  ) {
    const progress = entry.objectives[objective.id];
    if (!progress) return;
    progress.completed = true;
    progress.unlocked = true;
    progress.state = "completed";
    progress.completionPresented = false;
    progress.completionEventCompleted = !(objective.completionEventFlowId ?? "").trim();
    progress.completionAvailableAtEpochMs = this.now() +
      this.delayMilliseconds(objective.completionDelaySeconds);

    // 先保存「條件已完成」，延遲只影響核取演出與後續流程。
    this.notify(definition.id);
    this.advanceIfComplete(definition, entry);
    this.scheduleObjectiveCompletion(definition, entry, objective);
  }

  private scheduleObjectiveCompletion(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
    objective: QuestObjectiveDefinition,
  ) {
    const due = entry.objectives[objective.id]?.completionAvailableAtEpochMs ?? 0;
    const stageId = entry.currentStageId;
    this.scheduleAt(due, () => {
      const current = this.saveData.quests[definition.id];
      const progress = current?.objectives[objective.id];
      if (!current || !progress || !progress.completed || progress.completionPresented) return;
      if (current.state !== "active" && current.state !== "completed") return;
      // This is an Objective completion presentation, not a Stage completion
      // presentation. It must still run if another Objective already advanced
      // the Stage while this Objective's own delay was counting down.
      progress.completionPresented = true;
      this.requestTeleport(objective.completionTeleportPointId,
        objective.completionTeleportDelaySeconds, {
          questId: definition.id,
          stageId,
          objectiveId: objective.id,
          phase: "completion",
        });
      if ((objective.completionEventFlowId ?? "").trim()) {
        this.scheduleObjectiveCompletionEvent(definition, objective);
      }
      this.notifyObjectiveCompleted(definition, current, objective.id);
      this.advanceIfComplete(definition, current);
      this.notify(definition.id);
    });
  }

  private advanceIfComplete(definition: QuestDefinition, entry: QuestRuntimeEntry) {
    const stage = definition.stages.find(candidate => candidate.id === entry.currentStageId);
    if (!stage || stage.objectives.length === 0) return;
    const completionObjectives = stage.objectives.filter((objective) => {
      const progress = entry.objectives[objective.id];
      return this.isObjectiveUnlocked(progress) || objective.blocksStageCompletion !== false;
    });
    if (completionObjectives.length === 0) return;
    const states = completionObjectives.map(
      objective => entry.objectives[objective.id]?.completed === true,
    );
    const completed = stage.completionMode === "any" ? states.some(Boolean) : states.every(Boolean);
    if (!completed) return;
    const next = definition.stages.find(candidate => candidate.id === stage.nextStageId)
      ?? definition.stages[definition.stages.indexOf(stage) + 1];

    entry.stageCompletionAvailableAtEpochMs ??= this.now() +
      this.delayMilliseconds(stage.completionDelaySeconds);

    // 最終階段達標時，Quest 與完成旗標立即寫入；完成 UI 仍依延遲播放。
    if (!next && entry.state !== "completed") {
      this.recordQuestCompletion(definition, entry);
    }

    const presentationStates = completionObjectives.map((objective) => {
      const progress = entry.objectives[objective.id];
      return progress?.completed === true &&
        progress.completionPresented !== false &&
        progress.completionEventCompleted !== false;
    });
    const completionPresented = stage.completionMode === "any"
      ? presentationStates.some(Boolean)
      : presentationStates.every(Boolean);
    if (!completionPresented) return;

    const remainingDelay = (entry.stageCompletionAvailableAtEpochMs ?? 0) - this.now();
    if (remainingDelay > 1) {
      if (!this.pendingStageCompletionDelays.has(definition.id)) {
        this.pendingStageCompletionDelays.add(definition.id);
        this.scheduleAt(entry.stageCompletionAvailableAtEpochMs ?? 0, () => {
          this.pendingStageCompletionDelays.delete(definition.id);
          const current = this.saveData.quests[definition.id];
          if (!current || current.currentStageId !== stage.id) return;
          if (current.state !== "active" && current.state !== "completed") return;
          this.advanceIfComplete(definition, current);
        });
      }
      return;
    }

    if (entry.stageCompletionEventExecutedForId !== stage.id) {
      entry.stageCompletionEventExecutedForId = stage.id;
      this.requestTeleport(stage.completionTeleportPointId,
        stage.completionTeleportDelaySeconds, {
          questId: definition.id,
          stageId: stage.id,
          phase: "completion",
        });
      if (stage.completionEventFlowId) this.host.runEventFlow?.(stage.completionEventFlowId);
    }
    if (!next) {
      this.presentQuestCompletion(definition, entry);
      return;
    }
    // Visual presentation must never hold the real quest state at the old Stage.
    // Once all completion conditions and configured real delays are satisfied,
    // advance immediately so stage-gated interactions cannot be triggered again.
    try {
      this.host.onStageTransitionStarted?.(
        definition.id,
        stage.id,
        next.id,
        structuredClone(entry),
      );
    } catch {
      // UI callbacks are optional presentation; a failure must not block progression.
    }
    entry.currentStageId = next.id;
    this.configureStageActivation(definition, entry);
    this.notify(definition.id);
  }

  private notifyObjectiveCompleted(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
    objectiveId: string,
  ) {
    const objective = this.findObjective(definition, objectiveId);
    this.host.onObjectiveCompleted?.(
      definition.id,
      objectiveId,
      entry.currentStageId,
      structuredClone(entry),
      structuredClone(objective),
    );
  }

  private refreshAvailability() {
    for (const definition of this.definitions.values()) {
      const entry = this.requireEntry(definition.id);
      if (entry.state !== "locked") continue;
      if (definition.prerequisiteQuestIds.every(id => this.saveData.quests[id]?.state === "completed"))
        entry.state = "available";
    }
  }

  private ensureEntry(definition: QuestDefinition) {
    this.saveData.quests[definition.id] ??= this.createEntry(definition);
    const entry = this.saveData.quests[definition.id];
    for (const stage of definition.stages) {
      for (const objective of stage.objectives) {
        entry.objectives[objective.id] ??= this.createObjectiveEntry(objective);
        const progress = entry.objectives[objective.id];
        const activationDefinitionKey = this.objectiveActivationDefinitionKey(objective);
        const previousActivationDefinitionKey = progress.activationDefinitionKey;
        const eventActivated = this.isEventActivatedObjective(objective);
        const activationEventId = this.objectiveActivationEventId(objective);
        const hasObjectiveProgress = progress.completed || progress.currentAmount > 0;
        const hasConfirmedActivation =
          progress.activatedByEventId === activationEventId ||
          this.hasProcessedActivationEvent(activationEventId);

        if (!eventActivated) {
          // Changing an objective back to immediate activation must not leave an old event lock behind.
          progress.unlocked = true;
          progress.activatedByEventId = undefined;
        } else if (!hasObjectiveProgress && (
          (previousActivationDefinitionKey != null &&
            previousActivationDefinitionKey !== activationDefinitionKey) ||
          (previousActivationDefinitionKey == null &&
            progress.unlocked === true &&
            !hasConfirmedActivation)
        )) {
          // An objective edited from immediate to event activation may still be marked active in
          // an existing browser save. Re-lock only untouched objectives unless the activating event
          // is known to have run, so genuine unlocked/completed progress remains intact.
          progress.unlocked = false;
          progress.activatedByEventId = undefined;
        } else if (progress.unlocked === undefined) {
          progress.unlocked = hasObjectiveProgress || hasConfirmedActivation;
        }
        progress.activationDefinitionKey = activationDefinitionKey;
        progress.state = progress.completed
          ? "completed"
          : progress.unlocked === false
            ? "locked"
            : "active";
        if (objective.type === "compoundCollectItem") {
          progress.itemAmounts ??= {};
        }
      }
    }
  }

  private now(): number {
    return this.host.now?.() ?? Date.now();
  }

  private delayMilliseconds(seconds?: number): number {
    return Number.isFinite(seconds) ? Math.max(0, Number(seconds) * 1000) : 0;
  }

  private requestTeleport(
    pointId: string | undefined,
    delaySeconds: number | undefined,
    source: {
      questId: string;
      stageId?: string;
      objectiveId?: string;
      phase: "start" | "completion";
    },
  ) {
    const normalizedPointId = (pointId ?? "").trim();
    if (!normalizedPointId) return;
    this.host.requestTeleport?.(
      normalizedPointId,
      this.delayMilliseconds(delaySeconds),
      source,
    );
  }

  private getCompletionTrigger(definition: QuestDefinition): {
    type: "dialogue" | "eventFlow";
    id: string;
  } | null {
    const type = definition.completionTriggerType ?? "none";
    const id = (definition.completionTriggerId ?? "").trim();
    if ((type === "dialogue" || type === "eventFlow") && id) return { type, id };

    // Read old quest files without replaying two separate completion mechanisms.
    const legacyEventFlowId = (definition.completionEventFlowId ?? "").trim();
    return legacyEventFlowId ? { type: "eventFlow", id: legacyEventFlowId } : null;
  }

  private scheduleObjectiveCompletionEvent(
    definition: QuestDefinition,
    objective: QuestObjectiveDefinition,
  ) {
    const eventFlowId = (objective.completionEventFlowId ?? "").trim();
    const progress = this.saveData.quests[definition.id]?.objectives[objective.id];
    if (!eventFlowId || !progress || progress.completionEventCompleted !== false) return;
    const key = `${definition.id}:${objective.id}`;
    if (this.pendingObjectiveCompletionEvents.has(key)) return;
    const runner = this.host.runEventFlow;
    if (!runner) return;

    this.pendingObjectiveCompletionEvents.add(key);
    void Promise.resolve(runner(eventFlowId))
      .then((completed) => {
        this.pendingObjectiveCompletionEvents.delete(key);
        if (completed === false) return;
        const latest = this.saveData.quests[definition.id]?.objectives[objective.id];
        if (!latest?.completed) return;
        latest.completionEventCompleted = true;
        const latestEntry = this.saveData.quests[definition.id];
        if (latestEntry) this.advanceIfComplete(definition, latestEntry);
        this.notify(definition.id);
      })
      .catch(() => {
        // Keep the incomplete flag. Restoring this save will safely retry the event.
        this.pendingObjectiveCompletionEvents.delete(key);
      });
  }

  private hasAvailableAfterDialogueQuest(dialogueId: string): boolean {
    const normalizedId = dialogueId.trim().toLocaleLowerCase();
    if (!normalizedId) return false;
    for (const definition of this.definitions.values()) {
      if (definition.grantMethod !== "afterDialogue") continue;
      if ((definition.grantSourceId ?? "").trim().toLocaleLowerCase() !== normalizedId) continue;
      if (this.saveData.quests[definition.id]?.state === "available") return true;
    }
    return false;
  }

  private scheduleQuestCompletionTrigger(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
  ) {
    const trigger = this.getCompletionTrigger(definition);
    if (!trigger || entry.state !== "completed" || entry.completionTriggerCompleted !== false) return;
    if (this.pendingCompletionTriggers.has(definition.id)) return;

    this.pendingCompletionTriggers.add(definition.id);
    const due = entry.completionTriggerAvailableAtEpochMs ?? this.now();
    this.scheduleAt(due, () => {
      const current = this.saveData.quests[definition.id];
      if (!current || current.state !== "completed" || current.completionTriggerCompleted !== false) {
        this.pendingCompletionTriggers.delete(definition.id);
        return;
      }

      const runner = this.host.runCompletionTrigger ?? (
        trigger.type === "eventFlow" && this.host.runEventFlow
          ? (_type: "dialogue" | "eventFlow", triggerId: string) => this.host.runEventFlow?.(triggerId)
          : undefined
      );
      if (!runner) {
        this.pendingCompletionTriggers.delete(definition.id);
        return;
      }

      void Promise.resolve(runner(trigger.type, trigger.id, definition.id))
        .then((completed) => {
          this.pendingCompletionTriggers.delete(definition.id);
          if (completed === false) return;
          const latest = this.saveData.quests[definition.id];
          if (!latest || latest.state !== "completed") return;
          latest.completionTriggerCompleted = true;
          this.notify(definition.id);
        })
        .catch(() => {
          // Keep the incomplete flag in the save. A later reload can safely retry it.
          this.pendingCompletionTriggers.delete(definition.id);
        });
    });
  }

  private armQuestCompletionTrigger(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
  ) {
    if (entry.completionTriggerCompleted !== false) return;
    entry.completionTriggerAvailableAtEpochMs ??= this.now() +
      this.delayMilliseconds(definition.completionTriggerDelaySeconds);
    this.notify(definition.id);
    this.scheduleQuestCompletionTrigger(definition, entry);
  }

  private isStageActive(entry: QuestRuntimeEntry): boolean {
    return (entry.stageAvailableAtEpochMs ?? 0) <= this.now();
  }

  private isObjectiveActive(
    entry: QuestRuntimeEntry,
    progress: QuestObjectiveRuntime,
  ): boolean {
    return this.isObjectiveUnlocked(progress) &&
      this.isStageActive(entry) &&
      (progress.availableAtEpochMs ?? 0) <= this.now();
  }

  private isObjectiveUnlocked(progress?: QuestObjectiveRuntime): boolean {
    return progress?.state === "completed" ||
      progress?.state === "active" ||
      (progress?.state == null && progress?.unlocked !== false);
  }

  private isEventActivatedObjective(objective: QuestObjectiveDefinition): boolean {
    return objective.activationMode === "event" ||
      this.objectiveActivationEventId(objective).length > 0;
  }

  private objectiveActivationEventId(objective: QuestObjectiveDefinition): string {
    return (objective.activationEventId ?? objective.unlockDialogueId ?? "").trim();
  }

  private objectiveActivationDefinitionKey(objective: QuestObjectiveDefinition): string {
    return this.isEventActivatedObjective(objective)
      ? `event:${this.objectiveActivationEventId(objective)}`
      : "immediate";
  }

  private hasProcessedActivationEvent(activationEventId: string): boolean {
    if (!activationEventId) return false;
    return (this.saveData.processedEventIds ?? []).some((eventId) =>
      eventId === activationEventId ||
      eventId.includes(`:${activationEventId}:`) ||
      eventId.endsWith(`:${activationEventId}`)
    );
  }

  private scheduleAfter(delayMilliseconds: number, callback: () => void) {
    if (delayMilliseconds <= 0) {
      callback();
      return;
    }
    if (this.host.scheduleQuestStart) {
      this.host.scheduleQuestStart(delayMilliseconds, callback);
    } else {
      globalThis.setTimeout(callback, delayMilliseconds);
    }
  }

  private scheduleAt(epochMilliseconds: number, callback: () => void) {
    const runWhenDue = () => {
      const remaining = epochMilliseconds - this.now();
      if (remaining > 1) {
        this.scheduleAfter(remaining, runWhenDue);
        return;
      }
      callback();
    };
    runWhenDue();
  }

  private configureStageActivation(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
  ) {
    const stage = definition.stages.find(candidate => candidate.id === entry.currentStageId);
    if (!stage) return;
    const now = this.now();
    entry.stageAvailableAtEpochMs = now + this.delayMilliseconds(stage.startDelaySeconds);
    entry.stageStartEventExecutedForId = undefined;
    entry.stageCompletionAvailableAtEpochMs = undefined;
    entry.stageCompletionEventExecutedForId = undefined;
    for (const objective of stage.objectives) {
      const progress = entry.objectives[objective.id];
      if (!progress) continue;
      progress.availableAtEpochMs = entry.stageAvailableAtEpochMs +
        this.delayMilliseconds(objective.startDelaySeconds);
      progress.startActionsPresented = false;
    }
    this.scheduleStageActivation(definition, entry, stage);
  }

  private restoreStageActivation(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
  ) {
    const stage = definition.stages.find(candidate => candidate.id === entry.currentStageId);
    if (!stage) return;

    // 舊版存檔沒有啟動時間；視為已啟動，避免更新後把既有進度重新延遲。
    if (entry.stageAvailableAtEpochMs == null) {
      entry.stageAvailableAtEpochMs = 0;
      entry.stageStartEventExecutedForId = stage.id;
      for (const objective of stage.objectives) {
        const progress = entry.objectives[objective.id];
        if (progress) {
          if (progress.availableAtEpochMs == null) progress.availableAtEpochMs = 0;
          progress.startActionsPresented = true;
        }
      }
      return;
    }

    for (const objective of stage.objectives) {
      const progress = entry.objectives[objective.id];
      if (progress && progress.availableAtEpochMs == null) {
        progress.availableAtEpochMs = entry.stageAvailableAtEpochMs;
      }
      if (progress && progress.startActionsPresented == null) {
        progress.startActionsPresented = (progress.availableAtEpochMs ?? 0) <= this.now();
      }
    }
    this.scheduleStageActivation(definition, entry, stage);
  }

  private restoreCompletionScheduling(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
  ) {
    for (const stage of definition.stages) {
      for (const objective of stage.objectives) {
        const progress = entry.objectives[objective.id];
        if (!progress?.completed) continue;
        const completionEventId = (objective.completionEventFlowId ?? "").trim();
        if (!completionEventId) {
          progress.completionEventCompleted = true;
        } else if (progress.completionEventCompleted == null) {
          // Old saves did not distinguish "dialogue opened" from "dialogue really
          // finished". Replay only when a matching after-dialogue quest is still
          // waiting, which repairs the broken handoff without replaying every old event.
          progress.completionEventCompleted =
            !this.hasAvailableAfterDialogueQuest(completionEventId);
        }
        if (progress.completionAvailableAtEpochMs == null) {
          // 舊版存檔的完成項目已經播過，不重新播放完成演出。
          progress.completionPresented = true;
          if (progress.completionEventCompleted === false) {
            this.scheduleObjectiveCompletionEvent(definition, objective);
          }
          continue;
        }
        if (progress.completionPresented !== true) {
          this.scheduleObjectiveCompletion(definition, entry, objective);
        } else if (progress.completionEventCompleted === false) {
          this.scheduleObjectiveCompletionEvent(definition, objective);
        }
      }
    }

    if (entry.state === "completed") {
      if (entry.completionTriggerCompleted == null) {
        // Existing saves predate completion triggers; never replay old completed quests after updating.
        entry.completionTriggerCompleted = true;
      } else if (entry.completionTriggerCompleted === false) {
        if (entry.completionTriggerAvailableAtEpochMs != null) {
          this.scheduleQuestCompletionTrigger(definition, entry);
        } else if (entry.questCompletionPresented === true) {
          // The COMPLETE presentation was interrupted by a reload. Resume from its end boundary.
          this.armQuestCompletionTrigger(definition, entry);
        }
      }
      if (entry.questCompletionPresented == null) {
        entry.questCompletionPresented = true;
        if (entry.completionTriggerCompleted === false) {
          this.armQuestCompletionTrigger(definition, entry);
        }
        return;
      }
    }

    const stage = definition.stages.find(candidate => candidate.id === entry.currentStageId);
    if (!stage) return;
    const completionObjectives = stage.objectives.filter((objective) => {
      const progress = entry.objectives[objective.id];
      return this.isObjectiveUnlocked(progress) || objective.blocksStageCompletion !== false;
    });
    const rawStates = completionObjectives.map(
      objective => entry.objectives[objective.id]?.completed === true,
    );
    const rawCompleted = stage.completionMode === "any"
      ? rawStates.some(Boolean)
      : rawStates.length > 0 && rawStates.every(Boolean);
    if (!rawCompleted) return;

    if (entry.stageCompletionAvailableAtEpochMs == null) {
      // 舊版在切換演出期間關閉時，完成事件已執行過；只補完階段切換。
      entry.stageCompletionAvailableAtEpochMs = 0;
      entry.stageCompletionEventExecutedForId = stage.id;
    }
    if (entry.state === "active" || entry.questCompletionPresented === false) {
      this.advanceIfComplete(definition, entry);
    }
  }

  private scheduleStageActivation(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
    stage: QuestStageDefinition,
  ) {
    const questId = definition.id;
    const stageId = stage.id;
    const stageDue = entry.stageAvailableAtEpochMs ?? 0;
    this.scheduleAt(stageDue, () => {
      const current = this.saveData.quests[questId];
      if (!current || current.state !== "active" || current.currentStageId !== stageId) return;
      if (current.stageStartEventExecutedForId !== stageId) {
        current.stageStartEventExecutedForId = stageId;
        this.requestTeleport(stage.startTeleportPointId, stage.startTeleportDelaySeconds, {
          questId,
          stageId,
          phase: "start",
        });
        if (stage.startEventFlowId) this.host.runEventFlow?.(stage.startEventFlowId);
      }
      if (!this.startingQuestIds.has(questId)) {
        this.refreshCurrentInventoryObjectives(definition, current);
      }
      this.notify(questId);
    });

    for (const objective of stage.objectives) {
      const due = entry.objectives[objective.id]?.availableAtEpochMs ?? stageDue;
      this.scheduleAt(due, () => {
        const current = this.saveData.quests[questId];
        if (!current || current.state !== "active" || current.currentStageId !== stageId) return;
        const progress = current.objectives[objective.id];
        if (!progress || progress.startActionsPresented) return;
        progress.startActionsPresented = true;
        this.requestTeleport(objective.startTeleportPointId,
          objective.startTeleportDelaySeconds, {
            questId,
            stageId,
            objectiveId: objective.id,
            phase: "start",
          });
        if (!this.startingQuestIds.has(questId)) {
          this.refreshCurrentInventoryObjective(definition, current, objective);
        }
        this.notify(questId);
      });
    }
  }

  private refreshCurrentInventoryObjectives(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
  ) {
    if (!this.currentInventorySnapshot || entry.state !== "active") return;
    const stage = definition.stages.find(candidate => candidate.id === entry.currentStageId);
    if (!stage) return;
    for (const objective of stage.objectives) {
      this.refreshCurrentInventoryObjective(definition, entry, objective);
      if (entry.state !== "active" || entry.currentStageId !== stage.id) return;
    }
  }

  private refreshCurrentInventoryObjective(
    definition: QuestDefinition,
    entry: QuestRuntimeEntry,
    objective: QuestObjectiveDefinition,
  ) {
    if (!this.currentInventorySnapshot || objective.type !== "haveItem") return;
    const progress = entry.objectives[objective.id];
    if (!progress || progress.completed || !this.isObjectiveActive(entry, progress)) return;
    const amount = Math.max(
      0,
      Math.floor(Number(this.currentInventorySnapshot[objective.targetId]) || 0),
    );
    if (progress.currentAmount === amount && amount < objective.requiredAmount) return;
    this.setObjectiveProgress(definition.id, objective.id, amount);
  }

  private createEntry(definition: QuestDefinition): QuestRuntimeEntry {
    const objectives: Record<string, QuestObjectiveRuntime> = {};
    for (const stage of definition.stages)
      for (const objective of stage.objectives)
        objectives[objective.id] = this.createObjectiveEntry(objective);
    return {
      state: definition.prerequisiteQuestIds.length === 0 ? "available" : "locked",
      currentStageId: definition.stages[0]?.id ?? "",
      objectives,
      tracked: false,
      startedAtDay: null,
      startedAtTime: null,
      rewardClaimed: false,
    };
  }

  private createObjectiveEntry(objective: QuestObjectiveDefinition): QuestObjectiveRuntime {
    return {
      currentAmount: 0,
      completed: false,
      state: this.isEventActivatedObjective(objective) ? "locked" : "active",
      unlocked: !this.isEventActivatedObjective(objective),
      activationDefinitionKey: this.objectiveActivationDefinitionKey(objective),
      ...(objective.type === "compoundCollectItem" ? { itemAmounts: {} } : {}),
    };
  }

  private requireDefinition(questId: string): QuestDefinition {
    const definition = this.definitions.get(questId);
    if (!definition) throw new Error(`Unknown quest: ${questId}`);
    return definition;
  }

  private requireEntry(questId: string): QuestRuntimeEntry {
    const entry = this.saveData.quests[questId];
    if (!entry) throw new Error(`Missing quest runtime state: ${questId}`);
    return entry;
  }

  private findObjective(definition: QuestDefinition, objectiveId: string): QuestObjectiveDefinition {
    for (const stage of definition.stages) {
      const objective = stage.objectives.find(candidate => candidate.id === objectiveId);
      if (objective) return objective;
    }
    throw new Error(`Unknown objective: ${definition.id}/${objectiveId}`);
  }

  private notify(questId: string) {
    this.host.onStateChanged?.(questId, structuredClone(this.requireEntry(questId)));
  }
}

function normalizeItemRequirements(
  objective: QuestObjectiveDefinition,
): QuestItemRequirement[] {
  if (!Array.isArray(objective.itemRequirements)) return [];
  return objective.itemRequirements.flatMap((requirement) => {
    const itemId = typeof requirement?.itemId === "string"
      ? requirement.itemId.trim()
      : "";
    const requiredAmount = Math.max(1, Math.floor(Number(requirement?.requiredAmount) || 1));
    return itemId ? [{ itemId, requiredAmount }] : [];
  });
}

type ObjectiveUpdate =
  | { mode: "add"; amount: number }
  | { mode: "set"; amount: number }
  | { mode: "complete" };

export function evaluateQuestObjective(
  objective: QuestObjectiveDefinition,
  event: QuestGameEvent,
): ObjectiveUpdate | null {
  const targetMatches = !objective.targetId || objective.targetId === event.targetId;
  if (!targetMatches) return null;
  switch (objective.type) {
    case "collectItem":
      return event.type === "itemCollected" ? { mode: "add", amount: event.amount ?? 1 } : null;
    case "compoundCollectItem":
      return null;
    case "submitItemAtInteraction": {
      if (event.type !== "itemSubmitted") return null;
      const requirement = normalizeItemRequirements(objective)[0];
      if (!requirement || requirement.itemId !== event.itemId) return null;
      return { mode: "add", amount: event.amount ?? 1 };
    }
    case "haveItem":
      return event.type === "inventoryChanged" ? { mode: "set", amount: event.amount ?? 0 } : null;
    case "interfaceOpened":
      return event.type === "interfaceOpened" ? { mode: "complete" } : null;
    case "itemUsed":
      return event.type === "itemUsed" ? { mode: "add", amount: event.amount ?? 1 } : null;
    case "interactionStarted":
      return event.type === "interactionStarted" ? { mode: "complete" } : null;
    case "interactionSucceeded":
      return event.type === "interactionSucceeded" ? { mode: "complete" } : null;
    case "enterArea":
      return event.type === "areaEntered" ? { mode: "complete" } : null;
    case "puzzleCompleted":
      return event.type === "puzzleCompleted" ? { mode: "complete" } : null;
    case "dialogueCompleted":
      return event.type === "dialogueCompleted" ? { mode: "complete" } : null;
    case "objectStateReached":
      return event.type === "objectStateChanged" && String(event.result ?? "") === (objective.targetState ?? "")
        ? { mode: "complete" }
        : null;
    case "dayOrTimeReached":
      return (event.type === "dayChanged" || event.type === "timeChanged") &&
        Number(event.result ?? event.amount ?? 0) >= objective.requiredAmount
        ? { mode: "complete" }
        : null;
    case "flagCondition":
      return event.type === "flagChanged" && String(event.result) === (objective.targetState || "true")
        ? { mode: "complete" }
        : null;
    case "customProgress":
      return event.type === "customQuestProgressAdded" ? { mode: "add", amount: event.amount ?? 0 } : null;
  }
}
