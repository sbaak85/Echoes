import type {
  QuestDefinition,
  QuestDocument,
  QuestObjectiveDefinition,
  QuestObjectiveCompletionRule,
  QuestObjectiveRuntime,
  QuestRuntimeEntry,
  QuestSaveData,
} from "./quest-runtime-manager.ts";
import {
  getQuestObjectiveRequiredAmount,
  normalizeObjectiveTargetIds,
} from "./quest-runtime-manager.ts";
import type { PlayerInventory } from "./item-database.ts";
import {
  getInteractionCycle,
  type InteractionUsageState,
  type SurvivalEffects,
  type SurvivalGameState,
} from "./survival-manager.ts";
import type { StoryProgress } from "./story-progress.ts";

export type QuestDebugCommand =
  | { kind: "next" }
  | { kind: "stage-next" }
  | { kind: "goto"; questRef: string; stageRef?: string };

export type QuestDebugOutcome = {
  completedEventIds?: string[];
  completedInteractionIds?: string[];
  ensureItems?: Record<string, number>;
  worldSpawns?: Array<{ itemId: string; quantity: number }>;
  minimumCampPower?: number;
  survivalValues?: Partial<Record<"stamina" | "hunger" | "thirst" | "spirit", number>>;
  gameMinutes?: number;
  storyFlags?: Record<string, boolean>;
  teleportPointId?: string;
};

export type QuestDebugScenarioMetadata = {
  questId: string;
  implicitPrerequisiteQuestIds?: string[];
  startOutcome?: QuestDebugOutcome;
  completionOutcome?: QuestDebugOutcome;
  stageOutcomes?: Record<string, QuestDebugOutcome>;
};

export type QuestDebugScenarioState = {
  questSave?: QuestSaveData;
  inventory: PlayerInventory;
  survival: SurvivalGameState;
  story: StoryProgress;
  interactionUsage: InteractionUsageState;
  campPowerCurrent: number;
};

export type QuestDebugScenarioPlan = {
  command: QuestDebugCommand;
  targetQuestId: string;
  targetQuestName: string;
  targetStageId: string;
  targetStageName: string;
  completedQuestIds: string[];
  completedObjectiveIds: string[];
  questSave: QuestSaveData;
  inventory: PlayerInventory;
  survival: SurvivalGameState;
  story: StoryProgress;
  interactionUsage: InteractionUsageState;
  campPowerCurrent: number;
  worldSpawns: Array<{ itemId: string; quantity: number }>;
  teleportPointId?: string;
  changes: string[];
};

export type QuestDebugValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  questId?: string;
  stageId?: string;
  objectiveId?: string;
};

export type QuestDebugValidationContext = {
  interactionIds?: ReadonlySet<string>;
  itemIds?: ReadonlySet<string>;
  storyEventIds?: ReadonlySet<string>;
  teleportPointIds?: ReadonlySet<string>;
};

export const CHAPTER_3_QUEST_DEBUG_SCENARIOS: readonly QuestDebugScenarioMetadata[] = [
  {
    questId: "QUEST_CH03_MAIN_001",
    startOutcome: {
      completedEventIds: ["chapter03-start-flow"],
    },
    completionOutcome: {
      completedEventIds: ["chapter03-start-flow"],
    },
  },
  {
    questId: "QUEST_CH03_MAIN_002",
    startOutcome: {
      completedEventIds: ["story-zone:Scene_3:story-trigger-002"],
    },
  },
  { questId: "QUEST_CH03_MAIN_003" },
  { questId: "QUEST_CH03_MAIN_004" },
  {
    questId: "QUEST_CH03_MAIN_005",
    completionOutcome: { minimumCampPower: 7 },
    stageOutcomes: {
      QUEST_CH03_MAIN_005_STAGE_06: { minimumCampPower: 7 },
    },
  },
  {
    questId: "QUEST_CH03_MAIN_006",
    implicitPrerequisiteQuestIds: ["QUEST_CH03_MAIN_005"],
    startOutcome: { minimumCampPower: 7 },
    stageOutcomes: {
      QUEST_CH03_MAIN_006_STAGE_02: {
        ensureItems: { T0007: 1, R0009: 1 },
        minimumCampPower: 7,
      },
      QUEST_CH03_MAIN_006_STAGE_03: {
        completedEventIds: ["chapter03-section-8"],
        ensureItems: { T0007: 1 },
        minimumCampPower: 7,
      },
    },
  },
  {
    questId: "QUEST_CH04_MAIN_001",
    implicitPrerequisiteQuestIds: ["QUEST_CH03_MAIN_006"],
    stageOutcomes: {
      QUEST_CH04_MAIN_001_STAGE_02: {
        completedEventIds: ["chapter04-section-1"],
      },
    },
  },
] as const;

