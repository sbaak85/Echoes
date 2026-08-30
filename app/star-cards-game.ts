export const STAR_CARDS_GAME_ID = "StarCards";
export const STAR_CARDS_DEBUG_NUMBER = 4;

export const STAR_CARD_LANES = ["A", "B", "C"] as const;

export type StarCardLane = (typeof STAR_CARD_LANES)[number];
export type StarCardAttribute = "missile" | "shield" | "laser";

export type StarCardDefinition = {
  id: string;
  name: string;
  points: 1 | 2 | 3;
  attribute: StarCardAttribute;
  attributeLabel: "飛彈" | "護盾" | "雷射";
  image: string;
};

export const STAR_CARD_DECK: readonly StarCardDefinition[] = [
  {
    id: "missile-corvette-3",
    name: "MISSILE CORVETTE",
    points: 3,
    attribute: "missile",
    attributeLabel: "飛彈",
    image: "/ui/star-cards/01-missile-corvette-3.png",
  },
  {
    id: "missile-corvette-2",
    name: "MISSILE CORVETTE",
    points: 2,
    attribute: "missile",
    attributeLabel: "飛彈",
    image: "/ui/star-cards/02-missile-corvette-2.png",
  },
  {
    id: "missile-scout-1",
    name: "MISSILE SCOUT",
    points: 1,
    attribute: "missile",
    attributeLabel: "飛彈",
    image: "/ui/star-cards/03-missile-scout-1.png",
  },
  {
    id: "shield-cruiser-2",
    name: "SHIELD CRUISER",
    points: 2,
    attribute: "shield",
    attributeLabel: "護盾",
    image: "/ui/star-cards/04-shield-cruiser-2.png",
  },
  {
    id: "shield-bastion-3",
    name: "SHIELD BASTION",
    points: 3,
    attribute: "shield",
    attributeLabel: "護盾",
    image: "/ui/star-cards/05-shield-bastion-3.png",
  },
  {
    id: "shield-cruiser-1",
    name: "SHIELD CRUISER",
    points: 1,
    attribute: "shield",
    attributeLabel: "護盾",
    image: "/ui/star-cards/06-shield-cruiser-1.png",
  },
  {
    id: "laser-frigate-1",
    name: "LASER FRIGATE",
    points: 1,
    attribute: "laser",
    attributeLabel: "雷射",
    image: "/ui/star-cards/07-laser-frigate-1.png",
  },
  {
    id: "laser-frigate-2",
    name: "LASER FRIGATE",
    points: 2,
    attribute: "laser",
    attributeLabel: "雷射",
    image: "/ui/star-cards/08-laser-frigate-2.png",
  },
  {
    id: "laser-frigate-3",
    name: "LASER FRIGATE",
    points: 3,
    attribute: "laser",
    attributeLabel: "雷射",
    image: "/ui/star-cards/09-laser-frigate-3.png",
  },
];

export function shuffleStarCardDeck(
  random: () => number = Math.random,
): StarCardDefinition[] {
  const cards = [...STAR_CARD_DECK];
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
}

export function canPlaceStarCard(
  phase: "initial-placement" | "draw-placement",
  laneCardCount: number,
) {
  return (phase === "draw-placement" && laneCardCount < 3) || laneCardCount === 0;
}

export type StarCardBattleResult = "first" | "second" | "tie";

const STAR_CARD_BEATS: Record<StarCardAttribute, StarCardAttribute> = {
  shield: "laser",
  laser: "missile",
  missile: "shield",
};

export function compareStarCards(
  first: StarCardDefinition,
  second: StarCardDefinition,
): StarCardBattleResult {
  if (first.attribute === second.attribute) {
    if (first.points === second.points) return "tie";
    return first.points > second.points ? "first" : "second";
  }
  return STAR_CARD_BEATS[first.attribute] === second.attribute ? "first" : "second";
}

export function getStarCardBattleScore(
  first: StarCardDefinition,
  second: StarCardDefinition,
): { result: StarCardBattleResult; awardedPoints: 0 | 1 | 2 | 3 } {
  const result = compareStarCards(first, second);
  if (result === "tie") return { result, awardedPoints: 0 };
  return {
    result,
    awardedPoints: result === "first" ? second.points : first.points,
  };
}

export function getStarCardAttributeGlyph(attribute: StarCardAttribute) {
  if (attribute === "shield") return "⬡";
  if (attribute === "laser") return "✦";
  return "➤";
}
