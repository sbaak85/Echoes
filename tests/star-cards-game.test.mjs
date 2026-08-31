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
  assert.match(styles, /@keyframes star-card-back-hints-in/);
  assert.match(source, /setPhase\("initial-placement"\), 920/);
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
  assert.match(movementLabSource, /<StarCardsGame onClose=\{closeStarCardsGame\}/);
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
  assert.match(source, /hand\?\.drawCard[\s\S]*\? 7\.1[\s\S]*PLAYER_HAND_BOTTOM/);
  assert.match(styles, /bottom: var\(--hand-bottom, 7\.1%\)/);
  assert.match(source, /laneContainsDraggingCard/);
  assert.match(source, /is-drag-source/);
  assert.match(styles, /\.star-cards-lane\.is-drag-source \{ z-index: 255; \}/);
  assert.match(source, /hoveredLane === lane \? " is-drop-hover"/);
  assert.match(styles, /\.star-cards-lane\.is-drop-hover::before/);
  assert.match(styles, /\.star-cards-lane\.is-drop-hover::after/);
  assert.match(styles, /@keyframes star-cards-drop-zone-pulse/);
  assert.match(source, /}, 2000\)/);
  assert.match(source, /setPhase\("battle-ready"\)/);
  assert.match(source, /compareStarCards/);
  assert.match(source, /placed-draw/);
  assert.match(source, /role="log"/);
  assert.match(source, /setBattleLog/);
  assert.match(source, /setPlayerScore\(\(score\) => score \+ effect\.awardedPoints\)/);
  assert.match(source, /setAiScore\(\(score\) => score \+ effect\.awardedPoints\)/);
  assert.match(styles, /@keyframes star-cards-score-panel-bump/);
  assert.match(styles, /@keyframes star-cards-score-number-bump/);
  assert.doesNotMatch(source, /<b>BATTLE LOG<\/b>/);
  assert.match(source, /starCardsAssetUrl\("type-advantage-panel\.png"\)/);
  assert.match(styles, /\.star-cards-advantage-panel/);
  assert.match(source, /data-gamepad-selected/);
  assert.match(source, /navigator\.getGamepads/);
  assert.match(styles, /@keyframes star-card-deal-player/);
  assert.match(styles, /@keyframes star-card-deal-ai/);
  assert.match(styles, /@keyframes star-card-place-back/);
  assert.match(styles, /@keyframes star-cards-draw-line-scan/);
  assert.match(styles, /@keyframes star-card-destroy/);
  assert.match(styles, /@keyframes star-cards-shield-surge/);
  assert.match(styles, /@keyframes star-cards-log-line-in/);
  assert.match(styles, /\.star-cards-lane\.is-ai-lane \{ top: 5\.9%; height: 38\.3%; \}/);
  assert.match(styles, /aspect-ratio: 380 \/ 475/);
  assert.match(styles, /\.star-cards-dialog button:focus-visible[\s\S]*outline: none/);
});

test("all StarCards runtime assets are present", () => {
  const assetRoot = new URL("../public/ui/star-cards/", import.meta.url);
  for (const name of [
    "card-bg-2.png",
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
