import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getUnmetInteractionUseRequirements } from "../app/interaction-flow.ts";
import { resolvePublicAssetUrl } from "../app/public-asset-url.ts";
import { STORY_DIALOGUES } from "../app/story-content.ts";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import {
  WELDING_TOOL_HINT_ACTIVATION_EVENT_ID,
  WELDING_TOOL_HINT_FAILURE_COUNTER_ID,
  WELDING_TOOL_HINT_OBJECTIVE_ID,
  recordWeldingToolHintInteractionFailure,
} from "../app/welding-objective-hint.ts";
import {
  WELDING_START_DISTANCE_TOLERANCE_PX,
  advanceWeldingStartValidation,
  advanceWeldingWrongRouteDistance,
  createWeldingStartValidationState,
  createWeldingRouteFailureState,
  createRandomWeldingRoute,
  createWeldingRouteGraph,
  findWeldingPathRejoinIndex,
  getWeldingPathProgress,
  getWeldingSharedTrackPoint,
  isWeldingRouteComparisonNode,
  relaxWeldingSoftCorridorCursor,
  resolveWeldingBackwardHysteresis,
  resolveWeldingCandidateLeadership,
  resolveWeldingEndpointResult,
  resolveWeldingRouteNodeChoice,
  resolveWeldingSoftCorridorCursor,
  selectWeldingBranchByDirection,
  selectWeldingMagneticTrack,
  selectWeldingPointerTrack,
} from "../app/welding-route-puzzle.ts";

test("welding graph splits the crossing routes into connected branch nodes", () => {
  const graph = createWeldingRouteGraph();
  assert.ok(graph.nodes.length > 40);
  assert.ok(graph.edges.length > 50);
  assert.equal(graph.startNodeIds.length, 4);
  assert.equal(graph.endNodeIds.length, 4);
  assert.ok(graph.nodes.some((node) => graph.edges.filter((edge) => edge.from === node.id).length > 1));
});

test("every generated welding route is continuous and travels left to right", () => {
  for (let run = 0; run < 80; run += 1) {
    let step = run + 1;
    const session = createRandomWeldingRoute(() => {
      step = (step * 48271) % 2147483647;
      return step / 2147483647;
    });
    assert.ok(session.edges.length > 0);
    assert.equal(session.start.x, 20);
    assert.equal(session.end.x, 421);
    session.edges.forEach((edge, index) => {
      assert.ok(edge.end.x >= edge.start.x);
      if (index === 0) return;
      assert.equal(edge.from, session.edges[index - 1].to);
    });
  }
});

test("random generation composes different paths at graph branches", () => {
  const signatures = new Set();
  for (let run = 0; run < 40; run += 1) {
    let step = run + 13;
    const session = createRandomWeldingRoute(() => {
      step = (step * 16807) % 2147483647;
      return step / 2147483647;
    });
    signatures.add(session.edgeIds.join(","));
  }
  assert.ok(signatures.size >= 8, `expected varied composite routes, received ${signatures.size}`);
});

test("gamepad branch selection follows the nearest intended stick direction", () => {
  const branch = [
    {
      id: "up",
      from: "fork",
      to: "up-end",
      start: { x: 10, y: 10 },
      end: { x: 20, y: 2 },
      sourceRouteIds: [],
    },
    {
      id: "down",
      from: "fork",
      to: "down-end",
      start: { x: 10, y: 10 },
      end: { x: 20, y: 18 },
      sourceRouteIds: [],
    },
  ];
  assert.equal(selectWeldingBranchByDirection(branch, { x: 1, y: -0.8 })?.id, "up");
  assert.equal(selectWeldingBranchByDirection(branch, { x: 1, y: 0.8 })?.id, "down");
});

test("welding delays minor backward x motion until retreat intent is clear", () => {
  const slightRetreat = resolveWeldingBackwardHysteresis({
    committedPoint: { x: 100, y: 100 },
    candidatePoint: { x: 92, y: 94 },
    backwardConfirmed: false,
    confirmationDistance: 14,
  });
  assert.deepEqual(slightRetreat, {
    backwardConfirmed: false,
    shouldCommit: false,
  });

  const confirmedRetreat = resolveWeldingBackwardHysteresis({
    committedPoint: { x: 100, y: 100 },
    candidatePoint: { x: 86, y: 112 },
    backwardConfirmed: false,
    confirmationDistance: 14,
  });
  assert.deepEqual(confirmedRetreat, {
    backwardConfirmed: true,
    shouldCommit: true,
  });

  const continuingRetreat = resolveWeldingBackwardHysteresis({
    committedPoint: { x: 86, y: 112 },
    candidatePoint: { x: 84, y: 108 },
    backwardConfirmed: true,
    confirmationDistance: 14,
  });
  assert.deepEqual(continuingRetreat, {
    backwardConfirmed: true,
    shouldCommit: true,
  });

  const movingForwardAgain = resolveWeldingBackwardHysteresis({
    committedPoint: { x: 84, y: 108 },
    candidatePoint: { x: 86, y: 108 },
    backwardConfirmed: true,
    confirmationDistance: 14,
  });
  assert.deepEqual(movingForwardAgain, {
    backwardConfirmed: false,
    shouldCommit: true,
  });
});

test("candidate trails wait for a pending route to reclaim the lead before fading", () => {
  let trails = [
    { trailId: 1, progress: 200, pendingAbandonment: false, fading: false },
    { trailId: 2, progress: 0, pendingAbandonment: false, fading: false },
  ];
  let resolution = resolveWeldingCandidateLeadership({
    trails,
    leaderTrailId: 1,
    activeTrailId: 2,
  });
  assert.equal(resolution.leaderTrailId, 1);
  assert.equal(resolution.fadeTrailId, null);

  trails = resolution.trails.map((trail) =>
    trail.trailId === 2 ? { ...trail, progress: 210 } : trail,
  );
  resolution = resolveWeldingCandidateLeadership({
    trails,
    leaderTrailId: resolution.leaderTrailId,
    activeTrailId: 2,
  });
  assert.equal(resolution.leaderTrailId, 2);
  assert.equal(resolution.fadeTrailId, null);
  assert.equal(
    resolution.trails.find((trail) => trail.trailId === 1)?.pendingAbandonment,
    true,
  );

  trails = resolution.trails.map((trail) =>
    trail.trailId === 1 ? { ...trail, progress: 410 } : trail,
  );
  resolution = resolveWeldingCandidateLeadership({
    trails,
    leaderTrailId: resolution.leaderTrailId,
    activeTrailId: 1,
  });
  assert.equal(resolution.leaderTrailId, 1);
  assert.equal(resolution.fadeTrailId, 2);
  assert.equal(
    resolution.trails.find((trail) => trail.trailId === 2)?.fading,
    true,
  );
});

