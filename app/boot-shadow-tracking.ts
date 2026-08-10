export type BootOpaqueColumn = {
  x: number;
  bottomY: number;
};

export type BootShadowAnchor = {
  xRatio: number;
  yRatio: number;
  contact: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function weightedCenter(columns: BootOpaqueColumn[], maximumBottom: number) {
  let totalWeight = 0;
  let totalX = 0;
  columns.forEach((column) => {
    const weight = 1 / (1 + Math.max(0, maximumBottom - column.bottomY) * 0.04);
    totalWeight += weight;
    totalX += column.x * weight;
  });
  return totalWeight > 0 ? totalX / totalWeight : columns[0]?.x ?? 0;
}

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

/**
 * 將每個 X 欄位最下方的角色像素分成左右兩隻靴子。
 * 這個計算只在素材載入時執行，遊戲每幀只讀取完成的座標。
 */
export function trackBootShadowAnchors(
  columns: BootOpaqueColumn[],
  width: number,
  height: number,
): [BootShadowAnchor, BootShadowAnchor] | null {
  if (columns.length < 6 || width <= 0 || height <= 0) return null;
  const maximumBottom = Math.max(...columns.map((column) => column.bottomY));
  const verticalWindow = height * 0.26;
  const candidates = columns
    .filter((column) => column.bottomY >= maximumBottom - verticalWindow)
    .sort((left, right) => left.x - right.x);
  if (candidates.length < 6) return null;

  let leftCenter = candidates[Math.floor(candidates.length * 0.25)].x;
  let rightCenter = candidates[Math.floor(candidates.length * 0.75)].x;
  let left: BootOpaqueColumn[] = [];
  let right: BootOpaqueColumn[] = [];

  for (let iteration = 0; iteration < 8; iteration += 1) {
    left = [];
    right = [];
    candidates.forEach((column) => {
      const target =
        Math.abs(column.x - leftCenter) <= Math.abs(column.x - rightCenter)
          ? left
          : right;
      target.push(column);
    });
    if (left.length === 0 || right.length === 0) return null;
    leftCenter = weightedCenter(left, maximumBottom);
    rightCenter = weightedCenter(right, maximumBottom);
  }

  const createAnchor = (group: BootOpaqueColumn[]): BootShadowAnchor => {
    const bottomY = percentile(
      group.map((column) => column.bottomY),
      0.82,
    );
    return {
      xRatio: clamp01(weightedCenter(group, maximumBottom) / width),
      yRatio: clamp01((bottomY + 1) / height),
      contact: Math.max(
        0.18,
        clamp01(1 - (maximumBottom - bottomY) / (height * 0.15)),
      ),
    };
  };

  const anchors = [createAnchor(left), createAnchor(right)] as [
    BootShadowAnchor,
    BootShadowAnchor,
  ];
  anchors.sort((first, second) => first.xRatio - second.xRatio);
  return anchors;
}
