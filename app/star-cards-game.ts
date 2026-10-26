import { resolveRuntimePublicAssetUrl } from "./public-asset-url.ts";

export const STAR_CARDS_GAME_ID = "StarCards";
export const STAR_CARDS_DEBUG_NUMBER = 4;
export const STAR_CARDS_WINS_TO_MATCH = 3;
export type StarCardsMatchResult = { playerWins: number; aiWins: number };

export function getStarCardsMatchWinner({ playerWins, aiWins }: StarCardsMatchResult): "player" | "ai" | null {
  if (![playerWins, aiWins].every(value => Number.isInteger(value) && value >= 0 && value <= STAR_CARDS_WINS_TO_MATCH)) return null;
  if (playerWins === STAR_CARDS_WINS_TO_MATCH && aiWins < STAR_CARDS_WINS_TO_MATCH) return "player";
  if (aiWins === STAR_CARDS_WINS_TO_MATCH && playerWins < STAR_CARDS_WINS_TO_MATCH) return "ai";
  return null;
}

/** 連續平手幾局後，下一局改為驟死賽 */
export const STAR_CARDS_SUDDEN_DEATH_AFTER_TIES = 2;

export function isStarCardsSuddenDeath(consecutiveTieGames: number) {
  return consecutiveTieGames >= STAR_CARDS_SUDDEN_DEATH_AFTER_TIES;
}

/**
 * 一次 BATTLE 結算後，這一局是否結束、由誰拿下。
 * 一般局：9 張打完才比總分。驟死賽：任何一次 BATTLE 後總分不同就立刻分出勝負
 * （之前的 BATTLE 都是同分，所以等於「這次 BATTLE 得分較多的一方」）；9 張打完仍同分則平手。
 */
export function resolveStarCardsGameEnd({
  suddenDeath,
  isFinalBattle,
  playerScore,
  aiScore,
}: {
  suddenDeath: boolean;
  isFinalBattle: boolean;
  playerScore: number;
  aiScore: number;
}): "continue" | "player" | "ai" | "tie" {
  const leader = playerScore > aiScore ? "player" : aiScore > playerScore ? "ai" : null;
  if (suddenDeath && leader) return leader;
  if (!isFinalBattle) return "continue";
  return leader ?? "tie";
}

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
  /** 在齊射時間內的發射時機（0＝與主飛彈同時、1＝最後），乘上 CSS 的 --fx-missile-salvo 才是實際延遲 */
  launchFraction: number;
  /** 落點的左右散布方向與比例（-1～1），乘上 CSS 的 --fx-missile-scatter 才是實際距離 */
  impactScatterX: number;
  /** 落點的前後散布（-1～1，正值＝打得較遠） */
  impactScatterY: number;
};

export type StarCardsMissileTrailLayout = readonly StarCardsMissileTrail[];

/**
 * 命中爆炸的粒子種類：
 * 雷射＝needle 細針火花＋droplet 熔滴；飛彈＝fireball 火球、spark 爆閃、ember 餘燼、debris 碎片、smoke 煙；
 * 護盾＝shard 六角護盾碎片、ion 離子火花、arc 電弧。
 */
export type StarCardsImpactParticleKind =
  | "needle" | "droplet"
  | "fireball" | "spark" | "ember" | "debris" | "smoke"
  | "shard" | "ion" | "arc";

type Range = readonly [number, number];
type StarCardsImpactRecipe = {
  kind: StarCardsImpactParticleKind;
  count: number;
  /** 由爆炸中心飛出的距離（cqw） */
  distance: Range;
  /** 往下（正值）或往上（負值）的重力位移總量（cqw） */
  gravity: Range;
  /** 飛行期間的自轉量（度，正負隨機） */
  spin: Range;
  size: Range;
  delayMs: Range;
  durationMs: Range;
};

const NO_MOTION: Range = [0, 0];

