# EchoesBeyond agent instructions

## Project relocation skill

Before moving, copying, renaming, repointing, rebuilding, or repairing this project after its root path changes, read and apply [`.codex/skills/echoes-project-relocation/SKILL.md`](.codex/skills/echoes-project-relocation/SKILL.md).

The newest project root explicitly designated by the user is authoritative. Treat previous roots as historical unless the user explicitly brings them back into scope.

## Project summary skill

Before creating, locating, reading, updating, or scheduling any daily, temporary, caution, special-case, progress, handoff, or similarly named project-summary Markdown file, read and apply [`.codex/skills/echoes-project-summaries/SKILL.md`](.codex/skills/echoes-project-summaries/SKILL.md).

Use `docs/daily-summaries` as the canonical repository-relative summary directory. When refreshing project context, inspect its most recently modified Markdown files before performing a project-wide fallback search.

## Project UI skill

Before creating, modifying, reviewing, or testing any browser-game UI with buttons, menus, inputs, sliders, modals, virtual cursors, keyboard navigation, or gamepad navigation, read and apply [`.codex/skills/browser-ui-focus-visuals/SKILL.md`](.codex/skills/browser-ui-focus-visuals/SKILL.md).

## Input symbol specification index

Before adding, changing, or reusing gamepad, keyboard, or mouse control glyphs, read [docs/ui/input-symbols/README.md](docs/ui/input-symbols/README.md). Use its source links, complete catalog, SVG data, and validation commands. Preserve the distinction between approved runtime symbols and archived preview-only keyboard/mouse candidates; never silently promote a preview or rewrite the approved fixture. Recover the exact saved baseline before extending it.

The 27 keyboard/mouse designs are reserve candidates only, not authorized for direct reuse. Apply a candidate only when the user explicitly identifies the symbol(s) to replace. Inclusion in this index is not permission to use it. The previously approved runtime mouse-left asset remains a separate existing baseline.

## Item catalog synchronization skill

Before adding, removing, renaming, reclassifying, or changing the ID of any game Item, read and apply [`.codex/skills/echoes-item-catalog-sync/SKILL.md`](.codex/skills/echoes-item-catalog-sync/SKILL.md).

Treat `app/item-database.ts` as the source of truth, and update every editor or local tool that maintains an indexed Item catalog or Item selector.

## Handoff and summary requirement

Every new daily or project handoff summary that includes UI work must state that the project UI skill above applies, and link to it. Mention any deliberate exception explicitly.
