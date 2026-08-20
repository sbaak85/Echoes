"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  WELDING_ROUTE_VIEWBOX,
  WELDING_SOURCE_ROUTES,
  createRandomWeldingRoute,
  createWeldingRouteGraph,
  findWeldingPathRejoinIndex,
  getNearestWeldingTrackProjection,
  getWeldingPathProgress,
  getWeldingSharedTrackPoint,
  relaxWeldingSoftCorridorCursor,
  resolveWeldingBackwardHysteresis,
  resolveWeldingCandidateLeadership,
  resolveWeldingSoftCorridorCursor,
  selectWeldingMagneticTrack,
  selectWeldingPointerTrack,
  type WeldingCandidateProgress,
  type WeldingPoint,
  type WeldingPathSample,
  type WeldingRouteEdge,
  type WeldingTrackProjection,
} from "./welding-route-puzzle";

type WeldingPuzzlePhase =
  | "intro"
  | "countdown"
  | "preview"
  | "ready"
  | "welding"
  | "success";
type WeldingInputMode = "pointer" | "gamepad";
type WeldingSegment = {
  segmentId: number;
  trailId: number;
  start: WeldingPoint;
  end: WeldingPoint;
  fadeStartedAt?: number;
};

type PendingAbandonedTrail = {
  segmentIds: Set<number>;
  confirmedDistance: number;
};

type WeldingCandidateTrail = WeldingCandidateProgress & {
  samples: WeldingPathSample[];
  endpoint: WeldingTrackProjection;
};

type WeldingRoutePuzzleProps = {
  onCancel: () => void;
  onComplete: () => void;
  onFail: () => void;
  onRequestNextStage?: () => boolean;
  onSparkActivityChange?: (active: boolean) => void;
};

const START_SNAP_DISTANCE = 34;
const POINTER_TRACK_TOLERANCE = 29;
// Branch capture stays generous so the right stick can select junctions, but
// the visible gun itself is confined to a much narrower soft corridor. The
// weld seam is resolved separately and remains on the exact track centre.
const GAMEPAD_TRACK_CAPTURE_TOLERANCE = 56;
const GAMEPAD_JUNCTION_CAPTURE_RADIUS = 70;
const GAMEPAD_CURSOR_CORRIDOR_RADIUS = 12;
const GAMEPAD_CURSOR_SOFT_EDGE_RATIO = 0.7;
const TRACK_SWITCH_PROGRESS = 0.68;
const TRACK_SWITCH_T_EPSILON = 0.025;
const POINTER_SPRING_STRENGTH = 34;
const POINTER_SPRING_DAMPING = 10.5;
const GAMEPAD_CURSOR_SPEED = 210;
const PATH_REJOIN_MINIMUM_TAIL_DISTANCE = 4;
const PATH_REJOIN_POINT_TOLERANCE = 5;
const BRANCH_CHANGE_CONFIRM_DISTANCE = 34;
const ABANDONED_TRAIL_FADE_DURATION = 720;
const MINIMUM_WELD_SEGMENT_LENGTH = 0.01;
const CANDIDATE_TRAIL_RESUME_DISTANCE = 18;
const BACKWARD_WELD_CONFIRM_DISTANCE = 14;
const PREVIEW_COUNTDOWN_STEP_DURATION = 1000;
const PREVIEW_WELD_DURATION = 5200;
const PREVIEW_SETTLE_DURATION = 260;

const distance = (a: WeldingPoint, b: WeldingPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const getEndpointTrackProjection = (
  edge: WeldingRouteEdge,
  point: WeldingPoint,
): WeldingTrackProjection => ({
  edge,
  point,
  t: distance(point, edge.start) <= distance(point, edge.end) ? 0 : 1,
  distance: 0,
});

const clampToBoard = (point: WeldingPoint): WeldingPoint => ({
  x: Math.max(8, Math.min(WELDING_ROUTE_VIEWBOX.width - 8, point.x)),
  y: Math.max(8, Math.min(WELDING_ROUTE_VIEWBOX.height - 8, point.y)),
});

const sourceRoutePoints = (points: WeldingPoint[]) =>
  points.map((point) => `${point.x},${point.y}`).join(" ");

const getWeldSegmentOpacity = (
  segment: WeldingSegment,
  now: number,
) => segment.fadeStartedAt === undefined
  ? 1
  : Math.max(0, Math.min(
      1,
      1 - (now - segment.fadeStartedAt) / ABANDONED_TRAIL_FADE_DURATION,
    ));

const getPrimaryGamepad = () => {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return null;
  }
  return [...navigator.getGamepads()].find((gamepad) => gamepad?.connected) ?? null;
};

