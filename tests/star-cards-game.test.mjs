import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  STAR_CARD_DECK,
  STAR_CARD_LANES,
  STAR_CARDS_DEBUG_NUMBER,
  STAR_CARDS_GAME_ID,
  STAR_CARDS_WINS_TO_MATCH,
  STAR_CARDS_ATTACK_CURVES,
  STAR_CARDS_ATTACK_RECIPES,
  STAR_CARDS_IMPACT_RECIPES,
  STAR_CARDS_SHIELD_DOME_CELLS,
  STAR_CARDS_SHIELD_DOME_VIEWBOX,
  STAR_CARDS_MISSILE_ESCORT_COUNT,
  clampStarCardsMissileCount,
  getStarCardsMissileMainOffsets,
  createStarCardsTieClashLayout,
  STAR_CARDS_TIE_SPARK_COUNT,
  STAR_CARDS_IMPACT_START_MS,
  STAR_CARDS_IMPACT_SPRITE_JITTER,
  createStarCardsImpactSpriteChoice,
  createStarCardsAttackParticleLayout,
  getStarCardsAttackTimeAt,
  canPlaceStarCard,
  compareStarCards,
  createStarCardsImpactParticleLayout,
  createStarCardsMissileTrailLayout,
  getStarCardBattleScore,
  shouldAnimateStarCardsZone,
  shuffleStarCardDeck,
} from "../app/star-cards-game.ts";
import { STAR_CARDS_IMPACT_SPRITES, STAR_CARDS_TIE_SPRITE } from "../app/star-cards-impact-sprites.ts";

test("StarCards exposes the requested debug identity and three lanes", () => {
  assert.equal(STAR_CARDS_DEBUG_NUMBER, 4);
  assert.equal(STAR_CARDS_GAME_ID, "StarCards");
  assert.deepEqual(STAR_CARD_LANES, ["A", "B", "C"]);
});

test("the nine-card deck contains one card per attribute and point pairing", () => {
  assert.equal(STAR_CARD_DECK.length, 9);
  assert.equal(new Set(STAR_CARD_DECK.map((card) => card.id)).size, 9);
  for (const attribute of ["missile", "shield", "laser"]) {
    assert.deepEqual(
      STAR_CARD_DECK
        .filter((card) => card.attribute === attribute)
        .map((card) => card.points)
        .sort(),
      [1, 2, 3],
    );
  }
});

test("shuffle keeps every card exactly once", () => {
  let value = 0;
  const shuffled = shuffleStarCardDeck(() => {
    value = (value + 0.37) % 1;
    return value;
  });
  assert.equal(shuffled.length, STAR_CARD_DECK.length);
  assert.deepEqual(
    shuffled.map((card) => card.id).sort(),
    STAR_CARD_DECK.map((card) => card.id).sort(),
  );
});

test("missile salvo is one main warhead plus eight widely staggered escorts", () => {
  // 這裡測 8 顆的編隊（數量可調，預設值另外檢查）
  const sequences = [
    [0, 0.25, 0.5, 0.75, 1],
    [0.9, 0.1, 0.6, 0.3, 0.45, 0.05, 0.8],
  ];
  const layouts = sequences.map((values) => {
    let index = 0;
    return createStarCardsMissileTrailLayout(() => values[index++ % values.length], 8);
  });
  for (const layout of layouts) {
    assert.equal(layout.length, 8);
    const left = layout.filter((trail) => trail.lateralOffsetVw < 0);
    const right = layout.filter((trail) => trail.lateralOffsetVw > 0);
    assert.equal(left.length, 4);
    assert.equal(right.length, 4);
    for (const trail of layout) {
      assert.ok(Math.abs(trail.lateralOffsetVw) >= 0.9 && Math.abs(trail.lateralOffsetVw) <= 4.4);
      assert.ok(trail.depthOffsetCqh >= -3.4 && trail.depthOffsetCqh <= 3.4);
      assert.ok(trail.launchFraction > 0 && trail.launchFraction < 1);
      // 落點散布為 -1～1 的比例，大多與發射同側
      assert.ok(Math.abs(trail.impactScatterX) <= 1 && Math.abs(trail.impactScatterY) <= 1);
      assert.ok(trail.impactScatterX * Math.sign(trail.lateralOffsetVw) >= -0.35);
    }
    // 同一側每顆各佔一個橫向分層，相鄰至少間隔 0.34cqw
    for (const side of [left, right]) {
      const offsets = side.map((trail) => Math.abs(trail.lateralOffsetVw)).sort((a, b) => a - b);
      for (let index = 1; index < offsets.length; index += 1) {
        assert.ok(offsets[index] - offsets[index - 1] >= 0.33, `escorts too close: ${offsets}`);
      }
    }
    // 發射時機各佔一個時間槽（每槽 1/8），最後一顆在齊射時間的最後一槽
    const launches = layout.map((trail) => trail.launchFraction).sort((a, b) => a - b);
    launches.forEach((fraction, slot) => {
      assert.ok(fraction > slot / 8 && fraction < (slot + 1) / 8, `launch ${fraction} outside slot ${slot}`);
    });
  }
  assert.notDeepEqual(layouts[0], layouts[1]);
});

test("tie sparks burst radially and point along their flight", () => {
  const values = [0, 0.25, 0.5, 0.75, 1];
  let index = 0;
  const sparks = createStarCardsTieClashLayout(() => values[index++ % values.length]);
  assert.equal(sparks.length, STAR_CARDS_TIE_SPARK_COUNT);
  // 360° 平均分布：四個象限都有火花
  const quadrants = new Set(sparks.map((spark) => `${spark.offsetXCqw >= 0}${spark.offsetYCqw >= 0}`));
  assert.equal(quadrants.size, 4);
  for (const spark of sparks) {
    const distance = Math.hypot(spark.offsetXCqw, spark.offsetYCqw);
    assert.ok(distance >= 2.99 && distance <= 10.01);
    assert.ok(spark.sizeScale >= 0.45 && spark.sizeScale <= 2.2);
    const travel = (Math.atan2(spark.offsetYCqw, spark.offsetXCqw) * 180 / Math.PI + 360) % 360;
    const facing = (spark.angleDeg - 90 + 360) % 360;
    assert.ok(Math.abs(((travel - facing + 540) % 360) - 180) < 0.5);
  }
});

test("missile counts are adjustable and clamped", () => {
  let index = 0;
  const values = [0.1, 0.6, 0.3, 0.9, 0.45];
  const random = () => values[index++ % values.length];
  assert.equal(createStarCardsMissileTrailLayout(random, 0).length, 0);
  assert.equal(createStarCardsMissileTrailLayout(random, 3).length, 3);
  const twenty = createStarCardsMissileTrailLayout(random, 20);
  assert.equal(twenty.length, 20);
  assert.equal(twenty.filter((trail) => trail.lateralOffsetVw < 0).length, 10);
  // 超出上限時夾到 20
  assert.equal(createStarCardsMissileTrailLayout(random, 99).length, 20);
  assert.equal(clampStarCardsMissileCount(Number.NaN, [1, 5], 1), 1);
  assert.equal(clampStarCardsMissileCount(7.6, [1, 5], 1), 5);
  assert.equal(clampStarCardsMissileCount(2.4, [1, 5], 1), 2);
  assert.deepEqual(getStarCardsMissileMainOffsets(1), [0]);
  assert.deepEqual(getStarCardsMissileMainOffsets(2), [-0.5, 0.5]);
  assert.deepEqual(getStarCardsMissileMainOffsets(3), [-1, 0, 1]);
});

test("attack curves reach the target when the impact explosion starts", () => {
  for (const attribute of ["laser", "missile", "shield"]) {
    const curve = STAR_CARDS_ATTACK_CURVES[attribute];
    assert.deepEqual(curve[0], [0, 0]);
    assert.equal(curve.at(-1)[1], 1);
    assert.ok(curve.at(-1)[0] <= 310, `${attribute} must arrive by the 300ms impact`);
    for (let index = 1; index < curve.length; index += 1) {
      assert.ok(curve[index][0] > curve[index - 1][0] && curve[index][1] > curve[index - 1][1]);
    }
  }
  assert.equal(getStarCardsAttackTimeAt("missile", 0), 0);
  assert.equal(getStarCardsAttackTimeAt("missile", 1), 300);
  assert.equal(getStarCardsAttackTimeAt("missile", 0.5), 231);
  assert.equal(getStarCardsAttackTimeAt("laser", 0.25), 29);
});

