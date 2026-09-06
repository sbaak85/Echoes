import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDialogueHistoryView,
  canOpenDialogueHistory,
  getDialogueHistoryRightStickScrollDelta,
  hasDialogueHistoryRightStickInput,
  hasDialogueHistoryScrollbar,
} from "../app/dialogue-history.ts";

const lines = [
  { lineId: "line-001", speaker: "Sbaak", text: "第一句。" },
  { lineId: "line-002", speaker: "飛航電腦AI", text: "第二句。" },
  { lineId: "line-003", speaker: "Sbaak", text: "目前這一句。" },
];

test("dialogue review contains only lines before the current line", () => {
  assert.deepEqual(buildDialogueHistoryView("chapter04-start", lines, 2), {
    dialogueId: "chapter04-start",
    entries: [
      { lineId: "line-001", speaker: "Sbaak", text: "第一句。" },
      { lineId: "line-002", speaker: "飛航電腦AI", text: "第二句。" },
    ],
  });
});

test("the first line has no earlier dialogue to review", () => {
  assert.deepEqual(
    buildDialogueHistoryView("chapter04-start", lines, 0).entries,
    [],
  );
});

test("review is available only from the second script line, including before typing finishes", () => {
  assert.equal(canOpenDialogueHistory(0, 3), false);
  assert.equal(canOpenDialogueHistory(0, 1), false);
  assert.equal(canOpenDialogueHistory(1, 3), true);
  assert.equal(canOpenDialogueHistory(2, 3), true);
  for (const index of [-1, 0.5, 3, NaN]) assert.equal(canOpenDialogueHistory(index, 3), false);
  assert.equal(canOpenDialogueHistory(1, 0), false);
});

test("history identity always belongs to the currently supplied dialogue ID", () => {
  const first = buildDialogueHistoryView("dialogue-a", lines, 2);
  const second = buildDialogueHistoryView("dialogue-b", [lines[2]], 1);
  assert.equal(first.dialogueId, "dialogue-a");
  assert.equal(second.dialogueId, "dialogue-b");
  assert.deepEqual(
    second.entries.map((entry) => entry.text),
    ["目前這一句。"],
  );
});

test("right stick scrolls the history in the pushed direction", () => {
  assert.equal(hasDialogueHistoryRightStickInput(-0.7), true);
  assert.equal(hasDialogueHistoryRightStickInput(0.7), true);
  assert.equal(hasDialogueHistoryRightStickInput(0.1), false);
  assert.ok(getDialogueHistoryRightStickScrollDelta(-0.7, 1 / 60) < 0);
  assert.ok(getDialogueHistoryRightStickScrollDelta(0.7, 1 / 60) > 0);
  assert.equal(getDialogueHistoryRightStickScrollDelta(0.1, 1 / 60), 0);
});

test("scroll hint is only needed when content actually overflows", () => {
  assert.equal(hasDialogueHistoryScrollbar(500, 400), true);
  assert.equal(hasDialogueHistoryScrollbar(401, 400), true);
  assert.equal(hasDialogueHistoryScrollbar(400, 400), false);
});

test("direct gamepad history scrolling overrides the dialogue mouse cursor", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(
    css,
    /html\.gamepad-input-active\.dialogue-cursor-active \.dialogue-history-overlay \*/,
  );
});
