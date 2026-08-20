import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  createRandomWeldingRoute,
  createWeldingRouteGraph,
  findWeldingPathRejoinIndex,
  getWeldingPathProgress,
  getWeldingSharedTrackPoint,
  relaxWeldingSoftCorridorCursor,
  resolveWeldingBackwardHysteresis,
  resolveWeldingCandidateLeadership,
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

test("gamepad can release RT, move freely, and reattach at the interrupted seam", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /rightTriggerHeld && pointerHeldRef\.current/);
  assert.match(component, /if \(!pointerHeldRef\.current\) \{[\s\S]*getNearestWeldingTrackProjection/);
  assert.match(component, /beginPointerWeld\(gunPointRef\.current, "gamepad"\)/);
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
  assert.match(component, /createWeldingRouteGraph\(\)/);
  assert.match(component, /useState<WeldingPuzzlePhase>\("intro"\)/);
  assert.match(component, /createRandomWeldingRoute\(\(\) => 0\.42\)/);
  assert.match(component, /開始預覽路線/);
  assert.match(component, /預覽焊接方式/);
  assert.match(component, /PREVIEW_WELD_DURATION\s*=\s*5200/);
  assert.match(component, /startPreviewSequence/);
  assert.match(component, /phase === "preview"/);
});

test("automatic preview ends with the cursor visible at a random valid entrance", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /const routeEntrancePoints = graph\.nodes\.filter/);
  assert.match(component, /graph\.startNodeIds\.includes\(node\.id\)/);
  assert.match(component, /Math\.floor\(Math\.random\(\) \* routeEntrancePoints\.length\)/);
  assert.match(component, /pointerTargetRef\.current = nextEntrancePoint/);
  assert.match(component, /updateGunPoint\(nextEntrancePoint\)/);
  assert.match(
    component,
    /updateGunPoint\(nextEntrancePoint\);[\s\S]*setGunVisible\(true\);[\s\S]*updatePhase\("ready"\)/,
  );
});

test("welding completion waits for explicit confirmation and uses the project welding torch unchanged", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /確認完成/);
  assert.match(component, /onClick=\{confirmCompletion\}/);
  assert.doesNotMatch(component, /setTimeout\(\(\) => \{[\s\S]*onComplete\(\)[\s\S]*\},\s*1250\)/);
  assert.match(component, /src="\/ui\/welding\/Weldingtorch\.png"/);
  assert.match(styles, /\.welding-gun-cursor\s*\{[\s\S]*translate\(0, -46\.25%\)/);
  assert.doesNotMatch(styles, /\.welding-gun-cursor\s*\{[\s\S]*rotate\(/);
});

test("welding pointer keeps damped motion without answer-route failure", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /GAMEPAD_TRACK_CAPTURE_TOLERANCE\s*=\s*56/);
  assert.match(component, /GAMEPAD_JUNCTION_CAPTURE_RADIUS\s*=\s*70/);
  assert.match(component, /POINTER_SPRING_STRENGTH\s*=\s*34/);
  assert.match(component, /POINTER_SPRING_DAMPING\s*=\s*10\.5/);
  assert.doesNotMatch(component, /WRONG_BRANCH_GRACE_DISTANCE/);
  assert.doesNotMatch(component, /wrongRouteTravelRef/);
  assert.doesNotMatch(component, /failPuzzle/);
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
  assert.match(component, /graph\.endNodeIds\.includes\(selectedTrack\.edge\.to\)/);
  assert.doesNotMatch(component, /confirmedRoutePosition/);
  assert.doesNotMatch(component, /is-wrong/);
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
  assert.match(component, /href="\/ui\/welding\/spark-transparent\.png"/);
  assert.doesNotMatch(component, /className="welding-hotspot"/);
  assert.match(styles, /\.welding-hotspot-sprite\s*\{[\s\S]*animation:\s*welding-hotspot-sprite-flicker/);
  assert.match(styles, /@keyframes welding-hotspot-sprite-flicker/);
});

test("gameplay route validation is disabled while the seam recorder is active", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /session\.edges\[edgeIndexRef/);
  assert.doesNotMatch(component, /expectedNextEdge/);
  assert.doesNotMatch(component, /wrongAttempt/);
  assert.doesNotMatch(component, /updatePhase\("failure"\)/);
  assert.match(component, /沿著任一連續路線焊接至右側終點/);
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