export function isQuestDebugCommand(command: string): boolean {
  return /^\s*quest(?:\s+.*)?$/i.test(command);
}

export function parseQuestDebugCommand(command: string): QuestDebugCommand | null {
  if (/^\s*quest\s+next\s*$/i.test(command)) return { kind: "next" };
  if (/^\s*quest\s+stage\s+next\s*$/i.test(command)) return { kind: "stage-next" };
  const match = /^\s*quest\s+goto\s+(\S+)(?:\s+stage\s+(\S+))?\s*$/i.exec(command);
  if (!match) return null;
  return {
    kind: "goto",
    questRef: match[1],
    ...(match[2] ? { stageRef: match[2] } : {}),
  };
}

export function buildQuestDebugScenarioPlan(
  document: QuestDocument,
  command: QuestDebugCommand,
  state: QuestDebugScenarioState,
  options: {
    itemSurvivalEffects?: Readonly<Record<string, SurvivalEffects | undefined>>;
    objectiveCompletionRules?: readonly QuestObjectiveCompletionRule[];
    metadata?: readonly QuestDebugScenarioMetadata[];
  } = {},
): QuestDebugScenarioPlan {
  const metadata = options.metadata ?? CHAPTER_3_QUEST_DEBUG_SCENARIOS;
  const metadataByQuestId = new Map(metadata.map((entry) => [entry.questId, entry]));
  const target = resolveQuestDebugTarget(document, command, state.questSave, metadataByQuestId);
  const completedQuestIdSet = new Set(collectQuestDependencies(
    document,
    target.quest.id,
    metadataByQuestId,
  ));
  if (command.kind !== "goto") {
    for (const quest of document.quests) {
      if (state.questSave?.quests[quest.id]?.state === "completed") {
        completedQuestIdSet.add(quest.id);
      }
    }
    const activeMainQuest = document.quests.find(
      (quest) => quest.type === "main" && state.questSave?.quests[quest.id]?.state === "active",
    );
    if (activeMainQuest && activeMainQuest.id !== target.quest.id) {
      completedQuestIdSet.add(activeMainQuest.id);
    }
  }
  const completedQuestIds = document.quests
    .filter((quest) => completedQuestIdSet.has(quest.id) && quest.id !== target.quest.id)
    .map((quest) => quest.id);
  const completedQuestSet = new Set(completedQuestIds);
  const targetStageIndex = target.quest.stages.findIndex(
    (stage) => stage.id === target.stage.id,
  );
  if (targetStageIndex < 0) {
    throw new Error(`找不到任務階段：${target.stage.id}`);
  }

  const questSave = createScenarioQuestSave(
    document,
    state.questSave,
    target.quest,
    target.stage.id,
    completedQuestIds,
    command.kind !== "goto",
  );
  const inventory: PlayerInventory = { ...state.inventory };
  let survival = cloneSurvivalState(state.survival);
  const story: StoryProgress = {
    ...state.story,
    completedEventIds: [...state.story.completedEventIds],
    storyFlags: { ...state.story.storyFlags },
  };
  const interactionUsage: InteractionUsageState = {
    ...state.interactionUsage,
    counts: { ...state.interactionUsage.counts },
    completedOnceIds: [...state.interactionUsage.completedOnceIds],
  };
  let campPowerCurrent = Math.max(0, Number(state.campPowerCurrent) || 0);
  const worldSpawns: Array<{ itemId: string; quantity: number }> = [];
  let teleportPointId: string | undefined;
  const completedObjectiveIds: string[] = [];
  const changes: string[] = [];
  const alreadyCompletedQuestIds = new Set(
    document.quests.flatMap((quest) =>
      state.questSave?.quests[quest.id]?.state === "completed" ? [quest.id] : [],
    ),
  );

  const applyOutcome = (outcome: QuestDebugOutcome | undefined) => {
    if (!outcome) return;
    if (outcome.completedEventIds?.length) {
      story.completedEventIds = unique([
        ...story.completedEventIds,
        ...outcome.completedEventIds,
      ]);
    }
    if (outcome.storyFlags) {
      Object.assign(story.storyFlags, outcome.storyFlags);
    }
    for (const interactionId of outcome.completedInteractionIds ?? []) {
      interactionUsage.completedOnceIds = unique([
        ...interactionUsage.completedOnceIds,
        interactionId,
      ]);
      interactionUsage.counts[interactionId] = Math.max(
        1,
        interactionUsage.counts[interactionId] ?? 0,
      );
    }
    if (outcome.ensureItems) {
      for (const [itemId, quantity] of Object.entries(outcome.ensureItems)) {
        ensureInventoryItem(inventory, itemId, quantity);
      }
    }
    for (const spawn of outcome.worldSpawns ?? []) {
      const quantity = Math.max(0, Math.floor(Number(spawn.quantity) || 0));
      if (spawn.itemId && quantity > 0) worldSpawns.push({ itemId: spawn.itemId, quantity });
    }
    if (outcome.minimumCampPower != null) {
      campPowerCurrent = Math.max(
        campPowerCurrent,
        Math.max(0, Number(outcome.minimumCampPower) || 0),
      );
    }
    if (outcome.survivalValues) {
      const values = { ...survival.values };
      for (const metric of ["stamina", "hunger", "thirst", "spirit"] as const) {
        const value = Number(outcome.survivalValues[metric]);
        if (Number.isFinite(value)) values[metric] = Math.max(0, Math.min(100, value));
      }
      survival = { ...survival, values, gameOverReason: null };
    }
    if (outcome.gameMinutes != null && Number.isFinite(Number(outcome.gameMinutes))) {
      survival = {
        ...survival,
        gameMinutes: Math.max(0, Math.floor(Number(outcome.gameMinutes))),
      };
      interactionUsage.cycle = getInteractionCycle(survival.gameMinutes);
    }
    if (outcome.teleportPointId?.trim()) teleportPointId = outcome.teleportPointId.trim();
  };

  for (const quest of document.quests) {
    if (!completedQuestSet.has(quest.id)) continue;
    if (!alreadyCompletedQuestIds.has(quest.id)) {
      for (const stage of quest.stages) {
        for (const objective of stage.objectives) {
          if (state.questSave?.quests[quest.id]?.objectives[objective.id]?.completed) {
            continue;
          }
          completedObjectiveIds.push(objective.id);
          survival = applyCompletedObjectiveOutcome(
            objective,
            inventory,
            survival,
            interactionUsage,
            story,
            options.itemSurvivalEffects,
          );
        }
      }
      if (quest.rewardItemId && (quest.rewardItemAmount ?? 0) > 0) {
        addInventoryItem(inventory, quest.rewardItemId, quest.rewardItemAmount ?? 0);
      }
    }
    if (quest.completionFlagId) story.storyFlags[quest.completionFlagId] = true;
    const questMetadata = metadataByQuestId.get(quest.id);
    applyOutcome(questMetadata?.startOutcome);
    applyOutcome(questMetadata?.completionOutcome);
  }

  for (let stageIndex = 0; stageIndex < targetStageIndex; stageIndex += 1) {
    for (const objective of target.quest.stages[stageIndex].objectives) {
      if (
        state.questSave?.quests[target.quest.id]?.objectives[objective.id]?.completed
      ) {
        continue;
      }
      completedObjectiveIds.push(objective.id);
      survival = applyCompletedObjectiveOutcome(
        objective,
        inventory,
        survival,
        interactionUsage,
        story,
        options.itemSurvivalEffects,
      );
    }
  }

  const targetMetadata = metadataByQuestId.get(target.quest.id);
  applyOutcome(targetMetadata?.startOutcome);
  applyOutcome(targetMetadata?.stageOutcomes?.[target.stage.id]);
  settleObjectiveCompletionRules(
    questSave,
    options.objectiveCompletionRules ?? [],
    story,
  );

  changes.push(
    completedQuestIds.length > 0
      ? `已結算前置任務 ${completedQuestIds.length} 個`
      : "沒有需要結算的前置任務",
  );
  if (completedObjectiveIds.length > 0) {
    changes.push(`已結算目標 ${completedObjectiveIds.length} 個`);
  }
  changes.push(`啟動「${target.quest.name}」／「${target.stage.name}」`);

  return {
    command,
    targetQuestId: target.quest.id,
    targetQuestName: target.quest.name,
    targetStageId: target.stage.id,
    targetStageName: target.stage.name,
    completedQuestIds,
    completedObjectiveIds,
    questSave,
    inventory: normalizeInventory(inventory),
    survival,
    story,
    interactionUsage,
    campPowerCurrent,
    worldSpawns,
    ...(teleportPointId ? { teleportPointId } : {}),
    changes,
  };
}

