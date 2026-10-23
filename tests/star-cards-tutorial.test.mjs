import assert from "node:assert/strict";
import test from "node:test";
import { STAR_CARD_DECK, STAR_CARD_LANES, getStarCardBattleScore } from "../app/star-cards-game.ts";
import {
  STAR_CARDS_TUTORIAL_FIRST_DRAW_LANE,
  createStarCardsTutorialDeck,
  matchTutorialOpponentLanes,
  canPlaceStarCardsTutorialCard,
  getStarCardsTutorialOpeningLane,
  createStarCardsTutorialBattleSequence,
  STAR_CARDS_TUTORIAL_SCORE_PAUSE_MS,
  advanceStarCardsSecondDrawLesson,
  scheduleStarCardsTutorialRecap,
} from "../app/star-cards-tutorial.ts";

const expectedOpening = {
  player: ["missile-scout-1", "laser-frigate-1", "shield-bastion-3", "laser-frigate-2", "missile-corvette-2"],
  ai: ["laser-frigate-2", "missile-corvette-2", "shield-bastion-3", "missile-corvette-3", "shield-cruiser-2"],
};
const allIds = STAR_CARD_DECK.map((card) => card.id).sort();
const permutations = (values) => values.length === 0 ? [[]] : values.flatMap((value, index) =>
  permutations(values.filter((_, other) => other !== index)).map((rest) => [value, ...rest]),
);
const card = (id) => STAR_CARD_DECK.find((candidate) => candidate.id === id);

test("Steps 8 and 9 only advance the lesson; Step 10 only accepts the hand card in C", () => {
  assert.equal(advanceStarCardsSecondDrawLesson("choice"), "known");
  assert.equal(advanceStarCardsSecondDrawLesson("known"), "risk");
  assert.equal(advanceStarCardsSecondDrawLesson("risk"), "risk", "Step 10 needs placement, not another Tip click");
  for (const stage of ["pending-draw", "dealing", "choice", "known", "risk", "placed", "resolving", "recap-dark", "recap", "recap-stack", "encourage"]) {
    for (const phase of ["draw-ready", "draw-placement", "draw-placed", "battle-ready"]) {
      for (const lane of STAR_CARD_LANES) {
        assert.equal(canPlaceStarCardsTutorialCard(true, phase, lane, card("missile-corvette-2"), stage),
          stage === "risk" && phase === "draw-placement" && lane === "C", `${stage}/${phase}/${lane}`);
        assert.equal(canPlaceStarCardsTutorialCard(false, phase, lane, card("missile-corvette-2"), stage), true);
      }
    }
  }
});

test("second draw shows tie, loss and concealed win without reusing a dealt card", () => {
  const playerDeck = createStarCardsTutorialDeck("player", () => 0);
  const aiDeck = createStarCardsTutorialDeck("ai", () => 0);
  const next = playerDeck[4];
  assert.equal(next.id, "missile-corvette-2");
  assert.equal(aiDeck[4].id, "shield-cruiser-2");
  assert.deepEqual(getStarCardBattleScore(next, card("missile-corvette-2")), { result: "tie", awardedPoints: 0 });
  assert.deepEqual(getStarCardBattleScore(next, card("laser-frigate-2")), { result: "second", awardedPoints: 2 });
  assert.deepEqual(getStarCardBattleScore(next, aiDeck[4]), { result: "first", awardedPoints: 2 });
  assert.deepEqual(getStarCardBattleScore(card("laser-frigate-2"), card("laser-frigate-2")), { result: "tie", awardedPoints: 0 });
  assert.equal(new Set(playerDeck.slice(0, 5).map(c => c.id)).size, 5);
  assert.equal(new Set(aiDeck.slice(0, 5).map(c => c.id)).size, 5);
});

