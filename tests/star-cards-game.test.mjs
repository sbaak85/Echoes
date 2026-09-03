import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  STAR_CARD_DECK,
  STAR_CARD_LANES,
  STAR_CARDS_DEBUG_NUMBER,
  STAR_CARDS_GAME_ID,
  STAR_CARDS_IMPACT_PARTICLE_COUNT,
  canPlaceStarCard,
  compareStarCards,
  createStarCardsImpactParticleLayout,
  createStarCardsMissileTrailLayout,
  getStarCardBattleScore,
  shuffleStarCardDeck,
} from "../app/star-cards-game.ts";

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

test("missile trails randomize lateral position, depth, and flight phase per attack", () => {
  const values = [
    0.05, 0.8, 0.1,
    0.75, 0.15, 0.65,
    0.45, 0.55, 0.95,
  ];
  let index = 0;
  const layout = createStarCardsMissileTrailLayout(() => values[index++]);
  assert.deepEqual(layout, [
    { lateralOffsetVw: -1.3, depthOffsetCqh: 2.04, animationDelayMs: -390 },
    { lateralOffsetVw: 0.72, depthOffsetCqh: -2.38, animationDelayMs: -170 },
    { lateralOffsetVw: -0.15, depthOffsetCqh: 0.34, animationDelayMs: -50 },
  ]);
  for (const trail of layout) {
    assert.ok(trail.lateralOffsetVw >= -1.45 && trail.lateralOffsetVw <= 1.45);
    assert.ok(trail.depthOffsetCqh >= -3.4 && trail.depthOffsetCqh <= 3.4);
    assert.ok(trail.animationDelayMs >= -430 && trail.animationDelayMs <= -30);
  }
  for (let first = 0; first < layout.length; first += 1) {
    for (let second = first + 1; second < layout.length; second += 1) {
      assert.ok(
        Math.abs(layout[first].lateralOffsetVw - layout[second].lateralOffsetVw) >= 0.42 ||
        Math.abs(layout[first].depthOffsetCqh - layout[second].depthOffsetCqh) >= 0.9,
      );
    }
  }

  const alternateValues = [
    0.9, 0.75, 0.2,
    0.2, 0.25, 0.6,
    0.6, 0.95, 0.85,
  ];
  let alternateIndex = 0;
  const alternateLayout = createStarCardsMissileTrailLayout(
    () => alternateValues[alternateIndex++],
  );
  assert.notDeepEqual(alternateLayout, layout);
});

test("impact particles randomize around a ring while every particle points radially outward", () => {
  const values = [0, 0.25, 0.5, 0.75, 1];
  let index = 0;
  const layout = createStarCardsImpactParticleLayout(
    () => values[index++ % values.length],
  );

  assert.equal(STAR_CARDS_IMPACT_PARTICLE_COUNT, 24);
  assert.equal(layout.length, STAR_CARDS_IMPACT_PARTICLE_COUNT);
  assert.deepEqual(layout[0], {
    offsetXCqw: 6.98,
    offsetYCqh: -3.71,
    angleDeg: 62,
    animationDelayMs: 55,
    animationDurationMs: 830,
  });
  for (const particle of layout) {
    assert.ok(Math.hypot(particle.offsetXCqw, particle.offsetYCqh) >= 6.79);
    assert.ok(Math.hypot(particle.offsetXCqw, particle.offsetYCqh) <= 11.21);
    assert.ok(particle.animationDelayMs >= 0 && particle.animationDelayMs <= 110);
    assert.ok(particle.animationDurationMs >= 620 && particle.animationDurationMs <= 900);
    const travelDirectionDeg = (
      Math.atan2(particle.offsetYCqh, particle.offsetXCqw) * 180 / Math.PI + 360
    ) % 360;
    const particleDirectionDeg = (particle.angleDeg - 90 + 360) % 360;
    const directionDifference = Math.abs(
      ((travelDirectionDeg - particleDirectionDeg + 540) % 360) - 180,
    );
    assert.ok(directionDifference < 0.1);
  }
});

