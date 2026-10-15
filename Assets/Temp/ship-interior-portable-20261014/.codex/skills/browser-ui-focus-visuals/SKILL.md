---
name: browser-ui-focus-visuals
description: Enforce browser-game UI focus visuals, blocking-overlay hit testing, and seamless input ownership across keyboard, mouse, gamepad, virtual cursor, and mobile touch. Use when creating, modifying, reviewing, or testing interactive browser UI, including menus, modals, controls, hover hints, navigation, and input-mode transitions. Hide native focus visuals, prevent input leaking through blocking UI, and provide default left-stick navigation and A-button activation.
---

# Browser UI Focus Visuals

## Core rule

Keep browser-native focus backgrounds, outlines, focus rings, and selection rectangles invisible in every UI state.

Maintain exactly one authoritative input owner and at most one owner-specific UI set. Pointer modes use one authoritative cursor; direct touch normally shows none. The physical mouse cursor and every game-rendered virtual cursor are mutually exclusive; never let two cursor renderers appear at the same time. Mouse hover, virtual-cursor hover, directional selection, touch feedback, prompts, and glyphs belonging to different owners must not coexist.

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

- Keep one authoritative input owner, with its pointer representation being the physical mouse, one shared virtual cursor, or direct touch with no persistent pointer. Do not create a feature-local virtual cursor when the shared cursor already exists.
- When the physical mouse actually moves and takes ownership, stop rendering the virtual cursor before allowing the native pointer to become visible.
- When the right stick or another virtual-pointer input takes ownership, hide the physical cursor before rendering the virtual cursor. Preserve the virtual cursor's last valid screen position across menus, scrolling, modal transitions, and changes to directional selection.
- When the D-pad or left stick takes directional ownership, hide both the physical and virtual cursors before showing the custom selection frame. Preserve the virtual cursor coordinates for a later return, but do not render it as a passive second input UI.
- Never reveal the physical pointer merely because the virtual cursor stops owning activation. Switching from virtual-cursor to directional control hides the virtual cursor and shows only directional selection; it must not expose a physical pointer parked at screen center.
- Do not recenter, snap, teleport, or attach the virtual cursor to the newly selected control unless the user explicitly requested cursor snapping. Scrolling content beneath a stationary cursor must not mutate the cursor coordinates.
- Opening a dialogue, modal, inventory, minigame, or confirmation must reuse the current pointer owner. If a transition intentionally changes ownership, hide the previous pointer first and transfer the existing virtual cursor position when applicable.
- Closing an interface must not resurrect a stale physical or virtual cursor. Restore the pointer appropriate to the latest real input, and clear obsolete feature-local visibility flags.
- Mouse movement, right-stick movement, D-pad movement, and A-button activation must each use explicit takeover thresholds or edge detection so minor analog drift cannot rapidly alternate cursor ownership.

## Atomic ownership transfer

Treat an input takeover as one UI transaction, not as unrelated flag updates scattered across event handlers. Prefer one shared ownership transition function or state machine for physical mouse, virtual cursor, directional navigation, and touch.

For every deliberate takeover, complete these operations in this order within the same event or render frame:

1. Validate that the incoming input passed its deliberate takeover threshold or edge condition.
2. Stop routing activation, scrolling, hover, and repeat input from the outgoing owner.
3. Hide the outgoing cursor and remove or neutralize every outgoing owner-specific UI state.
4. Set the canonical owner and its activation target.
5. Enable only the incoming cursor, selection, prompt, glyph, tooltip, and other feedback.
6. Reuse or derive a valid position or target without reviving stale outgoing state.

If the transition cannot be completed synchronously, hide and deactivate the outgoing UI first. Showing no owner-specific feedback for one frame is preferable to displaying two owners simultaneously.

The owner-specific UI bundle includes all of the following, not only the cursor image:

- physical mouse cursor visibility and CSS cursor overrides;
- virtual-cursor renderer visibility, hit target, hover state, and activation ownership;
- directional selection frames, focused-row glow, repeat state, and A-button target;
- mouse or gamepad glyph prompts and control-specific instructional text;
- hover cards, tooltips, context menus, drag previews, pressed states, and delayed feedback;
- touch indicators, long-press state, compatibility mouse events, and pointer capture.

At steady state, enforce these exclusive presentations:

- Mouse owner: physical cursor and mouse hover/prompt UI only; virtual cursor and directional selection are absent.
- Virtual-cursor owner: shared virtual cursor and its hover/prompt UI only; physical cursor and directional selection are absent.
- Directional owner: one game-owned selection frame and directional prompt UI only; both physical and virtual cursors are hidden.
- Touch owner: touch feedback only when needed; physical cursor, virtual cursor, mouse hover, and directional selection are absent.

Scope CSS hover and focus visuals by the canonical input owner rather than relying on browser `:hover` alone. A hidden physical cursor can still leave CSS hover active, so stale hover styling must be disabled or cleared when another owner takes over. Cursor-hiding rules must have enough specificity to override component-local `cursor: default` or `cursor: pointer` declarations; verify the computed cursor on descendants, not only the root overlay.

## Ownership return and cleanup

- Preserve positions and semantic targets as nonvisual state only. Preserving state never permits the outgoing cursor, hover, frame, tooltip, or prompt to remain visible.
- A modal may remember its entry owner for fallback, but any deliberate input inside the modal becomes the new return owner. On close, restore the latest valid owner rather than the owner that opened the modal.
- Restore an owner as a complete bundle: input routing, cursor visibility, selection or hover feedback, prompt glyphs, activation target, and repeat/rearm state must agree before input is accepted.
- Require neutral/release before rearming a suspended stick, held button, repeat timer, long press, or drag. The input that closed a panel must not also activate the revealed interface.
- On device disconnect, window blur, pointer cancellation, lost capture, component unmount, or interrupted closing animation, remove every owner-specific class and transient visual that no longer has a valid owner.
- Closing or fading UI remnants must be noninteractive and must not retain focus, hover, pointer capture, cursor overrides, or delayed callbacks.

## Complete input-mode handoff

Apply these rules throughout the game, in both directions between keyboard/mouse, gamepad/sticks/virtual cursor, and mobile/touch. Also handle changes within a device family: keyboard versus mouse, D-pad/left-stick navigation versus right-stick cursor, and touch joystick versus direct touch. A fix covering only one entry path is incomplete.

- Treat takeover as a coordinated change of input routing, activation target, navigation behavior, pointer visibility, button prompts, and transient UI. Change them together before accepting the next action; changing only the displayed glyphs or hiding a cursor is insufficient. Use shared transition rules across input handlers so separate entry paths cannot retain contradictory ownership.
- Keep semantic context separate from mode-specific presentation. Preserve the current task, valid selected item, open blocking panel, and relevant navigation position. Clear or rederive the previous mode's selection frames, hover targets, tooltips, pressed states, context menus, drag previews, and other transient UI. Mode-specific menus must close or be explicitly adapted to the incoming controls; do not leave an old menu visible but inoperable. Clearing stale feedback must not discard the user's task or arbitrarily close a valid shared modal.
- Transfer a valid current target into the incoming navigation model. Directional control must begin with one enabled target and a working confirm/cancel path; pointer control must use its own current hit test; direct touch must use the touched target. Do not let an old pointer position, DOM focus, or remembered row silently override the incoming target. Preserve virtual-cursor coordinates as nonvisual state while directional control owns the UI.
- Cancel the outgoing mode's hover timers, delayed hints, navigation repeats, long-press timers, held actions, and unfinished drag gestures; release obsolete pointer capture. Delayed callbacks must verify that their owner, target, and UI layer are still current before changing state. Fade-out remnants must be noninteractive and must not reappear after a panel closes or another mode takes over.
- Mouse and virtual-cursor hints must use the same applicable placement, delay, and fade specification, but restart from the incoming owner's current hit target. Touch must not inherit mouse hover or sticky CSS `:hover`; expose equivalent information through an explicit touch interaction where needed.
- Claim ownership only from deliberate input: meaningful mouse movement or a real press, a new key/button edge, stick movement past the takeover threshold, or touch contact/intentional gesture. A connected device, analog drift, a held control from before takeover, or touch-generated compatibility mouse/click events must not steal ownership. Require neutral/release before rearming suspended stick, repeat, or hold behavior. Define deterministic precedence for simultaneous input without frame-by-frame mode oscillation.
- On touch takeover, hide physical/virtual pointers, clear their hover feedback, and initialize only the active touch controls. Handle `pointerup`, `pointercancel`, lost capture, device disconnect, and window focus loss: release transient controls and input locks without inventing a mouse takeover or replaying a canceled gesture.
- While a modal is open or closing, route all devices to that modal and keep its parent's navigation context stable. Switching devices inside it must not clear or navigate the underlying panel. On return, rebuild the parent feedback for the latest deliberate input and a valid return target. Confirm/cancel by A, B, keyboard, mouse, or touch must produce equivalent restoration; the closing press must not also activate the newly revealed control.
- Keep action semantics consistent across a mode's entry paths. For Echoes inventory, gamepad A on an already selected item enters the four action buttons whether selection came from the D-pad, left stick, or virtual cursor; item use belongs to the explicit Use action. Closing Inspect returns to the valid Inspect action under directional control, or rederives feedback for the latest pointer/touch owner. Do not restore a stale outgoing-mode frame just to make a highlight visible.