export function validateQuestDebugConfiguration(
  document: QuestDocument,
  metadata: readonly QuestDebugScenarioMetadata[] = CHAPTER_3_QUEST_DEBUG_SCENARIOS,
  context: QuestDebugValidationContext = {},
): QuestDebugValidationIssue[] {
  const issues: QuestDebugValidationIssue[] = [];
  const questIds = new Set(document.quests.map((quest) => quest.id));
  const metadataQuestIds = new Set<string>();

  for (const quest of document.quests) {
    for (const prerequisiteId of quest.prerequisiteQuestIds) {
      if (!questIds.has(prerequisiteId)) {
        issues.push({
          severity: "error",
          code: "unknown-prerequisite",
          questId: quest.id,
          message: `${quest.id} 引用了不存在的前置任務 ${prerequisiteId}`,
        });
      }
    }
    for (const stage of quest.stages) {
      for (const objective of stage.objectives) {
        validateObjectiveTarget(issues, quest, stage.id, objective, context);
      }
    }
  }

  for (const entry of metadata) {
    if (metadataQuestIds.has(entry.questId)) {
      issues.push({
        severity: "error",
        code: "duplicate-scenario",
        questId: entry.questId,
        message: `任務 ${entry.questId} 有重複的 Scenario metadata`,
      });
      continue;
    }
    metadataQuestIds.add(entry.questId);
    const quest = document.quests.find((candidate) => candidate.id === entry.questId);
    if (!quest) {
      issues.push({
        severity: "error",
        code: "unknown-scenario-quest",
        questId: entry.questId,
        message: `Scenario 引用了不存在的任務 ${entry.questId}`,
      });
      continue;
    }
    for (const prerequisiteId of entry.implicitPrerequisiteQuestIds ?? []) {
      if (!questIds.has(prerequisiteId)) {
        issues.push({
          severity: "error",
          code: "unknown-implicit-prerequisite",
          questId: entry.questId,
          message: `${entry.questId} 的隱含前置任務不存在：${prerequisiteId}`,
        });
      }
    }
    for (const [stageId, outcome] of Object.entries(entry.stageOutcomes ?? {})) {
      if (!quest.stages.some((stage) => stage.id === stageId)) {
        issues.push({
          severity: "error",
          code: "unknown-scenario-stage",
          questId: entry.questId,
          stageId,
          message: `${entry.questId} 的 Scenario 階段不存在：${stageId}`,
        });
      }
      validateOutcomeReferences(issues, entry.questId, stageId, outcome, context);
    }
    validateOutcomeReferences(issues, entry.questId, undefined, entry.startOutcome, context);
    validateOutcomeReferences(issues, entry.questId, undefined, entry.completionOutcome, context);
  }

  detectPrerequisiteCycles(document, metadata, issues);
  return issues;
}

