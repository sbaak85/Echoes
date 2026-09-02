---
name: browser-ui-focus-visuals
description: Enforce browser-game and web UI focus visuals, blocking-overlay hit testing, and default gamepad-control rules. Use when creating, modifying, reviewing, or testing interactive browser UI such as buttons, inputs, range sliders, menus, modals, virtual cursors, keyboard navigation, or gamepad navigation. Hide native browser focus visuals, prevent blocking UI from leaking input to the game world, and give every menu or clickable-button UI default left-stick navigation and A-button activation.
---

# Browser UI Focus Visuals

## Core rule

Keep browser-native focus backgrounds, outlines, focus rings, and selection rectangles invisible in every UI state.

Maintain exactly one visible pointer cursor. The physical mouse cursor and every game-rendered virtual cursor are mutually exclusive; never let two cursor renderers appear at the same time.

Do not remove keyboard, gamepad, or assistive-technology operability to achieve this. Preserve semantic elements, focusability, input events, and ARIA behavior.

Give every UI containing a menu or clickable button gamepad support by default. Do not wait for a separate user request.

## Implementation

- Neutralize native `:focus` and `:focus-visible` visuals within the relevant UI scope, including `outline`, browser-added `box-shadow`, and platform-specific highlight colors when present.
- Inspect labels, transparent `input[type="range"]` elements, buttons, links, and programmatically focused elements. The visible rectangle may come from a parent `is-selected` style rather than the browser outline.
- Keep game-owned selection feedback separate from DOM focus. Render intentional selection with explicit classes or data attributes such as `is-selected` or `data-gamepad-selected`.
- Follow the last active input method. Mouse, virtual cursor, directional navigation, and analog controls must not display or seize another mode's selection visuals.
- When an analog control changes a value directly, do not show a directional-navigation selection frame. Blur a hidden native input if it retains an unwanted browser focus state.
- Restore only the game's custom highlight when directional keyboard or gamepad navigation resumes.

## Cursor ownership and mutual exclusion

Treat pointer visibility, pointer movement, menu selection, and activation-button ownership as separate states. A change in one state must not silently reset or seize the others.

- Keep one authoritative pointer owner: either the physical mouse cursor or one shared virtual cursor. Do not create a feature-local virtual cursor when the shared cursor already exists.
- When the physical mouse actually moves and takes ownership, stop rendering the virtual cursor before allowing the native pointer to become visible.
- When the right stick or another virtual-pointer input takes ownership, hide the physical cursor before rendering the virtual cursor. Preserve the virtual cursor's last valid screen position across menus, scrolling, modal transitions, and changes to directional selection.
- Directional navigation may own the selected row and the A-button action while the virtual cursor remains visible at its last position. A custom selection frame is not a second cursor. Do not deactivate the virtual cursor merely because the D-pad or left stick moved.
- Never reveal the physical pointer simply because the virtual cursor temporarily stops owning A-button activation. In particular, switching a menu from cursor activation to directional activation must not expose a physical pointer parked at screen center.
- Do not recenter, snap, teleport, or attach the virtual cursor to the newly selected control unless the user explicitly requested cursor snapping. Scrolling content beneath a stationary cursor must not mutate the cursor coordinates.
- Opening a dialogue, modal, inventory, minigame, or confirmation must reuse the current pointer owner. If a transition intentionally changes ownership, hide the previous pointer first and transfer the existing virtual cursor position when applicable.
- Closing an interface must not resurrect a stale physical or virtual cursor. Restore the pointer appropriate to the latest real input, and clear obsolete feature-local visibility flags.
- Mouse movement, right-stick movement, D-pad movement, and A-button activation must each use explicit takeover thresholds or edge detection so minor analog drift cannot rapidly alternate cursor ownership.

## Blocking UI and world interaction

A blocking UI is any open modal, overlay, panel, confirmation, dialogue, menu, minigame, or failure screen whose presence is intended to suspend ordinary world input. While any blocking UI is open:

- The virtual cursor must never hit, highlight, select, path toward, or activate world interactables behind the UI.
- Non-interactive space inside the blocking UI still consumes the input. Do not fall through to a world action merely because no UI button is under the cursor.
- Suppress world interaction prompts and hover highlights, and clear cached world targets or prompt ownership so stale indicators do not remain visible behind the UI.
- Apply one shared blocking condition to world-target discovery, prompt rendering, and actual activation. Hiding the prompt alone is insufficient if keyboard, pointer, touch, or gamepad input can still trigger the target.
- Keep UI hit testing active so the virtual cursor can continue selecting controls inside the open interface. Closing the last blocking UI restores world hit testing.

Apply this rule consistently to mouse, touch, keyboard, gamepad buttons, directional selection, and virtual-cursor activation. Passive HUD elements that are not intended to block world control are not blocking UI.

## Default gamepad menu support

