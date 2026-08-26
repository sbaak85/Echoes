import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSaveDataFileApiHandler } from "../scripts/save-data-vite-plugin.ts";

function createSave(savedAt = "2026-08-27T00:00:00.000Z") {
  return {
    format: "EchoesSaveData",
    schemaVersion: 1,
    savedAt,
    slotKind: "manual",
    summary: {
      chapterId: "chapter-3",
      chapterName: "第三章",
      questId: "QUEST_TEST",
      questName: "測試任務",
      stageId: "STAGE_02",
      stageName: "第二階段",
    },
    progress: {
      sceneId: "Scene_3",
      survival: {
        values: { stamina: 61, hunger: 62, thirst: 63, spirit: 64 },
        gameMinutes: 800,
        zeroDurationMinutes: { hunger: 0, thirst: 0, spirit: 0 },
        gameOverReason: null,
      },
      inventory: { T0007: 1 },
      quest: { schemaVersion: 1, quests: {} },
      story: { currentChapter: 3, completedEventIds: [], storyFlags: {} },
      campPower: { current: 5, dailyConsumptionEnabled: false, lastProcessedCycle: 0 },
      interactionUsage: { cycle: 0, counts: {}, completedOnceIds: [] },
      itemPointProgress: { onceCollectedIds: [], dailyCollectedCycles: {} },
      collectedWorldItemIds: [],
      droppedWorldItems: [],
    },
  };
}

test("Vite local SaveData middleware writes real portable files", async () => {
  const saveRoot = await mkdtemp(path.join(os.tmpdir(), "echoes-vite-save-data-"));
  const handler = createSaveDataFileApiHandler(saveRoot);
  const server = createServer((request, response) => {
    void handler(request, response, () => {
      response.statusCode = 404;
      response.end("not found");
    }).catch((error) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api/save-data`;

  try {
    const write = (save) => fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: "slot-01", save }),
    });
    assert.equal((await write(createSave())).status, 200);
    assert.equal((await write(createSave("2026-08-27T01:00:00.000Z"))).status, 200);

    const savedFile = JSON.parse(await readFile(path.join(saveRoot, "slot-01.json"), "utf8"));
    assert.equal(savedFile.savedAt, "2026-08-27T01:00:00.000Z");
    assert.equal(savedFile.progress.sceneId, "Scene_3");

    const readResponse = await fetch(`${baseUrl}?slot=slot-01`);
    assert.equal(readResponse.status, 200);
    assert.equal((await readResponse.json()).save.progress.inventory.T0007, 1);

    const listResponse = await fetch(baseUrl);
    assert.equal(listResponse.status, 200);
    const slots = (await listResponse.json()).slots;
    assert.equal(slots.length, 26);
    assert.equal(slots.find((slot) => slot.slotId === "slot-01").exists, true);

    const backups = await readdir(path.join(saveRoot, "backups"));
    assert.equal(backups.some((file) => file.startsWith("slot-01-")), true);

    const writeAutosave = (savedAt) => fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: "autosave",
        save: { ...createSave(savedAt), slotKind: "auto" },
      }),
    });
    assert.equal((await writeAutosave("2026-08-27T02:00:00.000Z")).status, 200);
    assert.equal((await writeAutosave("2026-08-27T02:01:00.000Z")).status, 200);
    assert.equal((await writeAutosave("2026-08-27T02:02:00.000Z")).status, 200);
    assert.equal(
      (await readdir(path.join(saveRoot, "backups"))).filter(
        (file) => file.startsWith("autosave"),
      ).join(","),
      "autosave-previous.json",
    );

    const deleteResponse = await fetch(`${baseUrl}?slot=slot-01`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 200);
    await assert.rejects(readFile(path.join(saveRoot, "slot-01.json"), "utf8"));
    assert.equal(
      (await readdir(path.join(saveRoot, "backups"))).some((file) => file.includes("-deleted-")),
      true,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(saveRoot, { recursive: true, force: true });
  }
});