function resolveQuestDebugTarget(
  document: QuestDocument,
  command: QuestDebugCommand,
  save: QuestSaveData | undefined,
  metadataByQuestId: ReadonlyMap<string, QuestDebugScenarioMetadata>,
) {
  const mainQuests = document.quests.filter((quest) => quest.type === "main");
  let quest: QuestDefinition | undefined;
  let stage: QuestDefinition["stages"][number] | undefined;
  if (command.kind === "goto") {
    quest = resolveQuestReference(mainQuests, command.questRef);
  } else if (command.kind === "stage-next") {
    const activeQuest = mainQuests.find(
      (candidate) => save?.quests[candidate.id]?.state === "active",
    );
    if (!activeQuest) throw new Error("目前沒有進行中的主線任務 Stage");
    const currentStageId = save?.quests[activeQuest.id]?.currentStageId;
    const currentStageIndex = activeQuest.stages.findIndex(
      (candidate) => candidate.id === currentStageId,
    );
    if (currentStageIndex < 0) {
      throw new Error(`目前任務的 Stage 資料無效：${currentStageId ?? "unknown"}`);
    }
    const nextStage = activeQuest.stages[currentStageIndex + 1];
    if (nextStage) {
      quest = activeQuest;
      stage = nextStage;
    } else {
      const activeIndex = mainQuests.findIndex(
        (candidate) => candidate.id === activeQuest.id,
      );
      quest = mainQuests[activeIndex + 1];
    }
  } else {
    const activeIndex = mainQuests.findIndex(
      (candidate) => save?.quests[candidate.id]?.state === "active",
    );
    if (activeIndex >= 0) {
      quest = mainQuests[activeIndex + 1];
    } else {
      const firstUnfinished = mainQuests.find(
        (candidate) => save?.quests[candidate.id]?.state !== "completed",
      );
      quest = firstUnfinished ?? undefined;
    }
  }
  if (!quest) {
    if (command.kind === "goto") {
      throw new Error(`找不到主線任務：${command.questRef}`);
    }
    throw new Error(
      command.kind === "stage-next"
        ? "目前已是最後一個主線任務的最後 Stage"
        : "目前已沒有下一個主線任務",
    );
  }
  const stageRef = command.kind === "goto" ? command.stageRef : undefined;
  stage ??= resolveStageReference(quest, stageRef);
  if (!stage) {
    throw new Error(`找不到 ${quest.id} 的階段：${stageRef ?? "start"}`);
  }
  // Accessing metadata here makes a missing implicit prerequisite visible in
  // the same resolution path used by Quest Next and Quest Goto.
  void metadataByQuestId.get(quest.id);
  return { quest, stage };
}

