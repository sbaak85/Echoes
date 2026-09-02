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
  createStarCardsImpactParticleLayout,
  createStarCardsMissileTrailLayout,
  getStarCardBattleScore,
  shuffleStarCardDeck,
  starCardsAssetUrl,
  type StarCardDefinition,
  type StarCardLane,
  type StarCardsImpactParticleLayout,
  type StarCardsMissileTrailLayout,
} from "./star-cards-game";
import type { AudioEventManager } from "./audio-event-manager";

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
  originX: number;
  originY: number;
  originRotationDeg: number;
  source: "hand" | "placed-draw";
  originalLane?: StarCardLane;
};

type DragPoint = {
  x: number;
  y: number;
};

type DropLaneBounds = Partial<Record<StarCardLane, DOMRectReadOnly>>;

type LaneBattleEffect = {
  lane: StarCardLane;
  attribute: StarCardDefinition["attribute"];
  outcome: "player" | "ai" | "tie";
  logTitle: string;
  logDetail: string;
  winnerCardId?: string;
  loserCardId?: string;
  loserCardPoints?: StarCardDefinition["points"];
  impactParticleLayout?: StarCardsImpactParticleLayout;
  missileTrailLayout?: StarCardsMissileTrailLayout;
  awardedPoints: 0 | 1 | 2 | 3;
};

type BattleScorePopup = {
  lane: StarCardLane;
  owner: "player" | "ai";
  points: 0 | 1 | 2 | 3;
};

type BattleLogEntry = {
  id: string;
  tone: "system" | "player" | "ai" | "tie";
  title: string;
  detail?: string;
};

type StarCardStyle = CSSProperties &
  Record<`--${string}`, string | number | undefined>;

type HandFloatMotion = {
  phase: number;
  lastTime: number;
  playbackRate: number;
  fromRate: number;
  targetRate: number;
  rateBlendStartedAt: number;
};

type StarCardsGameProps = {
  onClose: () => void;
  audioEvents: Pick<AudioEventManager, "play"> | null;
  initialGamepadMode?: boolean;
};

type PlacementPromptState = {
  kind: "initial" | "draw";
  exiting: boolean;
  serial: number;
};

type DropFeedbackState = {
  text: string;
  serial: number;
};

const STAR_CARDS_LASER_FIRE_AUDIO_EVENTS = [
  "starCardsLaserFire1",
  "starCardsLaserFire2",
  "starCardsLaserFire3",
  "starCardsLaserFire4",
  "starCardsLaserFire5",
  "starCardsLaserFire6",
  "starCardsLaserFire7",
] as const;

const STAR_CARDS_MISSILE_FIRE_AUDIO_EVENTS = [
  "starCardsMissileFire1",
  "starCardsMissileFire2",
  "starCardsMissileFire3",
  "starCardsMissileFire4",
  "starCardsMissileFire5",
  "starCardsMissileFire6",
] as const;

const STAR_CARDS_SHIELD_ATTACK_AUDIO_EVENTS = [
  "starCardsShieldAttackLayer1",
  "starCardsShieldAttackLayer2",
] as const;

const STAR_CARDS_EXPLOSION_ORIGINAL_AUDIO_EVENTS = [
  "starCardsExplosion1",
  "starCardsExplosion2",
  "starCardsExplosion3",
  "starCardsExplosion4",
  "starCardsExplosion5",
  "starCardsExplosion6",
  "starCardsExplosion7",
  "starCardsExplosion8",
] as const;

const STAR_CARDS_EXPLOSION_FINISH_AUDIO_EVENTS = [
  "starCardsExplosionFinish1",
  "starCardsExplosionFinish2",
  "starCardsExplosionFinish3",
] as const;

const STAR_CARDS_EXPLOSION_HEAVY_FINISH_AUDIO_EVENT =
  "starCardsExplosionHeavyFinish" as const;

const STAR_CARDS_EXPLOSION_AUDIO_EVENTS = [
  ...STAR_CARDS_EXPLOSION_ORIGINAL_AUDIO_EVENTS,
  ...STAR_CARDS_EXPLOSION_FINISH_AUDIO_EVENTS,
  STAR_CARDS_EXPLOSION_HEAVY_FINISH_AUDIO_EVENT,
] as const;

type StarCardsLayeredAudioEventName =
  | (typeof STAR_CARDS_LASER_FIRE_AUDIO_EVENTS)[number]
  | (typeof STAR_CARDS_MISSILE_FIRE_AUDIO_EVENTS)[number]
  | (typeof STAR_CARDS_SHIELD_ATTACK_AUDIO_EVENTS)[number]
  | (typeof STAR_CARDS_EXPLOSION_AUDIO_EVENTS)[number];

type StarCardsAudioEventName =
  | "starCardsUiInput"
  | "starCardsCardDealt"
  | "starCardsCardFlipped"
  | "starCardsLaneChanged"
  | "interactionDenied"
  | "starCardsTie"
  | StarCardsLayeredAudioEventName;

const PLAYER_HAND_X = [33.4, 50, 66.6] as const;
const PLAYER_HAND_BOTTOM = [5.9, 10.6, 5.9] as const;
const PLAYER_HAND_ROTATION = [-5, 0, 5] as const;
const STAR_CARDS_MAX_GAMES = 5;
const STAR_CARDS_WINS_TO_MATCH = 3;
const STAR_CARD_PLACE_FEEDBACK_MS = 320;
const STAR_CARD_REJECT_RETURN_MS = 320;
const STAR_CARD_DROP_FEEDBACK_MS = 1100;
const STAR_CARD_REVEAL_FRONT_MS = 300;
const INITIAL_DEAL_AUDIO_DELAYS_MS = [0, 0, 90, 110, 180, 220] as const;
const INITIAL_REVEAL_START_MS = 620;
const INITIAL_REVEAL_STEP_MS = 100;
const INITIAL_REVEAL_SEQUENCE = [
  { owner: "ai", lane: "A", delaySteps: 0 },
  { owner: "ai", lane: "B", delaySteps: 1 },
  { owner: "ai", lane: "C", delaySteps: 2 },
  { owner: "player", lane: "A", delaySteps: 1 },
  { owner: "player", lane: "B", delaySteps: 2 },
  { owner: "player", lane: "C", delaySteps: 3 },
] as const satisfies readonly {
  owner: StarCardsOwner;
  lane: StarCardLane;
  delaySteps: number;
}[];
const INITIAL_REVEAL_FINAL_STEP = Math.max(
  ...INITIAL_REVEAL_SEQUENCE.map(({ delaySteps }) => delaySteps),
);

