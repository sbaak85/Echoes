export type PlantSide = "L" | "R";
export type PlantLamp = { slot: number | null; angle: number };
export type PhototropicState = { L: PlantLamp; R: PlantLamp; solved: boolean; introduced: boolean };
export const PHOTOTROPIC_STORAGE_KEY = "echoes:phototropic-puzzle:v1";
export const PLANT_QUEST_ID = "QUEST_CH04_MAIN_001";
export const PLANT_OBJECTIVE_ID = "QUEST_CH04_MAIN_001_OBJ_19";
export const PLANT_SUCCESS_MESSAGE = "調整光源方向正確，植物已受趨光影響";
export const PLANT_GROW_MS = 1600;
export function plantSideForInteraction(id: string): PlantSide | null {
  return id === "scene6-interaction-020" ? "L" : id === "scene6-interaction-021" ? "R" : null;
}
export function initialPhototropicState(): PhototropicState {
  return { L: { slot: null, angle: 60 }, R: { slot: null, angle: 60 }, solved: false, introduced: false };
}
export function normalizePhototropicState(value: unknown): PhototropicState {
  const empty = initialPhototropicState();
  if (!value || typeof value !== "object") return empty;
  const raw = value as Partial<PhototropicState>;
  for (const side of ["L", "R"] as const) {
    const lamp = raw[side];
    if (!lamp || typeof lamp !== "object") continue;
    empty[side] = {
      slot: Number.isInteger(lamp.slot) && Number(lamp.slot) >= 0 && Number(lamp.slot) <= 2 ? lamp.slot : null,
      angle: Number.isFinite(lamp.angle) ? Math.round(Math.max(0, Math.min(120, lamp.angle))) : 60,
    };
  }
  // A corrupt or legacy flag must not manufacture a solved configuration.
  empty.solved = raw.solved === true && isPhototropicClear(empty);
  // Older saves with a placed lamp have already shown the shared entrance.
  empty.introduced = raw.introduced === true || empty.L.slot !== null || empty.R.slot !== null;
  return empty;
}
export function plantPresentationStart(state: PhototropicState) {
  const restored = normalizePhototropicState(state);
  return { playEntrance: !restored.introduced, position: restored.introduced ? plantEquilibrium(restored) : { left: 0, right: 0 } };
}
export function plantInfluence(lamp: PlantLamp) {
  if (lamp.slot === null) return { near: 0, far: 0 };
  const preferred = [40, 73, 98][lamp.slot];
  const alignment = Math.exp(-Math.pow((lamp.angle - preferred) / [40, 29, 21][lamp.slot], 2));
  return { near: 8 + [35, 41, 45][lamp.slot] * alignment, far: 4 + [7, 11, 16][lamp.slot] * alignment };
}
export function plantEquilibrium(state: PhototropicState) {
  const l = plantInfluence(state.L), r = plantInfluence(state.R);
  return { left: -l.near + r.far, right: r.near - l.far };
}
export function isPhototropicClear(state: PhototropicState) {
  const p = plantEquilibrium(state);
  return state.L.slot !== null && state.R.slot !== null && p.left <= -31.5 && p.right >= 31.5;
}
// The arc sweeps clockwise from -60° to +60°, measured from vertical.
export function plantAngleFromPoint(x: number, y: number) {
  return Math.round(Math.max(0, Math.min(120, Math.atan2(x, -y) * 180 / Math.PI + 60)));
}
export function loadPhototropicState(): PhototropicState {
  try { return normalizePhototropicState(JSON.parse(window.localStorage.getItem(PHOTOTROPIC_STORAGE_KEY) ?? "null")); }
  catch { return initialPhototropicState(); }
}
export function savePhototropicState(state: PhototropicState) {
  if (typeof window !== "undefined") window.localStorage.setItem(PHOTOTROPIC_STORAGE_KEY, JSON.stringify(normalizePhototropicState(state)));
}
