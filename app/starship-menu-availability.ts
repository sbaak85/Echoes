export const STARSHIP_MENU_RESTRICTED_STAGE = "QUEST_CH04_MAIN_001_STAGE_03";
export type StarshipMenuFeatureLocks = { cooking: boolean; repair: boolean };
export const LOCKED_STARSHIP_MENU_FEATURES: StarshipMenuFeatureLocks = Object.freeze({ cooking: true, repair: true });

/** Keep both features locked until an explicit design change authorizes unlocking.
 * Tutorial completion, quest progression and restored saves must not unlock them.
 * Retain the context arguments for existing runtime and preview callers.
 */
export function getStarshipMenuFeatureLocks(
  _manager: { getCurrentStage: (questId: string) => string } | null,
  _flags: Record<string, boolean>,
): StarshipMenuFeatureLocks {
  return LOCKED_STARSHIP_MENU_FEATURES;
}