test("resuming an existing leader fades a shorter abandoned redraw", () => {
  const resolution = resolveWeldingCandidateLeadership({
    trails: [
      { trailId: 1, progress: 214, pendingAbandonment: false, fading: false },
      { trailId: 2, progress: 126, pendingAbandonment: false, fading: false },
    ],
    leaderTrailId: 1,
    activeTrailId: 1,
  });

  assert.equal(resolution.leaderTrailId, 1);
  assert.equal(resolution.fadeTrailId, 2);
  assert.equal(
    resolution.trails.find((trail) => trail.trailId === 2)?.fading,
    true,
  );
});

test("candidate progress counts the retained route and not unrelated hand movement", () => {
  const progress = getWeldingPathProgress([
    { edgeId: "a", point: { x: 0, y: 0 }, t: 0, segmentId: null },
    { edgeId: "a", point: { x: 30, y: 0 }, t: 0.3, segmentId: 1 },
    { edgeId: "b", point: { x: 30, y: 40 }, t: 0.4, segmentId: 2 },
  ]);
  assert.equal(progress, 70);
});

test("magnetic tracking selects the actual wrong graph branch instead of the answer", () => {
  const graph = createWeldingRouteGraph();
  const forkNode = graph.nodes.find((node) =>
    graph.edges.filter((edge) => edge.from === node.id).length >= 2 &&
    graph.edges.some((edge) => edge.to === node.id),
  );
  assert.ok(forkNode);
  const incoming = graph.edges.find((edge) => edge.to === forkNode.id);
  const outgoing = graph.edges.filter((edge) => edge.from === forkNode.id);
  assert.ok(incoming);
  assert.ok(outgoing.length >= 2);

  let selectedWrongBranch = null;
  for (const wrongEdge of outgoing) {
    const intendedPoint = {
      x: wrongEdge.start.x + (wrongEdge.end.x - wrongEdge.start.x) * 0.55,
      y: wrongEdge.start.y + (wrongEdge.end.y - wrongEdge.start.y) * 0.55,
    };
    const selected = selectWeldingMagneticTrack({
      point: intendedPoint,
      graphEdges: graph.edges,
      activeEdge: incoming,
      activeProgress: 0.97,
      startSnapDistance: 34,
      trackTolerance: 29,
      junctionRadius: 42,
      switchProgress: 0.68,
      switchTEpsilon: 0.025,
    });
    if (selected?.edge.id === wrongEdge.id) {
      selectedWrongBranch = selected;
      break;
    }
  }
  assert.ok(selectedWrongBranch, "a deliberately chosen wrong branch must become the magnetic track");
  assert.ok(selectedWrongBranch.distance < 0.001);
  assert.ok(selectedWrongBranch.t > 0.5);
});

test("gamepad magnetic tracking never jumps to an unconnected edge and breaks the seam", () => {
  const activeEdge = {
    id: "active",
    from: "a",
    to: "b",
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    sourceRouteIds: [],
  };
  const unrelatedEdge = {
    id: "unrelated",
    from: "c",
    to: "d",
    start: { x: 40, y: 20 },
    end: { x: 100, y: 20 },
    sourceRouteIds: [],
  };
  const selected = selectWeldingMagneticTrack({
    point: { x: 70, y: 20 },
    graphEdges: [activeEdge, unrelatedEdge],
    activeEdge,
    activeProgress: 0.4,
    startSnapDistance: 34,
    trackTolerance: 10,
    junctionRadius: 12,
    switchProgress: 0.68,
    switchTEpsilon: 0.025,
  });
  assert.equal(selected?.edge.id, activeEdge.id);
  assert.deepEqual(selected?.point, { x: 70, y: 0 });
});

test("gamepad can reverse to a junction and choose another connected branch", () => {
  const activeEdge = {
    id: "active",
    from: "fork",
    to: "right",
    start: { x: 0, y: 0 },
    end: { x: 40, y: 0 },
    sourceRouteIds: [],
  };
  const alternateEdge = {
    id: "alternate",
    from: "fork",
    to: "down",
    start: { x: 0, y: 0 },
    end: { x: 20, y: 20 },
    sourceRouteIds: [],
  };
  const selected = selectWeldingMagneticTrack({
    point: { x: 10, y: 10 },
    graphEdges: [activeEdge, alternateEdge],
    activeEdge,
    activeProgress: 0.02,
    startSnapDistance: 34,
    trackTolerance: 29,
    junctionRadius: 42,
    switchProgress: 0.68,
    switchTEpsilon: 0.025,
  });
  assert.equal(selected?.edge.id, alternateEdge.id);
  assert.deepEqual(selected?.point, { x: 10, y: 10 });
});

test("mouse welding projects the weld onto a wrong branch without snapping the cursor", () => {
  const graph = createWeldingRouteGraph();
  const forkNode = graph.nodes.find((node) =>
    graph.edges.filter((edge) => edge.from === node.id).length >= 2 &&
    graph.edges.some((edge) => edge.to === node.id),
  );
  assert.ok(forkNode);
  const incoming = graph.edges.find((edge) => edge.to === forkNode.id);
  const wrongEdge = graph.edges.filter((edge) => edge.from === forkNode.id)[1];
  assert.ok(incoming);
  assert.ok(wrongEdge);
  const pointerPoint = {
    x: wrongEdge.start.x + (wrongEdge.end.x - wrongEdge.start.x) * 0.6,
    y: wrongEdge.start.y + (wrongEdge.end.y - wrongEdge.start.y) * 0.6 + 4,
  };
  const selected = selectWeldingPointerTrack({
    point: pointerPoint,
    graphEdges: graph.edges,
    activeEdge: incoming,
    trackTolerance: 29,
  });
  assert.equal(selected?.edge.id, wrongEdge.id);
  assert.notDeepEqual(selected?.point, pointerPoint, "only the weld projection should snap");
});

test("returning from a wrong fork resolves the shared junction without a seam gap", () => {
  const graph = createWeldingRouteGraph();
  const forkNode = graph.nodes.find((node) =>
    graph.edges.filter((edge) => edge.from === node.id).length >= 2,
  );
  assert.ok(forkNode);
  const [wrongEdge, correctEdge] = graph.edges.filter(
    (edge) => edge.from === forkNode.id,
  );
  assert.ok(wrongEdge);
  assert.ok(correctEdge);
  assert.deepEqual(
    getWeldingSharedTrackPoint(wrongEdge, correctEdge),
    wrongEdge.start,
  );
});

