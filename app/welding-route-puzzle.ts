export type WeldingPoint = {
  x: number;
  y: number;
};

export type WeldingRouteNode = WeldingPoint & {
  id: string;
};

export type WeldingRouteEdge = {
  id: string;
  from: string;
  to: string;
  start: WeldingPoint;
  end: WeldingPoint;
  sourceRouteIds: string[];
};

export type WeldingRouteGraph = {
  nodes: WeldingRouteNode[];
  edges: WeldingRouteEdge[];
  startNodeIds: string[];
  endNodeIds: string[];
};

export type WeldingRouteSession = {
  graph: WeldingRouteGraph;
  edgeIds: string[];
  edges: WeldingRouteEdge[];
  start: WeldingPoint;
  end: WeldingPoint;
};

export type WeldingTrackProjection = {
  edge: WeldingRouteEdge;
  point: WeldingPoint;
  t: number;
  distance: number;
};

export type WeldingPathSample = {
  edgeId: string;
  point: WeldingPoint;
  t: number;
  segmentId: number | null;
};

export type WeldingCandidateProgress = {
  trailId: number;
  progress: number;
  pendingAbandonment: boolean;
  fading: boolean;
};

export type WeldingLeadershipResolution = {
  trails: WeldingCandidateProgress[];
  leaderTrailId: number;
  fadeTrailId: number | null;
};

export type WeldingBackwardHysteresisResolution = {
  backwardConfirmed: boolean;
  shouldCommit: boolean;
};

type SourceRoute = {
  id: string;
  points: WeldingPoint[];
};

const EPSILON = 0.001;
const NODE_PRECISION = 1000;

export const WELDING_ROUTE_VIEWBOX = {
  width: 441,
  height: 320,
};

export const resolveWeldingBackwardHysteresis = ({
  committedPoint,
  candidatePoint,
  backwardConfirmed,
  confirmationDistance,
  epsilon = 0.5,
}: {
  committedPoint: WeldingPoint;
  candidatePoint: WeldingPoint;
  backwardConfirmed: boolean;
  confirmationDistance: number;
  epsilon?: number;
}): WeldingBackwardHysteresisResolution => {
  const deltaX = candidatePoint.x - committedPoint.x;

  if (deltaX > epsilon) {
    return { backwardConfirmed: false, shouldCommit: true };
  }
  if (backwardConfirmed || deltaX >= -epsilon) {
    return { backwardConfirmed, shouldCommit: true };
  }

  const confirmed = -deltaX >= confirmationDistance;
  return {
    backwardConfirmed: confirmed,
    shouldCommit: confirmed,
  };
};

// 由設計稿的五條彩色辨識線還原；遊戲中會統一顯示為青藍色。
export const WELDING_SOURCE_ROUTES: SourceRoute[] = [
  {
    id: "route-a",
    points: [
      { x: 20, y: 251 }, { x: 84, y: 251 }, { x: 118, y: 142 },
      { x: 161, y: 142 }, { x: 180, y: 90 }, { x: 225, y: 90 },
      { x: 255, y: 187 }, { x: 328, y: 187 }, { x: 335, y: 208 },
      { x: 376, y: 208 }, { x: 400, y: 135 }, { x: 421, y: 135 },
    ],
  },
  {
    id: "route-b",
    points: [
      { x: 20, y: 169 }, { x: 52, y: 169 }, { x: 64, y: 207 },
      { x: 167, y: 207 }, { x: 190, y: 136 }, { x: 266, y: 136 },
      { x: 276, y: 115 }, { x: 340, y: 115 }, { x: 362, y: 187 },
      { x: 421, y: 187 },
    ],
  },
  {
    id: "route-c",
    points: [
      { x: 20, y: 199 }, { x: 49, y: 282 }, { x: 112, y: 282 },
      { x: 131, y: 239 }, { x: 195, y: 239 }, { x: 225, y: 166 },
      { x: 308, y: 166 }, { x: 322, y: 143 }, { x: 368, y: 143 },
      { x: 381, y: 108 }, { x: 421, y: 108 },
    ],
  },
  {
    id: "route-d",
    points: [
      { x: 20, y: 113 }, { x: 65, y: 113 }, { x: 84, y: 174 },
      { x: 133, y: 174 }, { x: 168, y: 277 }, { x: 226, y: 277 },
      { x: 243, y: 229 }, { x: 367, y: 229 }, { x: 382, y: 269 },
      { x: 421, y: 269 },
    ],
  },
  {
    id: "route-e",
    points: [
      { x: 255, y: 187 }, { x: 280, y: 251 }, { x: 322, y: 251 },
      { x: 335, y: 208 },
    ],
  },
];