/** 三種武器的命中爆炸配方；數值全部以 cqw 為單位，牌桌縮放時比例不變。 */
export const STAR_CARDS_IMPACT_RECIPES: Record<StarCardAttribute, readonly StarCardsImpactRecipe[]> = {
  laser: [
    // 雷射是持續照射：火花與熔滴在燒灼期間（約 400ms）不斷噴出，而不是一次炸開
    { kind: "needle", count: 34, distance: [2.8, 6.4], gravity: NO_MOTION, spin: NO_MOTION, size: [0.6, 1.4], delayMs: [0, 380], durationMs: [200, 360] },
    { kind: "droplet", count: 16, distance: [1.6, 4.2], gravity: [2.2, 3.6], spin: NO_MOTION, size: [0.6, 1.2], delayMs: [60, 440], durationMs: [520, 820] },
  ],
  missile: [
    { kind: "smoke", count: 6, distance: [0.4, 1.6], gravity: [-2.4, -1.2], spin: [20, 80], size: [0.8, 1.3], delayMs: [80, 200], durationMs: [850, 1100] },
    { kind: "fireball", count: 6, distance: [0.2, 1.0], gravity: [-0.9, -0.3], spin: NO_MOTION, size: [0.8, 1.25], delayMs: [0, 70], durationMs: [520, 760] },
    { kind: "debris", count: 7, distance: [2.0, 4.4], gravity: [4, 6.5], spin: [240, 540], size: [0.7, 1.3], delayMs: [10, 60], durationMs: [700, 950] },
    { kind: "ember", count: 20, distance: [2.4, 6.2], gravity: [2.8, 5.2], spin: NO_MOTION, size: [0.6, 1.3], delayMs: [30, 140], durationMs: [650, 1000] },
    { kind: "spark", count: 12, distance: [2.6, 5.6], gravity: NO_MOTION, spin: NO_MOTION, size: [0.7, 1.2], delayMs: [0, 30], durationMs: [220, 360] },
  ],
  shield: [
    { kind: "shard", count: 12, distance: [2.0, 4.8], gravity: [0.4, 1.0], spin: [180, 420], size: [0.6, 1.3], delayMs: [0, 60], durationMs: [480, 760] },
    { kind: "ion", count: 18, distance: [2.4, 5.4], gravity: NO_MOTION, spin: NO_MOTION, size: [0.5, 1.1], delayMs: [0, 80], durationMs: [200, 360] },
    { kind: "arc", count: 5, distance: [0.8, 1.8], gravity: NO_MOTION, spin: NO_MOTION, size: [0.8, 1.3], delayMs: [0, 120], durationMs: [260, 380] },
  ],
};

export type StarCardsImpactParticle = {
  kind: StarCardsImpactParticleKind;
  offsetXCqw: number;
  offsetYCqw: number;
  gravityCqw: number;
  angleDeg: number;
  spinDeg: number;
  sizeScale: number;
  animationDelayMs: number;
  animationDurationMs: number;
};

export type StarCardsImpactParticleLayout = readonly StarCardsImpactParticle[];

/**
 * 每次命中只建立一次的爆炸粒子，依贏家武器套用不同配方。
 * 每一種粒子在環上平均分布再加隨機偏移，angleDeg 讓長條粒子永遠對準外擴路徑。
 */
export function createStarCardsImpactParticleLayout(
  attribute: StarCardAttribute,
  random: () => number = Math.random,
): StarCardsImpactParticleLayout {
  const randomBetween = ([minimum, maximum]: Range) => {
    const randomValue = Math.min(1, Math.max(0, random()));
    return minimum + (maximum - minimum) * randomValue;
  };
  const round = (value: number) => Number(value.toFixed(2));

  return STAR_CARDS_IMPACT_RECIPES[attribute].flatMap((recipe) =>
    Array.from({ length: recipe.count }, (_, index): StarCardsImpactParticle => {
      const sector = 360 / recipe.count;
      const directionDeg = (index * sector + randomBetween([-sector / 2, sector / 2]) + 360) % 360;
      const directionRad = directionDeg * Math.PI / 180;
      const distance = randomBetween(recipe.distance);
      const spinSign = random() < 0.5 ? -1 : 1;
      return {
        kind: recipe.kind,
        offsetXCqw: round(Math.cos(directionRad) * distance),
        offsetYCqw: round(Math.sin(directionRad) * distance),
        gravityCqw: round(randomBetween(recipe.gravity)),
        angleDeg: round((directionDeg + 90) % 360),
        spinDeg: round(randomBetween(recipe.spin) * spinSign),
        sizeScale: round(randomBetween(recipe.size)),
        animationDelayMs: Math.round(randomBetween(recipe.delayMs)),
        animationDurationMs: Math.round(randomBetween(recipe.durationMs)),
      };
    }),
  );
}

