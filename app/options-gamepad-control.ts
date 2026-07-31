export type OptionsGamepadMode = "cursor" | "dpad";

export function getDpadToggleValue(direction: number) {
  if (direction === 0) return null;
  return direction > 0;
}

export function shouldUseOptionsCursor(mode: OptionsGamepadMode) {
  return mode === "cursor";
}
