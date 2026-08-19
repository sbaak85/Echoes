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
  selectWeldingBranchByDirection,
  type WeldingPoint,
  type WeldingRouteEdge,
} from "./welding-route-puzzle";

type WeldingPuzzlePhase = "preview" | "ready" | "welding" | "success";
type WeldingInputMode = "pointer" | "gamepad";

type WeldingRoutePuzzleProps = {
  onCancel: () => void;
  onComplete: () => void;
  onFail: () => void;
  onRequestNextStage?: () => boolean;
};

const START_SNAP_DISTANCE = 34;
const POINTER_TRACK_TOLERANCE = 23;
const POINTER_FAIL_TOLERANCE = 49;
const GAMEPAD_CURSOR_SPEED = 210;
const GAMEPAD_WELD_SPEED = 118;

const distance = (a: WeldingPoint, b: WeldingPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const lerpPoint = (edge: WeldingRouteEdge, t: number): WeldingPoint => ({
  x: edge.start.x + (edge.end.x - edge.start.x) * t,
  y: edge.start.y + (edge.end.y - edge.start.y) * t,
});

const clampToBoard = (point: WeldingPoint): WeldingPoint => ({
  x: Math.max(8, Math.min(WELDING_ROUTE_VIEWBOX.width - 8, point.x)),
  y: Math.max(8, Math.min(WELDING_ROUTE_VIEWBOX.height - 8, point.y)),
});

const sourceRoutePoints = (points: WeldingPoint[]) =>
  points.map((point) => `${point.x},${point.y}`).join(" ");

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
  const [phase, setPhase] = useState<WeldingPuzzlePhase>("preview");
  const [inputMode, setInputMode] = useState<WeldingInputMode>("pointer");
  const [edgeIndex, setEdgeIndex] = useState(0);
  const [edgeProgress, setEdgeProgress] = useState(0);
  const [gunPoint, setGunPoint] = useState<WeldingPoint>(session.start);
  const [gunVisible, setGunVisible] = useState(false);
  const [pointerHeld, setPointerHeld] = useState(false);
  const [exitSelected, setExitSelected] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<WeldingPuzzlePhase>("preview");
  const edgeIndexRef = useRef(0);
  const edgeProgressRef = useRef(0);
  const gunPointRef = useRef<WeldingPoint>(session.start);
  const pointerHeldRef = useRef(false);
  const finishedRef = useRef(false);
  const previousGamepadButtonsRef = useRef({ back: false, confirm: false });

  const updatePhase = (nextPhase: WeldingPuzzlePhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  };

  const updateGunPoint = (nextPoint: WeldingPoint) => {
    const clamped = clampToBoard(nextPoint);
    gunPointRef.current = clamped;
    setGunPoint(clamped);
  };

  const updateRoutePosition = (nextEdgeIndex: number, nextProgress: number) => {
    edgeIndexRef.current = nextEdgeIndex;
    edgeProgressRef.current = nextProgress;
    setEdgeIndex(nextEdgeIndex);
    setEdgeProgress(nextProgress);
    updateGunPoint(lerpPoint(session.edges[nextEdgeIndex], nextProgress));
  };

  const failPuzzle = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    pointerHeldRef.current = false;
    setPointerHeld(false);
    onFail();
  };

  const completePuzzle = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    pointerHeldRef.current = false;
    setPointerHeld(false);
    updatePhase("success");
  };

  const finishCurrentEdge = (direction?: WeldingPoint) => {
    const currentIndex = edgeIndexRef.current;
    if (currentIndex >= session.edges.length - 1) {
      updateRoutePosition(currentIndex, 1);
      completePuzzle();
      return true;
    }
    const currentEdge = session.edges[currentIndex];
    const expectedNext = session.edges[currentIndex + 1];
    const outgoing = session.graph.edges.filter((edge) => edge.from === currentEdge.to);
    if (direction && outgoing.length > 1) {
      const selected = selectWeldingBranchByDirection(outgoing, direction);
      if (!selected) return false;
      if (selected.id !== expectedNext.id) {
        failPuzzle();
        return false;
      }
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
    updateGunPoint(expectedPoint);
  };

  const advancePointerWeld = (point: WeldingPoint) => {
    if (!pointerHeldRef.current || phaseRef.current !== "welding") return;
    const currentIndex = edgeIndexRef.current;
    const currentEdge = session.edges[currentIndex];
    const currentProgress = edgeProgressRef.current;
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
          failPuzzle();
          return;
        }
        updateRoutePosition(currentIndex + 1, selected.projection.t);
        if (selected.projection.t >= 0.995) finishPointerEdgeIfUnambiguous();
        return;
      }
    }

    if (projection.distance > POINTER_FAIL_TOLERANCE) {
      failPuzzle();
      return;
    }
    if (projection.distance <= POINTER_TRACK_TOLERANCE && projection.t >= currentProgress - 0.025) {
      const nextProgress = Math.max(currentProgress, projection.t);
      updateRoutePosition(currentIndex, nextProgress);
      if (nextProgress >= 0.995) finishPointerEdgeIfUnambiguous();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = getBoardPoint(event.clientX, event.clientY);
    if (!point) return;
    setInputMode("pointer");
    setExitSelected(false);
    setGunVisible(true);
    if (pointerHeldRef.current) advancePointerWeld(point);
    else updateGunPoint(point);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    const point = getBoardPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setInputMode("pointer");
    setGunVisible(true);
    updateGunPoint(point);
    beginPointerWeld(point);
  };

  const stopPointerWeld = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerHeldRef.current = false;
    setPointerHeld(false);
  };

  useEffect(() => {
    const previewTimer = window.setTimeout(() => updatePhase("ready"), 2800);
    return () => window.clearTimeout(previewTimer);
  }, []);

  useEffect(() => {
    if (phase !== "success") return;
    const successTimer = window.setTimeout(() => {
      if (onRequestNextStage?.()) return;
      onComplete();
    }, 1250);
    return () => window.clearTimeout(successTimer);
  }, [onComplete, onRequestNextStage, phase]);

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
      const gamepad = getPrimaryGamepad();
      if (gamepad) {
        const rightX = Math.abs(gamepad.axes[2] ?? 0) >= 0.14 ? gamepad.axes[2] ?? 0 : 0;
        const rightY = Math.abs(gamepad.axes[3] ?? 0) >= 0.14 ? gamepad.axes[3] ?? 0 : 0;
        const rightStickActive = Math.hypot(rightX, rightY) > 0;
        const rightTriggerHeld = (gamepad.buttons[7]?.value ?? 0) >= 0.45;
        const backPressed = gamepad.buttons[1]?.pressed ?? false;
        const confirmPressed = gamepad.buttons[0]?.pressed ?? false;
        const dpadOrLeftStickActive =
          Math.abs(gamepad.axes[0] ?? 0) >= 0.65 ||
          Math.abs(gamepad.axes[1] ?? 0) >= 0.65 ||
          gamepad.buttons.slice(12, 16).some((button) => button?.pressed);

        if (rightStickActive) {
          setInputMode("gamepad");
          setExitSelected(false);
          setGunVisible(true);
        } else if (dpadOrLeftStickActive) {
          setExitSelected(true);
        }

        if (backPressed && !previousGamepadButtonsRef.current.back) onCancel();
        if (confirmPressed && !previousGamepadButtonsRef.current.confirm && exitSelected) onCancel();
        previousGamepadButtonsRef.current = { back: backPressed, confirm: confirmPressed };

        if (inputMode === "gamepad") {
          if (
            rightTriggerHeld &&
            (phaseRef.current === "ready" || phaseRef.current === "welding")
          ) {
            if (phaseRef.current === "ready") {
              if (distance(gunPointRef.current, session.start) <= START_SNAP_DISTANCE) {
                pointerHeldRef.current = true;
                setPointerHeld(true);
                updatePhase("welding");
                updateRoutePosition(0, 0);
              }
            } else if (rightStickActive) {
              const currentIndex = edgeIndexRef.current;
              const edge = session.edges[currentIndex];
              const vector = { x: edge.end.x - edge.start.x, y: edge.end.y - edge.start.y };
              const edgeLength = getWeldingEdgeLength(edge) || 1;
              const directionLength = Math.hypot(rightX, rightY) || 1;
              const alignment =
                (vector.x / edgeLength) * (rightX / directionLength) +
                (vector.y / edgeLength) * (rightY / directionLength);
              if (edgeProgressRef.current >= 0.995) {
                finishCurrentEdge({ x: rightX, y: rightY });
              } else if (alignment > 0.08) {
                const nextProgress = Math.min(
                  1,
                  edgeProgressRef.current +
                    (GAMEPAD_WELD_SPEED * Math.max(0.28, alignment) * deltaTime) / edgeLength,
                );
                updateRoutePosition(currentIndex, nextProgress);
              }
            }
          } else {
            pointerHeldRef.current = false;
            setPointerHeld(false);
            if (rightStickActive && phaseRef.current !== "success") {
              updateGunPoint({
                x: gunPointRef.current.x + rightX * GAMEPAD_CURSOR_SPEED * deltaTime,
                y: gunPointRef.current.y + rightY * GAMEPAD_CURSOR_SPEED * deltaTime,
              });
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
  }, [exitSelected, inputMode, onCancel, session]);

  const currentEdge = session.edges[Math.min(edgeIndex, session.edges.length - 1)];
  const partialEnd = lerpPoint(currentEdge, edgeProgress);
  const completedEdges = session.edges.slice(0, edgeIndex);
  const activelyWelding = phase === "welding" && pointerHeld;

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
            {phase === "preview" ? "記住高熱標示的正確焊接路徑" :
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
                {session.edges.map((edge) => (
                  <line key={edge.id} x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} />
                ))}
              </g>
            ) : null}
            <g className="welding-route-scorch">
              {completedEdges.map((edge) => (
                <line key={edge.id} x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} />
              ))}
              {edgeProgress > 0 ? (
                <line x1={currentEdge.start.x} y1={currentEdge.start.y} x2={partialEnd.x} y2={partialEnd.y} />
              ) : null}
            </g>
            <g className="welding-route-seam" filter="url(#welding-route-glow)">
              {completedEdges.map((edge) => (
                <line key={edge.id} x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} />
              ))}
              {edgeProgress > 0 ? (
                <line x1={currentEdge.start.x} y1={currentEdge.start.y} x2={partialEnd.x} y2={partialEnd.y} />
              ) : null}
            </g>
            <g className="welding-route-terminals">
              <circle className="is-start" cx={session.start.x} cy={session.start.y} r="8" />
              <circle className="is-end" cx={session.end.x} cy={session.end.y} r="8" />
            </g>
            {activelyWelding ? (
              <g className="welding-sparks" transform={`translate(${gunPoint.x} ${gunPoint.y})`}>
                {Array.from({ length: 12 }, (_, index) => {
                  const angle = (index / 12) * Math.PI * 2 + (index % 3) * 0.18;
                  const length = 12 + (index % 4) * 6;
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
            {activelyWelding ? (
              <g className="welding-hotspot" filter="url(#welding-hotspot-glow)">
                <circle cx={gunPoint.x} cy={gunPoint.y} r="10" />
                <circle cx={gunPoint.x} cy={gunPoint.y} r="3.4" />
              </g>
            ) : null}
          </svg>

          {gunVisible && phase !== "success" ? (
            // A plain image keeps the generated transparent cursor at exact pixel geometry.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={`welding-gun-cursor${activelyWelding ? " is-active" : ""}`}
              src="/ui/welding/welding-gun-cursor.png"
              alt=""
              draggable={false}
              style={{
                left: `${(gunPoint.x / WELDING_ROUTE_VIEWBOX.width) * 100}%`,
                top: `${(gunPoint.y / WELDING_ROUTE_VIEWBOX.height) * 100}%`,
              }}
            />
          ) : null}

          {phase === "success" ? (
            <div className="welding-puzzle-success" role="status">
              <small>WELDING COMPLETE</small>
              <strong>焊接完成</strong>
              <span>接點強度穩定</span>
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
