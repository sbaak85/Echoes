---
name: echoes-project-relocation
description: Repair and verify Echoes Beyond the Stars after its checkout or project root moves to another drive or folder. Use when the user changes the authoritative project path, copies or renames the checkout, or reports launcher, dependency, build, Git-local, MapEditor, or executable failures after a move. Do not use for ordinary source edits when the project root is unchanged.
---

# Echoes Project Relocation

Restore a moved Echoes checkout without losing user work, reusing an obsolete path, or confusing generated artifacts with source files.

## Establish the authoritative checkout

- Treat the newest path explicitly designated by the user as authoritative. Resolve its absolute path and confirm `git rev-parse --show-toplevel` from that location.
- Treat every former checkout path as historical unless the user explicitly brings it back into scope. Do not edit, build, launch, commit, or clean the old checkout.
- Before changing anything, inspect `git status --short --branch`, the current branch, `origin`, and existing tracked/untracked changes. Preserve unrelated and user-authored files.
- Never hardcode the current drive into new launch logic. Batch files should derive the root from `%~dp0`; PowerShell should use `$PSScriptRoot`, `Split-Path`, and `Join-Path`; application code should resolve resources relative to the executable or project root.

## Audit path-sensitive references

- Search source, scripts, project files, local configuration, and launchers for the previous absolute root. Exclude `.git`, `node_modules`, build output, and binary/media files from broad text replacement.
- Keep the game and MapEditor sharing `public/maps`. A relocation must not create a second scene-data directory or silently repoint one component elsewhere.
- Treat `.runtime` logs and PID files as local generated state. A stored PID can be stale or reused; confirm the matching process before stopping it, and never kill a PID solely because it appears in an old file.

## Rebuild web dependencies

- Do not trust or copy `node_modules` across project-root changes. pnpm records path-sensitive module and virtual-store information, so a moved directory may prompt to remove and reinstall modules or contain broken links.
- If `node_modules\vinext\dist\cli.js` is missing after a move, validate that the deletion target resolves exactly to `<authoritative-root>\node_modules`, remove only that generated directory, and reinstall from the committed lockfile.
- Prepend the selected Node executable directory to `PATH` before pnpm runs so lifecycle scripts can resolve `node` and `npm`.
- Use `pnpm install --frozen-lockfile`. Preserve `pnpm-lock.yaml`; a local path move is not a reason to rewrite dependency versions.
- For the automated relocation-repair install, set `CI=true` only for the install process so pnpm cannot wait for confirmation in a hidden launcher. Restore the previous environment value afterward.
- When the bundled pnpm is a compatible version but differs from the `packageManager` pin, set `pnpm_config_pm_on_fail=ignore` only for that pnpm process and restore it afterward. Do not use this to cross an incompatible major version.
- Use `--force` only when relocation has made the modules directory incompatible and it must be recreated. Do not make forced reinstalls the ordinary fast path.
- If registry downloads fail with sandbox or network errors such as `EACCES`, request the required network approval and rerun the same frozen-lockfile install. Do not weaken integrity checks or change registries as a workaround.

## Update launchers and executable artifacts

- Keep `啟動遊戲.bat` as a path-relative entry point into `scripts/start-game.ps1`. The PowerShell launcher must derive every runtime, log, bridge, module, and game path from its own location.
- Preserve a fast prepared path: if the game is already responding or `vinext` is installed, do not reinstall dependencies.
- Start the actual BAT from the authoritative root during verification. Testing only a manually typed development command does not prove the user-facing launcher works.
- A project move alone does not require rebuilding `MapEditor.exe` if it is path-independent. It does require verifying that MapEditor still resolves `public/maps` relative to the new root.
- When MapEditor source or packaging changes, a successful `dotnet build` is not enough. Publish with the project’s configured Release settings, explicitly replace the launchable `MapEditor/MapEditor.exe`, and verify that the executable timestamp/content reflects the new build.
- After publishing MapEditor, run `--self-test` and `--ui-smoke-test`. If the change touches interactive UI, also apply `../browser-ui-focus-visuals/SKILL.md`.
- Keep MapEditor, BAT/PowerShell launchers, `.runtime`, `.git`, `node_modules`, and raw local assets out of GitHub Pages output.

## Verification checklist

Complete the checks relevant to the moved checkout:

1. Confirm the authoritative Git root, branch, `origin`, and preserved working-tree changes.
2. Confirm no active source or launcher still depends on the previous absolute root.
3. Parse `scripts/start-game.ps1` with the PowerShell parser and inspect its diff.
4. Confirm `node_modules\vinext\dist\cli.js` exists after installation.
5. Launch through `啟動遊戲.bat` from the new root.
6. Confirm `http://localhost:3000/` returns HTTP 200 and contains `Echoes Beyond the Stars`.
7. Run the project build after launcher, dependency, or build-configuration changes.
8. When MapEditor is affected, rebuild/publish the executable and run both executable tests.
9. Recheck `git status`; confirm the lockfile and unrelated files changed only when intentional.

## Handoff

State the new authoritative root and identify old roots as historical. Report generated directories that were removed and recreated, launcher or executable changes, verification results, remaining warnings, and all pre-existing uncommitted files that were preserved.
