"use client";

/* eslint-disable @next/next/no-img-element -- game sprites must preserve exact pixels and alpha */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  STAR_CARD_DECK,
  STAR_CARD_LANES,
  canPlaceStarCard,
  compareStarCards,
  getStarCardBattleScore,
  shuffleStarCardDeck,
  starCardsAssetUrl,
  type StarCardDefinition,
  type StarCardLane,
} from "./star-cards-game";

type StarCardsPhase =
  | "dealing"
  | "initial-placement"
  | "revealing"
  | "draw-ready"
  | "draw-placement"
  | "draw-placed"
  | "battle-ready"
  | "battling"
  | "battle-resolved";

type StarCardsOwner = "player" | "ai";

type PlacedStarCard = {
  card: StarCardDefinition;
  owner: StarCardsOwner;
  lane: StarCardLane;
  faceDown: boolean;
  dealIndex: number;
};

type HandStarCard = {
  card: StarCardDefinition;
  dealIndex: number;
  drawCard: boolean;
};

type DragState = {
  cardId: string;
  pointerId: number;
  x: number;
  y: number;
  source: "hand" | "placed-draw";
  originalLane?: StarCardLane;
};

type LaneBattleEffect = {
  lane: StarCardLane;
  attribute: StarCardDefinition["attribute"];
  outcome: "player" | "ai" | "tie";
  logTitle: string;
  logDetail: string;
  winnerCardId?: string;
  loserCardId?: string;
  awardedPoints: 0 | 1 | 2 | 3;
};

type BattleLogEntry = {
  id: string;
  tone: "system" | "player" | "ai" | "tie";
  title: string;
  detail?: string;
};

type StarCardStyle = CSSProperties &
  Record<`--${string}`, string | number | undefined>;

type StarCardsGameProps = {
  onClose: () => void;
};

const PLAYER_HAND_X = [33.4, 50, 66.6] as const;
const PLAYER_HAND_BOTTOM = [5.9, 10.6, 5.9] as const;
const STAR_CARDS_MAX_GAMES = 5;
const STAR_CARDS_WINS_TO_MATCH = 3;

function createOwnerDeck(owner: StarCardsOwner, gameNumber = 1) {
  return shuffleStarCardDeck().map((card) => ({
    ...card,
    id: `${owner}-game-${gameNumber}-${card.id}`,
  }));
}

function StarCardAttributeIcon({
  attribute,
}: {
  attribute: StarCardDefinition["attribute"];
}) {
  if (attribute === "shield") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 3 42 10v12c0 11.7-7.2 19.2-18 23C13.2 41.2 6 33.7 6 22V10L24 3Z" />
        <path d="M24 9 36 14v8c0 7.7-4.4 13-12 16.3C16.4 35 12 29.7 12 22v-8l12-5Z" />
      </svg>
    );
  }
  if (attribute === "laser") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="m5 38 14-6 17-23 7-4-3 8-17 23-10 9 3-9-11 2Z" />
        <path d="m21 27 6 5-4 4-7-5 5-4Zm7-9 6 5-4 5-6-5 4-5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M6 35 20 21l9-16 7 7-16 9L6 35Zm17-11 7 7-9 3-4-4 6-6Zm10-10 6-6 2 2-6 6-2-2Z" />
      <path d="m7 38 8-3-5 8-3-5Zm9-1 5-2-3 7-2-5Z" />
    </svg>
  );
}

function getPhaseMessage(phase: StarCardsPhase) {
  switch (phase) {
    case "dealing":
      return "OWEN 正在快速配置卡牌…";
    case "initial-placement":
      return "拖曳三張牌，分別放入 A／B／C";
    case "revealing":
      return "雙方卡牌同步開牌";
    case "draw-ready":
      return "按下 DRAW 抽取下一張牌";
    case "draw-placement":
      return "將抽到的牌疊放到 A／B／C 任一格；放下後仍可重新拖曳";
    case "draw-placed":
      return "你的本輪新牌已放置，等待 OWEN 決策";
    case "battle-ready":
      return "雙方已放好本輪新牌，可重新移動你的牌或按下 BATTLE";
    case "battling":
      return "A／B／C 三路同步戰鬥判定";
    case "battle-resolved":
      return "戰鬥結算完成；獲勝與平手卡牌留在場上";
  }
}