function resolveQuestReference(quests: QuestDefinition[], reference: string) {
  const numeric = /^\d+$/.test(reference) ? Number.parseInt(reference, 10) : 0;
  if (numeric > 0) return quests[numeric - 1];
  const normalized = reference.toLocaleLowerCase();
  return quests.find(
    (quest) =>
      quest.id.toLocaleLowerCase() === normalized ||
      quest.name.toLocaleLowerCase() === normalized,
  );
}

function resolveStageReference(quest: QuestDefinition, reference?: string) {
  if (!reference) return quest.stages[0];
  const numeric = /^\d+$/.test(reference) ? Number.parseInt(reference, 10) : 0;
  if (numeric > 0) return quest.stages[numeric - 1];
  const normalized = reference.toLocaleLowerCase();
  return quest.stages.find(
    (stage) =>
      stage.id.toLocaleLowerCase() === normalized ||
      stage.name.toLocaleLowerCase() === normalized,
  );
}

function collectQuestDependencies(
  document: QuestDocument,
  targetQuestId: string,
  metadataByQuestId: ReadonlyMap<string, QuestDebugScenarioMetadata>,
) {
  const definitions = new Map(document.quests.map((quest) => [quest.id, quest]));
  const resolved: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (questId: string) => {
    if (visited.has(questId)) return;
    if (visiting.has(questId)) throw new Error(`任務前置鏈形成循環：${questId}`);
    visiting.add(questId);
    const quest = definitions.get(questId);
    if (!quest) throw new Error(`找不到前置任務：${questId}`);
    const dependencies = unique([
      ...quest.prerequisiteQuestIds,
      ...(metadataByQuestId.get(questId)?.implicitPrerequisiteQuestIds ?? []),
    ]);
    for (const dependencyId of dependencies) visit(dependencyId);
    visiting.delete(questId);
    visited.add(questId);
    if (questId !== targetQuestId) resolved.push(questId);
  };
  visit(targetQuestId);
  return resolved;
}

function createScenarioQuestSave(
  document: QuestDocument,
  currentSave: QuestSaveData | undefined,
  targetQuest: QuestDefinition,
  targetStageId: string,
  completedQuestIds: string[],
  preserveUnrelatedProgress: boolean,
): QuestSaveData {
  const completedSet = new Set(completedQuestIds);
  const save: QuestSaveData = {
    schemaVersion: 1,
    quests: {},
    processedEventIds: [...(currentSave?.processedEventIds ?? [])],
    completionSequence: currentSave?.completionSequence ?? 0,
  };
  let completionSequence = save.completionSequence ?? 0;

  for (const quest of document.quests) {
    if (completedSet.has(quest.id)) {
      const existingEntry = currentSave?.quests[quest.id];
      if (preserveUnrelatedProgress && existingEntry?.state === "completed") {
        save.quests[quest.id] = structuredClone(existingEntry);
        completionSequence = Math.max(
          completionSequence,
          existingEntry.completedOrder ?? 0,
        );
      } else {
        completionSequence += 1;
        save.quests[quest.id] = createCompletedQuestEntry(quest, completionSequence);
      }
    } else if (quest.id === targetQuest.id) {
      save.quests[quest.id] = createActiveQuestEntry(quest, targetStageId);
    } else if (
      preserveUnrelatedProgress &&
      quest.type !== "main" &&
      currentSave?.quests[quest.id]
    ) {
      save.quests[quest.id] = structuredClone(currentSave.quests[quest.id]);
    } else {
      save.quests[quest.id] = createInitialQuestEntry(quest);
    }
  }
  save.completionSequence = completionSequence;

  let changed = true;
  while (changed) {
    changed = false;
    for (const quest of document.quests) {
      const entry = save.quests[quest.id];
      if (!entry || entry.state !== "locked") continue;
      if (quest.prerequisiteQuestIds.every((id) => save.quests[id]?.state === "completed")) {
        entry.state = "available";
        changed = true;
      }
    }
  }
  return save;
}

function createInitialQuestEntry(quest: QuestDefinition): QuestRuntimeEntry {
  return {
    state: quest.prerequisiteQuestIds.length === 0 ? "available" : "locked",
    currentStageId: quest.stages[0]?.id ?? "",
    objectives: Object.fromEntries(
      quest.stages.flatMap((stage) =>
        stage.objectives.map((objective) => [
          objective.id,
          createObjectiveProgress(objective, false),
        ]),
      ),
    ),
    tracked: false,
    startedAtDay: null,
    startedAtTime: null,
    rewardClaimed: false,
  };
}

