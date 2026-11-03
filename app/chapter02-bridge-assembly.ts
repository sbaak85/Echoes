// 第二章緊急事件：黑畫面全黑時（紅色警戒旗標開啟），4 名 NPC 改站到駕駛艙的 TeleportPoint 上；
// section-14 播完後短暫黑畫面，再改站到逃生通道出口（shipinterior-interaction-024）旁。
// 位置與面向在 MapEditor 調整 ship_interior 的 TeleportPoint（bridge-*、escape-*）即可。
// 任務 6 OBJ_02（拾取迴路模組）完成當下，4 名 NPC 完全離場（hasChapter02CrewDeparted）。
import type { ChapterFlowDefinition } from "./chapter-flow-manager";

/** section-14 播完、黑畫面全黑時開啟（存檔中）：NPC 改站到逃生艙集合點 */
export const CHAPTER02_ESCAPE_ASSEMBLY_FLAG = "chapter02-escape-assembly";

export const CHAPTER02_BRIDGE_ASSEMBLY_POINTS: Readonly<Record<string, string>> = {
  "npc-captain": "bridge-captain",
  "npc-ian": "bridge-ian",
  "npc-rena": "bridge-rena",
  "npc-owen": "bridge-owen",
};

export const CHAPTER02_ESCAPE_ASSEMBLY_POINTS: Readonly<Record<string, string>> = {
  "npc-captain": "escape-captain",
  "npc-ian": "escape-ian",
  "npc-rena": "escape-rena",
  "npc-owen": "escape-owen",
};

/** 黑畫面淡入 0.25 秒 → 全黑時傳送並停 0.15 秒 → 淡出 0.3 秒 */
export const CHAPTER02_ESCAPE_ASSEMBLY_FLOW: ChapterFlowDefinition = {
  id: "chapter02-escape-assembly",
  chapter: 2,
  actions: [
    { type: "lockInput" },
    { type: "fadeToBlack", durationMs: 250 },
    { type: "setStoryFlag", flagId: CHAPTER02_ESCAPE_ASSEMBLY_FLAG, value: true },
    { type: "wait", durationMs: 150 },
    { type: "fadeFromBlack", durationMs: 300 },
    { type: "unlockInput" },
  ],
  skipActions: [{ type: "setStoryFlag", flagId: CHAPTER02_ESCAPE_ASSEMBLY_FLAG, value: true }],
};

/** 拾取迴路模組、OBJ_02 完成的當下，4 名 NPC 從 ship_interior 完全離場（之後不再出現） */
export const CHAPTER02_CREW_DEPARTURE_QUEST_ID = "QUEST_CH02_MAIN_006";
export const CHAPTER02_CREW_DEPARTURE_OBJECTIVE_ID = "QUEST_CH02_MAIN_006_OBJ_02";
export const CHAPTER02_CREW_DEPARTURE_NEXT_STAGE_ID = "QUEST_CH02_MAIN_006_STAGE_02";

type CrewDepartureQuery = {
  hasObjectiveReachedState(questId: string, objectiveId: string, state: "completed"): boolean;
  hasObjectiveFailed(questId: string, objectiveId: string): boolean;
  hasQuestReachedStage(questId: string, stageId: string): boolean;
};

/**
 * OBJ_02 完成後，section-16 播完 4.5 秒會把它改成失敗（清掉已完成），
 * 接著任務進到 STAGE_02，所以這三種狀態都算已離場。
 */
export function hasChapter02CrewDeparted(npcId: string, quest: CrewDepartureQuery): boolean {
  if (!(npcId in CHAPTER02_BRIDGE_ASSEMBLY_POINTS)) return false;
  const questId = CHAPTER02_CREW_DEPARTURE_QUEST_ID, objectiveId = CHAPTER02_CREW_DEPARTURE_OBJECTIVE_ID;
  return quest.hasObjectiveReachedState(questId, objectiveId, "completed") ||
    quest.hasObjectiveFailed(questId, objectiveId) ||
    quest.hasQuestReachedStage(questId, CHAPTER02_CREW_DEPARTURE_NEXT_STAGE_ID);
}

type Placement = { x: number; y: number; facing: string };

/** 集合生效時回傳 NPC 應站的位置與面向；找不到對應的 TeleportPoint 就維持原位（回傳 null）。 */
export function resolveBridgeAssemblyPlacement(
  npcId: string,
  teleportPoints: readonly { id: string; x: number; y: number; facing?: string }[],
  escapeAssembly = false,
): Placement | null {
  const pointId = (escapeAssembly ? CHAPTER02_ESCAPE_ASSEMBLY_POINTS : CHAPTER02_BRIDGE_ASSEMBLY_POINTS)[npcId];
  if (!pointId) return null;
  const point = teleportPoints.find((candidate) => candidate.id.toLocaleLowerCase() === pointId);
  return point ? { x: point.x, y: point.y, facing: point.facing ?? "S" } : null;
}
