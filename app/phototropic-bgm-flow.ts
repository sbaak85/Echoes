export const PLANT_BGM_ID = "phototropic-plant";
export type PlantBgmPhase = "intro" | "playing" | null;

/** Audio ownership spans the illustration, vines and success transition. */
export function createPhototropicBgmFlow(setPhase: (phase: PlantBgmPhase) => void) {
  let generation = 0;
  let phase: PlantBgmPhase = null;
  const change = (next: PlantBgmPhase) => {
    if (phase === next) return;
    phase = next;
    try { setPhase(next); }
    catch (error) { console.warn("[Phototropic BGM] Audio failure must not block puzzle progression.", error); }
  };
  return {
    get phase() { return phase; },
    begin(alreadySolved = false) {
      const token = ++generation;
      change(alreadySolved ? null : "intro");
      return () => { if (token === generation) change(null); };
    },
    vinesReady() { if (phase === "intro") change("playing"); },
    dialogueCompleted() { change(null); },
  };
}
