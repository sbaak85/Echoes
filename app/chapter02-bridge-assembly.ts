// 第二章緊急事件：黑畫面全黑時（紅色警戒旗標開啟），4 名 NPC 改站到駕駛艙的 TeleportPoint 上。
// 位置與面向在 MapEditor 調整 ship_interior 的 TeleportPoint（bridge-*）即可。

export const CHAPTER02_BRIDGE_ASSEMBLY_POINTS: Readonly<Record<string, string>> = {
  "npc-captain": "bridge-captain",
  "npc-ian": "bridge-ian",
  "npc-rena": "bridge-rena",
  "npc-owen": "bridge-owen",
};

type Placement = { x: number; y: number; facing: string };

/** 集合生效時回傳 NPC 應站的位置與面向；找不到對應的 TeleportPoint 就維持原位（回傳 null）。 */
export function resolveBridgeAssemblyPlacement(
  npcId: string,
  teleportPoints: readonly { id: string; x: number; y: number; facing?: string }[],
): Placement | null {
  const pointId = CHAPTER02_BRIDGE_ASSEMBLY_POINTS[npcId];
  if (!pointId) return null;
  const point = teleportPoints.find((candidate) => candidate.id.toLocaleLowerCase() === pointId);
  return point ? { x: point.x, y: point.y, facing: point.facing ?? "S" } : null;
}
