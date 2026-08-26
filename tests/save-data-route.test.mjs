import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function createSave(savedAt = "2026-08-27T00:00:00.000Z") {
  return {
    format: "EchoesSaveData",
    schemaVersion: 1,
    savedAt,
    slotKind: "manual",
    summary: { chapterId: "chapter-3", chapterName: "第三章", questId: "Q", questName: "任務", stageId: "S", stageName: "階段" },
    progress: {
      sceneId: "Scene_3",
      survival: { values: { stamina: 100, hunger: 100, thirst: 100, spirit: 100 }, gameMinutes: 800, zeroDurationMinutes: { hunger: 0, thirst: 0, spirit: 0 }, gameOverReason: null },
      inventory: {},
      quest: { schemaVersion: 1, quests: {} },
      story: { currentChapter: 3, completedEventIds: [], storyFlags: {} },
      campPower: { current: 3, dailyConsumptionEnabled: false, lastProcessedCycle: 0 },
      interactionUsage: { cycle: 0, counts: {}, completedOnceIds: [] },
      itemPointProgress: { onceCollectedIds: [], dailyCollectedCycles: {} },
      collectedWorldItemIds: [],
      droppedWorldItems: [],
    },
  };
}

test("local SaveData API writes atomically, backs up overwrite, and archives deletion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "echoes-save-data-"));
  process.env.ECHOES_SAVE_DATA_ROOT = root;
  try {
    const route = await import(`../app/api/save-data/route.ts?test=${Date.now()}`);
    const write = (save) => route.POST(new Request("http://localhost/api/save-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: "slot-01", save }),
    }));
    assert.equal((await write(createSave())).status, 200);
    assert.equal((await write(createSave("2026-08-27T01:00:00.000Z"))).status, 200);
    const read = await route.GET(new Request("http://localhost/api/save-data?slot=slot-01"));
    assert.equal(read.status, 200);
    assert.equal((await read.json()).save.savedAt, "2026-08-27T01:00:00.000Z");
    const backupFiles = (await import("node:fs/promises")).readdir(path.join(root, "backups"));
    assert.equal((await backupFiles).some((file) => file.startsWith("slot-01-")), true);
    const deleted = await route.DELETE(new Request("http://localhost/api/save-data?slot=slot-01", { method: "DELETE" }));
    assert.equal(deleted.status, 200);
    const list = await route.GET(new Request("http://localhost/api/save-data"));
    const slots = (await list.json()).slots;
    assert.equal(slots.length, 26);
    assert.equal(slots.find((slot) => slot.slotId === "slot-01").exists, false);
    await assert.rejects(readFile(path.join(root, "slot-01.json"), "utf8"));
  } finally {
    delete process.env.ECHOES_SAVE_DATA_ROOT;
    await rm(root, { recursive: true, force: true });
  }
});