test("attack particles appear along the path when the projectile passes", () => {
  const values = [0, 0.25, 0.5, 0.75, 1];
  for (const attribute of ["laser", "missile", "shield"]) {
    let index = 0;
    const layout = createStarCardsAttackParticleLayout(attribute, () => values[index++ % values.length]);
    const recipes = STAR_CARDS_ATTACK_RECIPES[attribute];
    assert.equal(layout.length, recipes.reduce((total, recipe) => total + recipe.count, 0));
    for (const particle of layout) {
      const recipe = recipes.find((candidate) => candidate.kind === particle.kind);
      assert.ok(recipe, `${attribute} produced foreign kind ${particle.kind}`);
      assert.ok(particle.progress >= recipe.progress[0] - 0.01 && particle.progress <= recipe.progress[1] + 0.01);
      const passMs = getStarCardsAttackTimeAt(attribute, particle.progress);
      assert.ok(particle.animationDelayMs >= Math.floor(passMs) - 1);
      assert.ok(particle.animationDelayMs <= Math.ceil(passMs + recipe.extraDelayMs[1]) + 1);
      if (particle.lateralCqw !== 0) {
        assert.equal(Math.sign(particle.driftXCqw), Math.sign(particle.lateralCqw), "drift moves outward");
      }
    }
  }
  assert.deepEqual(STAR_CARDS_ATTACK_RECIPES.laser.map((recipe) => recipe.kind), ["mote"]);
  assert.deepEqual(STAR_CARDS_ATTACK_RECIPES.missile.map((recipe) => recipe.kind), ["backblast", "smoke", "cinder"]);
  assert.deepEqual(STAR_CARDS_ATTACK_RECIPES.shield.map((recipe) => recipe.kind), ["flake"]);
});

test("shield dome is a hemisphere textured with hex cells that foreshorten toward the rim", () => {
  const cells = STAR_CARDS_SHIELD_DOME_CELLS;
  assert.equal(STAR_CARDS_SHIELD_DOME_VIEWBOX, "0 0 240 140");
  assert.ok(cells.length >= 15 && cells.length <= 70, `expected a hex-textured sphere, got ${cells.length}`);
  const allPoints = [];
  const areaOf = (points) => Math.abs(points.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return sum + x * nextY - nextX * y;
  }, 0)) / 2;
  const samples = [];
  for (const cell of cells) {
    const points = cell.points.split(" ").map((pair) => pair.split(",").map(Number));
    assert.equal(points.length, 6);
    for (const [x, y] of points) {
      assert.ok(x >= 0 && x <= 240 && y >= 0 && y <= 140, `vertex ${x},${y} outside the viewBox`);
      // 球面投影：所有頂點都落在半徑 100 的圓內（整格都在可見球面上）
      assert.ok(Math.hypot(x - 120, 115 - y) <= 100.5, `vertex ${x},${y} outside the sphere silhouette`);
      allPoints.push([x, y]);
    }
    assert.ok(cell.rim >= 0 && cell.rim <= 1);
    assert.ok(cell.facing >= 0 && cell.facing <= 1);
    assert.ok(cell.fade >= 0 && cell.fade <= 1);
    assert.equal(cell.isEdge, cell.fade < 0.5);
    assert.ok(cell.launchDelayMs >= 0 && cell.launchDelayMs <= 140);
    assert.ok(cell.hitDelayMs >= 0 && cell.hitDelayMs <= 130);
    samples.push({ facing: cell.facing, area: areaOf(points) });
  }
  // 輪廓是半球：左右兩端接近 ±100、弧頂接近半徑 100
  const xs = allPoints.map(([x]) => x);
  const top = Math.min(...allPoints.map(([, y]) => y));
  assert.ok(Math.min(...xs) < 35 && Math.max(...xs) > 205, `silhouette too narrow: ${Math.min(...xs)}..${Math.max(...xs)}`);
  assert.ok(top < 30, `apex too low: ${top}`);
  // 貼圖在球面上：正面的格子投影面積明顯大於邊緣（透視壓扁）
  const front = samples.filter((sample) => sample.facing > 0.85);
  const limb = samples.filter((sample) => sample.facing < 0.4);
  const mean = (list) => list.reduce((sum, sample) => sum + sample.area, 0) / list.length;
  assert.ok(front.length > 0 && limb.length > 0);
  assert.ok(mean(front) > mean(limb) * 1.8, `front ${mean(front)} vs limb ${mean(limb)}`);
  // 不畫接縫線：每片往自己的中心縮小，任兩片的頂點都不會貼在一起（留有間隙）
  const cellPoints = cells.map((cell) => cell.points.split(" ").map((pair) => pair.split(",").map(Number)));
  let closest = Infinity;
  for (let first = 0; first < cellPoints.length; first += 1) {
    for (let second = first + 1; second < cellPoints.length; second += 1) {
      for (const [x1, y1] of cellPoints[first]) {
        for (const [x2, y2] of cellPoints[second]) closest = Math.min(closest, Math.hypot(x1 - x2, y1 - y2));
      }
    }
  }
  assert.ok(closest > 1.5, `tiles touch each other (closest vertices ${closest})`);
  assert.ok(cells.some((cell) => cell.isEdge) && cells.some((cell) => !cell.isEdge));
  // 由中心往外點亮
  const center = cells.reduce((best, cell) => (cell.rim < best.rim ? cell : best));
  const edge = cells.reduce((best, cell) => (cell.rim > best.rim ? cell : best));
  assert.ok(center.launchDelayMs < edge.launchDelayMs);
});

test("each weapon has its own impact explosion recipe", () => {
  const kindsOf = (attribute) => STAR_CARDS_IMPACT_RECIPES[attribute].map((recipe) => recipe.kind);
  assert.deepEqual(kindsOf("laser"), ["needle", "droplet"]);
  assert.deepEqual(kindsOf("missile"), ["smoke", "fireball", "debris", "ember", "spark"]);
  assert.deepEqual(kindsOf("shield"), ["shard", "ion", "arc"]);
  const allKinds = Object.values(STAR_CARDS_IMPACT_RECIPES).flat().map((recipe) => recipe.kind);
  assert.equal(new Set(allKinds).size, allKinds.length, "weapons must not share particle kinds");
});

test("impact particles follow their weapon recipe and point radially outward", () => {
  const values = [0, 0.25, 0.5, 0.75, 1];
  for (const attribute of ["laser", "missile", "shield"]) {
    let index = 0;
    const layout = createStarCardsImpactParticleLayout(
      attribute,
      () => values[index++ % values.length],
    );
    const recipes = STAR_CARDS_IMPACT_RECIPES[attribute];
    assert.equal(layout.length, recipes.reduce((total, recipe) => total + recipe.count, 0));
    for (const particle of layout) {
      const recipe = recipes.find((candidate) => candidate.kind === particle.kind);
      assert.ok(recipe, `${attribute} produced foreign kind ${particle.kind}`);
      const within = (value, [minimum, maximum]) =>
        value >= Math.min(minimum, maximum) - 0.011 && value <= Math.max(minimum, maximum) + 0.011;
      assert.ok(within(Math.hypot(particle.offsetXCqw, particle.offsetYCqw), recipe.distance));
      assert.ok(within(particle.gravityCqw, recipe.gravity));
      assert.ok(within(Math.abs(particle.spinDeg), recipe.spin));
      assert.ok(within(particle.sizeScale, recipe.size));
      assert.ok(within(particle.animationDelayMs, recipe.delayMs));
      assert.ok(within(particle.animationDurationMs, recipe.durationMs));
      const travelDirectionDeg = (
        Math.atan2(particle.offsetYCqw, particle.offsetXCqw) * 180 / Math.PI + 360
      ) % 360;
      const particleDirectionDeg = (particle.angleDeg - 90 + 360) % 360;
      const directionDifference = Math.abs(
        ((travelDirectionDeg - particleDirectionDeg + 540) % 360) - 180,
      );
      assert.ok(directionDifference < 0.5);
    }
  }
});

test("initial placement requires an empty lane while the drawn card may stack", () => {
  assert.equal(canPlaceStarCard("initial-placement", 0), true);
  assert.equal(canPlaceStarCard("initial-placement", 1), false);
  assert.equal(canPlaceStarCard("draw-placement", 1), true);
  assert.equal(canPlaceStarCard("draw-placement", 2), true);
  assert.equal(canPlaceStarCard("draw-placement", 3), false);
});

test("Zone tween follows a waiting hand card and each lane's legal capacity", () => {
  assert.equal(shouldAnimateStarCardsZone("initial-placement", 3, 0), true);
  assert.equal(shouldAnimateStarCardsZone("initial-placement", 2, 1), false);
  assert.equal(shouldAnimateStarCardsZone("draw-placement", 1, 0), true);
  assert.equal(shouldAnimateStarCardsZone("draw-placement", 1, 2), true);
  assert.equal(shouldAnimateStarCardsZone("draw-placement", 1, 3), false);
  assert.equal(shouldAnimateStarCardsZone("draw-placement", 0, 2), false);
  assert.equal(shouldAnimateStarCardsZone(null, 1, 0), false);
});

test("battle resolves fixed attribute counters before same-attribute points", () => {
  const by = (attribute, points) =>
    STAR_CARD_DECK.find((card) => card.attribute === attribute && card.points === points);
  assert.equal(compareStarCards(by("shield", 1), by("laser", 3)), "first");
  assert.equal(compareStarCards(by("laser", 1), by("missile", 3)), "first");
  assert.equal(compareStarCards(by("missile", 1), by("shield", 3)), "first");
  assert.equal(compareStarCards(by("laser", 3), by("laser", 2)), "first");
  assert.equal(compareStarCards(by("shield", 2), by("shield", 2)), "tie");
});

