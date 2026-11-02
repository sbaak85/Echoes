// 第二章緊急事件：黑畫面全黑時（紅色警戒旗標開啟），4 名 NPC 改站到駕駛艙的 TeleportPoint 上；
// section-14 播完後短暫黑畫面，再改站到逃生通道出口（shipinterior-interaction-024）旁。
// 位置與面向在 MapEditor 調整 ship_interior 的 TeleportPoint（bridge-*、escape-*）即可。
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
