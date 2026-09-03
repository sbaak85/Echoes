import type { ChapterFlowDefinition } from "./chapter-flow-manager";

export const CHAPTER04_START_FLOW_ID = "chapter04-start-flow";
export const CHAPTER04_START_DIALOGUE_ID = "chapter04-start";
export const CHAPTER04_START_OBJECTIVE_IDS = [
  "QUEST_CH04_MAIN_001_OBJ_02",
  "QUEST_CH04_MAIN_001_OBJ_03",
] as const;

const activateFollowUpObjectives = CHAPTER04_START_OBJECTIVE_IDS.map(
  (objectiveId) => ({ type: "activateObjective" as const, objectiveId }),
);

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

export const QUEST_STAGE_EVENT_FLOWS: Readonly<
  Record<string, ChapterFlowDefinition>
> = {
  [CHAPTER04_START_FLOW.id]: CHAPTER04_START_FLOW,
};