for (const owner of ["player", "ai"]) {
  test(`${owner}: fixed opening and two draws retain all nine unique cards`, () => {
    const baseline = JSON.stringify(STAR_CARD_DECK);
    let calls = 0;
    const deck = createStarCardsTutorialDeck(owner, () => { calls += 1; return 0.37; });
    assert.deepEqual(deck.slice(0, 5).map((entry) => entry.id), expectedOpening[owner]);
    assert.equal(deck.length, 9);
    assert.equal(new Set(deck.map((entry) => entry.id)).size, 9);
    assert.deepEqual(deck.map((entry) => entry.id).sort(), allIds);
    assert.equal(calls, 3, "only the four remaining cards are shuffled");
    deck[0].id = "test-runtime-prefix";
    deck[5].id = "test-tail-prefix";
    assert.equal(JSON.stringify(STAR_CARD_DECK), baseline, "generated cards do not mutate the shared catalog");
  });

  test(`${owner}: random source changes only the remaining four cards`, () => {
    const low = createStarCardsTutorialDeck(owner, () => 0);
    const high = createStarCardsTutorialDeck(owner, () => 0.999999);
    assert.deepEqual(low.slice(0, 5), high.slice(0, 5));
    assert.notDeepEqual(low.slice(5).map((entry) => entry.id), high.slice(5).map((entry) => entry.id));
    assert.deepEqual(low.slice(5).map((entry) => entry.id).sort(), high.slice(5).map((entry) => entry.id).sort());
  });
}

test("all six initial layouts match opponent card identity for every placement order", () => {
  for (const lanes of permutations(STAR_CARD_LANES)) {
    const player = expectedOpening.player.slice(0, 3).map((id, index) => ({
      card: { ...card(id), id: `player-game-1-${id}` },
      lane: lanes[index],
      owner: "player",
      faceDown: false,
      dealIndex: index,
    }));
    const ai = expectedOpening.ai.slice(0, 3).map((id, index) => ({
      card: { ...card(id), id: `ai-game-1-${id}` },
      lane: STAR_CARD_LANES[index],
      owner: "ai",
      faceDown: true,
      dealIndex: index,
      retainedMetadata: { test: index },
    }));
    const original = JSON.stringify({ player, ai });
    for (const playerOrder of permutations(player)) {
      const matched = matchTutorialOpponentLanes(playerOrder, [...ai].reverse());
      assert.equal(new Set(matched.map((entry) => entry.lane)).size, 3);
      for (const opponent of matched) {
        const originalOpponent = ai.find((entry) => entry.card.id === opponent.card.id);
        const playerIndex = player.findIndex((entry) => entry.card.attribute === opponent.card.attribute);
        assert.equal(opponent.lane, lanes[playerIndex]);
        assert.deepEqual({ ...opponent, lane: originalOpponent.lane }, originalOpponent);
        assert.equal(opponent.card, originalOpponent.card);
        assert.equal(opponent.retainedMetadata, originalOpponent.retainedMetadata);
      }
    }
    assert.equal(JSON.stringify({ player, ai }), original, "lane matching must not mutate either input");
  }
});

test("opening correspondence shows same-attribute points and tie; first draw demonstrates a counter", () => {
  const results = expectedOpening.player.slice(0, 3).map((id) => {
    const player = card(id);
    const ai = expectedOpening.ai.slice(0, 3).map(card).find((entry) => entry.attribute === player.attribute);
    return getStarCardBattleScore(player, ai);
  });
  assert.deepEqual(results, [
    { result: "second", awardedPoints: 1 },
    { result: "second", awardedPoints: 1 },
    { result: "tie", awardedPoints: 0 },
  ]);
  assert.deepEqual(getStarCardBattleScore(card(expectedOpening.player[3]), card(expectedOpening.ai[3])),
    { result: "first", awardedPoints: 3 });
});

