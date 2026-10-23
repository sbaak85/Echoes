"use client";

import { GamepadHint } from "./gamepad-button-icon";
import { cursorOwnership } from "./cursor-ownership";
import { createStarCardsTutorialDeck, matchTutorialOpponentLanes, canPlaceStarCardsTutorialCard, getStarCardsTutorialOpeningLane, createStarCardsTutorialBattleSequence, advanceStarCardsSecondDrawLesson, scheduleStarCardsTutorialRecap, type StarCardsBattleLesson, type StarCardsSecondDrawStage } from "./star-cards-tutorial";
import { StarCardsTutorialOverlay, type StarCardsTutorialStage } from "./star-cards-tutorial-overlay";

/* eslint-disable @next/next/no-img-element -- game sprites must preserve exact pixels and alpha */

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  STAR_CARD_DECK,
  STAR_CARD_LANES,
  getStarCardsMatchWinner,
  type StarCardsMatchResult,
  canPlaceStarCard,
  compareStarCards,
  createStarCardsAttackParticleLayout,
  createStarCardsImpactSpriteChoice,
  createStarCardsMissileTrailLayout,
  STAR_CARDS_TIE_SPRITE_ROTATE_DEG,
  clampStarCardsMissileCount,
  getStarCardsMissileMainOffsets,
  STAR_CARDS_MISSILE_ESCORT_COUNT,
  STAR_CARDS_MISSILE_ESCORT_COUNT_RANGE,
  STAR_CARDS_MISSILE_MAIN_COUNT,
  STAR_CARDS_MISSILE_MAIN_COUNT_RANGE,
  STAR_CARDS_IMPACT_START_MS,
  STAR_CARDS_SHIELD_DOME_CELLS,
  STAR_CARDS_SHIELD_DOME_VIEWBOX,
  getStarCardBattleScore,
  shouldAnimateStarCardsZone,
  shuffleStarCardDeck,
  starCardsAssetUrl,
  type StarCardDefinition,
  type StarCardLane,
  type StarCardsAttackParticleLayout,
  type StarCardsMissileTrailLayout,
} from "./star-cards-game";
import { STAR_CARDS_IMPACT_SPRITES, STAR_CARDS_TIE_SPRITE } from "./star-cards-impact-sprites";
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
  impactSprite?: LaneImpactSprite;
  attackParticleLayout?: StarCardsAttackParticleLayout;
  missileTrailLayout?: StarCardsMissileTrailLayout;
  missileMainOffsets?: readonly number[];
  tieSprite?: LaneImpactSprite;
  awardedPoints: 0 | 1 | 2 | 3;
};

/** 飛彈數量寫在 globals.css 的 battle layer 上（與其他特效參數同一處），開打當下讀取。 */
function readStarCardsMissileCounts(layer: HTMLElement | null) {
  const style = layer ? getComputedStyle(layer) : null;
  const read = (name: string) => Number.parseFloat(style?.getPropertyValue(name) ?? "");
  return {
    main: clampStarCardsMissileCount(read("--fx-missile-main-count"), STAR_CARDS_MISSILE_MAIN_COUNT_RANGE, STAR_CARDS_MISSILE_MAIN_COUNT),
    escort: clampStarCardsMissileCount(read("--fx-missile-escort-count"), STAR_CARDS_MISSILE_ESCORT_COUNT_RANGE, STAR_CARDS_MISSILE_ESCORT_COUNT),
  };
}

/**
 * 平手氣爆：雙方能量在兩張牌正中間對撞，像空氣被炸開一樣往四面八方擴散（全白）。
 * 閃光、凝結霧、衝擊環、放射線已烘成序列圖（1 個元素，每次隨機旋轉／鏡像／大小）；
 * 扭曲背景的氣壓波無法烘焙，保留即時播放。
 */
function StarCardsTieShock({ sprite }: { sprite: LaneImpactSprite }) {
  return (
    <span className="star-cards-tie-shock">
      <span className="star-cards-tie-wave" />
      <span
        className="star-cards-impact-sprite is-tie"
        style={{
          "--sprite-image": `url("${starCardsAssetUrl(sprite.file)}")`,
          "--sprite-frames": sprite.frames,
          "--sprite-duration": `${sprite.durationMs}ms`,
          "--sprite-box": `${sprite.boxCqw}cqw`,
          "--sprite-flip": sprite.flipX ? -1 : 1,
          "--sprite-rotate": `${sprite.rotateDeg}deg`,
          "--sprite-scale": sprite.scale,
        } as StarCardStyle}
      >
        <span className="star-cards-impact-sprite-strip" />
      </span>
    </span>
  );
}

function createTieSprite(): LaneImpactSprite {
  const choice = createStarCardsImpactSpriteChoice(STAR_CARDS_TIE_SPRITE.files.length, Math.random, STAR_CARDS_TIE_SPRITE_ROTATE_DEG);
  return {
    file: STAR_CARDS_TIE_SPRITE.files[choice.variant],
    frames: STAR_CARDS_TIE_SPRITE.frames,
    durationMs: STAR_CARDS_TIE_SPRITE.durationMs,
    boxCqw: STAR_CARDS_TIE_SPRITE.boxCqw,
    flipX: choice.flipX,
    rotateDeg: choice.rotateDeg,
    scale: choice.scale,
  };
}

/** 戰鬥特效時間軸（從按下 BATTLE 起算） */
const BATTLE_EFFECTS_START_MS = 520;
const BATTLE_EFFECTS_CLEANUP_MS = 2050;
/** 飛彈特效最晚留到這裡（下一輪 DRAW 在 2950ms 開放），避免跟下一輪重疊 */
const BATTLE_EFFECTS_MAX_LINGER_MS = 2900;
/** 尾隨彈落點小爆炸長度，與 globals.css 的 star-cards-escort-blast 動畫一致 */
const STAR_CARDS_ESCORT_BLAST_MS = 320;

/** CSS 時間值（"680ms"、".68s"）轉成毫秒；讀不到時用備用值 */
function parseCssTimeMs(value: string, fallback: number) {
  const trimmed = value.trim();
  const number = Number.parseFloat(trimmed);
  if (!Number.isFinite(number)) return fallback;
  return trimmed.endsWith("ms") ? number : trimmed.endsWith("s") ? number * 1000 : number;
}

/** 飛彈抵達時間（300ms ÷ 飛行速度）與齊射總時間，讀自 battle layer 的 CSS 變數 */
function readStarCardsMissileTiming(layer: HTMLElement | null) {
  const style = layer ? getComputedStyle(layer) : null;
  const speed = Number.parseFloat(style?.getPropertyValue("--fx-missile-speed") ?? "");
  return {
    arriveMs: STAR_CARDS_IMPACT_START_MS.missile / (Number.isFinite(speed) && speed > 0 ? speed : 1),
    salvoMs: parseCssTimeMs(style?.getPropertyValue("--fx-missile-salvo") ?? "", 0),
  };
}

