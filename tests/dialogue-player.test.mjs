import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDialoguePlayer, splitDialoguePages, splitDialogueRevealUnits } from "../app/dialogue-player.ts";
import { DialogueManager } from "../app/dialogue-manager.ts";

function rig() {
  const playback = { current: null }, typing = { current: null }, historyOpen = { current: false };
  let view, history, now = 0, timerId = 0;
  const timers = new Map(), cues = [], audio = [];
  const player = createDialoguePlayer({ playback, typing, historyOpen,
    setView: next => view = next, setHistory: next => history = next,
    setTimer: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; }, clearTimer: id => timers.delete(id),
    onLineSe: id => cues.push(id), onTypingStart: restart => audio.push(restart),
  });
  const tick = ms => { const end = now + ms; let due;
    while ((due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0])) { timers.delete(due[0]); now = due[1].at; due[1].fn(); }
    now = end;
  };
  return { player, tick, playback, typing, historyOpen, cues, audio, timers, get view() { return view; }, get history() { return history; } };
}
const script = { characterDelaySeconds: .02, lines: [
  { lineId: "first", speaker: " Sbaak ", text: "第一句..." },
  { lineId: "second", speaker: "", text: "第二句，比較長一點。" },
] };
test("the shared player reveals before advancing, groups punctuation, preserves blank speakers and completes once", () => {
  const r = rig(); let completed = 0;
  r.player.present("dialogue", {}, () => completed++, script);
  assert.equal(r.view.text, "第"); assert.equal(r.view.canReview, false); assert.equal(r.view.speaker, "Sbaak");
  assert.equal(r.player.openHistory(), false);
  r.player.advance(); assert.equal(r.view.text, "第一句..."); assert.equal(r.playback.current.lineIndex, 0);
  r.player.advance(); assert.equal(r.view.lineId, "second"); assert.equal(r.view.speaker, ""); assert.equal(r.view.canReview, true);
  r.tick(500); assert.equal(r.view.text, script.lines[1].text);
  r.player.advance(); assert.equal(completed, 1); assert.equal(r.view, null); assert.equal(r.player.advance(), false);
  r.tick(5000); assert.equal(completed, 1); assert.equal(r.timers.size, 0); assert.deepEqual(r.cues, ["first", "second"]);
  assert.deepEqual(splitDialogueRevealUnits("!! 真的移開了!"), ["!!", " 真", "的", "移", "開", "了", "!"]);
});
test("history pauses typing, excludes the current line, blocks advances and resumes exactly where it paused", () => {
  const r = rig(); r.player.present("dialogue", {}, () => {}, script); r.player.advance(); r.player.advance();
  r.tick(40); const partial = r.view.text;
  assert.equal(r.player.openHistory(), true); assert.deepEqual(r.history.entries.map(e => e.lineId), ["first"]);
  r.tick(2000); r.player.advance(); assert.equal(r.view.text, partial); assert.equal(r.playback.current.lineIndex, 1);
  assert.equal(r.player.closeHistory(), true); r.tick(1000); assert.equal(r.view.text, script.lines[1].text);
  assert.equal(r.history, null); assert.equal(r.historyOpen.current, false);
});
test("wrapped pages remain in the same script line and do not replay line audio or expose history too early", () => {
  const r = rig(), text = "長".repeat(200); let done = 0;
  assert.deepEqual(splitDialoguePages(text).map(p => p.length), [96, 96, 8]);
  r.player.present("long", {}, () => done++, { characterDelaySeconds: 0, lines: [{ lineId: "long-line", text }] });
  r.player.advance(); r.player.advance(); assert.equal(r.view.text.length, 8); assert.equal(r.view.canReview, false);
  assert.deepEqual(r.cues, ["long-line"]); assert.equal(done, 0); r.player.advance(); assert.equal(done, 1);
});
test("the production manager promise stays pending during history and cancels without completing the script", async () => {
  const r = rig(), manager = new DialogueManager(); let done = false;
  manager.register("real", script); manager.setPresenter((request, complete) => { r.player.present(request.id, request.context, complete, request.script); return r.player.close; });
  const result = manager.playRegistered("real", {}).then(value => { done = true; return value; });
  r.player.advance(); r.player.advance(); r.player.openHistory(); r.tick(10000); await Promise.resolve(); assert.equal(done, false);
  manager.cancelCurrent(); assert.deepEqual(await result, { completed: false }); assert.equal(r.view, null); assert.equal(r.history, null); assert.equal(r.timers.size, 0);
});
test("replacing a script removes stale typewriter callbacks and uses only the new dialogue's history", () => {
  const r = rig(); r.player.present("old", {}, () => {}, script); r.player.advance(); r.player.advance(); r.player.openHistory();
  r.player.present("new", {}, () => {}, { characterDelaySeconds: 0, lines: [{ text: "新對話" }] }); r.tick(10000);
  assert.equal(r.view.dialogueId, "new"); assert.equal(r.view.text, "新對話"); assert.equal(r.history, null); assert.equal(r.historyOpen.current, false);
});
test("game and preview both mount the shared production player/view, and intro scripts come from the actual scene", () => {
  for (const file of ["../app/movement-lab.tsx", "../app/phototropic-preview/page.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /createDialoguePlayer[<(]/); assert.match(source, /<DialoguePlayerView/);
    assert.doesNotMatch(source, /const showDialoguePage|const showSuccessLine|繼續對話/);
  }
  const preview = readFileSync(new URL("../app/phototropic-preview/page.tsx", import.meta.url), "utf8");
  assert.match(preview, /scene6.interactables.find/); assert.match(preview, /scene6-interaction-020/); assert.match(preview, /scene6-interaction-021/);
});