export function WeldingRoutePuzzle({
  onCancel,
  onComplete,
  onRequestNextStage,
  onSparkActivityChange,
}: WeldingRoutePuzzleProps) {
  const [graph] = useState(() => createWeldingRouteGraph());
  const [previewRoute] = useState(() => createRandomWeldingRoute(() => 0.42));
  const initialGunPoint: WeldingPoint = graph.nodes.find(
    (node) => graph.startNodeIds.includes(node.id),
  ) ?? { x: 20, y: 251 };
  const [phase, setPhase] = useState<WeldingPuzzlePhase>("intro");
  const [inputMode, setInputMode] = useState<WeldingInputMode>("pointer");
  const [gunPoint, setGunPoint] = useState<WeldingPoint>(initialGunPoint);
  const [gunVisible, setGunVisible] = useState(false);
  const [pointerHeld, setPointerHeld] = useState(false);
  const [weldSegments, setWeldSegments] = useState<WeldingSegment[]>([]);
  const [previewSegments, setPreviewSegments] = useState<WeldingSegment[]>([]);
  const [previewCountdown, setPreviewCountdown] = useState(3);
  const [weldRenderClock, setWeldRenderClock] = useState(0);
  const [exitSelected, setExitSelected] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<WeldingPuzzlePhase>("intro");
  const gunPointRef = useRef<WeldingPoint>(initialGunPoint);
  const pointerTargetRef = useRef<WeldingPoint>(initialGunPoint);
  const gunVelocityRef = useRef<WeldingPoint>({ x: 0, y: 0 });
  const pointerHeldRef = useRef(false);
  const weldSegmentsRef = useRef<WeldingSegment[]>([]);
  const weldSegmentIdRef = useRef(0);
  const candidateTrailsRef = useRef<Map<number, WeldingCandidateTrail>>(new Map());
  const candidateTrailIdRef = useRef(0);
  const activeCandidateTrailIdRef = useRef<number | null>(null);
  const leaderCandidateTrailIdRef = useRef<number | null>(null);
  const previousWeldSampleRef = useRef<WeldingTrackProjection | null>(null);
  const backwardWeldConfirmedRef = useRef(false);
  const activeWeldPathRef = useRef<WeldingPathSample[]>([]);
  const pendingAbandonedTrailRef = useRef<PendingAbandonedTrail | null>(null);
  const activeTrackEdgeRef = useRef<WeldingRouteEdge | null>(null);
  const activeTrackProgressRef = useRef(0);
  const finishedRef = useRef(false);
  const previousGamepadButtonsRef = useRef({
    back: false,
    confirm: false,
    navigateUp: false,
    navigateDown: false,
  });

  const updatePhase = (nextPhase: WeldingPuzzlePhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  };

  const updateGunPoint = (nextPoint: WeldingPoint) => {
    const clamped = clampToBoard(nextPoint);
    gunPointRef.current = clamped;
    setGunPoint(clamped);
  };

  const completePuzzle = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    pointerHeldRef.current = false;
    setPointerHeld(false);
    updatePhase("success");
  };

  const getResumableCandidateTrail = (
    selectedTrack: WeldingTrackProjection,
  ): WeldingCandidateTrail | null => {
    const candidates = [...candidateTrailsRef.current.values()]
      .filter((trail) => !trail.fading)
      .map((trail) => ({
        trail,
        distance: distance(trail.endpoint.point, selectedTrack.point),
        edgePenalty: trail.endpoint.edge.id === selectedTrack.edge.id ? 0 : 4,
      }))
      .filter(
        (candidate) => candidate.distance <= CANDIDATE_TRAIL_RESUME_DISTANCE,
      )
      .sort(
        (left, right) =>
          left.distance + left.edgePenalty - (right.distance + right.edgePenalty),
      );
    return candidates[0]?.trail ?? null;
  };

  const updateCandidateTrailProgress = (
    endpoint: WeldingTrackProjection,
  ): number | null => {
    const activeTrailId = activeCandidateTrailIdRef.current;
    if (activeTrailId === null) return null;
    const activeTrail = candidateTrailsRef.current.get(activeTrailId);
    if (!activeTrail) return null;
    const samples = [...activeWeldPathRef.current];
    candidateTrailsRef.current.set(activeTrailId, {
      ...activeTrail,
      samples,
      endpoint,
      progress: getWeldingPathProgress(samples),
    });
    const resolution = resolveWeldingCandidateLeadership({
      trails: [...candidateTrailsRef.current.values()],
      leaderTrailId: leaderCandidateTrailIdRef.current,
      activeTrailId,
    });
    for (const progressState of resolution.trails) {
      const trail = candidateTrailsRef.current.get(progressState.trailId);
      if (!trail) continue;
      candidateTrailsRef.current.set(progressState.trailId, {
        ...trail,
        ...progressState,
      });
    }
    leaderCandidateTrailIdRef.current = resolution.leaderTrailId;
    return resolution.fadeTrailId;
  };

  const appendWeldSegment = (
    start: WeldingTrackProjection,
    end: WeldingTrackProjection,
  ) => {
    const segmentLength = distance(start.point, end.point);
    if (segmentLength < MINIMUM_WELD_SEGMENT_LENGTH) return;
    const activeTrailId = activeCandidateTrailIdRef.current;
    if (activeTrailId === null) return;
    const nextSegment: WeldingSegment = {
      segmentId: (weldSegmentIdRef.current += 1),
      trailId: activeTrailId,
      start: start.point,
      end: end.point,
    };
    const nextPathSample: WeldingPathSample = {
      edgeId: end.edge.id,
      point: end.point,
      t: end.t,
      segmentId: nextSegment.segmentId,
    };
    let activePath = activeWeldPathRef.current;
    if (activePath.at(-1)?.edgeId !== start.edge.id) {
      // Keep an explicit sample for both sides of a shared junction. That lets
      // a later retrace reach t=0/t=1 and discard the entire abandoned branch,
      // including its very first short segment next to the junction.
      activePath = [...activePath, {
        edgeId: start.edge.id,
        point: start.point,
        t: start.t,
        segmentId: null,
      }];
      activeWeldPathRef.current = activePath;
    }
    const rejoinIndex = findWeldingPathRejoinIndex({
      samples: activePath,
      next: nextPathSample,
      minimumTailDistance: PATH_REJOIN_MINIMUM_TAIL_DISTANCE,
      pointTolerance: PATH_REJOIN_POINT_TOLERANCE,
    });
    let pendingTrail = pendingAbandonedTrailRef.current;

    if (rejoinIndex >= 0) {
      pendingTrail ??= {
        segmentIds: new Set<number>(),
        confirmedDistance: 0,
      };
      for (const sample of activePath.slice(rejoinIndex + 1)) {
        if (sample.segmentId !== null) pendingTrail.segmentIds.add(sample.segmentId);
      }
      // The segment used to retrace back to the older path belongs to the
      // temporary excursion too. It stays visible until a new direction is
      // confirmed, then fades with the rest of the abandoned branch.
      pendingTrail.segmentIds.add(nextSegment.segmentId);
      pendingTrail.confirmedDistance = 0;
      const shortenedPath = activePath.slice(0, rejoinIndex + 1);
      shortenedPath[shortenedPath.length - 1] = {
        ...shortenedPath[shortenedPath.length - 1],
        point: end.point,
        t: end.t,
      };
      activeWeldPathRef.current = shortenedPath;
    } else {
      activeWeldPathRef.current = [...activePath, nextPathSample];
      if (pendingTrail) pendingTrail.confirmedDistance += segmentLength;
    }

    let nextSegments = [...weldSegmentsRef.current, nextSegment];
    if (
      pendingTrail &&
      pendingTrail.confirmedDistance >= BRANCH_CHANGE_CONFIRM_DISTANCE
    ) {
      const fadeStartedAt = typeof performance === "undefined"
        ? Date.now()
        : performance.now();
      nextSegments = nextSegments.map((segment) =>
        pendingTrail.segmentIds.has(segment.segmentId) && segment.fadeStartedAt === undefined
          ? { ...segment, fadeStartedAt }
          : segment,
      );
      setWeldRenderClock(fadeStartedAt);
      pendingTrail = null;
    }

    const candidateFadeTrailId = updateCandidateTrailProgress(end);
    if (candidateFadeTrailId !== null) {
      const fadeStartedAt = typeof performance === "undefined"
        ? Date.now()
        : performance.now();
      nextSegments = nextSegments.map((segment) =>
        segment.trailId === candidateFadeTrailId && segment.fadeStartedAt === undefined
          ? { ...segment, fadeStartedAt }
          : segment,
      );
      setWeldRenderClock(fadeStartedAt);
    }

    pendingAbandonedTrailRef.current = pendingTrail;
    weldSegmentsRef.current = nextSegments;
    setWeldSegments(nextSegments);
  };

  const getBoardPoint = (clientX: number, clientY: number): WeldingPoint | null => {
    const board = boardRef.current;
    if (!board) return null;
    const bounds = board.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return clampToBoard({
      x: ((clientX - bounds.left) / bounds.width) * WELDING_ROUTE_VIEWBOX.width,
      y: ((clientY - bounds.top) / bounds.height) * WELDING_ROUTE_VIEWBOX.height,
    });
  };

  const selectMagneticTrack = (
    point: WeldingPoint,
  ): WeldingTrackProjection | null => selectWeldingMagneticTrack({
    point,
    graphEdges: graph.edges,
    activeEdge: activeTrackEdgeRef.current,
    activeProgress: activeTrackProgressRef.current,
    startSnapDistance: START_SNAP_DISTANCE,
    trackTolerance: GAMEPAD_TRACK_CAPTURE_TOLERANCE,
    junctionRadius: GAMEPAD_JUNCTION_CAPTURE_RADIUS,
    switchProgress: TRACK_SWITCH_PROGRESS,
    switchTEpsilon: TRACK_SWITCH_T_EPSILON,
  });

  const selectPointerTrack = (
    point: WeldingPoint,
  ): WeldingTrackProjection | null => selectWeldingPointerTrack({
    point,
    graphEdges: graph.edges,
    activeEdge: activeTrackEdgeRef.current,
    trackTolerance: POINTER_TRACK_TOLERANCE,
  });

  const beginPointerWeld = (
    point: WeldingPoint,
    cursorMode: WeldingInputMode,
  ) => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "welding") return;
    const selectedTrack = getNearestWeldingTrackProjection(
      point,
      graph.edges,
    );
    if (!selectedTrack || selectedTrack.distance > START_SNAP_DISTANCE) return;
    const resumedTrail = getResumableCandidateTrail(selectedTrack);
    const startingTrack = resumedTrail?.endpoint ?? selectedTrack;
    if (resumedTrail) {
      activeCandidateTrailIdRef.current = resumedTrail.trailId;
      activeWeldPathRef.current = [...resumedTrail.samples];
    } else {
      const trailId = (candidateTrailIdRef.current += 1);
      const firstSample: WeldingPathSample = {
        edgeId: selectedTrack.edge.id,
        point: selectedTrack.point,
        t: selectedTrack.t,
        segmentId: null,
      };
      candidateTrailsRef.current.set(trailId, {
        trailId,
        samples: [firstSample],
        endpoint: selectedTrack,
        progress: 0,
        pendingAbandonment: false,
        fading: false,
      });
      activeCandidateTrailIdRef.current = trailId;
      activeWeldPathRef.current = [firstSample];
    }
    pointerHeldRef.current = true;
    setPointerHeld(true);
    updatePhase("welding");
    pointerTargetRef.current = point;
    gunVelocityRef.current = { x: 0, y: 0 };
    activeTrackEdgeRef.current = startingTrack.edge;
    activeTrackProgressRef.current = startingTrack.t;
    updateGunPoint(point);
    previousWeldSampleRef.current = startingTrack;
    backwardWeldConfirmedRef.current = false;
    pendingAbandonedTrailRef.current = null;
  };

  const advancePointerWeld = (
    point: WeldingPoint,
    cursorMode: WeldingInputMode,
  ) => {
    if (!pointerHeldRef.current || phaseRef.current !== "welding") return;
    const selectedTrack = cursorMode === "gamepad"
      ? selectMagneticTrack(point)
      : selectPointerTrack(point);
    if (!selectedTrack) {
      // No graph line is close enough, so no weld is added. The visible cursor
      // remains independent from the projected seam in both input modes.
      updateGunPoint(point);
      return;
    }

    const previousEdge = activeTrackEdgeRef.current;
    const switchedTrack = previousEdge?.id !== selectedTrack.edge.id;
    const previousSample = previousWeldSampleRef.current;

    updateGunPoint(point);

    if (previousSample) {
      const backwardResolution = resolveWeldingBackwardHysteresis({
        committedPoint: previousSample.point,
        candidatePoint: selectedTrack.point,
        backwardConfirmed: backwardWeldConfirmedRef.current,
        confirmationDistance: BACKWARD_WELD_CONFIRM_DISTANCE,
      });
      backwardWeldConfirmedRef.current = backwardResolution.backwardConfirmed;
      if (!backwardResolution.shouldCommit) return;
    }

    activeTrackEdgeRef.current = selectedTrack.edge;
    activeTrackProgressRef.current = selectedTrack.t;

    const sharedTrackPoint = switchedTrack && previousEdge
      ? getWeldingSharedTrackPoint(previousEdge, selectedTrack.edge)
      : null;
    if (previousSample && !switchedTrack) {
      appendWeldSegment(previousSample, selectedTrack);
    } else if (previousSample && sharedTrackPoint) {
      // Every graph transition is split at the shared junction, so the actual
      // player-drawn seam stays continuous regardless of which branch is used.
      const previousJunction = getEndpointTrackProjection(previousEdge, sharedTrackPoint);
      const nextJunction = getEndpointTrackProjection(selectedTrack.edge, sharedTrackPoint);
      appendWeldSegment(previousSample, previousJunction);
      appendWeldSegment(nextJunction, selectedTrack);
    }
    previousWeldSampleRef.current = selectedTrack;

    if (
      selectedTrack.t >= 0.995 &&
      graph.endNodeIds.includes(selectedTrack.edge.to)
    ) {
      completePuzzle();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "welding") return;
    const point = getBoardPoint(event.clientX, event.clientY);
    if (!point) return;
    setInputMode("pointer");
    setExitSelected(false);
    setGunVisible(true);
    pointerTargetRef.current = point;
    if (!pointerHeldRef.current) {
      gunVelocityRef.current = { x: 0, y: 0 };
      updateGunPoint(point);
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Intro/success controls live inside the board. Do not let the welding
    // surface capture their pointer sequence or the button click is lost.
    if (phaseRef.current !== "ready" && phaseRef.current !== "welding") return;
    if (event.button !== 0 && event.pointerType !== "touch") return;
    const point = getBoardPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setInputMode("pointer");
    setGunVisible(true);
    pointerTargetRef.current = point;
    beginPointerWeld(point, "pointer");
  };

  const stopPointerWeld = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerHeldRef.current = false;
    setPointerHeld(false);
    const activeTrailId = activeCandidateTrailIdRef.current;
    if (activeTrailId !== null) {
      const activeTrail = candidateTrailsRef.current.get(activeTrailId);
      if (activeTrail && activeTrail.progress < MINIMUM_WELD_SEGMENT_LENGTH) {
        candidateTrailsRef.current.delete(activeTrailId);
        if (leaderCandidateTrailIdRef.current === activeTrailId) {
          leaderCandidateTrailIdRef.current = null;
        }
      }
    }
    activeCandidateTrailIdRef.current = null;
    activeTrackEdgeRef.current = null;
    activeTrackProgressRef.current = 0;
    previousWeldSampleRef.current = null;
    backwardWeldConfirmedRef.current = false;
  };

  const confirmCompletion = () => {
    if (onRequestNextStage?.()) return;
    onComplete();
  };

  const startPreviewSequence = () => {
    pointerHeldRef.current = false;
    setPointerHeld(false);
    weldSegmentsRef.current = [];
    setWeldSegments([]);
    setPreviewSegments([]);
    candidateTrailsRef.current.clear();
    activeCandidateTrailIdRef.current = null;
    leaderCandidateTrailIdRef.current = null;
    activeWeldPathRef.current = [];
    previousWeldSampleRef.current = null;
    activeTrackEdgeRef.current = null;
    activeTrackProgressRef.current = 0;
    gunVelocityRef.current = { x: 0, y: 0 };
    pointerTargetRef.current = previewRoute.start;
    updateGunPoint(previewRoute.start);
    setGunVisible(false);
    setPreviewCountdown(3);
    setExitSelected(false);
    updatePhase("countdown");
  };

  useEffect(() => {
    if (phase !== "countdown") return;
    const timerId = window.setTimeout(() => {
      if (previewCountdown > 1) {
        setPreviewCountdown((value) => value - 1);
        return;
      }
      updatePhase("preview");
    }, PREVIEW_COUNTDOWN_STEP_DURATION);
    return () => window.clearTimeout(timerId);
    // updatePhase only mirrors state into a ref and is intentionally stable in meaning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, previewCountdown]);

  useEffect(() => {
    if (phase !== "preview") return;
    const edgeLengths = previewRoute.edges.map((edge) => distance(edge.start, edge.end));
    const totalLength = edgeLengths.reduce((sum, length) => sum + length, 0);
    const startedAt = performance.now();
    let frameId = 0;
    let settleTimerId = 0;

    setGunVisible(true);
    updateGunPoint(previewRoute.start);

    const drawPreview = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / PREVIEW_WELD_DURATION);
      const targetDistance = totalLength * progress;
      const nextSegments: WeldingSegment[] = [];
      let traversed = 0;
      let currentPoint = previewRoute.start;

      for (let index = 0; index < previewRoute.edges.length; index += 1) {
        const edge = previewRoute.edges[index];
        const edgeLength = edgeLengths[index];
        if (targetDistance >= traversed + edgeLength) {
          nextSegments.push({
            segmentId: -(index + 1),
            trailId: -1,
            start: edge.start,
            end: edge.end,
          });
          currentPoint = edge.end;
          traversed += edgeLength;
          continue;
        }
        const edgeProgress = edgeLength <= 0
          ? 1
          : Math.max(0, Math.min(1, (targetDistance - traversed) / edgeLength));
        currentPoint = {
          x: edge.start.x + (edge.end.x - edge.start.x) * edgeProgress,
          y: edge.start.y + (edge.end.y - edge.start.y) * edgeProgress,
        };
        if (edgeProgress > 0) {
          nextSegments.push({
            segmentId: -(index + 1),
            trailId: -1,
            start: edge.start,
            end: currentPoint,
          });
        }
        break;
      }

      setPreviewSegments(nextSegments);
      pointerTargetRef.current = currentPoint;
      updateGunPoint(currentPoint);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(drawPreview);
        return;
      }
      settleTimerId = window.setTimeout(() => {
        const routeEntrancePoints = graph.nodes.filter((node) =>
          graph.startNodeIds.includes(node.id),
        );
        const nextEntrancePoint = routeEntrancePoints[
          Math.floor(Math.random() * routeEntrancePoints.length)
        ] ?? initialGunPoint;

        setPreviewSegments([]);
        pointerTargetRef.current = nextEntrancePoint;
        gunVelocityRef.current = { x: 0, y: 0 };
        updateGunPoint(nextEntrancePoint);
        setGunVisible(true);
        updatePhase("ready");
      }, PREVIEW_SETTLE_DURATION);
    };

    frameId = window.requestAnimationFrame(drawPreview);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(settleTimerId);
    };
    // The generated preview route and initial point are stable for this mounted puzzle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, previewRoute]);

  useEffect(() => {
    const fadeEnd = weldSegments.reduce(
      (latest, segment) => segment.fadeStartedAt === undefined
        ? latest
        : Math.max(latest, segment.fadeStartedAt + ABANDONED_TRAIL_FADE_DURATION),
      0,
    );
    if (fadeEnd <= 0) return;
    let frameId = 0;
    const updateFade = (now: number) => {
      setWeldRenderClock(now);
      if (now < fadeEnd) {
        frameId = window.requestAnimationFrame(updateFade);
        return;
      }
      const visibleSegments = weldSegmentsRef.current.filter(
        (segment) => segment.fadeStartedAt === undefined,
      );
      const visibleTrailIds = new Set(
        visibleSegments.map((segment) => segment.trailId),
      );
      for (const trail of candidateTrailsRef.current.values()) {
        if (trail.fading && !visibleTrailIds.has(trail.trailId)) {
          candidateTrailsRef.current.delete(trail.trailId);
        }
      }
      weldSegmentsRef.current = visibleSegments;
      setWeldSegments(visibleSegments);
    };
    frameId = window.requestAnimationFrame(updateFade);
    return () => window.cancelAnimationFrame(frameId);
  }, [weldSegments]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat) return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  useEffect(() => {
    let frameId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const deltaTime = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      if (
        inputMode === "pointer" &&
        gunVisible &&
        (phaseRef.current === "ready" || phaseRef.current === "welding")
      ) {
        if (!pointerHeldRef.current) {
          gunVelocityRef.current = { x: 0, y: 0 };
          updateGunPoint(pointerTargetRef.current);
        } else {
          const current = gunPointRef.current;
          const target = pointerTargetRef.current;
          const velocity = gunVelocityRef.current;
          const damping = Math.exp(-POINTER_SPRING_DAMPING * deltaTime);
          const nextVelocity = {
            x: (velocity.x + (target.x - current.x) * POINTER_SPRING_STRENGTH * deltaTime) * damping,
            y: (velocity.y + (target.y - current.y) * POINTER_SPRING_STRENGTH * deltaTime) * damping,
          };
          const nextPoint = clampToBoard({
            x: current.x + nextVelocity.x * deltaTime,
            y: current.y + nextVelocity.y * deltaTime,
          });
          gunVelocityRef.current = nextVelocity;
          updateGunPoint(nextPoint);
          advancePointerWeld(nextPoint, "pointer");
        }
      }

      const gamepad = getPrimaryGamepad();
      if (gamepad) {
        const rightX = Math.abs(gamepad.axes[2] ?? 0) >= 0.14 ? gamepad.axes[2] ?? 0 : 0;
        const rightY = Math.abs(gamepad.axes[3] ?? 0) >= 0.14 ? gamepad.axes[3] ?? 0 : 0;
        const rightStickActive = Math.hypot(rightX, rightY) > 0;
        const rightTriggerHeld = (gamepad.buttons[7]?.value ?? 0) >= 0.45;
        const backPressed = gamepad.buttons[1]?.pressed ?? false;
        const confirmPressed = gamepad.buttons[0]?.pressed ?? false;
        const navigateUp =
          (gamepad.axes[1] ?? 0) <= -0.65 ||
          (gamepad.buttons[12]?.pressed ?? false);
        const navigateDown =
          (gamepad.axes[1] ?? 0) >= 0.65 ||
          (gamepad.buttons[13]?.pressed ?? false);

        if (
          rightStickActive &&
          (phaseRef.current === "ready" || phaseRef.current === "welding")
        ) {
          setInputMode("gamepad");
          setGunVisible(true);
        }

        if (navigateUp && !previousGamepadButtonsRef.current.navigateUp) {
          setExitSelected(true);
        }
        if (navigateDown && !previousGamepadButtonsRef.current.navigateDown) {
          setExitSelected(false);
        }

        if (backPressed && !previousGamepadButtonsRef.current.back) onCancel();
        if (confirmPressed && !previousGamepadButtonsRef.current.confirm) {
          if (exitSelected) {
            onCancel();
          } else if (phaseRef.current === "intro") {
            startPreviewSequence();
          } else if (phaseRef.current === "success") {
            confirmCompletion();
          }
        }
        previousGamepadButtonsRef.current = {
          back: backPressed,
          confirm: confirmPressed,
          navigateUp,
          navigateDown,
        };

        if (inputMode === "gamepad") {
          const gamepadActivelyWelding =
            rightTriggerHeld && pointerHeldRef.current;
          if (
            rightStickActive &&
            (phaseRef.current === "ready" || phaseRef.current === "welding") &&
            !gamepadActivelyWelding
          ) {
            pointerTargetRef.current = clampToBoard({
              x: pointerTargetRef.current.x + rightX * GAMEPAD_CURSOR_SPEED * deltaTime,
              y: pointerTargetRef.current.y + rightY * GAMEPAD_CURSOR_SPEED * deltaTime,
            });
            gunVelocityRef.current = { x: 0, y: 0 };
            updateGunPoint(pointerTargetRef.current);
          }
          if (
            rightTriggerHeld &&
            (phaseRef.current === "ready" || phaseRef.current === "welding")
          ) {
            if (!pointerHeldRef.current) {
              const nearestTrack = getNearestWeldingTrackProjection(
                gunPointRef.current,
                graph.edges,
              );
              if (nearestTrack && nearestTrack.distance <= START_SNAP_DISTANCE) {
                beginPointerWeld(gunPointRef.current, "gamepad");
              }
            } else if (rightStickActive) {
              const currentCursor = pointerTargetRef.current;
              const proposedPoint = clampToBoard({
                x: currentCursor.x + rightX * GAMEPAD_CURSOR_SPEED * deltaTime,
                y: currentCursor.y + rightY * GAMEPAD_CURSOR_SPEED * deltaTime,
              });
              const projectedTrack = selectMagneticTrack(proposedPoint);
              const intendedPoint = projectedTrack
                ? clampToBoard(resolveWeldingSoftCorridorCursor({
                    currentPoint: currentCursor,
                    proposedPoint,
                    trackPoint: projectedTrack.point,
                    corridorRadius: GAMEPAD_CURSOR_CORRIDOR_RADIUS,
                    softEdgeRatio: GAMEPAD_CURSOR_SOFT_EDGE_RATIO,
                  }))
                : proposedPoint;
              // The visible gun follows the free corridor cursor. The welding
              // function independently projects this point to the graph centre.
              pointerTargetRef.current = intendedPoint;
              gunVelocityRef.current = { x: 0, y: 0 };
              advancePointerWeld(intendedPoint, "gamepad");
            } else {
              const projectedTrack = selectMagneticTrack(pointerTargetRef.current);
              if (projectedTrack) {
                const relaxedCursor = clampToBoard(relaxWeldingSoftCorridorCursor({
                  cursorPoint: pointerTargetRef.current,
                  trackPoint: projectedTrack.point,
                  corridorRadius: GAMEPAD_CURSOR_CORRIDOR_RADIUS,
                  softEdgeRatio: GAMEPAD_CURSOR_SOFT_EDGE_RATIO,
                  deltaTime,
                }));
                pointerTargetRef.current = relaxedCursor;
                updateGunPoint(relaxedCursor);
              }
            }
          } else {
            if (pointerHeldRef.current) stopPointerWeld();
            if (
              rightStickActive &&
              (phaseRef.current === "ready" || phaseRef.current === "welding")
            ) {
              gunVelocityRef.current = { x: 0, y: 0 };
              updateGunPoint(pointerTargetRef.current);
            }
          }
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
    // The RAF intentionally reads the current refs; remounting creates a fresh board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitSelected, graph, gunVisible, inputMode, onCancel]);

  const activelyWelding = phase === "welding" && pointerHeld;
  const showingPreviewWeld = phase === "preview";
  const sparkPoint = gunPoint;
  const showingSparks = activelyWelding || showingPreviewWeld;

  useEffect(() => {
    onSparkActivityChange?.(showingSparks);
  }, [onSparkActivityChange, showingSparks]);

  useEffect(() => () => {
    // 關閉或重新掛載小遊戲時，不論當下輸入狀態都必須結束混音。
    onSparkActivityChange?.(false);
  }, [onSparkActivityChange]);

  return (
    <div className="welding-puzzle-overlay" data-input-mode={inputMode}>
      <section
        className={`welding-puzzle-dialog is-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welding-puzzle-title"
      >
        <header className="welding-puzzle-header">
          <div>
            <small>FIELD REPAIR · WELDING STAGE 01</small>
            <h2 id="welding-puzzle-title">焊接各部位元件</h2>
          </div>
          <p>
            {phase === "success" ? "結構接點已完成固定" :
              phase === "intro" || phase === "countdown" || phase === "preview"
                ? "先觀察焊槍自動走過一次正確路線"
                : "從左側起點沿著任一連續路線焊接至右側終點"}
          </p>
          <button
            className={exitSelected ? "is-gamepad-selected" : undefined}
            type="button"
            data-gamepad-selected={exitSelected || undefined}
            onFocus={() => setExitSelected(true)}
            onMouseEnter={() => setExitSelected(true)}
            onClick={onCancel}
          >
            離開
          </button>
        </header>

        <div
          ref={boardRef}
          className="welding-puzzle-board"
          onPointerEnter={(event) => {
            handlePointerMove(event);
          }}
          onPointerLeave={() => {
            if (!pointerHeldRef.current && inputMode === "pointer") setGunVisible(false);
          }}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={stopPointerWeld}
          onPointerCancel={stopPointerWeld}
          onContextMenu={(event) => event.preventDefault()}
        >
          <svg
            className="welding-route-svg"
            viewBox={`0 0 ${WELDING_ROUTE_VIEWBOX.width} ${WELDING_ROUTE_VIEWBOX.height}`}
            preserveAspectRatio="none"
            aria-label="焊接路線圖"
          >
            <g className="welding-route-network">
              {WELDING_SOURCE_ROUTES.map((route) => (
                <polyline key={route.id} points={sourceRoutePoints(route.points)} />
              ))}
            </g>
          </svg>

          {previewSegments.length > 0 || weldSegments.length > 0 ? (
            <svg
              className="welding-live-seam-overlay"
              viewBox={`0 0 ${WELDING_ROUTE_VIEWBOX.width} ${WELDING_ROUTE_VIEWBOX.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <filter
                  id="welding-live-seam-glow"
                  filterUnits="userSpaceOnUse"
                  x="-40"
                  y="-40"
                  width={WELDING_ROUTE_VIEWBOX.width + 80}
                  height={WELDING_ROUTE_VIEWBOX.height + 80}
                >
                  <feGaussianBlur stdDeviation="4.6" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <g
                className="welding-route-hot-seam welding-route-player-weld"
                filter="url(#welding-live-seam-glow)"
              >
                {previewSegments.map((segment) => (
                  <line
                    key={`preview-hot-${segment.segmentId}`}
                    x1={segment.start.x}
                    y1={segment.start.y}
                    x2={segment.end.x}
                    y2={segment.end.y}
                  />
                ))}
                {weldSegments.map((segment) => (
                  <line
                    key={`weld-hot-${segment.segmentId}`}
                    x1={segment.start.x}
                    y1={segment.start.y}
                    x2={segment.end.x}
                    y2={segment.end.y}
                    opacity={getWeldSegmentOpacity(segment, weldRenderClock)}
                  />
                ))}
              </g>
            </svg>
          ) : null}

          {showingSparks ? (
            <svg
              className="welding-effects-overlay"
              viewBox={`0 0 ${WELDING_ROUTE_VIEWBOX.width} ${WELDING_ROUTE_VIEWBOX.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <g className="welding-sparks" transform={`translate(${sparkPoint.x} ${sparkPoint.y})`}>
                {Array.from({ length: 42 }, (_, index) => {
                  const angle = (index / 42) * Math.PI * 2 + (index % 5) * 0.12;
                  const length = 12 + (index % 8) * 5.5;
                  return (
                    <line
                      key={index}
                      style={{ "--spark-index": index } as CSSProperties}
                      x1={Math.cos(angle) * 4}
                      y1={Math.sin(angle) * 4}
                      x2={Math.cos(angle) * length}
                      y2={Math.sin(angle) * length}
                    />
                  );
                })}
              </g>
              <g className="welding-arc-sparks" transform={`translate(${sparkPoint.x} ${sparkPoint.y})`}>
                {Array.from({ length: 18 }, (_, index) => {
                  const direction = index % 2 === 0 ? 1 : -1;
                  const horizontalDistance = direction * (18 + (index % 7) * 6);
                  const peakHeight = -(18 + (index % 5) * 7);
                  const fallDistance = 12 + (index % 4) * 7;
                  const duration = 0.56 + (index % 6) * 0.07;
                  const delay = -((index % 9) * 0.08);
                  return (
                    <g
                      key={index}
                      className="welding-arc-spark-x"
                      style={{
                        "--arc-x": `${horizontalDistance}px`,
                        "--arc-peak": `${peakHeight}px`,
                        "--arc-fall": `${fallDistance}px`,
                        "--arc-duration": `${duration}s`,
                        "--arc-delay": `${delay}s`,
                      } as CSSProperties}
                    >
                      <circle className="welding-arc-spark-y" r={0.9 + (index % 3) * 0.35} />
                    </g>
                  );
                })}
              </g>
              <image
                className="welding-hotspot-sprite"
                href="/ui/welding/spark-transparent.png"
                x={sparkPoint.x - 85}
                y={sparkPoint.y - 63.75}
                width="170"
                height="127.5"
                preserveAspectRatio="xMidYMid meet"
              />
            </svg>
          ) : null}

          {gunVisible && phase !== "success" ? (
            // Use the project-provided Weldingtorch.png unchanged; its nozzle already points left.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={`welding-gun-cursor${showingSparks ? " is-active" : ""}`}
              src="/ui/welding/Weldingtorch.png"
              alt=""
              draggable={false}
              style={{
                left: `${(sparkPoint.x / WELDING_ROUTE_VIEWBOX.width) * 100}%`,
                top: `${(sparkPoint.y / WELDING_ROUTE_VIEWBOX.height) * 100}%`,
              }}
            />
          ) : null}

          {phase === "intro" ? (
            <div className="welding-puzzle-intro">
              <div className="welding-puzzle-intro-panel">
                <small>WELDING ROUTE BRIEFING</small>
                <strong>先觀察正確焊接路線</strong>
                <p>按下開始後，焊槍會自動走過一次正確路線；預覽結束後再交由你操作。</p>
                <button
                  autoFocus
                  className={`welding-puzzle-primary-action${!exitSelected ? " is-gamepad-selected" : ""}`}
                  type="button"
                  data-gamepad-selected={!exitSelected || undefined}
                  onFocus={() => setExitSelected(false)}
                  onMouseEnter={() => setExitSelected(false)}
                  onClick={startPreviewSequence}
                >
                  開始預覽路線
                </button>
              </div>
            </div>
          ) : null}

          {phase === "countdown" ? (
            <div className="welding-preview-countdown" role="status" aria-live="polite">
              <span>預覽焊接方式</span>
              <strong key={previewCountdown}>{previewCountdown}</strong>
            </div>
          ) : null}

          {phase === "success" ? (
            <div className="welding-puzzle-success" role="status">
              <small>WELDING COMPLETE</small>
              <strong>焊接完成</strong>
              <span>接點強度穩定</span>
              <button
                className={`welding-puzzle-primary-action${!exitSelected ? " is-gamepad-selected" : ""}`}
                type="button"
                data-gamepad-selected={!exitSelected || undefined}
                onFocus={() => setExitSelected(false)}
                onMouseEnter={() => setExitSelected(false)}
                onClick={confirmCompletion}
              >
                確認完成
              </button>
            </div>
          ) : null}
        </div>

        <footer className="welding-puzzle-footer">
          <span><b>PC／行動裝置</b> 長按左鍵或觸控焊接</span>
          <span><b>手把</b> 右搖桿移動 · 靠近起點後按住 RT</span>
          <span className="welding-route-legend"><i /> 可自由選擇任一連續分岔</span>
        </footer>
      </section>
    </div>
  );
}