test("path history detects a real retrace but ignores ordinary forward drawing", () => {
  const samples = [
    { edgeId: "edge-a", point: { x: 0, y: 0 }, t: 0, segmentId: null },
    { edgeId: "edge-a", point: { x: 10, y: 0 }, t: 0.25, segmentId: 1 },
    { edgeId: "edge-a", point: { x: 20, y: 0 }, t: 0.5, segmentId: 2 },
    { edgeId: "edge-a", point: { x: 30, y: 0 }, t: 0.75, segmentId: 3 },
  ];
  assert.equal(findWeldingPathRejoinIndex({
    samples,
    next: { edgeId: "edge-a", point: { x: 10.5, y: 0 }, t: 0.26 },
    minimumTailDistance: 12,
    pointTolerance: 5,
  }), 1);
  assert.equal(findWeldingPathRejoinIndex({
    samples,
    next: { edgeId: "edge-a", point: { x: 35, y: 0 }, t: 0.88 },
    minimumTailDistance: 12,
    pointTolerance: 5,
  }), -1);

  const shortExcursion = [
    { edgeId: "edge-b", point: { x: 0, y: 0 }, t: 0, segmentId: null },
    { edgeId: "edge-b", point: { x: 6, y: 0 }, t: 0.3, segmentId: 4 },
  ];
  assert.equal(findWeldingPathRejoinIndex({
    samples: shortExcursion,
    next: { edgeId: "edge-b", point: { x: 0.5, y: 0 }, t: 0.025 },
    minimumTailDistance: 4,
    pointTolerance: 5,
  }), 0);
});

test("welding UI includes generated assets, RT input, pointer capture and hidden native focus", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /gamepad\.buttons\[7\]/);
  assert.match(component, /setPointerCapture/);
  assert.match(component, /onPointerDown/);
  assert.match(component, /onRequestNextStage/);
  assert.match(styles, /\.welding-puzzle-dialog :focus-visible/);
  assert.match(styles, /cursor:\s*none/);
  assert.ok(existsSync(new URL("../public/ui/welding/Weldingtorch.png", import.meta.url)));
  assert.ok(existsSync(new URL("../public/ui/welding/brushed-metal-background.webp", import.meta.url)));
});

test("welding assets resolve under both local root and GitHub Pages base path", () => {
  assert.equal(
    resolvePublicAssetUrl("/", "/ui/welding/Weldingtorch.png"),
    "/ui/welding/Weldingtorch.png",
  );
  assert.equal(
    resolvePublicAssetUrl("/Echoes/", "ui/welding/Weldingtorch.png"),
    "/Echoes/ui/welding/Weldingtorch.png",
  );

  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /import\.meta\.env\.BASE_URL/);
  assert.match(component, /WELDING_BACKGROUND_URL/);
  assert.match(component, /href=\{WELDING_SPARK_URL\}/);
  assert.match(component, /src=\{WELDING_TORCH_URL\}/);
  assert.match(styles, /var\(--welding-board-background-image\) center \/ cover/);
  assert.doesNotMatch(component, /["']\/ui\/welding\//);
  assert.doesNotMatch(styles, /url\(["']\/ui\/welding\//);
});

test("gamepad can release RT, move freely, and reattach at the interrupted seam", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /rightTriggerHeld && pointerHeldRef\.current/);
  assert.match(component, /if \(!pointerHeldRef\.current\) \{[\s\S]*getNearestWeldingTrackProjection/);
  assert.match(component, /beginPointerWeld\(gunPointRef\.current\)/);
  assert.match(component, /if \(pointerHeldRef\.current\) stopPointerWeld\(\)/);
  assert.match(
    component,
    /!gamepadActivelyWelding[\s\S]*pointerTargetRef\.current = clampToBoard[\s\S]*updateGunPoint\(pointerTargetRef\.current\)/,
  );
});

test("separate welding sessions resume candidate trails and fade only a reclaimed leader", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /trailId:\s*number/);
  assert.match(component, /candidateTrailsRef\s*=\s*useRef<Map<number, WeldingCandidateTrail>>/);
  assert.match(component, /getResumableCandidateTrail\(selectedTrack\)/);
  assert.match(component, /activeWeldPathRef\.current = \[\.\.\.resumedTrail\.samples\]/);
  assert.match(component, /resolveWeldingCandidateLeadership/);
  assert.match(component, /segment\.trailId === candidateFadeTrailId/);
  assert.match(component, /ABANDONED_TRAIL_FADE_DURATION\s*=\s*720/);
});

test("the first real weld segment uses the normal hot seam without a degenerate filter box", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /MINIMUM_WELD_SEGMENT_LENGTH\s*=\s*0\.01/);
  assert.match(component, /segmentLength < MINIMUM_WELD_SEGMENT_LENGTH/);
  assert.match(component, /className="welding-live-seam-overlay"/);
  assert.match(component, /filterUnits="userSpaceOnUse"/);
  assert.match(component, /width=\{WELDING_ROUTE_VIEWBOX\.width \+ 80\}/);
  assert.match(component, /height=\{WELDING_ROUTE_VIEWBOX\.height \+ 80\}/);
  assert.match(styles, /\.welding-live-seam-overlay\s*\{[\s\S]*z-index:\s*6/);
  assert.doesNotMatch(styles, /\.welding-route-seam-outline line/);
  assert.doesNotMatch(component, /WELD_START_SEED/);
  assert.doesNotMatch(component, /weldStartSeed/);
});