function createOwnerDeck(owner: StarCardsOwner, gameNumber = 1) {
  return shuffleStarCardDeck().map((card) => ({
    ...card,
    id: `${owner}-game-${gameNumber}-${card.id}`,
  }));
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

export function StarCardsGame({
  onClose,
  audioEvents,
  initialGamepadMode = false,
}: StarCardsGameProps) {
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
  const [activatedPlayerLanes, setActivatedPlayerLanes] = useState<StarCardLane[]>([]);
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
  const [battleScorePopups, setBattleScorePopups] = useState<BattleScorePopup[]>([]);
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [scorePulse, setScorePulse] = useState<{
    owner: StarCardsOwner;
    serial: number;
  } | null>(null);
  const [destroyingCardIds, setDestroyingCardIds] = useState<string[]>([]);
  const [victoriousCardIds, setVictoriousCardIds] = useState<string[]>([]);
  const [revealingFrontCardIds, setRevealingFrontCardIds] = useState<string[]>([]);
  const [navigationMode, setNavigationMode] = useState<"pointer" | "directional">(
    "pointer",
  );
  const [selectedHandIndex, setSelectedHandIndex] = useState(1);
  const [selectedLaneIndex, setSelectedLaneIndex] = useState(1);
  const [battleNavigationIndex, setBattleNavigationIndex] = useState(1);
  const [heldCardId, setHeldCardId] = useState<string | null>(null);
  const [hoveredHandCardId, setHoveredHandCardId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [placementPrompt, setPlacementPrompt] = useState<PlacementPromptState | null>(null);
  const [dropFeedback, setDropFeedback] = useState<DropFeedbackState | null>(null);
  const [settledHandCardIds, setSettledHandCardIds] = useState<string[]>([]);
  const dialogRef = useRef<HTMLElement | null>(null);
  const preselectedHandCardIdRef = useRef<string | null>(null);
  const handFloatMotionRef = useRef<Map<string, HandFloatMotion>>(new Map());
  const playerLaneRefs = useRef<Record<StarCardLane, HTMLDivElement | null>>({
    A: null,
    B: null,
    C: null,
  });
  const draggingRef = useRef<DragState | null>(null);
  const dragElementRef = useRef<HTMLDivElement | null>(null);
  const dragPointRef = useRef<DragPoint | null>(null);
  const dropLaneBoundsRef = useRef<DropLaneBounds | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const hoveredLaneRef = useRef<StarCardLane | null>(null);
  const timersRef = useRef<number[]>([]);
  const placementPromptRef = useRef<PlacementPromptState | null>(null);
  const placementPromptSerialRef = useRef(0);
  const placementPromptRequestRef = useRef(0);
  const dropFeedbackSerialRef = useRef(0);

  const schedule = useCallback((callback: () => void, delayMs: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((candidate) => candidate !== timer);
      callback();
    }, delayMs);
    timersRef.current.push(timer);
    return timer;
  }, []);

  const markCardsRevealingFront = useCallback((cardIds: readonly string[]) => {
    if (cardIds.length === 0) return;
    setRevealingFrontCardIds((current) => [
      ...current,
      ...cardIds.filter((cardId) => !current.includes(cardId)),
    ]);
    cardIds.forEach((cardId) => {
      schedule(() => {
        setRevealingFrontCardIds((current) =>
          current.filter((candidate) => candidate !== cardId),
        );
      }, STAR_CARD_REVEAL_FRONT_MS);
    });
  }, [schedule]);

  const showPlacementPrompt = useCallback((kind: PlacementPromptState["kind"]) => {
    const nextPrompt: PlacementPromptState = {
      kind,
      exiting: false,
      serial: placementPromptSerialRef.current + 1,
    };
    placementPromptSerialRef.current = nextPrompt.serial;
    placementPromptRef.current = nextPrompt;
    setPlacementPrompt(nextPrompt);
  }, []);

  const dismissPlacementPrompt = useCallback(() => {
    placementPromptRequestRef.current += 1;
    const currentPrompt = placementPromptRef.current;
    if (!currentPrompt || currentPrompt.exiting) return;
    const exitingPrompt = { ...currentPrompt, exiting: true };
    placementPromptRef.current = exitingPrompt;
    setPlacementPrompt(exitingPrompt);
    schedule(() => {
      if (placementPromptRef.current?.serial !== currentPrompt.serial) return;
      placementPromptRef.current = null;
      setPlacementPrompt(null);
    }, 1000);
  }, [schedule]);

  const playStarCardsAudio = useCallback((
    eventName: StarCardsAudioEventName,
    count = 1,
  ) => {
    if (!audioEvents || count <= 0) return;
    const overlap = eventName !== "starCardsUiInput";
    for (let index = 0; index < count; index += 1) {
      void audioEvents.play(eventName, {
        restart: !overlap,
        overlap,
      }).catch(() => {
        // 音效被瀏覽器暫時阻擋時，不得中斷牌局操作。
      });
    }
  }, [audioEvents]);

  const showFullLaneFeedback = useCallback(() => {
    placementPromptRequestRef.current += 1;
    placementPromptRef.current = null;
    setPlacementPrompt(null);
    const serial = dropFeedbackSerialRef.current + 1;
    dropFeedbackSerialRef.current = serial;
    setDropFeedback({ text: "此戰區堆疊已滿", serial });
    setAnnouncement("此戰區堆疊已滿");
    playStarCardsAudio("interactionDenied");
    schedule(() => {
      setDropFeedback((current) => current?.serial === serial ? null : current);
    }, STAR_CARD_DROP_FEEDBACK_MS);
  }, [playStarCardsAudio, schedule]);

  const playInitialDealAudio = useCallback(() => {
    INITIAL_DEAL_AUDIO_DELAYS_MS.forEach((delayMs) => {
      schedule(() => playStarCardsAudio("starCardsCardDealt"), delayMs);
    });
  }, [playStarCardsAudio, schedule]);

  const playAudioSequence = useCallback((
    audioEvents: readonly StarCardsLayeredAudioEventName[],
    intervalMinMs: number,
    intervalMaxMs: number,
  ) => {
    let elapsedMs = 0;
    audioEvents.forEach((audioEvent, index) => {
      if (index > 0) {
        elapsedMs += intervalMinMs +
          Math.floor(Math.random() * (intervalMaxMs - intervalMinMs + 1));
      }
      schedule(() => playStarCardsAudio(audioEvent), elapsedMs);
    });
  }, [playStarCardsAudio, schedule]);

  const playRandomAudioSet = useCallback((
    audioPool: readonly StarCardsLayeredAudioEventName[],
    intervalMinMs = 200,
    intervalMaxMs = 400,
  ) => {
    const soundCount = 3 + Math.floor(Math.random() * 2);
    playAudioSequence(
      Array.from(
        { length: soundCount },
        () => audioPool[Math.floor(Math.random() * audioPool.length)],
      ),
      intervalMinMs,
      intervalMaxMs,
    );
  }, [playAudioSequence]);

  const playExplosionAudioSet = useCallback((
    loserCardPoints: StarCardDefinition["points"],
  ) => {
    const soundCount = 3 + Math.floor(Math.random() * 2);
    const leadingAudioEvents = Array.from(
      { length: soundCount - 1 },
      () => STAR_CARDS_EXPLOSION_AUDIO_EVENTS[
        Math.floor(Math.random() * STAR_CARDS_EXPLOSION_AUDIO_EVENTS.length)
      ],
    );
    const finishAudioEvent = loserCardPoints === 3
      ? STAR_CARDS_EXPLOSION_HEAVY_FINISH_AUDIO_EVENT
      : STAR_CARDS_EXPLOSION_FINISH_AUDIO_EVENTS[
          Math.floor(Math.random() * STAR_CARDS_EXPLOSION_FINISH_AUDIO_EVENTS.length)
        ];
    playAudioSequence(
      [...leadingAudioEvents, finishAudioEvent],
      200,
      400,
    );
  }, [playAudioSequence]);

  useEffect(() => {
    playInitialDealAudio();
    schedule(() => {
      setPhase("initial-placement");
      if (initialGamepadMode) {
        setNavigationMode("directional");
        setSelectedHandIndex(1);
      }
      showPlacementPrompt("initial");
    }, 920);
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
  }, [initialGamepadMode, playInitialDealAudio, schedule, showPlacementPrompt]);

  const getLaneCards = useCallback(
    (owner: StarCardsOwner, lane: StarCardLane) =>
      (owner === "player" ? playerPlaced : aiPlaced).filter(
        (placed) => placed.lane === lane,
      ),
    [aiPlaced, playerPlaced],
  );

  const measureDropLaneBounds = useCallback(() => {
    const nextBounds: DropLaneBounds = {};
    for (const lane of STAR_CARD_LANES) {
      const element = playerLaneRefs.current[lane];
      if (element) nextBounds[lane] = element.getBoundingClientRect();
    }
    return nextBounds;
  }, []);

  const getDropLane = useCallback((x: number, y: number) => {
    const laneBounds = dropLaneBoundsRef.current ?? measureDropLaneBounds();
    for (const lane of STAR_CARD_LANES) {
      const bounds = laneBounds[lane];
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
  }, [measureDropLaneBounds]);

  const queueDragFrame = useCallback((point: DragPoint) => {
    dragPointRef.current = point;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const latestPoint = dragPointRef.current;
      const dragElement = dragElementRef.current;
      if (!latestPoint || !dragElement || !draggingRef.current) return;
      dragElement.style.setProperty("--drag-x", `${latestPoint.x}px`);
      dragElement.style.setProperty("--drag-y", `${latestPoint.y}px`);
      const nextHoveredLane = getDropLane(latestPoint.x, latestPoint.y);
      if (hoveredLaneRef.current !== nextHoveredLane) {
        hoveredLaneRef.current = nextHoveredLane;
        setHoveredLane(nextHoveredLane);
        if (nextHoveredLane) playStarCardsAudio("starCardsLaneChanged");
      }
    });
  }, [getDropLane, playStarCardsAudio]);

  const stopDragFrame = useCallback(() => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  }, []);

  const clearDragInteraction = useCallback(() => {
    stopDragFrame();
    draggingRef.current = null;
    dragElementRef.current = null;
    dragPointRef.current = null;
    dropLaneBoundsRef.current = null;
    hoveredLaneRef.current = null;
    setDragging(null);
    setHoveredLane(null);
  }, [stopDragFrame]);

  const returnDraggedCardToIdle = useCallback((
    activeDrag: DragState,
    element: HTMLDivElement,
    releasePoint: DragPoint,
  ) => {
    stopDragFrame();
    draggingRef.current = { ...activeDrag, pointerId: -1 };
    hoveredLaneRef.current = null;
    setHoveredLane(null);
    element.style.setProperty("--drag-x", `${releasePoint.x}px`);
    element.style.setProperty("--drag-y", `${releasePoint.y}px`);
    if (activeDrag.source === "hand") {
      setSettledHandCardIds((current) =>
        current.includes(activeDrag.cardId) ? current : [...current, activeDrag.cardId],
      );
    }
    const returnAnimation = element.animate(
      [
        {
          transform: `translate3d(${releasePoint.x}px, ${releasePoint.y}px, 0) translate(-50%, -50%) scale(1.035) rotate(-1.2deg)`,
        },
        {
          transform: `translate3d(${activeDrag.originX}px, ${activeDrag.originY}px, 0) translate(-50%, -50%) scale(1) rotate(${activeDrag.originRotationDeg}deg)`,
        },
      ],
      {
        duration: STAR_CARD_REJECT_RETURN_MS,
        easing: "cubic-bezier(0.2, 0.82, 0.22, 1)",
        fill: "forwards",
      },
    );
    schedule(() => {
      clearDragInteraction();
      window.requestAnimationFrame(() => returnAnimation.cancel());
    }, STAR_CARD_REJECT_RETURN_MS);
  }, [clearDragInteraction, schedule, stopDragFrame]);

  useEffect(() => () => stopDragFrame(), [stopDragFrame]);

  const revealInitialCards = useCallback(() => {
    setPhase("revealing");
    INITIAL_REVEAL_SEQUENCE.forEach(({ owner, lane, delaySteps }, index) => {
      schedule(() => {
        playStarCardsAudio("starCardsCardFlipped");
        const revealLane = (cards: PlacedStarCard[]) => cards.map((placed) =>
          placed.lane === lane ? { ...placed, faceDown: false } : placed,
        );
        if (owner === "ai") {
          setAiPlaced(revealLane);
        } else {
          setPlayerPlaced(revealLane);
        }
        if (index === INITIAL_REVEAL_SEQUENCE.length - 1) {
          setAnnouncement("對手與我方卡牌已依序開牌");
        }
      }, INITIAL_REVEAL_START_MS + delaySteps * INITIAL_REVEAL_STEP_MS);
    });
    schedule(() => {
      setPhase("draw-ready");
      setNavigationMode("directional");
      setAnnouncement("DRAW 已可使用");
    }, INITIAL_REVEAL_START_MS +
      INITIAL_REVEAL_FINAL_STEP * INITIAL_REVEAL_STEP_MS + 300);
  }, [playStarCardsAudio, schedule]);

  const placeCard = useCallback(
    (cardId: string, lane: StarCardLane) => {
      if (phase !== "initial-placement" && phase !== "draw-placement") return false;
      const handCard = playerHand.find((candidate) => candidate.card.id === cardId);
      if (!handCard) return false;
      const laneCardCount = playerPlaced.filter((placed) => placed.lane === lane).length;
      if (laneCardCount >= 3) {
        showFullLaneFeedback();
        return false;
      }
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
      playStarCardsAudio("starCardsCardFlipped");
      setPlayerPlaced(nextPlaced);
      setActivatedPlayerLanes((current) =>
        current.includes(lane) ? current : [...current, lane],
      );
      const nextHand = playerHand.filter((candidate) => candidate.card.id !== cardId);
      setPlayerHand(nextHand);
      setSelectedHandIndex((current) => Math.min(current, Math.max(0, nextHand.length - 1)));
      setHeldCardId(null);
      setHoveredHandCardId(null);
      setSnappingCardId(cardId);
      setAnnouncement(
        `${handCard.card.points} 點・${handCard.card.attributeLabel} 已蓋牌放入 ${lane} 格`,
      );
      schedule(() => setSnappingCardId(null), STAR_CARD_PLACE_FEEDBACK_MS);

      if (phase === "initial-placement" && nextPlaced.length === 3) {
        revealInitialCards();
      } else if (phase === "draw-placement") {
        setPhase("draw-placed");
      }
      return true;
    },
    [phase, playStarCardsAudio, playerHand, playerPlaced, revealInitialCards, schedule, showFullLaneFeedback],
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
    const promptRequest = placementPromptRequestRef.current + 1;
    placementPromptRequestRef.current = promptRequest;
    playStarCardsAudio("starCardsUiInput");
    playStarCardsAudio("starCardsCardDealt");
    schedule(
      () => playStarCardsAudio("starCardsCardDealt"),
      drawIndex * 90,
    );
    setDrawButtonPressed(true);
    setHoveredHandCardId(null);
    setActiveDrawIndex(drawIndex);
    setPlayerHand([{ card: nextCard, dealIndex: drawIndex, drawCard: true }]);
    setAiPendingCard(aiCard);
    setPlayerRemainingDeck((cards) => cards.slice(1));
    setAiRemainingDeck((cards) => cards.slice(1));
    setSelectedHandIndex(0);
    setSelectedLaneIndex(1);
    setPhase("draw-placement");
    setAnnouncement(`${nextCard.points} 點・${nextCard.attributeLabel} 已抽出；OWEN 同步抽牌`);
    schedule(() => {
      if (placementPromptRequestRef.current !== promptRequest) return;
      showPlacementPrompt("draw");
    }, 720);
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
      schedule(() => setSnappingCardId(null), STAR_CARD_PLACE_FEEDBACK_MS);
    }, 2000);
  }, [aiRemainingDeck, chooseAiLane, phase, playStarCardsAudio, playerDrawnCount, playerRemainingDeck, schedule, showPlacementPrompt]);

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
    setActivatedPlayerLanes([]);
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
    setBattleScorePopups([]);
    setBattleLog([]);
    setDestroyingCardIds([]);
    setVictoriousCardIds([]);
    setHeldCardId(null);
    setRepositioningCardId(null);
    setHoveredLane(null);
    setHoveredHandCardId(null);
    setDropFeedback(null);
    setSettledHandCardIds([]);
    setNavigationMode(initialGamepadMode ? "directional" : "pointer");
    setSelectedHandIndex(1);
    setSelectedLaneIndex(1);
    setPhase("dealing");
    setAnnouncement(`第 ${nextGame} 局開始，雙方重新洗牌`);
    playInitialDealAudio();
    schedule(() => setGameBannerNumber(null), 950);
    schedule(() => {
      setPhase("initial-placement");
      showPlacementPrompt("initial");
      setAnnouncement(`第 ${nextGame} 局：拖曳三張牌，分別放入 A／B／C`);
    }, 1050);
  }, [initialGamepadMode, playInitialDealAudio, schedule, showPlacementPrompt]);

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
        loserCardPoints: loser.points,
        impactParticleLayout: createStarCardsImpactParticleLayout(),
        missileTrailLayout: winner.attribute === "missile"
          ? createStarCardsMissileTrailLayout()
          : undefined,
        awardedPoints,
      }];
    });
    if (effects.length === 0) return;
    playStarCardsAudio("starCardsUiInput");
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
    markCardsRevealingFront([
      ...playerPlaced.filter((placed) => placed.faceDown).map((placed) => placed.card.id),
      ...aiPlaced.filter((placed) => placed.faceDown).map((placed) => placed.card.id),
    ]);
    playStarCardsAudio(
      "starCardsCardFlipped",
      playerPlaced.filter((placed) => placed.faceDown).length +
        aiPlaced.filter((placed) => placed.faceDown).length,
    );
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
    schedule(() => {
      setBattleEffects(effects);
      effects
        .filter((effect) => effect.outcome === "tie")
        .forEach(() => playStarCardsAudio("starCardsTie"));
      effects
        .filter((effect) => effect.outcome !== "tie")
        .forEach((effect) => {
          if (effect.attribute === "laser") {
            playRandomAudioSet(STAR_CARDS_LASER_FIRE_AUDIO_EVENTS);
          } else if (effect.attribute === "missile") {
            playRandomAudioSet(STAR_CARDS_MISSILE_FIRE_AUDIO_EVENTS, 200, 300);
          } else if (effect.attribute === "shield") {
            STAR_CARDS_SHIELD_ATTACK_AUDIO_EVENTS.forEach((audioEvent) => {
              playStarCardsAudio(audioEvent);
            });
          }
        });
    }, 520);
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
      effects
        .filter((effect) => Boolean(effect.loserCardId && effect.loserCardPoints))
        .forEach((effect) => playExplosionAudioSet(effect.loserCardPoints!));
      setVictoriousCardIds(
        effects.flatMap((effect) => effect.winnerCardId ? [effect.winnerCardId] : []),
      );
      setDestroyingCardIds(
        effects.flatMap((effect) => effect.loserCardId ? [effect.loserCardId] : []),
      );
      setBattleScorePopups(
        effects.flatMap((effect) => effect.outcome === "tie" ? [] : [{
          lane: effect.lane,
          owner: effect.outcome,
          points: effect.awardedPoints,
        }]),
      );
      schedule(() => setBattleScorePopups([]), 900);
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
  }, [aiGameWins, aiPlaced, aiRemainingDeck.length, currentGame, phase, playExplosionAudioSet, playRandomAudioSet, playStarCardsAudio, playerDrawnCount, playerGameWins, playerPlaced, playerRemainingDeck.length, playerScore, aiScore, markCardsRevealingFront, prepareNextGame, schedule]);

  const liftPlacedDrawCard = useCallback(() => {
    const placed = playerPlaced.find(
      (candidate) => candidate.dealIndex === activeDrawIndex,
    );
    if (!placed || phase !== "battle-ready") return;
    playStarCardsAudio("starCardsCardFlipped");
    setPlayerPlaced((cards) => cards.filter((candidate) => candidate.card.id !== placed.card.id));
    setPlayerHand([{ card: placed.card, dealIndex: placed.dealIndex, drawCard: true }]);
    setSelectedLaneIndex(STAR_CARD_LANES.indexOf(placed.lane));
    setSelectedHandIndex(0);
    setHeldCardId(placed.card.id);
    setPhase("draw-placement");
    setAnnouncement(`${placed.card.points} 點・${placed.card.attributeLabel} 已重新抽起並翻回正面`);
  }, [activeDrawIndex, phase, playStarCardsAudio, playerPlaced]);

  const moveDirectionalSelection = useCallback(
    (direction: number) => {
      setNavigationMode("directional");
      setHoveredHandCardId(null);
      if (phase === "battle-ready") {
        setBattleNavigationIndex((current) => (current + direction + 2) % 2);
        return;
      }
      if (phase === "initial-placement" || phase === "draw-placement") {
        if (heldCardId) {
          setSelectedLaneIndex(
            (current) => Math.max(0, Math.min(STAR_CARD_LANES.length - 1, current + direction)),
          );
        } else if (playerHand.length > 0) {
          setSelectedHandIndex(
            (current) => Math.max(0, Math.min(playerHand.length - 1, current + direction)),
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
      dismissPlacementPrompt();
      const currentLaneCount = playerPlaced.filter(
        (placed) => placed.lane === STAR_CARD_LANES[selectedLaneIndex],
      ).length;
      if (!canPlaceStarCard(phase, currentLaneCount)) {
        const firstAvailableLaneIndex = STAR_CARD_LANES.findIndex((lane) =>
          canPlaceStarCard(
            phase,
            playerPlaced.filter((placed) => placed.lane === lane).length,
          ),
        );
        if (firstAvailableLaneIndex >= 0) setSelectedLaneIndex(firstAvailableLaneIndex);
      }
      setHeldCardId(selected.card.id);
      setAnnouncement(`已選取 ${selected.card.points} 點・${selected.card.attributeLabel}，選擇格子後按 A`);
      return;
    }
    placeCard(heldCardId, STAR_CARD_LANES[selectedLaneIndex]);
  }, [battleNavigationIndex, dismissPlacementPrompt, drawNextCard, heldCardId, liftPlacedDrawCard, phase, placeCard, playerHand, playerPlaced, resolveBattle, selectedHandIndex, selectedLaneIndex]);

  const navigationRef = useRef({
    move: moveDirectionalSelection,
    activate: activateDirectionalSelection,
    mode: navigationMode,
  });
  useEffect(() => {
    navigationRef.current = {
      move: moveDirectionalSelection,
      activate: activateDirectionalSelection,
      mode: navigationMode,
    };
  }, [activateDirectionalSelection, moveDirectionalSelection, navigationMode]);

  useEffect(() => {
    const handleVirtualCursor = (event: Event) => {
      const detail = (event as CustomEvent<{ cardId?: string | null }>).detail;
      setNavigationMode("pointer");
      setHoveredHandCardId(detail?.cardId ?? null);
    };
    window.addEventListener("echoes:star-cards-cursor", handleVirtualCursor);
    return () => window.removeEventListener("echoes:star-cards-cursor", handleVirtualCursor);
  }, []);

  useEffect(() => {
    preselectedHandCardIdRef.current = heldCardId ?? (
      navigationMode === "directional"
        ? playerHand[selectedHandIndex]?.card.id ?? null
        : hoveredHandCardId
    );
  }, [heldCardId, hoveredHandCardId, navigationMode, playerHand, selectedHandIndex]);

  useEffect(() => {
    let frame = 0;
    const updateHandFloat = (now: number) => {
      const shells = dialogRef.current?.querySelectorAll<HTMLElement>(
        ".star-card-shell.is-hand[data-star-cards-hand-card-id]",
      );
      const activeCardIds = new Set<string>();
      shells?.forEach((shell) => {
        const cardId = shell.dataset.starCardsHandCardId;
        const hoverLayer = shell.querySelector<HTMLElement>(".star-card-hover");
        if (!cardId || !hoverLayer) return;
        activeCardIds.add(cardId);
        const targetRate = cardId === preselectedHandCardIdRef.current ? 1.2 : 1;
        let motion = handFloatMotionRef.current.get(cardId);
        if (!motion) {
          motion = {
            phase: 0,
            lastTime: now,
            playbackRate: 1,
            fromRate: 1,
            targetRate,
            rateBlendStartedAt: now,
          };
          handFloatMotionRef.current.set(cardId, motion);
        }
        if (motion.targetRate !== targetRate) {
          motion.fromRate = motion.playbackRate;
          motion.targetRate = targetRate;
          motion.rateBlendStartedAt = now;
        }

        const deltaSeconds = Math.min(0.05, Math.max(0, (now - motion.lastTime) / 1000));
        motion.lastTime = now;
        const blendProgress = Math.min(1, (now - motion.rateBlendStartedAt) / 280);
        const easedBlend = blendProgress * blendProgress * (3 - 2 * blendProgress);
        motion.playbackRate =
          motion.fromRate + (motion.targetRate - motion.fromRate) * easedBlend;
        hoverLayer.style.setProperty("--hand-float-rate", motion.playbackRate.toFixed(3));

        if (shell.classList.contains("is-dealing") || shell.classList.contains("is-dragging")) {
          hoverLayer.style.removeProperty("transform");
          return;
        }

        motion.phase = (motion.phase + deltaSeconds * motion.playbackRate * Math.PI * 2 / 2.25) % (Math.PI * 2);
        const cosine = Math.cos(motion.phase);
        const floatY = -4.5 + cosine * 4.5;
        const floatRotation = cosine * -0.45;
        hoverLayer.style.transform =
          `translateY(${floatY.toFixed(3)}px) rotate(${floatRotation.toFixed(3)}deg)`;
      });
      handFloatMotionRef.current.forEach((_motion, cardId) => {
        if (!activeCardIds.has(cardId)) handFloatMotionRef.current.delete(cardId);
      });
      frame = window.requestAnimationFrame(updateHandFloat);
    };
    frame = window.requestAnimationFrame(updateHandFloat);
    return () => {
      window.cancelAnimationFrame(frame);
      handFloatMotionRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let horizontalArmed = true;
    const openingGamepad = navigator.getGamepads?.().find((candidate) => candidate) ?? null;
    let confirmHeld = Boolean(openingGamepad?.buttons[0]?.pressed);
    let cancelHeld = Boolean(
      openingGamepad?.buttons[1]?.pressed || openingGamepad?.buttons[8]?.pressed,
    );
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
        if (
          confirm &&
          !confirmHeld &&
          navigationRef.current.mode === "directional"
        ) {
          navigationRef.current.activate();
        }
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
    if (draggingRef.current) return;
    const canDragHand = source === "hand" &&
      (phase === "initial-placement" || phase === "draw-placement");
    const canReposition = source === "placed-draw" &&
      (phase === "draw-placed" || phase === "battle-ready");
    if (!canDragHand && !canReposition) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dismissPlacementPrompt();
    setNavigationMode("pointer");
    setHeldCardId(null);
    const dragPoint = { x: event.clientX, y: event.clientY };
    const originBounds = event.currentTarget.getBoundingClientRect();
    const originRotationDeg = Number.parseFloat(
      window.getComputedStyle(event.currentTarget).getPropertyValue("--hand-idle-angle"),
    ) || 0;
    const nextDragging: DragState = {
      cardId,
      pointerId: event.pointerId,
      x: dragPoint.x,
      y: dragPoint.y,
      originX: originBounds.left + originBounds.width / 2,
      originY: originBounds.top + originBounds.height / 2,
      originRotationDeg,
      source,
      originalLane,
    };
    draggingRef.current = nextDragging;
    dragElementRef.current = event.currentTarget;
    dragPointRef.current = dragPoint;
    dropLaneBoundsRef.current = measureDropLaneBounds();
    hoveredLaneRef.current = null;
    event.currentTarget.style.setProperty("--drag-x", `${dragPoint.x}px`);
    event.currentTarget.style.setProperty("--drag-y", `${dragPoint.y}px`);
    if (source === "placed-draw") {
      playStarCardsAudio("starCardsCardFlipped");
      markCardsRevealingFront([cardId]);
      setRepositioningCardId(cardId);
      setPhase("draw-placement");
      setPlayerPlaced((cards) => cards.map((placed) =>
        placed.card.id === cardId ? { ...placed, faceDown: false } : placed,
      ));
      setAnnouncement("本輪新牌已抽起並翻回正面，拖曳到新的格子");
    }
    setDragging(nextDragging);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const activeDrag = draggingRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    queueDragFrame({ x: event.clientX, y: event.clientY });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const activeDrag = draggingRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    stopDragFrame();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const lane = getDropLane(event.clientX, event.clientY);
    if (activeDrag.source === "placed-draw") {
      const destinationCount = lane
        ? playerPlaced.filter(
            (placed) => placed.lane === lane && placed.card.id !== activeDrag.cardId,
          ).length
        : 3;
      if (lane && destinationCount >= 3) {
        showFullLaneFeedback();
        playStarCardsAudio("starCardsCardFlipped");
        setPlayerPlaced((cards) => cards.map((placed) =>
          placed.card.id === activeDrag.cardId ? { ...placed, faceDown: true } : placed,
        ));
        setRepositioningCardId(null);
        setPhase("draw-placed");
        returnDraggedCardToIdle(
          activeDrag,
          event.currentTarget,
          { x: event.clientX, y: event.clientY },
        );
        return;
      }
      const destination = lane && destinationCount < 3 ? lane : activeDrag.originalLane;
      if (destination) {
        playStarCardsAudio("starCardsCardFlipped");
        setActivatedPlayerLanes((current) =>
          current.includes(destination) ? current : [...current, destination],
        );
        setPlayerPlaced((cards) => cards.map((placed) =>
          placed.card.id === activeDrag.cardId
            ? { ...placed, lane: destination, faceDown: true }
            : placed,
        ));
        setSnappingCardId(activeDrag.cardId);
        setPhase("draw-placed");
        setAnnouncement(
          lane && destination === lane
            ? `本輪新牌已重新蓋牌放入 ${lane} 格`
            : "該位置無法放牌，卡牌已回到原位",
        );
        schedule(() => setSnappingCardId(null), STAR_CARD_PLACE_FEEDBACK_MS);
      }
      setRepositioningCardId(null);
    } else if (lane) {
      const placed = placeCard(activeDrag.cardId, lane);
      if (!placed) {
        returnDraggedCardToIdle(
          activeDrag,
          event.currentTarget,
          { x: event.clientX, y: event.clientY },
        );
        return;
      }
    } else {
      setAnnouncement("請將卡牌放開在 A／B／C 格內");
      returnDraggedCardToIdle(
        activeDrag,
        event.currentTarget,
        { x: event.clientX, y: event.clientY },
      );
      return;
    }
    clearDragInteraction();
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const activeDrag = draggingRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    if (activeDrag.source === "placed-draw") {
      playStarCardsAudio("starCardsCardFlipped");
      setPlayerPlaced((cards) => cards.map((placed) =>
        placed.card.id === activeDrag.cardId ? { ...placed, faceDown: true } : placed,
      ));
      setRepositioningCardId(null);
      setPhase("draw-placed");
    }
    clearDragInteraction();
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
      stackDepth?: number;
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
    const isHoveredHand =
      Boolean(hand) &&
      navigationMode === "pointer" &&
      !heldCardId &&
      hoveredHandCardId === card.id;
    const isPreselectedHand = isSelectedHand || isHoveredHand;
    const isSelectedMovable =
      Boolean(options.movable) &&
      phase === "battle-ready" &&
      navigationMode === "directional" &&
      battleNavigationIndex === 0;
    const isRevealingFront = !options.faceDown && (
      phase === "revealing" || revealingFrontCardIds.includes(card.id)
    );
    const handX = hand?.drawCard ? 50 : PLAYER_HAND_X[hand?.dealIndex ?? 1] ?? 50;
    const handBottom = hand?.drawCard
      ? 7.1
      : PLAYER_HAND_BOTTOM[hand?.dealIndex ?? 1] ?? 7.1;
    const handRotation = hand?.drawCard
      ? 0
      : PLAYER_HAND_ROTATION[hand?.dealIndex ?? 1] ?? 0;
    const stackDepth = options.stackDepth ?? 0;
    const stackInwardDirection = options.laneIndex === 0
      ? 1
      : options.laneIndex === 2
        ? -1
        : 0;
    const dealX = 50 - handX;
    const aiDealX = options.laneIndex === 0 ? 23 : options.laneIndex === 2 ? -23 : 0;
    const style: StarCardStyle = isDragging
      ? {
          "--drag-x": `${dragging.x}px`,
          "--drag-y": `${dragging.y}px`,
        }
      : hand
        ? {
            "--hand-x": `${handX}%`,
            "--hand-bottom": `${handBottom}%`,
            "--hand-idle-angle": `${handRotation}deg`,
            "--deal-x": `${dealX}vw`,
            "--deal-delay": `${hand.dealIndex * 90}ms`,
          }
        : options.aiPending
          ? {
              "--deal-delay": "0ms",
            }
        : {
            "--stack-index": options.stackIndex ?? 0,
            "--stack-depth": stackDepth,
            "--stack-scale": Math.max(0.94, 1 - stackDepth * 0.02),
            "--stack-inward-x": `${stackInwardDirection * stackDepth * 0.36}vw`,
            "--deal-x": `${aiDealX}vw`,
            "--deal-delay": `${options.dealIndex * 110}ms`,
          };

    return (
      <div
        key={card.id}
        className={`star-card-shell${options.aiPending ? " is-ai-pending" : hand ? " is-hand" : " is-placed"}${hand?.drawCard ? " is-draw-card" : ""}${options.owner === "ai" ? " is-ai" : " is-player"}${isDragging ? " is-dragging" : ""}${isHeld ? " is-held" : ""}${isPreselectedHand ? " is-preselected" : ""}${isSelectedMovable ? " is-gamepad-selected" : ""}${snappingCardId === card.id ? " is-snapping" : ""}${destroyingCardIds.includes(card.id) ? " is-destroying" : ""}${victoriousCardIds.includes(card.id) ? " is-victorious" : ""}${phase === "dealing" || (hand?.drawCard && !settledHandCardIds.includes(card.id)) || options.aiPending ? " is-dealing" : ""}`}
        style={style}
        data-star-cards-hand-card-id={hand ? card.id : undefined}
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
        onAnimationEnd={
          hand?.drawCard
            ? (event) => {
                if (event.animationName !== "star-card-deal-player") return;
                setSettledHandCardIds((current) =>
                  current.includes(card.id) ? current : [...current, card.id],
                );
              }
            : undefined
        }
        onPointerEnter={
          hand
            ? (event) => {
                if (event.pointerType !== "mouse") return;
                setNavigationMode("pointer");
                setHoveredHandCardId(card.id);
              }
            : undefined
        }
        onPointerLeave={
          hand
            ? (event) => {
                if (event.pointerType !== "mouse") return;
                const nextTarget = event.relatedTarget;
                if (
                  nextTarget instanceof Element &&
                  nextTarget.closest(".star-card-shell.is-hand")
                ) {
                  return;
                }
                setHoveredHandCardId((current) => current === card.id ? null : current);
              }
            : undefined
        }
        onClick={
          hand
            ? (event) => {
                if (event.detail !== 0 || draggingRef.current) return;
                dismissPlacementPrompt();
                setNavigationMode("directional");
                setHoveredHandCardId(null);
                setSelectedHandIndex(Math.max(0, handIndex));
                setHeldCardId(card.id);
              }
            : undefined
        }
        onKeyDown={
          hand
            ? (event: ReactKeyboardEvent<HTMLDivElement>) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                dismissPlacementPrompt();
                setNavigationMode("directional");
                setSelectedHandIndex(Math.max(0, handIndex));
                setHeldCardId(card.id);
              }
            : undefined
        }
      >
        <div className="star-card-selection-motion">
          <div className="star-card-hover">
            <div className={`star-card-inner${options.faceDown ? " is-face-down" : ""}${isRevealingFront ? " is-revealing-front" : ""}`}>
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
                  <img
                    className="star-card-back-point"
                    src={starCardsAssetUrl(`b-${card.points}.png`)}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
                  <img
                    className="star-card-back-attribute"
                    src={starCardsAssetUrl(`${card.attribute}2.png`)}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
                </div>
              ) : null}
            </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const directionalLaneHighlight =
    navigationMode === "directional" && heldCardId
      ? STAR_CARD_LANES[selectedLaneIndex]
      : null;
  const activeDropHighlightLane = hoveredLane ?? directionalLaneHighlight;
  const handPreselectionActive =
    Boolean(heldCardId) || (
      Boolean(hoveredHandCardId) ||
      (navigationMode === "directional" && playerHand.length > 0)
    );

  return (
    <div className="star-cards-overlay" data-star-cards-open="true">
      <section
        ref={dialogRef}
        className={`star-cards-dialog is-${phase}${handPreselectionActive ? " has-hand-preselection" : ""}`}
        data-navigation-mode={navigationMode}
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

        <img
          className={`star-cards-drop-highlight${activeDropHighlightLane ? ` is-${activeDropHighlightLane.toLowerCase()}` : ""}`}
          src={starCardsAssetUrl("drop-lane-highlight.png")}
          alt=""
          aria-hidden="true"
          draggable={false}
        />

        {placementPrompt ? (
          <div
            key={placementPrompt.serial}
            className={`star-cards-placement-prompt${placementPrompt.exiting ? " is-exiting" : ""}`}
            role="status"
            aria-live="polite"
            aria-hidden={placementPrompt.exiting || undefined}
          >
            <span>
              {placementPrompt.kind === "initial"
                ? "將卡牌自由分配到任一個戰區中"
                : "將卡牌拖曳到其中一個戰區"}
            </span>
          </div>
        ) : null}

        {dropFeedback ? (
          <div
            key={dropFeedback.serial}
            className="star-cards-drop-feedback"
            role="status"
            aria-live="assertive"
          >
            <span>{dropFeedback.text}</span>
          </div>
        ) : null}

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
            src={starCardsAssetUrl("CardF1.png")}
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
            {getLaneCards("ai", lane).map((placed, stackIndex, laneCards) =>
              renderCard(placed.card, {
                owner: "ai",
                faceDown: placed.faceDown,
                stackIndex,
                stackDepth: laneCards.length - stackIndex - 1,
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
              className={`star-cards-lane is-player-lane${laneSelected ? " is-directional-target" : ""}${laneContainsDraggingCard ? " is-drag-source" : ""}`}
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
              <span
                className={`star-cards-zone-title${activatedPlayerLanes.includes(lane) ? " has-been-used" : ""}`}
                aria-hidden="true"
              >
                <img
                  className="is-main"
                  src={starCardsAssetUrl(`zone-${laneIndex + 1}.png`)}
                  alt=""
                  draggable={false}
                />
                <img
                  className="is-echo is-first"
                  src={starCardsAssetUrl(`zone-${laneIndex + 1}.png`)}
                  alt=""
                  draggable={false}
                />
                <img
                  className="is-echo is-second"
                  src={starCardsAssetUrl(`zone-${laneIndex + 1}.png`)}
                  alt=""
                  draggable={false}
                />
              </span>
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
                  stackDepth: laneCards.length - stackIndex - 1,
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
              {(["is-one", "is-two", "is-three"] as const).map((className, index) => (
                <span
                  className={`star-cards-attack-trail ${className}`}
                  key={className}
                  style={effect.missileTrailLayout
                    ? {
                        "--battle-spark-offset":
                          `${effect.missileTrailLayout[index].lateralOffsetVw}vw`,
                        "--battle-missile-depth-offset":
                          `${effect.missileTrailLayout[index].depthOffsetCqh}cqh`,
                        animationDelay:
                          `${effect.missileTrailLayout[index].animationDelayMs}ms`,
                      } as StarCardStyle
                    : undefined}
                />
              ))}
              <span className="star-cards-impact" />
              {effect.outcome !== "tie" ? (
                <span className="star-cards-impact-particles">
                  {effect.impactParticleLayout?.map((particle, index) => (
                    <span
                      className="star-cards-impact-particle"
                      key={`gold-particle-${index + 1}`}
                      style={{
                        "--impact-particle-x": `${particle.offsetXCqw}cqw`,
                        "--impact-particle-y": `${particle.offsetYCqh}cqh`,
                        "--impact-particle-angle": `${particle.angleDeg}deg`,
                        "--impact-particle-delay": `${particle.animationDelayMs}ms`,
                        "--impact-particle-duration": `${particle.animationDurationMs}ms`,
                      } as StarCardStyle}
                    />
                  ))}
                </span>
              ) : null}
            </div>
          ))}
          {battleScorePopups.map((popup) => (
            <span
              className={`star-cards-score-popup is-${popup.owner}`}
              data-lane={popup.lane}
              key={`${popup.lane}-${popup.owner}`}
            >
              +{popup.points}
            </span>
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
