// The dial is an independent analog channel, never a left-stick focus target.
export const PLANT_ANGLE_SPEED = 40; // Degrees per second; independent of slot navigation repeats.
export const PLANT_ANGLE_MAX_SPEED = 60;
export const PLANT_ANGLE_DEADZONE = .55;
export function plantAngleSpeedForAxis(axis: number) {
  if (!Number.isFinite(axis) || Math.abs(axis) <= PLANT_ANGLE_DEADZONE) return 0;
  const pressure = Math.min(1, (Math.abs(axis) - PLANT_ANGLE_DEADZONE) / (1 - PLANT_ANGLE_DEADZONE));
  return PLANT_ANGLE_SPEED + (PLANT_ANGLE_MAX_SPEED - PLANT_ANGLE_SPEED) * pressure ** 2;
}
export function createPlantPadState() {
  return { armed: false, dir: "", fineDir: 0, seconds: 0, slot: 1, angle: null as number | null };
}
// The prompt and activation handler must describe the same primary action.
export function plantPrimaryAction(selected: number, occupied: number | null) {
  if (selected === 4) return "finish";
  if (selected >= 0 && selected < 3 && selected !== occupied) return "place";
  return null;
}
export function stepPlantPad(state: ReturnType<typeof createPlantPadState>, input: {
  x: number; y: number; rightX: number; fineX?: number; confirm: boolean; back: boolean;
  dt: number; selected: number; lamp: { slot: number | null; angle: number };
}) {
  const { x, y, rightX, confirm, back, selected, lamp } = input;
  const fineDir = Math.sign(input.fineX ?? 0);
  const dir = Math.abs(x) > .55 ? (x > 0 ? "right" : "left") : Math.abs(y) > .55 ? (y > 0 ? "down" : "up") : "";
  const angleSpeed = plantAngleSpeedForAxis(rightX);
  const analog = angleSpeed > 0;
  const result = { selected: selected < 0 || selected === 3 ? state.slot : selected, angle: null as number | null, activate: false, back: false, active: false };
  if (!state.armed) {
    if (!dir && !analog && !fineDir && !confirm && !back) state.armed = true;
    return result;
  }
  const dt = Math.max(0, Math.min(.05, input.dt));
  result.active = Boolean(dir || analog || fineDir || confirm || back);
  // Back wins over a simultaneous placement, navigation or angle adjustment.
  if (back) { result.back = true; return result; }
  if (selected >= 0 && selected < 3) state.slot = selected;
  if (dir) {
    state.seconds -= dt;
    if (dir !== state.dir || state.seconds <= 0) {
      if (dir === "left" || dir === "right") {
        state.slot = (state.slot + (dir === "left" ? -1 : 1) + 3) % 3;
        result.selected = state.slot;
      } else if (dir !== state.dir) result.selected = result.selected === 4 ? state.slot : 4;
      state.seconds = dir !== state.dir ? .36 : .115;
    }
  } else state.seconds = 0;
  state.dir = dir;
  if (fineDir) {
    // One degree per press, without moving the A target or accumulating a
    // held input. Fine adjustment takes priority over simultaneous analog input.
    if (!dir && !confirm && selected >= 0) result.selected = selected;
    if (fineDir !== state.fineDir && lamp.slot !== null) result.angle = Math.max(0, Math.min(120, lamp.angle + fineDir));
    state.angle = null;
  } else if (analog && lamp.slot !== null) {
    // Keep fractional progress so slow motion works identically at 30/60/120fps.
    if (state.angle === null || Math.round(state.angle) !== lamp.angle) state.angle = lamp.angle;
    state.angle = Math.max(0, Math.min(120, state.angle + Math.sign(rightX) * angleSpeed * dt));
    result.angle = Math.round(state.angle);
  } else state.angle = null;
  state.fineDir = fineDir;
  result.activate = confirm && plantPrimaryAction(result.selected, lamp.slot) !== null;
  return result;
}
