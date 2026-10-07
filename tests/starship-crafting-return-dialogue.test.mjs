import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { DialogueManager } from "../app/dialogue-manager.ts";
import { craftInventoryRecipe } from "../app/crafting-recipes.ts";
import { normalizeEchoesSaveData } from "../app/save-data.ts";
import { createNewGameProgress } from "../app/new-game-reset.ts";
import {
  STARSHIP_CRAFTING_RETURN_DIALOGUE as dialogueId,
  STARSHIP_CRAFTING_RETURN_PENDING_FLAG as pendingFlag,
  publishStarshipCraftWithReturnDialogue as publishCraft,
  isStarshipCraftingReturnPending as isPending,
  completeStarshipCraftingReturnDialogue as completeStory,
  createStarshipCraftingReturnDialogueController as createController,
} from "../app/starship-crafting-return-dialogue.ts";

const raw = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
const questId = "QUEST_CH04_MAIN_001", obj18 = questId + "_OBJ_18", obj20 = questId + "_OBJ_20";
const quest = raw.quests.find(q => q.id === questId);
const start = quest.stages.findIndex(s => s.objectives.some(o => o.id === obj18));
const document = { ...raw, chapters: [], quests: [{ ...quest, prerequisiteQuestIds: [], stages: quest.stages.slice(start) }] };

function harness(saved, activate = true) {
  let time = 1000, sequence = 0;
  const timers = new Map(), presented = [];
  let story = saved?.story ?? { currentChapter: 4, completedEventIds: [], storyFlags: {} };
  let inventory = saved?.inventory ?? { R0020: 5, R0036: 5 };
  let menuOpen = true, blocked = false;
  const manager = new QuestRuntimeManager(document, { now: () => time, scheduleQuestStart() {} }, saved?.quest);
  if (!saved) {
    manager.startQuest(questId);
    if (activate) manager.activateObjective(questId + "_OBJ_17", "chapter04-section-6");
  }
  time += 1000;
  const dialogue = new DialogueManager();
  dialogue.register(dialogueId, { lines: [{ speaker: "Sbaak", text: "return" }] });
  dialogue.setPresenter(request => {
    presented.push(request.id);
    manager.handleEvent({ type: "dialogueStarted", targetId: request.id, eventId: "started:" + ++sequence });
  });
  dialogue.setCompletionListener(request => {
    if (request.id === dialogueId) story = completeStory(story);
    manager.handleEvent({ type: "dialogueCompleted", targetId: request.id, eventId: "completed:" + ++sequence });
  });
  const controller = createController({
    isPending: () => isPending(story) && !manager.hasDialogueCompleted(dialogueId),
    isMenuOpen: () => menuOpen,
    isSceneAvailable: () => !blocked && !dialogue.isPlaying(),
    playDialogue: () => dialogue.playRegistered(dialogueId, { type: "dialogue" }),
    setTimer: (callback, delayMs) => { const id = ++sequence; timers.set(id, { callback, at: time + delayMs }); return id; },
    clearTimer: id => timers.delete(id),
  });
  const h = {
    controller, manager, dialogue, timers, presented,
    story: () => story,
    frame: () => controller.reconcile(),
    menu(open) { menuOpen = open; controller.reconcile(); },
    block(value) { blocked = value; controller.reconcile(); },
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].callback();
      }
      time = end;
      controller.reconcile();
    },
    craft(quantity = 1, transaction = "craft:" + crypto.randomUUID()) {
      const result = craftInventoryRecipe(inventory, "T0006", quantity);
      story = publishCraft(manager, result, transaction, story);
      if (result.ok) inventory = result.inventory;
      controller.reconcile();
      return result;
    },
    save() {
      return normalizeEchoesSaveData(JSON.parse(JSON.stringify({
        format: "EchoesSaveData", schemaVersion: 1, summary: {},
        progress: { ...createNewGameProgress(), sceneId: "Scene_3", inventory, story, quest: manager.exportSave() },
      }))).progress;
    },
  };
  return h;
}