function createCompletedQuestEntry(
  quest: QuestDefinition,
  completedOrder: number,
): QuestRuntimeEntry {
  const entry = createInitialQuestEntry(quest);
  const finalStage = quest.stages.at(-1);
  return {
    ...entry,
    state: "completed",
    currentStageId: finalStage?.id ?? entry.currentStageId,
    objectives: Object.fromEntries(
      quest.stages.flatMap((stage) =>
        stage.objectives.map((objective) => [
          objective.id,
          createObjectiveProgress(objective, true),
        ]),
      ),
    ),
    tracked: false,
    rewardClaimed: true,
    completedOrder,
    stageAvailableAtEpochMs: 0,
    stageStartEventExecutedForId: finalStage?.id,
    stageCompletionAvailableAtEpochMs: 0,
    stageCompletionEventExecutedForId: finalStage?.id,
    questCompletionPresented: true,
    completionTriggerCompleted: true,
  };
}

function createActiveQuestEntry(
  quest: QuestDefinition,
  targetStageId: string,
): QuestRuntimeEntry {
  const entry = createInitialQuestEntry(quest);
  const targetStageIndex = quest.stages.findIndex((stage) => stage.id === targetStageId);
  const targetStage = quest.stages[targetStageIndex];
  entry.state = "active";
  entry.currentStageId = targetStageId;
  entry.tracked = true;
  entry.stageAvailableAtEpochMs = 0;
  entry.stageStartEventExecutedForId = targetStageId;
  for (let index = 0; index < quest.stages.length; index += 1) {
    for (const objective of quest.stages[index].objectives) {
      entry.objectives[objective.id] = createObjectiveProgress(
        objective,
        index < targetStageIndex,
        index === targetStageIndex,
      );
    }
  }
  if (targetStage) {
    entry.stageCompletionAvailableAtEpochMs = undefined;
    entry.stageCompletionEventExecutedForId = undefined;
  }
  return entry;
}

function createObjectiveProgress(
  objective: QuestObjectiveDefinition,
  completed: boolean,
  currentStage = false,
): QuestObjectiveRuntime {
  const activationEventId = (objective.activationEventId ?? objective.unlockDialogueId ?? "").trim();
  const eventActivated = objective.activationMode === "event" || activationEventId.length > 0;
  const unlocked = completed || !eventActivated;
  const completedCompoundItemIds = objective.compoundMatchMode === "anyN"
    ? new Set(
        (objective.itemRequirements ?? [])
          .slice(0, getQuestObjectiveRequiredAmount(objective))
          .map((requirement) => requirement.itemId),
      )
    : null;
  const itemAmounts = objective.type === "compoundCollectItem"
    ? Object.fromEntries(
        (objective.itemRequirements ?? []).map((requirement) => [
          requirement.itemId,
          completed && (!completedCompoundItemIds || completedCompoundItemIds.has(requirement.itemId))
            ? requirement.requiredAmount
            : 0,
        ]),
      )
    : undefined;
  return {
    currentAmount: completed ? getQuestObjectiveRequiredAmount(objective) : 0,
    completed,
    state: completed ? "completed" : unlocked ? "active" : "locked",
    unlocked,
    activationDefinitionKey: eventActivated ? `event:${activationEventId}` : "immediate",
    ...(itemAmounts ? { itemAmounts } : {}),
    ...(currentStage ? { availableAtEpochMs: 0, startActionsPresented: true } : {}),
    ...(completed
      ? {
          availableAtEpochMs: 0,
          completionAvailableAtEpochMs: 0,
          completionPresented: true,
          completionEventCompleted: true,
          startActionsPresented: true,
        }
      : {}),
  };
}

function applyCompletedObjectiveOutcome(
  objective: QuestObjectiveDefinition,
  inventory: PlayerInventory,
  survival: SurvivalGameState,
  interactionUsage: InteractionUsageState,
  story: StoryProgress,
  itemSurvivalEffects?: Readonly<Record<string, SurvivalEffects | undefined>>,
): SurvivalGameState {
  if (
    objective.type === "collectItem" ||
    objective.type === "haveItem"
  ) {
    if (objective.targetId) {
      ensureInventoryItem(inventory, objective.targetId, objective.requiredAmount);
    }
  } else if (objective.type === "compoundCollectItem") {
    const requirements = objective.compoundMatchMode === "anyN"
      ? (objective.itemRequirements ?? []).slice(0, getQuestObjectiveRequiredAmount(objective))
      : (objective.itemRequirements ?? []);
    for (const requirement of requirements) {
      ensureInventoryItem(inventory, requirement.itemId, requirement.requiredAmount);
    }
  } else if (objective.type === "itemUsed") {
    removeInventoryQuantity(inventory, objective.targetId, objective.requiredAmount);
    survival = applySurvivalEffectValues(
      survival,
      itemSurvivalEffects?.[objective.targetId],
    );
  } else if (objective.type === "submitItemAtInteraction") {
    for (const requirement of objective.itemRequirements ?? []) {
      removeInventoryQuantity(inventory, requirement.itemId, requirement.requiredAmount);
    }
  }

  if (objective.type === "dialogueCompleted" && objective.targetId) {
    story.completedEventIds = unique([
      ...story.completedEventIds,
      objective.targetId,
    ]);
  }

  if (
    [
      "interactionStarted",
      "interactionSucceeded",
      "puzzleCompleted",
      "submitItemAtInteraction",
    ].includes(objective.type)
  ) {
    const distinctTargetIds = normalizeObjectiveTargetIds(objective);
    const targetIds = unique([
      ...(objective.targetId ? [objective.targetId] : []),
      ...distinctTargetIds,
    ]).slice(0, getQuestObjectiveRequiredAmount(objective));
    for (const targetId of targetIds) {
      interactionUsage.completedOnceIds = unique([
        ...interactionUsage.completedOnceIds,
        targetId,
      ]);
      interactionUsage.counts[targetId] = Math.max(
        interactionUsage.counts[targetId] ?? 0,
        distinctTargetIds.length > 0 ? 1 : getQuestObjectiveRequiredAmount(objective),
      );
    }
  }
  return survival;
}