const pointKey = (point: WeldingPoint) =>
  `${Math.round(point.x * NODE_PRECISION)}:${Math.round(point.y * NODE_PRECISION)}`;

const distanceSquared = (a: WeldingPoint, b: WeldingPoint) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export const getWeldingPathProgress = (samples: WeldingPathSample[]) => {
  let progress = 0;
  for (let index = 1; index < samples.length; index += 1) {
    progress += Math.sqrt(distanceSquared(
      samples[index - 1].point,
      samples[index].point,
    ));
  }
  return progress;
};

export const resolveWeldingCandidateLeadership = ({
  trails,
  leaderTrailId,
  activeTrailId,
  progressEpsilon = EPSILON,
}: {
  trails: WeldingCandidateProgress[];
  leaderTrailId: number | null;
  activeTrailId: number;
  progressEpsilon?: number;
}): WeldingLeadershipResolution => {
  const nextTrails = trails.map((trail) => ({ ...trail }));
  const activeTrail = nextTrails.find(
    (trail) => trail.trailId === activeTrailId && !trail.fading,
  );
  if (!activeTrail) {
    throw new Error(`Unknown active welding trail ${activeTrailId}.`);
  }
  const leaderTrail = nextTrails.find(
    (trail) => trail.trailId === leaderTrailId && !trail.fading,
  );
  if (!leaderTrail) {
    activeTrail.pendingAbandonment = false;
    return {
      trails: nextTrails,
      leaderTrailId: activeTrail.trailId,
      fadeTrailId: null,
    };
  }
  if (leaderTrail.trailId === activeTrail.trailId) {
    // The retained route may already be the leader when the player starts a
    // shorter alternate weld, releases it, and then resumes the retained
    // route. In that case there is no second "lead change" to trigger the old
    // abandonment path. Once the resumed leader advances again and remains
    // ahead, the longest shorter candidate is confirmed as the abandoned
    // stroke and can fade out.
    const abandonedTrail = nextTrails
      .filter(
        (trail) =>
          trail.trailId !== activeTrail.trailId &&
          !trail.fading &&
          trail.progress + progressEpsilon < activeTrail.progress,
      )
      .sort((left, right) => right.progress - left.progress)[0];

    if (abandonedTrail) {
      abandonedTrail.fading = true;
      abandonedTrail.pendingAbandonment = false;
      activeTrail.pendingAbandonment = false;
      return {
        trails: nextTrails,
        leaderTrailId: activeTrail.trailId,
        fadeTrailId: abandonedTrail.trailId,
      };
    }

    return {
      trails: nextTrails,
      leaderTrailId: leaderTrail.trailId,
      fadeTrailId: null,
    };
  }

  if (activeTrail.progress <= leaderTrail.progress + progressEpsilon) {
    return {
      trails: nextTrails,
      leaderTrailId: leaderTrail.trailId,
      fadeTrailId: null,
    };
  }

  if (activeTrail.pendingAbandonment) {
    leaderTrail.fading = true;
    activeTrail.pendingAbandonment = false;
    return {
      trails: nextTrails,
      leaderTrailId: activeTrail.trailId,
      fadeTrailId: leaderTrail.trailId,
    };
  }

  leaderTrail.pendingAbandonment = true;
  return {
    trails: nextTrails,
    leaderTrailId: activeTrail.trailId,
    fadeTrailId: null,
  };
};

const cross = (a: WeldingPoint, b: WeldingPoint) => a.x * b.y - a.y * b.x;

const subtract = (a: WeldingPoint, b: WeldingPoint): WeldingPoint => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

