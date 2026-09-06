import type { QuestRuntimeManager } from "./quest-runtime-manager.ts";

/** Only the pending drinking tutorial may bypass a recovery item's full-meter gate. */
export function allowsFullRecoveryForQuest(
  itemId: string,
  manager: Pick<QuestRuntimeManager, "isObjectiveInProgress"> | null,
) {
  return itemId === "R0004" && Boolean(manager?.isObjectiveInProgress(
    "QUEST_CH03_MAIN_002",
    "QUEST_CH03_MAIN_002_OBJ_02",
  ));
}