test("pickup or one fabricated stick never arms the dialogue, regardless of menu dwell time", () => {
  const h = harness();
  h.manager.syncCurrentInventory({ T0006: 99 });
  h.manager.handleEvent({ type: "itemCollected", targetId: "T0006", amount: 2, eventId: "pickup" });
  h.menu(false); h.advance(10000);
  assert.equal(isPending(h.story()), false); assert.deepEqual(h.presented, []);
  h.menu(true); assert.equal(h.craft(1).ok, true);
  h.menu(false); h.advance(10000);
  assert.equal(h.manager.getObjectiveProgress(questId, obj18).currentAmount, 1);
  assert.equal(isPending(h.story()), false); assert.deepEqual(h.presented, []);
});

test("two real crafts arm once, but all inner pages and arbitrary menu dwell time remain safe", () => {
  const h = harness();
  h.craft(1); h.menu(false); h.advance(600); h.menu(true); h.craft(1);
  assert.equal(h.manager.getObjectiveProgress(questId, obj18).completed, true);
  assert.equal(isPending(h.story()), true);
  // Recipe result -> workbench -> station choice -> outer main menu all retain menuOpen.
  for (let page = 0; page < 4; page++) { h.frame(); h.advance(60000); }
  assert.equal(h.timers.size, 0); assert.deepEqual(h.presented, []);
  h.menu(false); h.advance(499); assert.deepEqual(h.presented, []);
  h.advance(1); assert.deepEqual(h.presented, [dialogueId]);
});

test("a batch of two starts the standard player 500 ms after the outer close; OBJ20 waits for completion", async () => {
  const h = harness(); h.craft(2); h.menu(false);
  assert.equal(h.manager.isObjectiveInProgress(questId, obj20), false);
  h.advance(500);
  assert.equal(h.dialogue.isPlaying(), true);
  assert.equal(h.manager.isObjectiveInProgress(questId, obj20), false, "dialogueStarted is insufficient");
  for (let frame = 0; frame < 60; frame++) h.frame();
  assert.deepEqual(h.presented, [dialogueId]);
  h.dialogue.completeCurrent(); await Promise.resolve();
  assert.equal(h.manager.isObjectiveInProgress(questId, obj20), true);
  assert.equal(isPending(h.story()), false);
  assert.ok(h.story().completedEventIds.includes(dialogueId));
});

test("reopening the menu cancels the old timer and requires a fresh full 500 ms return", () => {
  const h = harness(); h.craft(2); h.menu(false);
  const stale = [...h.timers.values()][0].callback;
  h.advance(200); h.menu(true); stale(); h.advance(1000);
  assert.deepEqual(h.presented, []);
  h.menu(false); h.advance(499); assert.deepEqual(h.presented, []);
  h.advance(1); assert.deepEqual(h.presented, [dialogueId]);
});

test("opening another blocking UI during the wait cancels it, then counts 500 ms in the scene", () => {
  const h = harness(); h.craft(2); h.menu(false); h.advance(250);
  h.block(true); h.advance(10000); assert.deepEqual(h.presented, []);
  h.block(false); h.advance(499); assert.deepEqual(h.presented, []);
  h.advance(1); assert.deepEqual(h.presented, [dialogueId]);
});

test("timer expiry rechecks current UI even without an intervening animation frame", () => {
  let menu = false, blocked = false, callback, plays = 0;
  const controller = createController({
    isPending: () => true, isMenuOpen: () => menu, isSceneAvailable: () => !blocked,
    playDialogue: async () => { plays++; return { completed: true }; },
    setTimer: cb => { callback = cb; return 1; }, clearTimer() {},
  });
  controller.reconcile(); menu = true; callback(); assert.equal(plays, 0);
  menu = false; controller.reconcile(); blocked = true; callback(); assert.equal(plays, 0);
  controller.dispose();
});

test("a different active dialogue prevents queuing section 8 behind it", () => {
  const h = harness(); h.craft(2);
  void h.dialogue.play("other", { lines: [] }, {});
  h.menu(false); h.advance(10000); assert.deepEqual(h.presented, ["other"]);
  h.dialogue.completeCurrent(); h.frame(); h.advance(500);
  assert.deepEqual(h.presented, ["other", dialogueId]);
});

test("pending survives portable save and reload before returning to the scene", () => {
  const h = harness(); h.craft(2);
  const saved = h.save(); h.controller.dispose();
  assert.equal(saved.story.storyFlags[pendingFlag], true);
  const restored = harness(saved); restored.advance(10000);
  assert.deepEqual(restored.presented, []);
  restored.menu(false); restored.advance(500);
  assert.deepEqual(restored.presented, [dialogueId]);
});

