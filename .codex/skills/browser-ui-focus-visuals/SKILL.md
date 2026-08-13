---
name: browser-ui-focus-visuals
description: Enforce browser-game and web UI focus-visual and default gamepad-control rules. Use when creating, modifying, reviewing, or testing interactive browser UI such as buttons, inputs, range sliders, menus, modals, virtual cursors, keyboard navigation, or gamepad navigation. Hide native browser focus visuals and give every menu or clickable-button UI default left-stick navigation and A-button activation.
---

# Browser UI Focus Visuals

## Core rule

Keep browser-native focus backgrounds, outlines, focus rings, and selection rectangles invisible in every UI state.

Do not remove keyboard, gamepad, or assistive-technology operability to achieve this. Preserve semantic elements, focusability, input events, and ARIA behavior.

Give every UI containing a menu or clickable button gamepad support by default. Do not wait for a separate user request.

## Implementation

- Neutralize native `:focus` and `:focus-visible` visuals within the relevant UI scope, including `outline`, browser-added `box-shadow`, and platform-specific highlight colors when present.
- Inspect labels, transparent `input[type="range"]` elements, buttons, links, and programmatically focused elements. The visible rectangle may come from a parent `is-selected` style rather than the browser outline.
- Keep game-owned selection feedback separate from DOM focus. Render intentional selection with explicit classes or data attributes such as `is-selected` or `data-gamepad-selected`.
- Follow the last active input method. Mouse, virtual cursor, directional navigation, and analog controls must not display or seize another mode's selection visuals.
- When an analog control changes a value directly, do not show a directional-navigation selection frame. Blur a hidden native input if it retains an unwanted browser focus state.
- Restore only the game's custom highlight when directional keyboard or gamepad navigation resumes.

## Default gamepad menu support

- When a panel opens, establish one enabled interactive target as its current selection.
- Let the left stick move among enabled, visible buttons and menu items. Support both axes when the layout needs them.
- Wrap navigation at the ends so repeated left-stick movement cycles through available targets instead of stopping.
- Skip disabled, hidden, or otherwise unavailable targets.
- Make gamepad A activate the current target through the same action handler as a real pointer click. Do not duplicate business logic in a gamepad-only handler.
- Treat a new left-stick input as the latest navigation method and show only the game's custom selection highlight.
- Preserve virtual-cursor support when present. Follow the last active input method so the left stick, directional selection, right-stick virtual cursor, mouse, and touch do not simultaneously control or overwrite one another.
- Use edge detection and intentional repeat timing for held controls so one stick movement does not trigger uncontrolled multi-step navigation or repeated A activations.

## Verification

Check all relevant paths:

1. Mouse or touch interaction.
2. Keyboard navigation and activation.
3. Gamepad directional navigation.
4. Gamepad analog or virtual-cursor input.
5. Programmatic focus after opening, closing, or switching a modal.
6. Left-stick wraparound across every enabled button or menu item.
7. A-button activation producing the same result as pointer click, exactly once per press.

Confirm that no native focus background or border appears, while custom selection feedback and every input method still work. For every menu or clickable-button UI, confirm that left-stick navigation and A-button activation work without additional feature-specific setup.