test("welding opens with an explicit route preview before player control", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /createWeldingRouteGraph\(\)/);
  assert.match(component, /useState<WeldingPuzzlePhase>\("intro"\)/);
  assert.match(component, /useState\(\(\) => createRandomWeldingRoute\(\)\)/);
  assert.match(component, /開始預覽路線/);
  assert.match(component, /預覽焊接方式/);
  assert.match(component, /PREVIEW_WELD_DURATION\s*=\s*5200/);
  assert.match(component, /startPreviewSequence/);
  assert.match(component, /phase === "preview"/);
  assert.match(component, /gamepadConfirmArmedRef\s*=\s*useRef\(false\)/);
  assert.match(component, /!gamepadConfirmArmedRef\.current && !confirmPressed/);
  assert.match(
    component,
    /gamepadConfirmArmedRef\.current &&[\s\S]*confirmPressed &&[\s\S]*phaseRef\.current === "intro"/,
  );
  assert.match(component, /onVirtualCursorAvailabilityChange/);
  assert.match(component, /phase === "intro" \|\| phase === "success"/);
  assert.match(component, /shouldHandleGamepadConfirm\?\.\(\) \?\? true/);
  assert.match(component, /function WeldingBriefingDemo\(\)/);
  assert.match(component, /welding-briefing-demo-guide/);
  assert.match(component, /welding-briefing-demo-seam/);
  assert.match(component, /welding-briefing-demo-motion/);
  assert.match(component, /href=\{WELDING_TORCH_URL\}/);
  assert.match(component, /href=\{WELDING_SPARK_URL\}/);
  assert.match(component, /className="welding-briefing-demo-torch"[\s\S]*width="176"[\s\S]*height="100"/);
  assert.match(component, /先觀察正確的焊接路線，/);
  assert.match(component, /再重複走過一遍相同的路線。/);
  assert.match(component, /焊接路線錯誤的話，將會消耗一塊金屬碎片。/);
  assert.doesNotMatch(component, /按下開始後，焊槍會自動走過一次正確路線/);
  assert.match(styles, /\.welding-puzzle-intro-panel > \.welding-puzzle-primary-action\s*\{[\s\S]*width:\s*min\(360px, 78%\)/);
  assert.match(styles, /\.welding-puzzle-intro-panel p\s*\{[\s\S]*font-size:\s*16px/);
  assert.doesNotMatch(component, /焊接方向 · 路線示範重播/);
  assert.doesNotMatch(styles, /\.welding-briefing-demo > span/);
  assert.match(component, /welding-briefing-demo-direction/);
  assert.match(component, /repeatCount="indefinite"/);
  assert.match(styles, /height:\s*min\(540px, calc\(100% - 28px\)\)/);
  assert.match(component, /roundBriefingCoordinate/);
  assert.match(styles, /@keyframes welding-briefing-seam-replay/);
  assert.match(styles, /@keyframes welding-briefing-spark-replay/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("gamepad-opened briefing keeps A on the selected action while retaining virtual cursor takeover", () => {
  const movementLab = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const openStart = movementLab.indexOf("const openWeldingPuzzle = (");
  const availabilityStart = movementLab.indexOf(
    "const handleWeldingPuzzleVirtualCursorAvailabilityChange",
    openStart,
  );
  const confirmOwnershipStart = movementLab.indexOf(
    "const shouldWeldingPuzzleHandleGamepadConfirm",
    availabilityStart,
  );
  const openHandler = movementLab.slice(openStart, availabilityStart);
  const availabilityHandler = movementLab.slice(
    availabilityStart,
    confirmOwnershipStart,
  );
  const dpadStart = movementLab.indexOf("const activateWeldingPuzzleDpadMode = () => {");
  const dpadEnd = movementLab.indexOf("const activateCurrentPuzzleControlMode", dpadStart);
  const dpadHandler = movementLab.slice(dpadStart, dpadEnd);

  assert.match(openHandler, /const openedWithGamepad = source === "gamepad"/);
  assert.match(
    openHandler,
    /powerPuzzleGamepadModeRef\.current = openedWithGamepad \? "dpad" : "cursor"/,
  );
  assert.match(
    openHandler,
    /powerPuzzleCursorRearmRequiredRef\.current = openedWithGamepad/,
  );
  assert.doesNotMatch(
    availabilityHandler,
    /powerPuzzleGamepadModeRef\.current = "cursor"/,
  );
  assert.match(dpadHandler, /virtualCursorVisible = true/);
  assert.match(dpadHandler, /activateGamepadCursor\(\)/);
  assert.match(
    movementLab,
    /cursorInputLength >= OPTIONS_CURSOR_TAKEOVER_THRESHOLD[\s\S]*powerPuzzleGamepadModeRef\.current = "cursor"/,
  );
});

test("automatic preview ends with the cursor at this answer route entrance", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /pointerTargetRef\.current = previewRoute\.start/);
  assert.match(component, /updateGunPoint\(previewRoute\.start\)/);
  assert.match(
    component,
    /updateGunPoint\(previewRoute\.start\);[\s\S]*setGunVisible\(true\);[\s\S]*updatePhase\("ready"\)/,
  );
});

test("welding completion waits for explicit confirmation and uses the project welding torch unchanged", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /確認完成/);
  assert.match(component, /onClick=\{confirmCompletion\}/);
  assert.doesNotMatch(component, /setTimeout\(\(\) => \{[\s\S]*onComplete\(\)[\s\S]*\},\s*1250\)/);
  assert.match(component, /src=\{WELDING_TORCH_URL\}/);
  assert.match(styles, /\.welding-gun-cursor\s*\{[\s\S]*translate\(0, -46\.25%\)/);
  assert.doesNotMatch(styles, /\.welding-gun-cursor\s*\{[\s\S]*rotate\(/);
});

test("welding pointer keeps damped motion while failure remains node-driven", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /GAMEPAD_TRACK_CAPTURE_TOLERANCE\s*=\s*56/);
  assert.match(component, /GAMEPAD_JUNCTION_CAPTURE_RADIUS\s*=\s*70/);
  assert.match(component, /POINTER_SPRING_STRENGTH\s*=\s*34/);
  assert.match(component, /POINTER_SPRING_DAMPING\s*=\s*10\.5/);
  assert.doesNotMatch(component, /WRONG_BRANCH_GRACE_DISTANCE/);
  assert.doesNotMatch(component, /wrongRouteTravelRef/);
  assert.match(component, /resolveWeldingRouteNodeChoice/);
  assert.match(component, /advanceActiveWrongRouteDistance/);
});

test("gamepad capture corridor can enter a connected branch while the weld remains projected", () => {
  const activeEdge = {
    id: "active",
    from: "start",
    to: "fork",
    start: { x: 0, y: 0 },
    end: { x: 20, y: 0 },
    sourceRouteIds: [],
  };
  const branchEdge = {
    id: "branch",
    from: "fork",
    to: "branch-end",
    start: { x: 20, y: 0 },
    end: { x: 20, y: -20 },
    sourceRouteIds: [],
  };
  const steeringPoint = { x: 50, y: -20 };

  const narrow = selectWeldingMagneticTrack({
    point: steeringPoint,
    graphEdges: [activeEdge, branchEdge],
    activeEdge,
    activeProgress: 0.98,
    startSnapDistance: 34,
    trackTolerance: 29,
    junctionRadius: 42,
    switchProgress: 0.68,
    switchTEpsilon: 0.025,
  });
  const widened = selectWeldingMagneticTrack({
    point: steeringPoint,
    graphEdges: [activeEdge, branchEdge],
    activeEdge,
    activeProgress: 0.98,
    startSnapDistance: 34,
    trackTolerance: 56,
    junctionRadius: 70,
    switchProgress: 0.68,
    switchTEpsilon: 0.025,
  });

  assert.equal(narrow?.edge.id, "active");
  assert.equal(widened?.edge.id, "branch");
  assert.deepEqual(widened?.point, { x: 20, y: -20 });
});

test("gamepad cursor stays in a narrow soft corridor while the weld projection stays exact", () => {
  const trackPoint = { x: 100, y: 100 };
  const freeCursor = resolveWeldingSoftCorridorCursor({
    currentPoint: { x: 100, y: 100 },
    proposedPoint: { x: 100, y: 108 },
    trackPoint,
    corridorRadius: 12,
    softEdgeRatio: 0.7,
  });
  assert.deepEqual(freeCursor, { x: 100, y: 108 });

  const softenedCursor = resolveWeldingSoftCorridorCursor({
    currentPoint: { x: 100, y: 110 },
    proposedPoint: { x: 100, y: 112 },
    trackPoint,
    corridorRadius: 12,
    softEdgeRatio: 0.7,
  });
  assert.ok(softenedCursor.y > 110);
  assert.ok(softenedCursor.y < 112);
  assert.ok(softenedCursor.y <= 112);

  const relaxedCursor = relaxWeldingSoftCorridorCursor({
    cursorPoint: softenedCursor,
    trackPoint,
    corridorRadius: 12,
    softEdgeRatio: 0.7,
    deltaTime: 1 / 60,
  });
  assert.ok(relaxedCursor.y < softenedCursor.y);
  assert.ok(relaxedCursor.y > 108.4);
  assert.deepEqual(trackPoint, { x: 100, y: 100 });
});