test("any opening pick order produces the same three tutorial matchups", () => {
  for (const order of permutations(expectedOpening.player.slice(0, 3))) {
    const lanes = STAR_CARD_LANES;
    for (const id of order) {
      for (const lane of lanes) assert.equal(canPlaceStarCardsTutorialCard(true, "initial-placement", lane, card(id)),
        lane === getStarCardsTutorialOpeningLane(card(id)));
    }
    const player = expectedOpening.player.slice(0, 3).map((id, index) => ({ card: card(id), lane: lanes[index] }));
    const ai = matchTutorialOpponentLanes(player, expectedOpening.ai.slice(0, 3)
      .map((id, index) => ({ card: card(id), lane: STAR_CARD_LANES[index] })));
    player.push({ card: card(expectedOpening.player[3]), lane: "B" });
    ai.push({ card: card(expectedOpening.ai[3]), lane: "B" });
    let playerScore = 0;
    let aiScore = 0;
    for (const lane of STAR_CARD_LANES) {
      const playerStack = player.filter((entry) => entry.lane === lane);
      const aiStack = ai.filter((entry) => entry.lane === lane);
      assert.equal(playerStack.length, lane === "B" ? 2 : 1);
      assert.equal(aiStack.length, lane === "B" ? 2 : 1);
      const result = getStarCardBattleScore(playerStack.at(-1).card, aiStack.at(-1).card);
      if (result.result === "first") playerScore += result.awardedPoints;
      if (result.result === "second") aiScore += result.awardedPoints;
      if (lane === "B") assert.deepEqual(result, { result: "first", awardedPoints: 3 });
    }
    assert.equal(playerScore, 3);
    assert.equal(aiScore, 1, "only the missile 1 is defeated; both shield 3 cards survive");
  }
});

test("incomplete placement and non-opening opponent cards retain their original lanes", () => {
  const opponents = expectedOpening.ai.map((id, index) => ({ card: card(id), lane: STAR_CARD_LANES[index % 3] }));
  assert.deepEqual(matchTutorialOpponentLanes([], opponents), opponents);
  const partial = matchTutorialOpponentLanes([{ card: card("laser-frigate-1"), lane: "C" }], opponents);
  assert.equal(partial[0].lane, "C");
  assert.equal(partial[1], opponents[1]);
  assert.equal(partial[2], opponents[2]);
  assert.equal(partial[3], opponents[3], "the scripted missile 3 first draw is not an opening-card pair");
});

test("first draw accepts B in both hand and already-placed reposition phases", () => {
  assert.equal(STAR_CARDS_TUTORIAL_FIRST_DRAW_LANE, "B");
  for (const phase of ["draw-placement", "draw-placed", "battle-ready"]) {
    for (const lane of STAR_CARD_LANES) {
      assert.equal(canPlaceStarCardsTutorialCard(true, phase, lane), lane === "B");
      assert.equal(canPlaceStarCardsTutorialCard(false, phase, lane), true, "completed/off tutorial restores normal lanes");
    }
  }
  for (const [index, id] of expectedOpening.player.slice(0, 3).entries()) {
    for (const lane of STAR_CARD_LANES) {
      assert.equal(canPlaceStarCardsTutorialCard(true, "initial-placement", lane, card(id)), lane === STAR_CARD_LANES[index]);
      assert.equal(canPlaceStarCardsTutorialCard(false, "initial-placement", lane, card(id)), true);
    }
  }
});

function createLessonClock() {
  let now = 0;
  let timers = [];
  return {
    schedule: (callback, delay) => timers.push({ callback, due: now + delay }),
    advance: milliseconds => {
      now += milliseconds;
      const due = timers.filter(timer => timer.due <= now);
      timers = timers.filter(timer => timer.due > now);
      due.forEach(timer => timer.callback());
    },
  };
}