const addScaled = (
  point: WeldingPoint,
  vector: WeldingPoint,
  amount: number,
): WeldingPoint => ({
  x: point.x + vector.x * amount,
  y: point.y + vector.y * amount,
});

const segmentIntersection = (
  a: WeldingPoint,
  b: WeldingPoint,
  c: WeldingPoint,
  d: WeldingPoint,
): { point: WeldingPoint; firstT: number; secondT: number } | null => {
  const r = subtract(b, a);
  const s = subtract(d, c);
  const denominator = cross(r, s);
  if (Math.abs(denominator) <= EPSILON) return null;
  const offset = subtract(c, a);
  const firstT = cross(offset, s) / denominator;
  const secondT = cross(offset, r) / denominator;
  if (
    firstT < -EPSILON || firstT > 1 + EPSILON ||
    secondT < -EPSILON || secondT > 1 + EPSILON
  ) {
    return null;
  }
  return {
    point: addScaled(a, r, Math.max(0, Math.min(1, firstT))),
    firstT: Math.max(0, Math.min(1, firstT)),
    secondT: Math.max(0, Math.min(1, secondT)),
  };
};

type RouteSegment = {
  routeId: string;
  segmentIndex: number;
  start: WeldingPoint;
  end: WeldingPoint;
  cuts: Array<{ t: number; point: WeldingPoint }>;
};

const createSegments = (): RouteSegment[] =>
  WELDING_SOURCE_ROUTES.flatMap((route) =>
    route.points.slice(0, -1).map((start, segmentIndex) => ({
      routeId: route.id,
      segmentIndex,
      start,
      end: route.points[segmentIndex + 1],
      cuts: [
        { t: 0, point: start },
        { t: 1, point: route.points[segmentIndex + 1] },
      ],
    })),
  );

export const createWeldingRouteGraph = (): WeldingRouteGraph => {
  const segments = createSegments();
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (
        first.routeId === second.routeId &&
        Math.abs(first.segmentIndex - second.segmentIndex) <= 1
      ) {
        continue;
      }
      const intersection = segmentIntersection(
        first.start,
        first.end,
        second.start,
        second.end,
      );
      if (!intersection) continue;
      first.cuts.push({ t: intersection.firstT, point: intersection.point });
      second.cuts.push({ t: intersection.secondT, point: intersection.point });
    }
  }

  const nodesByKey = new Map<string, WeldingRouteNode>();
  const edgeSources = new Map<string, Set<string>>();
  const rawEdges = new Map<string, { start: WeldingPoint; end: WeldingPoint }>();
  const getNode = (point: WeldingPoint) => {
    const key = pointKey(point);
    const existing = nodesByKey.get(key);
    if (existing) return existing;
    const node = { id: `node-${key}`, x: point.x, y: point.y };
    nodesByKey.set(key, node);
    return node;
  };

  for (const segment of segments) {
    const sortedCuts = [...segment.cuts]
      .sort((a, b) => a.t - b.t)
      .filter((cut, index, cuts) => index === 0 || Math.abs(cut.t - cuts[index - 1].t) > EPSILON);
    for (let cutIndex = 0; cutIndex < sortedCuts.length - 1; cutIndex += 1) {
      let start = sortedCuts[cutIndex].point;
      let end = sortedCuts[cutIndex + 1].point;
      if (distanceSquared(start, end) <= EPSILON) continue;
      if (start.x > end.x || (Math.abs(start.x - end.x) <= EPSILON && start.y > end.y)) {
        [start, end] = [end, start];
      }
      const from = getNode(start);
      const to = getNode(end);
      const edgeKey = `${from.id}>${to.id}`;
      rawEdges.set(edgeKey, { start, end });
      const sources = edgeSources.get(edgeKey) ?? new Set<string>();
      sources.add(segment.routeId);
      edgeSources.set(edgeKey, sources);
    }
  }

  const edges = [...rawEdges.entries()].map(([edgeKey, points], index) => {
    const [from, to] = edgeKey.split(">");
    return {
      id: `edge-${index}`,
      from,
      to,
      start: points.start,
      end: points.end,
      sourceRouteIds: [...(edgeSources.get(edgeKey) ?? [])],
    };
  });
  const nodes = [...nodesByKey.values()];
  const minimumX = Math.min(...nodes.map((node) => node.x));
  const maximumX = Math.max(...nodes.map((node) => node.x));
  return {
    nodes,
    edges,
    startNodeIds: nodes.filter((node) => Math.abs(node.x - minimumX) <= EPSILON).map((node) => node.id),
    endNodeIds: nodes.filter((node) => Math.abs(node.x - maximumX) <= EPSILON).map((node) => node.id),
  };
};