test("every visible graph edge is magnetic, including a wrong gamepad branch", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const core = readFileSync(new URL("../app/welding-route-puzzle.ts", import.meta.url), "utf8");
  assert.match(component, /getNearestWeldingTrackProjection/);
  assert.match(component, /selectWeldingMagneticTrack/);
  assert.match(component, /selectWeldingPointerTrack/);
  assert.match(component, /const selectMagneticTrack/);
  assert.match(component, /const selectPointerTrack/);
  assert.match(core, /edge\.from === junction\.nodeId \|\| edge\.to === junction\.nodeId/);
  assert.match(component, /activeTrackEdgeRef\.current = selectedTrack\.edge/);
  assert.match(component, /GAMEPAD_CURSOR_CORRIDOR_RADIUS\s*=\s*12/);
  assert.match(component, /resolveWeldingSoftCorridorCursor/);
  assert.match(component, /relaxWeldingSoftCorridorCursor/);
  assert.match(component, /updateGunPoint\(point\)/);
  assert.match(component, /x: currentCursor\.x \+ rightX \* GAMEPAD_CURSOR_SPEED \* deltaTime/);
  assert.match(component, /pointerTargetRef\.current = intendedPoint/);
  assert.match(component, /advancePointerWeld\(intendedPoint, "gamepad"\)/);
  assert.doesNotMatch(component, /expectedEdge/);
  assert.doesNotMatch(component, /matchesExpected/);
});

test("manual welding renders every actual magnetic segment with one hot-seam style", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /const \[weldSegments, setWeldSegments\]/);
  assert.match(component, /className="welding-route-hot-seam welding-route-player-weld"/);
  assert.match(component, /weldSegments\.map\(\(segment\) =>/);
  assert.match(component, /appendWeldSegment\(previousSample, selectedTrack\)/);
  assert.match(component, /getWeldingSharedTrackPoint\(previousEdge, selectedTrack\.edge\)/);
  assert.match(component, /appendWeldSegment\(previousSample, previousJunction\)/);
  assert.match(component, /appendWeldSegment\(nextJunction, selectedTrack\)/);
  assert.match(component, /resolveWeldingEndpointResult/);
  assert.doesNotMatch(component, /confirmedRoutePosition/);
  assert.match(component, /className="welding-route-hot-seam welding-route-player-weld"/);
  assert.doesNotMatch(component, /shouldAdvanceExpectedWeldingEdge/);
  assert.match(styles, /\.welding-route-hot-seam line/);
  assert.doesNotMatch(styles, /\.welding-route-seam-outline line/);
  assert.match(styles, /@keyframes welding-route-hot-seam-pulse/);
  assert.match(styles, /stroke-opacity:\s*0\.72/);
  assert.doesNotMatch(styles, /\.welding-route-manual-trail line/);
  assert.doesNotMatch(styles, /\.welding-route-seam line/);
});

test("abandoned branch segments fade only after the replacement path is confirmed", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /findWeldingPathRejoinIndex/);
  assert.match(component, /PATH_REJOIN_MINIMUM_TAIL_DISTANCE\s*=\s*4/);
  assert.match(component, /BRANCH_CHANGE_CONFIRM_DISTANCE\s*=\s*34/);
  assert.match(component, /pendingTrail\.confirmedDistance \+= segmentLength/);
  assert.match(component, /pendingTrail\.segmentIds\.add\(nextSegment\.segmentId\)/);
  assert.match(component, /fadeStartedAt/);
  assert.match(component, /ABANDONED_TRAIL_FADE_DURATION\s*=\s*720/);
  assert.match(component, /opacity=\{getWeldSegmentOpacity\(segment, weldRenderClock\)\}/);
  assert.doesNotMatch(component, /expectedEdge/);
  assert.doesNotMatch(component, /correctRoute/);
});

test("hot weld follows the gun during both automatic preview and player welding", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /const sparkPoint = gunPoint/);
  assert.match(component, /const showingPreviewWeld = phase === "preview"/);
  assert.match(component, /const showingSparks = activelyWelding \|\| showingPreviewWeld/);
  assert.match(component, /setPreviewSegments/);
  assert.doesNotMatch(component, /welding-route-terminals/);
});

test("mouse leaving the board cannot hide the torch during automatic preview", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const leaveHandlerStart = component.indexOf("onPointerLeave={() => {");
  const leaveHandlerEnd = component.indexOf("onPointerMove={handlePointerMove}", leaveHandlerStart);
  const leaveHandler = component.slice(leaveHandlerStart, leaveHandlerEnd);

  assert.ok(leaveHandlerStart >= 0, "應能找到焊接面板的滑鼠離開處理器");
  assert.match(leaveHandler, /const currentPhase = phaseRef\.current/);
  assert.match(
    leaveHandler,
    /currentPhase === "ready" \|\| currentPhase === "welding"/,
  );
  assert.match(leaveHandler, /playerControlActive[\s\S]*setGunVisible\(false\)/);
  assert.doesNotMatch(leaveHandler, /currentPhase === "preview"/);
});

test("welding emits a dense spark field during preview and active welding", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /Array\.from\(\{ length: 42 \}/);
  assert.match(component, /className="welding-arc-sparks"/);
  assert.match(component, /Array\.from\(\{ length: 18 \}/);
  assert.match(component, /showingPreviewWeld\s*=\s*phase === "preview"/);
  assert.match(component, /showingSparks\s*=\s*activelyWelding \|\| showingPreviewWeld/);
});

test("welding hotspot uses the transparent spark sprite and flickers while active", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /className="welding-hotspot-sprite"/);
  assert.match(component, /href=\{WELDING_SPARK_URL\}/);
  assert.doesNotMatch(component, /className="welding-hotspot"/);
  assert.match(styles, /\.welding-hotspot-sprite\s*\{[\s\S]*animation:\s*welding-hotspot-sprite-flicker/);
  assert.match(styles, /@keyframes welding-hotspot-sprite-flicker/);
});

test("route comparison runs at entrances, exits, and forks but skips ordinary corners", () => {
  const graph = createWeldingRouteGraph();
  const route = createRandomWeldingRoute(() => 0.42);
  const simpleCorner = graph.nodes.find((node) =>
    !graph.startNodeIds.includes(node.id) &&
    !graph.endNodeIds.includes(node.id) &&
    graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).length === 2
  );
  const fork = route.edges.find((edge) =>
    graph.edges.filter((candidate) => candidate.from === edge.from).length > 1
  )?.from;

  assert.ok(simpleCorner);
  assert.ok(fork);
  assert.equal(isWeldingRouteComparisonNode(graph, route.edges[0].from), true);
  assert.equal(isWeldingRouteComparisonNode(graph, route.edges.at(-1).to), true);
  assert.equal(isWeldingRouteComparisonNode(graph, fork), true);
  assert.equal(isWeldingRouteComparisonNode(graph, simpleCorner.id), false);
});

