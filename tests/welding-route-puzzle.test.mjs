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
  assert.ok(existsSync(new URL("../public/ui/welding/welding-gun-cursor.png", import.meta.url)));
  assert.ok(existsSync(new URL("../public/ui/welding/brushed-metal-background.webp", import.meta.url)));
});