function applySurvivalEffectValues(
  state: SurvivalGameState,
  effects: SurvivalEffects | undefined,
): SurvivalGameState {
  if (!effects) return state;
  const values = { ...state.values };
  for (const metric of ["stamina", "hunger", "thirst", "spirit"] as const) {
    const delta = Number(effects[metric]);
    if (!Number.isFinite(delta) || delta === 0) continue;
    values[metric] = Math.max(0, Math.min(100, values[metric] + delta));
  }
  return {
    ...state,
    values,
    zeroDurationMinutes: {
      hunger: values.hunger > 0 ? 0 : state.zeroDurationMinutes.hunger,
      thirst: values.thirst > 0 ? 0 : state.zeroDurationMinutes.thirst,
      spirit: values.spirit > 0 ? 0 : state.zeroDurationMinutes.spirit,
    },
    gameOverReason: null,
  };
}

function settleObjectiveCompletionRules(
  questSave: QuestSaveData,
  rules: readonly QuestObjectiveCompletionRule[],
  story: StoryProgress,
) {
  for (const rule of rules) {
    const entry = questSave.quests[rule.questId];
    if (!entry || rule.objectiveIds.length === 0) continue;
    if (!rule.objectiveIds.every((objectiveId) => entry.objectives[objectiveId]?.completed)) {
      continue;
    }
    entry.objectiveCompletionRules ??= {};
    entry.objectiveCompletionRules[rule.id] = {
      availableAtEpochMs: 0,
      completed: true,
    };
    if (rule.eventFlowId.trim()) {
      story.completedEventIds = unique([
        ...story.completedEventIds,
        rule.eventFlowId.trim(),
      ]);
    }
  }
}

function ensureInventoryItem(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
) {
  const normalized = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!itemId || normalized <= 0) return;
  inventory[itemId] = Math.max(inventory[itemId] ?? 0, normalized);
}

function addInventoryItem(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
) {
  const normalized = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!itemId || normalized <= 0) return;
  inventory[itemId] = (inventory[itemId] ?? 0) + normalized;
}

function removeInventoryQuantity(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
) {
  if (!itemId) return;
  const next = Math.max(
    0,
    (inventory[itemId] ?? 0) - Math.max(0, Math.floor(Number(quantity) || 0)),
  );
  if (next > 0) inventory[itemId] = next;
  else delete inventory[itemId];
}

function normalizeInventory(inventory: PlayerInventory): PlayerInventory {
  return Object.fromEntries(
    Object.entries(inventory).flatMap(([itemId, quantity]) => {
      const normalized = Math.max(0, Math.floor(Number(quantity) || 0));
      return itemId && normalized > 0 ? [[itemId, normalized]] : [];
    }),
  );
}

function cloneSurvivalState(state: SurvivalGameState): SurvivalGameState {
  return {
    ...state,
    values: { ...state.values },
    zeroDurationMinutes: { ...state.zeroDurationMinutes },
  };
}