test("initial placement requires an empty lane while the drawn card may stack", () => {
  assert.equal(canPlaceStarCard("initial-placement", 0), true);
  assert.equal(canPlaceStarCard("initial-placement", 1), false);
  assert.equal(canPlaceStarCard("draw-placement", 1), true);
  assert.equal(canPlaceStarCard("draw-placement", 2), true);
  assert.equal(canPlaceStarCard("draw-placement", 3), false);
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
  assert.match(source, /STAR_CARDS_WINS_TO_MATCH = 3/);
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
  assert.match(source, /const \[activatedPlayerLanes, setActivatedPlayerLanes\] = useState<StarCardLane\[]>\(\[\]\)/);
  assert.match(source, /setActivatedPlayerLanes\(\(current\) =>[\s\S]*current\.includes\(lane\)/);
  assert.match(source, /setActivatedPlayerLanes\(\[\]\)/);
  assert.match(source, /starCardsAssetUrl\(`zone-\$\{laneIndex \+ 1\}\.png`\)/);
  assert.match(source, /activatedPlayerLanes\.includes\(lane\) \? " has-been-used"/);
  assert.match(
    styles,
    /\.star-cards-zone-title {[\s\S]*top: 18\.913%;[\s\S]*left: calc\(50% \+ var\(--card-idle-x, 0px\) \+ var\(--zone-title-offset-x, 0px\)\)[\s\S]*width: 55\.44%;[\s\S]*pointer-events: none/,
  );
  assert.match(styles, /data-lane="A"[^}]*--zone-title-offset-x: 1\.787vw/);
  assert.match(styles, /data-lane="B"[^}]*--zone-title-offset-x: -0\.211vw/);
  assert.match(styles, /data-lane="C"[^}]*--zone-title-offset-x: -1\.535vw/);
  assert.match(
    styles,
    /\.star-cards-zone-title \.is-echo \{[\s\S]*animation: star-cards-zone-title-teleport 2s ease-out infinite/,
  );
  assert.match(styles, /\.star-cards-zone-title \.is-second \{[\s\S]*animation-delay: -1s/);
  assert.match(
    styles,
    /\.star-cards-zone-title\.has-been-used \.is-main \{[\s\S]*star-cards-zone-title-settle 1s ease-out both/,
  );
  assert.match(styles, /@keyframes star-cards-zone-title-teleport[\s\S]*translateY\(-34px\)[\s\S]*opacity: 0/);
  assert.match(styles, /@keyframes star-cards-zone-title-settle[\s\S]*opacity: 0\.5;[\s\S]*filter: none/);
  assert.doesNotMatch(source, /star-cards-zone-labels|ZONE \{laneIndex \+ 1\}/);
  assert.doesNotMatch(styles, /\.star-cards-zone-labels/);
  assert.match(source, /const activeDropHighlightLane = hoveredLane \?\? directionalLaneHighlight/);
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
    /\.star-cards-image-button\.is-ready::after \{[^}]*z-index: 2;[^}]*inset: 8% 5%;[^}]*mix-blend-mode: screen/,
  );
  assert.match(styles, /\.star-cards-image-button\.is-battle\.is-ready[\s\S]*--button-ready-glow: #28dfff/);
  assert.match(styles, /@keyframes star-cards-button-backlight-pulse/);
  assert.match(styles, /@keyframes star-cards-button-glow-sweep[\s\S]*background-position: -75% 0/);
  assert.match(
    styles,
    /\.star-cards-battle-effect\[data-lane="A"\] \{[^}]*--battle-ai-x: -0\.3vw;[^}]*--battle-player-x: -3\.7vw;[^}]*--battle-mid-x: -2vw;[^}]*--battle-player-to-ai-x: 3\.4vw;[^}]*--battle-ai-to-player-x: -3\.4vw;[^}]*--battle-angle: 10deg;/,
  );
  assert.match(
    styles,
    /\.star-cards-battle-effect\[data-lane="C"\] \{[^}]*--battle-ai-x: -0\.3vw;[^}]*--battle-player-x: 2\.4vw;[^}]*--battle-mid-x: 1\.05vw;[^}]*--battle-player-to-ai-x: -2\.7vw;[^}]*--battle-ai-to-player-x: 2\.7vw;[^}]*--battle-angle: -8deg;/,
  );
  assert.match(
    styles,
    /\.star-cards-battle-effect\.is-player \.star-cards-impact \{[^}]*left: calc\(50% \+ var\(--battle-ai-x\)\)/,
  );
  assert.match(
    styles,
    /\.star-cards-battle-effect\.is-ai \.star-cards-impact \{[^}]*left: calc\(50% \+ var\(--battle-player-x\)\)/,
  );
  assert.match(
    source,
    /effect\.outcome !== "tie"[\s\S]*star-cards-impact-particles[\s\S]*effect\.impactParticleLayout\?\.map/,
  );
  assert.match(
    styles,
    /\.star-cards-impact-particle \{[\s\S]*linear-gradient\(180deg, #fffbd0 0%, #ffd84c 38%, #ff9d00 100%\)[\s\S]*star-cards-impact-gold-particle/,
  );
  assert.match(source, /impactParticleLayout: createStarCardsImpactParticleLayout\(\)/);
  assert.match(styles, /width: clamp\(4px, 0\.32cqw, 8px\)/);
  assert.match(styles, /height: clamp\(14px, 1\.36cqh, 26px\)/);
  assert.match(
    styles,
    /@keyframes star-cards-impact-gold-particle[\s\S]*translate\(var\(--impact-particle-x\), var\(--impact-particle-y\)\)/,
  );
  assert.match(styles, /@keyframes star-cards-laser-player[\s\S]*rotate\(var\(--battle-angle\)\)/);
  assert.match(styles, /@keyframes star-cards-laser-ai[\s\S]*rotate\(var\(--battle-angle\)\)/);
  assert.match(
    styles,
    /@keyframes star-cards-missile-player[\s\S]*var\(--battle-player-to-ai-x\)/,
  );
  assert.match(
    styles,
    /@keyframes star-cards-missile-ai[\s\S]*var\(--battle-ai-to-player-x\)/,
  );
  assert.match(styles, /@keyframes star-cards-missile-sparks-player/);
  assert.match(styles, /@keyframes star-cards-missile-sparks-ai/);
  assert.match(
    styles,
    /\.star-cards-battle-effect\.is-missile \.star-cards-attack-trail \{[\s\S]*width: 12px;[\s\S]*height: 24px;[\s\S]*border-radius: 70% 70% 30% 30%/,
  );
  assert.match(
    styles,
    /@keyframes star-cards-missile-sparks-player \{[\s\S]*0% \{[^}]*scale\(1\)[^}]*\}[\s\S]*100% \{[^}]*scale\(1\)[^}]*\}/,
  );
  assert.match(
    styles,
    /@keyframes star-cards-missile-sparks-ai \{[\s\S]*0% \{[^}]*scale\(1\)[^}]*\}[\s\S]*100% \{[^}]*scale\(1\)[^}]*\}/,
  );
  assert.doesNotMatch(
    styles,
    /\.star-cards-battle-effect\.is-missile \.is-(?:one|two|three) \{/,
  );
  assert.match(source, /missileTrailLayout: winner\.attribute === "missile"[\s\S]*createStarCardsMissileTrailLayout\(\)/);
  assert.match(
    source,
    /"--battle-spark-offset":[\s\S]*effect\.missileTrailLayout\[index\]\.lateralOffsetVw/,
  );
  assert.match(
    source,
    /"--battle-missile-depth-offset":[\s\S]*effect\.missileTrailLayout\[index\]\.depthOffsetCqh/,
  );
  assert.match(
    source,
    /animationDelay:[\s\S]*effect\.missileTrailLayout\[index\]\.animationDelayMs/,
  );
  assert.match(
    styles,
    /@keyframes star-cards-missile-sparks-player \{[\s\S]*calc\(12% \+ var\(--battle-missile-depth-offset\)\)[\s\S]*calc\(80% \+ var\(--battle-missile-depth-offset\)\)/,
  );
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
  assert.match(styles, /@keyframes star-cards-shield-surge/);
  assert.match(styles, /@keyframes star-cards-log-line-in/);
  assert.match(styles, /--opponent-card-idle-y: 3\.13vh/);
  assert.match(styles, /is-ai-lane\[data-lane="A"\] \{ --card-idle-x: -0\.3vw; \}/);
  assert.match(styles, /is-ai-lane\[data-lane="B"\] \{ --card-idle-x: -0\.5vw; \}/);
  assert.match(styles, /is-ai-lane\[data-lane="C"\] \{ --card-idle-x: -0\.3vw; \}/);
  assert.match(styles, /--player-card-idle-y: 1\.3vh/);
  assert.match(styles, /is-player-lane\[data-lane="A"\] \{[^}]*--card-idle-x: -3\.7vw/);
  assert.match(styles, /is-player-lane\[data-lane="B"\] \{[^}]*--card-idle-x: -0\.5vw/);
  assert.match(styles, /is-player-lane\[data-lane="C"\] \{[^}]*--card-idle-x: 2\.4vw/);
  assert.match(styles, /width: min\(13\.528vw, 24\.03vh\)/);
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