test("the first stick survives reload, and the second actual craft arms the return dialogue", () => {
  const h = harness(); h.craft(1); const saved = h.save(); h.controller.dispose();
  const restored = harness(saved); restored.craft(1);
  assert.equal(isPending(restored.story()), true);
  restored.menu(false); restored.advance(500);
  assert.deepEqual(restored.presented, [dialogueId]);
});

test("completion persists once only, even after more crafts, menu exits and reloads", async () => {
  const h = harness(); h.craft(2); h.menu(false); h.advance(500);
  h.dialogue.completeCurrent(); await Promise.resolve();
  h.menu(true); h.craft(1); h.menu(false); h.advance(10000);
  assert.deepEqual(h.presented, [dialogueId]);
  const saved = h.save(); h.controller.dispose();
  assert.equal(saved.story.storyFlags[pendingFlag], false);
  const restored = harness(saved); restored.craft(1); restored.menu(false); restored.advance(10000);
  assert.deepEqual(restored.presented, []);
});

test("failed, other-recipe, duplicate and inactive-objective crafts cannot arm pending", () => {
  const h = harness();
  const failed = craftInventoryRecipe({}, "T0006", 2);
  assert.equal(publishCraft(h.manager, failed, "failed", h.story()), h.story());
  const other = { ok: true, itemId: "T0001", quantity: 2, inventory: {} };
  assert.equal(publishCraft(h.manager, other, "other", h.story()), h.story());
  h.craft(1, "duplicate"); h.craft(1, "duplicate");
  assert.equal(h.manager.getObjectiveProgress(questId, obj18).currentAmount, 1);
  assert.equal(isPending(h.story()), false);
  const inactive = harness(undefined, false); inactive.craft(2);
  assert.equal(isPending(inactive.story()), false);
});

test("existing quest dialogue history prevents replay even without the new story marker", () => {
  const h = harness();
  h.manager.handleEvent({ type: "dialogueCompleted", targetId: dialogueId, eventId: "previous-version" });
  h.craft(2); h.menu(false); h.advance(10000);
  assert.deepEqual(h.presented, []); assert.equal(isPending(h.story()), false);
});

test("a cancelled playback remains pending and retries only after another menu exit", async () => {
  const h = harness(); h.craft(2); h.menu(false); h.advance(500);
  h.dialogue.cancelCurrent(); await Promise.resolve();
  assert.equal(isPending(h.story()), true);
  h.advance(10000); assert.deepEqual(h.presented, [dialogueId]);
  h.menu(true); h.menu(false); h.advance(500);
  assert.deepEqual(h.presented, [dialogueId, dialogueId]);
});

test("unmount cancels the timer, and new game clears both pending and completion markers", () => {
  const h = harness(); h.craft(2); h.menu(false);
  const stale = [...h.timers.values()][0].callback;
  h.controller.dispose(); stale(); h.advance(10000);
  assert.deepEqual(h.presented, []); assert.equal(h.timers.size, 0);
  assert.equal(isPending(createNewGameProgress().story), false);
  assert.equal(createNewGameProgress().story.completedEventIds.includes(dialogueId), false);
});

test("production uses the real outer-menu flag, shared scene gate, persisted story and registered dialogue player", () => {
  const movement = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../app/starship-interaction-menu.tsx", import.meta.url), "utf8");
  assert.ok(menu.includes('if (view === "main") onClose();'));
  for (const binding of [
    'isMenuOpen: () => starshipInteractionMenuOpenRef.current',
    '!isWorldInteractionBlockedByUi()',
    'playDialogue: () => dialogueManagerRef.current!.playRegistered(STARSHIP_CRAFTING_RETURN_DIALOGUE',
    'request.id === STARSHIP_CRAFTING_RETURN_DIALOGUE',
    'completeStarshipCraftingReturnDialogue(storyProgressRef.current)',
    'publishStarshipCraftWithReturnDialogue(',
    'saveStoryProgress(nextStory)',
    'craftingReturnDialogueController.reconcile()',
    'craftingReturnDialogueController.dispose()',
  ]) assert.ok(movement.includes(binding), binding);
  const story = readFileSync(new URL("../app/story-content.ts", import.meta.url), "utf8");
  assert.ok(story.includes('"chapter04-section-8": {'));
});