/** 命中爆炸序列圖：烘焙好的版本＋這次播放的鏡像、旋轉、大小變化。 */
type LaneImpactSprite = {
  file: string;
  frames: number;
  durationMs: number;
  boxCqw: number;
  flipX: boolean;
  rotateDeg: number;
  scale: number;
};

function createLaneImpactSprite(attribute: StarCardDefinition["attribute"]): LaneImpactSprite {
  const sprite = STAR_CARDS_IMPACT_SPRITES[attribute];
  const choice = createStarCardsImpactSpriteChoice(sprite.files.length);
  return {
    file: sprite.files[choice.variant],
    frames: sprite.frames,
    durationMs: sprite.durationMs,
    boxCqw: sprite.boxCqw,
    flipX: choice.flipX,
    rotateDeg: choice.rotateDeg,
    scale: choice.scale,
  };
}

/** 牌局開啟時先載入並解碼所有命中序列圖，避免第一次命中時才下載造成卡頓。 */
function preloadStarCardsImpactSprites() {
  for (const sprite of [...Object.values(STAR_CARDS_IMPACT_SPRITES), STAR_CARDS_TIE_SPRITE]) {
    for (const file of sprite.files) {
      const image = new Image();
      image.decoding = "async";
      image.src = starCardsAssetUrl(file);
      void image.decode?.().catch(() => undefined);
    }
  }
}

/**
 * 護盾半球：球面上貼六角格（弧頂朝目標），邊緣的格子被透視壓扁；
 * 最外圈格子漸淡並加模糊。格子由中心往外、再由弧頂往兩側依序點亮。
 */
function StarCardsShieldDome() {
  // 同一畫面可能同時有三路護盾，漸層與模糊濾鏡的 id 必須各自獨立
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg className="star-cards-shield-dome" viewBox={STAR_CARDS_SHIELD_DOME_VIEWBOX} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-cell`} x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0" stopColor="#d4fcff" />
          <stop offset="0.42" stopColor="#4cc8ff" />
          <stop offset="1" stopColor="#1a64dc" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>
      {STAR_CARDS_SHIELD_DOME_CELLS.map((cell, index) => (
        <polygon
          className={`star-cards-shield-cell${cell.isEdge ? " is-edge" : ""}`}
          key={`shield-cell-${index + 1}`}
          points={cell.points}
          fill={`url(#${id}-cell)`}
          filter={cell.isEdge ? `url(#${id}-soft)` : undefined}
          style={{
            "--cell-rim": cell.rim,
            "--cell-facing": cell.facing,
            "--cell-fade": cell.fade,
            "--cell-launch-delay": `${cell.launchDelayMs}ms`,
            "--cell-hit-delay": `${cell.hitDelayMs}ms`,
          } as StarCardStyle}
        />
      ))}
    </svg>
  );
}

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
  onMatchCompleted?: (result: StarCardsMatchResult) => void;
  audioEvents: Pick<AudioEventManager, "play"> | null;
  initialGamepadMode?: boolean;
  gamepadMode?: boolean;
  /** The first interaction launch or standalone preview opts in explicitly. */
  tutorialEnabled?: boolean;
  inputSuspended?: boolean;
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