function validateObjectiveTarget(
  issues: QuestDebugValidationIssue[],
  quest: QuestDefinition,
  stageId: string,
  objective: QuestObjectiveDefinition,
  context: QuestDebugValidationContext,
) {
  const targetId = (objective.targetId ?? "").trim();
  if (
    ["collectItem", "haveItem", "itemUsed"].includes(objective.type) &&
    (!targetId || (context.itemIds && !context.itemIds.has(targetId)))
  ) {
    issues.push({
      severity: "error",
      code: targetId ? "unknown-objective-item" : "missing-objective-target",
      questId: quest.id,
      stageId,
      objectiveId: objective.id,
      message: targetId
        ? `${objective.id} 引用了不存在的道具 ${targetId}`
        : `${objective.id}（${objective.type}）缺少 targetId`,
    });
  }
  if (
    [
      "interactionStarted",
      "interactionSucceeded",
      "puzzleCompleted",
      "submitItemAtInteraction",
    ].includes(objective.type) &&
    context.interactionIds
  ) {
    const targetIds = unique([
      ...(targetId ? [targetId] : []),
      ...normalizeObjectiveTargetIds(objective),
    ]);
    if (targetIds.length === 0) {
      const isDormantPlaceholder = objective.activationMode === "event" &&
        !(objective.activationEventId ?? objective.unlockDialogueId ?? "").trim();
      issues.push({
        severity: isDormantPlaceholder ? "warning" : "error",
        code: "missing-objective-target",
        questId: quest.id,
        stageId,
        objectiveId: objective.id,
        message: `${objective.id}（${objective.type}）缺少 targetId／targetIds`,
      });
    }
    for (const interactionId of targetIds) {
      if (context.interactionIds.has(interactionId)) continue;
      issues.push({
        severity: "error",
        code: "unknown-objective-interaction",
        questId: quest.id,
        stageId,
        objectiveId: objective.id,
        message: `${objective.id} 引用了不存在的互動 ${interactionId}`,
      });
    }
  }
  for (const requirement of objective.itemRequirements ?? []) {
    if (context.itemIds && !context.itemIds.has(requirement.itemId)) {
      issues.push({
        severity: "error",
        code: "unknown-objective-required-item",
        questId: quest.id,
        stageId,
        objectiveId: objective.id,
        message: `${objective.id} 引用了不存在的需求道具 ${requirement.itemId}`,
      });
    }
  }
}

function validateOutcomeReferences(
  issues: QuestDebugValidationIssue[],
  questId: string,
  stageId: string | undefined,
  outcome: QuestDebugOutcome | undefined,
  context: QuestDebugValidationContext,
) {
  if (!outcome) return;
  for (const itemId of Object.keys(outcome.ensureItems ?? {})) {
    if (context.itemIds && !context.itemIds.has(itemId)) {
      issues.push({
        severity: "error",
        code: "unknown-scenario-item",
        questId,
        stageId,
        message: `${questId} 的 Scenario 引用了不存在的道具 ${itemId}`,
      });
    }
  }
  for (const spawn of outcome.worldSpawns ?? []) {
    if (context.itemIds && !context.itemIds.has(spawn.itemId)) {
      issues.push({
        severity: "error",
        code: "unknown-scenario-spawn-item",
        questId,
        stageId,
        message: `${questId} 的 Scenario 生成設定引用了不存在的道具 ${spawn.itemId}`,
      });
    }
  }
  for (const interactionId of outcome.completedInteractionIds ?? []) {
    if (context.interactionIds && !context.interactionIds.has(interactionId)) {
      issues.push({
        severity: "error",
        code: "unknown-scenario-interaction",
        questId,
        stageId,
        message: `${questId} 的 Scenario 引用了不存在的互動 ${interactionId}`,
      });
    }
  }
  if (
    outcome.teleportPointId &&
    context.teleportPointIds &&
    !context.teleportPointIds.has(outcome.teleportPointId)
  ) {
    issues.push({
      severity: "error",
      code: "unknown-scenario-teleport",
      questId,
      stageId,
      message: `${questId} 的 Scenario 引用了不存在的傳送點 ${outcome.teleportPointId}`,
    });
  }
  for (const eventId of outcome.completedEventIds ?? []) {
    if (context.storyEventIds && !context.storyEventIds.has(eventId)) {
      issues.push({
        severity: "warning",
        code: "unregistered-scenario-story-event",
        questId,
        stageId,
        message: `${questId} 的 Scenario 事件未出現在已知清單：${eventId}`,
      });
    }
  }
}

function detectPrerequisiteCycles(
  document: QuestDocument,
  metadata: readonly QuestDebugScenarioMetadata[],
  issues: QuestDebugValidationIssue[],
) {
  const metadataByQuestId = new Map(metadata.map((entry) => [entry.questId, entry]));
  const questById = new Map(document.quests.map((quest) => [quest.id, quest]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (questId: string) => {
    if (visited.has(questId)) return;
    if (visiting.has(questId)) {
      issues.push({
        severity: "error",
        code: "prerequisite-cycle",
        questId,
        message: `任務前置鏈形成循環：${questId}`,
      });
      return;
    }
    visiting.add(questId);
    const quest = questById.get(questId);
    if (quest) {
      for (const dependencyId of unique([
        ...quest.prerequisiteQuestIds,
        ...(metadataByQuestId.get(questId)?.implicitPrerequisiteQuestIds ?? []),
      ])) {
        visit(dependencyId);
      }
    }
    visiting.delete(questId);
    visited.add(questId);
  };
  for (const quest of document.quests) visit(quest.id);
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