/**
 * 平手氣爆的放射線：360° 大致平均（每條在自己的扇區內隨機偏移），但長度、粗細、距離、出現時間與速度都隨機，
 * 看起來不整齊、像空氣被炸開的噴流。每次平手重新抽選。
 */
export const STAR_CARDS_TIE_SPARK_COUNT = 26;

export function createStarCardsTieClashLayout(
  random: () => number = Math.random,
): StarCardsImpactParticleLayout {
  const randomBetween = ([minimum, maximum]: Range) => {
    const randomValue = Math.min(1, Math.max(0, random()));
    return minimum + (maximum - minimum) * randomValue;
  };
  const round = (value: number) => Number(value.toFixed(2));
  const sector = 360 / STAR_CARDS_TIE_SPARK_COUNT;
  return Array.from({ length: STAR_CARDS_TIE_SPARK_COUNT }, (_, index): StarCardsImpactParticle => {
    const directionDeg = (index * sector + randomBetween([-sector / 2, sector / 2]) + 360) % 360;
    const directionRad = directionDeg * Math.PI / 180;
    const distance = randomBetween([3, 10]);
    const x = Math.cos(directionRad) * distance;
    const y = Math.sin(directionRad) * distance;
    return {
      kind: "spark",
      offsetXCqw: round(x),
      offsetYCqw: round(y),
      gravityCqw: 0,
      // 長條火花的長軸對準飛行方向
      angleDeg: round((Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360),
      spinDeg: 0,
      sizeScale: round(randomBetween([0.45, 2.2])),
      animationDelayMs: Math.round(randomBetween([0, 70])),
      animationDurationMs: Math.round(randomBetween([240, 560])),
    };
  });
}

/**
 * 命中爆炸序列圖的播放變化：每次隨機挑一個烘焙版本，再隨機左右鏡像、小角度旋轉、微調大小，
 * 讓重複出現的爆炸看起來不一樣。旋轉限制在 ±12°，避免飛彈餘燼往上掉、煙往下飄。
 */
export const STAR_CARDS_IMPACT_SPRITE_JITTER = { rotateDeg: 12, scale: [0.9, 1.1] as Range };

export type StarCardsImpactSpriteChoice = {
  variant: number;
  flipX: boolean;
  rotateDeg: number;
  scale: number;
};

/** 平手氣爆是放射狀、沒有重力方向，可以任意旋轉 */
export const STAR_CARDS_TIE_SPRITE_ROTATE_DEG = 180;

export function createStarCardsImpactSpriteChoice(
  variantCount: number,
  random: () => number = Math.random,
  rotateDeg: number = STAR_CARDS_IMPACT_SPRITE_JITTER.rotateDeg,
): StarCardsImpactSpriteChoice {
  const unit = () => Math.min(0.999999, Math.max(0, random()));
  const [scaleMin, scaleMax] = STAR_CARDS_IMPACT_SPRITE_JITTER.scale;
  return {
    variant: Math.floor(unit() * Math.max(1, variantCount)),
    flipX: unit() < 0.5,
    rotateDeg: Number(((unit() * 2 - 1) * rotateDeg).toFixed(1)),
    scale: Number((scaleMin + (scaleMax - scaleMin) * unit()).toFixed(3)),
  };
}

/**
 * 攻擊途中的時間曲線（毫秒 → 路徑進度 0～1，0＝發射方、1＝目標），與 globals.css 的關鍵影格一致。
 * 三種武器都在命中爆炸開始（特效出現後 300ms）前後抵達目標。
 */
export const STAR_CARDS_ATTACK_CURVES: Record<StarCardAttribute, readonly (readonly [number, number])[]> = {
  // 雷射光束 720ms：0／8／18／28% 影格 → 約 200ms 伸到目標，持續照射到 82%（約 590ms）才收細熄滅
  laser: [[0, 0], [58, 0.5], [130, 0.88], [202, 1]],
  // 飛彈 420ms：0／20／40／55／71.43% 影格 → 加速飛行，300ms 抵達
  missile: [[0, 0], [84, 0.07], [168, 0.24], [231, 0.5], [300, 1]],
  // 護盾在發射方原地展開（760ms，24% 時展開完成），這條曲線只用來排定能量屑出現的時機；命中仍在 300ms
  shield: [[0, 0], [76, 0.05], [190, 0.45], [304, 1]],
};

/**
 * 命中特效開始的時間（特效出現後幾毫秒），與 globals.css 的 --impact-start 一致。
 * 雷射在光束到達時就開始燒灼；飛彈與護盾在 300ms 抵達時爆炸。
 * 飛彈為飛行速度 1 倍時的值；實際抵達時間＝300ms ÷ --fx-missile-speed。
 */
export const STAR_CARDS_IMPACT_START_MS: Record<StarCardAttribute, number> = {
  laser: 200,
  missile: 300,
  shield: 300,
};

/** 攻擊抵達路徑某一點的時間（毫秒），用來讓沿途粒子在彈體經過時才出現。 */
export function getStarCardsAttackTimeAt(attribute: StarCardAttribute, progress: number) {
  const curve = STAR_CARDS_ATTACK_CURVES[attribute];
  const clamped = Math.min(1, Math.max(0, progress));
  for (let index = 1; index < curve.length; index += 1) {
    const [startMs, startProgress] = curve[index - 1];
    const [endMs, endProgress] = curve[index];
    if (clamped <= endProgress) {
      const ratio = endProgress === startProgress ? 0 : (clamped - startProgress) / (endProgress - startProgress);
      return startMs + (endMs - startMs) * ratio;
    }
  }
  return curve[curve.length - 1][0];
}

/**
 * 攻擊途中的粒子：雷射 mote 光塵；飛彈 smoke 煙塵、cinder 火星、backblast 發射後座煙；護盾 flake 六角能量屑。
 * progress＝沿路徑位置；lateral＝離路徑中線的橫向距離；drift＝出現後的漂移（Y 正值＝朝目標）。
 */
export type StarCardsAttackParticleKind = "mote" | "smoke" | "cinder" | "backblast" | "flake";

type StarCardsAttackRecipe = {
  kind: StarCardsAttackParticleKind;
  count: number;
  progress: Range;
  /** 橫向距離大小（cqw），左右隨機 */
  lateral: Range;
  /** 往外側漂移量（cqw），方向與 lateral 同側；lateral 為 0 時左右隨機 */
  driftOut: Range;
  driftY: Range;
  size: Range;
  /** 彈體經過後再延遲多久出現 */
  extraDelayMs: Range;
  durationMs: Range;
};

export const STAR_CARDS_ATTACK_RECIPES: Record<StarCardAttribute, readonly StarCardsAttackRecipe[]> = {
  laser: [
    { kind: "mote", count: 22, progress: [0.06, 0.96], lateral: [0, 0.35], driftOut: [0.6, 1.6], driftY: [-0.4, 0.4], size: [0.6, 1.3], extraDelayMs: [0, 260], durationMs: [260, 520] },
  ],
  missile: [
    { kind: "backblast", count: 6, progress: [0, 0.02], lateral: [0, 0.2], driftOut: [0.8, 2], driftY: [-1.2, -0.3], size: [0.9, 1.4], extraDelayMs: [0, 40], durationMs: [500, 800] },
    { kind: "smoke", count: 16, progress: [0.04, 0.95], lateral: [0, 0.2], driftOut: [0.3, 1.1], driftY: [-0.6, 0.2], size: [0.8, 1.4], extraDelayMs: [0, 20], durationMs: [700, 1050] },
    { kind: "cinder", count: 14, progress: [0.05, 0.9], lateral: [0, 0.15], driftOut: [0.4, 1.2], driftY: [-1.6, -0.6], size: [0.6, 1.1], extraDelayMs: [0, 30], durationMs: [240, 420] },
  ],
  shield: [
    // 護盾在發射方原地展開：能量屑從半球弧面周圍往外散
    { kind: "flake", count: 14, progress: [0.18, 0.55], lateral: [3.5, 8], driftOut: [0.5, 1.4], driftY: [-0.4, 0.6], size: [0.6, 1.2], extraDelayMs: [0, 60], durationMs: [320, 560] },
  ],
};

export type StarCardsAttackParticle = {
  kind: StarCardsAttackParticleKind;
  progress: number;
  lateralCqw: number;
  driftXCqw: number;
  driftYCqw: number;
  sizeScale: number;
  animationDelayMs: number;
  animationDurationMs: number;
};

export type StarCardsAttackParticleLayout = readonly StarCardsAttackParticle[];

/** 每次攻擊只建立一次的沿途粒子；沿路徑分層取樣，出現時間對齊彈體經過該點的時刻。 */
export function createStarCardsAttackParticleLayout(
  attribute: StarCardAttribute,
  random: () => number = Math.random,
): StarCardsAttackParticleLayout {
  const randomBetween = ([minimum, maximum]: Range) => {
    const randomValue = Math.min(1, Math.max(0, random()));
    return minimum + (maximum - minimum) * randomValue;
  };
  const round = (value: number) => Number(value.toFixed(2));

  return STAR_CARDS_ATTACK_RECIPES[attribute].flatMap((recipe) =>
    Array.from({ length: recipe.count }, (_, index): StarCardsAttackParticle => {
      const [start, end] = recipe.progress;
      const slot = (end - start) / recipe.count;
      const progress = start + slot * (index + randomBetween([0.15, 0.85]));
      const side = random() < 0.5 ? -1 : 1;
      const lateral = randomBetween(recipe.lateral) * side;
      return {
        kind: recipe.kind,
        progress: round(progress),
        lateralCqw: round(lateral),
        driftXCqw: round(randomBetween(recipe.driftOut) * side),
        driftYCqw: round(randomBetween(recipe.driftY)),
        sizeScale: round(randomBetween(recipe.size)),
        animationDelayMs: Math.round(getStarCardsAttackTimeAt(attribute, progress) + randomBetween(recipe.extraDelayMs)),
        animationDurationMs: Math.round(randomBetween(recipe.durationMs)),
      };
    }),
  );
}

/**
 * 護盾半球的 SVG 座標系：寬 240、高 140；半徑 1 對應 100 單位，
 * 底邊（發射方那一側）在 y=115，弧頂朝上（朝目標）在 y≈15；底邊下方留 25 單位給折線外緣。
 */
export const STAR_CARDS_SHIELD_DOME_VIEWBOX = "0 0 240 140";
export const STAR_CARDS_SHIELD_DOME_BASE_RATIO = 115 / 140;

export type StarCardsShieldDomeCell = {
  /** SVG polygon points：貼在球面上的六角格投影到畫面後的形狀（邊緣的格子被透視壓扁） */
  points: string;
  /** 0＝半球正面中心、1＝弧面邊緣（投影後離底邊中點的距離） */
  rim: number;
  /** 0～1：格子面向鏡頭的程度（球面法線的 z）；正面最亮、邊緣變薄變透明 */
  facing: number;
  /** 0＝最外圈（弧面邊緣或底邊）、1＝內部；外圈格子漸淡 */
  fade: number;
  /** 最外圈：額外加模糊，讓六角折線外緣柔和 */
  isEdge: boolean;
  /** 展開時由中心往外擴散的點亮延遲 */
  launchDelayMs: number;
  /** 命中時由弧頂往兩側擴散的點亮延遲 */
  hitDelayMs: number;
};

/**
 * 護盾半球：真正的球面＋六角形貼圖。
 * 1. 在球面上鋪大小一致的六角格（以半球正面 c 為中心的等距方位投影展開平面六角網格）。
 * 2. 半球的極軸朝上（朝目標）、底面在 y=0，從正前方正交投影到畫面 → 輪廓是半圓，
 *    越靠近球的邊緣，格子被透視壓得越扁越窄。
 * 3. 只保留整格都在可見球面上的格子，外緣因此是貼著圓弧的細小六角折線；最外圈再漸淡加模糊。
 * 4. 不畫接縫線：每片在球面上往自己的中心縮成 tileScale，片與片之間自然留出間隙（邊緣的間隙也會被透視壓窄）。
 */
export const STAR_CARDS_SHIELD_DOME_HEX_ANGLE = 0.22;
export const STAR_CARDS_SHIELD_DOME_TILE_SCALE = 0.86;

export function createStarCardsShieldDomeCells(
  hexAngle = STAR_CARDS_SHIELD_DOME_HEX_ANGLE,
  tileScale = STAR_CARDS_SHIELD_DOME_TILE_SCALE,
): readonly StarCardsShieldDomeCell[] {
  const cells: StarCardsShieldDomeCell[] = [];
  type Vector = readonly [number, number, number];
  // 正面中心：可見半圓的重心附近（y≈0.42），在球面上朝向鏡頭
  const centerY = 0.42;
  const c: Vector = [0, centerY, Math.sqrt(1 - centerY * centerY)];
  const e1: Vector = [1, 0, 0];
  const e2: Vector = [0, c[2], -c[1]];
  const toSphere = (a: number, b: number): Vector => {
    const r = Math.hypot(a, b);
    if (r < 1e-9) return c;
    const sin = Math.sin(r) / r;
    const cos = Math.cos(r);
    return [
      cos * c[0] + sin * (a * e1[0] + b * e2[0]),
      cos * c[1] + sin * (a * e1[1] + b * e2[1]),
      cos * c[2] + sin * (a * e1[2] + b * e2[2]),
    ];
  };
  const toSvg = (p: Vector) => `${(120 + p[0] * 100).toFixed(1)},${(115 - p[1] * 100).toFixed(1)}`;
  const columnStep = hexAngle * Math.sqrt(3);
  const rowStep = hexAngle * 1.5;
  const reach = 1.9;
  for (let row = -Math.ceil(reach / rowStep); row <= Math.ceil(reach / rowStep); row += 1) {
    const offset = Math.abs(row) % 2 ? columnStep / 2 : 0;
    for (let column = -Math.ceil(reach / columnStep) - 1; column <= Math.ceil(reach / columnStep) + 1; column += 1) {
      const a = column * columnStep + offset;
      const b = row * rowStep;
      if (Math.hypot(a, b) > reach) continue;
      const center = toSphere(a, b);
      if (center[2] < 0.02 || center[1] < 0) continue;
      const corners = Array.from({ length: 6 }, (_, corner) => {
        const angle = (60 * corner + 30) * Math.PI / 180;
        const tile = hexAngle * tileScale;
        return toSphere(a + Math.cos(angle) * tile, b + Math.sin(angle) * tile);
      });
      // 整格都要在可見球面上（不翻到背面）；底邊容許半格跨出，形成六角折線
      if (corners.some((p) => p[2] < 0 || p[1] < -hexAngle * 0.9)) continue;
      const facing = Math.min(1, Math.max(0, center[2]));
      const rim = Math.min(1, Math.hypot(center[0], center[1]));
      // 外圈：越貼近球的邊緣（facing 小）或越貼近底邊越淡
      const limbFade = Math.min(1, Math.max(0, (facing - 0.08) / 0.4));
      const baseFade = Math.min(1, Math.max(0, center[1] / (hexAngle * 1.6)));
      const fade = Number(Math.min(limbFade, baseFade).toFixed(2));
      const apexDistance = Math.hypot(center[0], center[1] - 1) / Math.SQRT2;
      cells.push({
        points: corners.map(toSvg).join(" "),
        rim: Number(rim.toFixed(2)),
        facing: Number(facing.toFixed(2)),
        fade,
        isEdge: fade < 0.5,
        launchDelayMs: Math.round(rim * 140),
        hitDelayMs: Math.round(Math.min(1, apexDistance) * 130),
      });
    }
  }
  return cells;
}

export const STAR_CARDS_SHIELD_DOME_CELLS = createStarCardsShieldDomeCells();

/**
 * 飛彈數量的預設值與上下限。實際數量由 globals.css 的 --fx-missile-main-count／--fx-missile-escort-count
 * 決定（開打時讀取），這裡的預設值只在讀不到 CSS 時使用。
 */
export const STAR_CARDS_MISSILE_MAIN_COUNT = 1;
export const STAR_CARDS_MISSILE_MAIN_COUNT_RANGE: Range = [1, 5];
export const STAR_CARDS_MISSILE_ESCORT_COUNT = 5;
export const STAR_CARDS_MISSILE_ESCORT_COUNT_RANGE: Range = [0, 20];

/** 把讀到的數量限制在上下限內並取整數；讀不到（NaN）時用預設值 */
export function clampStarCardsMissileCount(value: number, [minimum, maximum]: Range, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

/**
 * 主飛彈並排位置：以路徑中線為中心左右對稱，單位為「一個彈體間距」，CSS 再乘上間距與子彈倍率。
 * 1 顆＝[0]；3 顆＝[-1, 0, 1]；2 顆＝[-0.5, 0.5]。主飛彈同時發射，飛行途中往中線收攏、一起命中。
 */
export function getStarCardsMissileMainOffsets(count: number): readonly number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => index - (count - 1) / 2);
}

