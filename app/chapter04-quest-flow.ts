import type { ChapterFlowDefinition } from "./chapter-flow-manager";
import type { QuestObjectiveCompletionRule } from "./quest-runtime-manager";

export const CHAPTER04_START_FLOW_ID = "chapter04-start-flow";
export const CHAPTER04_START_DIALOGUE_ID = "chapter04-start";
export const CHAPTER04_SIGNAL_SAMPLES_FLOW_ID =
  "chapter04-signal-samples-follow-up";
export const CHAPTER04_SIGNAL_SAMPLES_DIALOGUE_ID = "chapter04-section-4";
export const CHAPTER04_SIGNAL_SAMPLES_NEXT_OBJECTIVE_ID =
  "QUEST_CH04_MAIN_001_OBJ_05";
export const CHAPTER04_START_OBJECTIVE_IDS = [
  "QUEST_CH04_MAIN_001_OBJ_02",
  "QUEST_CH04_MAIN_001_OBJ_03",
] as const;

const activateFollowUpObjectives = CHAPTER04_START_OBJECTIVE_IDS.map(
  (objectiveId) => ({ type: "activateObjective" as const, objectiveId }),
);

export const QUEST_OBJECTIVE_COMPLETION_RULES: readonly QuestObjectiveCompletionRule[] = [
  {
    id: "chapter04-preparation-complete",
    questId: "QUEST_CH04_MAIN_001",
    objectiveIds: CHAPTER04_START_OBJECTIVE_IDS,
    delaySeconds: 1.5,
    eventFlowId: "chapter04-section-1",
  },
  {
    id: "chapter04-signal-samples-complete",
    questId: "QUEST_CH04_MAIN_001",
    objectiveIds: ["QUEST_CH04_MAIN_001_OBJ_04"],
    delaySeconds: 1.25,
    eventFlowId: CHAPTER04_SIGNAL_SAMPLES_FLOW_ID,
  },
];

export const CHAPTER04_START_FLOW: ChapterFlowDefinition = {
  id: CHAPTER04_START_FLOW_ID,
  chapter: 4,
  once: true,
  actions: [
    { type: "wait", durationMs: 3000 },
    { type: "playDialogue", dialogueId: CHAPTER04_START_DIALOGUE_ID },
    { type: "wait", durationMs: 500 },
    ...activateFollowUpObjectives,
  ],
  skipActions: [
    { type: "wait", durationMs: 500 },
    ...activateFollowUpObjectives,
  ],
};

export const CHAPTER04_SIGNAL_SAMPLES_FLOW: ChapterFlowDefinition = {
  id: CHAPTER04_SIGNAL_SAMPLES_FLOW_ID,
  chapter: 4,
  once: true,
  actions: [
    {
      type: "playDialogue",
      dialogueId: CHAPTER04_SIGNAL_SAMPLES_DIALOGUE_ID,
    },
    {
      type: "activateObjective",
      objectiveId: CHAPTER04_SIGNAL_SAMPLES_NEXT_OBJECTIVE_ID,
    },
  ],
  skipActions: [
    {
      type: "activateObjective",
      objectiveId: CHAPTER04_SIGNAL_SAMPLES_NEXT_OBJECTIVE_ID,
    },
  ],
};

export const QUEST_STAGE_EVENT_FLOWS: Readonly<
  Record<string, ChapterFlowDefinition>
> = {
  [CHAPTER04_START_FLOW.id]: CHAPTER04_START_FLOW,
  [CHAPTER04_SIGNAL_SAMPLES_FLOW.id]: CHAPTER04_SIGNAL_SAMPLES_FLOW,
};
