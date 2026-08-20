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
  getWeldingEdgeLength,
  projectPointToWeldingEdge,
  type WeldingPoint,
  type WeldingRouteEdge,
} from "./welding-route-puzzle";

type WeldingPuzzlePhase =
  | "intro"
  | "countdown"
  | "preview"
  | "ready"
  | "welding"
  | "failure"
  | "failure-exit"
  | "success";
type WeldingInputMode = "pointer" | "gamepad";
type WeldingTrailPoint = WeldingPoint & {
  trailId: number;
  createdAt: number;
  jitterX: number;
  jitterY: number;
  settlePoint: WeldingPoint;
  canSettle: boolean;
};

type WeldingRoutePuzzleProps = {
  onCancel: () => void;
  onComplete: () => void;
  onFail: () => void;
  onRequestNextStage?: () => boolean;
};

const START_SNAP_DISTANCE = 34;
const POINTER_TRACK_TOLERANCE = 29;
const JUNCTION_GRACE_RADIUS = 42;
const WRONG_BRANCH_GRACE_DISTANCE = 80;
const BACKTRACK_ALLOWANCE = 34;
const POINTER_SPRING_STRENGTH = 34;
const POINTER_SPRING_DAMPING = 10.5;
const PREVIEW_DURATION = 4200;
const GAMEPAD_CURSOR_SPEED = 210;
const WELD_TRAIL_POINT_SPACING = 2.2;
const MAX_WELD_TRAIL_POINTS = 72;
const WELD_TRAIL_JITTER = 2.4;
const WELD_TRAIL_SETTLE_DELAY = 150;
const WELD_TRAIL_SETTLE_DURATION = 720;
const WELD_TRAIL_FADE_DELAY = 620;
const WELD_TRAIL_FADE_DURATION = 520;
const WELD_TRAIL_LIFETIME = WELD_TRAIL_FADE_DELAY + WELD_TRAIL_FADE_DURATION + 100;
const WELD_CORRECTION_FOLLOW_RATE = 4.6;
const FAILURE_MESSAGE_DURATION = 1000;
const FAILURE_EXIT_DURATION = 420;

const distance = (a: WeldingPoint, b: WeldingPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const smoothStep = (value: number) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

const lerpPoint = (edge: WeldingRouteEdge, t: number): WeldingPoint => ({
  x: edge.start.x + (edge.end.x - edge.start.x) * t,
  y: edge.start.y + (edge.end.y - edge.start.y) * t,
});

const clampToBoard = (point: WeldingPoint): WeldingPoint => ({
  x: Math.max(8, Math.min(WELDING_ROUTE_VIEWBOX.width - 8, point.x)),
  y: Math.max(8, Math.min(WELDING_ROUTE_VIEWBOX.height - 8, point.y)),
});

const getTrailDisplayPoint = (
  point: WeldingTrailPoint,
  now: number,
): WeldingPoint & { opacity: number } => {
  const age = Math.max(0, now - point.createdAt);
  const settleProgress = point.canSettle
    ? smoothStep((age - WELD_TRAIL_SETTLE_DELAY) / WELD_TRAIL_SETTLE_DURATION)
    : 0;
  const rawPoint = {
    x: point.x + point.jitterX,
    y: point.y + point.jitterY,
  };
  // Correct strokes settle onto the precise seam and can fade away. A wrong
  // stroke must stay visible: hiding it makes the torch look as if it were
  // blocked at the junction even though the player kept drawing.
  const opacity = point.canSettle
    ? 1 - smoothStep(
        (age - WELD_TRAIL_FADE_DELAY) / WELD_TRAIL_FADE_DURATION,
      )
    : 1;
  return {
    x: rawPoint.x + (point.settlePoint.x - rawPoint.x) * settleProgress,
    y: rawPoint.y + (point.settlePoint.y - rawPoint.y) * settleProgress,
    opacity,
  };
};

const sourceRoutePoints = (points: WeldingPoint[]) =>
  points.map((point) => `${point.x},${point.y}`).join(" ");

const getRoutePointAtProgress = (
  edges: WeldingRouteEdge[],
  progress: number,
): { point: WeldingPoint; edgeIndex: number; edgeProgress: number } => {
  const lengths = edges.map(getWeldingEdgeLength);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let remaining = Math.max(0, Math.min(1, progress)) * totalLength;
  for (let index = 0; index < edges.length; index += 1) {
    const length = lengths[index] || 1;
    if (remaining <= length || index === edges.length - 1) {
      const edgeProgress = Math.max(0, Math.min(1, remaining / length));
      return {
        point: lerpPoint(edges[index], edgeProgress),
        edgeIndex: index,
        edgeProgress,
      };
    }
    remaining -= length;
  }
  const lastIndex = edges.length - 1;
  return { point: edges[lastIndex].end, edgeIndex: lastIndex, edgeProgress: 1 };
};

const getNormalizedRouteProgress = (
  edges: WeldingRouteEdge[],
  edgeIndex: number,
  edgeProgress: number,
) => {
  const lengths = edges.map(getWeldingEdgeLength);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0) || 1;
  const completedLength = lengths
    .slice(0, Math.max(0, edgeIndex))
    .reduce((sum, length) => sum + length, 0);
  const currentLength = lengths[Math.max(0, edgeIndex)] ?? 0;
  return Math.max(
    0,
    Math.min(1, (completedLength + currentLength * edgeProgress) / totalLength),
  );
};