const canReachEnd = (graph: WeldingRouteGraph) => {
  const reachable = new Set(graph.endNodeIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (reachable.has(edge.to) && !reachable.has(edge.from)) {
        reachable.add(edge.from);
        changed = true;
      }
    }
  }
  return reachable;
};

const pickRandom = <T,>(values: T[], random: () => number): T =>
  values[Math.min(values.length - 1, Math.floor(Math.max(0, random()) * values.length))];

export const createRandomWeldingRoute = (
  random: () => number = Math.random,
): WeldingRouteSession => {
  const graph = createWeldingRouteGraph();
  const reachable = canReachEnd(graph);
  const starts = graph.startNodeIds.filter((nodeId) => reachable.has(nodeId));
  if (starts.length === 0) throw new Error("焊接路線沒有可抵達終點的起點。");
  let currentNodeId = pickRandom(starts, random);
  const routeEdges: WeldingRouteEdge[] = [];
  const safetyLimit = graph.edges.length + 1;
  while (!graph.endNodeIds.includes(currentNodeId)) {
    const outgoing = graph.edges.filter(
      (edge) => edge.from === currentNodeId && reachable.has(edge.to),
    );
    if (outgoing.length === 0) throw new Error("焊接路線在抵達終點前中斷。");
    const nextEdge = pickRandom(outgoing, random);
    routeEdges.push(nextEdge);
    currentNodeId = nextEdge.to;
    if (routeEdges.length > safetyLimit) throw new Error("焊接路線圖包含循環。");
  }
  return {
    graph,
    edgeIds: routeEdges.map((edge) => edge.id),
    edges: routeEdges,
    start: routeEdges[0].start,
    end: routeEdges[routeEdges.length - 1].end,
  };
};

export const projectPointToWeldingEdge = (
  point: WeldingPoint,
  edge: Pick<WeldingRouteEdge, "start" | "end">,
) => {
  const vector = subtract(edge.end, edge.start);
  const lengthSquared = vector.x ** 2 + vector.y ** 2;
  const rawT = lengthSquared <= EPSILON
    ? 0
    : ((point.x - edge.start.x) * vector.x + (point.y - edge.start.y) * vector.y) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const projected = addScaled(edge.start, vector, t);
  return {
    point: projected,
    t,
    distance: Math.sqrt(distanceSquared(point, projected)),
  };
};

export const getWeldingEdgeLength = (
  edge: Pick<WeldingRouteEdge, "start" | "end">,
) => Math.sqrt(distanceSquared(edge.start, edge.end));

export const getNearestWeldingTrackProjection = (
  point: WeldingPoint,
  edges: WeldingRouteEdge[],
): WeldingTrackProjection | null => {
  let nearest: WeldingTrackProjection | null = null;
  for (const edge of edges) {
    const projection = projectPointToWeldingEdge(point, edge);
    if (!nearest || projection.distance < nearest.distance) {
      nearest = { edge, ...projection };
    }
  }
  return nearest;
};

export const selectWeldingPointerTrack = ({
  point,
  graphEdges,
  activeEdge,
  trackTolerance,
  switchBias = 2,
}: {
  point: WeldingPoint;
  graphEdges: WeldingRouteEdge[];
  activeEdge: WeldingRouteEdge | null;
  trackTolerance: number;
  switchBias?: number;
}): WeldingTrackProjection | null => {
  const nearest = getNearestWeldingTrackProjection(point, graphEdges);
  if (!nearest || nearest.distance > trackTolerance) return null;
  if (!activeEdge) return nearest;

  const activeProjection = projectPointToWeldingEdge(point, activeEdge);
  if (
    activeProjection.distance <= trackTolerance &&
    activeProjection.distance <= nearest.distance + switchBias
  ) {
    return { edge: activeEdge, ...activeProjection };
  }
  return nearest;
};

