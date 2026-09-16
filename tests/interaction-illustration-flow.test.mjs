import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { runInteractionIllustrationFlow } from "../app/interaction-illustration-flow.ts";

test("concurrent artwork opens before dialogue and completion waits for its fade-out", async () => {
  const events = []; let finishDialogue, finishFade;
  const dismissed = new Promise(resolve => { finishFade = resolve; });
  const run = runInteractionIllustrationFlow(true,
    () => { events.push("dialogue"); return new Promise(resolve => { finishDialogue = resolve; }); },
    { open: () => { events.push("image"); return dismissed; }, close: () => { events.push("fade-out"); return dismissed; }, cancel: () => events.push("cancel") },
    () => events.push("complete"));
  assert.deepEqual(events, ["image", "dialogue"]);
  finishDialogue({ completed: true }); await Promise.resolve();
  assert.deepEqual(events, ["image", "dialogue", "fade-out"]);
  finishFade(true); await run;
  assert.equal(events.at(-1), "complete");
});

test("sequential artwork waits for dialogue; cancelled dialogue does not grant completion", async () => {
  for (const completed of [false, true]) {
    const events = [];
    await runInteractionIllustrationFlow(false, async () => { events.push("dialogue"); return { completed }; },
      { open: async () => { events.push("image"); return true; }, close: async () => true, cancel() {} },
      () => events.push("complete"));
    assert.deepEqual(events, completed ? ["dialogue", "image", "complete"] : ["dialogue"]);
  }
});

test("all three specified Scene6 interactions reference the available illustration concurrently", () => {
  const scene = JSON.parse(readFileSync(new URL("../public/maps/map_scene_06B.scene.json", import.meta.url), "utf8"));
  for (const id of ["scene6-interaction-009", "scene6-interaction-010", "scene6-interaction-011"]) {
    const item = scene.interactables.find(item => item.id === id);
    assert.deepEqual(item.completionIllustration, { enabled: true, withDialogue: true, imagePath: "/ui/interaction-illustrations/訊號探測儀_B.png" });
    assert.ok(existsSync(new URL(`../public${item.completionIllustration.imagePath}`, import.meta.url)));
  }
});
