---
name: echoes-item-catalog-sync
description: Keep Echoes Beyond the Stars Item definitions synchronized with MapEditor and every other editor or local tool that indexes Items. Use whenever an Item is added, removed, renamed, reclassified, re-IDed, or when an editor Item option list or Item count is stale. Do not use for inventory quantity changes that do not alter Item definitions or indexed Item metadata.
---

# Echoes Item Catalog Synchronization

Keep every editor-facing Item selector consistent with the game database whenever the set or identity of Items changes.

## Source of truth

- Treat `app/item-database.ts`, especially `ITEM_DATABASE` and `ITEM_DEFINITIONS`, as authoritative for Item IDs, English names, display names, categories, and the number of populated Item definitions.
- Preserve existing Item IDs unless the user explicitly requests an ID migration. An Item quantity changing inside inventory, rewards, recipes, or quests does not by itself change the Item catalog.

## Discover indexed consumers

- Do not assume MapEditor is the only consumer. Search the entire project for Item IDs, display names, English-name aliases, hard-coded Item counts, Item catalogs, combo-box sources, and editor selectors.
- Inspect at least `MapEditor`, `QuestEditor`, `ChapterScriptEditor`, `AudioEventManager`, other local tools, and relevant tests. Exclude `.git`, `node_modules`, `bin`, `obj`, and generated publish output.
- Distinguish a duplicated editor catalog from ordinary quest, scene, test, or dialogue references. Update references only when the Item change requires it.

## Synchronize editors

- Update every duplicated Item catalog and Item selector with the authoritative ID and display name.
- Update legacy English-name aliases when an editor accepts old or human-readable Item identifiers.
- Update hard-coded populated-Item counts and self-test assertions.
- When removing or changing an ID, search scene, quest, dialogue, save-data migration, world-placement, and test files for affected references and migrate them deliberately.

## Prevent future drift

- Maintain an automated parity test that compares each duplicated editor Item catalog against `ITEM_DEFINITIONS` by ID and display name.
- A new Item is not complete while this parity test fails or an indexed editor selector still omits it.

## Build and verify

1. Run the Item-system tests, including the editor-catalog parity test.
2. Build every affected editor project.
3. When MapEditor source changes, publish Release win-x64, replace the launchable `MapEditor/MapEditor.exe`, then run `MapEditor.exe --self-test` and `MapEditor.exe --ui-smoke-test`.
4. Recheck the working tree and preserve unrelated user changes. Do not commit or publish unrelated files.

## Handoff

Report which Items changed, which indexed editors were discovered and updated, whether the parity test passed, and which executable artifacts were rebuilt.
