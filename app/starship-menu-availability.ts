import {
  STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG,
  STARSHIP_CRAFTING_TUTORIAL_QUEST,
} from "./starship-crafting-tutorial.ts";

export const STARSHIP_MENU_RESTRICTED_STAGE = "QUEST_CH04_MAIN_001_STAGE_03";
export type StarshipMenuFeatureLocks = { cooking: boolean; repair: boolean };
export const UNLOCKED_STARSHIP_MENU_FEATURES: StarshipMenuFeatureLocks = { cooking: false, repair: false };

/** No objective unlock is assumed until the quest designer chooses one. */
export function getStarshipMenuFeatureLocks(
  manager: { getCurrentStage: (questId: string) => string } | null,
  flags: Record<string, boolean>,
): StarshipMenuFeatureLocks {
  const locked = flags[STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG] === true &&
    manager?.getCurrentStage(STARSHIP_CRAFTING_TUTORIAL_QUEST) === STARSHIP_MENU_RESTRICTED_STAGE;
  return { cooking: locked, repair: locked };
}
