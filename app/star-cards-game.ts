import { resolveRuntimePublicAssetUrl } from "./public-asset-url.ts";

export const STAR_CARDS_GAME_ID = "StarCards";
export const STAR_CARDS_DEBUG_NUMBER = 4;

export const starCardsAssetUrl = (fileName: string) => resolveRuntimePublicAssetUrl(
  `ui/star-cards/${fileName}`,
);

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
    image: starCardsAssetUrl("01-missile-corvette-3.png"),
  },
  {
    id: "missile-corvette-2",
    name: "MISSILE CORVETTE",
    points: 2,
    attribute: "missile",
    attributeLabel: "飛彈",
    image: starCardsAssetUrl("02-missile-corvette-2.png"),
  },
  {
    id: "missile-scout-1",
    name: "MISSILE SCOUT",
    points: 1,
    attribute: "missile",
    attributeLabel: "飛彈",
    image: starCardsAssetUrl("03-missile-scout-1.png"),
  },
  {
    id: "shield-cruiser-2",
    name: "SHIELD CRUISER",
    points: 2,
    attribute: "shield",
    attributeLabel: "護盾",
    image: starCardsAssetUrl("04-shield-cruiser-2.png"),
  },
  {
    id: "shield-bastion-3",
    name: "SHIELD BASTION",
    points: 3,
    attribute: "shield",
    attributeLabel: "護盾",
    image: starCardsAssetUrl("05-shield-bastion-3.png"),
  },
  {
    id: "shield-cruiser-1",
    name: "SHIELD CRUISER",
    points: 1,
    attribute: "shield",
    attributeLabel: "護盾",
    image: starCardsAssetUrl("06-shield-cruiser-1.png"),
  },
  {
    id: "laser-frigate-1",
    name: "LASER FRIGATE",
    points: 1,
    attribute: "laser",
    attributeLabel: "雷射",
    image: starCardsAssetUrl("07-laser-frigate-1.png"),
  },
  {
    id: "laser-frigate-2",
    name: "LASER FRIGATE",
    points: 2,
    attribute: "laser",
    attributeLabel: "雷射",
    image: starCardsAssetUrl("08-laser-frigate-2.png"),
  },
  {
    id: "laser-frigate-3",
    name: "LASER FRIGATE",
    points: 3,
    attribute: "laser",
    attributeLabel: "雷射",
    image: starCardsAssetUrl("09-laser-frigate-3.png"),
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

export type StarCardsMissileTrail = {
  lateralOffsetVw: number;
  depthOffsetCqh: number;
  animationDelayMs: number;
};

export type StarCardsMissileTrailLayout = readonly [
  StarCardsMissileTrail,
  StarCardsMissileTrail,
  StarCardsMissileTrail,
];

export const STAR_CARDS_IMPACT_PARTICLE_COUNT = 24;

export type StarCardsImpactParticle = {
  offsetXCqw: number;
  offsetYCqh: number;
  angleDeg: number;
  animationDelayMs: number;
  animationDurationMs: number;
};

export type StarCardsImpactParticleLayout = readonly StarCardsImpactParticle[];

/** 每次爆炸只建立一次的放射狀金色粒子；環形分布隨機，粒子朝向永遠對準外擴路徑。 */
export function createStarCardsImpactParticleLayout(
  random: () => number = Math.random,
): StarCardsImpactParticleLayout {
  const randomBetween = (minimum: number, maximum: number) => {
    const randomValue = Math.min(1, Math.max(0, random()));
    return minimum + (maximum - minimum) * randomValue;
  };

  return Array.from({ length: STAR_CARDS_IMPACT_PARTICLE_COUNT }, (_, index) => {
    const baseDirectionDeg = index * (360 / STAR_CARDS_IMPACT_PARTICLE_COUNT);
    const directionDeg = (baseDirectionDeg + randomBetween(-28, 28) + 360) % 360;
    const directionRad = directionDeg * Math.PI / 180;
    const distance = randomBetween(6.8, 11.2);
    const angleDeg = (directionDeg + 90) % 360;

    return {
      offsetXCqw: Number((Math.cos(directionRad) * distance).toFixed(2)),
      offsetYCqh: Number((Math.sin(directionRad) * distance).toFixed(2)),
      angleDeg: Number(angleDeg.toFixed(2)),
      animationDelayMs: Math.round(randomBetween(0, 110)),
      animationDurationMs: Math.round(randomBetween(620, 900)),
    };
  });
}

/** 每次攻擊只建立一次的隨機散射編隊；重繪不變，下次發射重新抽選。 */
export function createStarCardsMissileTrailLayout(
  random: () => number = Math.random,
): StarCardsMissileTrailLayout {
  const randomBetween = (minimum: number, maximum: number) => {
    const randomValue = Math.min(1, Math.max(0, random()));
    return Number((minimum + (maximum - minimum) * randomValue).toFixed(2));
  };
  const trails: StarCardsMissileTrail[] = [];
  for (let index = 0; index < 3; index += 1) {
    let selected: StarCardsMissileTrail | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate: StarCardsMissileTrail = {
        lateralOffsetVw: randomBetween(-1.45, 1.45),
        depthOffsetCqh: randomBetween(-3.4, 3.4),
        animationDelayMs: Math.round(randomBetween(-430, -30)),
      };
      const separated = trails.every((trail) =>
        Math.abs(trail.lateralOffsetVw - candidate.lateralOffsetVw) >= 0.42 ||
        Math.abs(trail.depthOffsetCqh - candidate.depthOffsetCqh) >= 0.9
      );
      if (separated) {
        selected = candidate;
        break;
      }
    }
    if (!selected) {
      const angle = randomBetween(0, Math.PI * 2) + index * Math.PI * 2 / 3;
      selected = {
        lateralOffsetVw: Number((Math.cos(angle) * 1.25).toFixed(2)),
        depthOffsetCqh: Number((Math.sin(angle) * 2.8).toFixed(2)),
        animationDelayMs: -70 - index * 145,
      };
    }
    trails.push(selected);
  }
  return trails as StarCardsMissileTrailLayout;
}

export type StarCardsPlacementPhase = "initial-placement" | "draw-placement";

export function canPlaceStarCard(
  phase: StarCardsPlacementPhase,
  laneCardCount: number,
) {
  return (phase === "draw-placement" && laneCardCount < 3) || laneCardCount === 0;
}

export function shouldAnimateStarCardsZone(
  phase: StarCardsPlacementPhase | null,
  pendingHandCardCount: number,
  laneCardCount: number,
) {
  return phase !== null &&
    pendingHandCardCount > 0 &&
    canPlaceStarCard(phase, laneCardCount);
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