const getPrimaryGamepad = () => {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return null;
  }
  return [...navigator.getGamepads()].find((gamepad) => gamepad?.connected) ?? null;
};

export function WeldingRoutePuzzle({
  onCancel,
  onComplete,
  onFail,
  onRequestNextStage,
}: WeldingRoutePuzzleProps) {
  const [session] = useState(() => createRandomWeldingRoute());
  const [phase, setPhase] = useState<WeldingPuzzlePhase>("intro");
  const [countdown, setCountdown] = useState(3);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [inputMode, setInputMode] = useState<WeldingInputMode>("pointer");
  const [edgeIndex, setEdgeIndex] = useState(0);
  const [edgeProgress, setEdgeProgress] = useState(0);
  const [gunPoint, setGunPoint] = useState<WeldingPoint>(session.start);
  const [gunVisible, setGunVisible] = useState(false);
  const [pointerHeld, setPointerHeld] = useState(false);
  const [weldTrail, setWeldTrail] = useState<WeldingTrailPoint[]>([]);
  const [weldTrailClock, setWeldTrailClock] = useState(0);
  const [correctedRouteProgress, setCorrectedRouteProgress] = useState(0);
  const [exitSelected, setExitSelected] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<WeldingPuzzlePhase>("intro");
  const edgeIndexRef = useRef(0);
  const edgeProgressRef = useRef(0);
  const gunPointRef = useRef<WeldingPoint>(session.start);
  const pointerTargetRef = useRef<WeldingPoint>(session.start);
  const gunVelocityRef = useRef<WeldingPoint>({ x: 0, y: 0 });
  const furthestEdgeProgressRef = useRef(0);
  const pointerHeldRef = useRef(false);
  const weldTrailRef = useRef<WeldingTrailPoint[]>([]);
  const weldTrailIdRef = useRef(0);
  const previousWeldSampleRef = useRef<WeldingPoint | null>(null);
  const wrongRouteTravelRef = useRef(0);
  const wrongBranchEdgeRef = useRef<WeldingRouteEdge | null>(null);
  const correctedRouteProgressRef = useRef(0);
  const correctionTargetProgressRef = useRef(0);
  const finishedRef = useRef(false);
  const failureMessageTimeoutRef = useRef<number | null>(null);
  const failureExitTimeoutRef = useRef<number | null>(null);
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

  const updateRoutePosition = (
    nextEdgeIndex: number,
    nextProgress: number,
    snapGunToRoute = true,
  ) => {
    if (nextEdgeIndex !== edgeIndexRef.current) {
      furthestEdgeProgressRef.current = nextProgress;
    } else {
      furthestEdgeProgressRef.current = Math.max(
        furthestEdgeProgressRef.current,
        nextProgress,
      );
    }
    edgeIndexRef.current = nextEdgeIndex;
    edgeProgressRef.current = nextProgress;
    correctionTargetProgressRef.current = getNormalizedRouteProgress(
      session.edges,
      nextEdgeIndex,
      nextProgress,
    );
    setEdgeIndex(nextEdgeIndex);
    setEdgeProgress(nextProgress);
    if (snapGunToRoute) updateGunPoint(lerpPoint(session.edges[nextEdgeIndex], nextProgress));
  };

  const failPuzzle = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    pointerHeldRef.current = false;
    setPointerHeld(false);
    previousWeldSampleRef.current = null;
    gunVelocityRef.current = { x: 0, y: 0 };
    wrongBranchEdgeRef.current = null;
    setGunVisible(false);
    updatePhase("failure");

    failureMessageTimeoutRef.current = window.setTimeout(() => {
      updatePhase("failure-exit");
      failureExitTimeoutRef.current = window.setTimeout(() => {
        onFail();
      }, FAILURE_EXIT_DURATION);
    }, FAILURE_MESSAGE_DURATION);
  };

  useEffect(() => () => {
    if (failureMessageTimeoutRef.current !== null) {
      window.clearTimeout(failureMessageTimeoutRef.current);
    }
    if (failureExitTimeoutRef.current !== null) {
      window.clearTimeout(failureExitTimeoutRef.current);
    }
  }, []);

  const completePuzzle = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    pointerHeldRef.current = false;
    setPointerHeld(false);
    updatePhase("success");
  };

  const createWeldTrailPoint = (point: WeldingPoint): WeldingTrailPoint => {
    const clamped = clampToBoard(point);
    const currentIndex = edgeIndexRef.current;
    const candidateEdges = [
      session.edges[currentIndex],
      session.edges[currentIndex + 1],
    ].filter((edge): edge is WeldingRouteEdge => Boolean(edge));
    const closestProjection = candidateEdges
      .map((edge) => projectPointToWeldingEdge(clamped, edge))
      .sort((a, b) => a.distance - b.distance)[0];
    const trailId = (weldTrailIdRef.current += 1);
    const angle = trailId * 2.399963229728653;
    const jitterScale = 0.45 + ((trailId * 37) % 55) / 100;
    const canSettle =
      wrongBranchEdgeRef.current === null &&
      Boolean(closestProjection) &&
      closestProjection.distance <= POINTER_TRACK_TOLERANCE;
    return {
      ...clamped,
      trailId,
      createdAt: typeof performance === "undefined" ? 0 : performance.now(),
      jitterX: Math.cos(angle) * WELD_TRAIL_JITTER * jitterScale,
      jitterY: Math.sin(angle) * WELD_TRAIL_JITTER * jitterScale,
      settlePoint: canSettle ? closestProjection.point : clamped,
      canSettle,
    };
  };

  const appendWeldTrail = (point: WeldingPoint, force = false) => {
    const clamped = clampToBoard(point);
    const previousPoint = weldTrailRef.current.at(-1);
    if (!force && previousPoint && distance(previousPoint, clamped) < WELD_TRAIL_POINT_SPACING) {
      return;
    }
    const nextTrail = [
      ...weldTrailRef.current,
      createWeldTrailPoint(clamped),
    ];
    if (nextTrail.length > MAX_WELD_TRAIL_POINTS) {
      nextTrail.splice(0, nextTrail.length - MAX_WELD_TRAIL_POINTS);
    }
    weldTrailRef.current = nextTrail;
    setWeldTrail(nextTrail);
  };

  const finishCurrentEdge = () => {
    const currentIndex = edgeIndexRef.current;
    if (currentIndex >= session.edges.length - 1) {
      updateRoutePosition(currentIndex, 1);
      completePuzzle();
      return true;
    }
    updateRoutePosition(currentIndex + 1, 0);
    return true;
  };

  const finishPointerEdgeIfUnambiguous = () => {
    const currentIndex = edgeIndexRef.current;
    if (currentIndex >= session.edges.length - 1) {
      finishCurrentEdge();
      return;
    }
    const currentEdge = session.edges[currentIndex];
    const outgoing = session.graph.edges.filter((edge) => edge.from === currentEdge.to);
    if (outgoing.length <= 1) finishCurrentEdge();
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

  const beginPointerWeld = (point: WeldingPoint) => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "welding") return;
    const expectedPoint = lerpPoint(
      session.edges[edgeIndexRef.current],
      edgeProgressRef.current,
    );
    if (distance(point, expectedPoint) > START_SNAP_DISTANCE) return;
    pointerHeldRef.current = true;
    setPointerHeld(true);
    updatePhase("welding");
    pointerTargetRef.current = point;
    gunVelocityRef.current = { x: 0, y: 0 };
    updateGunPoint(expectedPoint);
    wrongBranchEdgeRef.current = null;
    const initialTrailPoint = createWeldTrailPoint(expectedPoint);
    initialTrailPoint.jitterX = 0;
    initialTrailPoint.jitterY = 0;
    weldTrailRef.current = [initialTrailPoint];
    setWeldTrail([initialTrailPoint]);
    previousWeldSampleRef.current = expectedPoint;
    wrongRouteTravelRef.current = 0;
    const currentRouteProgress = getNormalizedRouteProgress(
      session.edges,
      edgeIndexRef.current,
      edgeProgressRef.current,
    );
    correctedRouteProgressRef.current = currentRouteProgress;
    correctionTargetProgressRef.current = currentRouteProgress;
    setCorrectedRouteProgress(currentRouteProgress);
  };

  const advancePointerWeld = (point: WeldingPoint) => {
    if (!pointerHeldRef.current || phaseRef.current !== "welding") return;
    appendWeldTrail(point);
    const previousSample = previousWeldSampleRef.current;
    const sampleTravel = previousSample ? distance(previousSample, point) : 0;
    previousWeldSampleRef.current = point;
    const currentIndex = edgeIndexRef.current;
    const currentEdge = session.edges[currentIndex];
    const currentProgress = edgeProgressRef.current;
    const activeWrongBranch = wrongBranchEdgeRef.current;
    if (activeWrongBranch) {
      const wrongProjection = projectPointToWeldingEdge(point, activeWrongBranch);
      const returnedToJunction =
        wrongProjection.t <= 0.03 &&
        distance(point, activeWrongBranch.start) <= JUNCTION_GRACE_RADIUS;
      if (returnedToJunction) {
        wrongBranchEdgeRef.current = null;
        wrongRouteTravelRef.current = 0;
      } else {
        wrongRouteTravelRef.current =
          wrongProjection.t * getWeldingEdgeLength(activeWrongBranch);
        // Keep the torch and the live stroke completely free on a wrong
        // branch. The projection is used only to measure the mistake; it must
        // never be fed back into the cursor position.
        wrongRouteTravelRef.current = Math.max(
          wrongRouteTravelRef.current,
          wrongProjection.distance,
        );
        if (wrongRouteTravelRef.current > WRONG_BRANCH_GRACE_DISTANCE) {
          failPuzzle();
        }
        return;
      }
    }
    const projection = projectPointToWeldingEdge(point, currentEdge);

    if (currentProgress > 0.7 && currentIndex < session.edges.length - 1) {
      const outgoing = session.graph.edges.filter((edge) => edge.from === currentEdge.to);
      const candidates = outgoing
        .map((edge) => ({ edge, projection: projectPointToWeldingEdge(point, edge) }))
        .filter((candidate) => candidate.projection.t > 0.04 && candidate.projection.distance <= POINTER_TRACK_TOLERANCE)
        .sort((a, b) => a.projection.distance - b.projection.distance);
      if (candidates.length > 0) {
        const selected = candidates[0];
        const expectedNext = session.edges[currentIndex + 1];
        if (selected.edge.id !== expectedNext.id) {
          wrongBranchEdgeRef.current = selected.edge;
          const wrongBranchDistance =
            selected.projection.t * getWeldingEdgeLength(selected.edge);
          // Measure the actual excursion from the junction so retreating along
          // the wrong branch reduces the error instead of accumulating forever.
          wrongRouteTravelRef.current = wrongBranchDistance;
          if (wrongRouteTravelRef.current > WRONG_BRANCH_GRACE_DISTANCE) failPuzzle();
          return;
        }
        wrongBranchEdgeRef.current = null;
        wrongRouteTravelRef.current = 0;
        updateRoutePosition(currentIndex + 1, selected.projection.t, false);
        if (selected.projection.t >= 0.995) finishPointerEdgeIfUnambiguous();
        return;
      }
    }

    if (projection.distance > POINTER_TRACK_TOLERANCE) {
      wrongRouteTravelRef.current += sampleTravel;
    } else {
      wrongRouteTravelRef.current = 0;
    }
    // Off-route drawing is allowed and rendered normally. Only the accumulated
    // wrong travel is judged, and only after it actually exceeds 80 px.
    if (wrongRouteTravelRef.current > WRONG_BRANCH_GRACE_DISTANCE) {
      failPuzzle();
      return;
    }
    const edgeLength = getWeldingEdgeLength(currentEdge) || 1;
    const minimumAllowedProgress = Math.max(
      0,
      furthestEdgeProgressRef.current - BACKTRACK_ALLOWANCE / edgeLength,
    );
    if (
      projection.distance <= POINTER_TRACK_TOLERANCE &&
      projection.t >= minimumAllowedProgress
    ) {
      const nextProgress = projection.t < currentProgress
        ? Math.max(minimumAllowedProgress, currentProgress - (currentProgress - projection.t) * 0.2)
        : projection.t;
      updateRoutePosition(currentIndex, nextProgress, false);
      if (nextProgress >= 0.995) finishPointerEdgeIfUnambiguous();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
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
    beginPointerWeld(point);
  };

  const stopPointerWeld = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerHeldRef.current = false;
    setPointerHeld(false);
    wrongBranchEdgeRef.current = null;
    previousWeldSampleRef.current = null;
    wrongRouteTravelRef.current = 0;
  };

  const startPreviewSequence = () => {
    setExitSelected(false);
    setCountdown(3);
    setPreviewProgress(0);
    updatePhase("countdown");
  };

  const confirmCompletion = () => {
    if (onRequestNextStage?.()) return;
    onComplete();
  };

  useEffect(() => {
    if (phase !== "countdown") return;
    const countdownTimer = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown((value) => value - 1);
      } else {
        setPreviewProgress(0);
        updatePhase("preview");
      }
    }, 1000);
    return () => window.clearTimeout(countdownTimer);
  }, [countdown, phase]);

  useEffect(() => {
    if (phase !== "preview") return;
    let frameId = 0;
    let readyTimer = 0;
    const startedAt = performance.now();
    const drawPreview = (now: number) => {
      const linearProgress = Math.min(1, (now - startedAt) / PREVIEW_DURATION);
      const easedProgress =
        linearProgress < 0.5
          ? 2 * linearProgress * linearProgress
          : 1 - ((-2 * linearProgress + 2) ** 2) / 2;
      setPreviewProgress(easedProgress);
      if (linearProgress < 1) {
        frameId = window.requestAnimationFrame(drawPreview);
      } else {
        readyTimer = window.setTimeout(() => updatePhase("ready"), 280);
      }
    };
    frameId = window.requestAnimationFrame(drawPreview);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(readyTimer);
    };
  }, [phase]);

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
      if (weldTrailRef.current.length > 0) {
        const visibleTrail = weldTrailRef.current.filter(
          (point) =>
            !point.canSettle || now - point.createdAt <= WELD_TRAIL_LIFETIME,
        );
        if (visibleTrail.length !== weldTrailRef.current.length) {
          weldTrailRef.current = visibleTrail;
          setWeldTrail(visibleTrail);
        }
        setWeldTrailClock(now);
      }
      if (
        inputMode === "pointer" &&
        gunVisible &&
        phaseRef.current !== "intro" &&
        phaseRef.current !== "countdown" &&
        phaseRef.current !== "preview" &&
        phaseRef.current !== "success"
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
          advancePointerWeld(nextPoint);
        }
      }

      const correctionTarget = correctionTargetProgressRef.current;
      const currentCorrection = correctedRouteProgressRef.current;
      if (correctionTarget > currentCorrection) {
        const followAmount = 1 - Math.exp(-WELD_CORRECTION_FOLLOW_RATE * deltaTime);
        const remaining = correctionTarget - currentCorrection;
        const nextCorrection = remaining < 0.00035
          ? correctionTarget
          : currentCorrection + remaining * followAmount;
        correctedRouteProgressRef.current = nextCorrection;
        setCorrectedRouteProgress(nextCorrection);
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

        if (rightStickActive) {
          setInputMode("gamepad");
          setGunVisible(true);
        }

        if (navigateUp && !previousGamepadButtonsRef.current.navigateUp) {
          setExitSelected(true);
        }
        if (navigateDown && !previousGamepadButtonsRef.current.navigateDown) {
          setExitSelected(false);
        }

        const failurePlaying =
          phaseRef.current === "failure" || phaseRef.current === "failure-exit";
        if (backPressed && !previousGamepadButtonsRef.current.back && !failurePlaying) onCancel();
        if (confirmPressed && !previousGamepadButtonsRef.current.confirm && !failurePlaying) {
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
            rightTriggerHeld && phaseRef.current === "welding";
          if (
            rightStickActive &&
            phaseRef.current !== "success" &&
            !gamepadActivelyWelding
          ) {
            pointerTargetRef.current = clampToBoard({
              x: pointerTargetRef.current.x + rightX * GAMEPAD_CURSOR_SPEED * deltaTime,
              y: pointerTargetRef.current.y + rightY * GAMEPAD_CURSOR_SPEED * deltaTime,
            });
          }
          if (
            rightTriggerHeld &&
            (phaseRef.current === "ready" || phaseRef.current === "welding")
          ) {
            if (phaseRef.current === "ready") {
              if (distance(gunPointRef.current, session.start) <= START_SNAP_DISTANCE) {
                beginPointerWeld(gunPointRef.current);
              }
            } else if (rightStickActive) {
              const intendedPoint = clampToBoard({
                x: gunPointRef.current.x + rightX * GAMEPAD_CURSOR_SPEED * deltaTime,
                y: gunPointRef.current.y + rightY * GAMEPAD_CURSOR_SPEED * deltaTime,
              });
              // The right stick controls the real weld position. Never project
              // it back onto the expected route: wrong branches must be
              // drawable just like pointer input, with failure only after the
              // shared 80 px grace distance.
              pointerTargetRef.current = intendedPoint;
              gunVelocityRef.current = { x: 0, y: 0 };
              updateGunPoint(intendedPoint);
              advancePointerWeld(intendedPoint);
            }
          } else {
            pointerHeldRef.current = false;
            setPointerHeld(false);
            if (rightStickActive && phaseRef.current !== "success") {
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
    // The RAF intentionally reads the current refs; remounting creates a fresh session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitSelected, gunVisible, inputMode, onCancel, session]);

  const activelyWelding = phase === "welding" && pointerHeld;
  // Give the preview a visible hot seam from its very first moving frame.
  // Without this small visual seed, the gun can cover the sub-pixel segment
  // and make the dark route underneath appear before the red heat catches up.
  const visiblePreviewProgress = previewProgress > 0
    ? Math.max(previewProgress, 0.012)
    : 0;
  const previewPosition = getRoutePointAtProgress(
    session.edges,
    visiblePreviewProgress,
  );
  const previewCompletedEdges = session.edges.slice(0, previewPosition.edgeIndex);
  const previewCurrentEdge = session.edges[previewPosition.edgeIndex];
  const previewPartialEnd = lerpPoint(previewCurrentEdge, previewPosition.edgeProgress);
  const showingPreviewWeld = phase === "preview";
  const sparkPoint = showingPreviewWeld ? previewPosition.point : gunPoint;
  const showingSparks = activelyWelding || showingPreviewWeld;
  const liveRouteProgress = getNormalizedRouteProgress(
    session.edges,
    edgeIndex,
    edgeProgress,
  );
  // While the player is actively welding a valid route, the red-hot layer
  // must reach the current weld point immediately. The slower corrected
  // progress remains useful after movement for the settling effect, but it
  // must never expose a scorch-only prefix under the active torch.
  const visibleCorrectedRouteProgress = activelyWelding
    ? Math.max(correctedRouteProgress, liveRouteProgress)
    : correctedRouteProgress;
  const correctedRoutePosition = getRoutePointAtProgress(
    session.edges,
    visibleCorrectedRouteProgress,
  );
  const weldedEdges = session.edges.slice(0, correctedRoutePosition.edgeIndex);
  const weldedCurrentEdge = session.edges[correctedRoutePosition.edgeIndex];
  const weldedPartialEnd = lerpPoint(
    weldedCurrentEdge,
    correctedRoutePosition.edgeProgress,
  );
  const displayedWeldTrail = weldTrail.map((point) =>
    getTrailDisplayPoint(point, weldTrailClock),
  );
  const showPreviewStartTerminal = showingPreviewWeld && previewProgress > 0;
  const showPreviewEndTerminal = showingPreviewWeld && previewProgress >= 0.999;

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
            {phase === "intro" ? "閱讀操作說明後開始預覽正確焊接路線" :
              phase === "countdown" ? "準備觀察自動焊接示範" :
              phase === "preview" ? "觀察焊槍從起點完整走到終點" :
              phase === "failure" || phase === "failure-exit" ? "焊接路線已超出容許範圍" :
              phase === "success" ? "結構接點已完成固定" :
                "從左側起點沿著正確路徑焊接至右側終點"}
          </p>
          <button
            className={exitSelected ? "is-gamepad-selected" : undefined}
            type="button"
            data-gamepad-selected={exitSelected || undefined}
            onFocus={() => setExitSelected(true)}
            onMouseEnter={() => setExitSelected(true)}
            onClick={onCancel}
            disabled={phase === "failure" || phase === "failure-exit"}
          >
            離開
          </button>
        </header>

        <div
          ref={boardRef}
          className="welding-puzzle-board"
          onPointerEnter={(event) => {
            setGunVisible(true);
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
            <defs>
              <filter id="welding-route-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4.6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="welding-hotspot-glow" x="-150%" y="-150%" width="400%" height="400%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <g className="welding-route-network">
              {WELDING_SOURCE_ROUTES.map((route) => (
                <polyline key={route.id} points={sourceRoutePoints(route.points)} />
              ))}
            </g>
            {phase === "preview" ? (
              <g className="welding-route-preview" filter="url(#welding-route-glow)">
                {previewCompletedEdges.map((edge) => (
                  <line key={edge.id} x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} />
                ))}
                {previewPosition.edgeProgress > 0 ? (
                  <line
                    x1={previewCurrentEdge.start.x}
                    y1={previewCurrentEdge.start.y}
                    x2={previewPartialEnd.x}
                    y2={previewPartialEnd.y}
                  />
                ) : null}
              </g>
            ) : null}
            <g className="welding-route-manual-trail">
              {displayedWeldTrail.slice(1).map((point, index) => {
                const previousPoint = displayedWeldTrail[index];
                return (
                  <line
                    key={weldTrail[index + 1].trailId}
                    x1={previousPoint.x}
                    y1={previousPoint.y}
                    x2={point.x}
                    y2={point.y}
                    opacity={Math.min(previousPoint.opacity, point.opacity)}
                  />
                );
              })}
            </g>
            <g className="welding-route-scorch">
              {weldedEdges.map((edge) => (
                <line key={edge.id} x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} />
              ))}
              {correctedRoutePosition.edgeProgress > 0 ? (
                <line
                  x1={weldedCurrentEdge.start.x}
                  y1={weldedCurrentEdge.start.y}
                  x2={weldedPartialEnd.x}
                  y2={weldedPartialEnd.y}
                />
              ) : null}
            </g>
            <g className="welding-route-seam" filter="url(#welding-route-glow)">
              {weldedEdges.map((edge) => (
                <line key={edge.id} x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} />
              ))}
              {correctedRoutePosition.edgeProgress > 0 ? (
                <line
                  x1={weldedCurrentEdge.start.x}
                  y1={weldedCurrentEdge.start.y}
                  x2={weldedPartialEnd.x}
                  y2={weldedPartialEnd.y}
                />
              ) : null}
            </g>
            {showPreviewStartTerminal || showPreviewEndTerminal ? (
              <g className="welding-route-terminals">
                {showPreviewStartTerminal ? (
                  <circle className="is-start" cx={session.start.x} cy={session.start.y} r="8" />
                ) : null}
                {showPreviewEndTerminal ? (
                  <circle className="is-end" cx={session.end.x} cy={session.end.y} r="8" />
                ) : null}
              </g>
            ) : null}
            {showingSparks ? (
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
            ) : null}
            {showingSparks ? (
              <g className="welding-hotspot" filter="url(#welding-hotspot-glow)">
                <circle cx={sparkPoint.x} cy={sparkPoint.y} r="10" />
                <circle cx={sparkPoint.x} cy={sparkPoint.y} r="3.4" />
              </g>
            ) : null}
          </svg>

          {(gunVisible || showingPreviewWeld) && phase !== "intro" && phase !== "countdown" && phase !== "failure" && phase !== "failure-exit" && phase !== "success" ? (
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
            <div className="welding-puzzle-intro" role="group" aria-label="焊接方式說明">
              <div className="welding-puzzle-intro-panel">
                <small>WELDING INSTRUCTIONS</small>
                <strong>先觀察正確焊接路線</strong>
                <p>
                  預覽結束後，按住滑鼠左鍵或手把 RT，使用滑鼠／右搖桿沿路線焊接。
                  岔路口允許短距離修正，但偏離過遠仍會失敗。
                </p>
                <button
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
              <strong key={countdown}>{countdown}</strong>
            </div>
          ) : null}

          {phase === "failure" || phase === "failure-exit" ? (
            <div className="welding-puzzle-failure" role="status" aria-live="assertive">
              <small>WELDING ERROR</small>
              <strong>焊接錯誤了</strong>
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
          <span className="welding-route-legend"><i /> 正確路線僅於開始時顯示</span>
        </footer>
      </section>
    </div>
  );
}