export const getWeldingSharedTrackPoint = (
  previousEdge: WeldingRouteEdge,
  nextEdge: WeldingRouteEdge,
): WeldingPoint | null => {
  if (previousEdge.from === nextEdge.from || previousEdge.from === nextEdge.to) {
    return previousEdge.start;
  }
  if (previousEdge.to === nextEdge.from || previousEdge.to === nextEdge.to) {
    return previousEdge.end;
  }
  return null;
};

export const findWeldingPathRejoinIndex = ({
  samples,
  next,
  minimumTailDistance,
  pointTolerance,
}: {
  samples: WeldingPathSample[];
  next: Pick<WeldingPathSample, "edgeId" | "point" | "t">;
  minimumTailDistance: number;
  pointTolerance: number;
}): number => {
  let tailDistance = 0;
  const currentTail = samples.at(-1);
  if (!currentTail) return -1;
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    tailDistance += Math.sqrt(distanceSquared(
      samples[index].point,
      samples[index + 1].point,
    ));
    if (tailDistance < minimumTailDistance) continue;
    if (samples[index].edgeId !== next.edgeId) continue;
    const previousDistance = Math.sqrt(distanceSquared(
      samples[index].point,
      currentTail.point,
    ));
    const nextDistance = Math.sqrt(distanceSquared(
      samples[index].point,
      next.point,
    ));
    const isActuallyReturning = nextDistance + 0.1 < previousDistance;
    if (isActuallyReturning && nextDistance <= pointTolerance) {
      return index;
    }
  }
  return -1;
};

export const selectWeldingMagneticTrack = ({
  point,
  graphEdges,
  activeEdge,
  activeProgress,
  startSnapDistance,
  trackTolerance,
  junctionRadius,
  switchProgress,
  switchTEpsilon,
}: {
  point: WeldingPoint;
  graphEdges: WeldingRouteEdge[];
  activeEdge: WeldingRouteEdge | null;
  activeProgress: number;
  startSnapDistance: number;
  trackTolerance: number;
  junctionRadius: number;
  switchProgress: number;
  switchTEpsilon: number;
}): WeldingTrackProjection | null => {
  if (!activeEdge) {
    const nearest = getNearestWeldingTrackProjection(point, graphEdges);
    return nearest && nearest.distance <= startSnapDistance ? nearest : null;
  }

  const currentProjection = projectPointToWeldingEdge(point, activeEdge);
  const currentTrack: WeldingTrackProjection = {
    edge: activeEdge,
    ...currentProjection,
  };
  const nearbyJunctions = [
    {
      nodeId: activeEdge.from,
      atStart: true,
      isNearby:
        activeProgress <= 1 - switchProgress ||
        Math.sqrt(distanceSquared(point, activeEdge.start)) <= junctionRadius,
    },
    {
      nodeId: activeEdge.to,
      atStart: false,
      isNearby:
        activeProgress >= switchProgress ||
        Math.sqrt(distanceSquared(point, activeEdge.end)) <= junctionRadius,
    },
  ].filter((junction) => junction.isNearby);

  const connected = nearbyJunctions
    .flatMap((junction) => graphEdges
      .filter((edge) =>
        edge.id !== activeEdge.id &&
        (edge.from === junction.nodeId || edge.to === junction.nodeId),
      )
      .map((edge) => ({
        junction,
        edge,
        ...projectPointToWeldingEdge(point, edge),
      })))
    .filter((candidate) => {
      const leavesFromStart = candidate.edge.from === candidate.junction.nodeId;
      const movesAwayFromJunction = leavesFromStart
        ? candidate.t > switchTEpsilon
        : candidate.t < 1 - switchTEpsilon;
      return movesAwayFromJunction && candidate.distance <= trackTolerance;
    })
    .sort((left, right) => left.distance - right.distance)[0];

  if (connected) {
    const activeAtJunction = connected.junction.atStart
      ? activeProgress <= 0.06
      : activeProgress >= 0.94;
    if (activeAtJunction || connected.distance + 2 < currentTrack.distance) {
      return {
        edge: connected.edge,
        point: connected.point,
        t: connected.t,
        distance: connected.distance,
      };
    }
  }
  // Once a gamepad weld has started, never jump to an unrelated nearby edge.
  // The intended cursor can move freely, but the magnetic weld point must stay
  // on the active edge until a graph-connected junction is selected above.
  // Returning the current projection also prevents a one-frame missing seam
  // when the stick moves faster than the track tolerance.
  return currentTrack;
};

