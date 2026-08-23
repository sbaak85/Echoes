---
name: echoes-project-summaries
description: Create, locate, read, and update Echoes Beyond the Stars project summaries and handoff notes. Use for daily, scheduled, temporary, caution, special-case, progress, handoff, or similarly named Markdown summaries, and when the user asks to refresh project progress or learn the newest project notes. Do not use for ordinary documentation that is not serving as a project summary or handoff.
---

# Echoes Project Summaries

Keep project summaries portable across computers and discover the newest project context before searching elsewhere.

## Canonical summary directory

- The current absolute directory is `I:\Codex\專案型\Echoes\docs\daily-summaries`.
- Its repository-relative identity is `docs/daily-summaries`. If the authoritative checkout moves again, use `<authoritative-project-root>\docs\daily-summaries` according to `../echoes-project-relocation/SKILL.md` rather than writing back to an obsolete drive.
- Create all daily summaries, scheduled summaries, temporary summaries, caution/attention summaries, special-situation summaries, progress summaries, handoff summaries, and similar project-summary `.md` files in this directory unless the user explicitly supplies another destination.
- Do not create a new project-summary Markdown file at the repository root or in another documentation folder merely because an older file exists there.
- Files pulled from another computer into this directory have the same priority as locally created summaries.

## Creating a summary

- A summary filename does not need to be exactly `摘要.md`. Preserve a filename explicitly requested by the user; otherwise prefer a date-prefixed descriptive name such as `YYYY-MM-DD-<topic>-摘要.md`.
- Let the filename distinguish temporary, caution, special-case, progress, or handoff content when that distinction is useful.
- Before writing, inspect the destination directory for a same-name or same-topic file. Do not overwrite an unrelated or manually edited summary.
- When the user asks to update an identified summary, read it completely and preserve its useful structure and history. When no file is identified, read the newest relevant summary as the baseline before deciding whether to update it or create a new dated file.
- Use the same directory rule inside any scheduled-task prompt that will generate summary Markdown later.
- If a new daily or project handoff summary includes UI work, state that `../browser-ui-focus-visuals/SKILL.md` applies and link to it, as required by the project instructions.

## Finding the newest project context

When the user asks to update project progress, understand new cautions, read the project summary, or otherwise refresh context:

1. Search `docs/daily-summaries` first and enumerate every `*.md` file.
2. Sort by filesystem `LastWriteTime` descending. Do not assume that the newest date in a filename is the newest modified file.
3. Treat every Markdown file in this dedicated directory as a summary candidate regardless of its exact name. Names containing concepts such as `摘要`, `注意事項`, `進度`, `交接`, `臨時`, `特殊`, `規格`, `summary`, `notes`, or `handoff` help determine relevance but are not required.
4. For a general request, read the most recently modified candidate first. If its topic is unrelated to the request, continue through the next most recent candidates until the relevant current context is established.
5. If several pulled files have indistinguishable modification times, use filename dates/topics and recent Git history only as tie-breakers.

Read the selected summary file completely before reporting its contents or editing it. Distinguish statements recorded in the summary from facts reverified in the current checkout.

## Fallback search

- Only when no relevant summary Markdown is found in `docs/daily-summaries`, perform one expanded search across the authoritative project root for `*.md` files.
- Exclude `.git`, `node_modules`, generated build output, caches, and external/obsolete checkouts from the expanded search.
- Apply the same modification-time and relevance rules to fallback results. Do not search outside the authoritative project root unless the user explicitly asks.
- Do not move legacy summaries into the canonical directory unless the user asks for migration; merely use them as fallback evidence.

## Safe updates and handoff

- Preserve unknown, manually edited, and unrelated summary content. Update only what the request requires, and avoid replacing historical facts with guesses.
- Recheck Git status after creating or modifying a summary so the user can see the exact new or changed file.
- Report the full summary path, whether it was created or updated, which recent files were read as context, and whether the project-wide fallback search was needed.