function createOwnerDeck(owner: StarCardsOwner, gameNumber = 1, tutorial = false) {
  return (tutorial ? createStarCardsTutorialDeck(owner) : shuffleStarCardDeck()).map((card) => ({
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
  onMatchCompleted,
  audioEvents,
  initialGamepadMode = false,
  gamepadMode = initialGamepadMode,
  tutorialEnabled = false,
  inputSuspended = false,
}: StarCardsGameProps) {
  const inputSuspendedRef = useRef(inputSuspended);
  inputSuspendedRef.current = inputSuspended;
  const [tutorialActive, setTutorialActive] = useState(tutorialEnabled);
  const tutorialActiveRef = useRef(tutorialActive);
  tutorialActiveRef.current = tutorialActive;
  const [drawTutorialReady, setDrawTutorialReady] = useState(false);
  const [battleLesson, setBattleLesson] = useState<StarCardsBattleLesson | null>(null);
  const [secondDrawStage, setSecondDrawStage] = useState<StarCardsSecondDrawStage | null>(null);
  const secondDrawStageRef = useRef(secondDrawStage);
  secondDrawStageRef.current = secondDrawStage;
  const secondDrawReading = ["choice", "known", "recap-dark", "recap", "recap-stack", "encourage"].includes(secondDrawStage ?? "");
  const tutorialDrawLane: StarCardLane = secondDrawStage ? "C" : "B";
  const tutorialAutoActionRef = useRef<"draw" | "battle" | null>(null);
  const canPlaceTutorialCard = useCallback((currentPhase: string, lane: StarCardLane, card?: StarCardDefinition) =>
    canPlaceStarCardsTutorialCard(tutorialActive, currentPhase, lane, card, secondDrawStage), [tutorialActive, secondDrawStage]);
  const continueSecondDrawLesson = useCallback(() => {
    if (exitPromptRef.current || inputSuspendedRef.current || !secondDrawStage) return;
    if (secondDrawStageRef.current !== secondDrawStage) return;
    const next = advanceStarCardsSecondDrawLesson(secondDrawStage);
    secondDrawStageRef.current = next;
    setSecondDrawStage(next);
    if (next === null) setTutorialActive(false);
  }, [secondDrawStage]);
  const battleLessonRef = useRef(battleLesson);
  battleLessonRef.current = battleLesson;
  const tutorialBattleRef = useRef<ReturnType<typeof createStarCardsTutorialBattleSequence> | null>(null);
  useEffect(() => () => tutorialBattleRef.current?.cancel(), []);
  const continueBattleLesson = useCallback(() => {
    if (exitPromptRef.current || inputSuspendedRef.current) return;
    tutorialBattleRef.current?.confirm(battleLesson);
  }, [battleLesson]);
  const matchReportedRef = useRef(false);
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const exitPromptRef = useRef(false);
  const [exitChoice, setExitChoice] = useState(0);
  const exitChoiceRef = useRef(0);
  const [exitHoverChoice, setExitHoverChoice] = useState<number | null>(null);
  const exitDialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [playerInitialDeck] = useState(() => createOwnerDeck("player", 1, tutorialEnabled));
  const [aiInitialDeck] = useState(() => createOwnerDeck("ai", 1, tutorialEnabled));

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
    outcome: "victory" | "defeat" | "tie";
  } | null>(null);
  const [playerGameWins, setPlayerGameWins] = useState(0);
  const [aiGameWins, setAiGameWins] = useState(0);
  const [battleEffects, setBattleEffects] = useState<LaneBattleEffect[]>([]);
  const battleLayerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { preloadStarCardsImpactSprites(); }, []);
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
  const timersRef = useRef<{ timer: number; remaining: number; started: number; run: () => void }[]>([]);
  const placementPromptRef = useRef<PlacementPromptState | null>(null);
  const placementPromptSerialRef = useRef(0);
  const placementPromptRequestRef = useRef(0);
  const dropFeedbackSerialRef = useRef(0);

  const schedule = useCallback((callback: () => void, delayMs: number) => {
    const task = { timer: 0, remaining: delayMs, started: performance.now(), run: () => {} };
    task.run = () => {
      timersRef.current = timersRef.current.filter((candidate) => candidate !== task);
      callback();
    };
    if (!exitPromptRef.current && !inputSuspendedRef.current) task.timer = window.setTimeout(task.run, delayMs);
    timersRef.current.push(task);
    return task.timer;
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
    // Hide ordinary hints only while guided Tips own the interaction.
    if (tutorialActiveRef.current) return;
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
      timersRef.current.forEach((task) => window.clearTimeout(task.timer));
      timersRef.current = [];
    };
  }, [initialGamepadMode, playInitialDealAudio, schedule, showPlacementPrompt, tutorialEnabled]);

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

  const requestExit = useCallback(() => {
    if (exitPromptRef.current) return;
    exitPromptRef.current = true;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    timersRef.current.forEach((task) => {
      window.clearTimeout(task.timer);
      task.remaining = Math.max(0, task.remaining - (performance.now() - task.started));
    });
    const drag = draggingRef.current;
    const element = dragElementRef.current;
    if (drag?.source === "placed-draw") {
      setPlayerPlaced((cards) => cards.map((placed) =>
        placed.card.id === drag.cardId ? { ...placed, faceDown: true } : placed,
      ));
      setRepositioningCardId(null);
      setPhase("draw-placed");
    }
    if (drag && element?.hasPointerCapture(drag.pointerId)) element.releasePointerCapture(drag.pointerId);
    clearDragInteraction();
    setHeldCardId(null);
    setHoveredHandCardId(null);
    exitChoiceRef.current = 0;
    setExitChoice(0);
    setExitPromptOpen(true);
  }, [clearDragInteraction]);

  const resumeMatch = useCallback(() => {
    if (!exitPromptRef.current) return;
    exitPromptRef.current = false;
    if (!inputSuspendedRef.current) timersRef.current.forEach((task) => {
      task.started = performance.now();
      task.timer = window.setTimeout(task.run, task.remaining);
    });
    setExitPromptOpen(false);
  }, []);

  useEffect(() => {
    if (exitPromptRef.current) return;
    timersRef.current.forEach((task) => {
      if (inputSuspended) {
        window.clearTimeout(task.timer);
        task.remaining = Math.max(0, task.remaining - (performance.now() - task.started));
      } else {
        window.clearTimeout(task.timer);
        task.started = performance.now();
        task.timer = window.setTimeout(task.run, task.remaining);
      }
    });
    if (inputSuspended) {
      const drag = draggingRef.current;
      const element = dragElementRef.current;
      if (drag?.source === "placed-draw") {
        setPlayerPlaced((cards) => cards.map((placed) =>
          placed.card.id === drag.cardId ? { ...placed, faceDown: true } : placed,
        ));
        setRepositioningCardId(null);
        setPhase("draw-placed");
      }
      if (drag && element?.hasPointerCapture(drag.pointerId)) element.releasePointerCapture(drag.pointerId);
      clearDragInteraction();
      setHeldCardId(null);
      setHoveredHandCardId(null);
    }
  }, [inputSuspended, clearDragInteraction]);

  const confirmExit = useCallback(() => {
    // Clear pending results before the parent unmounts; abandoning never reports a win.
    timersRef.current.forEach((task) => window.clearTimeout(task.timer));
    timersRef.current = [];
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (exitPromptOpen) exitDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    else if (returnFocusRef.current) {
      if (returnFocusRef.current.isConnected) returnFocusRef.current.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }
  }, [exitPromptOpen]);

  const moveExitChoice = useCallback(() => {
    cursorOwnership.take("directional");
    navigationRef.current.mode = "directional";
    setNavigationMode("directional");
    exitChoiceRef.current = 1 - exitChoiceRef.current;
    setExitChoice(exitChoiceRef.current);
    exitDialogRef.current?.querySelectorAll<HTMLButtonElement>("button")[exitChoiceRef.current]?.focus({ preventScroll: true });
  }, []);

  const exitActionsRef = useRef({ requestExit, resumeMatch, confirmExit, moveExitChoice });
  exitActionsRef.current = { requestExit, resumeMatch, confirmExit, moveExitChoice };

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
      if (exitPromptRef.current || inputSuspendedRef.current) return false;
      if (phase !== "initial-placement" && phase !== "draw-placement") return false;
      const handCard = playerHand.find((candidate) => candidate.card.id === cardId);
      if (!handCard) return false;
      if (!canPlaceTutorialCard(phase, lane, handCard.card)) {
        const destination = phase === "initial-placement" ? getStarCardsTutorialOpeningLane(handCard.card)! : tutorialDrawLane;
        setAnnouncement("位置錯誤：請將" + handCard.card.attributeLabel + " <" + handCard.card.points + "點> 放置到 ZONE " + (STAR_CARD_LANES.indexOf(destination) + 1));
        playStarCardsAudio("interactionDenied");
        return false;
      }
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
        if (tutorialActive) setAiPlaced((cards) => matchTutorialOpponentLanes(nextPlaced, cards));
        revealInitialCards();
      } else if (phase === "draw-placement") {
        if (secondDrawStage === "risk") setSecondDrawStage("placed");
        setPhase("draw-placed");
      }
      return true;
    },
    [phase, tutorialActive, secondDrawStage, canPlaceTutorialCard, tutorialDrawLane, playStarCardsAudio, playerHand, playerPlaced, revealInitialCards, schedule, showFullLaneFeedback],
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
    if (exitPromptRef.current || inputSuspendedRef.current) return;
    if (secondDrawStage && secondDrawStage !== "pending-draw") return;
    if (phase !== "draw-ready") return;
    const nextCard = playerRemainingDeck[0];
    const aiCard = aiRemainingDeck[0];
    if (!nextCard || !aiCard) return;
    const drawIndex = playerDrawnCount;
    const isSecondTutorialDraw = tutorialActive && drawIndex === 4;
    if (isSecondTutorialDraw) setSecondDrawStage("dealing");
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
    setDrawTutorialReady(false);
    if (tutorialActive) schedule(() => setDrawTutorialReady(true), 720);
    setAnnouncement(`${nextCard.points} 點・${nextCard.attributeLabel} 已抽出；OWEN 同步抽牌`);
    schedule(() => {
      if (placementPromptRequestRef.current !== promptRequest) return;
      showPlacementPrompt("draw");
    }, 720);
    schedule(() => setDrawButtonPressed(false), 300);
    schedule(() => {
      const lane = tutorialActive ? (isSecondTutorialDraw ? "C" : "B") : chooseAiLane(aiCard);
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
      if (isSecondTutorialDraw) schedule(() => setSecondDrawStage("choice"), STAR_CARD_PLACE_FEEDBACK_MS);
    }, 2000);
  }, [aiRemainingDeck, chooseAiLane, phase, tutorialActive, secondDrawStage, playStarCardsAudio, playerDrawnCount, playerRemainingDeck, schedule, showPlacementPrompt]);

  useEffect(() => {
    if (exitPromptOpen || inputSuspended || secondDrawStage !== "pending-draw" || phase !== "draw-ready" || tutorialAutoActionRef.current === "draw") return;
    tutorialAutoActionRef.current = "draw";
    drawNextCard();
  }, [drawNextCard, exitPromptOpen, inputSuspended, phase, secondDrawStage]);

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
    placementPromptRequestRef.current += 1;
    placementPromptRef.current = null;
    draggingRef.current = null;
    dragPointRef.current = null;
    dropLaneBoundsRef.current = null;
    hoveredLaneRef.current = null;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
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
    setDragging(null);
    setSnappingCardId(null);
    setDrawButtonPressed(false);
    setBattleButtonPressed(false);
    setBattleEffects([]);
    setBattleScorePopups([]);
    setBattleLog([]);
    setDestroyingCardIds([]);
    setVictoriousCardIds([]);
    setRevealingFrontCardIds([]);
    setHeldCardId(null);
    setRepositioningCardId(null);
    setHoveredLane(null);
    setPlacementPrompt(null);
    setHoveredHandCardId(null);
    setDropFeedback(null);
    setSettledHandCardIds([]);
    setNavigationMode(initialGamepadMode ? "directional" : "pointer");
    setSelectedHandIndex(1);
    setSelectedLaneIndex(1);
    setBattleNavigationIndex(1);
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
    if (exitPromptRef.current || inputSuspendedRef.current) return;
    if (secondDrawStage && secondDrawStage !== "placed") return;
    if (phase !== "battle-ready") return;
    if (secondDrawStage === "placed") setSecondDrawStage("resolving");
    const missileCounts = readStarCardsMissileCounts(battleLayerRef.current);
    // 飛彈特效全部播完的時間（從按下 BATTLE 起算）：主爆炸序列圖、最後一顆尾隨彈的落點爆炸，取較晚者
    const missileTiming = readStarCardsMissileTiming(battleLayerRef.current);
    const missileEffectsEndMs = Math.min(
      BATTLE_EFFECTS_MAX_LINGER_MS,
      BATTLE_EFFECTS_START_MS + Math.max(
        missileTiming.arriveMs + STAR_CARDS_IMPACT_SPRITES.missile.durationMs,
        missileCounts.escort > 0 ? missileTiming.salvoMs + missileTiming.arriveMs + STAR_CARDS_ESCORT_BLAST_MS : 0,
      ) + 50,
    );
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
          tieSprite: createTieSprite(),
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
        impactSprite: createLaneImpactSprite(winner.attribute),
        attackParticleLayout: createStarCardsAttackParticleLayout(winner.attribute),
        missileTrailLayout: winner.attribute === "missile"
          ? createStarCardsMissileTrailLayout(Math.random, missileCounts.escort)
          : undefined,
        missileMainOffsets: winner.attribute === "missile"
          ? getStarCardsMissileMainOffsets(missileCounts.main)
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
      detail: tutorialActive && playerDrawnCount === 4 ? "同步開牌・等待教學確認後分區結算" : "A／B／C 三路目標鎖定・同步開牌",
    }]);
    setAnnouncement(tutorialActive && playerDrawnCount === 4 ? "卡牌已翻開，先確認屬性相剋教學" : "三路卡牌同步開牌，戰鬥開始");
    schedule(() => setBattleButtonPressed(false), 280);
    const finishBattle = () => {
      setPhase("battle-resolved");
      if (tutorialActive && playerDrawnCount === 4) setSecondDrawStage("pending-draw");
      else if (tutorialActive && playerDrawnCount === 5) {
        setSecondDrawStage("recap-dark");
        scheduleStarCardsTutorialRecap(schedule, (expected, next) => {
          setSecondDrawStage(current => current === expected ? next : current);
        });
      } else { setTutorialActive(false); setSecondDrawStage(null); }
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
            `第 ${currentGame} 局 9／9 結束：${finalPlayerScore}：${finalAiScore} 平手｜局勝 ${nextPlayerGameWins}：${nextAiGameWins}`,
          );
          setMatchResultBanner({ text: "【平手】", outcome: "tie" });
          schedule(() => setMatchResultBanner(null), 950);
          schedule(() => prepareNextGame(currentGame + 1), 2400);
          return;
        }

        const result = { playerWins: nextPlayerGameWins, aiWins: nextAiGameWins };
        const winner = getStarCardsMatchWinner(result);
        const matchWinner = winner === "player" ? "PLAYER" : winner === "ai" ? "OWEN" : null;
        if (matchWinner) {
          const resolvedMatchWinner = matchWinner;
          setAnnouncement(
            `${resolvedMatchWinner} 贏得五戰三勝｜局勝 ${nextPlayerGameWins}：${nextAiGameWins}`,
          );
          setMatchResultBanner(
            resolvedMatchWinner === "PLAYER"
              ? { text: "你贏了！", outcome: "victory" }
              : { text: "失敗了…", outcome: "defeat" },
          );
          schedule(() => setMatchResultBanner(null), 950);
          if (!matchReportedRef.current) {
            matchReportedRef.current = true;
            onMatchCompleted?.(result);
          }
          return;
        }

        setAnnouncement(
          `第 ${currentGame} 局由 ${gameWinner === "player" ? "PLAYER" : "OWEN"} 勝出｜局勝 ${nextPlayerGameWins}：${nextAiGameWins}`,
        );
        schedule(() => prepareNextGame(currentGame + 1), 2400);
      }, 900);
    };
    const runBattleEffects = (batch: LaneBattleEffect[], onComplete: () => void) => {
      schedule(() => {
        setBattleEffects(batch);
        batch
          .filter((effect) => effect.outcome === "tie")
          .forEach(() => playStarCardsAudio("starCardsTie"));
        batch
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
      }, BATTLE_EFFECTS_START_MS);
      batch.forEach((effect, index) => {
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
        batch
          .filter((effect) => Boolean(effect.loserCardId && effect.loserCardPoints))
          .forEach((effect) => playExplosionAudioSet(effect.loserCardPoints!));
        setVictoriousCardIds(
          batch.flatMap((effect) => effect.winnerCardId ? [effect.winnerCardId] : []),
        );
        setDestroyingCardIds(
          batch.flatMap((effect) => effect.loserCardId ? [effect.loserCardId] : []),
        );
        setBattleScorePopups(
          batch.flatMap((effect) => effect.outcome === "tie" ? [] : [{
            lane: effect.lane,
            owner: effect.outcome,
            points: effect.awardedPoints,
          }]),
        );
        schedule(() => setBattleScorePopups([]), 900);
      }, 1280);
      schedule(() => {
        const destroyedCount = batch.filter((effect) => effect.loserCardId).length;
        setBattleLog((entries) => [
          ...entries,
          {
            id: `battle-destroyed-${batch.map(effect => effect.lane).join("")}`,
            tone: "system",
            title: `// DESTROYED ${destroyedCount} CARD${destroyedCount === 1 ? "" : "S"}`,
            detail: "敗方最上層牌移除・勝方與平手卡牌保留",
          },
        ]);
      }, 1600);
      schedule(() => {
        const defeated = new Set(
          batch.flatMap((effect) => effect.loserCardId ? [effect.loserCardId] : []),
        );
        setPlayerPlaced((cards) => cards.filter((placed) => !defeated.has(placed.card.id)));
        setAiPlaced((cards) => cards.filter((placed) => !defeated.has(placed.card.id)));
        // 飛彈（較慢、有齊射）的特效延後到全部播完才移除；其他特效照原本時間移除，牌局流程不受影響
        const lingeringMissiles = batch.filter((effect) => effect.attribute === "missile" && effect.outcome !== "tie");
        if (lingeringMissiles.length > 0 && missileEffectsEndMs > BATTLE_EFFECTS_CLEANUP_MS) {
          setBattleEffects(lingeringMissiles);
          schedule(() => {
            setBattleEffects((current) => current.filter((effect) => !lingeringMissiles.includes(effect)));
          }, missileEffectsEndMs - BATTLE_EFFECTS_CLEANUP_MS);
        } else {
          setBattleEffects([]);
        }
        setDestroyingCardIds([]);
        const lingerMs = Math.max(1280 + 900, batch.some(effect => effect.attribute === "missile" && effect.outcome !== "tie")
          ? missileEffectsEndMs : 0) - BATTLE_EFFECTS_CLEANUP_MS;
        const complete = () => { setVictoriousCardIds([]); onComplete(); };
        if (tutorialActive && lingerMs > 0) schedule(complete, lingerMs);
        else onComplete();
      }, BATTLE_EFFECTS_CLEANUP_MS);
    };

    if (tutorialActive && playerDrawnCount === 4) {
      tutorialBattleRef.current = createStarCardsTutorialBattleSequence({
        showLesson: lesson => {
          setVictoriousCardIds([]);
          setBattleLesson(lesson);
        },
        runLanes: (lanes, complete) => {
          setAnnouncement(lanes.length === 1 ? "ZONE 2：雷射艦對飛彈艦" : "ZONE 1、3：同屬性點數判定");
          runBattleEffects(effects.filter(effect => lanes.includes(effect.lane)), complete);
        },
        schedule,
        finish: finishBattle,
      });
      schedule(() => tutorialBattleRef.current?.revealComplete(), STAR_CARD_REVEAL_FRONT_MS + 80);
    } else runBattleEffects(effects, finishBattle);
  }, [aiGameWins, aiPlaced, aiRemainingDeck.length, currentGame, phase, playExplosionAudioSet, playRandomAudioSet, playStarCardsAudio, playerDrawnCount, playerGameWins, playerPlaced, playerRemainingDeck.length, playerScore, aiScore, markCardsRevealingFront, prepareNextGame, schedule, onMatchCompleted, tutorialActive, secondDrawStage]);

  useEffect(() => {
    if (exitPromptOpen || inputSuspended || secondDrawStage !== "placed" || phase !== "battle-ready" || tutorialAutoActionRef.current === "battle") return;
    tutorialAutoActionRef.current = "battle";
    schedule(resolveBattle, STAR_CARD_PLACE_FEEDBACK_MS);
  }, [exitPromptOpen, inputSuspended, phase, resolveBattle, schedule, secondDrawStage]);

  const liftPlacedDrawCard = useCallback(() => {
    if (secondDrawStage) return;
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
  }, [activeDrawIndex, phase, playStarCardsAudio, playerPlaced, secondDrawStage]);

  const moveDirectionalSelection = useCallback(
    (direction: number) => {
      if (exitPromptRef.current || inputSuspendedRef.current) return;
      cursorOwnership.take("directional");
      setNavigationMode("directional");
      setHoveredHandCardId(null);
      if (battleLesson || (secondDrawStage && secondDrawStage !== "risk")) return;
      if (phase === "battle-ready") {
        setBattleNavigationIndex((current) => (current + direction + 2) % 2);
        return;
      }
      if (phase === "initial-placement" || phase === "draw-placement") {
        if (heldCardId) {
          if (tutorialActive) {
            const card = playerHand.find(entry => entry.card.id === heldCardId)?.card;
            const lane = phase === "initial-placement" ? getStarCardsTutorialOpeningLane(card) : tutorialDrawLane;
            if (lane) setSelectedLaneIndex(STAR_CARD_LANES.indexOf(lane));
            return;
          }
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
    [heldCardId, phase, playerHand, tutorialActive, tutorialDrawLane, secondDrawStage, battleLesson],
  );

  const activateDirectionalSelection = useCallback(() => {
    if (exitPromptRef.current || inputSuspendedRef.current) return;
    cursorOwnership.take("directional");
    setNavigationMode("directional");
    if (battleLesson) { continueBattleLesson(); return; }
    if (secondDrawReading) { continueSecondDrawLesson(); return; }
    if (secondDrawStage && secondDrawStage !== "risk") return;
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
      if (tutorialActive) setSelectedLaneIndex(STAR_CARD_LANES.indexOf(
        phase === "initial-placement" ? getStarCardsTutorialOpeningLane(selected.card)! : tutorialDrawLane,
      ));
      setHeldCardId(selected.card.id);
      setAnnouncement(`已選取 ${selected.card.points} 點・${selected.card.attributeLabel}，選擇格子後按 A`);
      return;
    }
    placeCard(heldCardId, STAR_CARD_LANES[selectedLaneIndex]);
  }, [battleLesson, continueBattleLesson, secondDrawStage, secondDrawReading, continueSecondDrawLesson, tutorialDrawLane, tutorialActive, battleNavigationIndex, dismissPlacementPrompt, drawNextCard, heldCardId, liftPlacedDrawCard, phase, placeCard, playerHand, playerPlaced, resolveBattle, selectedHandIndex, selectedLaneIndex]);

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
      if (cursorOwnership.owner !== "gamepad") return;
      const detail = (event as CustomEvent<{ cardId?: string | null; exitChoice?: number | null }>).detail;
      navigationRef.current.mode = "pointer";
      setNavigationMode("pointer");
      setHoveredHandCardId(exitPromptRef.current ? null : detail?.cardId ?? null);
      setExitHoverChoice(exitPromptRef.current ? detail?.exitChoice ?? null : null);
    };
    const syncDirectionalOwner = () => {
      setExitHoverChoice(null);
      if (cursorOwnership.owner !== "directional") return;
      navigationRef.current.mode = "directional";
      setNavigationMode("directional");
      setHoveredHandCardId(null);
    };
    syncDirectionalOwner();
    const unsubscribe = cursorOwnership.subscribe(syncDirectionalOwner);
    window.addEventListener("echoes:star-cards-cursor", handleVirtualCursor);
    return () => {
      unsubscribe();
      window.removeEventListener("echoes:star-cards-cursor", handleVirtualCursor);
    };
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
      if (inputSuspendedRef.current) {
        confirmHeld = Boolean(gamepad?.buttons[0]?.pressed);
        cancelHeld = Boolean(gamepad?.buttons[1]?.pressed || gamepad?.buttons[8]?.pressed);
        horizontalArmed = !gamepad || (Math.abs(gamepad.axes[0] ?? 0) < 0.65 && !gamepad.buttons[14]?.pressed && !gamepad.buttons[15]?.pressed);
        frame = window.requestAnimationFrame(pollGamepad);
        return;
      }
      if (gamepad) {
        const horizontal =
          gamepad.buttons[14]?.pressed
            ? -1
            : gamepad.buttons[15]?.pressed
              ? 1
              : Math.abs(gamepad.axes[0] ?? 0) >= 0.65
                ? Math.sign(gamepad.axes[0] ?? 0)
                : exitPromptRef.current && (gamepad.buttons[12]?.pressed || gamepad.buttons[13]?.pressed || Math.abs(gamepad.axes[1] ?? 0) >= 0.65)
                  ? 1 : 0;
        if (horizontal === 0) horizontalArmed = true;
        else if (horizontalArmed) {
          horizontalArmed = false;
          if (exitPromptRef.current) exitActionsRef.current.moveExitChoice();
          else navigationRef.current.move(horizontal);
        }
        const confirm = Boolean(gamepad.buttons[0]?.pressed);
        const cancel = Boolean(gamepad.buttons[1]?.pressed || gamepad.buttons[8]?.pressed);
        if (
          confirm &&
          !confirmHeld &&
          !cancel &&
          (navigationRef.current.mode === "directional" || Boolean(battleLessonRef.current) || ["choice", "known", "recap", "recap-stack", "encourage"].includes(secondDrawStageRef.current ?? ""))
        ) {
          if (exitPromptRef.current) {
            if (exitChoiceRef.current === 0) exitActionsRef.current.resumeMatch();
            else exitActionsRef.current.confirmExit();
          } else navigationRef.current.activate();
        }
        confirmHeld = confirm;
        if (cancel && !cancelHeld) {
          if (exitPromptRef.current) exitActionsRef.current.resumeMatch();
          else exitActionsRef.current.requestExit();
        }
        cancelHeld = cancel;
      } else { confirmHeld = false; cancelHeld = false; horizontalArmed = true; }
      frame = window.requestAnimationFrame(pollGamepad);
    };
    frame = window.requestAnimationFrame(pollGamepad);
    return () => window.cancelAnimationFrame(frame);
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (inputSuspendedRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) {
          if (exitPromptRef.current) resumeMatch();
          else requestExit();
        }
        return;
      }
      if (exitPromptRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat) return;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab"].includes(event.key)) moveExitChoice();
        else if (event.key === "Enter" || event.key === " ") {
          if (navigationRef.current.mode !== "directional") {
            cursorOwnership.take("directional");
            navigationRef.current.mode = "directional";
            setNavigationMode("directional");
          }
          if (exitChoiceRef.current === 0) resumeMatch();
          else confirmExit();
        }
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
        if (!event.repeat) navigationRef.current.activate();
        return;
      }
      const lane = event.key.toUpperCase() as StarCardLane;
      if (heldCardId && STAR_CARD_LANES.includes(lane)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (canPlaceTutorialCard(phase, lane, playerHand.find(card => card.card.id === heldCardId)?.card)) setSelectedLaneIndex(STAR_CARD_LANES.indexOf(lane));
        placeCard(heldCardId, lane);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [heldCardId, requestExit, resumeMatch, confirmExit, moveExitChoice, placeCard, canPlaceTutorialCard, phase, playerHand]);

  const beginDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    cardId: string,
    source: DragState["source"] = "hand",
    originalLane?: StarCardLane,
  ) => {
    if (draggingRef.current || exitPromptRef.current || inputSuspendedRef.current) return;
    if (secondDrawStage && (secondDrawStage !== "risk" || source !== "hand")) return;
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
    if (exitPromptRef.current || inputSuspendedRef.current) return;
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
      if (lane && (destinationCount >= 3 || !canPlaceTutorialCard(phase, lane))) {
        if (destinationCount >= 3) showFullLaneFeedback();
        else setAnnouncement("教學中請將雷射艦 <2點> 放置到 ZONE 2");
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
            "--deal-x": `${dealX}cqw`,
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
            "--stack-inward-x": `${stackInwardDirection * stackDepth * 0.36}cqw`,
            "--deal-x": `${aiDealX}cqw`,
            "--deal-delay": `${options.dealIndex * 110}ms`,
          };

    return (
      <div
        key={card.id}
        className={`star-card-shell${options.aiPending ? " is-ai-pending" : hand ? " is-hand" : " is-placed"}${hand?.drawCard ? " is-draw-card" : ""}${options.owner === "ai" ? " is-ai" : " is-player"}${isDragging ? " is-dragging" : ""}${isHeld ? " is-held" : ""}${isPreselectedHand ? " is-preselected" : ""}${isSelectedMovable ? " is-gamepad-selected" : ""}${snappingCardId === card.id ? " is-snapping" : ""}${destroyingCardIds.includes(card.id) ? " is-destroying" : ""}${victoriousCardIds.includes(card.id) ? " is-victorious" : ""}${phase === "dealing" || (hand?.drawCard && !settledHandCardIds.includes(card.id)) || options.aiPending ? " is-dealing" : ""}`}
        style={style}
        data-star-cards-hand-card-id={hand ? card.id : undefined}
        data-card-attribute={card.attribute} data-card-points={card.points}
        data-top-card={!hand && stackDepth === 0 || undefined}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : -1}
        aria-label={
          hand
            ? `${card.points} 點 ${card.attributeLabel}卡，${tutorialActive ? `拖曳至 ZONE ${!hand.drawCard ? STAR_CARD_LANES.indexOf(getStarCardsTutorialOpeningLane(card)!) + 1 : STAR_CARD_LANES.indexOf(tutorialDrawLane) + 1}` : "拖曳至 A、B 或 C 格"}`
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
                if (event.detail !== 0 || draggingRef.current || (secondDrawStage && secondDrawStage !== "risk")) return;
                dismissPlacementPrompt();
                setNavigationMode("directional");
                setHoveredHandCardId(null);
                setSelectedHandIndex(Math.max(0, handIndex));
                if (tutorialActive) setSelectedLaneIndex(STAR_CARD_LANES.indexOf(
                  phase === "initial-placement" ? getStarCardsTutorialOpeningLane(card)! : tutorialDrawLane,
                ));
                setHeldCardId(card.id);
              }
            : undefined
        }
        onKeyDown={
          hand
            ? (event: ReactKeyboardEvent<HTMLDivElement>) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                if (secondDrawStage && secondDrawStage !== "risk") return;
                event.preventDefault();
                dismissPlacementPrompt();
                setNavigationMode("directional");
                setSelectedHandIndex(Math.max(0, handIndex));
                if (tutorialActive) setSelectedLaneIndex(STAR_CARD_LANES.indexOf(
                  phase === "initial-placement" ? getStarCardsTutorialOpeningLane(card)! : tutorialDrawLane,
                ));
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

  const activeTutorialCard = playerHand.find(entry => entry.card.id === (dragging?.cardId ?? heldCardId))?.card;
  const initialFocusLane = tutorialActive && phase === "initial-placement"
    ? getStarCardsTutorialOpeningLane(activeTutorialCard) : null;
  const directionalLaneHighlight =
    navigationMode === "directional" && heldCardId
      ? STAR_CARD_LANES[selectedLaneIndex]
      : null;
  const requestedHighlightLane = hoveredLane ?? directionalLaneHighlight;
  const activeDropHighlightLane = requestedHighlightLane && canPlaceTutorialCard(phase, requestedHighlightLane, activeTutorialCard)
    ? requestedHighlightLane : null;
  const pendingHandPlacementPhase =
    phase === "initial-placement" || phase === "draw-placement" ? phase : null;
  const handPreselectionActive =
    Boolean(heldCardId) || (
      Boolean(hoveredHandCardId) ||
      (navigationMode === "directional" && playerHand.length > 0)
    );

  const tutorialStage: StarCardsTutorialStage | null = !tutorialActive ? null
    : secondDrawStage ? (["recap-dark", "recap", "recap-stack"].includes(secondDrawStage) ? "recap"
      : ["choice", "known", "risk", "encourage"].includes(secondDrawStage) ? secondDrawStage as "choice" | "known" | "risk" | "encourage" : null)
    : battleLesson ? battleLesson
    : phase === "initial-placement" ? "initial"
    : phase === "draw-ready" ? "draw"
    : phase === "draw-placement" && drawTutorialReady ? "place"
    : phase === "battle-ready" ? "battle" : null;

  return (
    <div className="star-cards-overlay" data-star-cards-open="true" data-tutorial-active={tutorialActive} data-tutorial-stage={tutorialStage ?? "none"}>
      <section
        ref={dialogRef}
        className={`star-cards-dialog is-${phase}${handPreselectionActive ? " has-hand-preselection" : ""}`}
        data-navigation-mode={navigationMode}
        inert={exitPromptOpen || inputSuspended || Boolean(battleLesson) || secondDrawReading}
        aria-hidden={exitPromptOpen || inputSuspended || undefined}
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
          className="star-cards-player-identity is-owen"
          src={starCardsAssetUrl("Player_Up.png")}
          alt="OWEN"
          draggable={false}
        />
        <img
          className="star-cards-player-identity is-player"
          src={starCardsAssetUrl("Player_Down.png")}
          alt="PLAYER"
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
          aria-label={`勝局：PLAYER ${playerGameWins}，OWEN ${aiGameWins}；五戰三勝制，目前第 ${currentGame} 局；平手局不計勝局並追加下一局`}
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
          const tutorialLaneAllowed = canPlaceTutorialCard(phase, lane, activeTutorialCard);
          const zonePlacementTweenActive = tutorialLaneAllowed && shouldAnimateStarCardsZone(
            pendingHandPlacementPhase,
            playerHand.length,
            laneCards.length,
          );
          const laneContainsDraggingCard = laneCards.some(
            (placed) => placed.card.id === dragging?.cardId,
          );
          const laneSelected =
            navigationMode === "directional" &&
            Boolean(heldCardId) &&
            selectedLaneIndex === laneIndex && tutorialLaneAllowed;
          return (
            <div
              className={`star-cards-lane is-player-lane${laneSelected ? " is-directional-target" : ""}${laneContainsDraggingCard ? " is-drag-source" : ""}`}
              data-lane={lane}
              aria-disabled={!tutorialLaneAllowed || undefined}
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
                className={`star-cards-zone-title${zonePlacementTweenActive ? " is-placement-active" : " is-placement-inactive"}`}
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
                    !secondDrawStage &&
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

        <div className="star-cards-battle-layer" aria-hidden="true" ref={battleLayerRef}>
          {battleEffects.map((effect) => (
            <div
              className={`star-cards-battle-effect is-${effect.attribute} is-${effect.outcome}`}
              data-lane={effect.lane}
              key={`${effect.lane}-${effect.outcome}`}
            >
              {effect.outcome === "tie" ? (
                effect.tieSprite ? <StarCardsTieShock sprite={effect.tieSprite} /> : null
              ) : (
              /* 攻擊路徑：原點在發射方、往上＝朝目標；彈體與沿途粒子都在這個座標系裡移動 */
              <span className="star-cards-attack-path">
                <span className="star-cards-attack-muzzle" />
                <span className="star-cards-attack-particles">
                    {effect.attackParticleLayout?.map((particle, index) => (
                      <span
                        className={`star-cards-attack-particle is-${particle.kind}`}
                        key={`attack-particle-${index + 1}`}
                        style={{
                          "--attack-progress": particle.progress,
                          "--attack-lateral": `${particle.lateralCqw}cqw`,
                          "--attack-drift-x": `${particle.driftXCqw}cqw`,
                          "--attack-drift-y": `${particle.driftYCqw}cqw`,
                          "--attack-size": particle.sizeScale,
                          "--attack-delay": `${particle.animationDelayMs}ms`,
                          "--attack-duration": `${particle.animationDurationMs}ms`,
                        } as StarCardStyle}
                      />
                    ))}
                  </span>
                {effect.missileMainOffsets ? (
                  // 主飛彈可以多顆並排同時發射（--main-offset：以彈體間距為單位的橫向位置）
                  effect.missileMainOffsets.map((offset, index) => (
                    <span
                      className="star-cards-attack-core"
                      key={`missile-main-${index + 1}`}
                      style={{ "--main-offset": offset } as StarCardStyle}
                    />
                  ))
                ) : (
                  <span className="star-cards-attack-core">
                    {effect.attribute === "shield" ? <StarCardsShieldDome /> : null}
                  </span>
                )}
                {effect.missileTrailLayout?.map((trail, index) => {
                  // 尾隨彈與它落點的小爆炸共用同一組變數（發射時機、散射位置、落點散布）
                  const escortStyle = {
                    "--battle-spark-offset": `${trail.lateralOffsetVw}cqw`,
                    "--battle-missile-depth-offset": `${trail.depthOffsetCqh}cqh`,
                    "--escort-launch": trail.launchFraction,
                    "--escort-scatter-x": trail.impactScatterX,
                    "--escort-scatter-y": trail.impactScatterY,
                  } as StarCardStyle;
                  return (
                    <Fragment key={`missile-trail-${index + 1}`}>
                      <span className="star-cards-attack-trail" style={escortStyle} />
                      <span className="star-cards-escort-blast" style={escortStyle} />
                    </Fragment>
                  );
                })}
              </span>
              )}
              {/* 命中爆炸：播放烘焙好的序列圖（1 個元素），取代數十個即時粒子 */}
              <span className={`star-cards-impact${effect.impactSprite ? " is-sprite" : ""}`}>
                {effect.impactSprite ? (
                  <span
                    className="star-cards-impact-sprite"
                    style={{
                      "--sprite-image": `url("${starCardsAssetUrl(effect.impactSprite.file)}")`,
                      "--sprite-frames": effect.impactSprite.frames,
                      "--sprite-duration": `${effect.impactSprite.durationMs}ms`,
                      "--sprite-box": `${effect.impactSprite.boxCqw}cqw`,
                      "--sprite-flip": effect.impactSprite.flipX ? -1 : 1,
                      "--sprite-rotate": `${effect.impactSprite.rotateDeg}deg`,
                      "--sprite-scale": effect.impactSprite.scale,
                    } as StarCardStyle}
                  >
                    <span className="star-cards-impact-sprite-strip" />
                  </span>
                ) : null}
              </span>
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
            style={{ "--button-mask": `url("${starCardsAssetUrl("button-draw.png")}")` } as StarCardStyle}
            type="button"
            className={`star-cards-image-button is-draw${phase === "draw-ready" ? " is-ready" : ""}${drawButtonPressed ? " is-pressed" : ""}`}
            disabled={phase !== "draw-ready" || Boolean(secondDrawStage)}
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
            style={{ "--button-mask": `url("${starCardsAssetUrl("button-battle.png")}")` } as StarCardStyle}
            type="button"
            className={`star-cards-image-button is-battle${phase === "battle-ready" ? " is-ready" : ""}${battleButtonPressed ? " is-pressed" : ""}`}
            disabled={phase !== "battle-ready" || Boolean(secondDrawStage)}
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

        <div className="star-cards-status" role="status" aria-live="polite" hidden={tutorialStage !== null}>
          <strong>{tutorialActive && phase === "battling" ? "教學對局結算" : getPhaseMessage(phase)}</strong>
          <span><GamepadHint text={announcement} enabled={gamepadMode} /></span>
        </div>
        <div className="star-cards-exit-hint" aria-hidden="true"><GamepadHint text="ESC／B／Select　退出牌局" enabled={gamepadMode} /></div>
      </section>
      <StarCardsTutorialOverlay stage={tutorialStage} visible={secondDrawStage !== "recap-dark"} focusStack={secondDrawStage === "recap-stack"}
        root={dialogRef} initialFocusLane={initialFocusLane} onContinue={battleLesson ? continueBattleLesson : secondDrawReading && secondDrawStage !== "recap-dark" ? continueSecondDrawLesson : undefined} inputMode={gamepadMode ? "gamepad" : "keyboard-mouse"} paused={exitPromptOpen || inputSuspended} />
      {exitPromptOpen ? (
        <div className="star-cards-exit-scrim" data-navigation-mode={navigationMode}
          onPointerMove={(event) => {
            if (event.pointerType === "mouse" && cursorOwnership.recordMouse(event.clientX, event.clientY)) {
              navigationRef.current.mode = "pointer";
              setNavigationMode("pointer");
            }
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "touch") cursorOwnership.take("touch");
            else if (event.pointerType === "mouse") cursorOwnership.recordMouse(event.clientX, event.clientY, true);
            navigationRef.current.mode = "pointer";
            setNavigationMode("pointer");
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div ref={exitDialogRef} className="star-cards-exit-dialog" role="alertdialog" aria-modal="true"
            aria-labelledby="star-cards-exit-title" aria-describedby="star-cards-exit-description">
            <div className="star-cards-exit-emblem" aria-hidden="true"><i /><i /><i /></div>
            <div className="star-cards-exit-eyebrow">STAR CARDS · 星際牌</div>
            <h2 id="star-cards-exit-title">要放棄這一局嗎？</h2>
            <p id="star-cards-exit-description">{matchReportedRef.current ? "本場對決已結束，退出即可返回船艙。" : "退出將結束本場對決，牌局進度不會保留。"}</p>
            <div className="star-cards-exit-actions">
              <button type="button" data-star-cards-exit-choice="0" data-cursor-hover={navigationMode === "pointer" && exitHoverChoice === 0 ? "true" : undefined} data-gamepad-selected={navigationMode === "directional" && exitChoice === 0 ? "true" : undefined}
                onClick={resumeMatch}>繼續牌局<span>CONTINUE</span></button>
              <button type="button" className="is-abandon" data-star-cards-exit-choice="1" data-cursor-hover={navigationMode === "pointer" && exitHoverChoice === 1 ? "true" : undefined} data-gamepad-selected={navigationMode === "directional" && exitChoice === 1 ? "true" : undefined}
                onClick={confirmExit}>放棄並退出<span>LEAVE MATCH</span></button>
            </div>
            <div className="star-cards-exit-footer">{navigationMode === "directional" ? <GamepadHint text={gamepadMode ? "A 確認　B 返回牌局" : "方向鍵 選擇 · Enter 確認 · Esc 返回"} enabled={gamepadMode} /> : "選擇繼續，或結束這場對決"}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