test("reaching a wrong endpoint fails immediately without waiting for 100px", () => {
  const route = createRandomWeldingRoute(() => 0.42);
  const correctFinalEdge = route.edges.at(-1);
  const wrongFinalEdge = route.graph.edges.find(
    (edge) =>
      route.graph.endNodeIds.includes(edge.to) &&
      edge.id !== correctFinalEdge.id,
  );
  const nonFinalEdge = route.edges.find(
    (edge) => !route.graph.endNodeIds.includes(edge.to),
  );

  assert.ok(correctFinalEdge);
  assert.ok(wrongFinalEdge);
  assert.ok(nonFinalEdge);
  assert.equal(resolveWeldingEndpointResult({
    graph: route.graph,
    correctEdgeIds: route.edgeIds,
    selectedEdge: correctFinalEdge,
  }), "correct");
  assert.equal(resolveWeldingEndpointResult({
    graph: route.graph,
    correctEdgeIds: route.edgeIds,
    selectedEdge: wrongFinalEdge,
  }), "wrong");
  assert.equal(resolveWeldingEndpointResult({
    graph: route.graph,
    correctEdgeIds: route.edgeIds,
    selectedEdge: nonFinalEdge,
  }), "not-end");
  assert.equal(resolveWeldingEndpointResult({
    graph: route.graph,
    correctEdgeIds: route.edgeIds,
    selectedEdge: correctFinalEdge,
    startedFromStart: false,
  }), "unqualified");
});

test("welding must begin at a left start and an invalid start fails after 100 rendered pixels", () => {
  const route = createRandomWeldingRoute(() => 0.42);
  const firstEdge = route.edges[0];
  const middleEdge = {
    id: "middle-edge",
    from: "middle-a",
    to: "middle-b",
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    sourceRouteIds: [],
  };
  const projection = (edge, t) => ({
    edge,
    point: {
      x: edge.start.x + (edge.end.x - edge.start.x) * t,
      y: edge.start.y + (edge.end.y - edge.start.y) * t,
    },
    t,
    distance: 0,
  });

  const valid = createWeldingStartValidationState({
    graph: route.graph,
    projection: projection(firstEdge, 0.03),
  });
  assert.equal(valid.startedFromStart, true);
  assert.equal(WELDING_START_DISTANCE_TOLERANCE_PX, 50);
  const firstEdgeLength = Math.hypot(
    firstEdge.end.x - firstEdge.start.x,
    firstEdge.end.y - firstEdge.start.y,
  );
  const renderedScale = 100 / firstEdgeLength;
  assert.equal(createWeldingStartValidationState({
    graph: route.graph,
    projection: projection(firstEdge, 0.5),
    scaleX: renderedScale,
    scaleY: renderedScale,
  }).startedFromStart, true);
  assert.equal(createWeldingStartValidationState({
    graph: route.graph,
    projection: projection(firstEdge, 0.501),
    scaleX: renderedScale,
    scaleY: renderedScale,
  }).startedFromStart, false);

  const invalid = createWeldingStartValidationState({
    graph: route.graph,
    projection: projection(middleEdge, 0.5),
  });
  assert.equal(invalid.startedFromStart, false);

  const ninetyPixels = advanceWeldingStartValidation({
    state: invalid,
    start: projection(middleEdge, 0),
    end: projection(middleEdge, 0.45),
    failureDistance: 100,
    scaleX: 2,
  });
  assert.equal(Math.round(ninetyPixels.unqualifiedDistance), 90);
  assert.equal(ninetyPixels.failed, false);

  const overLimit = advanceWeldingStartValidation({
    state: ninetyPixels,
    start: projection(middleEdge, 0.45),
    end: projection(middleEdge, 0.51),
    failureDistance: 100,
    scaleX: 2,
  });
  assert.equal(Math.round(overLimit.unqualifiedDistance), 102);
  assert.equal(overLimit.failed, true);
});

test("a wrong fork arms one comparison state and the correct route clears it", () => {
  const route = createRandomWeldingRoute(() => 0.42);
  const graph = route.graph;
  const correctEdge = route.edges.find((edge) =>
    graph.edges.filter((candidate) => candidate.from === edge.from).length > 1
  );
  assert.ok(correctEdge);
  const wrongEdge = graph.edges.find(
    (edge) => edge.from === correctEdge.from && edge.id !== correctEdge.id,
  );
  assert.ok(wrongEdge);

  const armed = resolveWeldingRouteNodeChoice({
    state: createWeldingRouteFailureState(),
    graph,
    correctEdgeIds: route.edgeIds,
    nodeId: correctEdge.from,
    selectedEdgeId: wrongEdge.id,
    leavingForward: true,
  });
  assert.equal(armed.wrongBranchActive, true);

  const recovered = resolveWeldingRouteNodeChoice({
    state: { ...armed, wrongDistance: 84 },
    graph,
    correctEdgeIds: route.edgeIds,
    nodeId: correctEdge.from,
    selectedEdgeId: correctEdge.id,
    leavingForward: true,
  });
  assert.deepEqual(recovered, createWeldingRouteFailureState());
});

test("wrong route fails only beyond 100 rendered pixels and retracing subtracts distance", () => {
  const edge = {
    id: "wrong-edge",
    from: "fork",
    to: "wrong-end",
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    sourceRouteIds: [],
  };
  const projection = (t) => ({
    edge,
    point: { x: 100 * t, y: 0 },
    t,
    distance: 0,
  });
  const armed = {
    wrongBranchActive: true,
    wrongDistance: 0,
    failed: false,
  };
  const ninetyPixels = advanceWeldingWrongRouteDistance({
    state: armed,
    start: projection(0),
    end: projection(0.45),
    failureDistance: 100,
    scaleX: 2,
  });
  assert.equal(ninetyPixels.wrongDistance, 90);
  assert.equal(ninetyPixels.failed, false);

  const retreated = advanceWeldingWrongRouteDistance({
    state: ninetyPixels,
    start: projection(0.45),
    end: projection(0.2),
    failureDistance: 100,
    scaleX: 2,
  });
  assert.equal(retreated.wrongDistance, 40);
  assert.equal(retreated.failed, false);

  const overLimit = advanceWeldingWrongRouteDistance({
    state: retreated,
    start: projection(0.2),
    end: projection(0.51),
    failureDistance: 100,
    scaleX: 2,
  });
  assert.equal(overLimit.wrongDistance, 102);
  assert.equal(overLimit.failed, true);
});

test("gameplay compares the preview answer at nodes and calls the existing failure flow", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /WRONG_ROUTE_FAILURE_DISTANCE_PX = 100/);
  assert.match(component, /INVALID_START_FAILURE_DISTANCE_PX = 100/);
  assert.match(component, /advanceWeldingStartValidation/);
  assert.match(component, /startedFromStart/);
  assert.match(component, /resolveWeldingRouteNodeChoice/);
  assert.match(component, /advanceWeldingWrongRouteDistance/);
  assert.match(component, /resolveWeldingEndpointResult/);
  assert.match(component, /endpointResult === "wrong"[\s\S]*failPuzzle\(\)/);
  assert.match(component, /onFail\(\)/);
  assert.match(component, /endpointResult === "wrong" \|\| endpointResult === "unqualified"/);
  assert.match(component, /useState\(\(\) => createRandomWeldingRoute\(\)\)/);
});

