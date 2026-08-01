export type MiniMapPoint = { x: number; y: number };

export type MiniMapCollider =
  | { kind: "polygon"; points: readonly MiniMapPoint[] }
  | { kind: "circle"; x: number; y: number; radius: number };

export type MiniMapContourSegment = readonly [MiniMapPoint, MiniMapPoint];

export type MiniMapGeometry = {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  mask: Uint8Array;
  contours: readonly MiniMapContourSegment[];
};

function pointInPolygon(point: MiniMapPoint, polygon: readonly MiniMapPoint[]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isInsideCollider(point: MiniMapPoint, collider: MiniMapCollider) {
  if (collider.kind === "circle") {
    return Math.hypot(point.x - collider.x, point.y - collider.y) <= collider.radius;
  }
  return collider.points.length >= 3 && pointInPolygon(point, collider.points);
}

function isWalkableSample(
  point: MiniMapPoint,
  navRegions: readonly (readonly MiniMapPoint[])[],
  colliders: readonly MiniMapCollider[],
) {
  return (
    navRegions.some(
      (polygon) => polygon.length >= 3 && pointInPolygon(point, polygon),
    ) && !colliders.some((collider) => isInsideCollider(point, collider))
  );
}

function addMarchingSquareSegments(
  contours: MiniMapContourSegment[],
  maskCase: number,
  x: number,
  y: number,
) {
  if (maskCase === 0 || maskCase === 15) return;
  const top = { x: x + 0.5, y };
  const right = { x: x + 1, y: y + 0.5 };
  const bottom = { x: x + 0.5, y: y + 1 };
  const left = { x, y: y + 0.5 };
  const add = (start: MiniMapPoint, end: MiniMapPoint) => {
    contours.push([start, end]);
  };

  switch (maskCase) {
    case 1: add(left, top); break;
    case 2: add(top, right); break;
    case 3: add(left, right); break;
    case 4: add(right, bottom); break;
    case 5:
      add(left, top);
      add(right, bottom);
      break;
    case 6: add(top, bottom); break;
    case 7: add(left, bottom); break;
    case 8: add(bottom, left); break;
    case 9: add(top, bottom); break;
    case 10:
      add(top, right);
      add(bottom, left);
      break;
    case 11: add(right, bottom); break;
    case 12: add(left, right); break;
    case 13: add(top, right); break;
    case 14: add(left, top); break;
  }
}

export function buildMiniMapGeometry(
  world: { width: number; height: number },
  navRegions: readonly (readonly MiniMapPoint[])[],
  colliders: readonly MiniMapCollider[],
  maximumResolution = 192,
): MiniMapGeometry {
  const longestSide = Math.max(1, world.width, world.height);
  const resolution = Math.max(32, Math.floor(maximumResolution));
  const columns = Math.max(1, Math.round((world.width / longestSide) * resolution));
  const rows = Math.max(1, Math.round((world.height / longestSide) * resolution));
  const cellWidth = world.width / columns;
  const cellHeight = world.height / rows;
  const mask = new Uint8Array(columns * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      mask[row * columns + column] = isWalkableSample(
        {
          x: (column + 0.5) * cellWidth,
          y: (row + 0.5) * cellHeight,
        },
        navRegions,
        colliders,
      ) ? 1 : 0;
    }
  }

  const cornerSamples = new Uint8Array((columns + 1) * (rows + 1));
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      cornerSamples[row * (columns + 1) + column] = isWalkableSample(
        {
          x: column * cellWidth,
          y: row * cellHeight,
        },
        navRegions,
        colliders,
      ) ? 1 : 0;
    }
  }

  const contours: MiniMapContourSegment[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const rowWidth = columns + 1;
      const topLeft = cornerSamples[row * rowWidth + column];
      const topRight = cornerSamples[row * rowWidth + column + 1];
      const bottomRight = cornerSamples[(row + 1) * rowWidth + column + 1];
      const bottomLeft = cornerSamples[(row + 1) * rowWidth + column];
      const maskCase = topLeft | (topRight << 1) | (bottomRight << 2) | (bottomLeft << 3);
      addMarchingSquareSegments(contours, maskCase, column, row);
    }
  }

  return { columns, rows, cellWidth, cellHeight, mask, contours };
}

export function isMiniMapCellWalkable(
  geometry: Pick<MiniMapGeometry, "columns" | "rows" | "mask">,
  column: number,
  row: number,
) {
  if (
    !Number.isInteger(column) ||
    !Number.isInteger(row) ||
    column < 0 ||
    row < 0 ||
    column >= geometry.columns ||
    row >= geometry.rows
  ) {
    return false;
  }
  return geometry.mask[row * geometry.columns + column] === 1;
}
