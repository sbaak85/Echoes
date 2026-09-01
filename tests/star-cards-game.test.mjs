import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  STAR_CARD_DECK,
  STAR_CARD_LANES,
  STAR_CARDS_DEBUG_NUMBER,
  STAR_CARDS_GAME_ID,
  canPlaceStarCard,
  compareStarCards,
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
  assert.match(source, /StarCardAttributeIcon/);
  assert.match(styles, /\.star-card-back-point/);
  assert.match(styles, /\.star-card-back-attribute/);
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
  assert.match(styles, /\.star-cards-match-wins/);
  assert.match(styles, /\.star-cards-game-banner/);
  assert.match(styles, /pointer-events: none;[\s\S]*animation: star-cards-game-banner-sweep 950ms linear both/);
  assert.match(styles, /@keyframes star-cards-game-banner-sweep/);
  assert.match(styles, /10\.526%[\s\S]*89\.474%/);
  assert.match(styles, /\.star-cards-game-banner\.is-victory span/);
  assert.match(styles, /\.star-cards-game-banner\.is-defeat span/);
  assert.match(source, /setPhase\("draw-ready"\)/);
  assert.match(source, /STAR_CARDS_MAX_GAMES = 5/);
  assert.match(source, /STAR_CARDS_WINS_TO_MATCH = 3/);
  assert.match(source, /starCardsAssetUrl\("button-stack\.png"\)/);
  assert.match(styles, /\.star-cards-stack-status/);
  assert.match(source, /const PLAYER_HAND_X = \[33\.4, 50, 66\.6\]/);
  assert.match(source, /const PLAYER_HAND_BOTTOM = \[5\.9, 10\.6, 5\.9\]/);
  assert.match(source, /type PlacementPromptState/);
  assert.match(source, /showPlacementPrompt\("initial"\)/);
  assert.match(source, /showPlacementPrompt\("draw"\)/);
  assert.match(source, /"將卡牌自由分配到空格子中"/);
  assert.match(source, /"將卡牌拖曳到其中一個位置"/);
  assert.match(source, /dismissPlacementPrompt\(\);[\s\S]*setNavigationMode\("pointer"\)/);
  assert.match(styles, /\.star-cards-placement-prompt \{[\s\S]*star-cards-placement-prompt-fade-in 1s/);
  assert.match(styles, /\.star-cards-placement-prompt\.is-exiting \{[\s\S]*star-cards-placement-prompt-fade-out 1s/);
  assert.match(styles, /\.star-cards-placement-prompt span \{[\s\S]*star-cards-placement-prompt-breathe 1\.25s/);
  assert.match(styles, /@keyframes star-cards-placement-prompt-fade-in/);
  assert.match(styles, /@keyframes star-cards-placement-prompt-fade-out/);
  assert.match(styles, /@keyframes star-cards-placement-prompt-breathe/);
  assert.match(source, /hand\?\.drawCard[\s\S]*\? 7\.1[\s\S]*PLAYER_HAND_BOTTOM/);
  assert.match(styles, /bottom: var\(--hand-bottom, 7\.1%\)/);
  assert.match(source, /laneContainsDraggingCard/);
  assert.match(source, /is-drag-source/);
  assert.match(styles, /\.star-cards-lane\.is-drag-source \{ z-index: 255; \}/);
  assert.match(source, /starCardsAssetUrl\("drop-lane-highlight\.png"\)/);
  assert.match(source, /hoveredLane \? ` is-\$\{hoveredLane\.toLowerCase\(\)\}`/);
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
  assert.match(source, /starCardsAssetUrl\("type-advantage-panel\.png"\)/);
  assert.match(styles, /\.star-cards-advantage-panel/);
  assert.match(source, /data-gamepad-selected/);
  assert.match(source, /navigator\.getGamepads/);
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
  assert.match(styles, /@keyframes star-card-held-pulse/);
  assert.match(styles, /@keyframes star-card-place-back/);
  assert.doesNotMatch(
    styles,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.star-card-shell/,
  );
  assert.match(source, /const STAR_CARD_PLACE_FEEDBACK_MS = 320/);
  assert.match(source, /INITIAL_DEAL_AUDIO_DELAYS_MS = \[0, 0, 90, 110, 180, 220\]/);
  assert.match(source, /playStarCardsAudio\("starCardsUiInput"\)/);
  assert.match(source, /playStarCardsAudio\("starCardsCardDealt"\)/);
  assert.match(source, /playStarCardsAudio\("starCardsCardFlipped", 6\)/);
  assert.match(
    source,
    /const STAR_CARDS_LASER_AUDIO_EVENTS = \[[\s\S]*"starCardsLaserAttack1"[\s\S]*"starCardsLaserAttack4"/,
  );
  assert.match(
    source,
    /const STAR_CARDS_MISSILE_AUDIO_EVENTS = \[[\s\S]*"starCardsMissileAttack1"[\s\S]*"starCardsMissileAttack8"/,
  );
  assert.match(source, /const playBattleHitAudioSet = useCallback/);
  assert.match(source, /attribute === "laser"[\s\S]*STAR_CARDS_LASER_AUDIO_EVENTS/);
  assert.match(source, /attribute === "missile"[\s\S]*STAR_CARDS_MISSILE_AUDIO_EVENTS/);
  assert.match(source, /const soundCount = 3 \+ Math\.floor\(Math\.random\(\) \* 2\)/);
  assert.match(source, /elapsedMs \+= 200 \+ Math\.floor\(Math\.random\(\) \* 201\)/);
  assert.match(source, /shuffledAudioPool\.slice\(0, soundCount\)/);
  assert.match(source, /schedule\(\(\) => playStarCardsAudio\(audioEvent\), elapsedMs\)/);
  assert.match(source, /effects\.forEach\(\(effect\) => playBattleHitAudioSet\(effect\.attribute\)\)/);
  assert.match(source, /restart: !overlap/);
  assert.match(source, /\n\s*overlap,\n/);
  assert.match(source, /dropLaneBoundsRef\.current = measureDropLaneBounds\(\)/);
  assert.match(source, /window\.requestAnimationFrame\(\(\) =>/);
  assert.match(source, /queueDragFrame\(\{ x: event\.clientX, y: event\.clientY \}\)/);
  assert.doesNotMatch(source, /setDragging\(\(current\)/);
  assert.match(styles, /translate3d\(var\(--drag-x, 0\), var\(--drag-y, 0\), 0\)/);
  assert.match(
    styles,
    /\.star-cards-lane\.is-player-lane \.star-card-shell\.is-placed\.is-dragging \{[^}]*position: fixed;[^}]*top: 0;[^}]*left: 0;[^}]*bottom: auto;/,
  );
  assert.match(styles, /animation: star-card-snap 280ms/);
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
  assert.match(styles, /\.star-cards-score-popup \{[\s\S]*animation: star-cards-score-popup 900ms linear both/);
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
  assert.match(styles, /is-player-lane\[data-lane="A"\] \{ --card-idle-x: -3\.7vw; \}/);
  assert.match(styles, /is-player-lane\[data-lane="B"\] \{ --card-idle-x: -0\.5vw; \}/);
  assert.match(styles, /is-player-lane\[data-lane="C"\] \{ --card-idle-x: 2\.4vw; \}/);
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
    "type-advantage-panel.png",
    ...STAR_CARD_DECK.map((card) => card.image.split("/").at(-1)),
  ]) {
    assert.equal(existsSync(new URL(name, assetRoot)), true, `${name} should exist`);
  }
});
