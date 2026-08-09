export type OptionsGamepadMode = "cursor" | "dpad";

export const OPTIONS_CURSOR_TAKEOVER_THRESHOLD = 0.45;

export function getDpadToggleValue(direction: number) {
  if (direction === 0) return null;
  return direction > 0;
}

export function shouldUseOptionsCursor(mode: OptionsGamepadMode) {
  return mode === "cursor";
}

export function shouldOptionsCursorTakeControl(
  mode: OptionsGamepadMode,
  inputLength: number,
) {
  return (
    mode === "cursor" || inputLength >= OPTIONS_CURSOR_TAKEOVER_THRESHOLD
  );
}
