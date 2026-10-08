import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ITEM_BY_ID, ITEM_DATABASE, INITIAL_PLAYER_INVENTORY, resolveItemId,
  normalizePlayerInventory, grantInventoryItem, useSurvivalInventoryItem,
} from "../app/item-database.ts";
import { createInitialSurvivalState } from "../app/survival-manager.ts";
import { normalizeHotbarAssignments } from "../app/hotbar-assignments.ts";

test("T0014 has a complete interaction-tool definition and preserves the reserved database slots", () => {
  const torch = ITEM_BY_ID.get("T0014");
  assert.equal(ITEM_DATABASE[67].item, torch);
  assert.equal(ITEM_DATABASE.length, 100);
  assert.equal(ITEM_DATABASE[68].item, null);
  assert.equal(torch.englishName, "faint-torch");
  assert.equal(torch.name, "微弱的火把");
  assert.equal(torch.category, "tool");
  assert.equal(torch.weight, .4);
  assert.equal(torch.usable, true);
  assert.equal(torch.useMode, "interaction");
  assert.deepEqual(torch.survivalEffects, {});
  assert.deepEqual(torch.inventoryRules, { transferable: true, discardable: true, stackSize: 5 });
  assert.match(torch.description, /微弱火光/);
  assert.match(torch.description, /場景互動/);
  assert.equal(INITIAL_PLAYER_INVENTORY.T0014 ?? 0, 0);
});

test("torch aliases survive inventory normalization and hotbar assignment; direct use never consumes it", () => {
  assert.equal(resolveItemId("faint-torch"), "T0014");
  assert.equal(resolveItemId(" t0014 "), "T0014");
  assert.deepEqual(normalizePlayerInventory({ "faint-torch": 2 }), { T0014: 2 });
  assert.equal(grantInventoryItem({}, "T0014", 2).T0014, 2);
  assert.equal(normalizeHotbarAssignments(["T0014"])[0], "T0014");
  const inventory = { T0014: 1 }, survival = createInitialSurvivalState();
  const result = useSurvivalInventoryItem(inventory, survival, "T0014");
  assert.equal(result.status, "interaction-only");
  assert.equal(result.inventory, inventory);
  assert.equal(result.survival, survival);
});

test("torch icon and inspect artwork are exact-size RGBA PNGs wired through ItemDatabase", async () => {
  const item = ITEM_BY_ID.get("T0014");
  assert.equal(item.artworkStem, "faint-torch");
  assert.equal(item.artworkInspectSize, 640);
  for (const [kind, size] of [["icon", 280], ["inspect", 640]]) {
    const png = await readFile(new URL(`../public/ui/items/faint-torch-${kind}-${size}.png`, import.meta.url));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(png[25], 6, "RGBA artwork must retain the flame alpha edge");
  }
  const runtime = await readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(runtime, /ITEM_BY_ID\.get\(itemId\)\?\.artworkStem/);
  assert.ok(runtime.includes("definition?.artworkInspectSize ?? 640"));
});

test("MapEditor alias and QuestEditor dynamic item reader both include the new torch", async () => {
  const editor = await readFile(new URL("../MapEditor/SceneModels.cs", import.meta.url), "utf8");
  assert.match(editor, /\["faint-torch"\] = "T0014"/);
  assert.match(editor, /new\("T0014", "微弱的火把"\)/);
  const questReader = await readFile(new URL("../QuestEditor/QuestReferenceProvider.cs", import.meta.url), "utf8");
  assert.ok(questReader.includes('"item-database.ts"'));
  const database = await readFile(new URL("../app/item-database.ts", import.meta.url), "utf8");
  // Mirror the existing .NET reader's pattern, which reads names directly from the TS source.
  const parsed = [...database.matchAll(/item\s*:\s*\{\s*id\s*:\s*"(?<id>[^"]+)"[\s\S]*?name\s*:\s*"(?<name>[^"]+)"/g)];
  assert.deepEqual(parsed.find(match => match.groups.id === "T0014")?.groups,
    Object.assign(Object.create(null), { id: "T0014", name: "微弱的火把" }));
});
