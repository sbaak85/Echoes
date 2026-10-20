// 牆面遮擋片段（場景 JSON 的 occluders，MapEditor「遮擋片段」工具建立）：
//   - 每段把前景圖的一塊多邊形切出來，記錄這段牆的牆腳線（baselineStart → baselineEnd）；
//   - 角色腳底在牆腳線南側（畫面下方）＝牆前：角色畫在這段牆之後（蓋住牆）；
//     在北側＝牆後：這段牆畫在角色之後（擋住角色）；
//   - 沒被任何片段切到的前景圖照舊永遠畫在最上層。
// 座標都是場景像素（與前景圖、角色腳底同一個座標系）。

export type OccluderPoint = { x: number; y: number };
export type OccluderBounds = { left: number; top: number; right: number; bottom: number };
export type SceneOccluder = {
  id: string;
  layerId: string;
  points: OccluderPoint[];
  baselineStart: OccluderPoint;
  baselineEnd: OccluderPoint;
  bounds: OccluderBounds;
};

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const point = (value: unknown): OccluderPoint | null => {
  const raw = object(value);
  return raw && finite(raw.x) && finite(raw.y) ? { x: raw.x, y: raw.y } : null;
};

/** 讀取場景的遮擋片段；格式錯誤、所屬圖層不存在或牆腳線退化的片段略過，不影響其他繪製 */
export function normalizeSceneOccluders(value: unknown, layerIds: ReadonlySet<string>): SceneOccluder[] {
  if (!Array.isArray(value)) return [];
  const result: SceneOccluder[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const raw = object(candidate);
    if (!raw || typeof raw.id !== "string" || !raw.id.trim() || ids.has(raw.id.trim())) continue;
    if (typeof raw.layerId !== "string" || !layerIds.has(raw.layerId)) continue;
    const points = Array.isArray(raw.points) ? raw.points.map(point) : [];
    const baselineStart = point(raw.baselineStart), baselineEnd = point(raw.baselineEnd);
    if (points.length < 3 || points.some(item => !item) || !baselineStart || !baselineEnd) continue;
    if (Math.hypot(baselineEnd.x - baselineStart.x, baselineEnd.y - baselineStart.y) < 1) continue;
    const valid = points as OccluderPoint[];
    ids.add(raw.id.trim());
    result.push({
      id: raw.id.trim(), layerId: raw.layerId, points: valid, baselineStart, baselineEnd,
      bounds: {
        left: Math.min(...valid.map(item => item.x)), right: Math.max(...valid.map(item => item.x)),
        top: Math.min(...valid.map(item => item.y)), bottom: Math.max(...valid.map(item => item.y)),
      },
    });
  }
  return result;
}

/**
 * 腳底是否在牆腳線南側（牆前）。牆腳線向兩端延伸成直線，取腳底 x 位置上的線高比較；
 * 幾乎垂直的線（畫面上很少見）退回用線段中點比較。
 */
export function isInFrontOfOccluder(foot: OccluderPoint, occluder: Pick<SceneOccluder, "baselineStart" | "baselineEnd">) {
  const a = occluder.baselineStart, b = occluder.baselineEnd;
  const dx = b.x - a.x;
  if (Math.abs(dx) < 1e-3) return foot.y > (a.y + b.y) / 2;
  return foot.y > a.y + (b.y - a.y) * (foot.x - a.x) / dx;
}

export type SceneDrawable = {
  id: string;
  kind: "player" | "npc" | "occluder";
  footX: number;
  footY: number;
  bounds: OccluderBounds;
  occluder?: SceneOccluder;
};

const overlaps = (a: OccluderBounds, b: OccluderBounds) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const depthOf = (item: SceneDrawable) => item.footY;
const tieRank = (item: SceneDrawable) => item.kind === "occluder" ? 0 : item.kind === "npc" ? 1 : 2;

/** a 是否必須畫在 b 之前（只在兩者畫面範圍重疊時才有意義） */
function drawsBefore(a: SceneDrawable, b: SceneDrawable) {
  if (a.kind === "occluder" && b.kind !== "occluder") return isInFrontOfOccluder({ x: b.footX, y: b.footY }, a.occluder!);
  if (b.kind === "occluder" && a.kind !== "occluder") return !isInFrontOfOccluder({ x: a.footX, y: a.footY }, b.occluder!);
  return (depthOf(a) - depthOf(b) || tieRank(a) - tieRank(b) || a.id.localeCompare(b.id)) < 0;
}

/**
 * 角色與牆面片段的繪製順序：畫面重疊的兩兩之間依上面的規則建立前後關係，再做拓樸排序；
 * 不重疊的物件依腳底（片段為牆腳線中點）y 由遠到近。沒有片段時結果與單純依腳底 y 排序相同。
 */
export function sortSceneDrawables<T extends SceneDrawable>(items: readonly T[]): T[] {
  const count = items.length;
  const edges: number[][] = items.map(() => []);
  const indegree = new Array<number>(count).fill(0);
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      if (!overlaps(items[i].bounds, items[j].bounds)) continue;
      if (drawsBefore(items[i], items[j])) { edges[i].push(j); indegree[j]++; }
      else { edges[j].push(i); indegree[i]++; }
    }
  }
  const compare = (a: number, b: number) => depthOf(items[a]) - depthOf(items[b]) ||
    tieRank(items[a]) - tieRank(items[b]) || items[a].id.localeCompare(items[b].id);
  const ready = items.map((_, index) => index).filter(index => indegree[index] === 0);
  const order: T[] = [];
  const placed = new Array<boolean>(count).fill(false);
  while (ready.length) {
    ready.sort(compare);
    const index = ready.shift()!;
    placed[index] = true;
    order.push(items[index]);
    for (const next of edges[index]) if (--indegree[next] === 0) ready.push(next);
  }
  // 理論上不會有循環；萬一有，剩下的依深度補上，避免漏畫
  if (order.length < count) {
    items.map((_, index) => index).filter(index => !placed[index]).sort(compare).forEach(index => order.push(items[index]));
  }
  return order;
}

/** 片段在排序中的代表深度：牆腳線中點 */
export function occluderFoot(occluder: SceneOccluder) {
  return { x: (occluder.baselineStart.x + occluder.baselineEnd.x) / 2, y: (occluder.baselineStart.y + occluder.baselineEnd.y) / 2 };
}