test("player phase shows four breathing start beacons, a START arrow, and the RT instruction", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /showingStartGuidance/);
  assert.match(component, /startNodes\.map\(\(node, index\) =>/);
  assert.match(component, /className="welding-start-callout"/);
  assert.match(component, />START<\/text>/);
  assert.match(component, /className="welding-start-beacon"/);
  assert.match(component, /按住 \[RT\] 推動 \[右搖桿\] 控制焊槍/);
  assert.match(component, /由最左側向右行走開始進行焊接/);
  assert.match(styles, /@keyframes welding-start-instruction-breathe/);
  assert.match(styles, /@keyframes welding-start-callout-float/);
  assert.match(styles, /@keyframes welding-start-beacon-glow-breathe/);
  assert.match(styles, /\.welding-start-beacon-glow\s*\{[^}]*blur\(5px\)/);
  assert.match(styles, /\.welding-start-beacon-glow\s*\{[^}]*fill:\s*rgba\(255, 70, 55, 0\.92\)/);
  assert.doesNotMatch(component, /welding-start-beacon-ring/);
  assert.doesNotMatch(component, /welding-start-beacon-core/);
  assert.doesNotMatch(styles, /\.welding-start-beacon\s*\{[^}]*animation:/);
  assert.match(component, /className="welding-start-arrow-body"/);
  assert.match(component, /className="welding-start-arrow-highlight"/);
});

test("wrong-route failure shows the timed message, reviews both route types, then closes", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(component, /FAILURE_MESSAGE_DURATION = 1400/);
  assert.match(component, /FAILURE_REVIEW_DURATION = 1800/);
  assert.match(component, /FAILURE_EXIT_DURATION = 420/);
  assert.match(component, /updatePhase\("failure-message"\)/);
  assert.match(component, /updatePhase\("failure-review"\)/);
  assert.match(component, /updatePhase\("failure-exit"\)/);
  assert.match(component, /<strong>焊接錯誤了<\/strong>/);
  assert.match(component, /className=\{previewRoute\.edgeIds\.includes\(segment\.edgeId\)/);
  assert.match(component, /\? "is-correct-route"/);
  assert.match(component, /: "is-wrong-route"/);
  assert.match(component, /disabled=\{isWeldingFailurePhase\(phase\)\}/);

  assert.match(styles, /welding-failure-message 1400ms linear both/);
  assert.match(styles, /14\.2857%\s*\{ opacity: 1; \}/);
  assert.match(styles, /85\.7143%\s*\{ opacity: 1; \}/);
  assert.match(styles, /welding-correct-route-review 240ms ease-in-out 6 alternate/);
  assert.match(styles, /welding-wrong-route-scorch 420ms ease-out forwards/);
  assert.doesNotMatch(styles, /welding-wrong-route-scorch 420ms ease-out \d+ms/);
  assert.match(styles, /welding-puzzle-failure-exit 420ms cubic-bezier/);
});

test("welding success background fades in without expanding from the centre", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const successStart = styles.indexOf(".welding-puzzle-success {");
  const successEnd = styles.indexOf(".welding-puzzle-success small", successStart);
  const successStyles = styles.slice(successStart, successEnd);
  const animationStart = styles.indexOf("@keyframes welding-success-fade-in");
  const animationEnd = styles.indexOf(".welding-puzzle-footer", animationStart);
  const animationStyles = styles.slice(animationStart, animationEnd);

  assert.match(successStyles, /welding-success-fade-in 200ms linear both/);
  assert.match(component, /<strong>焊接成功<\/strong>/);
  assert.match(animationStyles, /from \{ opacity: 0; \}/);
  assert.match(animationStyles, /to \{ opacity: 1; \}/);
  assert.doesNotMatch(successStyles, /scaleX/);
  assert.doesNotMatch(animationStyles, /scaleX/);
  assert.doesNotMatch(styles, /welding-success-reveal/);
});

test("welding success removes every in-puzzle cancel path and keeps only confirmation", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const headerStart = component.indexOf('<header className="welding-puzzle-header">');
  const headerEnd = component.indexOf("</header>", headerStart);
  const header = component.slice(headerStart, headerEnd);
  const escapeStart = component.indexOf("const handleKeyDown = (event: KeyboardEvent)");
  const escapeEnd = component.indexOf("window.addEventListener", escapeStart);
  const escapeHandler = component.slice(escapeStart, escapeEnd);

  assert.match(header, /phase !== "success" \? \([\s\S]*離開[\s\S]*\) : null/);
  assert.match(escapeHandler, /phaseRef\.current === "success"/);
  assert.match(component, /const successShowing = phaseRef\.current === "success"/);
  assert.match(component, /!successShowing &&[\s\S]*backPressed/);
  assert.match(
    component,
    /if \(successShowing\) \{[\s\S]*confirmCompletion\(\);[\s\S]*\} else if \(exitSelected\)/,
  );
  assert.match(component, /setExitSelected\(false\);[\s\S]*updatePhase\("success"\)/);
});