- When a panel opens, establish one enabled interactive target as its current selection.
- Let the left stick move among enabled, visible buttons and menu items. Support both axes when the layout needs them.
- Wrap navigation at the ends so repeated left-stick movement cycles through available targets instead of stopping.
- Skip disabled, hidden, or otherwise unavailable targets.
- Make gamepad A activate the current target through the same action handler as a real pointer click. Do not duplicate business logic in a gamepad-only handler.
- Treat a new left-stick input as the latest navigation method and show only the game's custom selection highlight.
- Preserve virtual-cursor support when present. Follow the last active input method so the left stick, directional selection, right-stick virtual cursor, mouse, and touch do not simultaneously control or overwrite one another.
- Use edge detection and intentional repeat timing for held controls so one stick movement does not trigger uncontrolled multi-step navigation or repeated A activations.

## Black-screen fade invariant

Treat restoration from a black screen as a critical game-recovery invariant, not merely a visual effect.

- Unless an event explicitly requests a persistent black screen, its complete sequence is: fade the full-screen black overlay in, hold it, then fade that same overlay out until the game is fully visible again. `FadeOut` means lighting the scene back up; fading only the subtitle text is incorrect.
- After a non-persistent fade-out finishes, force the overlay to its terminal clear state even if animation rounding or an interrupted transition leaves an intermediate value: opacity `0`, no pointer or hit-test blocking, no black-screen input lock, and no stale modal ownership.
- Cancellation, exceptions, component unmounting, script replacement, and early exits must run equivalent cleanup. Use a `finally` or another guaranteed teardown path for non-persistent events so a failed callback cannot strand the game behind an opaque overlay.
- A persistent black state is allowed only when a deliberate setting such as `keepBlack` is enabled and a clearly identified following flow owns responsibility for restoring visibility. Never infer persistence merely because subtitle timing has ended or another event may run later.
- Keep one authoritative owner for overlay opacity. Do not combine imperative DOM mutation with a parent render that can silently reapply `opacity: 1`; React state, animation state, and DOM attributes must agree on the final value.
- When one black-screen flow hands off to another, make ownership explicit so cleanup from the older flow cannot fight the newer flow, while the newer flow remains responsible for eventual restoration.

For a configured sequence such as fade-in `0.5 s`, hold `4 s`, and fade-out `2 s` with persistence disabled, the required observable result is a fully black screen after the first phase, a four-second hold, a two-second transition back to the scene, and a fully transparent non-blocking overlay at completion.

## Chapter subtitle transition invariant

Chapter opening, chapter ending, and ChapterScriptEditor-authored black-screen subtitles use opacity-only transitions by default.

- Fade subtitle text in without changing its position, scale, rotation, blur, or clip path; hold it at the same centered coordinates; then fade it out at those same coordinates.
- Do not add upward drift, slide-in, slide-out, floating, bounce, zoom, or other motion unless the user explicitly requests an exception for that specific subtitle.
- Treat editor-configured fade-in and fade-out durations as opacity timing only. The editor does not implicitly authorize spatial motion.
- Keep the runtime fallback opacity-only even when an older or hand-written flow omits an explicit pure-fade flag, so newly authored chapter subtitles cannot silently inherit positional animation.
- When a subtitle starts while a save or preceding flow already owns a black screen, reuse that black-screen state; the subtitle still fades normally in place, and the eventual black-overlay fade-out restores the scene.

## Verification

Check all relevant paths:

1. Mouse or touch interaction.
2. Keyboard navigation and activation.
3. Gamepad directional navigation.
4. Gamepad analog or virtual-cursor input.
5. Programmatic focus after opening, closing, or switching a modal.
6. Left-stick wraparound across every enabled button or menu item.
7. A-button activation producing the same result as pointer click, exactly once per press.
8. Opening every blocking UI over a world interactable: the virtual cursor must operate the UI without showing or triggering the covered world target, including over non-interactive gaps in the panel.
9. Closing the blocking UI: world prompts and activation resume without restoring a stale cached target.
10. Move the virtual cursor away from screen center, then navigate and scroll a menu with the D-pad or left stick. Confirm that its coordinates stay unchanged, the physical pointer remains hidden, and only the custom selection highlight moves.
11. Alternate real mouse movement, right-stick movement, directional navigation, modal opening, and modal closing. At every frame, confirm that no more than one physical or virtual cursor is visible and that A activates only the current owner’s target.
12. For every non-persistent black-screen event, sample the overlay during fade-in, hold, fade-out, and after completion. Confirm that fade-out visibly lights the scene, then leaves opacity `0`, releases hit testing and input locks, and remains clear after subsequent renders.
13. Exercise cancellation and error paths for black-screen events. Confirm that they restore the same clear terminal state unless an explicit persistent handoff owns the black screen.
14. Inspect chapter subtitle entrance and exit frames. The centered text transform must remain unchanged throughout; only opacity may vary unless that exact subtitle has an explicit user-approved motion exception.

Confirm that no native focus background or border appears, while custom selection feedback and every input method still work. For every menu or clickable-button UI, confirm that left-stick navigation and A-button activation work without additional feature-specific setup.