export const resolveWeldingSoftCorridorCursor = ({
  currentPoint,
  proposedPoint,
  trackPoint,
  corridorRadius,
  softEdgeRatio,
}: {
  currentPoint: WeldingPoint;
  proposedPoint: WeldingPoint;
  trackPoint: WeldingPoint;
  corridorRadius: number;
  softEdgeRatio: number;
}): WeldingPoint => {
  const radius = Math.max(1, corridorRadius);
  const softRadius = radius * Math.min(0.95, Math.max(0.1, softEdgeRatio));
  const proposedOffset = subtract(proposedPoint, trackPoint);
  const proposedDistance = Math.hypot(proposedOffset.x, proposedOffset.y);
  if (proposedDistance <= softRadius) return proposedPoint;

  const currentDistance = Math.hypot(
    currentPoint.x - trackPoint.x,
    currentPoint.y - trackPoint.y,
  );
  const outwardDistance = Math.max(0, proposedDistance - currentDistance);
  if (outwardDistance <= 0) return proposedPoint;

  const edgeSpan = Math.max(1, radius - softRadius);
  const edgePressure = Math.min(
    1,
    Math.max(0, (Math.max(currentDistance, softRadius) - softRadius) / edgeSpan),
  );
  // The last part of the corridor behaves like a soft rubber wall: outward
  // movement loses momentum progressively instead of hitting a hard clamp.
  const outwardScale = 0.04 + 0.96 * (1 - edgePressure) ** 2;
  const resolvedDistance = Math.min(
    radius,
    Math.max(currentDistance, softRadius) + outwardDistance * outwardScale,
  );
  const normalizer = proposedDistance || 1;
  return {
    x: trackPoint.x + (proposedOffset.x / normalizer) * resolvedDistance,
    y: trackPoint.y + (proposedOffset.y / normalizer) * resolvedDistance,
  };
};

export const relaxWeldingSoftCorridorCursor = ({
  cursorPoint,
  trackPoint,
  corridorRadius,
  softEdgeRatio,
  deltaTime,
}: {
  cursorPoint: WeldingPoint;
  trackPoint: WeldingPoint;
  corridorRadius: number;
  softEdgeRatio: number;
  deltaTime: number;
}): WeldingPoint => {
  const radius = Math.max(1, corridorRadius);
  const softRadius = radius * Math.min(0.95, Math.max(0.1, softEdgeRatio));
  const offset = subtract(cursorPoint, trackPoint);
  const cursorDistance = Math.hypot(offset.x, offset.y);
  if (cursorDistance <= softRadius) return cursorPoint;

  const relaxedDistance = softRadius +
    (cursorDistance - softRadius) * Math.exp(-8 * Math.max(0, deltaTime));
  return {
    x: trackPoint.x + (offset.x / cursorDistance) * relaxedDistance,
    y: trackPoint.y + (offset.y / cursorDistance) * relaxedDistance,
  };
};

export const selectWeldingBranchByDirection = (
  outgoing: WeldingRouteEdge[],
  direction: WeldingPoint,
): WeldingRouteEdge | null => {
  const directionLength = Math.hypot(direction.x, direction.y);
  if (outgoing.length === 0 || directionLength < 0.15) return null;
  let best: { edge: WeldingRouteEdge; score: number } | null = null;
  for (const edge of outgoing) {
    const edgeVector = subtract(edge.end, edge.start);
    const edgeLength = Math.hypot(edgeVector.x, edgeVector.y) || 1;
    const score =
      (edgeVector.x / edgeLength) * (direction.x / directionLength) +
      (edgeVector.y / edgeLength) * (direction.y / directionLength);
    if (!best || score > best.score) best = { edge, score };
  }
  return best && best.score >= 0.15 ? best.edge : null;
};
