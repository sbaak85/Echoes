import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  createRandomWeldingRoute,
  createWeldingRouteGraph,
  selectWeldingBranchByDirection,
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

test("welding preview counts down then traces the generated route from start to finish", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /useState<WeldingPuzzlePhase>\("intro"\)/);
  assert.match(component, /開始預覽路線/);
  assert.match(component, /預覽焊接方式/);
  assert.match(component, /PREVIEW_DURATION\s*=\s*4200/);
  assert.match(component, /getRoutePointAtProgress/);
  assert.match(component, /requestAnimationFrame\(drawPreview\)/);
  assert.match(styles, /\.welding-preview-countdown/);
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

test("welding pointer allows an 80px wrong route before failure and keeps damped motion", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /JUNCTION_GRACE_RADIUS\s*=\s*42/);
  assert.match(component, /WRONG_BRANCH_GRACE_DISTANCE\s*=\s*80/);
  assert.doesNotMatch(component, /POINTER_FAIL_TOLERANCE/);
  assert.doesNotMatch(component, /OFF_ROUTE_TRAVEL_LIMIT/);
  assert.match(component, /BACKTRACK_ALLOWANCE\s*=\s*34/);
  assert.match(component, /POINTER_SPRING_STRENGTH\s*=\s*34/);
  assert.match(component, /POINTER_SPRING_DAMPING\s*=\s*10\.5/);
  assert.match(component, /furthestEdgeProgressRef/);
  assert.match(component, /wrongRouteTravelRef/);
});

test("gamepad welding draws the intended wrong route instead of magnetizing at a junction", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /const getMagnetizedGamepadPoint/);
  assert.doesNotMatch(component, /magnetizedPoint/);
  assert.match(component, /edge\.from === currentEdge\.to/);
  assert.match(component, /wrongBranchEdgeRef\.current = selected\.edge/);
  assert.match(component, /pointerTargetRef\.current = intendedPoint/);
  assert.match(component, /updateGunPoint\(intendedPoint\)/);
  assert.match(component, /advancePointerWeld\(intendedPoint\)/);
  assert.match(component, /wrongRouteTravelRef\.current = wrongBranchDistance/);
  assert.match(component, /wrongRouteTravelRef\.current > WRONG_BRANCH_GRACE_DISTANCE/);
});

test("welding keeps a jittered short tail that settles only onto the correct route", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /className="welding-route-manual-trail"/);
  assert.match(component, /WELD_TRAIL_JITTER\s*=\s*2\.4/);
  assert.match(component, /WELD_TRAIL_SETTLE_DURATION\s*=\s*720/);
  assert.match(component, /wrongBranchEdgeRef\.current === null/);
  assert.match(component, /!point\.canSettle \|\| now - point\.createdAt <= WELD_TRAIL_LIFETIME/);
  assert.match(component, /getTrailDisplayPoint/);
  assert.match(component, /WELD_CORRECTION_FOLLOW_RATE\s*=\s*4\.6/);
  assert.match(component, /correctedRouteProgress/);
  assert.match(component, /correctionTargetProgressRef/);
  assert.match(component, /const weldedEdges = session\.edges\.slice\(0, correctedRoutePosition\.edgeIndex\)/);
  assert.doesNotMatch(styles, /@keyframes welding-manual-trail-correct/);
  assert.match(styles, /@keyframes welding-precise-seam-settle/);
  assert.match(styles, /\.welding-route-seam line/);
});

test("hot weld begins immediately and preview terminals appear only at their milestones", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /visiblePreviewProgress\s*=\s*previewProgress\s*>\s*0/);
  assert.match(component, /Math\.max\(previewProgress,\s*0\.012\)/);
  assert.match(component, /visibleCorrectedRouteProgress\s*=\s*activelyWelding/);
  assert.match(component, /Math\.max\(correctedRouteProgress,\s*liveRouteProgress\)/);
  assert.match(component, /showPreviewStartTerminal\s*=\s*showingPreviewWeld\s*&&\s*previewProgress\s*>\s*0/);
  assert.match(component, /showPreviewEndTerminal\s*=\s*showingPreviewWeld\s*&&\s*previewProgress\s*>=\s*0\.999/);
  assert.doesNotMatch(component, /<circle className="is-start"[^?]*<circle className="is-end"/s);
});

test("welding emits a dense spark field during preview and active welding", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  assert.match(component, /Array\.from\(\{ length: 42 \}/);
  assert.match(component, /showingSparks\s*=\s*activelyWelding\s*\|\|\s*showingPreviewWeld/);
});

test("welding failure shows a one-second error message before shrinking closed", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /FAILURE_MESSAGE_DURATION\s*=\s*1000/);
  assert.match(component, /FAILURE_EXIT_DURATION\s*=\s*420/);
  assert.match(component, /updatePhase\("failure"\)/);
  assert.match(component, /updatePhase\("failure-exit"\)/);
  assert.match(component, /焊接錯誤了/);
  assert.match(styles, /\.welding-puzzle-dialog\.is-failure-exit/);
  assert.match(styles, /@keyframes welding-puzzle-failure-exit/);
});

test("intro controls are not intercepted by the welding surface", () => {
  const component = readFileSync(new URL("../app/welding-route-puzzle.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(
    component,
    /if \(phaseRef\.current !== "ready" && phaseRef\.current !== "welding"\) return;/,
  );
  assert.match(styles, /\.welding-puzzle-dialog\.is-intro \.welding-puzzle-board[\s\S]*cursor: default !important;/);
  assert.match(styles, /\.welding-puzzle-dialog\.is-intro button[\s\S]*cursor: pointer !important;/);
});
