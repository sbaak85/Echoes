import {
  STAR_CARD_DECK,
  type StarCardDefinition,
  type StarCardLane,
} from "./star-cards-game.ts";

export type StarCardsTutorialOwner = "player" | "ai";

/** The opening three cards and two scripted draws; later draws remain random. */
const OPENING_CARD_IDS: Record<StarCardsTutorialOwner, readonly string[]> = {
  player: [
    "missile-scout-1",
    "laser-frigate-1",
    "shield-bastion-3",
    "laser-frigate-2",
    "missile-corvette-2",
  ],
  ai: [
    "laser-frigate-2",
    "missile-corvette-2",
    "shield-bastion-3",
    "missile-corvette-3",
    "shield-cruiser-2",
  ],
};

export const STAR_CARDS_TUTORIAL_FIRST_DRAW_LANE: StarCardLane = "B";

export function getStarCardsTutorialOpeningLane(card?: Pick<StarCardDefinition, "attribute">): StarCardLane | null {
  return card ? ({ missile: "A", laser: "B", shield: "C" } as const)[card.attribute] : null;
}

export type StarCardsBattleLesson = "counter" | "score" | "points";
export type StarCardsSecondDrawStage = "pending-draw" | "dealing" | "choice" | "known" | "risk" | "placed" | "resolving" | "recap-dark" | "recap" | "recap-stack" | "encourage";

export function advanceStarCardsSecondDrawLesson(stage: StarCardsSecondDrawStage): StarCardsSecondDrawStage | null {
  return stage === "choice" ? "known" : stage === "known" ? "risk"
    : stage === "recap" || stage === "recap-stack" ? "encourage"
    : stage === "encourage" ? null : stage;
}

export const STAR_CARDS_TUTORIAL_SCORE_PAUSE_MS = 1500;

/** No lane is scheduled until its lesson is confirmed. Confirm is consumed once. */
export function createStarCardsTutorialBattleSequence(actions: {
  showLesson: (lesson: StarCardsBattleLesson | null) => void;
  runLanes: (lanes: readonly StarCardLane[], complete: () => void) => void;
  schedule: (callback: () => void, delayMs: number) => void;
  finish: () => void;
}) {
  let waiting: StarCardsBattleLesson | null = null;
  let started = false;
  let cancelled = false;
  return {
    revealComplete() {
      if (cancelled || started) return;
      started = true;
      waiting = "counter";
      actions.showLesson(waiting);
    },
    confirm(expectedLesson: StarCardsBattleLesson | null) {
      if (cancelled || !waiting || waiting !== expectedLesson) return;
      const lesson = waiting;
      waiting = null;
      actions.showLesson(null);
      if (lesson === "score") {
        waiting = "points";
        actions.showLesson(waiting);
        return;
      }
      actions.runLanes(lesson === "counter" ? ["B"] : ["A", "C"], () => {
        if (cancelled) return;
        if (lesson === "counter") {
          // The destruction/effects must finish before the 1.5-second hold.
          // Reuse the game's scheduler so exit/settings dialogs pause this too.
          actions.schedule(() => {
            if (cancelled) return;
            waiting = "score";
            actions.showLesson(waiting);
          }, STAR_CARDS_TUTORIAL_SCORE_PAUSE_MS);
        } else actions.finish();
      });
    },
    cancel() { cancelled = true; waiting = null; },
  };
}

export function createStarCardsTutorialDeck(
  owner: StarCardsTutorialOwner,
  random: () => number = Math.random,
): StarCardDefinition[] {
  const opening = OPENING_CARD_IDS[owner].map((id) => {
    const card = STAR_CARD_DECK.find((candidate) => candidate.id === id);
    if (!card) throw new Error(`Missing Star Cards tutorial card: ${id}`);
    return { ...card };
  });
  const reservedIds = new Set(OPENING_CARD_IDS[owner]);
  const remaining = STAR_CARD_DECK
    .filter((card) => !reservedIds.has(card.id))
    .map((card) => ({ ...card }));
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [remaining[index], remaining[swapIndex]] = [remaining[swapIndex], remaining[index]];
  }
  return [...opening, ...remaining];
}

type TutorialPlacement = {
  card: Pick<StarCardDefinition, "attribute" | "points">;
  lane: StarCardLane;
};

const INITIAL_OPPONENT_PAIRS = [
  { playerAttribute: "laser", playerPoints: 1, aiAttribute: "laser", aiPoints: 2 },
  { playerAttribute: "missile", playerPoints: 1, aiAttribute: "missile", aiPoints: 2 },
  { playerAttribute: "shield", playerPoints: 3, aiAttribute: "shield", aiPoints: 3 },
] as const;

/**
 * Match the opponent's opening cards to the player's chosen lanes, not deal order.
 * Attribute/points survive runtime owner/game ID prefixes. Unmatched cards stay put.
 */
export function matchTutorialOpponentLanes<
  TPlayer extends TutorialPlacement,
  TAi extends TutorialPlacement,
>(playerPlaced: readonly TPlayer[], aiPlaced: readonly TAi[]): TAi[] {
  return aiPlaced.map((placed) => {
    const pair = INITIAL_OPPONENT_PAIRS.find((candidate) =>
      placed.card.attribute === candidate.aiAttribute &&
      placed.card.points === candidate.aiPoints,
    );
    if (!pair) return placed;
    const player = playerPlaced.find((candidate) =>
      candidate.card.attribute === pair.playerAttribute &&
      candidate.card.points === pair.playerPoints,
    );
    return player ? { ...placed, lane: player.lane } : placed;
  });
}

/**
 * Apply to hand placement and direct repositioning alike. The caller keeps active
 * true through both scripted battles; ordinary capacity rules still apply.
 */
export function canPlaceStarCardsTutorialCard(
  active: boolean,
  phase: string,
  lane: StarCardLane,
  card?: Pick<StarCardDefinition, "attribute">,
  secondDrawStage: StarCardsSecondDrawStage | null = null,
): boolean {
  if (!active) return true;
  if (secondDrawStage !== null) {
    return secondDrawStage === "risk" && phase === "draw-placement" && lane === "C";
  }
  if (phase === "initial-placement") {
    const requiredLane = getStarCardsTutorialOpeningLane(card);
    return requiredLane === null || lane === requiredLane;
  }
  const isFirstDrawPlacement = phase === "draw-placement" ||
    phase === "draw-placed" || phase === "battle-ready";
  return !isFirstDrawPlacement || lane === STAR_CARDS_TUTORIAL_FIRST_DRAW_LANE;
}

/** Called only after attack and hit effects finish. Use the game's pausable clock. */
export function scheduleStarCardsTutorialRecap(
  schedule: (callback: () => void, delayMs: number) => void,
  advance: (expected: StarCardsSecondDrawStage, next: StarCardsSecondDrawStage) => void,
) {
  schedule(() => advance("recap-dark", "recap"), 500);
  schedule(() => advance("recap", "recap-stack"), 1500);
}
