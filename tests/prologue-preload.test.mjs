import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PROLOGUE_ILLUSTRATIONS } from "../app/prologue-flow.ts";

const requested = [];
globalThis.Image = class {
  decoding = "";
  onload = null;
  onerror = null;
  set src(value) { this._src = value; requested.push(this); }
  get src() { return this._src; }
  decode() { return Promise.resolve(); }
};
const {
  getPrologueIllustrationSources,
  loadPrologueIllustration,
  preloadPrologueIllustrations,
  stopPrologueIllustrationPreload,
} = await import("../app/prologue-preload.ts");

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("序章插圖預載：依播放順序一次下載一張，重複呼叫不重複下載，停止後可接續", async () => {
  const sources = getPrologueIllustrationSources();
  assert.equal(sources.length, PROLOGUE_ILLUSTRATIONS.length);
  assert.deepEqual(sources, PROLOGUE_ILLUSTRATIONS.map((item) => `/${item.imagePath}`));

  preloadPrologueIllustrations();
  preloadPrologueIllustrations();
  await flush();
  assert.deepEqual(requested.map((image) => image.src), [sources[0]]);

  requested[0].onload();
  await flush();
  assert.deepEqual(requested.map((image) => image.src), sources.slice(0, 2));

  // 選了第二章：目前這張載完後不再往下載
  stopPrologueIllustrationPreload();
  requested[1].onerror();
  await flush();
  assert.equal(requested.length, 2);

  // 播放時直接要某一張：已下載的不會重抓，沒下載的立即開始
  await loadPrologueIllustration(sources[0]);
  assert.equal(requested.length, 2);
  void loadPrologueIllustration(sources[4]);
  assert.equal(requested.at(-1).src, sources[4]);

  // 重新開始預載：從尚未下載的那張接著載
  preloadPrologueIllustrations();
  await flush();
  assert.equal(requested.at(-1).src, sources[2]);
  assert.equal(new Set(requested.map((image) => image.src)).size, requested.length);
});

test("插圖淡入：解碼完成才開始，ease-in 從黑畫面慢慢亮起，時間與流程常數一致", async () => {
  const { PROLOGUE_ILLUSTRATION_FADE_IN_MS, PROLOGUE_ILLUSTRATION_FADE_OUT_MS } = await import("../app/prologue-flow.ts");
  assert.equal(PROLOGUE_ILLUSTRATION_FADE_IN_MS, 800);
  assert.equal(PROLOGUE_ILLUSTRATION_FADE_OUT_MS, 500);
  const css = readFileSync(new URL("../app/prologue-player.css", import.meta.url), "utf8");
  assert.match(css, /\.prologue-illustration > img \{\s*opacity: 0;\s*animation: none;\s*\}/);
  assert.match(css, /\.prologue-illustration > img\.is-ready \{\s*animation: inventory-item-inspect-fade-in var\(--prologue-illustration-fade-in, 800ms\) ease-in both;/);
  assert.match(css, /is-closing > img\.is-ready \{\s*animation: inventory-item-inspect-fade-out var\(--prologue-illustration-fade-out, 500ms\) ease-in both;/);
  const player = readFileSync(new URL("../app/prologue-player.tsx", import.meta.url), "utf8");
  assert.match(player, /"--prologue-illustration-fade-in": `\$\{PROLOGUE_ILLUSTRATION_FADE_IN_MS\}ms`/);
  assert.match(player, /<img ref=\{markIllustrationReady\}/);
});

test("章節選單一出現就預載序章插圖；選章節時停止；播放插圖前等待載入", () => {
  const entry = readFileSync(new URL("../app/game-entry.tsx", import.meta.url), "utf8");
  assert.match(entry, /has\("scene"\)\) return;\s*preloadPrologueIllustrations\(\);/);
  assert.match(entry, /stopPrologueIllustrationPreload\(\);\s*try \{\s*\/\/ No game\/scene\/story module/);
  const player = readFileSync(new URL("../app/prologue-player.tsx", import.meta.url), "utf8");
  assert.match(player, /await Promise\.race\(\[loadPrologueIllustration\(src\), wait\(PROLOGUE_ILLUSTRATION_LOAD_TIMEOUT_MS\)\]\);\s*if \(cancelled\) return;\s*illustrationSequence \+= 1;/);
});