export function StarCardsGame({ onClose }: StarCardsGameProps) {
  const [playerInitialDeck] = useState(() => createOwnerDeck("player", 1));
  const [aiInitialDeck] = useState(() => createOwnerDeck("ai", 1));

  const [phase, setPhase] = useState<StarCardsPhase>("dealing");
  const [playerHand, setPlayerHand] = useState<HandStarCard[]>(() =>
    playerInitialDeck.slice(0, 3).map((card, dealIndex) => ({
      card,
      dealIndex,
      drawCard: false,
    })),
  );
  const [playerPlaced, setPlayerPlaced] = useState<PlacedStarCard[]>([]);
  const [aiPlaced, setAiPlaced] = useState<PlacedStarCard[]>(() =>
    aiInitialDeck.slice(0, 3).map((card, dealIndex) => ({
      card,
      owner: "ai",
      lane: STAR_CARD_LANES[dealIndex],
      faceDown: true,
      dealIndex,
    })),
  );
  const [playerRemainingDeck, setPlayerRemainingDeck] = useState(() =>
    playerInitialDeck.slice(3),
  );
  const [aiRemainingDeck, setAiRemainingDeck] = useState(() =>
    aiInitialDeck.slice(3),
  );
  const [aiPendingCard, setAiPendingCard] = useState<StarCardDefinition | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [repositioningCardId, setRepositioningCardId] = useState<string | null>(null);
  const [hoveredLane, setHoveredLane] = useState<StarCardLane | null>(null);
  const [snappingCardId, setSnappingCardId] = useState<string | null>(null);
  const [drawButtonPressed, setDrawButtonPressed] = useState(false);
  const [battleButtonPressed, setBattleButtonPressed] = useState(false);
  const [activeDrawIndex, setActiveDrawIndex] = useState<number | null>(null);
  const [currentGame, setCurrentGame] = useState(1);
  const [gameBannerNumber, setGameBannerNumber] = useState<number | null>(null);
  const [matchResultBanner, setMatchResultBanner] = useState<{
    text: string;
    outcome: "victory" | "defeat";
  } | null>(null);
  const [playerGameWins, setPlayerGameWins] = useState(0);
  const [aiGameWins, setAiGameWins] = useState(0);
  const [battleEffects, setBattleEffects] = useState<LaneBattleEffect[]>([]);
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [scorePulse, setScorePulse] = useState<{
    owner: StarCardsOwner;
    serial: number;
  } | null>(null);
  const [destroyingCardIds, setDestroyingCardIds] = useState<string[]>([]);
  const [victoriousCardIds, setVictoriousCardIds] = useState<string[]>([]);
  const [navigationMode, setNavigationMode] = useState<"pointer" | "directional">(
    "pointer",
  );
  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
  const [selectedLaneIndex, setSelectedLaneIndex] = useState(0);
  const [battleNavigationIndex, setBattleNavigationIndex] = useState(1);
  const [heldCardId, setHeldCardId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const playerLaneRefs = useRef<Record<StarCardLane, HTMLDivElement | null>>({
    A: null,
    B: null,
    C: null,
  });
  const timersRef = useRef<number[]>([]);

  const schedule = useCallback((callback: () => void, delayMs: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((candidate) => candidate !== timer);
      callback();
    }, delayMs);
    timersRef.current.push(timer);
    return timer;
  }, []);

  useEffect(() => {
    schedule(() => setPhase("initial-placement"), 920);
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
  }, [schedule]);

  const getLaneCards = useCallback(
    (owner: StarCardsOwner, lane: StarCardLane) =>
      (owner === "player" ? playerPlaced : aiPlaced).filter(
        (placed) => placed.lane === lane,
      ),
    [aiPlaced, playerPlaced],
  );

  const getDropLane = (x: number, y: number) => {
    for (const lane of STAR_CARD_LANES) {
      const bounds = playerLaneRefs.current[lane]?.getBoundingClientRect();
      if (
        bounds &&
        x >= bounds.left &&
        x <= bounds.right &&
        y >= bounds.top &&
        y <= bounds.bottom
      ) {
        return lane;
      }
    }
    return null;
  };

  const revealInitialCards = useCallback(() => {
    setPhase("revealing");
    schedule(() => {
      setPlayerPlaced((cards) => cards.map((placed) => ({ ...placed, faceDown: false })));
      setAiPlaced((cards) => cards.map((placed) => ({ ...placed, faceDown: false })));
      setAnnouncement("六張牌已同步開牌");
    }, 620);
    schedule(() => {
      setPhase("draw-ready");
      setNavigationMode("directional");
      setAnnouncement("DRAW 已可使用");
    }, 1320);
  }, [schedule]);

  const placeCard = useCallback(
    (cardId: string, lane: StarCardLane) => {
      if (phase !== "initial-placement" && phase !== "draw-placement") return false;
      const handCard = playerHand.find((candidate) => candidate.card.id === cardId);
      if (!handCard) return false;
      const laneCardCount = playerPlaced.filter((placed) => placed.lane === lane).length;
      if (!canPlaceStarCard(phase, laneCardCount)) {
        setAnnouncement(`${lane} 格已有首張牌，請選擇其他空格`);
        return false;
      }

      const nextPlaced: PlacedStarCard[] = [
        ...playerPlaced,
        {
          card: handCard.card,
          owner: "player",
          lane,
          faceDown: true,
          dealIndex: handCard.dealIndex,
        },
      ];
      setPlayerPlaced(nextPlaced);
      const nextHand = playerHand.filter((candidate) => candidate.card.id !== cardId);
      setPlayerHand(nextHand);
      setSelectedHandIndex((current) => Math.min(current, Math.max(0, nextHand.length - 1)));
      setHeldCardId(null);
      setSnappingCardId(cardId);
      setAnnouncement(
        `${handCard.card.points} 點・${handCard.card.attributeLabel} 已蓋牌放入 ${lane} 格`,
      );
      schedule(() => setSnappingCardId(null), 620);

      if (phase === "initial-placement" && nextPlaced.length === 3) {
        revealInitialCards();
      } else if (phase === "draw-placement") {
        setPhase("draw-placed");
      }
      return true;
    },
    [phase, playerHand, playerPlaced, revealInitialCards, schedule],
  );

  const chooseAiLane = useCallback(
    (card: StarCardDefinition) => {
      const available = STAR_CARD_LANES.filter(
        (lane) => aiPlaced.filter((placed) => placed.lane === lane).length < 3,
      );
      const winning = available.filter((lane) => {
        const playerTop = playerPlaced.filter((placed) => placed.lane === lane).at(-1);
        return playerTop && compareStarCards(card, playerTop.card) === "first";
      });
      const pool = winning.length > 0 && Math.random() < 0.7 ? winning : available;
      return pool[Math.floor(Math.random() * pool.length)] ?? "B";
    },
    [aiPlaced, playerPlaced],
  );

  const playerDrawnCount = STAR_CARD_DECK.length - playerRemainingDeck.length;

  const drawNextCard = useCallback(() => {
    if (phase !== "draw-ready") return;
    const nextCard = playerRemainingDeck[0];
    const aiCard = aiRemainingDeck[0];
    if (!nextCard || !aiCard) return;
    const drawIndex = playerDrawnCount;
    setDrawButtonPressed(true);
    setNavigationMode("pointer");
    setActiveDrawIndex(drawIndex);
    setPlayerHand([{ card: nextCard, dealIndex: drawIndex, drawCard: true }]);
    setAiPendingCard(aiCard);
    setPlayerRemainingDeck((cards) => cards.slice(1));
    setAiRemainingDeck((cards) => cards.slice(1));
    setSelectedHandIndex(0);
    setSelectedLaneIndex(1);
    setPhase("draw-placement");
    setAnnouncement(`${nextCard.points} 點・${nextCard.attributeLabel} 已抽出；OWEN 同步抽牌`);
    schedule(() => setDrawButtonPressed(false), 300);
    schedule(() => {
      const lane = chooseAiLane(aiCard);
      setAiPendingCard(null);
      setAiPlaced((cards) => [
        ...cards,
        {
          card: aiCard,
          owner: "ai",
          lane,
          faceDown: true,
          dealIndex: drawIndex,
        },
      ]);
      setSnappingCardId(aiCard.id);
      setAnnouncement(`OWEN 已將本輪新牌蓋放到 ${lane} 格`);
      schedule(() => setSnappingCardId(null), 620);
    }, 2000);
  }, [aiRemainingDeck, chooseAiLane, phase, playerDrawnCount, playerRemainingDeck, schedule]);

  const playerDrawPlaced = activeDrawIndex !== null &&
    playerPlaced.some((placed) => placed.dealIndex === activeDrawIndex);
  const aiDrawPlaced = activeDrawIndex !== null &&
    aiPlaced.some((placed) => placed.dealIndex === activeDrawIndex);

  useEffect(() => {
    if (
      playerDrawPlaced &&
      aiDrawPlaced &&
      !repositioningCardId &&
      (phase === "draw-placement" || phase === "draw-placed")
    ) {
      schedule(() => {
        setPhase("battle-ready");
        setNavigationMode("directional");
        setBattleNavigationIndex(1);
        setAnnouncement("雙方本輪新牌已放好，BATTLE 已可使用");
      }, 0);
    }
  }, [aiDrawPlaced, phase, playerDrawPlaced, repositioningCardId, schedule]);

  const prepareNextGame = useCallback((nextGame: number) => {
    const nextPlayerDeck = createOwnerDeck("player", nextGame);
    const nextAiDeck = createOwnerDeck("ai", nextGame);
    setCurrentGame(nextGame);
    setGameBannerNumber(nextGame);
    setMatchResultBanner(null);
    setPlayerScore(0);
    setAiScore(0);
    setScorePulse(null);
    setActiveDrawIndex(null);
    setPlayerHand(nextPlayerDeck.slice(0, 3).map((card, dealIndex) => ({
      card,
      dealIndex,
      drawCard: false,
    })));
    setPlayerPlaced([]);
    setAiPlaced(nextAiDeck.slice(0, 3).map((card, dealIndex) => ({
      card,
      owner: "ai",
      lane: STAR_CARD_LANES[dealIndex],
      faceDown: true,
      dealIndex,
    })));
    setPlayerRemainingDeck(nextPlayerDeck.slice(3));
    setAiRemainingDeck(nextAiDeck.slice(3));
    setAiPendingCard(null);
    setBattleEffects([]);
    setBattleLog([]);
    setDestroyingCardIds([]);
    setVictoriousCardIds([]);
    setHeldCardId(null);
    setRepositioningCardId(null);
    setHoveredLane(null);
    setNavigationMode("pointer");
    setSelectedHandIndex(0);
    setSelectedLaneIndex(1);
    setPhase("dealing");
    setAnnouncement(`第 ${nextGame} 局開始，雙方重新洗牌`);
    schedule(() => setGameBannerNumber(null), 950);
    schedule(() => {
      setPhase("initial-placement");
      setAnnouncement(`第 ${nextGame} 局：拖曳三張牌，分別放入 A／B／C`);
    }, 1050);
  }, [schedule]);

  const resolveBattle = useCallback(() => {
    if (phase !== "battle-ready") return;
    const effects = STAR_CARD_LANES.flatMap<LaneBattleEffect>((lane) => {
      const playerTop = playerPlaced.filter((placed) => placed.lane === lane).at(-1);
      const aiTop = aiPlaced.filter((placed) => placed.lane === lane).at(-1);
      if (!playerTop || !aiTop) return [];
      const { result, awardedPoints } = getStarCardBattleScore(
        playerTop.card,
        aiTop.card,
      );
      const matchup = `[${lane}] PLAYER ${playerTop.card.attributeLabel} ${playerTop.card.points}  VS  OWEN ${aiTop.card.attributeLabel} ${aiTop.card.points}`;
      if (result === "tie") {
        return [{
          lane,
          attribute: playerTop.card.attribute,
          outcome: "tie",
          logTitle: matchup,
          logDetail: "DRAW｜同屬性・同點數，雙方卡牌保留",
          awardedPoints: 0,
        }];
      }
      const playerWon = result === "first";
      const winner = playerWon ? playerTop.card : aiTop.card;
      const loser = playerWon ? aiTop.card : playerTop.card;
      const reason = winner.attribute === loser.attribute
        ? `同屬性點數 ${winner.points} > ${loser.points}`
        : `${winner.attributeLabel}剋制${loser.attributeLabel}`;
      return [{
        lane,
        attribute: playerWon ? playerTop.card.attribute : aiTop.card.attribute,
        outcome: playerWon ? "player" : "ai",
        logTitle: matchup,
        logDetail: `${playerWon ? "PLAYER WIN" : "OWEN WIN"}｜${reason}｜擊毀 ${loser.points} 點牌，+${awardedPoints} 分`,
        winnerCardId: playerWon ? playerTop.card.id : aiTop.card.id,
        loserCardId: playerWon ? aiTop.card.id : playerTop.card.id,
        awardedPoints,
      }];
    });
    if (effects.length === 0) return;
    const battlePlayerPoints = effects.reduce(
      (total, effect) => total + (effect.outcome === "player" ? effect.awardedPoints : 0),
      0,
    );
    const battleAiPoints = effects.reduce(
      (total, effect) => total + (effect.outcome === "ai" ? effect.awardedPoints : 0),
      0,
    );
    const finalPlayerScore = playerScore + battlePlayerPoints;
    const finalAiScore = aiScore + battleAiPoints;
    const isFinalBattleOfGame =
      playerRemainingDeck.length === 0 && aiRemainingDeck.length === 0;

    setBattleButtonPressed(true);
    setPhase("battling");
    setNavigationMode("pointer");
    setPlayerPlaced((cards) => cards.map((placed) => ({ ...placed, faceDown: false })));
    setAiPlaced((cards) => cards.map((placed) => ({ ...placed, faceDown: false })));
    setBattleLog([{
      id: "battle-start",
      tone: "system",
      title: "// BATTLE START",
      detail: "A／B／C 三路目標鎖定・同步開牌",
    }]);
    setAnnouncement("三路卡牌同步開牌，戰鬥開始");
    schedule(() => setBattleButtonPressed(false), 280);
    schedule(() => setBattleEffects(effects), 520);
    effects.forEach((effect, index) => {
      schedule(() => {
        if (effect.outcome === "player") {
          setPlayerScore((score) => score + effect.awardedPoints);
          setScorePulse((pulse) => ({
            owner: "player",
            serial: (pulse?.serial ?? 0) + 1,
          }));
        } else if (effect.outcome === "ai") {
          setAiScore((score) => score + effect.awardedPoints);
          setScorePulse((pulse) => ({
            owner: "ai",
            serial: (pulse?.serial ?? 0) + 1,
          }));
        }
        setBattleLog((entries) => [
          ...entries,
          {
            id: `lane-${effect.lane}`,
            tone: effect.outcome,
            title: effect.logTitle,
            detail: effect.logDetail,
          },
        ]);
      }, 600 + index * 260);
    });
    schedule(() => {
      setVictoriousCardIds(
        effects.flatMap((effect) => effect.winnerCardId ? [effect.winnerCardId] : []),
      );
      setDestroyingCardIds(
        effects.flatMap((effect) => effect.loserCardId ? [effect.loserCardId] : []),
      );
    }, 1280);
    schedule(() => {
      const destroyedCount = effects.filter((effect) => effect.loserCardId).length;
      setBattleLog((entries) => [
        ...entries,
        {
          id: "battle-destroyed",
          tone: "system",
          title: `// DESTROYED ${destroyedCount} CARD${destroyedCount === 1 ? "" : "S"}`,
          detail: "敗方最上層牌移除・勝方與平手卡牌保留",
        },
      ]);
    }, 1600);
    schedule(() => {
      const defeated = new Set(
        effects.flatMap((effect) => effect.loserCardId ? [effect.loserCardId] : []),
      );
      setPlayerPlaced((cards) => cards.filter((placed) => !defeated.has(placed.card.id)));
      setAiPlaced((cards) => cards.filter((placed) => !defeated.has(placed.card.id)));
      setBattleEffects([]);
      setDestroyingCardIds([]);
      setPhase("battle-resolved");
      setAnnouncement(
        effects.map((effect) =>
          `${effect.lane}：${effect.outcome === "tie" ? "平手" : effect.outcome === "player" ? "PLAYER 勝" : "OWEN 勝"}`,
        ).join("　"),
      );
      schedule(() => {
        setVictoriousCardIds([]);
        if (!isFinalBattleOfGame) {
          setActiveDrawIndex(null);
          setNavigationMode("directional");
          setSelectedHandIndex(0);
          setSelectedLaneIndex(1);
          setPhase("draw-ready");
          setAnnouncement(
            `第 ${currentGame} 局尚未結束；目前 ${playerDrawnCount}／${STAR_CARD_DECK.length}，DRAW 已可再次使用`,
          );
          return;
        }

        const gameWinner = finalPlayerScore === finalAiScore
          ? null
          : finalPlayerScore > finalAiScore
            ? "player"
            : "ai";
        const nextPlayerGameWins = playerGameWins + (gameWinner === "player" ? 1 : 0);
        const nextAiGameWins = aiGameWins + (gameWinner === "ai" ? 1 : 0);
        if (gameWinner === "player") setPlayerGameWins(nextPlayerGameWins);
        if (gameWinner === "ai") setAiGameWins(nextAiGameWins);
        setBattleLog((entries) => [
          ...entries,
          {
            id: `game-${currentGame}-result`,
            tone: gameWinner ?? "tie",
            title: `// GAME ${currentGame} RESULT`,
            detail: gameWinner
              ? `9／9 最終比分 PLAYER ${finalPlayerScore}：${finalAiScore} OWEN｜${gameWinner === "player" ? "PLAYER" : "OWEN"} 取得 1 局勝利`
              : `9／9 最終比分 PLAYER ${finalPlayerScore}：${finalAiScore} OWEN｜本局平手，暫不計局勝`,
          },
        ]);

        if (!gameWinner) {
          setAnnouncement(
            `第 ${currentGame} 局 9／9 結束：${finalPlayerScore}：${finalAiScore} 平手，等待平手規則`,
          );
          return;
        }

        const matchWinner = nextPlayerGameWins >= STAR_CARDS_WINS_TO_MATCH
          ? "PLAYER"
          : nextAiGameWins >= STAR_CARDS_WINS_TO_MATCH
            ? "OWEN"
            : null;
        if (matchWinner || currentGame >= STAR_CARDS_MAX_GAMES) {
          const resolvedMatchWinner = matchWinner ?? (
            nextPlayerGameWins > nextAiGameWins ? "PLAYER" : "OWEN"
          );
          setAnnouncement(
            `${resolvedMatchWinner} 贏得五戰三勝｜局勝 ${nextPlayerGameWins}：${nextAiGameWins}`,
          );
          setMatchResultBanner(
            resolvedMatchWinner === "PLAYER"
              ? { text: "你贏了！", outcome: "victory" }
              : { text: "失敗了…", outcome: "defeat" },
          );
          schedule(() => setMatchResultBanner(null), 950);
          return;
        }

        setAnnouncement(
          `第 ${currentGame} 局由 ${gameWinner === "player" ? "PLAYER" : "OWEN"} 勝出｜局勝 ${nextPlayerGameWins}：${nextAiGameWins}`,
        );
        schedule(() => prepareNextGame(currentGame + 1), 2400);
      }, 900);
    }, 2050);
  }, [aiGameWins, aiPlaced, aiRemainingDeck.length, currentGame, phase, playerDrawnCount, playerGameWins, playerPlaced, playerRemainingDeck.length, playerScore, aiScore, prepareNextGame, schedule]);

  const liftPlacedDrawCard = useCallback(() => {
    const placed = playerPlaced.find(
      (candidate) => candidate.dealIndex === activeDrawIndex,
    );
    if (!placed || phase !== "battle-ready") return;
    setPlayerPlaced((cards) => cards.filter((candidate) => candidate.card.id !== placed.card.id));
    setPlayerHand([{ card: placed.card, dealIndex: placed.dealIndex, drawCard: true }]);
    setSelectedLaneIndex(STAR_CARD_LANES.indexOf(placed.lane));
    setSelectedHandIndex(0);
    setHeldCardId(placed.card.id);
    setPhase("draw-placement");
    setAnnouncement(`${placed.card.points} 點・${placed.card.attributeLabel} 已重新抽起並翻回正面`);
  }, [activeDrawIndex, phase, playerPlaced]);

  const moveDirectionalSelection = useCallback(
    (direction: number) => {
      setNavigationMode("directional");
      if (phase === "battle-ready") {
        setBattleNavigationIndex((current) => (current + direction + 2) % 2);
        return;
      }
      if (phase === "initial-placement" || phase === "draw-placement") {
        if (heldCardId) {
          setSelectedLaneIndex(
            (current) => (current + direction + STAR_CARD_LANES.length) % STAR_CARD_LANES.length,
          );
        } else if (playerHand.length > 0) {
          setSelectedHandIndex(
            (current) => (current + direction + playerHand.length) % playerHand.length,
          );
        }
      }
    },
    [heldCardId, phase, playerHand.length],
  );

  const activateDirectionalSelection = useCallback(() => {
    setNavigationMode("directional");
    if (phase === "draw-ready") {
      drawNextCard();
      return;
    }
    if (phase === "battle-ready") {
      if (battleNavigationIndex === 0) liftPlacedDrawCard();
      else resolveBattle();
      return;
    }
    if (phase !== "initial-placement" && phase !== "draw-placement") return;
    if (!heldCardId) {
      const selected = playerHand[selectedHandIndex];
      if (!selected) return;
      setHeldCardId(selected.card.id);
      setAnnouncement(`已選取 ${selected.card.points} 點・${selected.card.attributeLabel}，選擇格子後按 A`);
      return;
    }
    placeCard(heldCardId, STAR_CARD_LANES[selectedLaneIndex]);
  }, [battleNavigationIndex, drawNextCard, heldCardId, liftPlacedDrawCard, phase, placeCard, playerHand, resolveBattle, selectedHandIndex, selectedLaneIndex]);

  const navigationRef = useRef({
    move: moveDirectionalSelection,
    activate: activateDirectionalSelection,
  });
  useEffect(() => {
    navigationRef.current = {
      move: moveDirectionalSelection,
      activate: activateDirectionalSelection,
    };
  }, [activateDirectionalSelection, moveDirectionalSelection]);

  useEffect(() => {
    let frame = 0;
    let horizontalArmed = true;
    let confirmHeld = false;
    let cancelHeld = false;
    const pollGamepad = () => {
      const gamepad = navigator.getGamepads?.().find((candidate) => candidate) ?? null;
      if (gamepad) {
        const horizontal =
          gamepad.buttons[14]?.pressed
            ? -1
            : gamepad.buttons[15]?.pressed
              ? 1
              : Math.abs(gamepad.axes[0] ?? 0) >= 0.65
                ? Math.sign(gamepad.axes[0] ?? 0)
                : 0;
        if (horizontal === 0) horizontalArmed = true;
        else if (horizontalArmed) {
          horizontalArmed = false;
          navigationRef.current.move(horizontal);
        }
        const confirm = Boolean(gamepad.buttons[0]?.pressed);
        if (confirm && !confirmHeld) navigationRef.current.activate();
        confirmHeld = confirm;
        const cancel = Boolean(gamepad.buttons[1]?.pressed || gamepad.buttons[8]?.pressed);
        if (cancel && !cancelHeld) onClose();
        cancelHeld = cancel;
      }
      frame = window.requestAnimationFrame(pollGamepad);
    };
    frame = window.requestAnimationFrame(pollGamepad);
    return () => window.cancelAnimationFrame(frame);
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        event.stopImmediatePropagation();
        navigationRef.current.move(event.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopImmediatePropagation();
        navigationRef.current.activate();
        return;
      }
      const lane = event.key.toUpperCase() as StarCardLane;
      if (heldCardId && STAR_CARD_LANES.includes(lane)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setSelectedLaneIndex(STAR_CARD_LANES.indexOf(lane));
        placeCard(heldCardId, lane);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [heldCardId, onClose, placeCard]);

  const beginDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    cardId: string,
    source: DragState["source"] = "hand",
    originalLane?: StarCardLane,
  ) => {
    const canDragHand = source === "hand" &&
      (phase === "initial-placement" || phase === "draw-placement");
    const canReposition = source === "placed-draw" &&
      (phase === "draw-placed" || phase === "battle-ready");
    if (!canDragHand && !canReposition) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setNavigationMode("pointer");
    setHeldCardId(null);
    if (source === "placed-draw") {
      setRepositioningCardId(cardId);
      setPhase("draw-placement");
      setPlayerPlaced((cards) => cards.map((placed) =>
        placed.card.id === cardId ? { ...placed, faceDown: false } : placed,
      ));
      setAnnouncement("本輪新牌已抽起並翻回正面，拖曳到新的格子");
    }
    setDragging({
      cardId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      source,
      originalLane,
    });
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    event.preventDefault();
    setDragging((current) =>
      current ? { ...current, x: event.clientX, y: event.clientY } : current,
    );
    setHoveredLane(getDropLane(event.clientX, event.clientY));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const lane = getDropLane(event.clientX, event.clientY);
    if (dragging.source === "placed-draw") {
      const destinationCount = lane
        ? playerPlaced.filter(
            (placed) => placed.lane === lane && placed.card.id !== dragging.cardId,
          ).length
        : 3;
      const destination = lane && destinationCount < 3 ? lane : dragging.originalLane;
      if (destination) {
        setPlayerPlaced((cards) => cards.map((placed) =>
          placed.card.id === dragging.cardId
            ? { ...placed, lane: destination, faceDown: true }
            : placed,
        ));
        setSnappingCardId(dragging.cardId);
        setPhase("draw-placed");
        setAnnouncement(
          lane && destination === lane
            ? `本輪新牌已重新蓋牌放入 ${lane} 格`
            : "該位置無法放牌，卡牌已回到原位",
        );
        schedule(() => setSnappingCardId(null), 620);
      }
      setRepositioningCardId(null);
    } else if (lane) {
      placeCard(dragging.cardId, lane);
    } else {
      setAnnouncement("請將卡牌放開在 A／B／C 格內");
    }
    setDragging(null);
    setHoveredLane(null);
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    if (dragging.source === "placed-draw") {
      setPlayerPlaced((cards) => cards.map((placed) =>
        placed.card.id === dragging.cardId ? { ...placed, faceDown: true } : placed,
      ));
      setRepositioningCardId(null);
      setPhase("draw-placed");
    }
    setDragging(null);
    setHoveredLane(null);
  };

  const renderCard = (
    card: StarCardDefinition,
    options: {
      owner: StarCardsOwner;
      faceDown: boolean;
      hand?: HandStarCard;
      aiPending?: boolean;
      movable?: boolean;
      stackIndex?: number;
      laneIndex?: number;
      dealIndex: number;
    },
  ) => {
    const hand = options.hand;
    const isInteractive = Boolean(hand || options.movable);
    const isDragging = dragging?.cardId === card.id;
    const isHeld = heldCardId === card.id;
    const handIndex = hand
      ? playerHand.findIndex((candidate) => candidate.card.id === card.id)
      : -1;
    const isSelectedHand =
      Boolean(hand) &&
      navigationMode === "directional" &&
      !heldCardId &&
      handIndex === selectedHandIndex;
    const isSelectedMovable =
      Boolean(options.movable) &&
      phase === "battle-ready" &&
      navigationMode === "directional" &&
      battleNavigationIndex === 0;
    const handX = hand?.drawCard ? 50 : PLAYER_HAND_X[hand?.dealIndex ?? 1] ?? 50;
    const handBottom = hand?.drawCard
      ? 7.1
      : PLAYER_HAND_BOTTOM[hand?.dealIndex ?? 1] ?? 7.1;
    const dealX = 50 - handX;
    const aiDealX = options.laneIndex === 0 ? 23 : options.laneIndex === 2 ? -23 : 0;
    const style: StarCardStyle = isDragging
      ? { left: dragging.x, top: dragging.y }
      : hand
        ? {
            "--hand-x": `${handX}%`,
            "--hand-bottom": `${handBottom}%`,
            "--deal-x": `${dealX}vw`,
            "--deal-delay": `${hand.dealIndex * 90}ms`,
          }
        : options.aiPending
          ? {
              "--deal-delay": "0ms",
            }
        : {
            "--stack-index": options.stackIndex ?? 0,
            "--deal-x": `${aiDealX}vw`,
            "--deal-delay": `${options.dealIndex * 110}ms`,
          };

    return (
      <div
        key={card.id}
        className={`star-card-shell${options.aiPending ? " is-ai-pending" : hand ? " is-hand" : " is-placed"}${hand?.drawCard ? " is-draw-card" : ""}${options.owner === "ai" ? " is-ai" : " is-player"}${isDragging ? " is-dragging" : ""}${isHeld ? " is-held" : ""}${isSelectedHand || isSelectedMovable ? " is-gamepad-selected" : ""}${snappingCardId === card.id ? " is-snapping" : ""}${destroyingCardIds.includes(card.id) ? " is-destroying" : ""}${victoriousCardIds.includes(card.id) ? " is-victorious" : ""}${phase === "dealing" || hand?.drawCard || options.aiPending ? " is-dealing" : ""}`}
        style={style}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : -1}
        aria-label={
          hand
            ? `${card.points} 點 ${card.attributeLabel}卡，拖曳至 A、B 或 C 格`
            : `${options.owner === "ai" ? "OWEN" : "玩家"} ${options.laneIndex !== undefined ? STAR_CARD_LANES[options.laneIndex] : ""} 格卡牌`
        }
        aria-pressed={isHeld || isSelectedMovable || undefined}
        onPointerDown={
          hand
            ? (event) => beginDrag(event, card.id)
            : options.movable
              ? (event) => beginDrag(
                  event,
                  card.id,
                  "placed-draw",
                  options.laneIndex === undefined ? undefined : STAR_CARD_LANES[options.laneIndex],
                )
              : undefined
        }
        onPointerMove={isInteractive ? moveDrag : undefined}
        onPointerUp={isInteractive ? finishDrag : undefined}
        onPointerCancel={isInteractive ? cancelDrag : undefined}
        onKeyDown={
          hand
            ? (event: ReactKeyboardEvent<HTMLDivElement>) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setNavigationMode("directional");
                setSelectedHandIndex(Math.max(0, handIndex));
                setHeldCardId(card.id);
              }
            : undefined
        }
      >
        <div className="star-card-hover">
          <div className={`star-card-inner${options.faceDown ? " is-face-down" : ""}`}>
            <div className="star-card-face star-card-front">
              <img src={card.image} alt="" draggable={false} />
            </div>
            <div className="star-card-face star-card-back">
              <img src={starCardsAssetUrl("card-back.png")} alt="" draggable={false} />
              {options.owner === "player" && !hand ? (
                <div
                  className={`star-card-back-hints is-${card.attribute}`}
                  aria-label={`${card.points} 點 ${card.attributeLabel}`}
                >
                  <span className="star-card-back-point" aria-hidden="true">
                    <b>{card.points}</b>
                  </span>
                  <span className="star-card-back-attribute" aria-hidden="true">
                    <StarCardAttributeIcon attribute={card.attribute} />
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="star-cards-overlay" data-star-cards-open="true">
      <section
        className={`star-cards-dialog is-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-label="StarCards 星際牌玩法驗證"
      >
        <img
          className="star-cards-background"
          src={starCardsAssetUrl("card-bg-2.png")}
          alt=""
          aria-hidden="true"
          draggable={false}
        />

        {gameBannerNumber !== null ? (
          <div
            className="star-cards-game-banner"
            role="status"
            aria-live="assertive"
            aria-label={`第 ${gameBannerNumber} 局`}
          >
            <span aria-hidden="true">【第{gameBannerNumber}局】</span>
          </div>
        ) : matchResultBanner ? (
          <div
            className={`star-cards-game-banner is-${matchResultBanner.outcome}`}
            role="status"
            aria-live="assertive"
            aria-label={matchResultBanner.text}
          >
            <span aria-hidden="true">{matchResultBanner.text}</span>
          </div>
        ) : null}

        <div
          key={`score-${scorePulse?.serial ?? 0}`}
          className={`star-cards-score${scorePulse ? ` is-scoring is-${scorePulse.owner}` : ""}`}
          aria-label={`本局比分：玩家 ${playerScore} 分，OWEN ${aiScore} 分`}
        >
          <img src={starCardsAssetUrl("score-panel.png")} alt="" aria-hidden="true" />
          <b className="is-player-score">{playerScore}</b>
          <b className="is-ai-score">{aiScore}</b>
        </div>

        <div
          className="star-cards-match-wins"
          aria-label={`勝局：PLAYER ${playerGameWins}，OWEN ${aiGameWins}；目前第 ${currentGame} 局，最多 ${STAR_CARDS_MAX_GAMES} 局`}
        >
          <img src={starCardsAssetUrl("match-wins-panel.png")} alt="" aria-hidden="true" />
          <b className="is-player-wins">{playerGameWins}</b>
          <b className="is-ai-wins">{aiGameWins}</b>
        </div>

        <div
          className="star-cards-advantage-panel"
          aria-label="屬性剋制：護盾剋雷射、雷射剋飛彈、飛彈剋護盾"
        >
          <img
            src={starCardsAssetUrl("type-advantage-panel.png")}
            alt="護盾指向雷射、雷射指向飛彈、飛彈指向護盾的順時針互剋表"
            draggable={false}
          />
        </div>

        {aiPendingCard
          ? renderCard(aiPendingCard, {
              owner: "ai",
              faceDown: true,
              aiPending: true,
              dealIndex: activeDrawIndex ?? playerDrawnCount,
            })
          : null}

        {STAR_CARD_LANES.map((lane, laneIndex) => (
          <div
            className="star-cards-lane is-ai-lane"
            data-lane={lane}
            key={`ai-${lane}`}
            aria-label={`OWEN ${lane} 格`}
          >
            {getLaneCards("ai", lane).map((placed, stackIndex) =>
              renderCard(placed.card, {
                owner: "ai",
                faceDown: placed.faceDown,
                stackIndex,
                laneIndex,
                dealIndex: placed.dealIndex,
              }),
            )}
          </div>
        ))}

        {STAR_CARD_LANES.map((lane, laneIndex) => {
          const laneCards = getLaneCards("player", lane);
          const laneContainsDraggingCard = laneCards.some(
            (placed) => placed.card.id === dragging?.cardId,
          );
          const laneSelected =
            navigationMode === "directional" &&
            Boolean(heldCardId) &&
            selectedLaneIndex === laneIndex;
          return (
            <div
              className={`star-cards-lane is-player-lane${hoveredLane === lane ? " is-drop-hover" : ""}${laneSelected ? " is-gamepad-selected" : ""}${laneContainsDraggingCard ? " is-drag-source" : ""}`}
              data-lane={lane}
              key={`player-${lane}`}
              ref={(element) => {
                playerLaneRefs.current[lane] = element;
              }}
              role="button"
              tabIndex={0}
              aria-label={`玩家 ${lane} 格，目前 ${laneCards.length} 張牌`}
              onClick={() => {
                if (heldCardId) placeCard(heldCardId, lane);
              }}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && heldCardId) {
                  event.preventDefault();
                  placeCard(heldCardId, lane);
                }
              }}
            >
              <span className="star-cards-lane-label">{lane}</span>
              {laneCards.map((placed, stackIndex) =>
                renderCard(placed.card, {
                  owner: "player",
                  faceDown: placed.faceDown,
                  movable:
                    placed.dealIndex === activeDrawIndex &&
                    (phase === "draw-placed" ||
                      phase === "battle-ready" ||
                      repositioningCardId === placed.card.id),
                  stackIndex,
                  laneIndex,
                  dealIndex: placed.dealIndex,
                }),
              )}
            </div>
          );
        })}

        {battleLog.length > 0 ? (
          <aside
            className="star-cards-battle-log"
            role="log"
            aria-label="戰鬥歷程"
            aria-live="polite"
            aria-relevant="additions"
          >
            <ol>
              {battleLog.map((entry) => (
                <li className={`is-${entry.tone}`} key={entry.id}>
                  <span>{entry.title}{entry.detail ? `｜${entry.detail}` : ""}</span>
                </li>
              ))}
            </ol>
          </aside>
        ) : null}

        <div className="star-cards-battle-layer" aria-hidden="true">
          {battleEffects.map((effect) => (
            <div
              className={`star-cards-battle-effect is-${effect.attribute} is-${effect.outcome}`}
              data-lane={effect.lane}
              key={`${effect.lane}-${effect.outcome}`}
            >
              <span className="star-cards-attack-core" />
              <span className="star-cards-attack-trail is-one" />
              <span className="star-cards-attack-trail is-two" />
              <span className="star-cards-attack-trail is-three" />
              <span className="star-cards-impact" />
            </div>
          ))}
        </div>

        {playerHand.map((hand) =>
          renderCard(hand.card, {
            owner: "player",
            faceDown: false,
            hand,
            dealIndex: hand.dealIndex,
          }),
        )}

        <div className="star-cards-actions" aria-label="星際牌操作">
          <div
            className="star-cards-stack-status"
            aria-label={`玩家牌庫：已抽 ${playerDrawnCount} 張，共 ${STAR_CARD_DECK.length} 張不重複牌`}
          >
            <img src={starCardsAssetUrl("button-stack.png")} alt="" aria-hidden="true" draggable={false} />
            <span aria-hidden="true">
              <b>{playerDrawnCount}</b><i>/</i><b>{STAR_CARD_DECK.length}</b>
            </span>
          </div>
          <button
            type="button"
            className={`star-cards-image-button is-draw${phase === "draw-ready" ? " is-ready" : ""}${drawButtonPressed ? " is-pressed" : ""}`}
            disabled={phase !== "draw-ready"}
            data-gamepad-selected={
              navigationMode === "directional" && phase === "draw-ready" ? "true" : undefined
            }
            onPointerDown={() => setNavigationMode("pointer")}
            onClick={drawNextCard}
            aria-label="DRAW，抽一張牌"
          >
            <img src={starCardsAssetUrl("button-draw.png")} alt="" draggable={false} />
          </button>
          <button
            type="button"
            className={`star-cards-image-button is-battle${phase === "battle-ready" ? " is-ready" : ""}${battleButtonPressed ? " is-pressed" : ""}`}
            disabled={phase !== "battle-ready"}
            data-gamepad-selected={
              navigationMode === "directional" &&
              phase === "battle-ready" &&
              battleNavigationIndex === 1
                ? "true"
                : undefined
            }
            onPointerDown={() => setNavigationMode("pointer")}
            onClick={resolveBattle}
            aria-label="BATTLE，進行三路戰鬥"
          >
            <img src={starCardsAssetUrl("button-battle.png")} alt="" draggable={false} />
          </button>
        </div>

        <div className="star-cards-status" role="status" aria-live="polite">
          <strong>{getPhaseMessage(phase)}</strong>
          <span>{announcement}</span>
        </div>
        <div className="star-cards-exit-hint" aria-hidden="true">ESC／B　離開測試</div>
      </section>
    </div>
  );
}