## Input handoff verification

For affected UI, exercise all six cross-family directions: keyboard/mouse to gamepad, gamepad to keyboard/mouse, keyboard/mouse to touch, touch to keyboard/mouse, gamepad to touch, and touch to gamepad. Include keyboard-to-mouse and D-pad/left-stick-to-virtual-cursor transitions within those families.

- Test takeover with an item selected, an action selected, a hint pending/visible/fading, a context menu open, and a modal opening/open/closing. Include held sticks/buttons, drag or long-press cancellation, and rapid switching. Check the very next confirm/cancel action, not only the final screenshot.
- Verify that only the current owner supplies cursor, selection, hover, prompts, glyphs, tooltips, and activation feedback; no stale menu, tooltip, press, class, or timer survives. Selection, prompts, hit testing, and activation must agree without duplicate owner UI, cursor jump, flicker, lost action, or click-through.
- Test touch on a hybrid setup with a mouse/gamepad still connected, including compatibility mouse events after a tap. Test modal return through each supported dismissal input, as well as disconnect/focus-loss cleanup.
- Add regression coverage for the reproduced transitions and run them in the actual affected UI. Distinguish physical-device testing from simulated input; explicitly identify any unverified touch/device path rather than claiming all modes were tested from desktop-only evidence.

## Blocking UI and world interaction

A blocking UI is any open modal, overlay, panel, confirmation, dialogue, menu, minigame, or failure screen whose presence is intended to suspend ordinary world input. While any blocking UI is open:

- The virtual cursor must never hit, highlight, select, path toward, or activate world interactables behind the UI.
- Non-interactive space inside the blocking UI still consumes the input. Do not fall through to a world action merely because no UI button is under the cursor.
- Suppress world interaction prompts and hover highlights, and clear cached world targets or prompt ownership so stale indicators do not remain visible behind the UI.
- Apply one shared blocking condition to world-target discovery, prompt rendering, and actual activation. Hiding the prompt alone is insufficient if keyboard, pointer, touch, or gamepad input can still trigger the target.
- Keep UI hit testing active so the virtual cursor can continue selecting controls inside the open interface. Closing the last blocking UI restores world hit testing.

Apply this rule consistently to mouse, touch, keyboard, gamepad buttons, directional selection, and virtual-cursor activation. Passive HUD elements that are not intended to block world control are not blocking UI.

## Default gamepad menu support

- When a panel opens, establish one enabled interactive target for directional navigation; render its selection feedback only when that navigation mode owns activation.
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
10. Move the virtual cursor away from screen center, then navigate and scroll a menu with the D-pad or left stick. Confirm that its coordinates stay unchanged internally, both cursors are hidden, and only the custom directional selection highlight is visible.
11. Exercise mouse -> right stick -> mouse, mouse -> directional -> right stick, virtual cursor -> directional -> virtual cursor, and each corresponding modal open/close return. At every frame, confirm that exactly one owner-specific UI bundle is active, no outgoing cursor or highlight remains, prompts match the owner, and activation targets only that owner.
12. For every non-persistent black-screen event, sample the overlay during fade-in, hold, fade-out, and after completion. Confirm that fade-out visibly lights the scene, then leaves opacity `0`, releases hit testing and input locks, and remains clear after subsequent renders.
13. Exercise cancellation and error paths for black-screen events. Confirm that they restore the same clear terminal state unless an explicit persistent handoff owns the black screen.
14. Inspect chapter subtitle entrance and exit frames. The centered text transform must remain unchanged throughout; only opacity may vary unless that exact subtitle has an explicit user-approved motion exception.

Confirm that no native focus background or border appears, while custom selection feedback and every input method still work. Inspect both the transition frame and the settled frame: there must never be two input sources' cursors, highlights, hover states, prompts, glyph sets, or activation feedback on screen at once. For every menu or clickable-button UI, confirm that left-stick navigation and A-button activation work without additional feature-specific setup.
