export const PLANT_SUCCESS_BACKGROUND = "ui/interaction-illustrations/趨光植物背景_2.png";
export const PLANT_SUCCESS_DIALOGUE_ID = "chapter04-section-99";
export const PLANT_SUCCESS_COVER_MS = 1000;
export const PLANT_SUCCESS_BLACK_MS = 250;
export const PLANT_SUCCESS_REVEAL_MS = 1000;
export const PLANT_SUCCESS_HOLD_MS = 500;
export const PLANT_SUCCESS_EXIT_MS = 500;
export type PlantSuccessPhase = "cover" | "black" | "reveal" | "hold" | "dialogue" | "exit";

// Swap and remove controls only at full black. The dialogue host owns input
// until its entire script completes; elapsed time alone must never close it.
export function startPlantSuccessTransition(
  phase: (next: PlantSuccessPhase) => void,
  playDialogue: () => Promise<{ completed: boolean }>,
  finish: (completed: boolean) => void,
  onDialogueCompleted: () => void = () => {},
) {
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const schedule = (after: number, action: () => void) => {
    timers.push(setTimeout(() => { if (!cancelled) action(); }, after));
  };
  const revealStart = PLANT_SUCCESS_COVER_MS + PLANT_SUCCESS_BLACK_MS;
  const holdStart = revealStart + PLANT_SUCCESS_REVEAL_MS;
  phase("cover");
  schedule(PLANT_SUCCESS_COVER_MS, () => phase("black"));
  schedule(revealStart, () => phase("reveal"));
  schedule(holdStart, () => phase("hold"));
  schedule(holdStart + PLANT_SUCCESS_HOLD_MS, () => {
    phase("dialogue");
    const exit = (completed: boolean) => {
      if (cancelled) return;
      // BGM handoff belongs to a fully played script, before the UI exit fade.
      if (completed) {
        try { onDialogueCompleted(); }
        catch (error) { console.warn("[Phototropic] Dialogue completion callback failed.", error); }
      }
      phase("exit");
      schedule(PLANT_SUCCESS_EXIT_MS, () => finish(completed));
    };
    void (async () => {
      try { exit((await playDialogue()).completed); }
      catch (error) { console.error("[Phototropic] Success dialogue failed.", error); exit(false); }
    })();
  });
  return () => { cancelled = true; timers.forEach(clearTimeout); };
}