test("reveal, 1.5-second score hold and all three lessons gate attacks until confirmation", () => {
  const log = [];
  const completions = [];
  const clock = createLessonClock();
  const sequence = createStarCardsTutorialBattleSequence({
    showLesson: lesson => log.push(lesson),
    runLanes: (lanes, complete) => { log.push(lanes); completions.push(complete); },
    schedule: clock.schedule,
    finish: () => log.push("finished"),
  });
  sequence.confirm("counter");
  assert.deepEqual(log, [], "BATTLE's opening input cannot skip the reveal");
  sequence.revealComplete(); sequence.revealComplete();
  assert.deepEqual(log, ["counter"], "nothing is scheduled while the first lesson waits");
  sequence.confirm("counter"); sequence.confirm("counter");
  assert.deepEqual(log, ["counter", null, ["B"]], "double activation must not replay B or run A/C");
  clock.advance(5000);
  assert.equal(log.length, 3, "the pause cannot start before the destruction animation finishes");
  completions.shift()();
  assert.equal(STAR_CARDS_TUTORIAL_SCORE_PAUSE_MS, 1500);
  clock.advance(1499);
  sequence.confirm("score");
  assert.equal(log.length, 3, "no lesson or lane activation during the 1.5-second hold");
  clock.advance(1);
  assert.equal(log.at(-1), "score");
  assert.equal(completions.length, 0, "A/C remain unscheduled after B has fully settled");
  sequence.confirm("counter");
  assert.equal(log.at(-1), "score", "stale Step 5 input cannot dismiss Step 6");
  sequence.confirm("score"); sequence.confirm("score");
  assert.deepEqual(log.slice(-2), [null, "points"]);
  assert.equal(completions.length, 0, "Step 6 only reveals Step 7, without starting A/C");
  sequence.confirm("points"); sequence.confirm("points");
  assert.deepEqual(log.slice(-2), [null, ["A", "C"]]);
  completions.shift()(); sequence.confirm("points");
  assert.equal(log.filter(entry => entry === "finished").length, 1);
});

test("leaving a tutorial cancels the pending lesson/continuation", () => {
  let complete;
  const shown = [];
  const sequence = createStarCardsTutorialBattleSequence({
    showLesson: lesson => shown.push(lesson),
    runLanes: (_, callback) => { complete = callback; },
    schedule: () => assert.fail("cancelled tutorial scheduled a lesson"),
    finish: () => assert.fail("cancelled tutorial finished"),
  });
  sequence.revealComplete(); sequence.confirm("counter"); sequence.cancel();
  complete(); sequence.confirm("counter"); sequence.revealComplete();
  assert.deepEqual(shown, ["counter", null]);
});

test("leaving during the score hold prevents its delayed overlay from reappearing", () => {
  const clock = createLessonClock();
  const shown = [];
  const sequence = createStarCardsTutorialBattleSequence({
    showLesson: lesson => shown.push(lesson),
    runLanes: (_, complete) => complete(),
    schedule: clock.schedule,
    finish: () => assert.fail("cancelled tutorial finished"),
  });
  sequence.revealComplete(); sequence.confirm("counter");
  clock.advance(1000);
  sequence.cancel();
  clock.advance(500);
  sequence.confirm("score");
  assert.deepEqual(shown, ["counter", null]);
});

test("Step 11 holds full dim for 500ms, then reveals STACK 1000ms after the Tip", () => {
  const clock = createLessonClock();
  let stage = "recap-dark";
  scheduleStarCardsTutorialRecap(clock.schedule, (expected, next) => {
    if (stage === expected) stage = next;
  });
  clock.advance(499); assert.equal(stage, "recap-dark");
  assert.equal(advanceStarCardsSecondDrawLesson(stage), stage);
  clock.advance(1); assert.equal(stage, "recap");
  clock.advance(999); assert.equal(stage, "recap");
  clock.advance(1); assert.equal(stage, "recap-stack");
  stage = advanceStarCardsSecondDrawLesson(stage);
  assert.equal(stage, "encourage");
  assert.equal(advanceStarCardsSecondDrawLesson(stage), null);
});

test("dismissing Step 11 early cannot restore its delayed mask after Step 12 or completion", () => {
  for (const dismissLastTip of [false, true]) {
    const clock = createLessonClock();
    let stage = "recap-dark";
    scheduleStarCardsTutorialRecap(clock.schedule, (expected, next) => {
      if (stage === expected) stage = next;
    });
    clock.advance(500);
    stage = advanceStarCardsSecondDrawLesson(stage);
    if (dismissLastTip) stage = advanceStarCardsSecondDrawLesson(stage);
    clock.advance(5000);
    assert.equal(stage, dismissLastTip ? null : "encourage");
  }
});