test("battle awards the defeated card points to the winner and ties award zero", () => {
  const by = (attribute, points) =>
    STAR_CARD_DECK.find((card) => card.attribute === attribute && card.points === points);
  assert.deepEqual(getStarCardBattleScore(by("shield", 1), by("laser", 3)), {
    result: "first",
    awardedPoints: 3,
  });
  assert.deepEqual(getStarCardBattleScore(by("missile", 2), by("laser", 1)), {
    result: "second",
    awardedPoints: 2,
  });
  assert.deepEqual(getStarCardBattleScore(by("shield", 2), by("shield", 2)), {
    result: "tie",
    awardedPoints: 0,
  });
});

test("StarCards component includes card back, tween phases, DRAW feedback, and input paths", () => {
  const source = readFileSync(new URL("../app/star-cards-game.tsx", import.meta.url), "utf8");
  const movementLabSource = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /starCardsAssetUrl\("card-back\.png"\)/);
  assert.doesNotMatch(source, /star-card-secret/);
  assert.match(source, /star-card-back-point/);
  assert.match(source, /star-card-back-attribute/);
  assert.match(source, /starCardsAssetUrl\(`b-\$\{card\.points\}\.png`\)/);
  assert.match(source, /starCardsAssetUrl\(`\$\{card\.attribute\}2\.png`\)/);
  assert.doesNotMatch(source, /StarCardAttributeIcon/);
  assert.match(styles, /\.star-card-back-point/);
  assert.match(styles, /\.star-card-back-attribute/);
  assert.match(styles, /\.star-card-back-point \{[^}]*top: 4\.3%;[^}]*width: 20\.5%/);
  assert.match(styles, /\.star-card-back-attribute \{[^}]*top: 5%;[^}]*width: 20\.5%/);
  assert.match(styles, /\.star-card-back-hints\.is-laser \.star-card-back-attribute \{[^}]*top: 6%;[^}]*width: 16\.8%/);
  assert.match(styles, /\.star-card-back \{[^}]*background: transparent/);
  assert.doesNotMatch(styles, /\.star-card-back \{[^}]*background: #100424/);
  assert.match(styles, /@keyframes star-card-back-hints-in/);
  assert.match(source, /setPhase\("initial-placement"\);[\s\S]*showPlacementPrompt\("initial"\);[\s\S]*}, 920\)/);
  assert.match(source, /setPhase\("revealing"\)/);
  assert.match(source, /setPhase\("draw-ready"\)/);
  assert.match(source, /setPhase\("draw-placement"\)/);
  assert.match(source, /setAiPendingCard\(aiCard\)/);
  assert.match(source, /const \[playerInitialDeck\] = useState/);
  assert.match(source, /const \[aiInitialDeck\] = useState/);
  assert.match(source, /id: `\$\{owner\}-game-\$\{gameNumber\}-\$\{card\.id\}`/);
  assert.match(source, /playerInitialDeck\.slice\(3\)/);
  assert.match(source, /aiInitialDeck\.slice\(3\)/);
  assert.match(source, /setPlayerRemainingDeck\(\(cards\) => cards\.slice\(1\)\)/);
  assert.match(source, /setAiRemainingDeck\(\(cards\) => cards\.slice\(1\)\)/);
  assert.match(source, /playerDrawnCount = STAR_CARD_DECK\.length - playerRemainingDeck\.length/);
  assert.match(source, /setActiveDrawIndex\(drawIndex\)/);
  assert.match(source, /setPhase\("battle-resolved"\)/);
  assert.match(source, /const isFinalBattleOfGame/);
  assert.match(source, /playerRemainingDeck\.length === 0 && aiRemainingDeck\.length === 0/);
  assert.match(source, /setCurrentGame\(nextGame\)/);
  assert.match(source, /setGameBannerNumber\(nextGame\)/);
  assert.match(source, /setGameBannerNumber\(null\), 950/);
  assert.match(source, /【第\{gameBannerNumber\}局】/);
  assert.match(source, /\{ text: "你贏了！", outcome: "victory" \}/);
  assert.match(source, /\{ text: "失敗了…", outcome: "defeat" \}/);
  assert.match(
    source,
    /if \(!gameWinner\) \{[\s\S]*setMatchResultBanner\(\{ text: "【平手】", outcome: "tie" \}\);[\s\S]*schedule\(\(\) => prepareNextGame\(currentGame \+ 1\), 2400\);[\s\S]*return;/,
  );
  assert.doesNotMatch(source, /matchWinner \|\| currentGame >= STAR_CARDS_MAX_GAMES/);
  assert.match(source, /setMatchResultBanner\(null\), 950/);
  assert.match(source, /className=\{`star-cards-game-banner is-\$\{matchResultBanner\.outcome\}`\}/);
  assert.match(source, /setPlayerGameWins\(nextPlayerGameWins\)/);
  assert.match(source, /setAiGameWins\(nextAiGameWins\)/);
  assert.match(source, /prepareNextGame\(currentGame \+ 1\)/);
  assert.match(source, /className="star-cards-match-wins"/);
  assert.match(movementLabSource, /gameCommand\.gameNumber === 4/);
  assert.match(movementLabSource, /openStarCardsGame\(\)/);
  assert.match(movementLabSource, /<StarCardsGame[\s\S]*onClose=\{closeStarCardsGame\}[\s\S]*audioEvents=\{audioEventManagerRef\.current\}/);
  assert.match(source, /className="is-player-wins"/);
  assert.match(source, /className="is-ai-wins"/);
  assert.match(source, /starCardsAssetUrl\("score-panel\.png"\)/);
  assert.match(source, /starCardsAssetUrl\("match-wins-panel\.png"\)/);
  assert.match(source, /className="star-cards-player-identity is-owen"[\s\S]*starCardsAssetUrl\("Player_Up\.png"\)/);
  assert.match(source, /className="star-cards-player-identity is-player"[\s\S]*starCardsAssetUrl\("Player_Down\.png"\)/);
  assert.match(styles, /\.star-cards-player-identity\.is-owen \{[\s\S]*top: 1\.2%;[\s\S]*left: 1\.2%/);
  assert.match(styles, /\.star-cards-player-identity\.is-player \{[\s\S]*right: 1\.2%;[\s\S]*bottom: 1\.2%/);
  assert.match(
    styles,
    /\.star-cards-match-wins \{[\s\S]*top: 0\.75%;[\s\S]*width: 15\.76%/,
  );
  assert.match(
    styles,
    /\.star-cards-match-wins > b \{[\s\S]*top: 42%;[\s\S]*font-size: clamp\(14px, 1\.55cqw, 29px\)[\s\S]*text-shadow: none/,
  );
  assert.match(styles, /\.star-cards-match-wins \.is-player-wins \{[\s\S]*left: 31\.25%/);
  assert.match(styles, /\.star-cards-match-wins \.is-ai-wins \{[\s\S]*left: 68\.5%/);
  assert.match(styles, /\.star-cards-game-banner/);
  assert.match(styles, /pointer-events: none;[\s\S]*animation: star-cards-game-banner-sweep 950ms linear both/);
  assert.match(styles, /@keyframes star-cards-game-banner-sweep/);
  assert.match(styles, /10\.526%[\s\S]*89\.474%/);
  assert.match(styles, /\.star-cards-game-banner\.is-victory span/);
  assert.match(styles, /\.star-cards-game-banner\.is-defeat span/);
  assert.match(styles, /\.star-cards-game-banner\.is-tie span/);
  assert.match(source, /setPlayerScore\(0\)[\s\S]*setAiScore\(0\)[\s\S]*setPlayerPlaced\(\[\]\)[\s\S]*setPlayerRemainingDeck\(nextPlayerDeck\.slice\(3\)\)/);
  assert.match(source, /setDragging\(null\)[\s\S]*setSnappingCardId\(null\)[\s\S]*setDrawButtonPressed\(false\)[\s\S]*setBattleButtonPressed\(false\)/);
  assert.match(source, /setPhase\("draw-ready"\)/);
  assert.equal(STAR_CARDS_WINS_TO_MATCH, 3);
  assert.match(source, /starCardsAssetUrl\("button-stack\.png"\)/);
  assert.match(styles, /\.star-cards-stack-status/);
  assert.match(source, /const PLAYER_HAND_X = \[33\.4, 50, 66\.6\]/);
  assert.match(source, /const PLAYER_HAND_BOTTOM = \[5\.9, 10\.6, 5\.9\]/);
  assert.match(source, /const PLAYER_HAND_ROTATION = \[-5, 0, 5\]/);
  assert.match(source, /"--hand-idle-angle": `\$\{handRotation\}deg`/);
  assert.match(
    styles,
    /\.star-card-shell\.is-hand \{[^}]*transform: translateX\(-50%\) rotate\(var\(--hand-idle-angle, 0deg\)\)/,
  );
  assert.match(source, /type PlacementPromptState/);
  assert.match(source, /showPlacementPrompt\("initial"\)/);
  assert.match(source, /showPlacementPrompt\("draw"\)/);
  assert.match(source, /"將卡牌自由分配到任一個戰區中"/);
  assert.match(source, /"將卡牌拖曳到其中一個戰區"/);
  assert.match(source, /dismissPlacementPrompt\(\);[\s\S]*setNavigationMode\("pointer"\)/);
  assert.match(styles, /\.star-cards-placement-prompt \{[\s\S]*star-cards-placement-prompt-fade-in 1s/);
  assert.match(styles, /\.star-cards-placement-prompt\.is-exiting \{[\s\S]*star-cards-placement-prompt-fade-out 1s/);
  assert.match(styles, /\.star-cards-placement-prompt span \{[\s\S]*star-cards-placement-prompt-breathe 1\.25s/);
  assert.match(
    styles,
    /\.star-cards-placement-prompt span \{[\s\S]*border: 0;[\s\S]*transparent 0%[\s\S]*transparent 100%/,
  );
  assert.match(
    styles,
    /\.star-cards-drop-feedback span \{[\s\S]*border: 0;[\s\S]*background: none;[\s\S]*box-shadow: none/,
  );
  assert.match(
    styles,
    /\.star-cards-drop-feedback span::before \{[\s\S]*inset: 2px -2px;[\s\S]*transparent 0%[\s\S]*rgba\(61, 9, 25, 0\.9\) 50%[\s\S]*transparent 100%[\s\S]*filter: blur\(2px\)/,
  );
  assert.match(
    styles,
    /\.star-cards-score\.is-ai \.is-ai-score \{[\s\S]*0 0 4px[\s\S]*0 0 10px/,
  );
  assert.match(styles, /@keyframes star-cards-placement-prompt-fade-in/);
  assert.match(styles, /@keyframes star-cards-placement-prompt-fade-out/);
  assert.match(styles, /@keyframes star-cards-placement-prompt-breathe/);
  assert.match(source, /hand\?\.drawCard[\s\S]*\? 7\.1[\s\S]*PLAYER_HAND_BOTTOM/);
  assert.match(styles, /bottom: var\(--hand-bottom, 7\.1%\)/);
  assert.match(source, /laneContainsDraggingCard/);
  assert.match(source, /is-drag-source/);
  assert.match(styles, /\.star-cards-lane\.is-drag-source \{ z-index: 255; \}/);
  assert.match(source, /starCardsAssetUrl\("drop-lane-highlight\.png"\)/);
  assert.match(source, /starCardsAssetUrl\(`zone-\$\{laneIndex \+ 1\}\.png`\)/);
  assert.match(source, /const pendingHandPlacementPhase =[\s\S]*phase === "initial-placement" \|\| phase === "draw-placement" \? phase : null/);
  assert.match(source, /shouldAnimateStarCardsZone\([\s\S]*pendingHandPlacementPhase,[\s\S]*playerHand\.length,[\s\S]*laneCards\.length/);
  assert.match(source, /zonePlacementTweenActive \? " is-placement-active" : " is-placement-inactive"/);
  assert.doesNotMatch(source, /activatedPlayerLanes|has-been-used/);
  assert.match(
    styles,
    /\.star-cards-zone-title {[\s\S]*top: 18\.913%;[\s\S]*left: calc\(50% \+ var\(--card-idle-x, 0px\) \+ var\(--zone-title-offset-x, 0px\)\)[\s\S]*width: 55\.44%;[\s\S]*pointer-events: none/,
  );
  assert.match(styles, /data-lane="A"[^}]*--zone-title-offset-x: 1\.787cqw/);
  assert.match(styles, /data-lane="B"[^}]*--zone-title-offset-x: -0\.211cqw/);
  assert.match(styles, /data-lane="C"[^}]*--zone-title-offset-x: -1\.535cqw/);
  assert.match(
    styles,
    /\.star-cards-zone-title\.is-placement-active \.is-echo \{[\s\S]*animation: star-cards-zone-title-teleport 2s ease-out infinite/,
  );
  assert.match(styles, /\.star-cards-zone-title\.is-placement-active \.is-second \{[\s\S]*animation-delay: -1s/);
  assert.match(
    styles,
    /\.star-cards-zone-title\.is-placement-inactive \.is-main \{[\s\S]*star-cards-zone-title-settle 1s ease-out both/,
  );
  assert.match(styles, /@keyframes star-cards-zone-title-teleport[\s\S]*translateY\(-34px\)[\s\S]*opacity: 0/);
  assert.match(styles, /@keyframes star-cards-zone-title-settle[\s\S]*opacity: 0\.5;[\s\S]*filter: none/);
  assert.doesNotMatch(source, /star-cards-zone-labels|ZONE \{laneIndex \+ 1\}/);
  assert.doesNotMatch(styles, /\.star-cards-zone-labels/);
  assert.match(source, /const requestedHighlightLane = hoveredLane \?\? directionalLaneHighlight/);
  assert.match(source, /const activeDropHighlightLane = requestedHighlightLane && canPlaceTutorialCard\(phase, requestedHighlightLane, activeTutorialCard\)/);
  assert.match(source, /canPlaceStarCardsTutorialCard\(tutorialActive, currentPhase, lane, card, secondDrawStage\)/);
  assert.match(source, /activeDropHighlightLane \? ` is-\$\{activeDropHighlightLane\.toLowerCase\(\)\}`/);
  assert.match(styles, /\.star-cards-drop-highlight\.is-a[\s\S]*clip-path: inset\(0 62% 0 0\)/);
  assert.match(styles, /\.star-cards-drop-highlight\.is-b[\s\S]*clip-path: inset\(0 38%\)/);
  assert.match(styles, /\.star-cards-drop-highlight\.is-c[\s\S]*clip-path: inset\(0 0 0 62%\)/);
  assert.doesNotMatch(styles, /\.star-cards-lane\.is-drop-hover::before/);
  assert.doesNotMatch(styles, /\.star-cards-lane\.is-drop-hover::after/);
  assert.match(styles, /@keyframes star-cards-drop-zone-pulse/);
  assert.match(source, /}, 2000\)/);
  assert.match(source, /setPhase\("battle-ready"\)/);
  assert.match(source, /compareStarCards/);
  assert.match(source, /placed-draw/);
  assert.match(source, /role="log"/);
  assert.match(source, /setBattleLog/);
  assert.match(source, /setPlayerScore\(\(score\) => score \+ effect\.awardedPoints\)/);
  assert.match(source, /setAiScore\(\(score\) => score \+ effect\.awardedPoints\)/);
  assert.match(source, /type BattleScorePopup/);
  assert.match(source, /setBattleScorePopups\([\s\S]*effect\.outcome === "tie" \? \[\] : \[\{/);
  assert.match(source, /schedule\(\(\) => setBattleScorePopups\(\[\]\), 900\)/);
  assert.match(source, /className=\{`star-cards-score-popup is-\$\{popup\.owner\}`\}/);
  assert.match(source, /\+\{popup\.points\}/);
  assert.match(styles, /@keyframes star-cards-score-panel-bump/);
  assert.match(styles, /@keyframes star-cards-score-number-bump/);
  assert.doesNotMatch(source, /<b>BATTLE LOG<\/b>/);
  assert.match(source, /starCardsAssetUrl\("CardF1\.png"\)/);
  assert.match(styles, /\.star-cards-advantage-panel/);
  assert.match(source, /data-gamepad-selected/);
  assert.match(source, /navigator\.getGamepads/);
  assert.match(source, /initialGamepadMode\?: boolean/);
  assert.match(source, /const \[selectedHandIndex, setSelectedHandIndex\] = useState\(1\)/);
  assert.match(source, /Math\.max\(0, Math\.min\(playerHand\.length - 1, current \+ direction\)\)/);
  assert.match(source, /Math\.max\(0, Math\.min\(STAR_CARD_LANES\.length - 1, current \+ direction\)\)/);
  assert.match(source, /const \[hoveredHandCardId, setHoveredHandCardId\]/);
  assert.match(source, /event\.pointerType !== "mouse"/);
  assert.match(source, /isPreselectedHand \? " is-preselected"/);
  assert.match(source, /data-navigation-mode=\{navigationMode\}/);
  assert.match(source, /echoes:star-cards-cursor/);
  assert.match(source, /className="star-card-selection-motion"/);
  assert.match(source, /const handFloatMotionRef = useRef<Map<string, HandFloatMotion>>/);
  assert.match(source, /preselectedHandCardIdRef\.current = heldCardId \?\?/);
  assert.match(source, /targetRate = cardId === preselectedHandCardIdRef\.current \? 1\.2 : 1/);
  assert.match(source, /\(now - motion\.rateBlendStartedAt\) \/ 280/);
  assert.match(source, /motion\.phase = \(motion\.phase \+ deltaSeconds \* motion\.playbackRate/);
  assert.match(source, /hoverLayer\.style\.transform/);
  assert.match(styles, /\.star-card-shell\.is-hand:not\(\.is-dragging\) \.star-card-hover \{\s*animation: none/);
  assert.match(styles, /\.star-card-hover \{[\s\S]*transition: filter 280ms ease/);
  assert.match(styles, /\.star-card-selection-motion \{[\s\S]*transition: transform 280ms/);
  assert.match(styles, /\.star-card-shell\.is-preselected \.star-card-selection-motion[\s\S]*translateY\(-15px\)/);
  assert.doesNotMatch(styles, /@keyframes star-card-preselected-float/);
  assert.doesNotMatch(styles, /\.star-cards-lane\.is-gamepad-selected::before/);
  assert.match(movementLabSource, /initialGamepadMode=\{starCardsInitialGamepadMode\}/);
  assert.match(movementLabSource, /starCardsOpen \? " is-over-star-cards"/);
  assert.match(movementLabSource, /echoes:star-cards-cursor/);
  assert.match(styles, /@keyframes star-card-deal-player/);
  assert.match(styles, /@keyframes star-card-deal-ai/);
  assert.match(
    styles,
    /@keyframes star-card-deal-ai[\s\S]*100% \{[\s\S]*var\(--card-idle-x, 0px\)/,
  );
  assert.match(styles, /@keyframes star-card-float/);
  assert.match(
    styles,
    /\.star-card-shell\.is-hand \.star-card-hover \{[^}]*drop-shadow\(0 0 8px #fff\)[^}]*drop-shadow\(0 0 15px #43dfff\)[^}]*drop-shadow\(0 0 28px rgba\(73, 255, 218, 0\.72\)\)[^}]*brightness\(1\.1\)/,
  );
  assert.match(source, /const handPreselectionActive =\s*Boolean\(heldCardId\) \|\|/);
  assert.doesNotMatch(styles, /star-card-held-pulse/);
  assert.match(styles, /@keyframes star-card-place-back/);
  assert.match(source, /const STAR_CARD_REVEAL_FRONT_MS = 300/);
  assert.match(source, /const \[revealingFrontCardIds, setRevealingFrontCardIds\] = useState<string\[\]>\(\[\]\)/);
  assert.match(source, /const markCardsRevealingFront = useCallback/);
  assert.match(source, /phase === "revealing" \|\| revealingFrontCardIds\.includes\(card\.id\)/);
  assert.match(source, /isRevealingFront \? " is-revealing-front"/);
  assert.match(
    styles,
    /\.star-card-inner\.is-revealing-front \{[\s\S]*animation: star-card-reveal-front-reverse 300ms/,
  );
  assert.match(
    styles,
    /@keyframes star-card-reveal-front-reverse \{[\s\S]*0% \{ transform: rotateY\(180deg\); \}[\s\S]*100% \{ transform: rotateY\(360deg\); \}/,
  );
  assert.doesNotMatch(
    styles,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.star-card-shell/,
  );
  assert.match(source, /const STAR_CARD_PLACE_FEEDBACK_MS = 320/);
  assert.match(source, /INITIAL_DEAL_AUDIO_DELAYS_MS = \[0, 0, 90, 110, 180, 220\]/);
  assert.match(source, /playStarCardsAudio\("starCardsUiInput"\)/);
  assert.match(source, /playStarCardsAudio\("starCardsCardDealt"\)/);
  assert.match(source, /const INITIAL_REVEAL_STEP_MS = 100/);
  assert.match(
    source,
    /const INITIAL_REVEAL_SEQUENCE = \[[\s\S]*owner: "ai", lane: "A", delaySteps: 0[\s\S]*owner: "ai", lane: "B", delaySteps: 1[\s\S]*owner: "ai", lane: "C", delaySteps: 2[\s\S]*owner: "player", lane: "A", delaySteps: 1[\s\S]*owner: "player", lane: "B", delaySteps: 2[\s\S]*owner: "player", lane: "C", delaySteps: 3/,
  );
  assert.match(
    source,
    /INITIAL_REVEAL_SEQUENCE\.forEach\([\s\S]*playStarCardsAudio\("starCardsCardFlipped"\)[\s\S]*INITIAL_REVEAL_START_MS \+ delaySteps \* INITIAL_REVEAL_STEP_MS/,
  );
  assert.match(source, /INITIAL_REVEAL_FINAL_STEP \* INITIAL_REVEAL_STEP_MS \+ 300/);
  assert.doesNotMatch(source, /playStarCardsAudio\("starCardsCardFlipped", 6\)/);
  assert.match(
    source,
    /hoveredLaneRef\.current !== nextHoveredLane[\s\S]*setHoveredLane\(nextHoveredLane\)[\s\S]*if \(nextHoveredLane\) playStarCardsAudio\("starCardsLaneChanged"\)/,
  );
  assert.match(
    source,
    /const STAR_CARDS_LASER_FIRE_AUDIO_EVENTS = \[[\s\S]*"starCardsLaserFire1"[\s\S]*"starCardsLaserFire7"/,
  );
  assert.match(
    source,
    /const STAR_CARDS_MISSILE_FIRE_AUDIO_EVENTS = \[[\s\S]*"starCardsMissileFire1"[\s\S]*"starCardsMissileFire6"/,
  );
  assert.match(
    source,
    /const STAR_CARDS_SHIELD_ATTACK_AUDIO_EVENTS = \[[\s\S]*"starCardsShieldAttackLayer1"[\s\S]*"starCardsShieldAttackLayer2"/,
  );
  assert.match(
    source,
    /const STAR_CARDS_EXPLOSION_ORIGINAL_AUDIO_EVENTS = \[[\s\S]*"starCardsExplosion1"[\s\S]*"starCardsExplosion8"/,
  );
  assert.match(
    source,
    /const STAR_CARDS_EXPLOSION_FINISH_AUDIO_EVENTS = \[[\s\S]*"starCardsExplosionFinish1"[\s\S]*"starCardsExplosionFinish3"/,
  );
  assert.match(source, /"starCardsExplosionHeavyFinish" as const/);
  assert.match(
    source,
    /const STAR_CARDS_EXPLOSION_AUDIO_EVENTS = \[[\s\S]*\.\.\.STAR_CARDS_EXPLOSION_ORIGINAL_AUDIO_EVENTS[\s\S]*\.\.\.STAR_CARDS_EXPLOSION_FINISH_AUDIO_EVENTS[\s\S]*STAR_CARDS_EXPLOSION_HEAVY_FINISH_AUDIO_EVENT/,
  );
  assert.match(source, /const playAudioSequence = useCallback/);
  assert.match(source, /const playRandomAudioSet = useCallback/);
  assert.match(source, /const playExplosionAudioSet = useCallback/);
  assert.match(source, /const soundCount = 3 \+ Math\.floor\(Math\.random\(\) \* 2\)/);
  assert.match(
    source,
    /elapsedMs \+= intervalMinMs \+[\s\S]*Math\.floor\(Math\.random\(\) \* \(intervalMaxMs - intervalMinMs \+ 1\)\)/,
  );
  assert.match(
    source,
    /Array\.from\([\s\S]*\{ length: soundCount \}[\s\S]*audioPool\[Math\.floor\(Math\.random\(\) \* audioPool\.length\)\]/,
  );
  assert.doesNotMatch(source, /shuffledAudioPool|shuffledBasePool/);
  assert.match(source, /schedule\(\(\) => playStarCardsAudio\(audioEvent\), elapsedMs\)/);
  assert.match(
    source,
    /effect\.attribute === "laser"[\s\S]*playRandomAudioSet\(STAR_CARDS_LASER_FIRE_AUDIO_EVENTS\)/,
  );
  assert.match(
    source,
    /effect\.attribute === "missile"[\s\S]*playRandomAudioSet\(STAR_CARDS_MISSILE_FIRE_AUDIO_EVENTS, 200, 300\)/,
  );
  assert.match(
    source,
    /effect\.attribute === "shield"[\s\S]*STAR_CARDS_SHIELD_ATTACK_AUDIO_EVENTS\.forEach\(\(audioEvent\)[\s\S]*playStarCardsAudio\(audioEvent\)/,
  );
  assert.match(
    source,
    /effect\.outcome === "tie"[\s\S]*playStarCardsAudio\("starCardsTie"\)/,
  );
  assert.match(source, /loserCardPoints: loser\.points/);
  assert.match(
    source,
    /loserCardPoints === 3[\s\S]*STAR_CARDS_EXPLOSION_HEAVY_FINISH_AUDIO_EVENT[\s\S]*STAR_CARDS_EXPLOSION_FINISH_AUDIO_EVENTS/,
  );
  assert.match(
    source,
    /STAR_CARDS_EXPLOSION_AUDIO_EVENTS\[[\s\S]*STAR_CARDS_EXPLOSION_AUDIO_EVENTS\.length[\s\S]*\[\.\.\.leadingAudioEvents, finishAudioEvent\][\s\S]*200,[\s\S]*400/,
  );
  assert.match(
    source,
    /effect\.loserCardId && effect\.loserCardPoints[\s\S]*playExplosionAudioSet\(effect\.loserCardPoints!\)/,
  );
  assert.doesNotMatch(source, /starCardsMissileAttack/);
  assert.match(source, /restart: !overlap/);
  assert.match(source, /\r?\n\s*overlap,\r?\n/);
  assert.match(source, /dropLaneBoundsRef\.current = measureDropLaneBounds\(\)/);
  assert.match(source, /window\.requestAnimationFrame\(\(\) =>/);
  assert.match(source, /queueDragFrame\(\{ x: event\.clientX, y: event\.clientY \}\)/);
  assert.doesNotMatch(source, /setDragging\(\(current\)/);
  assert.match(source, /originX: originBounds\.left \+ originBounds\.width \/ 2/);
  assert.match(source, /originY: originBounds\.top \+ originBounds\.height \/ 2/);
  assert.match(source, /originRotationDeg/);
  assert.match(source, /rotate\(\$\{activeDrag\.originRotationDeg\}deg\)/);
  assert.match(source, /const returnDraggedCardToIdle = useCallback/);
  assert.match(source, /element\.animate\([\s\S]*activeDrag\.originX[\s\S]*activeDrag\.originY[\s\S]*duration: STAR_CARD_REJECT_RETURN_MS/);
  assert.match(source, /laneCardCount >= 3[\s\S]*showFullLaneFeedback\(\)[\s\S]*return false/);
  assert.match(source, /setDropFeedback\(\{ text: "此戰區堆疊已滿", serial \}\)/);
  assert.match(source, /playStarCardsAudio\("interactionDenied"\)/);
  assert.match(source, /STAR_CARD_DROP_FEEDBACK_MS = 1100/);
  assert.match(source, /hand\?\.drawCard && !settledHandCardIds\.includes\(card\.id\)/);
  assert.match(
    source,
    /event\.animationName !== "star-card-deal-player"[\s\S]*setSettledHandCardIds/,
  );
  assert.match(
    styles,
    /\.star-cards-drop-feedback \{[\s\S]*animation: star-cards-drop-feedback 1100ms linear both/,
  );
  assert.match(
    styles,
    /@keyframes star-cards-drop-feedback \{[\s\S]*18\.182% \{ opacity: 1; \}[\s\S]*81\.818% \{ opacity: 1; \}[\s\S]*100% \{ opacity: 0; \}/,
  );
  assert.match(styles, /translate3d\(var\(--drag-x, 0\), var\(--drag-y, 0\), 0\)/);
  assert.match(
    styles,
    /\.star-cards-lane\.is-player-lane \.star-card-shell\.is-placed\.is-dragging \{[^}]*position: fixed;[^}]*top: 0;[^}]*left: 0;[^}]*bottom: auto;/,
  );
  assert.match(styles, /animation: star-card-snap 280ms/);
  assert.match(
    styles,
    /@keyframes star-card-deal-player \{[\s\S]*rotate\(calc\(var\(--hand-idle-angle, 0deg\) \+ 5deg\)\)[\s\S]*rotate\(var\(--hand-idle-angle, 0deg\)\)/,
  );
  assert.match(styles, /\.star-cards-image-button\.is-ready::before[\s\S]*star-cards-button-backlight-pulse/);
  assert.match(styles, /\.star-cards-image-button\.is-ready::after[\s\S]*star-cards-button-glow-sweep/);
  assert.match(
    styles,
    /\.star-cards-image-button\.is-ready::before \{[^}]*z-index: 0;[^}]*inset: 14% 6% 10%;[^}]*filter: blur\(4px\)/,
  );
  assert.match(
    styles,
    /\.star-cards-image-button\.is-ready::after \{[^}]*z-index: 2;[^}]*inset: 0;[^}]*mask: var\(--button-mask\) center \/ 100% 100% no-repeat;[^}]*mix-blend-mode: screen/,
  );
  // 刷光只在按鈕實體上：遮罩用按鈕圖本身，光暈濾鏡掛在 img（不含刷光），按鈕本體不再套光暈濾鏡
  assert.doesNotMatch(styles, /\.star-cards-image-button\.is-ready::after \{[^}]*clip-path/);
  assert.match(styles, /\.star-cards-image-button\.is-ready > img \{\s*animation: star-cards-button-halo-breathe var\(--button-breathe-duration\) var\(--button-breathe-ease\) infinite alternate;/);
  assert.match(styles, /@keyframes star-cards-button-halo-breathe \{[\s\S]*drop-shadow\(0 0 18px var\(--button-halo-far\)\)/);
  assert.doesNotMatch(styles, /\.star-cards-image-button\.is-ready \{[^}]*\sfilter:/);
  assert.match(source, /"--button-mask": `url\("\$\{starCardsAssetUrl\("button-draw\.png"\)\}"\)`/);
  assert.match(source, /"--button-mask": `url\("\$\{starCardsAssetUrl\("button-battle\.png"\)\}"\)`/);
  assert.match(styles, /\.star-cards-image-button\.is-battle\.is-ready[\s\S]*--button-ready-glow: #28dfff/);
  assert.match(styles, /@keyframes star-cards-button-backlight-pulse/);
  assert.match(styles, /@keyframes star-cards-button-glow-sweep[\s\S]*background-position: -60% 0/);
  assert.match(
    styles,
    /\.star-cards-battle-effect\[data-lane="A"\] \{[^}]*--battle-ai-x: -0\.3cqw;[^}]*--battle-player-x: -3\.7cqw;[^}]*--battle-mid-x: -2cqw;[^}]*--battle-player-to-ai-x: 3\.4cqw;[^}]*--battle-ai-to-player-x: -3\.4cqw;[^}]*--battle-angle: 10deg;/,
  );
  assert.match(
    styles,
    /\.star-cards-battle-effect\[data-lane="C"\] \{[^}]*--battle-ai-x: -0\.3cqw;[^}]*--battle-player-x: 2\.4cqw;[^}]*--battle-mid-x: 1\.05cqw;[^}]*--battle-player-to-ai-x: -2\.7cqw;[^}]*--battle-ai-to-player-x: 2\.7cqw;[^}]*--battle-angle: -8deg;/,
  );
  assert.match(
    styles,
    /\.star-cards-battle-effect\.is-player \.star-cards-impact \{[^}]*left: calc\(50% \+ var\(--battle-ai-x\)\)/,
  );
  assert.match(
    styles,
    /\.star-cards-battle-effect\.is-ai \.star-cards-impact \{[^}]*left: calc\(50% \+ var\(--battle-player-x\)\)/,
  );
  // 命中爆炸在遊戲中播放烘焙序列圖（1 個元素）；即時粒子的樣式仍保留給測試頁與烘焙使用
  assert.match(source, /impactSprite: createLaneImpactSprite\(winner\.attribute\)/);
  assert.match(source, /className=\{`star-cards-impact\$\{effect\.impactSprite \? " is-sprite" : ""\}`\}/);
  assert.match(source, /<span className="star-cards-impact-sprite-strip" \/>/);
  assert.match(source, /useEffect\(\(\) => \{ preloadStarCardsImpactSprites\(\); \}, \[\]\);/);
  assert.doesNotMatch(source, /createStarCardsImpactParticleLayout/);
  assert.match(styles, /\.star-cards-impact\.is-sprite::before,\s*\.star-cards-impact\.is-sprite::after \{\s*content: none;/);
  assert.match(styles, /\.star-cards-impact-sprite-strip \{[^}]*animation: star-cards-sprite-play var\(--sprite-duration\) steps\(var\(--sprite-frames\), end\) var\(--impact-start\) both;/);
  assert.match(styles, /@keyframes star-cards-sprite-play \{\s*from \{ transform: translateX\(0\); \}\s*to \{ transform: translateX\(-100%\); \}/);
  for (const kind of ["needle", "droplet", "fireball", "spark", "ember", "debris", "smoke", "shard", "ion", "arc"]) {
    assert.match(styles, new RegExp(`\\.star-cards-impact-particle\\.is-${kind}[ ,{]`), `missing style for ${kind}`);
  }
  for (const weapon of ["laser", "missile", "shield"]) {
    assert.match(styles, new RegExp(`\\.star-cards-battle-effect\\.is-${weapon} \\{[^}]*--impact-hot`));
  }
  assert.match(
    styles,
    /@keyframes star-cards-impact-ballistic[\s\S]*var\(--impact-particle-gravity\)/,
  );
  assert.match(
    styles,
    /@keyframes star-cards-impact-streak[\s\S]*translate\(var\(--impact-particle-x\), var\(--impact-particle-y\)\)/,
  );
  // 攻擊路徑：玩家由下往上，OWEN 同一條線轉 180°
  assert.match(styles, /\.star-cards-attack-path \{[^}]*left: calc\(50% \+ var\(--battle-player-x\)\)[^}]*transform: rotate\(var\(--battle-angle\)\)/);
  assert.match(
    styles,
    /\.star-cards-battle-effect\.is-ai \.star-cards-attack-path \{[^}]*left: calc\(50% \+ var\(--battle-ai-x\)\)[^}]*rotate\(calc\(180deg \+ var\(--battle-angle\)\)\)/,
  );
  assert.match(source, /<span className="star-cards-attack-path">/);
  assert.match(source, /attackParticleLayout: createStarCardsAttackParticleLayout\(winner\.attribute\)/);
  assert.match(source, /className=\{`star-cards-attack-particle is-\$\{particle\.kind\}`\}/);
  for (const kind of ["mote", "smoke", "backblast", "cinder", "flake"]) {
    assert.match(styles, new RegExp(`\\.star-cards-attack-particle\\.is-${kind}[ ,{]`), `missing style for ${kind}`);
  }
  // 雷射：多層剖面、流動條紋與螺旋紋
  assert.match(styles, /@keyframes star-cards-laser-beam/);
  assert.match(styles, /@keyframes star-cards-laser-flow/);
  assert.match(styles, /@keyframes star-cards-laser-helix \{[^}]*\}[^}]*to \{ background-position: 0 calc\(var\(--fx-laser-helix-pitch\) \* -1cqw\); \}/);
  // 雷射螺旋纏繞線間距可調，捲動時間跟著間距等比例
  assert.match(styles, /\.star-cards-battle-layer \{[^}]*--fx-laser-helix-pitch: 8\.5;/);
  assert.match(styles, /100% calc\(var\(--fx-laser-helix-pitch\) \* 1cqw\) repeat-y/);
  assert.match(styles, /animation: star-cards-laser-helix calc\(var\(--fx-laser-helix-pitch\) \* 65ms\) linear infinite;/);
  // 飛彈：金屬彈體＋尾焰，尾隨飛彈從散射位置收攏
  assert.match(styles, /\.is-missile:not\(\.is-tie\) \.star-cards-attack-core::before,[\s\S]*clip-path: polygon\(50% 0/);
  assert.match(styles, /@keyframes star-cards-missile-flight[\s\S]*71\.43% \{[^}]*bottom: 100%/);
  assert.match(styles, /@keyframes star-cards-missile-escort[\s\S]*var\(--battle-spark-offset\)[\s\S]*var\(--battle-missile-depth-offset\)/);
  assert.match(styles, /@keyframes star-cards-missile-flame/);
  assert.match(source, /missileTrailLayout: winner\.attribute === "missile"[\s\S]*createStarCardsMissileTrailLayout\(Math\.random, missileCounts\.escort\)/);
  assert.match(source, /"--battle-spark-offset": `\$\{trail\.lateralOffsetVw\}cqw`/);
  assert.match(source, /"--battle-missile-depth-offset": `\$\{trail\.depthOffsetCqh\}cqh`/);
  assert.match(source, /"--escort-launch": trail\.launchFraction/);
  // 飛行速度與齊射總時間：可調參數；抵達時間、主爆炸、尾隨彈與落點爆炸、沿途煙塵都跟著同步
  // 2026-10-22 在 3065 測試頁定案的數值
  assert.match(styles, /\.star-cards-battle-layer \{[^}]*--fx-laser-bullet-scale: 1\.7;[^}]*--fx-laser-hit-scale: 2\.4;[^}]*--fx-missile-bullet-scale: 1\.7;[^}]*--fx-missile-hit-scale: 2;[^}]*--fx-shield-bullet-scale: 1\.5;[^}]*--fx-shield-hit-scale: 2\.4;/);
  assert.match(styles, /--fx-missile-scatter: 4cqw;/);
  assert.match(styles, /--fx-missile-speed: 0\.5;/);
  assert.match(styles, /--fx-missile-salvo: 680ms;/);
  // 飛彈數量：寫在 battle layer 的 CSS 變數，開打時讀取；多顆主飛彈以 --main-offset 並排
  assert.match(styles, /\.star-cards-battle-layer \{[^}]*--fx-missile-main-count: 1;[^}]*--fx-missile-escort-count: 5;/);
  assert.equal(STAR_CARDS_MISSILE_ESCORT_COUNT, 5, "TS 備用預設值需與 CSS 一致");
  // 只有飛彈特效延後移除：等主爆炸序列圖與最後一顆尾隨彈落點爆炸播完（最晚 2900ms，下一輪 DRAW 在 2950ms）
  assert.match(source, /const BATTLE_EFFECTS_CLEANUP_MS = 2050;/);
  assert.match(source, /const BATTLE_EFFECTS_MAX_LINGER_MS = 2900;/);
  assert.match(source, /missileTiming\.arriveMs \+ STAR_CARDS_IMPACT_SPRITES\.missile\.durationMs/);
  assert.match(source, /missileTiming\.salvoMs \+ missileTiming\.arriveMs \+ STAR_CARDS_ESCORT_BLAST_MS/);
  assert.match(source, /const lingeringMissiles = batch\.filter\(\(effect\) => effect\.attribute === "missile" && effect\.outcome !== "tie"\);/);
  assert.match(source, /setBattleEffects\(lingeringMissiles\);[\s\S]*?schedule\(\(\) => \{\s*setBattleEffects\(\(current\) => current\.filter\(\(effect\) => !lingeringMissiles\.includes\(effect\)\)\);\s*\}, missileEffectsEndMs - BATTLE_EFFECTS_CLEANUP_MS\);/);
  assert.match(styles, /star-cards-escort-blast 320ms ease-out/);
  assert.match(source, /const missileCounts = readStarCardsMissileCounts\(battleLayerRef\.current\);/);
  assert.match(source, /createStarCardsMissileTrailLayout\(Math\.random, missileCounts\.escort\)/);
  assert.match(source, /getStarCardsMissileMainOffsets\(missileCounts\.main\)/);
  assert.match(source, /style=\{\{ "--main-offset": offset \} as StarCardStyle\}/);
  assert.match(styles, /@keyframes star-cards-missile-flight \{[\s\S]*?71\.43% \{[^}]*left: calc\(var\(--main-spread, 0px\) \* 0\.25\)/);
  assert.match(styles, /\.star-cards-battle-effect\.is-missile \{[^}]*--missile-arrive: calc\(300ms \/ var\(--fx-missile-speed, 1\)\);[^}]*--impact-start: var\(--missile-arrive\);/);
  assert.match(styles, /--escort-delay: calc\(var\(--escort-launch\) \* var\(--fx-missile-salvo\)\);/);
  assert.match(styles, /star-cards-missile-flight calc\(var\(--missile-arrive\) \* 1\.4\) linear both/);
  assert.match(styles, /star-cards-missile-escort calc\(var\(--missile-arrive\) \* 1\.4\) linear var\(--escort-delay\) both/);
  assert.match(styles, /star-cards-escort-blast 320ms ease-out calc\(var\(--escort-delay\) \+ var\(--missile-arrive\)\) both/);
  assert.match(styles, /\.is-missile \.star-cards-attack-particle \{\s*animation-delay: calc\(var\(--attack-delay\) \/ var\(--fx-missile-speed, 1\)\);/);
  assert.match(source, /"--escort-scatter-x": trail\.impactScatterX/);
  assert.match(source, /<span className="star-cards-escort-blast" style=\{escortStyle\} \/>/);
  // 尾隨彈落點散布：可調參數，落點與小爆炸位置都讀同一組變數
  assert.match(styles, /@keyframes star-cards-missile-escort[\s\S]*71\.43% \{[^}]*var\(--escort-scatter-x\) \* var\(--fx-missile-scatter\)/);
  assert.match(styles, /\.star-cards-escort-blast \{[\s\S]*left: calc\(var\(--escort-scatter-x\) \* var\(--fx-missile-scatter\)\)/);
  // 雷射命中是持續燒灼：開始時間跟著光束到達，脈動核心＋三次熱浪＋灼痕
  assert.equal(STAR_CARDS_IMPACT_START_MS.laser, 200);
  assert.ok(STAR_CARDS_IMPACT_START_MS.laser >= STAR_CARDS_ATTACK_CURVES.laser.at(-1)[0] - 5);
  assert.match(styles, /\.star-cards-battle-effect\.is-laser \{\s*--impact-start: 200ms;/);
  assert.match(styles, /\.is-laser \.star-cards-impact::before \{\s*animation: star-cards-laser-burn-core 420ms linear var\(--impact-start\) both;/);
  assert.match(styles, /\.is-laser \.star-cards-impact::after \{\s*animation: star-cards-laser-burn-ring 140ms ease-out var\(--impact-start\) 3 both;/);
  assert.match(styles, /@keyframes star-cards-laser-scorch/);
  // 護盾：六角格半球
  assert.match(source, /function StarCardsShieldDome\(\)[\s\S]*useId\(\)[\s\S]*feGaussianBlur[\s\S]*STAR_CARDS_SHIELD_DOME_CELLS\.map/);
  assert.match(source, /filter=\{cell\.isEdge \? `url\(#\$\{id\}-soft\)` : undefined\}/);
  // 護盾在發射方原地展開，不飛向對方：關鍵影格只有縮放，沒有 bottom 位移
  assert.match(styles, /\.is-shield:not\(\.is-tie\) \.star-cards-attack-core \{[^}]*--dome-base: 3\.5cqw;[^}]*--dome-tilt: calc\(-1 \* var\(--battle-angle\)\);/);
  // 不朝向目標：每個關鍵影格都先抵銷路徑傾斜
  const domeFrames = styles.match(/@keyframes star-cards-shield-dome \{[\s\S]*?\n\}/)[0].match(/transform: [^;]+;/g);
  assert.ok(domeFrames.length >= 5 && domeFrames.every((frame) => frame.startsWith("transform: rotate(var(--dome-tilt))")));
  assert.match(styles, /\.is-shield\.is-ai \.star-cards-attack-core \{[^}]*--dome-base: -1\.2cqw;[^}]*--dome-card-scale: 0\.89;/);
  assert.match(styles, /@keyframes star-cards-shield-dome \{[\s\S]*?scale\(0\.15\)[\s\S]*?\n\}/);
  assert.doesNotMatch(styles.match(/@keyframes star-cards-shield-dome \{[\s\S]*?\n\}/)[0], /bottom:/);
  assert.match(styles, /\.star-cards-shield-cell \{[\s\S]*star-cards-shield-cell-launch[\s\S]*star-cards-shield-cell-hit/);
  // 平手不吃武器樣式：三種武器共用同一個撞擊環
  // 平手衝擊波：三種武器共用，位置在兩張牌正中間（特效框 38.5%），可整體縮放
  // 遊戲中平手：氣壓波即時播放，其餘播烘焙序列圖，任意角度旋轉
  assert.match(source, /effect\.outcome === "tie" \? \(\s*effect\.tieSprite \? <StarCardsTieShock sprite=\{effect\.tieSprite\} \/> : null/);
  assert.match(source, /tieSprite: createTieSprite\(\)/);
  assert.match(source, /function StarCardsTieShock[\s\S]*?<span className="star-cards-tie-wave" \/>[\s\S]*?className="star-cards-impact-sprite is-tie"/);
  assert.match(source, /createStarCardsImpactSpriteChoice\(STAR_CARDS_TIE_SPRITE\.files\.length, Math\.random, STAR_CARDS_TIE_SPRITE_ROTATE_DEG\)/);
  assert.match(styles, /\.star-cards-impact-sprite\.is-tie \{\s*--impact-start: 0ms;/);
  assert.match(styles, /\.star-cards-tie-shock \{[^}]*top: 38\.5%;[^}]*left: calc\(50% \+ var\(--battle-mid-x\)\);[^}]*scale: var\(--fx-tie-scale, 1\);/);
  assert.match(styles, /\.star-cards-battle-layer \{[^}]*--fx-tie-scale: 1;/);
  for (const part of ["flash", "puff", "ring", "wave"]) {
    assert.match(styles, new RegExp(`@keyframes star-cards-tie-${part} \\{`), `missing tie ${part}`);
  }
  // 白色氣爆：衝擊環擴散時逐漸模糊淡出，氣壓波扭曲背景，不再有整齊的放射光芒與彩色
  assert.match(styles, /@keyframes star-cards-tie-ring \{[\s\S]*?100% \{[^}]*opacity: 0; filter: blur\(0\.6cqw\)/);
  assert.match(styles, /\.star-cards-tie-wave \{[^}]*backdrop-filter: blur\(0\.35cqw\) brightness\(1\.25\);/);
  assert.doesNotMatch(styles, /star-cards-tie-rays|is-tie-spark:nth-child/);
  // 放射狀：衝擊環與氣壓波是正圓，沒有上下對衝與左右光跡
  assert.match(styles, /\.star-cards-tie-ring \{[^}]*aspect-ratio: 1;/);
  assert.match(styles, /\.star-cards-tie-wave \{[^}]*aspect-ratio: 1;/);
  assert.doesNotMatch(styles, /star-cards-tie-(clash|charge|flare|streak)/);
  assert.match(
    styles,
    /\.star-cards-score-popup \{[\s\S]*text-shadow: none;[\s\S]*animation: star-cards-score-popup 900ms linear both/,
  );
  assert.match(styles, /\.star-cards-score-popup\.is-player \{ top: 51\.6%; \}/);
  assert.match(styles, /\.star-cards-score-popup\.is-ai \{[\s\S]*top: 43\.2%;[\s\S]*color: #ff4d43/);
  assert.match(styles, /\.star-cards-score-popup\.is-player\[data-lane="A"\] \{ left: 25\.9%; \}/);
  assert.match(styles, /\.star-cards-score-popup\.is-player\[data-lane="C"\] \{ left: 72\.9%; \}/);
  assert.match(styles, /\.star-cards-score-popup\.is-ai\[data-lane="A"\] \{ left: 26\.5%; \}/);
  assert.match(styles, /\.star-cards-score-popup\.is-ai\[data-lane="C"\] \{ left: 72\.7%; \}/);
  assert.match(styles, /@keyframes star-cards-score-popup[\s\S]*22\.222%[\s\S]*77\.778%/);
  assert.match(styles, /@keyframes star-card-destroy/);
  assert.match(
    styles,
    /\.star-card-shell\.is-destroying \.star-card-hover \{[^}]*animation: star-card-destroy 760ms/,
  );
  assert.match(
    styles,
    /@keyframes star-card-destroy \{[\s\S]*0% \{[^}]*translateY\(0\) scale\(1\) rotate\(0\)[\s\S]*100% \{[^}]*translateY\(24px\) scale\(0\.42\) rotate\(12deg\)/,
  );
  assert.doesNotMatch(styles, /star-cards-shield-sweep|star-cards-shield-rim/);
  // 六角片之間沒有接縫線：平常 stroke-width 為 0，只在點亮瞬間出現自己外緣的光邊
  assert.match(styles, /\.star-cards-shield-cell \{[^}]*stroke-width: 0;/);
  assert.match(styles, /@keyframes star-cards-log-line-in/);
  assert.match(styles, /--opponent-card-idle-y: 3\.13cqh/);
  assert.match(styles, /is-ai-lane\[data-lane="A"\] \{ --card-idle-x: -0\.3cqw; \}/);
  assert.match(styles, /is-ai-lane\[data-lane="B"\] \{ --card-idle-x: -0\.5cqw; \}/);
  assert.match(styles, /is-ai-lane\[data-lane="C"\] \{ --card-idle-x: -0\.3cqw; \}/);
  assert.match(styles, /--player-card-idle-y: 1\.3cqh/);
  assert.match(styles, /is-player-lane\[data-lane="A"\] \{[^}]*--card-idle-x: -3\.7cqw/);
  assert.match(styles, /is-player-lane\[data-lane="B"\] \{[^}]*--card-idle-x: -0\.5cqw/);
  assert.match(styles, /is-player-lane\[data-lane="C"\] \{[^}]*--card-idle-x: 2\.4cqw/);
  assert.match(styles, /width: min\(13\.528cqw, 24\.03cqh\)/);
  assert.match(styles, /translateX\(calc\(-50% \+ var\(--card-idle-x, 0px\)\)\)/);
  assert.match(source, /stackDepth: laneCards\.length - stackIndex - 1/);
  assert.match(source, /Math\.max\(0\.94, 1 - stackDepth \* 0\.02\)/);
  assert.match(source, /stackInwardDirection \* stackDepth \* 0\.36/);
  assert.match(
    styles,
    /\.star-card-shell\.is-placed \{[^}]*translateX\(var\(--stack-inward-x, 0px\)\)[^}]*scale\(var\(--stack-scale, 1\)\)[^}]*transform-origin: top center/,
  );
  assert.match(styles, /\.star-card-shell\.is-dragging \{[^}]*transition: none/);
  assert.match(styles, /aspect-ratio: 380 \/ 475/);
  assert.match(styles, /\.star-cards-dialog button:focus-visible[\s\S]*outline: none/);
});

test("all StarCards runtime assets are present", () => {
  const assetRoot = new URL("../public/ui/star-cards/", import.meta.url);
  for (const name of [
    "card-bg-2.png",
    "drop-lane-highlight.png",
    "card-back.png",
    "button-draw.png",
    "button-battle.png",
    "button-stack.png",
    "score-panel.png",
    "match-wins-panel.png",
    "Player_Up.png",
    "Player_Down.png",
    "CardF1.png",
    "zone-1.png",
    "zone-2.png",
    "zone-3.png",
    "b-1.png",
    "b-2.png",
    "b-3.png",
    "shield2.png",
    "missile2.png",
    "laser2.png",
    ...STAR_CARD_DECK.map((card) => card.image.split("/").at(-1)),
  ]) {
    assert.equal(existsSync(new URL(name, assetRoot)), true, `${name} should exist`);
  }
});

test("effect sprite sheets: three impact variants per weapon and one tie air-burst", () => {
  const assetRoot = new URL("../public/ui/star-cards/", import.meta.url);
  const entries = [
    ...["laser", "missile", "shield"].map((attribute) => [STAR_CARDS_IMPACT_SPRITES[attribute], 3]),
    [STAR_CARDS_TIE_SPRITE, 1],
  ];
  for (const [sprite, variants] of entries) {
    assert.equal(sprite.files.length, variants);
    assert.ok(sprite.frames >= 10 && sprite.frames <= 60);
    assert.equal(sprite.durationMs, Math.round(sprite.frames * 1000 / sprite.fps));
    assert.ok(sprite.boxCqw > 4 && sprite.boxCqw < 40);
    for (const file of sprite.files) {
      const bytes = readFileSync(new URL(file, assetRoot));
      assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", `${file} should be a WebP`);
      assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", `${file} should be a WebP`);
      // VP8X 擴充格式才有 alpha（透明背景）
      assert.equal(bytes.subarray(12, 16).toString("ascii"), "VP8X", `${file} should carry alpha`);
      assert.ok(bytes.length < 800 * 1024, `${file} is too large (${bytes.length} bytes)`);
    }
  }
});

test("impact sprite choice randomizes variant, mirror, small rotation, and size", () => {
  const seen = { variants: new Set(), flips: new Set() };
  for (const values of [[0, 0, 0, 0], [0.5, 0.7, 0.5, 0.5], [0.99, 0.2, 1, 1], [0.4, 0.9, 0.25, 0.75]]) {
    let index = 0;
    const choice = createStarCardsImpactSpriteChoice(3, () => values[index++]);
    assert.ok(Number.isInteger(choice.variant) && choice.variant >= 0 && choice.variant < 3);
    assert.ok(Math.abs(choice.rotateDeg) <= STAR_CARDS_IMPACT_SPRITE_JITTER.rotateDeg);
    assert.ok(choice.scale >= 0.9 && choice.scale <= 1.1);
    seen.variants.add(choice.variant);
    seen.flips.add(choice.flipX);
  }
  assert.equal(seen.variants.size, 3);
  assert.equal(seen.flips.size, 2);
});
