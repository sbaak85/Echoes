import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAYER_INFO_FLOAT_MAX_ROWS,
  enqueuePlayerInfoFloat,
  getPlayerInfoFloatVisuals,
  prunePlayerInfoFloats,
} from "../app/player-info-float.ts";

const message = (label) => [
  { text: "+1", tone: "positive" },
  { text: ` ${label}`, tone: "neutral" },
];

test("最新角色資訊由下往上推，最多保留四個正常顯示列", () => {
  let entries = [];
  for (let index = 0; index < 5; index += 1) {
    entries = enqueuePlayerInfoFloat(entries, message(`項目${index + 1}`), index + 1, index * 20);
  }

  const active = entries.filter((entry) => entry.forcedExitAt === null);
  const exiting = entries.filter((entry) => entry.forcedExitAt !== null);
  assert.equal(active.length, PLAYER_INFO_FLOAT_MAX_ROWS);
  assert.equal(active.at(-1)?.segments[1].text, " 項目5");
  assert.equal(active.at(-1)?.stackLevel, 0);
  assert.equal(exiting.length, 1);
});

test("單行資訊依 0.5 秒上浮、0.2 秒停留、0.5 秒上浮淡出的節奏播放", () => {
  const entries = enqueuePlayerInfoFloat([], message("淨水瓶"), 1, 0);
  const entering = getPlayerInfoFloatVisuals(entries, 250, 24)[0];
  const holding = getPlayerInfoFloatVisuals(entries, 600, 24)[0];
  const exiting = getPlayerInfoFloatVisuals(entries, 950, 24)[0];

  assert.ok(entering.opacity > 0 && entering.opacity < 1);
  assert.equal(holding.opacity, 1);
  assert.ok(exiting.opacity > 0 && exiting.opacity < 1);
  assert.ok(exiting.yOffset < holding.yOffset);
  assert.equal(prunePlayerInfoFloats(entries, 1200).length, 0);
});