/** 主飛彈之外的尾隨飛彈編隊範圍 */
export const STAR_CARDS_MISSILE_ESCORT_LATERAL: Range = [0.9, 4.4];
export const STAR_CARDS_MISSILE_ESCORT_DEPTH: Range = [-3.4, 3.4];

/**
 * 每次攻擊只建立一次的隨機散射編隊；重繪不變，下次發射重新抽選。
 * 尾隨飛彈左右各半，每一側把 0.9～4.4cqw 平均切成幾格、每顆各佔一格再隨機偏移，
 * 保證彼此錯開且不貼著主飛彈；發射時機同樣分層取樣後打亂，避免由內到外依序發射。
 * 發射時機只存 0～1 的比例，齊射總時間（--fx-missile-salvo）與飛行速度（--fx-missile-speed）由 CSS 參數決定。
 */
export function createStarCardsMissileTrailLayout(
  random: () => number = Math.random,
  escortCount: number = STAR_CARDS_MISSILE_ESCORT_COUNT,
): StarCardsMissileTrailLayout {
  const randomBetween = (minimum: number, maximum: number) => {
    const randomValue = Math.min(1, Math.max(0, random()));
    return minimum + (maximum - minimum) * randomValue;
  };
  const count = clampStarCardsMissileCount(escortCount, STAR_CARDS_MISSILE_ESCORT_COUNT_RANGE, STAR_CARDS_MISSILE_ESCORT_COUNT);
  if (count === 0) return [];
  const perSide = Math.ceil(count / 2);
  const [lateralMin, lateralMax] = STAR_CARDS_MISSILE_ESCORT_LATERAL;
  const lateralSlot = (lateralMax - lateralMin) / perSide;
  // 發射時機槽洗牌（Fisher–Yates）
  const delaySlots = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index -= 1) {
    const swap = Math.floor(randomBetween(0, 0.999) * (index + 1));
    [delaySlots[index], delaySlots[swap]] = [delaySlots[swap], delaySlots[index]];
  }
  return Array.from({ length: count }, (_, index): StarCardsMissileTrail => {
    const side = index % 2 === 0 ? -1 : 1;
    const slot = Math.floor(index / 2);
    // 偏移只在格子中段 30～70%，相鄰兩格至少差 0.4 格寬（8 顆時約 0.35cqw；數量越多格子越窄）
    const lateral = lateralMin + lateralSlot * (slot + randomBetween(0.3, 0.7));
    return {
      lateralOffsetVw: Number((lateral * side).toFixed(2)),
      depthOffsetCqh: Number(randomBetween(...STAR_CARDS_MISSILE_ESCORT_DEPTH).toFixed(2)),
      // 第 n 個時機槽的 10～90% 處；最後一槽接近 1，所以最後一顆約在齊射時間結束時發射
      launchFraction: Number(((delaySlots[index] + randomBetween(0.1, 0.9)) / count).toFixed(3)),
      // 落點大多落在發射時的同一側，偶爾交叉到另一側
      impactScatterX: Number((side * randomBetween(-0.35, 1)).toFixed(2)),
      impactScatterY: Number(randomBetween(-1, 1).toFixed(2)),
    };
  });
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