test("formal welding interaction finishes its success dialogue before opening the puzzle", () => {
  const movementLab = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const weldingBranchStart = movementLab.indexOf(
    "if (interactable.id === WELDING_ROUTE_INTERACTION_ID)",
  );
  const weldingBranchEnd = movementLab.indexOf(
    "if (interactable.storyDialogueId)",
    weldingBranchStart,
  );
  const weldingBranch = movementLab.slice(weldingBranchStart, weldingBranchEnd);

  assert.match(weldingBranch, /selectInteractionDialogue\(interactable, "success"\)/);
  assert.match(weldingBranch, /openDialogue\(interactable, startWeldingPuzzle, successDialogue\)/);
  assert.match(weldingBranch, /openWeldingPuzzle\(interactable, source\)/);
  assert.doesNotMatch(weldingBranch, /completeInteraction\(/);
});

test("formal welding interaction requires both the welding tool and metal scrap", () => {
  const scene = JSON.parse(
    readFileSync(new URL("../public/maps/map_test01.scene.json", import.meta.url), "utf8"),
  );
  const interaction = scene.interactables.find(
    (candidate) => candidate.id === "scene3-interaction-024",
  );
  assert.ok(interaction);
  assert.deepEqual(
    interaction.useRequirements
      .filter((requirement) => requirement.kind === "item")
      .map((requirement) => [requirement.itemId, requirement.quantity]),
    [["T0007", 1], ["R0009", 1]],
  );

  const withoutMetalScrap = getUnmetInteractionUseRequirements(
    interaction.useRequirements,
    { T0007: 1 },
    3,
    () => true,
    () => true,
  );
  assert.deepEqual(
    withoutMetalScrap.map((requirement) => [requirement.kind, requirement.itemId, requirement.actual]),
    [["item", "R0009", 0]],
  );
  assert.deepEqual(
    getUnmetInteractionUseRequirements(
      interaction.useRequirements,
      { T0007: 1, R0009: 1 },
      3,
      () => true,
      () => true,
    ),
    [],
  );
});

test("焊接互動需求連續失敗兩次後啟用隱藏焊槍 OBJ 並保留計數", () => {
  const questDocument = JSON.parse(
    readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"),
  );
  const quest = structuredClone(
    questDocument.quests.find((candidate) => candidate.id === "QUEST_CH03_MAIN_006"),
  );
  const stage = structuredClone(
    quest.stages.find((candidate) => candidate.id === "QUEST_CH03_MAIN_006_STAGE_02"),
  );
  stage.nextStageId = "";
  quest.prerequisiteQuestIds = [];
  quest.stages = [stage];
  const isolatedDocument = {
    schemaVersion: questDocument.schemaVersion,
    chapters: questDocument.chapters,
    quests: [quest],
  };

  const objective = stage.objectives.find(
    (candidate) => candidate.id === WELDING_TOOL_HINT_OBJECTIVE_ID,
  );
  assert.equal(objective.activationMode, "event");
  assert.equal(objective.activationEventId, WELDING_TOOL_HINT_ACTIVATION_EVENT_ID);
  assert.equal(objective.blocksStageCompletion, false);

  const firstManager = new QuestRuntimeManager(isolatedDocument);
  firstManager.syncCurrentInventory({});
  firstManager.startQuest(quest.id);
  const firstFailure = recordWeldingToolHintInteractionFailure(
    firstManager,
    "scene3-interaction-024",
  );
  assert.deepEqual(firstFailure, { activated: false, failureCount: 1 });
  assert.equal(
    firstManager.getObjectiveProgress(quest.id, WELDING_TOOL_HINT_OBJECTIVE_ID).state,
    "locked",
  );

  const restoredManager = new QuestRuntimeManager(
    isolatedDocument,
    {},
    firstManager.exportSave(),
  );
  restoredManager.syncCurrentInventory({ T0007: 1 });
  const secondFailure = recordWeldingToolHintInteractionFailure(
    restoredManager,
    "scene3-interaction-024",
  );
  assert.deepEqual(secondFailure, { activated: true, failureCount: 2 });
  const completedHint = restoredManager.getObjectiveProgress(
    quest.id,
    WELDING_TOOL_HINT_OBJECTIVE_ID,
  );
  assert.equal(completedHint.completed, true);
  assert.equal(completedHint.activatedByEventId, WELDING_TOOL_HINT_ACTIVATION_EVENT_ID);
  assert.equal(
    restoredManager.getEventCounter(quest.id, WELDING_TOOL_HINT_FAILURE_COUNTER_ID),
    2,
  );

  assert.deepEqual(
    recordWeldingToolHintInteractionFailure(restoredManager, "scene3-interaction-024"),
    { activated: false, failureCount: 2 },
  );

  const movementLab = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  const interactionFailureStart = movementLab.indexOf(
    "const openInteractionFailureDialogue = (",
  );
  const interactionFailureEnd = movementLab.indexOf(
    "const onControlBindingsChanged",
    interactionFailureStart,
  );
  const puzzleFailureStart = movementLab.indexOf(
    "const handleWeldingPuzzleFailure = () => {",
  );
  const puzzleFailureEnd = movementLab.indexOf(
    "const openFrequencyCalibrationPuzzle",
    puzzleFailureStart,
  );
  assert.match(
    movementLab.slice(interactionFailureStart, interactionFailureEnd),
    /recordWeldingToolHintInteractionFailure\(questManager, interactable\.id\)/,
  );
  assert.doesNotMatch(
    movementLab.slice(puzzleFailureStart, puzzleFailureEnd),
    /recordWeldingToolHintInteractionFailure/,
  );
});

test("welding consumes metal scrap on failure but its one-time interaction only on success", () => {
  const movementLab = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const completionStart = movementLab.indexOf("const publishPuzzleCompleted = (");
  const completionEnd = movementLab.indexOf(
    "const openCampPowerRefillConfirmation",
    completionStart,
  );
  const completionHandler = movementLab.slice(completionStart, completionEnd);
  const failureStart = movementLab.indexOf("const handleWeldingPuzzleFailure = () => {");
  const failureEnd = movementLab.indexOf("const openFrequencyCalibrationPuzzle", failureStart);
  const failureHandler = movementLab.slice(failureStart, failureEnd);

  assert.match(
    completionHandler,
    /completeInteraction\([\s\S]*session\.interactable,[\s\S]*session\.source,[\s\S]*\(\) => publishPuzzleCompleted\(session\)/,
  );
  assert.match(completionHandler, /const publishPuzzleCompleted/);
  assert.match(completionHandler, /type: "puzzleCompleted"/);
  assert.match(
    movementLab,
    /openDialogue\([\s\S]*onCompletionDialogueComplete,[\s\S]*completionDialogue/,
  );
  assert.match(movementLab, /const usage = recordInteractionUse\(/);
  assert.match(failureHandler, /closePowerRoutingPuzzle\(\)/);
  assert.match(failureHandler, /removeInventoryItem\(/);
  assert.match(failureHandler, /WELDING_FAILURE_MATERIAL_ITEM_ID/);
  assert.match(failureHandler, /savePlayerInventory\(nextInventory\)/);
  assert.match(failureHandler, /焊接失敗，消耗「金屬碎片」/);
  assert.match(movementLab, /WELDING_FAILURE_DIALOGUE_ID = "chapter03-special-1"/);
  assert.match(failureHandler, /dialogueManager\.get\(WELDING_FAILURE_DIALOGUE_ID\)/);
  assert.match(
    failureHandler,
    /dialogueManager\.playUnique\([\s\S]*WELDING_FAILURE_DIALOGUE_ID[\s\S]*failureDialogueContext/,
  );
  assert.ok(
    failureHandler.indexOf("savePlayerInventory(nextInventory)") <
      failureHandler.indexOf("dialogueManager.playUnique"),
  );
  assert.equal(STORY_DIALOGUES["chapter03-special-1"]?.lines.length, 3);
  assert.match(
    styles,
    /html\.gamepad-cursor-active\.dialogue-cursor-active \.dialogue-box,[\s\S]*cursor: none !important/,
  );
  assert.match(movementLab, /onFail=\{handleWeldingPuzzleFailure\}/);
  assert.doesNotMatch(failureHandler, /completeInteraction|recordInteractionUse|puzzleCompleted/);
});

test("the welding surface stays locked behind the intro and route preview", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(
    component,
    /if \(phaseRef\.current !== "ready" && phaseRef\.current !== "welding"\) return;/,
  );
  assert.match(component, /welding-puzzle-intro/);
  assert.match(component, /welding-preview-countdown/);
  assert.match(component, /startPreviewSequence/);
  assert.match(component, /updatePhase\("ready"\)/);
});
