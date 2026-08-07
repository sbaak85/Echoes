"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent as ReactFormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import mapTest01Scene from "../public/maps/map_test01.scene.json";
import questDocumentSource from "../public/quests/quest-data.json";
import {
  AUDIO_EVENT_CONFIG,
  AudioEventManager,
  type AudioEventName,
} from "./audio-event-manager";
import {
  INITIAL_PLAYER_INVENTORY,
  ITEM_BY_ID,
  ITEM_DATABASE,
  calculateInventoryWeight,
  getItemDebugSpawnDelivery,
  getOwnedItemStacks,
  grantInventoryItem,
  loadPlayerInventory,
  parseDebugItemSpawnCommand,
  removeInventoryItem,
  resolveItemId,
  savePlayerInventory,
  useSurvivalInventoryItem,
  type ItemCategory,
  type PlayerInventory,
} from "./item-database";
import {
  WORLD_ITEM_PLACEMENTS,
  loadCollectedWorldItemIds,
  loadDroppedWorldItems,
  saveCollectedWorldItemIds,
  saveDroppedWorldItems,
  type DroppedWorldItem,
} from "./world-item-placements";
import {
  getDpadToggleValue,
  shouldUseOptionsCursor,
  type OptionsGamepadMode,
} from "./options-gamepad-control";
import {
  getClampedInventoryCategoryIndex,
  getInventoryCategoryOffsetForBumper,
} from "./inventory-gamepad-control";
import {
  DEFAULT_HOTBAR_ASSIGNMENTS,
  HOTBAR_SLOT_COUNT,
  assignHotbarSlot,
  getHotbarSelectionHintMode,
  loadHotbarAssignments,
  saveHotbarAssignments,
} from "./hotbar-assignments";
import { resetStoredNewGameProgress } from "./new-game-reset";
import {
  evaluateInteractionStageRequirement,
  getUnmetInteractionUseRequirements,
  normalizeInteractionItemRewards,
  normalizeInteractionUseRequirements,
  resolveWeightedDialogueLines,
  selectInteractionDialogue,
  selectInteractionFeedbackPoint,
  selectPreferredInteractionTarget,
  shouldExposeInteraction,
  shouldCompleteAfterDialogue,
  type InteractionDialogueScript,
  type InteractionItemReward,
  type InteractionUseRequirement,
} from "./interaction-flow";
import {
  createInitialStoryProgress,
  loadStoryProgress,
  saveStoryProgress,
  type StoryProgress,
} from "./story-progress";
import {
  advanceSurvivalByGameMinutes,
  advanceSurvivalState,
  applySurvivalEffects,
  createInitialSurvivalState,
  createInteractionUsageState,
  ensureInteractionUsageCycle,
  formatElapsedGameHours,
  getElapsedClockHandMotion,
  getCharacterStatuses,
  getGameClock,
  getInteractionCycle,
  getTimePassTransitionHoldMs,
  getUnmetSurvivalRequirements,
  getSurvivalSpeedMultiplier,
  hasConfiguredSurvivalEffects,
  isInteractionLocked,
  loadInteractionUsageState,
  loadSurvivalState,
  recordInteractionUse,
  saveInteractionUsageState,
  saveSurvivalState,
  type InteractionUsageState,
  type SurvivalEffects,
  type SurvivalGameState,
  type SurvivalRequirements,
} from "./survival-manager";
import {
  createWorldItemSpawnMotion,
  getWorldItemThrowDistanceBoost,
  getWorldItemSpawnPose,
  type WorldItemSpawnMotion,
} from "./world-item-spawn-motion";
import { buildMiniMapGeometry } from "./minimap-geometry";
import {
  createInitialItemPointProgress,
  isItemPointAvailable,
  loadItemPointProgress,
  normalizeSceneItemPoints,
  recordItemPointCollected,
  saveItemPointProgress,
  type ItemPointProgress,
  type SceneItemPoint,
} from "./item-point-manager";
import { DialogueManager } from "./dialogue-manager";
import { StoryEventManager } from "./story-event-manager";
import { MainObjectiveMarker } from "./main-objective-marker";
import {
  ChapterFlowManager,
  type ChapterFlowAction,
} from "./chapter-flow-manager";
import {
  CHAPTER_3_START_FLOW,
  STORY_DIALOGUES,
  STORY_EVENT_FLOWS,
} from "./story-content";
import {
  QuestRuntimeManager,
  loadQuestSaveData,
  saveQuestSaveData,
  type QuestDocument,
  type QuestRuntimeEntry,
} from "./quest-runtime-manager";

const QUEST_DOCUMENT = questDocumentSource as QuestDocument;

type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
type Point = { x: number; y: number };
type QuestHudObjectiveView = {
  id: string;
  label: string;
  current: number;
  required: number;
  completed: boolean;
  showProgress: boolean;
};
type QuestPromptInputMode = "keyboard-mouse" | "gamepad" | "mobile";
type QuestHudView = {
  id: string;
  stageId: string;
  title: string;
  categoryLabel: string;
  objectives: QuestHudObjectiveView[];
};

function renderQuestObjectiveLabel(
  label: string,
  inputMode: QuestPromptInputMode,
) {
  if (!label.includes("[TAB]")) return label;

  return label.split(/(\[TAB\])/g).map((part, index) => {
    if (part !== "[TAB]") return part;
    if (inputMode === "keyboard-mouse") {
      return <span className="quest-input-key-prompt" key={index}>[TAB]</span>;
    }
    if (inputMode === "gamepad") {
      return <span className="quest-input-key-prompt" key={index}>[B鍵]</span>;
    }

    return (
      <span
        className="quest-input-backpack-prompt"
        role="img"
        aria-label="背包按鈕"
        key={index}
      >
        <span aria-hidden="true">[</span>
        <span className="inventory-trigger-icon" aria-hidden="true">
          <i className="inventory-trigger-handle" />
          <i className="inventory-trigger-body" />
          <i className="inventory-trigger-pocket" />
        </span>
        <span aria-hidden="true">]</span>
      </span>
    );
  });
}
type QuestHistoryView = {
  id: string;
  title: string;
};
const EMPTY_QUEST_TITLE = "這個階段沒有任務";
type QuestHudEventKind = "accepted" | "next" | "completed" | "failed";
type QuestHudEvent = {
  kind: QuestHudEventKind;
  questId: string;
  sequence: number;
};

function buildQuestHudView(
  questId: string,
  entry: QuestRuntimeEntry,
): QuestHudView | null {
  const quest = QUEST_DOCUMENT.quests.find((candidate) => candidate.id === questId);
  if (!quest) return null;
  const stage = quest.stages.find((candidate) => candidate.id === entry.currentStageId)
    ?? quest.stages[0];
  const now = Date.now();
  const stageActive = (entry.stageAvailableAtEpochMs ?? 0) <= now;
  const activeObjectives = stageActive
    ? (stage?.objectives ?? []).filter(
        objective => (entry.objectives[objective.id]?.availableAtEpochMs ?? 0) <= now,
      )
    : [];
  return {
    id: quest.id,
    stageId: stage?.id ?? "",
    title: quest.name,
    categoryLabel: quest.type === "main" || quest.type === "longTermMain"
      ? "MAIN OBJECTIVE"
      : "QUEST OBJECTIVE",
    objectives: activeObjectives.map((objective) => ({
      id: objective.id,
      label: objective.displayText,
      current: entry.objectives[objective.id]?.currentAmount ?? 0,
      required: Math.max(1, objective.requiredAmount),
      completed: entry.objectives[objective.id]?.completed === true &&
        entry.objectives[objective.id]?.completionPresented !== false,
      showProgress: objective.showProgress === true,
    })),
  };
}
type TouchEffect = {
  point: Point;
  reachable: boolean;
  startedAt: number;
};
type PolygonCollider = {
  kind: "polygon";
  label: string;
  points: Point[];
};
type CircleCollider = {
  kind: "circle";
  label: string;
  x: number;
  y: number;
  radius: number;
};
type SceneCollider = PolygonCollider | CircleCollider;
type InteractionPoint = Point & { facing?: Direction };
type SceneInteractable = {
  id: string;
  label: string;
  shape?: "polygon";
  points?: Point[];
  position?: Point;
  interactionPoints?: InteractionPoint[];
  interactionPoint?: InteractionPoint;
  interactionHintPoint?: Point;
  pickRadius?: number;
  activationDistance?: number;
  action?: string;
  type?: "dialogue" | "operation" | "gather" | "move" | "interaction" | "pickup";
  verb?: string;
  survivalRequirements?: SurvivalRequirements;
  survivalEffects?: SurvivalEffects & { timeMinutes?: number };
  dailyInteractionLimit?: number | null;
  interactionLimitMode?: "once" | null;
  itemRewards?: InteractionItemReward[];
  itemReward?: InteractionItemReward;
  useRequirements?: InteractionUseRequirement[];
  itemId?: string;
  quantity?: number;
  worldItemId?: string;
  worldItemKind?: "placed" | "dropped" | "itemPoint";
  itemPointId?: string;
  dialogue?: InteractionDialogueScript;
  failureDialogue?: InteractionDialogueScript;
  completionDialogue?: InteractionDialogueScript;
};
type PendingInteraction = {
  interactable: SceneInteractable;
  interactionPoint?: InteractionPoint;
  source: "gamepad" | "pointer" | "keyboard" | "mobile";
  repathAttempts?: number;
};
type DialoguePlayback = {
  interactable: SceneInteractable;
  lineIndex: number;
  pageIndex: number;
  pages: string[];
  onComplete?: () => void;
};
type DialogueView = { speaker: string; text: string } | null;
type DialogueTyping = {
  characters: string[];
  visibleCount: number;
  speaker: string;
  delayMilliseconds: number;
  timerId: number | null;
  resume: () => void;
};
type InventoryDragState = {
  itemId: string;
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
};
type PendingInventoryDrag = {
  itemId: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  active: boolean;
  timerId: number | null;
};
type InventoryContextMenu =
  | { kind: "inventory"; x: number; y: number; databaseIndex: number }
  | { kind: "hotbar"; x: number; y: number; slotIndex: number };
type MovementGuide = {
  id: string;
  label: string;
  points: Point[];
  width?: number;
  bidirectional?: boolean;
};

type StoryTriggerZone = {
  id: string;
  label: string;
  points: Point[];
  once?: boolean;
  dialogueId: string;
  triggerDelaySeconds?: number;
  startQuestIds?: string[];
  survivalRequirements?: SurvivalRequirements;
  survivalEffects?: SurvivalEffects & { timeMinutes?: number };
  dailyInteractionLimit?: number | null;
  interactionLimitMode?: "once" | null;
  itemRewards?: InteractionItemReward[];
  itemReward?: InteractionItemReward;
  useRequirements?: InteractionUseRequirement[];
};

type SceneTeleportPoint = Point & {
  id: string;
  label: string;
  facing: Direction;
};

type SceneFile = {
  sceneId: string;
  image: { file: string; width: number; height: number };
  world: { width: number; height: number };
  playerSpawn: Point & { facing: string };
  navMesh?: Array<{ id: string; label: string; points: Point[] }>;
  collisions?: Array<{
    id: string;
    label: string;
    shape: "polygon" | "rectangle" | "circle";
    points?: Point[];
    center?: Point;
    radius?: number;
  }>;
  interactables?: SceneInteractable[];
  movementGuides?: MovementGuide[];
  storyTriggers?: StoryTriggerZone[];
  itemPoints?: SceneItemPoint[];
  teleportPoints?: Array<Point & { id: string; label: string; facing: string }>;
};

const SCENE_DATA = mapTest01Scene as SceneFile;
const WORLD = SCENE_DATA.world;
const MAP_SOURCE = `./maps/${SCENE_DATA.image.file}`;
const SPAWN: Point = {
  x: SCENE_DATA.playerSpawn.x,
  y: SCENE_DATA.playerSpawn.y,
};
const SCENE_START_FACING = (
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].includes(
    SCENE_DATA.playerSpawn.facing,
  )
    ? SCENE_DATA.playerSpawn.facing
    : "S"
) as Direction;
const SCENE_TELEPORT_POINTS: SceneTeleportPoint[] = (
  SCENE_DATA.teleportPoints ?? []
).flatMap((point) => {
  const id = typeof point.id === "string" ? point.id.trim() : "";
  if (!id || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
  const facing = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].includes(point.facing)
    ? point.facing as Direction
    : "S";
  return [{ ...point, id, facing }];
});

// The map has one main plateau and two lower approach roads. The three
// polygons overlap only at the illustrated stairs, so their union is the
// complete walkable NavMesh.
const DEFAULT_NAV_REGIONS: Point[][] = [
  [
    { x: 600, y: 278 },
    { x: 700, y: 276 },
    { x: 725, y: 326 },
    { x: 734, y: 389 },
    { x: 782, y: 430 },
    { x: 849, y: 452 },
    { x: 905, y: 476 },
    { x: 953, y: 458 },
    { x: 971, y: 411 },
    { x: 946, y: 381 },
    { x: 966, y: 344 },
    { x: 1011, y: 351 },
    { x: 1018, y: 313 },
    { x: 1119, y: 289 },
    { x: 1170, y: 299 },
    { x: 1213, y: 347 },
    { x: 1223, y: 405 },
    { x: 1215, y: 500 },
    { x: 1193, y: 561 },
    { x: 1171, y: 608 },
    { x: 1224, y: 657 },
    { x: 1230, y: 712 },
    { x: 1204, y: 741 },
    { x: 1152, y: 746 },
    { x: 1112, y: 783 },
    { x: 1089, y: 831 },
    { x: 1023, y: 844 },
    { x: 1000, y: 893 },
    { x: 963, y: 918 },
    { x: 968, y: 958 },
    { x: 918, y: 993 },
    { x: 858, y: 986 },
    { x: 821, y: 1030 },
    { x: 761, y: 1037 },
    { x: 704, y: 1002 },
    { x: 677, y: 963 },
    { x: 596, y: 946 },
    { x: 556, y: 926 },
    { x: 507, y: 960 },
    { x: 441, y: 962 },
    { x: 389, y: 939 },
    { x: 342, y: 931 },
    { x: 301, y: 912 },
    { x: 260, y: 884 },
    { x: 214, y: 859 },
    { x: 166, y: 844 },
    { x: 124, y: 815 },
    { x: 90, y: 764 },
    { x: 53, y: 728 },
    { x: 27, y: 691 },
    { x: 30, y: 636 },
    { x: 59, y: 602 },
    { x: 101, y: 583 },
    { x: 132, y: 544 },
    { x: 172, y: 513 },
    { x: 211, y: 483 },
    { x: 257, y: 462 },
    { x: 302, y: 452 },
    { x: 349, y: 458 },
    { x: 380, y: 439 },
    { x: 414, y: 420 },
    { x: 449, y: 403 },
    { x: 453, y: 367 },
    { x: 442, y: 332 },
    { x: 467, y: 303 },
    { x: 509, y: 275 },
    { x: 551, y: 274 },
  ],
  [
    { x: 274, y: 956 },
    { x: 315, y: 914 },
    { x: 373, y: 939 },
    { x: 426, y: 974 },
    { x: 455, y: 1014 },
    { x: 430, y: 1050 },
    { x: 381, y: 1054 },
    { x: 348, y: 1087 },
    { x: 314, y: 1149 },
    { x: 264, y: 1196 },
    { x: 211, y: 1249 },
    { x: 0, y: 1249 },
    { x: 0, y: 1189 },
    { x: 38, y: 1138 },
    { x: 83, y: 1100 },
    { x: 119, y: 1060 },
    { x: 165, y: 1032 },
    { x: 222, y: 1000 },
  ],
  [
    { x: 756, y: 971 },
    { x: 813, y: 994 },
    { x: 858, y: 1019 },
    { x: 892, y: 1052 },
    { x: 943, y: 1087 },
    { x: 983, y: 1126 },
    { x: 1002, y: 1174 },
    { x: 1004, y: 1249 },
    { x: 739, y: 1249 },
    { x: 725, y: 1189 },
    { x: 738, y: 1135 },
    { x: 766, y: 1084 },
    { x: 788, y: 1044 },
  ],
];

const DEFAULT_SCENE_COLLIDERS: SceneCollider[] = [
  {
    kind: "polygon",
    label: "Tree roots",
    points: [
      { x: 250, y: 446 },
      { x: 313, y: 427 },
      { x: 371, y: 451 },
      { x: 407, y: 493 },
      { x: 419, y: 545 },
      { x: 385, y: 586 },
      { x: 319, y: 594 },
      { x: 267, y: 567 },
      { x: 246, y: 516 },
    ],
  },
  {
    kind: "polygon",
    label: "Crystal field",
    points: [
      { x: 429, y: 348 },
      { x: 460, y: 303 },
      { x: 517, y: 282 },
      { x: 568, y: 300 },
      { x: 600, y: 345 },
      { x: 601, y: 392 },
      { x: 567, y: 430 },
      { x: 501, y: 439 },
      { x: 451, y: 411 },
    ],
  },
  {
    kind: "polygon",
    label: "Aircraft shell",
    points: [
      { x: 710, y: 271 },
      { x: 755, y: 224 },
      { x: 829, y: 180 },
      { x: 980, y: 92 },
      { x: 1090, y: 53 },
      { x: 1150, y: 73 },
      { x: 1190, y: 125 },
      { x: 1181, y: 207 },
      { x: 1120, y: 281 },
      { x: 1104, y: 339 },
      { x: 1037, y: 326 },
      { x: 999, y: 375 },
      { x: 957, y: 414 },
      { x: 909, y: 407 },
      { x: 879, y: 378 },
      { x: 829, y: 365 },
      { x: 805, y: 341 },
      { x: 765, y: 342 },
      { x: 731, y: 319 },
    ],
  },
  {
    kind: "polygon",
    label: "Aircraft doorway",
    points: [
      { x: 728, y: 389 },
      { x: 812, y: 431 },
      { x: 806, y: 442 },
      { x: 723, y: 400 },
    ],
  },
  {
    kind: "circle",
    label: "Aircraft barrel",
    x: 696,
    y: 337,
    radius: 22,
  },
  {
    kind: "polygon",
    label: "Camp cargo",
    points: [
      { x: 633, y: 437 },
      { x: 708, y: 426 },
      { x: 729, y: 486 },
      { x: 771, y: 509 },
      { x: 774, y: 558 },
      { x: 724, y: 574 },
      { x: 687, y: 535 },
      { x: 636, y: 529 },
      { x: 615, y: 479 },
    ],
  },
  {
    kind: "circle",
    label: "Campfire",
    x: 816,
    y: 575,
    radius: 38,
  },
  {
    kind: "polygon",
    label: "Upper cargo A",
    points: [
      { x: 989, y: 291 },
      { x: 1037, y: 270 },
      { x: 1081, y: 304 },
      { x: 1074, y: 374 },
      { x: 1019, y: 393 },
      { x: 982, y: 355 },
    ],
  },
  {
    kind: "polygon",
    label: "Upper cargo B",
    points: [
      { x: 1084, y: 238 },
      { x: 1126, y: 220 },
      { x: 1166, y: 244 },
      { x: 1163, y: 304 },
      { x: 1113, y: 323 },
      { x: 1081, y: 292 },
    ],
  },
  {
    kind: "polygon",
    label: "Research station",
    points: [
      { x: 1005, y: 440 },
      { x: 1082, y: 424 },
      { x: 1128, y: 463 },
      { x: 1121, y: 548 },
      { x: 1061, y: 579 },
      { x: 1033, y: 626 },
      { x: 976, y: 642 },
      { x: 946, y: 606 },
      { x: 970, y: 560 },
      { x: 983, y: 478 },
    ],
  },
  {
    kind: "polygon",
    label: "Loose cargo",
    points: [
      { x: 1086, y: 636 },
      { x: 1121, y: 619 },
      { x: 1161, y: 645 },
      { x: 1157, y: 697 },
      { x: 1113, y: 715 },
      { x: 1076, y: 688 },
    ],
  },
  {
    kind: "polygon",
    label: "Supply chest",
    points: [
      { x: 1007, y: 719 },
      { x: 1063, y: 705 },
      { x: 1096, y: 731 },
      { x: 1087, y: 772 },
      { x: 1025, y: 786 },
      { x: 994, y: 756 },
    ],
  },
  {
    kind: "polygon",
    label: "Ruined wall",
    points: [
      { x: 768, y: 751 },
      { x: 894, y: 721 },
      { x: 959, y: 767 },
      { x: 943, y: 842 },
      { x: 833, y: 886 },
      { x: 758, y: 847 },
      { x: 741, y: 793 },
    ],
  },
  {
    kind: "polygon",
    label: "South railing",
    points: [
      { x: 548, y: 910 },
      { x: 586, y: 931 },
      { x: 636, y: 944 },
      { x: 682, y: 977 },
      { x: 733, y: 994 },
      { x: 763, y: 1018 },
      { x: 751, y: 1041 },
      { x: 718, y: 1023 },
      { x: 670, y: 1007 },
      { x: 626, y: 976 },
      { x: 576, y: 962 },
      { x: 538, y: 937 },
    ],
  },
];

const NAV_REGIONS =
  SCENE_DATA.navMesh?.map((region) => region.points) ?? DEFAULT_NAV_REGIONS;
const SCENE_COLLIDERS =
  SCENE_DATA.collisions?.map((collision): SceneCollider => {
    if (collision.shape === "circle") {
      return {
        kind: "circle",
        label: collision.label,
        x: collision.center?.x ?? 0,
        y: collision.center?.y ?? 0,
        radius: collision.radius ?? 0,
      };
    }

    return {
      kind: "polygon",
      label: collision.label,
      points: collision.points ?? [],
    };
  }) ?? DEFAULT_SCENE_COLLIDERS;
const MINI_MAP_GEOMETRY = buildMiniMapGeometry(
  WORLD,
  NAV_REGIONS,
  SCENE_COLLIDERS,
  192,
);
const WORLD_ITEM_INTERACTABLES: SceneInteractable[] = WORLD_ITEM_PLACEMENTS
  .filter((placement) => placement.sceneId === SCENE_DATA.sceneId)
  .flatMap((placement) => {
    const item = ITEM_BY_ID.get(placement.itemId);
    if (!item) return [];
    return [
      {
        id: `world-item:${placement.id}`,
        label: item.name,
        position: placement.position,
        interactionPoint: placement.interactionPoint,
        pickRadius: placement.pickRadius,
        activationDistance: placement.activationDistance,
        type: "pickup",
        verb: "拾取",
        itemId: item.id,
        quantity: placement.quantity,
        worldItemId: placement.id,
        worldItemKind: "placed",
      },
    ];
  });
const STATIC_SCENE_INTERACTABLES = [
  ...(SCENE_DATA.interactables ?? []),
  ...WORLD_ITEM_INTERACTABLES,
];
const SCENE_MOVEMENT_GUIDES = SCENE_DATA.movementGuides ?? [];
const SCENE_STORY_TRIGGERS = SCENE_DATA.storyTriggers ?? [];
const SCENE_ITEM_POINTS = normalizeSceneItemPoints(
  SCENE_DATA.itemPoints,
  resolveItemId,
);
const ITEM_POINT_RUNTIME_POSITIONS = new Map(
  SCENE_ITEM_POINTS.map((itemPoint) => [
    itemPoint.id,
    findNearestSafeItemPointPosition(itemPoint),
  ]),
);

function getItemPointInteractable(itemPoint: SceneItemPoint): SceneInteractable | null {
  const item = ITEM_BY_ID.get(itemPoint.itemId);
  if (!item) return null;
  const position = ITEM_POINT_RUNTIME_POSITIONS.get(itemPoint.id) ?? itemPoint;
  return {
    id: `item-point:${itemPoint.id}`,
    label: item.name,
    position: { x: position.x, y: position.y },
    interactionPoint: { x: position.x, y: position.y, facing: "S" },
    pickRadius: 28,
    activationDistance: 48,
    type: "pickup",
    verb: "拾取",
    itemId: item.id,
    quantity: itemPoint.quantity,
    worldItemId: `item-point:${itemPoint.id}`,
    worldItemKind: "itemPoint",
    itemPointId: itemPoint.id,
  };
}

function getDroppedWorldItemInteractable(
  placement: DroppedWorldItem,
): SceneInteractable | null {
  const item = ITEM_BY_ID.get(placement.itemId);
  if (!item) return null;
  return {
    id: `dropped-world-item:${placement.id}`,
    label: item.name,
    position: placement.position,
    interactionPoint: placement.interactionPoint,
    pickRadius: placement.pickRadius,
    activationDistance: placement.activationDistance,
    type: "pickup",
    verb: "拾取",
    itemId: item.id,
    quantity: placement.quantity,
    worldItemId: placement.id,
    worldItemKind: "dropped",
  };
}

function buildSceneInteractables(
  droppedWorldItems: readonly DroppedWorldItem[],
  itemPointProgress: ItemPointProgress,
  gameMinutes: number,
  sceneEntryCollectedIds: ReadonlySet<string>,
  stageQuery?: QuestRuntimeManager | null,
) {
  return [
    ...STATIC_SCENE_INTERACTABLES,
    ...SCENE_ITEM_POINTS.flatMap((itemPoint) => {
      if (!isItemPointAvailable(
        itemPoint,
        itemPointProgress,
        gameMinutes,
        sceneEntryCollectedIds,
        stageQuery,
      )) return [];
      const interactable = getItemPointInteractable(itemPoint);
      return interactable ? [interactable] : [];
    }),
    ...droppedWorldItems.flatMap((placement) => {
      const interactable = getDroppedWorldItemInteractable(placement);
      return interactable ? [interactable] : [];
    }),
  ];
}

const SPRITE_SOURCES: Record<Direction, string> = {
  N: "./characters/01_N_Back.png",
  NE: "./characters/02_NE_BackRight.png",
  E: "./characters/03_E_Right.png",
  SE: "./characters/04_SE_FrontRight.png",
  S: "./characters/05_S_Front.png",
  SW: "./characters/06_SW_FrontLeft.png",
  W: "./characters/07_W_Left.png",
  NW: "./characters/08_NW_BackLeft.png",
};

const SE_WALK_FRAME_SOURCES = Array.from(
  { length: 26 },
  (_, index) =>
    `./characters/walk/04_SE_FrontRight/Walking_2/Walking_se_${String(index + 1).padStart(2, "0")}.png`,
);
const SE_WALK_REFERENCE_FPS = 26;

const DIRECTION_NAMES: Record<Direction, string> = {
  N: "N - 背面",
  NE: "NE - 右後",
  E: "E - 右側",
  SE: "SE - 右前",
  S: "S - 正面",
  SW: "SW - 左前",
  W: "W - 左側",
  NW: "NW - 左後",
};

const MOVEMENT_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowleft",
  "arrowdown",
  "arrowright",
]);
const GAMEPAD_DEAD_ZONE = 0.18;
const NATIVE_GAMEPAD_BRIDGE_URL = "http://127.0.0.1:3001/state";
const PATHFINDING_GRID_SIZE = 18;
const TOUCH_EFFECT_DURATION_MS = 900;
const GAMEPAD_CURSOR_SPEED = 720;
const FOOTSTEP_REFERENCE_SPEED = 210;
const FOOTSTEP_REFERENCE_PLAYBACK_RATE = 1.7;
const FOOTSTEP_MIN_MOVEMENT_SPEED = 6;
const CARDINAL_DIRECTION_TOLERANCE = Math.tan((18 * Math.PI) / 180);
const POINTER_RETARGET_INTERVAL_SECONDS = 0.12;
const POINTER_RETARGET_MIN_WORLD_DISTANCE = 10;
const POINTER_HOLD_INDICATOR_DELAY_SECONDS = 0.18;
const GAMEPAD_MENU_REPEAT_DELAY_SECONDS = 0.32;
const GAMEPAD_MENU_REPEAT_INTERVAL_SECONDS = 0.12;

const OPTIONS_MENU_ITEMS = [
  "dialogue-text-size",
  "character-size",
  "bgm-enabled",
  "bgm-volume",
  "virtual-cursor-controls",
  "movement-speed",
  "player-collision",
  "scene-collision",
  "collision-slide-tolerance",
  "restart-game",
] as const;

type OptionsMenuItem = (typeof OPTIONS_MENU_ITEMS)[number];
type OptionsTab = "display" | "audio" | "controls" | "advanced";
type DialogueTextSize = "small" | "medium" | "large";

const OPTIONS_TABS: Array<{ id: OptionsTab; label: string }> = [
  { id: "display", label: "畫面" },
  { id: "audio", label: "音效" },
  { id: "controls", label: "操作" },
  { id: "advanced", label: "進階" },
];

const OPTIONS_TAB_ITEMS: Record<OptionsTab, OptionsMenuItem[]> = {
  display: ["dialogue-text-size", "character-size"],
  audio: ["bgm-enabled", "bgm-volume"],
  controls: ["virtual-cursor-controls", "movement-speed"],
  advanced: [
    "player-collision",
    "scene-collision",
    "collision-slide-tolerance",
    "restart-game",
  ],
};

const COMPASS_DIRECTIONS: Direction[] = [
  "N",
  "NW",
  "W",
  "SW",
  "S",
  "SE",
  "E",
  "NE",
];

const COMPASS_MINOR_TICK_POSITIONS = [
  15, 20, 25, 35, 40, 45, 55, 60, 65, 75, 80, 85,
];

const SURVIVAL_STATS = [
  { id: "stamina", label: "體力", symbol: "♥" },
  { id: "hunger", label: "飢餓", symbol: "♨" },
  { id: "thirst", label: "口渴", symbol: "◒" },
  { id: "spirit", label: "精神", symbol: "✦" },
] as const;

const SURVIVAL_VALUE_TWEEN_DURATION_MS = 2500;

type SurvivalMetricId = (typeof SURVIVAL_STATS)[number]["id"];
type SurvivalDisplayValues = Record<SurvivalMetricId, number>;

function getSurvivalDisplayValues(
  values: SurvivalGameState["values"],
): SurvivalDisplayValues {
  return {
    stamina: Math.round(values.stamina),
    hunger: Math.round(values.hunger),
    thirst: Math.round(values.thirst),
    spirit: Math.round(values.spirit),
  };
}

const SURVIVAL_EFFECT_LABELS = {
  stamina: "體力",
  hunger: "飢餓",
  thirst: "口渴",
  spirit: "精神",
} as const;

function formatSurvivalEffects(effects: SurvivalEffects) {
  const entries = Object.entries(SURVIVAL_EFFECT_LABELS).flatMap(
    ([metric, label]) => {
      const value = Number(effects[metric as keyof SurvivalEffects] ?? 0);
      return value === 0 ? [] : [`${label}${value > 0 ? "+" : ""}${value}`];
    },
  );
  return entries.length > 0 ? entries.join("、") : "尚未設定";
}

type InventoryCategory = "all" | ItemCategory;

const INVENTORY_CATEGORIES: Array<{ id: InventoryCategory; label: string }> = [
  { id: "all", label: "全部" },
  { id: "resource", label: "資源" },
  { id: "tool", label: "工具" },
  { id: "quest", label: "任務道具" },
  { id: "main", label: "主線道具" },
];

const DEFAULT_SELECTED_INVENTORY_INDEX = Math.max(
  0,
  ITEM_DATABASE.findIndex((slot) => slot.item?.id === "T0005"),
);

function getCompassWindow(facing: Direction) {
  const currentIndex = COMPASS_DIRECTIONS.indexOf(facing);
  return [-2, -1, 0, 1, 2].map((offset) => ({
    direction:
      COMPASS_DIRECTIONS[
        (currentIndex + offset + COMPASS_DIRECTIONS.length) %
          COMPASS_DIRECTIONS.length
      ],
    offset,
  }));
}

function getOptionsTabForItem(item: OptionsMenuItem): OptionsTab {
  return (Object.keys(OPTIONS_TAB_ITEMS) as OptionsTab[]).find((tab) =>
    OPTIONS_TAB_ITEMS[tab].includes(item),
  ) ?? "display";
}

function getDefaultDialogueTextSize(): DialogueTextSize {
  if (typeof window === "undefined") return "small";
  return window.matchMedia("(max-width: 680px), (pointer: coarse)").matches
    ? "large"
    : "small";
}

function getDefaultQuestCollapsed() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(
    "(max-width: 680px), (hover: none) and (pointer: coarse)",
  ).matches;
}

const SURVIVAL_PANEL_STATE_STORAGE_KEY = "echoes:survival-panel-state";
const HUD_PANEL_TWEEN_DURATION_MS = 300;

type ActiveHudPanelTween = {
  frameId: number;
  height: number;
};

const activeHudPanelTweens = new WeakMap<HTMLElement, ActiveHudPanelTween>();

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - (-2 * progress + 2) ** 3 / 2;
}

function playHudPanelHeightTween(
  element: HTMLElement | null,
  previousHeight: number | null,
) {
  if (!element || typeof window === "undefined") return previousHeight;

  const previousTween = activeHudPanelTweens.get(element);
  if (previousTween) {
    window.cancelAnimationFrame(previousTween.frameId);
  }

  const startHeight = previousTween?.height ?? previousHeight;
  element.style.removeProperty("height");
  const targetHeight = element.offsetHeight;
  if (startHeight === null || Math.abs(targetHeight - startHeight) < 0.5) {
    element.style.removeProperty("will-change");
    activeHudPanelTweens.delete(element);
    return targetHeight;
  }

  const tween: ActiveHudPanelTween = {
    frameId: 0,
    height: startHeight,
  };
  let startedAt: number | null = null;
  element.style.height = `${startHeight}px`;
  element.style.willChange = "height";

  const updateTween = (now: number) => {
    if (!element.isConnected) {
      activeHudPanelTweens.delete(element);
      return;
    }
    if (startedAt === null) startedAt = now;
    const progress = Math.min(
      1,
      (now - startedAt) / HUD_PANEL_TWEEN_DURATION_MS,
    );
    const eased = easeInOutCubic(progress);
    tween.height = startHeight + (targetHeight - startHeight) * eased;
    element.style.height = `${tween.height}px`;

    if (progress < 1) {
      tween.frameId = window.requestAnimationFrame(updateTween);
      return;
    }

    element.style.removeProperty("height");
    element.style.removeProperty("will-change");
    if (activeHudPanelTweens.get(element) === tween) {
      activeHudPanelTweens.delete(element);
    }
  };

  activeHudPanelTweens.set(element, tween);
  tween.frameId = window.requestAnimationFrame(updateTween);
  return targetHeight;
}

function getDefaultSurvivalExpanded() {
  if (typeof window === "undefined") return true;

  try {
    const savedState = window.localStorage.getItem(
      SURVIVAL_PANEL_STATE_STORAGE_KEY,
    );
    if (savedState === "expanded") return true;
    if (savedState === "collapsed") return false;
  } catch {
    // 無法使用本機儲存時，仍依目前裝置類型決定預設狀態。
  }

  return !window.matchMedia(
    "(max-width: 680px), (hover: none) and (pointer: coarse)",
  ).matches;
}

type GamepadInput = {
  actionPressed: boolean;
  backPressed: boolean;
  confirmPressed: boolean;
  connected: boolean;
  cursorX: number;
  cursorY: number;
  dpadX: number;
  dpadY: number;
  diagnostic: string | null;
  gamepad: Gamepad | null;
  hotbarUsePressed: boolean;
  label: string | null;
  leftBumperPressed: boolean;
  rightBumperPressed: boolean;
  secondaryActionPressed: boolean;
  startPressed: boolean;
  stickX: number;
  stickY: number;
  x: number;
  y: number;
};

type NativeGamepadState = {
  buttons: number;
  connected: boolean;
  index: number;
  leftTrigger: number;
  leftX: number;
  leftY: number;
  packet: number;
  rightTrigger: number;
  rightX: number;
  rightY: number;
  source: "xinput";
};

const EMPTY_NATIVE_GAMEPAD_STATE: NativeGamepadState = {
  buttons: 0,
  connected: false,
  index: 0,
  leftTrigger: 0,
  leftX: 0,
  leftY: 0,
  packet: 0,
  rightTrigger: 0,
  rightX: 0,
  rightY: 0,
  source: "xinput",
};

const XINPUT_DPAD_UP = 0x0001;
const XINPUT_DPAD_DOWN = 0x0002;
const XINPUT_DPAD_LEFT = 0x0004;
const XINPUT_DPAD_RIGHT = 0x0008;
const XINPUT_BUTTON_START = 0x0010;
const XINPUT_BUTTON_LEFT_BUMPER = 0x0100;
const XINPUT_BUTTON_RIGHT_BUMPER = 0x0200;
const XINPUT_BUTTON_A = 0x1000;
const XINPUT_BUTTON_B = 0x2000;
const XINPUT_BUTTON_X = 0x4000;
const XINPUT_BUTTON_Y = 0x8000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function applyGamepadDeadZone(value: number) {
  const magnitude = Math.abs(value);
  if (magnitude <= GAMEPAD_DEAD_ZONE) return 0;

  return (
    Math.sign(value) *
    clamp((magnitude - GAMEPAD_DEAD_ZONE) / (1 - GAMEPAD_DEAD_ZONE), 0, 1)
  );
}

function normalizeXInputAxis(value: number) {
  return clamp(value < 0 ? value / 32768 : value / 32767, -1, 1);
}

function getNativeGamepadInput(state: NativeGamepadState): GamepadInput {
  if (!state.connected) {
    return {
      actionPressed: false,
      backPressed: false,
      confirmPressed: false,
      connected: false,
      cursorX: 0,
      cursorY: 0,
      dpadX: 0,
      dpadY: 0,
      diagnostic: null,
      gamepad: null,
      hotbarUsePressed: false,
      label: null,
      leftBumperPressed: false,
      rightBumperPressed: false,
      secondaryActionPressed: false,
      startPressed: false,
      stickX: 0,
      stickY: 0,
      x: 0,
      y: 0,
    };
  }

  const dpadX =
    Number((state.buttons & XINPUT_DPAD_RIGHT) !== 0) -
    Number((state.buttons & XINPUT_DPAD_LEFT) !== 0);
  const dpadY =
    Number((state.buttons & XINPUT_DPAD_DOWN) !== 0) -
    Number((state.buttons & XINPUT_DPAD_UP) !== 0);
  const leftX = applyGamepadDeadZone(normalizeXInputAxis(state.leftX));
  const leftY = applyGamepadDeadZone(-normalizeXInputAxis(state.leftY));
  const rightX = applyGamepadDeadZone(normalizeXInputAxis(state.rightX));
  const rightY = applyGamepadDeadZone(-normalizeXInputAxis(state.rightY));
  const actionPressed =
    (state.buttons & (XINPUT_BUTTON_A | XINPUT_BUTTON_X)) !== 0;

  return {
    actionPressed,
    backPressed: (state.buttons & XINPUT_BUTTON_B) !== 0,
    confirmPressed: (state.buttons & XINPUT_BUTTON_A) !== 0,
    connected: true,
    cursorX: rightX,
    cursorY: rightY,
    dpadX,
    dpadY,
    diagnostic: `XInput · L ${leftX.toFixed(2)}, ${leftY.toFixed(2)} · R ${rightX.toFixed(2)}, ${rightY.toFixed(2)} · A/X ${actionPressed ? "ON" : "OFF"}`,
    gamepad: null,
    hotbarUsePressed: (state.buttons & XINPUT_BUTTON_Y) !== 0,
    label: `Windows XInput Controller ${state.index + 1}`,
    leftBumperPressed: (state.buttons & XINPUT_BUTTON_LEFT_BUMPER) !== 0,
    rightBumperPressed: (state.buttons & XINPUT_BUTTON_RIGHT_BUMPER) !== 0,
    secondaryActionPressed: (state.buttons & XINPUT_BUTTON_X) !== 0,
    startPressed: (state.buttons & XINPUT_BUTTON_START) !== 0,
    stickX: leftX,
    stickY: leftY,
    x: leftX,
    y: leftY,
  };
}

function getGamepadInput(): GamepadInput {
  if (typeof navigator.getGamepads !== "function") {
    return {
      actionPressed: false,
      backPressed: false,
      confirmPressed: false,
      connected: false,
      cursorX: 0,
      cursorY: 0,
      dpadX: 0,
      dpadY: 0,
      diagnostic: null,
      gamepad: null,
      hotbarUsePressed: false,
      label: null,
      leftBumperPressed: false,
      rightBumperPressed: false,
      secondaryActionPressed: false,
      startPressed: false,
      stickX: 0,
      stickY: 0,
      x: 0,
      y: 0,
    };
  }

  const gamepads = navigator.getGamepads();
  const gamepad = Array.from(gamepads).find(
    (candidate): candidate is Gamepad => candidate !== null,
  );

  if (!gamepad) {
    return {
      actionPressed: false,
      backPressed: false,
      confirmPressed: false,
      connected: false,
      cursorX: 0,
      cursorY: 0,
      dpadX: 0,
      dpadY: 0,
      diagnostic: null,
      gamepad: null,
      hotbarUsePressed: false,
      label: null,
      leftBumperPressed: false,
      rightBumperPressed: false,
      secondaryActionPressed: false,
      startPressed: false,
      stickX: 0,
      stickY: 0,
      x: 0,
      y: 0,
    };
  }

  const dpadX =
    Number(gamepad.buttons[15]?.pressed) - Number(gamepad.buttons[14]?.pressed);
  const dpadY =
    Number(gamepad.buttons[13]?.pressed) - Number(gamepad.buttons[12]?.pressed);

  return {
    actionPressed:
      Boolean(gamepad.buttons[0]?.pressed) ||
      Boolean(gamepad.buttons[2]?.pressed),
    backPressed: Boolean(gamepad.buttons[1]?.pressed),
    confirmPressed: Boolean(gamepad.buttons[0]?.pressed),
    connected: true,
    cursorX: applyGamepadDeadZone(gamepad.axes[2] ?? 0),
    cursorY: applyGamepadDeadZone(gamepad.axes[3] ?? 0),
    dpadX,
    dpadY,
    diagnostic: null,
    gamepad,
    hotbarUsePressed: Boolean(gamepad.buttons[3]?.pressed),
    label: gamepad.id || `Gamepad ${gamepad.index + 1}`,
    leftBumperPressed: Boolean(gamepad.buttons[4]?.pressed),
    rightBumperPressed: Boolean(gamepad.buttons[5]?.pressed),
    secondaryActionPressed: Boolean(gamepad.buttons[2]?.pressed),
    startPressed: Boolean(gamepad.buttons[9]?.pressed),
    stickX: applyGamepadDeadZone(gamepad.axes[0] ?? 0),
    stickY: applyGamepadDeadZone(gamepad.axes[1] ?? 0),
    x: applyGamepadDeadZone(gamepad.axes[0] ?? 0),
    y: applyGamepadDeadZone(gamepad.axes[1] ?? 0),
  };
}

function getDirection(x: number, y: number): Direction {
  const absoluteX = Math.abs(x);
  const absoluteY = Math.abs(y);

  if (absoluteX <= absoluteY * CARDINAL_DIRECTION_TOLERANCE) {
    return y < 0 ? "N" : "S";
  }
  if (absoluteY <= absoluteX * CARDINAL_DIRECTION_TOLERANCE) {
    return x > 0 ? "E" : "W";
  }
  if (x > 0) return y < 0 ? "NE" : "SE";
  return y < 0 ? "NW" : "SW";
}

function getDirectionVector(direction: Direction): Point {
  const diagonal = Math.SQRT1_2;
  return {
    N: { x: 0, y: -1 },
    NE: { x: diagonal, y: -diagonal },
    E: { x: 1, y: 0 },
    SE: { x: diagonal, y: diagonal },
    S: { x: 0, y: 1 },
    SW: { x: -diagonal, y: diagonal },
    W: { x: -1, y: 0 },
    NW: { x: -diagonal, y: -diagonal },
  }[direction];
}

function getMovementGuideContact(point: Point, radius: number) {
  let nearest:
    | { guide: MovementGuide; nearest: Point; tangent: Point; distance: number }
    | null = null;

  for (const guide of SCENE_MOVEMENT_GUIDES) {
    const activationRadius = (guide.width ?? 36) / 2 + radius;
    for (let index = 0; index < guide.points.length - 1; index += 1) {
      const start = guide.points[index];
      const end = guide.points[index + 1];
      const contact = distanceToSegment(point, start, end);
      if (contact.distance > activationRadius) continue;
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      if (segmentLength <= Number.EPSILON) continue;
      if (!nearest || contact.distance < nearest.distance) {
        nearest = {
          guide,
          nearest: contact.nearest,
          tangent: {
            x: (end.x - start.x) / segmentLength,
            y: (end.y - start.y) / segmentLength,
          },
          distance: contact.distance,
        };
      }
    }
  }

  return nearest;
}

function findInteractableAt(
  point: Point,
  interactables: readonly SceneInteractable[],
  collectedWorldItems?: ReadonlySet<string>,
  isSelectable: (interactable: SceneInteractable) => boolean = () => true,
): SceneInteractable | null {
  const candidates: Array<{
    interactable: SceneInteractable;
    distance: number;
    sourceIndex: number;
  }> = [];

  interactables.forEach((interactable, sourceIndex) => {
    if (!isSelectable(interactable)) return;
    if (
      interactable.worldItemKind === "placed" &&
      interactable.worldItemId &&
      collectedWorldItems?.has(interactable.worldItemId)
    ) {
      return;
    }
    if (interactable.points && interactable.points.length >= 3) {
      if (pointInPolygon(point, interactable.points)) {
        candidates.push({ interactable, distance: 0, sourceIndex });
      }
      return;
    }
    if (!interactable.position) return;
    const distance = Math.hypot(point.x - interactable.position.x, point.y - interactable.position.y);
    if (distance <= (interactable.pickRadius ?? 32)) {
      candidates.push({ interactable, distance, sourceIndex });
    }
  });

  candidates.sort(
    (left, right) =>
      left.distance - right.distance || right.sourceIndex - left.sourceIndex,
  );
  return selectPreferredInteractionTarget(
    candidates.map((candidate) => candidate.interactable),
  );
}

function findInteractableTouching(
  point: Point,
  radius: number,
  interactables: readonly SceneInteractable[],
  collectedWorldItems?: ReadonlySet<string>,
  isSelectable: (interactable: SceneInteractable) => boolean = () => true,
) {
  const touchingTargets = interactables.filter(
    (interactable) =>
      isSelectable(interactable) &&
      (interactable.worldItemKind !== "placed" ||
        !interactable.worldItemId ||
        !collectedWorldItems?.has(interactable.worldItemId)) &&
      isTouchingInteractable(point, radius, interactable),
  );
  return selectPreferredInteractionTarget(touchingTargets);
}

function isTouchingInteractable(
  point: Point,
  radius: number,
  interactable: SceneInteractable,
) {
  if (interactable.points && interactable.points.length >= 3) {
    return circleIntersectsPolygon(point, radius, interactable.points);
  }
  if (!interactable.position) return false;
  return Math.hypot(point.x - interactable.position.x, point.y - interactable.position.y) <=
    radius + (interactable.pickRadius ?? 32);
}

function getInteractableCenter(interactable: SceneInteractable): Point {
  if (interactable.points && interactable.points.length > 0) {
    return {
      x: interactable.points.reduce((sum, point) => sum + point.x, 0) / interactable.points.length,
      y: interactable.points.reduce((sum, point) => sum + point.y, 0) / interactable.points.length,
    };
  }
  return interactable.position ?? { x: 0, y: 0 };
}

function getInteractionTweenPoint(interactable: SceneInteractable): Point {
  return selectInteractionFeedbackPoint(
    interactable.interactionHintPoint,
    getInteractableCenter(interactable),
  );
}

function getInteractionPoints(
  interactable: SceneInteractable,
): readonly InteractionPoint[] {
  if (interactable.interactionPoints?.length) {
    return interactable.interactionPoints;
  }
  return interactable.interactionPoint ? [interactable.interactionPoint] : [];
}

function findNearestInteractionPoint(
  interactable: SceneInteractable,
  origin: Point,
): InteractionPoint | undefined {
  const points = getInteractionPoints(interactable);
  let nearest = points[0];
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const deltaX = point.x - origin.x;
    const deltaY = point.y - origin.y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared < nearestDistanceSquared) {
      nearest = point;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearest;
}

function splitDialoguePages(text: string, maximumCharacters = 96) {
  const normalized = text.trim() || "...";
  const pages: string[] = [];
  let remainder = normalized;
  while (remainder.length > maximumCharacters) {
    const candidates = ["。", "！", "？", "，", "、", " "];
    let cut = -1;
    for (const marker of candidates) {
      const index = remainder.lastIndexOf(marker, maximumCharacters);
      if (index >= Math.floor(maximumCharacters * 0.55)) {
        cut = index + 1;
        break;
      }
    }
    if (cut < 1) cut = maximumCharacters;
    pages.push(remainder.slice(0, cut).trim());
    remainder = remainder.slice(cut).trim();
  }
  if (remainder) pages.push(remainder);
  return pages.length > 0 ? pages : ["..."];
}

function splitDialogueRevealUnits(text: string) {
  const characters = Array.from(text);
  const units: string[] = [];
  let pendingWhitespace = "";

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (/\s/u.test(character)) {
      pendingWhitespace += character;
      continue;
    }

    if (/\p{P}/u.test(character)) {
      let punctuation = character;
      while (
        index + 1 < characters.length &&
        /\p{P}/u.test(characters[index + 1])
      ) {
        punctuation += characters[index + 1];
        index += 1;
      }
      units.push(pendingWhitespace + punctuation);
      pendingWhitespace = "";
      continue;
    }

    units.push(pendingWhitespace + character);
    pendingWhitespace = "";
  }

  if (pendingWhitespace) {
    if (units.length > 0) units[units.length - 1] += pendingWhitespace;
    else units.push(pendingWhitespace);
  }
  return units.length > 0 ? units : ["..."];
}

function resolveDialogueSpeaker(
  interactable: SceneInteractable,
  lineIndex: number,
) {
  return interactable.dialogue?.lines[lineIndex]?.speaker?.trim() ?? "";
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const rawT =
    lengthSquared === 0
      ? 0
      : ((point.x - start.x) * segmentX +
          (point.y - start.y) * segmentY) /
        lengthSquared;
  const t = clamp(rawT, 0, 1);
  const nearest = {
    x: start.x + segmentX * t,
    y: start.y + segmentY * t,
  };

  return {
    distance: Math.hypot(point.x - nearest.x, point.y - nearest.y),
    nearest,
    isCorner: t <= 0.001 || t >= 0.999,
  };
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;

  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1
  ) {
    const start = polygon[previous];
    const end = polygon[current];

    if (distanceToSegment(point, start, end).distance < 0.01) return true;

    const crosses =
      end.y > point.y !== start.y > point.y &&
      point.x <
        ((start.x - end.x) * (point.y - end.y)) /
          (start.y - end.y || Number.EPSILON) +
          end.x;

    if (crosses) inside = !inside;
  }

  return inside;
}

function pointInNavMesh(point: Point) {
  return NAV_REGIONS.some((region) => pointInPolygon(point, region));
}

function circleIntersectsPolygon(
  center: Point,
  radius: number,
  polygon: Point[],
) {
  if (pointInPolygon(center, polygon)) return true;

  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length;
    if (
      distanceToSegment(center, polygon[index], polygon[next]).distance <
      radius
    ) {
      return true;
    }
  }

  return false;
}

function circleIntersectsCollider(
  center: Point,
  radius: number,
  collider: SceneCollider,
) {
  if (collider.kind === "circle") {
    return (
      Math.hypot(center.x - collider.x, center.y - collider.y) <
      radius + collider.radius
    );
  }

  return circleIntersectsPolygon(center, radius, collider.points);
}

function getCollisionCenter(footPoint: Point, radius: number): Point {
  return { x: footPoint.x, y: footPoint.y - radius };
}

function isWalkable(footPoint: Point, radius: number) {
  const center = getCollisionCenter(footPoint, radius);
  const boundarySamples = 16;

  if (!pointInNavMesh(center)) return false;

  for (let index = 0; index < boundarySamples; index += 1) {
    const angle = (index / boundarySamples) * Math.PI * 2;
    if (
      !pointInNavMesh({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      })
    ) {
      return false;
    }
  }

  return !SCENE_COLLIDERS.some((collider) =>
    circleIntersectsCollider(center, radius, collider),
  );
}

function findNearestSafeItemPointPosition(itemPoint: SceneItemPoint): Point {
  const origin = { x: itemPoint.x, y: itemPoint.y };
  if (isWalkable(origin, 8)) return origin;
  for (const distance of [10, 18, 28, 40, 56, 76, 100]) {
    for (let step = 0; step < 24; step += 1) {
      const angle = (step / 24) * Math.PI * 2;
      const candidate = {
        x: clamp(origin.x + Math.cos(angle) * distance, 0, WORLD.width),
        y: clamp(origin.y + Math.sin(angle) * distance, 0, WORLD.height),
      };
      if (isWalkable(candidate, 8)) return candidate;
    }
  }
  return origin;
}

function findDroppedWorldItemPlacement(
  origin: Point,
  facing: Direction,
  playerRadius: number,
  existingItems: readonly DroppedWorldItem[],
) {
  const forward = getDirectionVector(facing);
  const side = { x: -forward.y, y: forward.x };
  const lateralSteps = [0, 1, -1, 2, -2, 3, -3];
  const randomizedDistanceBoost = getWorldItemThrowDistanceBoost();
  const distanceBoosts = [randomizedDistanceBoost, 8, 16, 24];

  for (const distanceBoost of distanceBoosts) {
    for (let ring = 0; ring < 4; ring += 1) {
      const forwardDistance = 48 + distanceBoost + ring * 26;
      for (const lateralStep of lateralSteps) {
        const lateralDistance = lateralStep * 28;
        const position = {
          x: origin.x + forward.x * forwardDistance + side.x * lateralDistance,
          y: origin.y + forward.y * forwardDistance + side.y * lateralDistance,
        };
        if (!isWalkable(position, 8)) continue;
        if (
          existingItems.some(
            (item) =>
              Math.hypot(
                item.position.x - position.x,
                item.position.y - position.y,
              ) < 24,
          )
        ) {
          continue;
        }

        const directionFromOrigin = {
          x: position.x - origin.x,
          y: position.y - origin.y,
        };
        const distanceFromOrigin = Math.max(
          Number.EPSILON,
          Math.hypot(directionFromOrigin.x, directionFromOrigin.y),
        );
        const interactionPoint = {
          x: position.x - (directionFromOrigin.x / distanceFromOrigin) * 34,
          y: position.y - (directionFromOrigin.y / distanceFromOrigin) * 34,
        };
        if (!isWalkable(interactionPoint, playerRadius)) continue;

        return {
          position,
          interactionPoint: {
            ...interactionPoint,
            facing: getDirection(
              position.x - interactionPoint.x,
              position.y - interactionPoint.y,
            ),
          },
        };
      }
    }
  }
  return null;
}

function findSpawnedWorldItemPlacement(
  origin: Point,
  playerRadius: number,
  existingItems: readonly DroppedWorldItem[],
) {
  const seedAngle = Math.random() * Math.PI * 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // 互動提示點可能位於礦石或其他物件的圖形範圍內。拋物線本身可以
  // 越過物件，因此只要求最終落點與角色接近點可行走，不把空中的
  // 中途落點誤判成必須可行走的位置。
  const distanceBoost = getWorldItemThrowDistanceBoost();
  const finalDistances = [68, 84, 102, 122, 146, 174].map(
    (distance) => distance + distanceBoost,
  );
  const approachDistances = [34, 44, 54, 66];
  const approachAngleOffsets = [
    Math.PI,
    Math.PI * 0.75,
    Math.PI * 1.25,
    Math.PI * 0.5,
    Math.PI * 1.5,
    0,
  ];

  for (const finalDistance of finalDistances) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const angle = seedAngle + attempt * goldenAngle;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const slideDistance = 20;
      const landingDistance = Math.max(24, finalDistance - slideDistance);
      const landing = {
        x: origin.x + direction.x * landingDistance,
        y: origin.y + direction.y * landingDistance,
      };
      const position = {
        x: origin.x + direction.x * finalDistance,
        y: origin.y + direction.y * finalDistance,
      };
      if (!isWalkable(position, 8)) continue;
      if (
        existingItems.some(
          (item) =>
            Math.hypot(
              item.position.x - position.x,
              item.position.y - position.y,
            ) < 24,
        )
      ) {
        continue;
      }

      for (const approachDistance of approachDistances) {
        for (const angleOffset of approachAngleOffsets) {
          const approachAngle = angle + angleOffset;
          const interactionPoint = {
            x: position.x + Math.cos(approachAngle) * approachDistance,
            y: position.y + Math.sin(approachAngle) * approachDistance,
          };
          if (!isWalkable(interactionPoint, playerRadius)) continue;

          return {
            position,
            landing,
            interactionPoint: {
              ...interactionPoint,
              facing: getDirection(
                position.x - interactionPoint.x,
                position.y - interactionPoint.y,
              ),
            },
          };
        }
      }
    }
  }

  return null;
}

function hasWalkableLine(start: Point, end: Point, radius: number) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const steps = Math.max(
    1,
    Math.ceil(distance / (PATHFINDING_GRID_SIZE * 0.45)),
  );

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    if (
      !isWalkable(
        {
          x: start.x + (end.x - start.x) * progress,
          y: start.y + (end.y - start.y) * progress,
        },
        radius,
      )
    ) {
      return false;
    }
  }

  return true;
}

function findPath(start: Point, requestedTarget: Point, radius: number) {
  const columns = Math.floor(WORLD.width / PATHFINDING_GRID_SIZE) + 1;
  const rows = Math.floor(WORLD.height / PATHFINDING_GRID_SIZE) + 1;
  const clampedTarget = {
    x: clamp(requestedTarget.x, 0, WORLD.width),
    y: clamp(requestedTarget.y, 0, WORLD.height),
  };

  if (
    isWalkable(clampedTarget, radius) &&
    hasWalkableLine(start, clampedTarget, radius)
  ) {
    return [clampedTarget];
  }

  const getGridPoint = (column: number, row: number): Point => ({
    x: clamp(column * PATHFINDING_GRID_SIZE, 0, WORLD.width),
    y: clamp(row * PATHFINDING_GRID_SIZE, 0, WORLD.height),
  });
  const getIndex = (column: number, row: number) => row * columns + column;
  const getGridNode = (index: number) => ({
    column: index % columns,
    row: Math.floor(index / columns),
  });
  const gridWalkability = new Map<number, boolean>();
  const isGridWalkable = (column: number, row: number) => {
    const index = getIndex(column, row);
    const cached = gridWalkability.get(index);
    if (cached !== undefined) return cached;

    const walkable = isWalkable(getGridPoint(column, row), radius);
    gridWalkability.set(index, walkable);
    return walkable;
  };

  const findNearestNode = (point: Point) => {
    let nearestIndex = -1;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const gridPoint = getGridPoint(column, row);
        const deltaX = gridPoint.x - point.x;
        const deltaY = gridPoint.y - point.y;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;

        if (
          distanceSquared < nearestDistanceSquared &&
          isGridWalkable(column, row)
        ) {
          nearestIndex = getIndex(column, row);
          nearestDistanceSquared = distanceSquared;
        }
      }
    }

    return nearestIndex;
  };

  const startIndex = findNearestNode(start);
  const targetIndex = findNearestNode(clampedTarget);
  if (startIndex < 0 || targetIndex < 0) return null;

  const open = new Set<number>([startIndex]);
  const closed = new Set<number>();
  const cameFrom = new Map<number, number>();
  const pathCost = new Map<number, number>([[startIndex, 0]]);
  const estimatedCost = new Map<number, number>();
  const targetNode = getGridNode(targetIndex);
  const targetGridPoint = getGridPoint(targetNode.column, targetNode.row);
  const directions = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
  ];

  const heuristic = (point: Point) =>
    Math.hypot(point.x - targetGridPoint.x, point.y - targetGridPoint.y);

  estimatedCost.set(
    startIndex,
    heuristic(
      getGridPoint(
        getGridNode(startIndex).column,
        getGridNode(startIndex).row,
      ),
    ),
  );

  while (open.size > 0) {
    let currentIndex = -1;
    let lowestEstimatedCost = Number.POSITIVE_INFINITY;

    for (const candidateIndex of open) {
      const candidateCost =
        estimatedCost.get(candidateIndex) ?? Number.POSITIVE_INFINITY;
      if (candidateCost < lowestEstimatedCost) {
        currentIndex = candidateIndex;
        lowestEstimatedCost = candidateCost;
      }
    }

    if (currentIndex === targetIndex) {
      const reversedPath: Point[] = [];
      let pathIndex = currentIndex;

      while (pathIndex !== startIndex) {
        const node = getGridNode(pathIndex);
        reversedPath.push(getGridPoint(node.column, node.row));
        const previousIndex = cameFrom.get(pathIndex);
        if (previousIndex === undefined) return null;
        pathIndex = previousIndex;
      }

      const startNode = getGridNode(startIndex);
      const rawPath = [
        start,
        getGridPoint(startNode.column, startNode.row),
        ...reversedPath.reverse(),
      ];

      if (
        isWalkable(clampedTarget, radius) &&
        hasWalkableLine(rawPath[rawPath.length - 1], clampedTarget, radius)
      ) {
        rawPath.push(clampedTarget);
      }

      const smoothedPath: Point[] = [rawPath[0]];
      let anchorIndex = 0;

      while (anchorIndex < rawPath.length - 1) {
        let nextIndex = rawPath.length - 1;
        while (
          nextIndex > anchorIndex + 1 &&
          !hasWalkableLine(
            rawPath[anchorIndex],
            rawPath[nextIndex],
            radius,
          )
        ) {
          nextIndex -= 1;
        }

        smoothedPath.push(rawPath[nextIndex]);
        anchorIndex = nextIndex;
      }

      return smoothedPath.slice(1);
    }

    if (currentIndex < 0) break;
    open.delete(currentIndex);
    closed.add(currentIndex);

    const currentNode = getGridNode(currentIndex);
    const currentCost = pathCost.get(currentIndex) ?? Number.POSITIVE_INFINITY;

    for (const direction of directions) {
      const neighborColumn = currentNode.column + direction.x;
      const neighborRow = currentNode.row + direction.y;
      if (
        neighborColumn < 0 ||
        neighborColumn >= columns ||
        neighborRow < 0 ||
        neighborRow >= rows
      ) {
        continue;
      }

      const neighborIndex = getIndex(neighborColumn, neighborRow);
      if (closed.has(neighborIndex)) continue;

      const neighborPoint = getGridPoint(neighborColumn, neighborRow);
      if (!isGridWalkable(neighborColumn, neighborRow)) continue;

      const isDiagonal = direction.x !== 0 && direction.y !== 0;
      if (
        isDiagonal &&
        (!isGridWalkable(
          currentNode.column + direction.x,
          currentNode.row,
        ) ||
          !isGridWalkable(
            currentNode.column,
            currentNode.row + direction.y,
          ))
      ) {
        continue;
      }

      const tentativeCost =
        currentCost + PATHFINDING_GRID_SIZE * (isDiagonal ? Math.SQRT2 : 1);
      if (
        tentativeCost >=
        (pathCost.get(neighborIndex) ?? Number.POSITIVE_INFINITY)
      ) {
        continue;
      }

      cameFrom.set(neighborIndex, currentIndex);
      pathCost.set(neighborIndex, tentativeCost);
      estimatedCost.set(
        neighborIndex,
        tentativeCost + heuristic(neighborPoint),
      );
      open.add(neighborIndex);
    }
  }

  return null;
}

function getColliderContact(center: Point, collider: SceneCollider) {
  if (collider.kind === "circle") {
    const deltaX = center.x - collider.x;
    const deltaY = center.y - collider.y;
    const centerDistance = Math.hypot(deltaX, deltaY);

    if (centerDistance <= 0.001) return null;

    return {
      distance: centerDistance - collider.radius,
      normal: {
        x: deltaX / centerDistance,
        y: deltaY / centerDistance,
      },
      isCorner: true,
    };
  }

  if (pointInPolygon(center, collider.points)) return null;

  let nearestContact:
    | {
        distance: number;
        nearest: Point;
        isCorner: boolean;
      }
    | undefined;

  for (let index = 0; index < collider.points.length; index += 1) {
    const next = (index + 1) % collider.points.length;
    const candidate = distanceToSegment(
      center,
      collider.points[index],
      collider.points[next],
    );

    if (!nearestContact || candidate.distance < nearestContact.distance) {
      nearestContact = candidate;
    }
  }

  if (!nearestContact || nearestContact.distance <= 0.001) return null;

  return {
    distance: nearestContact.distance,
    normal: {
      x: (center.x - nearestContact.nearest.x) / nearestContact.distance,
      y: (center.y - nearestContact.nearest.y) / nearestContact.distance,
    },
    isCorner: nearestContact.isCorner,
  };
}

function getCollisionSlidePosition(
  currentFootPoint: Point,
  desiredFootPoint: Point,
  radius: number,
  velocity: Point,
  distance: number,
  assistance: number,
) {
  const currentCenter = getCollisionCenter(currentFootPoint, radius);
  const center = getCollisionCenter(desiredFootPoint, radius);
  const slideStrength = clamp(0.75 + assistance * 0.5, 0.8, 1.15);

  for (const collider of SCENE_COLLIDERS) {
    if (!circleIntersectsCollider(center, radius, collider)) continue;

    const contact =
      getColliderContact(currentCenter, collider) ??
      getColliderContact(center, collider);
    if (!contact) continue;

    const inwardMotion =
      velocity.x * contact.normal.x + velocity.y * contact.normal.y;
    if (inwardMotion >= -0.001) continue;

    const tangentMotion = {
      x: velocity.x - contact.normal.x * inwardMotion,
      y: velocity.y - contact.normal.y * inwardMotion,
    };
    const tangentLength = Math.hypot(tangentMotion.x, tangentMotion.y);
    if (tangentLength <= 0.02) continue;

    const slideDistance =
      distance * clamp(tangentLength * slideStrength, 0, 1);
    const clearance = Math.max(0, radius + 0.45 - contact.distance);
    const slidePosition = {
      x:
        currentFootPoint.x +
        (tangentMotion.x / tangentLength) * slideDistance +
        contact.normal.x * clearance,
      y:
        currentFootPoint.y +
        (tangentMotion.y / tangentLength) * slideDistance +
        contact.normal.y * clearance,
    };

    if (isWalkable(slidePosition, radius)) return slidePosition;
  }

  const maximumSteeringAngle =
    ((35 + clamp(assistance, 0, 1) * 53) * Math.PI) / 180;
  const steeringSteps = 8;

  for (let step = 1; step <= steeringSteps; step += 1) {
    const angle = (maximumSteeringAngle * step) / steeringSteps;

    for (const direction of [-1, 1]) {
      const rotation = angle * direction;
      const cosine = Math.cos(rotation);
      const sine = Math.sin(rotation);
      const steeredVelocity = {
        x: velocity.x * cosine - velocity.y * sine,
        y: velocity.x * sine + velocity.y * cosine,
      };
      const slidePosition = {
        x: currentFootPoint.x + steeredVelocity.x * distance,
        y: currentFootPoint.y + steeredVelocity.y * distance,
      };

      if (isWalkable(slidePosition, radius)) return slidePosition;
    }
  }

  return null;
}

function getSceneZoom(viewportWidth: number, viewportHeight: number) {
  return clamp(
    Math.min(viewportWidth / 920, viewportHeight / 650),
    1.08,
    1.45,
  );
}

function getCameraCoordinate(
  playerCoordinate: number,
  viewportSize: number,
  worldSize: number,
  zoom: number,
) {
  const visibleWorldSize = viewportSize / zoom;
  if (visibleWorldSize >= worldSize) return worldSize / 2;

  return clamp(
    playerCoordinate,
    visibleWorldSize / 2,
    worldSize - visibleWorldSize / 2,
  );
}

type PreparedChromaKeySprite = {
  canvas: HTMLCanvasElement;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function prepareChromaKeySprite(
  image: HTMLImageElement,
): PreparedChromaKeySprite {
  const scale = Math.min(1, 720 / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const working = document.createElement("canvas");
  working.width = width;
  working.height = height;
  const context = working.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return {
      canvas: working,
      minX: 0,
      minY: 0,
      maxX: width - 1,
      maxY: height - 1,
    };
  }

  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const greenDominance = green - Math.max(red, blue);

      if (green > 95 && greenDominance > 42) {
        const softness = clamp((greenDominance - 42) / 52, 0, 1);
        data[index + 3] = Math.round(255 * (1 - softness));
        data[index + 1] = Math.min(green, Math.max(red, blue) + 18);
      }

      if (data[index + 3] > 26) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  context.putImageData(pixels, 0, 0);

  return { canvas: working, minX, minY, maxX, maxY };
}

function cropPreparedChromaKeySprites(
  preparedFrames: PreparedChromaKeySprite[],
) {
  const visibleFrames = preparedFrames.filter(
    ({ minX, minY, maxX, maxY }) => minX <= maxX && minY <= maxY,
  );

  if (visibleFrames.length === 0) {
    return preparedFrames.map(({ canvas }) => canvas);
  }

  const padding = 4;
  const minX = Math.max(
    0,
    Math.min(...visibleFrames.map((frame) => frame.minX)) - padding,
  );
  const minY = Math.max(
    0,
    Math.min(...visibleFrames.map((frame) => frame.minY)) - padding,
  );
  const maxCanvasWidth = Math.max(
    ...preparedFrames.map(({ canvas }) => canvas.width),
  );
  const maxCanvasHeight = Math.max(
    ...preparedFrames.map(({ canvas }) => canvas.height),
  );
  const maxX = Math.min(
    maxCanvasWidth - 1,
    Math.max(...visibleFrames.map((frame) => frame.maxX)) + padding,
  );
  const maxY = Math.min(
    maxCanvasHeight - 1,
    Math.max(...visibleFrames.map((frame) => frame.maxY)) + padding,
  );
  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;

  return preparedFrames.map(({ canvas }) => {
    const cropped = document.createElement("canvas");
    cropped.width = croppedWidth;
    cropped.height = croppedHeight;
    cropped
      .getContext("2d")
      ?.drawImage(
        canvas,
        minX,
        minY,
        croppedWidth,
        croppedHeight,
        0,
        0,
        croppedWidth,
        croppedHeight,
      );
    return cropped;
  });
}

function makeChromaKeySprite(image: HTMLImageElement) {
  return cropPreparedChromaKeySprites([prepareChromaKeySprite(image)])[0];
}

function makeChromaKeySpriteSequence(images: HTMLImageElement[]) {
  return cropPreparedChromaKeySprites(images.map(prepareChromaKeySprite));
}

function tracePolygon(
  context: CanvasRenderingContext2D,
  polygon: Point[],
) {
  context.beginPath();
  polygon.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
}

function drawMiniMapGeometry(canvas: HTMLCanvasElement) {
  const { columns, rows, mask, contours } = MINI_MAP_GEOMETRY;
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d");
  if (!context) return;

  const image = context.createImageData(columns, rows);
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 1) continue;
    const pixel = index * 4;
    image.data[pixel] = 97;
    image.data[pixel + 1] = 191;
    image.data[pixel + 2] = 180;
    image.data[pixel + 3] = 92;
  }
  context.putImageData(image, 0, 0);

  context.save();
  context.beginPath();
  for (const [start, end] of contours) {
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  }
  context.strokeStyle = "rgba(244, 255, 253, 0.96)";
  context.lineWidth = 0.86;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = "rgba(155, 255, 240, 0.62)";
  context.shadowBlur = 1.4;
  context.stroke();
  context.restore();
}

const INITIAL_SURVIVAL_STATE = createInitialSurvivalState();

export function MovementLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapPlayerMarkerRef = useRef<HTMLSpanElement>(null);
  const gameShellRef = useRef<HTMLElement>(null);
  const survivalHudRef = useRef<HTMLElement>(null);
  const questHudRef = useRef<HTMLElement>(null);
  const blackScreenImageRef = useRef<HTMLImageElement>(null);
  const blackScreenOpacityRef = useRef(255);
  const blackScreenAnimationRef = useRef<number | null>(null);
  const nativeGamepadRef = useRef<NativeGamepadState>(
    EMPTY_NATIVE_GAMEPAD_STATE,
  );
  const speedRef = useRef(210);
  const sizeRef = useRef(142);
  const playerPositionRef = useRef<Point>({ ...SPAWN });
  const playerFacingRef = useRef<Direction>(SCENE_START_FACING);
  const playerTeleportHandlerRef = useRef<(point: SceneTeleportPoint) => boolean>(
    () => false,
  );
  const pendingTeleportPointsRef = useRef<SceneTeleportPoint[]>([]);
  const teleportTimerIdsRef = useRef<Set<number>>(new Set());
  const collisionSlideToleranceRef = useRef(0.55);
  const showPlayerCollisionRef = useRef(false);
  const showSceneCollisionRef = useRef(false);
  const bgmEnabledRef = useRef(true);
  const bgmVolumeRef = useRef<number>(AUDIO_EVENT_CONFIG.bgm.volume);
  const virtualCursorControlsEnabledRef = useRef(true);
  const questPromptInputModeRef = useRef<QuestPromptInputMode>("keyboard-mouse");
  const audioEventManagerRef = useRef<AudioEventManager | null>(null);
  const requestBgmPlaybackRef = useRef<() => void>(() => {});
  const optionsOpenRef = useRef(false);
  const debugItemSpawnerOpenRef = useRef(false);
  const debugItemSpawnHandlerRef = useRef<(command: string) => boolean>(
    () => false,
  );
  const debugItemInputRef = useRef<HTMLInputElement>(null);
  const survivalFlowPausedRef = useRef(false);
  const restartConfirmationOpenRef = useRef(false);
  const restartConfirmationChoiceRef = useRef<"cancel" | "confirm">("cancel");
  const inventoryOpenRef = useRef(false);
  const optionsTabRef = useRef<OptionsTab>("display");
  const optionsMenuSelectionRef = useRef<OptionsMenuItem>(
    OPTIONS_MENU_ITEMS[0],
  );
  const dialoguePlaybackRef = useRef<DialoguePlayback | null>(null);
  const dialogueTypingRef = useRef<DialogueTyping | null>(null);
  const hotbarFeedbackTimerRef = useRef<number | null>(null);
  const hotbarSelectionHintTimerRef = useRef<number | null>(null);
  const hotbarUseSequenceRef = useRef(0);
  const hotbarSelectionHintSequenceRef = useRef(0);
  const activeHotbarSlotRef = useRef(0);
  const hotbarAssignmentsRef = useRef<(string | null)[]>([
    ...DEFAULT_HOTBAR_ASSIGNMENTS,
  ]);
  const pendingInventoryDragRef = useRef<PendingInventoryDrag | null>(null);
  const suppressInventoryClickRef = useRef(false);
  const selectedInventoryIndexRef = useRef(
    DEFAULT_SELECTED_INVENTORY_INDEX,
  );
  const droppedWorldItemsRef = useRef<DroppedWorldItem[]>([]);
  const itemPointProgressRef = useRef<ItemPointProgress>(
    createInitialItemPointProgress(),
  );
  const sceneEntryCollectedItemPointIdsRef = useRef<Set<string>>(new Set());
  const worldItemSpawnMotionsRef = useRef<Map<string, WorldItemSpawnMotion>>(
    new Map(),
  );
  const worldItemLandingAudioPlayedRef = useRef<Set<string>>(new Set());
  const sceneInteractablesRef = useRef<SceneInteractable[]>(
    buildSceneInteractables(
      [],
      createInitialItemPointProgress(),
      INITIAL_SURVIVAL_STATE.gameMinutes,
      new Set(),
    ),
  );
  const mobileInteractionActionRef = useRef<() => void>(() => {});
  const droppedWorldItemSequenceRef = useRef(0);
  const optionsGamepadModeRef = useRef<OptionsGamepadMode>("dpad");
  const inventoryGamepadModeRef = useRef<"cursor" | "dpad">("dpad");
  const inventoryCategoryRef = useRef<InventoryCategory>("all");
  const survivalStateRef = useRef<SurvivalGameState>(INITIAL_SURVIVAL_STATE);
  const previousSurvivalDisplayValuesRef = useRef<SurvivalDisplayValues | null>(
    null,
  );
  const survivalValueTweenSequenceRef = useRef(0);
  const survivalValueTweenExpiryTimerRef = useRef<number | null>(null);
  const timeElapsedNoticeTimerRef = useRef<number | null>(null);
  const timeElapsedNoticeSequenceRef = useRef(0);
  const timeElapsedNoticeActiveRef = useRef(false);
  const timeElapsedNoticeDismissingRef = useRef(false);
  const questHudEventSequenceRef = useRef(0);
  const questGameEventSequenceRef = useRef(0);
  const questHudEventTimerRef = useRef<number | null>(null);
  const questHudEventFinishedRef = useRef<(() => void) | null>(null);
  const questObjectiveTweenTimerRef = useRef<number | null>(null);
  const questStageTransitionTimerRef = useRef<number | null>(null);
  const questStageEnteringTimerRef = useRef<number | null>(null);
  const questEventNoticeTimerRef = useRef<number | null>(null);
  const timePassInputLockedRef = useRef(false);
  const timePassTransitionTimersRef = useRef<number[]>([]);
  const timePassTransitionWatchdogRef = useRef<number | null>(null);
  const interactionUsageRef = useRef<InteractionUsageState>(
    createInteractionUsageState(INITIAL_SURVIVAL_STATE.gameMinutes),
  );
  const currentStoryChapterRef = useRef(3);
  const storyProgressRef = useRef<StoryProgress>(createInitialStoryProgress());
  const questRuntimeManagerRef = useRef<QuestRuntimeManager | null>(null);
  const dialogueManagerRef = useRef<DialogueManager<SceneInteractable> | null>(null);
  const storyEventManagerRef = useRef<StoryEventManager | null>(null);
  const canActivateStoryTriggerRef = useRef<(zone: StoryTriggerZone) => boolean>(
    () => false,
  );
  const completeStoryTriggerRef = useRef<(zone: StoryTriggerZone) => boolean>(
    () => false,
  );
  const requestStoryTriggerContactCheckRef = useRef<() => void>(() => {});
  const chapterFlowManagerRef = useRef<ChapterFlowManager | null>(null);
  const storyReadyEmittedRef = useRef(false);
  const storyInputLockedRef = useRef(false);
  const storyFlowActiveRef = useRef(false);
  const storySkipHoldRef = useRef<{
    source: "keyboard" | "gamepad" | "touch";
    revealTimer: number;
    completeTimer: number | null;
    revealed: boolean;
  } | null>(null);
  const storySkipFinalizeTimerRef = useRef<number | null>(null);
  const mainObjectiveMarkerTimerRef = useRef<number | null>(null);
  const storySkipBlackoutGuardRef = useRef(false);
  const suppressNextStoryClickRef = useRef(false);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [storyReady, setStoryReady] = useState(false);
  const [storyInputLocked, setStoryInputLocked] = useState(false);
  const [storyFlowActive, setStoryFlowActive] = useState(false);
  const [storyFlowPaused, setStoryFlowPaused] = useState(false);
  const [storyCenteredText, setStoryCenteredText] = useState<{
    lines: string[];
    fadeInMs: number;
    holdMs: number;
    fadeOutMs: number;
    sequence: number;
  } | null>(null);
  const [storySkipVisible, setStorySkipVisible] = useState(false);
  const [storySkipSequence, setStorySkipSequence] = useState(0);
  const [mainObjectiveMarker, setMainObjectiveMarker] = useState<{
    sequence: number;
    durationMs: number;
  } | null>(null);
  const [debugItemSpawnerOpen, setDebugItemSpawnerOpen] = useState(false);
  const [debugItemSpawnCommand, setDebugItemSpawnCommand] = useState("");
  const [survivalFlowPaused, setSurvivalFlowPaused] = useState(false);
  const [restartConfirmationOpen, setRestartConfirmationOpen] = useState(false);
  const [restartConfirmationChoice, setRestartConfirmationChoice] =
    useState<"cancel" | "confirm">("cancel");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [stageFullscreen, setStageFullscreen] = useState(false);
  const [optionsTab, setOptionsTab] = useState<OptionsTab>("display");
  const [optionsMenuSelection, setOptionsMenuSelection] =
    useState<OptionsMenuItem>(OPTIONS_MENU_ITEMS[0]);
  const [showPlayerCollision, setShowPlayerCollision] = useState(false);
  const [showSceneCollision, setShowSceneCollision] = useState(false);
  const [speed, setSpeed] = useState(210);
  const [size, setSize] = useState(142);
  const [collisionSlideTolerance, setCollisionSlideTolerance] = useState(55);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [bgmVolume, setBgmVolume] = useState(
    Math.round(AUDIO_EVENT_CONFIG.bgm.volume * 100),
  );
  const [virtualCursorControlsEnabled, setVirtualCursorControlsEnabled] =
    useState(true);
  const [dialogueTextSize, setDialogueTextSize] =
    useState<DialogueTextSize>("small");
  const [facing, setFacing] = useState<Direction>(SCENE_START_FACING);
  const [moving, setMoving] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [questPromptInputMode, setQuestPromptInputMode] =
    useState<QuestPromptInputMode>("keyboard-mouse");
  const [gamepadLabel, setGamepadLabel] = useState<string | null>(null);
  const [gamepadDiagnostic, setGamepadDiagnostic] = useState(
    "等待手把輸入…",
  );
  const [activeKeyboardKeys, setActiveKeyboardKeys] = useState<string[]>([]);
  const [interactionJustTriggered, setInteractionJustTriggered] = useState(false);
  const [mobileInteractionTarget, setMobileInteractionTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [survivalState, setSurvivalState] = useState<SurvivalGameState>(
    INITIAL_SURVIVAL_STATE,
  );
  const [survivalValueTweens, setSurvivalValueTweens] = useState<
    Partial<
      Record<
        SurvivalMetricId,
        { delta: number; sequence: number; startedAt: number }
      >
    >
  >({});
  const [timeElapsedNotice, setTimeElapsedNotice] = useState<{
    startGameMinutes: number;
    gameMinutes: number;
    sequence: number;
    dismissing: boolean;
  } | null>(null);
  const gameClock = getGameClock(survivalState.gameMinutes);
  const itemPointRespawnCycle = getInteractionCycle(survivalState.gameMinutes);
  const [survivalExpanded, setSurvivalExpanded] = useState(true);
  const [questCollapsed, setQuestCollapsed] = useState(false);
  const [activeQuestHud, setActiveQuestHud] = useState<QuestHudView | null>(null);
  const [completedQuestHistory, setCompletedQuestHistory] = useState<QuestHistoryView[]>([]);
  const [questHudEvent, setQuestHudEvent] = useState<QuestHudEvent | null>(null);
  const [questObjectiveTween, setQuestObjectiveTween] = useState<{
    questId: string;
    objectiveId: string;
    sequence: number;
  } | null>(null);
  const [questStageEntering, setQuestStageEntering] = useState(false);
  const [questEventNotice, setQuestEventNotice] = useState<{
    kind: "accepted" | "completed";
    sequence: number;
  } | null>(null);
  const hasActiveQuest = activeQuestHud !== null;
  const questPanelCollapsed = questCollapsed;
  const previousSurvivalPanelHeightRef = useRef<number | null>(null);
  const previousQuestPanelHeightRef = useRef<number | null>(null);
  const [minimapCollapsed, setMinimapCollapsed] = useState(false);
  const [activeMinimapItemPoints, setActiveMinimapItemPoints] = useState<
    SceneItemPoint[]
  >(() => SCENE_ITEM_POINTS.filter((itemPoint) => itemPoint.showOnMinimap));
  const [playerInventory, setPlayerInventory] = useState<PlayerInventory>(
    () => ({ ...INITIAL_PLAYER_INVENTORY }),
  );
  const [collectedWorldItemIds, setCollectedWorldItemIds] = useState(
    () => new Set<string>(),
  );
  const playerInventoryRef = useRef(playerInventory);
  const collectedWorldItemIdsRef = useRef(collectedWorldItemIds);
  const [activeHotbarSlot, setActiveHotbarSlot] = useState(0);
  const [hotbarAssignments, setHotbarAssignments] = useState<(string | null)[]>(
    () => [...DEFAULT_HOTBAR_ASSIGNMENTS],
  );
  const [inventoryDrag, setInventoryDrag] = useState<InventoryDragState | null>(null);
  const [hotbarDropTarget, setHotbarDropTarget] = useState<number | null>(null);
  const [inventoryContextMenu, setInventoryContextMenu] =
    useState<InventoryContextMenu | null>(null);
  const [inventoryCategory, setInventoryCategory] = useState<InventoryCategory>("all");
  const [inventoryPage, setInventoryPage] = useState(0);
  const [selectedInventoryIndex, setSelectedInventoryIndex] = useState(
    DEFAULT_SELECTED_INVENTORY_INDEX,
  );
  const [hotbarFeedback, setHotbarFeedback] = useState<{
    message: string;
    sequence: number;
    slotIndex: number;
  } | null>(null);
  const [hotbarSelectionHint, setHotbarSelectionHint] = useState<{
    slotIndex: number;
    sequence: number;
    visible: boolean;
  } | null>(null);

  const activateQuestPromptInputMode = (mode: QuestPromptInputMode) => {
    if (questPromptInputModeRef.current === mode) return;
    questPromptInputModeRef.current = mode;
    setQuestPromptInputMode(mode);
  };
  const [dialogueView, setDialogueView] = useState<DialogueView>(null);

  useLayoutEffect(() => {
    previousSurvivalPanelHeightRef.current = playHudPanelHeightTween(
      survivalHudRef.current,
      previousSurvivalPanelHeightRef.current,
    );
  }, [survivalExpanded]);

  useLayoutEffect(() => {
    previousQuestPanelHeightRef.current = playHudPanelHeightTween(
      questHudRef.current,
      previousQuestPanelHeightRef.current,
    );
  }, [questPanelCollapsed, activeQuestHud?.stageId, completedQuestHistory.length]);

  useEffect(() => {
    if (activeQuestHud !== null || questHudEvent !== null) return;
    setQuestCollapsed(true);
  }, [activeQuestHud, questHudEvent]);

  const cancelBlackScreenFade = () => {
    if (blackScreenAnimationRef.current !== null) {
      window.cancelAnimationFrame(blackScreenAnimationRef.current);
      blackScreenAnimationRef.current = null;
    }
  };

  const setBlackScreenOpacity = (opacity255: number) => {
    const next = clamp(Math.round(opacity255), 0, 255);
    blackScreenOpacityRef.current = next;
    const image = blackScreenImageRef.current;
    if (!image) return;
    image.style.opacity = String(next / 255);
    image.dataset.opacity = String(next);
    image.dataset.inputBlocking = next > 0 ? "true" : "false";
  };

  const fadeBlackScreen = (
    targetOpacity255: number,
    durationMs: number,
    onComplete?: () => void,
  ) => {
    cancelBlackScreenFade();
    const from = blackScreenOpacityRef.current;
    const target = clamp(Math.round(targetOpacity255), 0, 255);
    const duration = Math.max(0, durationMs);
    if (duration === 0 || from === target) {
      setBlackScreenOpacity(target);
      onComplete?.();
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - ((-2 * progress + 2) ** 2) / 2;
      setBlackScreenOpacity(from + (target - from) * eased);
      if (progress >= 1) {
        blackScreenAnimationRef.current = null;
        setBlackScreenOpacity(target);
        onComplete?.();
        return;
      }
      blackScreenAnimationRef.current = window.requestAnimationFrame(step);
    };
    blackScreenAnimationRef.current = window.requestAnimationFrame(step);
  };

  const clearTimePassTransition = () => {
    if (timePassTransitionWatchdogRef.current !== null) {
      window.clearTimeout(timePassTransitionWatchdogRef.current);
      timePassTransitionWatchdogRef.current = null;
    }
    for (const timerId of timePassTransitionTimersRef.current) {
      window.clearTimeout(timerId);
    }
    timePassTransitionTimersRef.current = [];
  };

  const showTimeElapsedNotice = (
    startGameMinutes: number,
    gameMinutes: number,
  ) => {
    if (!(gameMinutes > 0)) return;
    if (timeElapsedNoticeTimerRef.current !== null) {
      window.clearTimeout(timeElapsedNoticeTimerRef.current);
    }
    timeElapsedNoticeActiveRef.current = true;
    timeElapsedNoticeDismissingRef.current = false;
    timeElapsedNoticeSequenceRef.current += 1;
    setTimeElapsedNotice({
      startGameMinutes,
      gameMinutes,
      sequence: timeElapsedNoticeSequenceRef.current,
      dismissing: false,
    });
    timeElapsedNoticeTimerRef.current = window.setTimeout(() => {
      timeElapsedNoticeTimerRef.current = null;
      timeElapsedNoticeActiveRef.current = false;
      timeElapsedNoticeDismissingRef.current = false;
      setTimeElapsedNotice(null);
    }, 3350);
  };

  const dismissTimeElapsedNotice = () => {
    if (
      !timeElapsedNoticeActiveRef.current ||
      timeElapsedNoticeDismissingRef.current
    ) return;
    timeElapsedNoticeDismissingRef.current = true;
    if (timeElapsedNoticeTimerRef.current !== null) {
      window.clearTimeout(timeElapsedNoticeTimerRef.current);
    }
    setTimeElapsedNotice((current) =>
      current ? { ...current, dismissing: true } : current,
    );
    timeElapsedNoticeTimerRef.current = window.setTimeout(() => {
      timeElapsedNoticeTimerRef.current = null;
      timeElapsedNoticeActiveRef.current = false;
      timeElapsedNoticeDismissingRef.current = false;
      setTimeElapsedNotice(null);
    }, 1000);
  };

  const getFirstActiveQuestHud = () => {
    const manager = questRuntimeManagerRef.current;
    if (!manager) return null;
    const save = manager.exportSave();
    for (const quest of QUEST_DOCUMENT.quests) {
      const entry = save.quests[quest.id];
      if (entry?.state !== "active") continue;
      const view = buildQuestHudView(quest.id, entry);
      if (view) return view;
    }
    return null;
  };

  const getCompletedQuestHistory = (): QuestHistoryView[] => {
    const manager = questRuntimeManagerRef.current;
    if (!manager) return [];
    return manager.getCompletedQuestIds(3).flatMap((questId) => {
      const quest = QUEST_DOCUMENT.quests.find((candidate) => candidate.id === questId);
      return quest ? [{ id: quest.id, title: quest.name }] : [];
    });
  };

  const showQuestEventNotice = (kind: "accepted" | "completed") => {
    if (questEventNoticeTimerRef.current !== null) {
      window.clearTimeout(questEventNoticeTimerRef.current);
    }
    questHudEventSequenceRef.current += 1;
    setQuestEventNotice({
      kind,
      sequence: questHudEventSequenceRef.current,
    });
    questEventNoticeTimerRef.current = window.setTimeout(() => {
      questEventNoticeTimerRef.current = null;
      setQuestEventNotice(null);
    }, 3350);
  };

  const triggerQuestHudVisual = (
    kind: QuestHudEventKind,
    view: QuestHudView,
    onFinished?: () => void,
  ) => {
    if (questHudEventTimerRef.current !== null) {
      window.clearTimeout(questHudEventTimerRef.current);
      questHudEventTimerRef.current = null;
      const finishPrevious = questHudEventFinishedRef.current;
      questHudEventFinishedRef.current = null;
      finishPrevious?.();
    }
    questHudEventSequenceRef.current += 1;
    setActiveQuestHud(view);
    setQuestCollapsed(false);
    setQuestHudEvent({
      kind,
      questId: view.id,
      sequence: questHudEventSequenceRef.current,
    });
    if (kind === "accepted" || kind === "completed") {
      showQuestEventNotice(kind);
    }
    questHudEventFinishedRef.current = onFinished ?? null;
    questHudEventTimerRef.current = window.setTimeout(() => {
      questHudEventTimerRef.current = null;
      setQuestHudEvent(null);
      if (kind !== "accepted") setActiveQuestHud(getFirstActiveQuestHud());
      const finish = questHudEventFinishedRef.current;
      questHudEventFinishedRef.current = null;
      finish?.();
    }, kind === "accepted" ? 2600 : 3300);
  };

  const triggerQuestObjectiveTween = (
    view: QuestHudView,
    objectiveId: string,
  ) => {
    if (questObjectiveTweenTimerRef.current !== null) {
      window.clearTimeout(questObjectiveTweenTimerRef.current);
    }
    questHudEventSequenceRef.current += 1;
    setActiveQuestHud(view);
    setQuestCollapsed(false);
    setQuestObjectiveTween({
      questId: view.id,
      objectiveId,
      sequence: questHudEventSequenceRef.current,
    });
    questObjectiveTweenTimerRef.current = window.setTimeout(() => {
      questObjectiveTweenTimerRef.current = null;
      setQuestObjectiveTween(null);
    }, 1000);
  };

  const triggerQuestStageTransition = (
    view: QuestHudView,
    completeTransition: () => void,
  ) => {
    if (questHudEventTimerRef.current !== null) {
      window.clearTimeout(questHudEventTimerRef.current);
      questHudEventTimerRef.current = null;
      const finishPrevious = questHudEventFinishedRef.current;
      questHudEventFinishedRef.current = null;
      finishPrevious?.();
    }
    if (questStageTransitionTimerRef.current !== null) {
      window.clearTimeout(questStageTransitionTimerRef.current);
    }
    questHudEventSequenceRef.current += 1;
    setActiveQuestHud(view);
    setQuestCollapsed(false);
    setQuestHudEvent({
      kind: "next",
      questId: view.id,
      sequence: questHudEventSequenceRef.current,
    });
    questHudEventTimerRef.current = window.setTimeout(() => {
      questHudEventTimerRef.current = null;
      setQuestHudEvent((current) =>
        current?.kind === "next" && current.questId === view.id ? null : current,
      );
    }, 3000);
    questStageTransitionTimerRef.current = window.setTimeout(() => {
      questStageTransitionTimerRef.current = null;
      completeTransition();
      setQuestStageEntering(true);
      if (questStageEnteringTimerRef.current !== null) {
        window.clearTimeout(questStageEnteringTimerRef.current);
      }
      questStageEnteringTimerRef.current = window.setTimeout(() => {
        questStageEnteringTimerRef.current = null;
        setQuestStageEntering(false);
      }, 340);
    }, 3000);
  };

  const scheduleQuestTeleport = (pointId: string, delayMilliseconds: number) => {
    const point = SCENE_TELEPORT_POINTS.find((candidate) =>
      candidate.id.toLocaleLowerCase() === pointId.trim().toLocaleLowerCase()
    );
    if (!point) {
      console.warn(`[QuestTeleport] Unknown teleport Point ID: ${pointId}`);
      return;
    }
    const applyTeleport = () => {
      if (!playerTeleportHandlerRef.current(point)) {
        pendingTeleportPointsRef.current.push(point);
      }
    };
    const safeDelay = Number.isFinite(delayMilliseconds)
      ? Math.max(0, delayMilliseconds)
      : 0;
    if (safeDelay <= 0) {
      applyTeleport();
      return;
    }
    const timerId = window.setTimeout(() => {
      teleportTimerIdsRef.current.delete(timerId);
      applyTeleport();
    }, safeDelay);
    teleportTimerIdsRef.current.add(timerId);
  };

  const applyDroppedWorldItems = (items: readonly DroppedWorldItem[]) => {
    const nextItems = [...items];
    droppedWorldItemsRef.current = nextItems;
    const gameMinutes = survivalStateRef.current.gameMinutes;
    sceneInteractablesRef.current = buildSceneInteractables(
      nextItems,
      itemPointProgressRef.current,
      gameMinutes,
      sceneEntryCollectedItemPointIdsRef.current,
      questRuntimeManagerRef.current,
    );
    setActiveMinimapItemPoints(
      SCENE_ITEM_POINTS.filter(
        (itemPoint) =>
          itemPoint.showOnMinimap &&
          isItemPointAvailable(
            itemPoint,
            itemPointProgressRef.current,
            gameMinutes,
            sceneEntryCollectedItemPointIdsRef.current,
            questRuntimeManagerRef.current,
          ),
      ),
    );
  };

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const loadedInventory = loadPlayerInventory();
      const loadedCollectedWorldItemIds = loadCollectedWorldItemIds();
      const loadedDroppedWorldItems = loadDroppedWorldItems();
      const loadedItemPointProgress = loadItemPointProgress();
      const loadedHotbarAssignments = loadHotbarAssignments();
      const loadedSurvivalState = loadSurvivalState();
      const loadedInteractionUsage = loadInteractionUsageState(
        loadedSurvivalState.gameMinutes,
      );
      const loadedStoryProgress = loadStoryProgress();
      const loadedQuestSave = loadQuestSaveData();
      playerInventoryRef.current = loadedInventory;
      collectedWorldItemIdsRef.current = loadedCollectedWorldItemIds;
      droppedWorldItemsRef.current = loadedDroppedWorldItems;
      itemPointProgressRef.current = loadedItemPointProgress;
      hotbarAssignmentsRef.current = loadedHotbarAssignments;
      survivalStateRef.current = loadedSurvivalState;
      previousSurvivalDisplayValuesRef.current = getSurvivalDisplayValues(
        loadedSurvivalState.values,
      );
      interactionUsageRef.current = loadedInteractionUsage;
      currentStoryChapterRef.current = loadedStoryProgress.currentChapter;
      storyProgressRef.current = loadedStoryProgress;
      questRuntimeManagerRef.current = new QuestRuntimeManager(
        QUEST_DOCUMENT,
        {
          runCompletionTrigger: async (type, triggerId) => {
            if (type === "dialogue") {
              const result = await dialogueManager.playRegistered(
                triggerId,
                {
                  id: `quest-completion:${triggerId}`,
                  label: triggerId,
                  type: "dialogue",
                },
              );
              if (!result.completed) return false;
              const manager = questRuntimeManagerRef.current;
              if (!manager) return false;
              const clock = getGameClock(survivalStateRef.current.gameMinutes);
              manager.startAvailableAfterDialogueQuests(
                triggerId,
                clock.day,
                clock.hour * 60 + clock.minute,
              );
              saveQuestSaveData(manager.exportSave());
              return true;
            }

            const flow = STORY_EVENT_FLOWS[triggerId];
            if (!flow) return false;
            return await chapterFlowManagerRef.current?.run(flow) === true;
          },
          requestTeleport: (pointId, delayMilliseconds) => {
            scheduleQuestTeleport(pointId, delayMilliseconds);
          },
          onStateChanged: (questId, entry) => {
            requestStoryTriggerContactCheckRef.current();
            const manager = questRuntimeManagerRef.current;
            if (manager)
            {
              saveQuestSaveData(manager.exportSave());
              applyDroppedWorldItems(droppedWorldItemsRef.current);
            }
            if (entry.state === "active") {
              const view = buildQuestHudView(questId, entry);
              if (view) setActiveQuestHud(view);
            }
            setCompletedQuestHistory(getCompletedQuestHistory());
          },
          onQuestStarted: (questId, entry) => {
            const view = buildQuestHudView(questId, entry);
            if (view) triggerQuestHudVisual("accepted", view);
          },
          onObjectiveCompleted: (questId, objectiveId, _stageId, entry, objective) => {
            const view = buildQuestHudView(questId, entry);
            if (view) triggerQuestObjectiveTween(view, objectiveId);
            if (
              objective.completionInterfaceAction &&
              objective.completionInterfaceAction !== "none" &&
              objective.completionInterfaceId
            ) {
              window.queueMicrotask(() => {
                const open = objective.completionInterfaceAction === "open";
                switch (objective.completionInterfaceId) {
                  case "Inventory":
                    setInventoryPanelOpen(open);
                    break;
                  case "Options":
                    setOptionsPanelOpen(open);
                    break;
                }
              });
            }
          },
          onStageTransitionStarted: (
            questId,
            _currentStageId,
            _nextStageId,
            entry,
            completeTransition,
          ) => {
            const view = buildQuestHudView(questId, entry);
            if (view) {
              triggerQuestStageTransition(view, completeTransition);
            } else {
              completeTransition();
            }
          },
          onQuestCompleted: (questId, _entry, completePresentation) => {
            const manager = questRuntimeManagerRef.current;
            const entry = manager?.exportSave().quests[questId];
            const view = entry ? buildQuestHudView(questId, entry) : null;
            if (view) {
              triggerQuestHudVisual("completed", view, completePresentation);
            } else {
              completePresentation();
            }
            window.queueMicrotask(() => {
              const currentManager = questRuntimeManagerRef.current;
              if (!currentManager) return;
              const clock = getGameClock(survivalStateRef.current.gameMinutes);
              currentManager.startAvailableAutomaticQuests(
                clock.day,
                clock.hour * 60 + clock.minute,
              );
              saveQuestSaveData(currentManager.exportSave());
            });
          },
          onQuestFailed: (questId, entry) => {
            const view = buildQuestHudView(questId, entry);
            if (view) triggerQuestHudVisual("failed", view);
          },
          onQuestAbandoned: (questId, entry) => {
            const view = buildQuestHudView(questId, entry);
            if (view) triggerQuestHudVisual("failed", view);
          },
        },
        loadedQuestSave,
      );
      {
        const clock = getGameClock(loadedSurvivalState.gameMinutes);
        questRuntimeManagerRef.current.startAvailableAutomaticQuests(
          clock.day,
          clock.hour * 60 + clock.minute,
        );
        saveQuestSaveData(questRuntimeManagerRef.current.exportSave());
      }
      const initialQuestHud = getFirstActiveQuestHud();
      setActiveQuestHud(initialQuestHud);
      setCompletedQuestHistory(getCompletedQuestHistory());
      sceneInteractablesRef.current = buildSceneInteractables(
        loadedDroppedWorldItems,
        loadedItemPointProgress,
        loadedSurvivalState.gameMinutes,
        sceneEntryCollectedItemPointIdsRef.current,
        questRuntimeManagerRef.current,
      );
      setActiveMinimapItemPoints(
        SCENE_ITEM_POINTS.filter(
          (itemPoint) =>
            itemPoint.showOnMinimap &&
            isItemPointAvailable(
              itemPoint,
              loadedItemPointProgress,
              loadedSurvivalState.gameMinutes,
              sceneEntryCollectedItemPointIdsRef.current,
              questRuntimeManagerRef.current,
            ),
        ),
      );
      setPlayerInventory(loadedInventory);
      setCollectedWorldItemIds(loadedCollectedWorldItemIds);
      setHotbarAssignments(loadedHotbarAssignments);
      setSurvivalState(loadedSurvivalState);
      setDialogueTextSize(getDefaultDialogueTextSize());
      setQuestCollapsed(initialQuestHud ? getDefaultQuestCollapsed() : true);
      setSurvivalExpanded(getDefaultSurvivalExpanded());
      setStoryReady(true);
    }, 0);
    return () => {
      window.clearTimeout(hydrationTimer);
      for (const timerId of teleportTimerIdsRef.current) {
        window.clearTimeout(timerId);
      }
      teleportTimerIdsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    playerInventoryRef.current = playerInventory;
    requestStoryTriggerContactCheckRef.current();
    const selectedItem =
      ITEM_DATABASE[selectedInventoryIndexRef.current]?.item;
    if (selectedItem && (playerInventory[selectedItem.id] ?? 0) > 0) return;
    const firstOwnedItem = getOwnedItemStacks(playerInventory)[0];
    if (!firstOwnedItem) return;
    selectedInventoryIndexRef.current = firstOwnedItem.databaseIndex;
    const selectionTimer = window.setTimeout(() => {
      setSelectedInventoryIndex(firstOwnedItem.databaseIndex);
    }, 0);
    return () => window.clearTimeout(selectionTimer);
  }, [playerInventory]);

  useEffect(() => {
    collectedWorldItemIdsRef.current = collectedWorldItemIds;
  }, [collectedWorldItemIds]);

  useEffect(() => {
    applyDroppedWorldItems(droppedWorldItemsRef.current);
  }, [itemPointRespawnCycle]);

  useEffect(() => {
    const fullscreenDocument = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    const updateFullscreenState = () => {
      const browserToolbarHidden =
        Math.abs(window.outerHeight - window.innerHeight) <= 48;
      const viewportMatchesScreen =
        browserToolbarHidden &&
        window.innerWidth >= Math.min(window.screen.width, window.screen.availWidth) - 20 &&
        (
          window.innerHeight >= window.screen.height - 20 ||
          window.innerHeight >= window.screen.availHeight - 20
        );
      setStageFullscreen(Boolean(
        document.fullscreenElement ||
        fullscreenDocument.webkitFullscreenElement ||
        viewportMatchesScreen
      ));
    };

    updateFullscreenState();
    window.addEventListener("resize", updateFullscreenState);
    window.addEventListener("orientationchange", updateFullscreenState);
    window.visualViewport?.addEventListener("resize", updateFullscreenState);
    document.addEventListener("fullscreenchange", updateFullscreenState);
    document.addEventListener("webkitfullscreenchange", updateFullscreenState);
    return () => {
      window.removeEventListener("resize", updateFullscreenState);
      window.removeEventListener("orientationchange", updateFullscreenState);
      window.visualViewport?.removeEventListener("resize", updateFullscreenState);
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      document.removeEventListener("webkitfullscreenchange", updateFullscreenState);
    };
  }, []);

  const toggleStageFullscreen = async () => {
    const fullscreenDocument = document as Document & {
      webkitExitFullscreen?: () => void | Promise<void>;
      webkitFullscreenElement?: Element | null;
    };
    const fullscreenElement = document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
    try {
      if (fullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          await fullscreenDocument.webkitExitFullscreen?.();
        }
        return;
      }

      const target = gameShellRef.current as (HTMLElement & {
        webkitRequestFullscreen?: () => void | Promise<void>;
      }) | null;
      if (target?.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target?.webkitRequestFullscreen) {
        await target.webkitRequestFullscreen();
      } else {
        setStageFullscreen((current) => !current);
      }
    } catch {
      setStageFullscreen((current) => !current);
    }
  };

  useEffect(() => () => {
    const pendingDrag = pendingInventoryDragRef.current;
    if (pendingDrag?.timerId !== null && pendingDrag?.timerId !== undefined) {
      window.clearTimeout(pendingDrag.timerId);
    }
    if (hotbarFeedbackTimerRef.current !== null) {
      window.clearTimeout(hotbarFeedbackTimerRef.current);
    }
    if (hotbarSelectionHintTimerRef.current !== null) {
      window.clearTimeout(hotbarSelectionHintTimerRef.current);
    }
    if (survivalValueTweenExpiryTimerRef.current !== null) {
      window.clearTimeout(survivalValueTweenExpiryTimerRef.current);
    }
    if (timeElapsedNoticeTimerRef.current !== null) {
      window.clearTimeout(timeElapsedNoticeTimerRef.current);
    }
    if (questHudEventTimerRef.current !== null) {
      window.clearTimeout(questHudEventTimerRef.current);
    }
    questHudEventFinishedRef.current = null;
    if (questObjectiveTweenTimerRef.current !== null) {
      window.clearTimeout(questObjectiveTweenTimerRef.current);
    }
    if (questStageTransitionTimerRef.current !== null) {
      window.clearTimeout(questStageTransitionTimerRef.current);
    }
    if (questStageEnteringTimerRef.current !== null) {
      window.clearTimeout(questStageEnteringTimerRef.current);
    }
    if (questEventNoticeTimerRef.current !== null) {
      window.clearTimeout(questEventNoticeTimerRef.current);
    }
    cancelBlackScreenFade();
    for (const timerId of timePassTransitionTimersRef.current) {
      window.clearTimeout(timerId);
    }
    timePassTransitionTimersRef.current = [];
    if (timePassTransitionWatchdogRef.current !== null) {
      window.clearTimeout(timePassTransitionWatchdogRef.current);
      timePassTransitionWatchdogRef.current = null;
    }
    timePassInputLockedRef.current = false;
    if (mainObjectiveMarkerTimerRef.current !== null) {
      window.clearTimeout(mainObjectiveMarkerTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const currentValues = getSurvivalDisplayValues(survivalState.values);
    const previousValues = previousSurvivalDisplayValuesRef.current;
    previousSurvivalDisplayValuesRef.current = currentValues;
    if (!previousValues) return;

    const changes = SURVIVAL_STATS.flatMap(({ id }) => {
      const delta = currentValues[id] - previousValues[id];
      return delta === 0 ? [] : [{ id, delta }];
    });
    if (changes.length === 0) return;

    const startedAt = window.performance.now();
    setSurvivalValueTweens((current) => {
      const next = { ...current };
      for (const { id, delta } of changes) {
        survivalValueTweenSequenceRef.current += 1;
        next[id] = {
          delta,
          sequence: survivalValueTweenSequenceRef.current,
          startedAt,
        };
      }
      return next;
    });
    if (survivalValueTweenExpiryTimerRef.current !== null) {
      window.clearTimeout(survivalValueTweenExpiryTimerRef.current);
    }
    survivalValueTweenExpiryTimerRef.current = window.setTimeout(() => {
      setSurvivalValueTweens({});
      survivalValueTweenExpiryTimerRef.current = null;
    }, SURVIVAL_VALUE_TWEEN_DURATION_MS);
  }, [
    survivalState.values.hunger,
    survivalState.values.spirit,
    survivalState.values.stamina,
    survivalState.values.thirst,
  ]);

  const showInventoryFeedback = (
    message: string,
    slotIndex = -1,
    duration = 1100,
  ) => {
    hotbarUseSequenceRef.current += 1;
    setHotbarFeedback({
      message,
      sequence: hotbarUseSequenceRef.current,
      slotIndex,
    });
    if (hotbarFeedbackTimerRef.current !== null) {
      window.clearTimeout(hotbarFeedbackTimerRef.current);
    }
    hotbarFeedbackTimerRef.current = window.setTimeout(() => {
      setHotbarFeedback(null);
      hotbarFeedbackTimerRef.current = null;
    }, duration);
  };

  const closeDebugItemSpawner = () => {
    debugItemSpawnerOpenRef.current = false;
    setDebugItemSpawnerOpen(false);
    setDebugItemSpawnCommand("");
    canvasRef.current?.focus();
  };

  const submitDebugItemSpawn = (event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const succeeded = debugItemSpawnHandlerRef.current(debugItemSpawnCommand);
    if (succeeded) {
      closeDebugItemSpawner();
      return;
    }
    window.setTimeout(() => {
      debugItemInputRef.current?.focus();
      debugItemInputRef.current?.select();
    }, 0);
  };

  useEffect(() => {
    if (!debugItemSpawnerOpen) return;
    const focusTimer = window.setTimeout(() => {
      debugItemInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [debugItemSpawnerOpen]);

  const setHotbarSlotAssignment = (slotIndex: number, itemId: string | null) => {
    const next = assignHotbarSlot(
      hotbarAssignmentsRef.current,
      slotIndex,
      itemId,
    );
    hotbarAssignmentsRef.current = next;
    setHotbarAssignments(next);
    saveHotbarAssignments(next);
    const item = itemId ? ITEM_BY_ID.get(itemId) : null;
    showInventoryFeedback(
      item
        ? `已將「${item.name}」指派至快捷格 ${slotIndex + 1}`
        : `已清除快捷格 ${slotIndex + 1}`,
      slotIndex,
      1400,
    );
  };

  const activateHotbarItem = (slotIndex: number) => {
    if (optionsOpenRef.current || inventoryOpenRef.current || dialoguePlaybackRef.current) return;
    const itemId = hotbarAssignmentsRef.current[slotIndex];
    const item = itemId ? ITEM_BY_ID.get(itemId) : undefined;
    if (!item) {
      showInventoryFeedback("此快捷格尚未指派道具", slotIndex);
      return;
    }
    activeHotbarSlotRef.current = slotIndex;
    setActiveHotbarSlot(slotIndex);
    useInventoryItem(item.id, slotIndex);
  };

  const showHotbarSelectionHint = (slotIndex: number) => {
    hotbarSelectionHintSequenceRef.current += 1;
    const sequence = hotbarSelectionHintSequenceRef.current;
    setHotbarSelectionHint({ slotIndex, sequence, visible: true });
    if (hotbarSelectionHintTimerRef.current !== null) {
      window.clearTimeout(hotbarSelectionHintTimerRef.current);
    }
    hotbarSelectionHintTimerRef.current = window.setTimeout(() => {
      setHotbarSelectionHint((current) =>
        current?.sequence === sequence
          ? { ...current, visible: false }
          : current,
      );
      hotbarSelectionHintTimerRef.current = null;
    }, 10_000);
  };

  const hideHotbarSelectionHint = () => {
    if (hotbarSelectionHintTimerRef.current !== null) {
      window.clearTimeout(hotbarSelectionHintTimerRef.current);
      hotbarSelectionHintTimerRef.current = null;
    }
    setHotbarSelectionHint((current) =>
      current ? { ...current, visible: false } : current,
    );
  };

  const selectHotbarSlot = (offset: number) => {
    const next =
      (activeHotbarSlotRef.current + offset + HOTBAR_SLOT_COUNT) %
      HOTBAR_SLOT_COUNT;
    activeHotbarSlotRef.current = next;
    setActiveHotbarSlot(next);
    showHotbarSelectionHint(next);
  };

  const selectInventoryItem = (slotIndex: number) => {
    const item = ITEM_DATABASE[slotIndex]?.item;
    if (!item || (playerInventoryRef.current[item.id] ?? 0) <= 0) return;
    selectedInventoryIndexRef.current = slotIndex;
    setSelectedInventoryIndex(slotIndex);
  };

  const activateInventoryItem = (slotIndex: number) => {
    const item = ITEM_DATABASE[slotIndex]?.item;
    if (!item || (playerInventoryRef.current[item.id] ?? 0) <= 0) return;
    selectInventoryItem(slotIndex);
    useInventoryItem(item.id, -1);
  };

  function useInventoryItem(itemId: string, feedbackSlotIndex: number) {
    const item = ITEM_BY_ID.get(itemId);
    if (!item) return;
    const result = useSurvivalInventoryItem(
      playerInventoryRef.current,
      survivalStateRef.current,
      item.id,
    );
    let message: string;

    if (result.status === "not-owned") {
      message = `尚未持有「${item.name}」`;
    } else if (result.status === "not-configured") {
      message = `嘗試使用「${item.name}」· 功能尚未開放`;
    } else if (result.status === "full") {
      message = "現在無法使用這個";
    } else {
      survivalStateRef.current = result.survival;
      playerInventoryRef.current = result.inventory;
      setSurvivalState(result.survival);
      setPlayerInventory(result.inventory);
      try {
        saveSurvivalState(result.survival);
        savePlayerInventory(result.inventory);
      } catch {
        // 無法使用本機儲存時，本次工作階段仍保留使用結果。
      }
      const questManager = questRuntimeManagerRef.current;
      if (questManager) {
        questGameEventSequenceRef.current += 1;
        questManager.handleEvent({
          type: "itemUsed",
          targetId: item.id,
          amount: 1,
          eventId:
            `itemUsed:${item.id}:${Date.now()}:` +
            `${questGameEventSequenceRef.current}`,
        });
        saveQuestSaveData(questManager.exportSave());
      }
      message = `已使用「${item.name}」· ${formatSurvivalEffects(item.survivalEffects)}`;
    }

    showInventoryFeedback(message, feedbackSlotIndex);
  }

  const getHotbarSlotAtPoint = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    const slot = element?.closest<HTMLElement>(".hotbar-slot[data-hotbar-index]");
    const index = Number(slot?.dataset.hotbarIndex);
    return Number.isInteger(index) && index >= 0 && index < HOTBAR_SLOT_COUNT
      ? index
      : null;
  };

  const getGameShellPointerPosition = (clientX: number, clientY: number) => {
    const shellRect = gameShellRef.current?.getBoundingClientRect();
    return {
      x: clientX - (shellRect?.left ?? 0),
      y: clientY - (shellRect?.top ?? 0),
    };
  };

  const startInventoryDrag = (pending: PendingInventoryDrag, x: number, y: number) => {
    if (pendingInventoryDragRef.current !== pending) return;
    pending.active = true;
    if (pending.timerId !== null) {
      window.clearTimeout(pending.timerId);
      pending.timerId = null;
    }
    setInventoryContextMenu(null);
    const pointer = getGameShellPointerPosition(x, y);
    setInventoryDrag({
      itemId: pending.itemId,
      pointerId: pending.pointerId,
      pointerType: pending.pointerType,
      x: pointer.x,
      y: pointer.y,
    });
    navigator.vibrate?.(12);
  };

  const beginInventoryDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    itemId: string,
  ) => {
    if (event.button !== 0) return;
    const pending: PendingInventoryDrag = {
      itemId,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      timerId: null,
    };
    pendingInventoryDragRef.current = pending;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (event.pointerType !== "mouse") {
      pending.timerId = window.setTimeout(() => {
        startInventoryDrag(pending, pending.startX, pending.startY);
      }, 360);
    }
  };

  const moveInventoryDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = pendingInventoryDragRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    const distance = Math.hypot(
      event.clientX - pending.startX,
      event.clientY - pending.startY,
    );
    if (!pending.active && pending.pointerType === "mouse" && distance >= 5) {
      startInventoryDrag(pending, event.clientX, event.clientY);
    }
    if (!pending.active) return;
    event.preventDefault();
    const pointer = getGameShellPointerPosition(event.clientX, event.clientY);
    setInventoryDrag((current) => current
      ? { ...current, x: pointer.x, y: pointer.y }
      : current);
    setHotbarDropTarget(getHotbarSlotAtPoint(event.clientX, event.clientY));
  };

  const finishInventoryDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = pendingInventoryDragRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (pending.timerId !== null) window.clearTimeout(pending.timerId);
    if (pending.active) {
      event.preventDefault();
      suppressInventoryClickRef.current = true;
      const slotIndex = getHotbarSlotAtPoint(event.clientX, event.clientY);
      if (slotIndex !== null) {
        setHotbarSlotAssignment(slotIndex, pending.itemId);
      }
      window.setTimeout(() => {
        suppressInventoryClickRef.current = false;
      }, 0);
    }
    pendingInventoryDragRef.current = null;
    setInventoryDrag(null);
    setHotbarDropTarget(null);
  };

  const cancelInventoryDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = pendingInventoryDragRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (pending.timerId !== null) window.clearTimeout(pending.timerId);
    pendingInventoryDragRef.current = null;
    setInventoryDrag(null);
    setHotbarDropTarget(null);
  };

  const discardInventoryItem = (
    slotIndex: number,
    button: HTMLElement,
  ) => {
    const item = ITEM_DATABASE[slotIndex]?.item;
    const currentQuantity = item
      ? playerInventoryRef.current[item.id] ?? 0
      : 0;
    if (
      !item ||
      currentQuantity <= 0 ||
      !item.inventoryRules.discardable
    ) {
      return;
    }

    const placement = findDroppedWorldItemPlacement(
      playerPositionRef.current,
      playerFacingRef.current,
      sizeRef.current * 0.14,
      droppedWorldItemsRef.current.filter(
        (worldItem) => worldItem.sceneId === SCENE_DATA.sceneId,
      ),
    );
    if (!placement) {
      hotbarUseSequenceRef.current += 1;
      setHotbarFeedback({
        message: "角色附近沒有可放置道具的空間",
        sequence: hotbarUseSequenceRef.current,
        slotIndex: -1,
      });
      return;
    }

    let droppedWorldItemId = "";
    do {
      droppedWorldItemSequenceRef.current += 1;
      droppedWorldItemId =
        `inventory-drop:${SCENE_DATA.sceneId}:` +
        droppedWorldItemSequenceRef.current;
    } while (
      droppedWorldItemsRef.current.some(
        (worldItem) => worldItem.id === droppedWorldItemId,
      )
    );
    const droppedWorldItem: DroppedWorldItem = {
      id: droppedWorldItemId,
      sceneId: SCENE_DATA.sceneId,
      itemId: item.id,
      quantity: 1,
      position: placement.position,
      interactionPoint: placement.interactionPoint,
      pickRadius: 26,
      activationDistance: 48,
      createdFromInventory: true,
    };
    const dropDirection = {
      x: placement.position.x - playerPositionRef.current.x,
      y: placement.position.y - playerPositionRef.current.y,
    };
    const dropDistance = Math.max(
      1,
      Math.hypot(dropDirection.x, dropDirection.y),
    );
    const dropLanding = {
      x: placement.position.x - (dropDirection.x / dropDistance) * 20,
      y: placement.position.y - (dropDirection.y / dropDistance) * 20,
    };
    const facingVector = getDirectionVector(playerFacingRef.current);
    const dropStart = {
      x: playerPositionRef.current.x + facingVector.x * 8,
      y: playerPositionRef.current.y - sizeRef.current * 0.42,
    };
    worldItemSpawnMotionsRef.current.set(
      droppedWorldItemId,
      createWorldItemSpawnMotion(
        performance.now(),
        dropStart,
        dropLanding,
        placement.position,
      ),
    );
    worldItemLandingAudioPlayedRef.current.delete(droppedWorldItemId);
    const nextInventory = removeInventoryItem(
      playerInventoryRef.current,
      item.id,
      1,
    );
    const nextDroppedWorldItems = [
      ...droppedWorldItemsRef.current,
      droppedWorldItem,
    ];

    playerInventoryRef.current = nextInventory;
    applyDroppedWorldItems(nextDroppedWorldItems);
    setPlayerInventory(nextInventory);
    try {
      savePlayerInventory(nextInventory);
      saveDroppedWorldItems(nextDroppedWorldItems);
    } catch {
      // 無法使用本機儲存時，本次遊戲工作階段仍保留丟棄結果。
    }

    button.animate(
      [
        { transform: "scale(1)", filter: "brightness(1)" },
        {
          transform: "scale(0.86)",
          filter: "brightness(1.8) drop-shadow(0 0 8px #d65d53)",
          offset: 0.38,
        },
        { transform: "scale(1.04)", filter: "brightness(1.2)", offset: 0.72 },
        { transform: "scale(1)", filter: "brightness(1)" },
      ],
      { duration: 230, easing: "cubic-bezier(.2,.8,.2,1)" },
    );

    hotbarUseSequenceRef.current += 1;
    setHotbarFeedback({
      message:
        `已丟棄「${item.name}」×1` +
        ` · 目前持有 ${nextInventory[item.id] ?? 0}`,
      sequence: hotbarUseSequenceRef.current,
      slotIndex: -1,
    });
    if (hotbarFeedbackTimerRef.current !== null) {
      window.clearTimeout(hotbarFeedbackTimerRef.current);
    }
    hotbarFeedbackTimerRef.current = window.setTimeout(() => {
      setHotbarFeedback(null);
      hotbarFeedbackTimerRef.current = null;
    }, 1800);
  };

  const changeInventoryCategory = (category: InventoryCategory) => {
    inventoryCategoryRef.current = category;
    setInventoryCategory(category);
    setInventoryPage(0);
    const currentItem = ITEM_DATABASE[selectedInventoryIndexRef.current]?.item;
    if (
      category !== "all" &&
      (!currentItem || currentItem.category !== category)
    ) {
      const nextItem = getOwnedItemStacks(playerInventoryRef.current).find(
        (stack) => stack.definition.category === category,
      );
      if (nextItem) selectInventoryItem(nextItem.databaseIndex);
    }
  };

  const changeInventoryCategoryByOffset = (offset: number) => {
    const currentIndex = INVENTORY_CATEGORIES.findIndex(
      (category) => category.id === inventoryCategoryRef.current,
    );
    const nextIndex = getClampedInventoryCategoryIndex(
      currentIndex,
      INVENTORY_CATEGORIES.length,
      offset,
    );
    if (nextIndex === currentIndex) return;
    changeInventoryCategory(INVENTORY_CATEGORIES[nextIndex].id);
  };

  const moveInventorySelection = (horizontal: number, vertical: number) => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".inventory-item[data-inventory-index]"),
    );
    if (buttons.length === 0) return;
    const currentPosition = Math.max(
      0,
      buttons.findIndex(
        (button) => Number(button.dataset.inventoryIndex) === selectedInventoryIndexRef.current,
      ),
    );
    let nextPosition = currentPosition;

    if (horizontal !== 0) {
      nextPosition = (currentPosition + horizontal + buttons.length) % buttons.length;
    } else if (vertical !== 0) {
      const grid = document.querySelector<HTMLElement>(".inventory-items");
      const columnCount = grid
        ? Math.max(
            1,
            window.getComputedStyle(grid).gridTemplateColumns.split(" ").length,
          )
        : 4;
      const candidate = currentPosition + vertical * columnCount;
      if (candidate >= 0 && candidate < buttons.length) nextPosition = candidate;
    }

    const nextIndex = Number(buttons[nextPosition]?.dataset.inventoryIndex);
    if (Number.isInteger(nextIndex)) selectInventoryItem(nextIndex);
  };

  const playOneShotAudio = (eventName: AudioEventName) => {
    const audioEvents = audioEventManagerRef.current;
    if (!audioEvents) return;
    void audioEvents.play(eventName, { restart: true }).catch(() => {
      // A later interaction can retry from the beginning if browser autoplay
      // policy blocks this one-shot request.
    });
  };

  const stopDialogueTypingAudio = () => {
    audioEventManagerRef.current?.stop("dialogueTyping");
  };

  const requestDialogueTypingAudioPlayback = (restart: boolean) => {
    const typing = dialogueTypingRef.current;
    const audioEvents = audioEventManagerRef.current;
    if (
      !audioEvents ||
      !typing ||
      typing.visibleCount >= typing.characters.length ||
      document.hidden
    ) {
      return;
    }
    void audioEvents.play("dialogueTyping", { restart }).catch(() => {
      // Browsers may wait for the next keyboard or pointer gesture before
      // allowing audio. The shared input retry handler requests playback again.
    });
  };

  const stopDialogueTyping = () => {
    const typing = dialogueTypingRef.current;
    if (typing?.timerId !== null && typing?.timerId !== undefined) {
      window.clearTimeout(typing.timerId);
    }
    stopDialogueTypingAudio();
    dialogueTypingRef.current = null;
  };

  const pauseDialogueTyping = () => {
    const typing = dialogueTypingRef.current;
    if (!typing || typing.timerId === null) return;
    window.clearTimeout(typing.timerId);
    typing.timerId = null;
    stopDialogueTypingAudio();
  };

  const resumeDialogueTyping = () => {
    const typing = dialogueTypingRef.current;
    if (!typing || typing.visibleCount >= typing.characters.length) return;
    typing.resume();
  };

  const closeDialogue = () => {
    stopDialogueTyping();
    dialoguePlaybackRef.current = null;
    document.documentElement.classList.remove("dialogue-cursor-active");
    setDialogueView(null);
  };

  const finishDialogue = () => {
    const onComplete = dialoguePlaybackRef.current?.onComplete;
    closeDialogue();
    onComplete?.();
  };

  const showDialoguePage = (playback: DialoguePlayback) => {
    const line = playback.interactable.dialogue?.lines[playback.lineIndex];
    if (!line) {
      finishDialogue();
      return;
    }
    stopDialogueTyping();
    const speaker = resolveDialogueSpeaker(playback.interactable, playback.lineIndex);
    const characters = splitDialogueRevealUnits(
      playback.pages[playback.pageIndex] ?? "...",
    );
    const delayMilliseconds =
      clamp(
        playback.interactable.dialogue?.characterDelaySeconds ?? 0.02,
        0,
        2,
      ) * 1000;
    const typing: DialogueTyping = {
      characters,
      visibleCount: 0,
      speaker,
      delayMilliseconds,
      timerId: null,
      resume: () => {},
    };
    dialogueTypingRef.current = typing;

    const revealNextCharacter = () => {
      if (dialogueTypingRef.current !== typing) return;
      typing.visibleCount = Math.min(
        typing.characters.length,
        typing.visibleCount + 1,
      );
      setDialogueView({
        speaker: typing.speaker,
        text: typing.characters.slice(0, typing.visibleCount).join(""),
      });
      if (typing.visibleCount < typing.characters.length) {
        typing.timerId = window.setTimeout(
          revealNextCharacter,
          typing.delayMilliseconds,
        );
      } else {
        typing.timerId = null;
        stopDialogueTypingAudio();
      }
    };

    typing.resume = () => {
      if (
        dialogueTypingRef.current !== typing ||
        typing.timerId !== null ||
        typing.visibleCount >= typing.characters.length
      ) {
        return;
      }
      requestDialogueTypingAudioPlayback(false);
      typing.timerId = window.setTimeout(
        revealNextCharacter,
        Math.max(0, typing.delayMilliseconds),
      );
    };

    if (delayMilliseconds <= 0) {
      typing.visibleCount = characters.length;
      setDialogueView({ speaker, text: characters.join("") });
    } else {
      requestDialogueTypingAudioPlayback(true);
      revealNextCharacter();
    }
  };

  const presentDialogue = (
    interactable: SceneInteractable,
    onComplete?: () => void,
    dialogue: InteractionDialogueScript | null | undefined = interactable.dialogue,
  ) => {
    hideHotbarSelectionHint();
    const lines = resolveWeightedDialogueLines(
      dialogue?.lines?.filter((line) => line.text.trim()) ?? [],
    );
    const effectiveLines = lines.length > 0 ? lines : [{ speaker: "", text: "..." }];
    const normalized = {
      ...interactable,
      dialogue: {
        characterDelaySeconds:
          dialogue?.characterDelaySeconds ?? 0.02,
        speakers:
          dialogue?.speakers?.filter((speaker) => speaker.trim()) ??
          ["Sbaak", "Echo"],
        lines: effectiveLines,
      },
    };
    const playback: DialoguePlayback = {
      interactable: normalized,
      lineIndex: 0,
      pageIndex: 0,
      pages: splitDialoguePages(effectiveLines[0].text),
      onComplete,
    };
    dialoguePlaybackRef.current = playback;
    document.documentElement.classList.add("dialogue-cursor-active");
    playOneShotAudio("dialogueOpened");
    showDialoguePage(playback);
  };

  if (!dialogueManagerRef.current) {
    dialogueManagerRef.current = new DialogueManager<SceneInteractable>();
  }
  const dialogueManager = dialogueManagerRef.current;
  dialogueManager.setPresenter((request, complete) => {
    presentDialogue(request.context, complete, request.script);
    return closeDialogue;
  });
  Object.entries(STORY_DIALOGUES).forEach(([dialogueId, script]) => {
    dialogueManager.register(dialogueId, script);
  });

  const openDialogue = (
    interactable: SceneInteractable,
    onComplete?: () => void,
    dialogue: InteractionDialogueScript | null | undefined = interactable.dialogue,
  ) => dialogueManager.playUnique(
    `interaction:${interactable.id}`,
    dialogue ?? { lines: [{ speaker: "", text: "..." }] },
    interactable,
    onComplete,
  );

  const advanceDialogue = () => {
    const playback = dialoguePlaybackRef.current;
    if (!playback) return false;
    const typing = dialogueTypingRef.current;
    if (typing && typing.visibleCount < typing.characters.length) {
      if (typing.timerId !== null) window.clearTimeout(typing.timerId);
      typing.visibleCount = typing.characters.length;
      typing.timerId = null;
      stopDialogueTypingAudio();
      setDialogueView({
        speaker: typing.speaker,
        text: typing.characters.join(""),
      });
      return true;
    }
    if (playback.pageIndex + 1 < playback.pages.length) {
      playback.pageIndex += 1;
      showDialoguePage(playback);
      return true;
    }
    const lines = playback.interactable.dialogue?.lines ?? [];
    if (playback.lineIndex + 1 < lines.length) {
      playback.lineIndex += 1;
      playback.pageIndex = 0;
      playback.pages = splitDialoguePages(lines[playback.lineIndex].text);
      showDialoguePage(playback);
      return true;
    }
    finishDialogue();
    return true;
  };

  const markStoryEventCompleted = (eventId: string) => {
    const current = storyProgressRef.current;
    if (current.completedEventIds.includes(eventId)) return;
    const next = {
      ...current,
      completedEventIds: [...current.completedEventIds, eventId],
    };
    storyProgressRef.current = next;
    saveStoryProgress(next);
  };

  if (!chapterFlowManagerRef.current) {
    chapterFlowManagerRef.current = new ChapterFlowManager({
      setInputLocked: (locked) => {
        storyInputLockedRef.current = locked;
        setStoryInputLocked(locked);
        if (locked) setInventoryPanelOpen(false);
      },
      setBlack: (visible) => {
        if (storySkipBlackoutGuardRef.current) return;
        cancelBlackScreenFade();
        setBlackScreenOpacity(visible ? 255 : 0);
      },
      fadeFromBlack: (durationMs) => {
        if (storySkipBlackoutGuardRef.current) return;
        fadeBlackScreen(0, durationMs);
      },
      showCenteredText: (action) => {
        setStoryCenteredText({
          lines: action.lines,
          fadeInMs: action.fadeInMs,
          holdMs: action.holdMs,
          fadeOutMs: action.fadeOutMs,
          sequence: Date.now(),
        });
      },
      hideCenteredText: () => setStoryCenteredText(null),
      playDialogue: (dialogueId) => dialogueManager.playRegistered(
        dialogueId,
        {
          id: `story:${dialogueId}`,
          label: dialogueId,
          type: "dialogue",
        },
      ),
      startQuest: (questId) => {
        const manager = questRuntimeManagerRef.current;
        if (!manager) return;
        const clock = getGameClock(survivalStateRef.current.gameMinutes);
        manager.requestQuestStart(
          questId,
          clock.day,
          clock.hour * 60 + clock.minute,
        );
      },
      showMainObjectiveMarker: (durationMs) => {
        if (mainObjectiveMarkerTimerRef.current !== null) {
          window.clearTimeout(mainObjectiveMarkerTimerRef.current);
        }
        const sequence = Date.now();
        const safeDurationMs = Math.max(1, durationMs);
        setMainObjectiveMarker({ sequence, durationMs: safeDurationMs });
        mainObjectiveMarkerTimerRef.current = window.setTimeout(() => {
          mainObjectiveMarkerTimerRef.current = null;
          setMainObjectiveMarker((current) =>
            current?.sequence === sequence ? null : current,
          );
        }, safeDurationMs);
      },
      cancelDialogue: () => dialogueManager.cancelCurrent(),
      markCompleted: markStoryEventCompleted,
      isCompleted: (flowId) =>
        storyProgressRef.current.completedEventIds.includes(flowId),
      onActiveChanged: (active) => {
        storyFlowActiveRef.current = active;
        setStoryFlowActive(active);
        if (!active) {
          // ChapterFlowManager 已結束就不應再留下任何劇情遮罩。
          // 這是 UI 層的最後保險，避免 SKIP 完成與 React 狀態更新
          // 發生競態時，進度已完成但黑幕仍停在畫面上。
          storyInputLockedRef.current = false;
          setStoryInputLocked(false);
          setStoryFlowPaused(false);
          setStoryCenteredText(null);
          setStorySkipVisible(false);
          cancelBlackScreenFade();
          setBlackScreenOpacity(0);
        }
      },
      onPausedChanged: setStoryFlowPaused,
    });
  }
  const chapterFlowManager = chapterFlowManagerRef.current;

  if (!storyEventManagerRef.current) {
    const events = new StoryEventManager();
    events.on("gameReady", ({ currentChapter }) =>
      events.emit("chapterStarted", { chapter: currentChapter }));
    events.on("chapterStarted", async ({ chapter }) => {
      requestStoryTriggerContactCheckRef.current();
      if (chapter !== 3) {
        fadeBlackScreen(0, 1000);
        return;
      }
      const started = await chapterFlowManager.run(CHAPTER_3_START_FLOW);
      if (!started) {
        fadeBlackScreen(0, 1000);
      }
    });
    events.on("storyZoneEntered", async ({ zoneId }) => {
      const zone = SCENE_STORY_TRIGGERS.find((item) => item.id === zoneId);
      if (!zone || storyFlowActiveRef.current) return;
      const completionId = `story-zone:${zone.id}`;
      if (
        zone.once &&
        storyProgressRef.current.completedEventIds.includes(completionId)
      ) {
        return;
      }
      const result = await dialogueManager.playRegistered(
        zone.dialogueId,
        {
          id: completionId,
          label: zone.label,
          type: "dialogue",
        },
      );
      if (!result.completed || !completeStoryTriggerRef.current(zone)) return;
      if (zone.once) markStoryEventCompleted(completionId);
    });
    storyEventManagerRef.current = events;
  }

  useEffect(() => {
    if (!storyReady || storyReadyEmittedRef.current) return;
    storyReadyEmittedRef.current = true;
    void storyEventManagerRef.current?.emit("gameReady", {
      currentChapter: storyProgressRef.current.currentChapter,
    });
  }, [storyReady]);

  const cancelStorySkipHold = (suppressClick = false) => {
    const hold = storySkipHoldRef.current;
    if (!hold) return;
    window.clearTimeout(hold.revealTimer);
    if (hold.completeTimer !== null) window.clearTimeout(hold.completeTimer);
    if (suppressClick && hold.revealed) {
      suppressNextStoryClickRef.current = true;
    }
    storySkipHoldRef.current = null;
    setStorySkipVisible(false);
  };

  const completeStorySkip = (source: "keyboard" | "gamepad" | "touch") => {
    storySkipHoldRef.current = null;
    storySkipBlackoutGuardRef.current = true;
    setStorySkipVisible(false);
    suppressNextStoryClickRef.current = source === "touch";

    cancelBlackScreenFade();
    setBlackScreenOpacity(255);
    // 先建立不可被其他清理工作中斷的視覺結束路徑。即使對話、音效或
    // ChapterFlow 的取消發生例外，黑幕仍會在一秒後確實移除並歸還操作權。
    setStoryCenteredText(null);
    setStoryFlowPaused(false);
    if (storySkipFinalizeTimerRef.current !== null) {
      window.clearTimeout(storySkipFinalizeTimerRef.current);
    }
    fadeBlackScreen(0, 1000);
    storySkipFinalizeTimerRef.current = window.setTimeout(() => {
      storySkipFinalizeTimerRef.current = null;
      storyInputLockedRef.current = false;
      storyFlowActiveRef.current = false;
      setStoryInputLocked(false);
      setStoryFlowActive(false);
      setStoryFlowPaused(false);
      setStoryCenteredText(null);
      setStorySkipVisible(false);
      setBlackScreenOpacity(0);
      storySkipBlackoutGuardRef.current = false;
    }, 1050);

    // 關閉畫面內容後再通知各管理器取消；這些工作不能阻擋上面的黑幕退場。
    try {
      stopDialogueTyping();
      dialoguePlaybackRef.current = null;
      document.documentElement.classList.remove("dialogue-cursor-active");
      setDialogueView(null);
      dialogueManager.cancelCurrent();
    } finally {
      chapterFlowManager.requestSkip();
    }
  };

  const beginStorySkipHold = (
    source: "keyboard" | "gamepad" | "touch",
  ) => {
    if (
      !storyFlowActiveRef.current ||
      optionsOpenRef.current ||
      storySkipHoldRef.current
    ) {
      return false;
    }
    const hold = {
      source,
      revealTimer: 0,
      completeTimer: null as number | null,
      revealed: false,
    };
    hold.revealTimer = window.setTimeout(() => {
      if (storySkipHoldRef.current !== hold) return;
      hold.revealed = true;
      setStorySkipSequence((current) => current + 1);
      setStorySkipVisible(true);
      hold.completeTimer = window.setTimeout(() => {
        if (storySkipHoldRef.current !== hold) return;
        completeStorySkip(source);
      }, 2000);
    }, 1000);
    storySkipHoldRef.current = hold;
    return true;
  };

  const setOptionsPanelOpen = (open: boolean) => {
    if (open && storyFlowActiveRef.current) {
      cancelStorySkipHold();
      chapterFlowManager.pause();
      pauseDialogueTyping();
    } else if (!open && storyFlowActiveRef.current) {
      chapterFlowManager.resume();
      resumeDialogueTyping();
    }
    if (open) {
      dismissTimeElapsedNotice();
      inventoryOpenRef.current = false;
      setInventoryOpen(false);
    }
    optionsOpenRef.current = open;
    setOptionsOpen(open);

    if (!open) {
      restartConfirmationOpenRef.current = false;
      setRestartConfirmationOpen(false);
    }

    if (open) {
      optionsMenuSelectionRef.current = OPTIONS_MENU_ITEMS[0];
      setOptionsMenuSelection(OPTIONS_MENU_ITEMS[0]);
      optionsTabRef.current = "display";
      setOptionsTab("display");
    }
  };

  const toggleOptionsPanel = () => {
    setOptionsPanelOpen(!optionsOpenRef.current);
  };

  const toggleSurvivalFlowPaused = () => {
    const paused = !survivalFlowPausedRef.current;
    survivalFlowPausedRef.current = paused;
    setSurvivalFlowPaused(paused);
  };

  const toggleSurvivalPanel = () => {
    setSurvivalExpanded((current) => {
      const nextState = !current;
      try {
        window.localStorage.setItem(
          SURVIVAL_PANEL_STATE_STORAGE_KEY,
          nextState ? "expanded" : "collapsed",
        );
      } catch {
        // 私密模式或禁止儲存時，至少保留本次頁面中的切換結果。
      }
      return nextState;
    });
  };

  const toggleQuestPanel = () => {
    setQuestCollapsed((current) => !current);
  };

  const setInventoryPanelOpen = (open: boolean) => {
    if (open && storyInputLockedRef.current) return;
    if (open) dismissTimeElapsedNotice();
    const wasOpen = inventoryOpenRef.current;
    inventoryOpenRef.current = open;
    if (!open) {
      const pendingDrag = pendingInventoryDragRef.current;
      if (pendingDrag?.timerId !== null && pendingDrag?.timerId !== undefined) {
        window.clearTimeout(pendingDrag.timerId);
      }
      pendingInventoryDragRef.current = null;
      setInventoryDrag(null);
      setHotbarDropTarget(null);
      setInventoryContextMenu(null);
    }
    setInventoryOpen(open);
    if (open && !wasOpen) {
      const questManager = questRuntimeManagerRef.current;
      if (questManager) {
        questGameEventSequenceRef.current += 1;
        questManager.handleEvent({
          type: "interfaceOpened",
          targetId: "Inventory",
          eventId:
            `interfaceOpened:Inventory:${Date.now()}:` +
            `${questGameEventSequenceRef.current}`,
        });
        saveQuestSaveData(questManager.exportSave());
      }
    }
  };

  const setSpeedValue = (value: number) => {
    const nextValue = clamp(Math.round(value / 10) * 10, 100, 380);
    speedRef.current = nextValue;
    setSpeed(nextValue);
  };

  const setSizeValue = (value: number) => {
    const nextValue = clamp(Math.round(value / 4) * 4, 90, 220);
    sizeRef.current = nextValue;
    setSize(nextValue);
  };

  const setCollisionSlideToleranceValue = (value: number) => {
    const nextValue = clamp(Math.round(value / 5) * 5, 20, 100);
    collisionSlideToleranceRef.current = nextValue / 100;
    setCollisionSlideTolerance(nextValue);
  };

  const setBgmEnabledValue = (enabled: boolean) => {
    bgmEnabledRef.current = enabled;
    setBgmEnabled(enabled);
    if (enabled) requestBgmPlaybackRef.current();
    else audioEventManagerRef.current?.stop("bgm", { reset: false });
  };

  const setBgmVolumeValue = (value: number) => {
    const nextValue = clamp(Math.round(value / 5) * 5, 0, 100);
    bgmVolumeRef.current = nextValue / 100;
    audioEventManagerRef.current?.setVolume("bgm", bgmVolumeRef.current);
    setBgmVolume(nextValue);
  };

  const setVirtualCursorControlsEnabledValue = (enabled: boolean) => {
    virtualCursorControlsEnabledRef.current = enabled;
    setVirtualCursorControlsEnabled(enabled);
  };

  const setOptionsMenuSelectionValue = (item: OptionsMenuItem) => {
    optionsMenuSelectionRef.current = item;
    setOptionsMenuSelection(item);
    const tab = getOptionsTabForItem(item);
    optionsTabRef.current = tab;
    setOptionsTab(tab);
  };

  const setRestartConfirmationChoiceValue = (choice: "cancel" | "confirm") => {
    restartConfirmationChoiceRef.current = choice;
    setRestartConfirmationChoice(choice);
  };

  const openRestartConfirmation = () => {
    restartConfirmationOpenRef.current = true;
    setRestartConfirmationOpen(true);
    setRestartConfirmationChoiceValue("cancel");
  };

  const closeRestartConfirmation = () => {
    restartConfirmationOpenRef.current = false;
    setRestartConfirmationOpen(false);
    setRestartConfirmationChoiceValue("cancel");
  };

  const moveOptionsMenuSelection = (direction: number) => {
    if (restartConfirmationOpenRef.current) return;
    const items = OPTIONS_TAB_ITEMS[optionsTabRef.current];
    const currentIndex = items.indexOf(optionsMenuSelectionRef.current);
    const nextIndex = currentIndex + Math.sign(direction);
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setOptionsMenuSelectionValue(items[nextIndex]);
  };

  const changeOptionsTab = (direction: number) => {
    if (restartConfirmationOpenRef.current) return;
    const currentIndex = OPTIONS_TABS.findIndex(
      (tab) => tab.id === optionsTabRef.current,
    );
    const nextIndex = clamp(
      currentIndex + Math.sign(direction),
      0,
      OPTIONS_TABS.length - 1,
    );
    if (nextIndex === currentIndex) return;
    const nextTab = OPTIONS_TABS[nextIndex].id;
    optionsTabRef.current = nextTab;
    setOptionsTab(nextTab);
    setOptionsMenuSelectionValue(OPTIONS_TAB_ITEMS[nextTab][0]);
  };

  const activateOptionsMenuSelection = () => {
    if (restartConfirmationOpenRef.current) {
      if (restartConfirmationChoiceRef.current === "confirm") {
        confirmRestartNewGame();
      } else {
        closeRestartConfirmation();
      }
      return;
    }
    switch (optionsMenuSelectionRef.current) {
      case "dialogue-text-size":
        setDialogueTextSize((current) =>
          current === "small" ? "medium" : current === "medium" ? "large" : "small",
        );
        break;
      case "virtual-cursor-controls":
        setVirtualCursorControlsEnabledValue(
          !virtualCursorControlsEnabledRef.current,
        );
        break;
      case "player-collision":
        showPlayerCollisionRef.current = !showPlayerCollisionRef.current;
        setShowPlayerCollision(showPlayerCollisionRef.current);
        break;
      case "scene-collision":
        showSceneCollisionRef.current = !showSceneCollisionRef.current;
        setShowSceneCollision(showSceneCollisionRef.current);
        break;
      case "bgm-enabled":
        setBgmEnabledValue(!bgmEnabledRef.current);
        break;
      case "restart-game":
        openRestartConfirmation();
        break;
    }
  };

  const adjustOptionsMenuSelection = (direction: number) => {
    if (restartConfirmationOpenRef.current) {
      setRestartConfirmationChoiceValue(direction > 0 ? "confirm" : "cancel");
      return;
    }
    const toggleValue = getDpadToggleValue(direction);
    switch (optionsMenuSelectionRef.current) {
      case "dialogue-text-size": {
        const sizes: DialogueTextSize[] = ["small", "medium", "large"];
        const currentIndex = sizes.indexOf(dialogueTextSize);
        const nextIndex =
          (currentIndex + Math.sign(direction) + sizes.length) % sizes.length;
        setDialogueTextSize(sizes[nextIndex]);
        break;
      }
      case "bgm-enabled":
        if (toggleValue !== null) setBgmEnabledValue(toggleValue);
        break;
      case "virtual-cursor-controls":
        if (toggleValue !== null) {
          setVirtualCursorControlsEnabledValue(toggleValue);
        }
        break;
      case "player-collision":
        if (toggleValue !== null) {
          showPlayerCollisionRef.current = toggleValue;
          setShowPlayerCollision(toggleValue);
        }
        break;
      case "scene-collision":
        if (toggleValue !== null) {
          showSceneCollisionRef.current = toggleValue;
          setShowSceneCollision(toggleValue);
        }
        break;
      case "bgm-volume":
        if (bgmEnabledRef.current) setBgmVolumeValue(bgmVolumeRef.current * 100 + direction * 5);
        break;
      case "movement-speed":
        setSpeedValue(speedRef.current + direction * 10);
        break;
      case "character-size":
        setSizeValue(sizeRef.current + direction * 4);
        break;
      case "collision-slide-tolerance":
        setCollisionSlideToleranceValue(
          collisionSlideToleranceRef.current * 100 + direction * 5,
        );
        break;
    }
  };

  useEffect(() => {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      return;
    }

    let disposed = false;
    let requestPending = false;

    const pollNativeGamepad = async () => {
      if (disposed || requestPending) return;
      requestPending = true;

      try {
        const response = await fetch(NATIVE_GAMEPAD_BRIDGE_URL, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Gamepad bridge unavailable");

        const state = (await response.json()) as NativeGamepadState;
        if (!disposed) nativeGamepadRef.current = state;
      } catch {
        if (!disposed) {
          nativeGamepadRef.current = EMPTY_NATIVE_GAMEPAD_STATE;
        }
      } finally {
        requestPending = false;
      }
    };

    void pollNativeGamepad();
    const pollTimer = window.setInterval(() => {
      void pollNativeGamepad();
    }, 25);

    return () => {
      disposed = true;
      window.clearInterval(pollTimer);
    };
  }, []);

  useEffect(() => {
    const minimapCanvas = minimapCanvasRef.current;
    if (minimapCanvas) drawMiniMapGeometry(minimapCanvas);
  }, []);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    collisionSlideToleranceRef.current = collisionSlideTolerance / 100;
  }, [collisionSlideTolerance]);

  useEffect(() => {
    showPlayerCollisionRef.current = showPlayerCollision;
  }, [showPlayerCollision]);

  useEffect(() => {
    showSceneCollisionRef.current = showSceneCollision;
  }, [showSceneCollision]);

  useEffect(() => {
    bgmEnabledRef.current = bgmEnabled;
    const audioEvents = audioEventManagerRef.current;
    if (!audioEvents) return;

    if (bgmEnabled) requestBgmPlaybackRef.current();
    else audioEvents.stop("bgm", { reset: false });
  }, [bgmEnabled]);

  useEffect(() => {
    bgmVolumeRef.current = bgmVolume / 100;
    audioEventManagerRef.current?.setVolume("bgm", bgmVolumeRef.current);
  }, [bgmVolume]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cursorCanvas = cursorCanvasRef.current;
    const minimapPlayerMarker = minimapPlayerMarkerRef.current;
    if (!canvas || !cursorCanvas) return;

    const context = canvas.getContext("2d");
    const cursorContext = cursorCanvas.getContext("2d");
    if (!context || !cursorContext) return;

    const pressedKeys = new Set<string>();
    const sprites = new Map<Direction, HTMLCanvasElement>();
    let seWalkSprites: HTMLCanvasElement[] = [];
    const player = { ...SPAWN };
    const camera = { ...SPAWN };
    const sceneImage = new Image();
    sceneImage.decoding = "async";
    sceneImage.src = MAP_SOURCE;
    const audioEvents = new AudioEventManager();
    audioEventManagerRef.current = audioEvents;
    audioEvents.setVolume("bgm", bgmVolumeRef.current);
    const footstepAudio = audioEvents.getAudio("footsteps");
    const bgmAudio = audioEvents.getAudio("bgm");

    let currentFacing: Direction = SCENE_START_FACING;
    let wasMoving = false;
    let seWalkElapsedSeconds = 0;
    let animationFrame = 0;
    let lastTime = performance.now();
    let viewportWidth = 1;
    let viewportHeight = 1;
    let wasGamepadConnected = false;
    let lastGamepadDiagnostic = "";
    let gamepadDiagnosticElapsed = 0;
    let autoPath: Point[] = [];
    let autoDestination: Point | null = null;
    let touchEffect: TouchEffect | null = null;
    let pendingInteraction: PendingInteraction | null = null;
    let movementGuideSuppressedForPendingInteraction = false;
    let wasGamepadActionPressed = false;
    let wasGamepadBackPressed = false;
    let wasGamepadConfirmPressed = false;
    let wasGamepadSecondaryActionPressed = false;
    let wasGamepadHotbarUsePressed = false;
    let wasGamepadStartPressed = false;
    let wasGamepadLeftBumperPressed = false;
    let wasGamepadRightBumperPressed = false;
    let heldGamepadDpadX = 0;
    let heldGamepadDpadY = 0;
    let gamepadDpadXRepeatSeconds = 0;
    let gamepadDpadYRepeatSeconds = 0;
    let gameplayHotbarDpadX = 0;
    const activeStoryTriggerZoneIds = new Set<string>();
    const eligibleStoryTriggerZoneIds = new Set<string>();
    let storyTriggerContactCheckRequested = false;
    requestStoryTriggerContactCheckRef.current = () => {
      storyTriggerContactCheckRequested = true;
    };
    const virtualCursor = { x: 0, y: 0 };
    let virtualCursorPositioned = false;
    let virtualCursorVisible = false;
    let gamepadCursorActive = false;
    let gamepadInputCursorHidden = false;
    const touchJoystick = {
      input: { x: 0, y: 0 },
      inputOrigin: { x: 0, y: 0 },
      knob: { x: 0, y: 0 },
      origin: { x: 0, y: 0 },
    };
    let touchJoystickPointerId: number | null = null;
    let touchJoystickVisible = false;
    let heldPointerId: number | null = null;
    let heldPointerScreen: Point | null = null;
    let heldPointerRetargetElapsed = 0;
    let heldPointerDuration = 0;
    let heldPointerContinuous = false;
    let lastHeldPointerWorldTarget: Point | null = null;
    let heldPointerFeedback: { point: Point; reachable: boolean } | null = null;
    let pointerGestureConsumed = false;
    let pointerInteractionTriggeredId: string | null = null;
    let footstepPlaybackRate = 1;
    let footstepPlayPending = false;
    let footstepPlayBlocked = false;
    let footstepShouldPlay = false;
    let bgmPlayPending = false;
    let bgmPlayBlocked = false;
    let bgmDisposed = false;
    let interactionFeedbackTimer: number | null = null;
    let lastMovementGuideSign = 1;
    let lockedAutoMovementGuideId: string | null = null;
    let bypassedAutoMovementGuideId: string | null = null;
    let activeInteractionKeyLabel = "E";
    let activeInputMode: "keyboard-mouse" | "gamepad" = "keyboard-mouse";
    let activePromptOwner: "player" | "cursor" | null = null;
    let activePromptTargetId: string | null = null;
    let previousPlayerPromptTargetId: string | null = null;
    let previousCursorPromptTargetId: string | null = null;
    let mobileInteractionTargetId: string | null = null;
    const interactionHintAnimation = new Map<
      string,
      { opacity: number; emphasis: number; lastTime: number }
    >();
    let keyboardInteractionKey = (localStorage.getItem("echoes:interaction-key") ?? "e").toLowerCase();
    let keyboardInteractionLabel = localStorage.getItem("echoes:interaction-key-label") ?? keyboardInteractionKey.toUpperCase();
    let survivalUiElapsed = 0;
    let survivalSaveElapsed = 0;
    let minimapSyncElapsed = 0;
    let lastMinimapPlayerX = Number.NaN;
    let lastMinimapPlayerY = Number.NaN;

    const refreshInteractionUsageCycle = () => {
      const current = interactionUsageRef.current;
      const next = ensureInteractionUsageCycle(
        current,
        survivalStateRef.current.gameMinutes,
      );
      if (next !== current) {
        interactionUsageRef.current = next;
        saveInteractionUsageState(next);
        requestStoryTriggerContactCheckRef.current();
      }
      return next;
    };

    const toStoryTriggerInteractable = (
      zone: StoryTriggerZone,
    ): SceneInteractable => ({
      id: `story-trigger:${zone.id}`,
      label: zone.label,
      shape: "polygon",
      points: zone.points,
      type: "dialogue",
      survivalRequirements: zone.survivalRequirements,
      survivalEffects: zone.survivalEffects,
      dailyInteractionLimit: zone.dailyInteractionLimit,
      interactionLimitMode: zone.once ? "once" : zone.interactionLimitMode,
      itemRewards: zone.itemRewards,
      itemReward: zone.itemReward,
      useRequirements: zone.useRequirements,
    });

    const isInteractableLocked = (interactable: SceneInteractable) =>
      isInteractionLocked(
        refreshInteractionUsageCycle(),
        interactable.id,
        interactable.dailyInteractionLimit,
        interactable.interactionLimitMode,
      );

    const getInteractionRequirementFailure = (
      interactable: SceneInteractable,
    ) => getUnmetSurvivalRequirements(
      survivalStateRef.current.values,
      interactable.survivalRequirements,
    )[0];

    const getInteractionUseRequirementFailure = (
      interactable: SceneInteractable,
    ) => getUnmetInteractionUseRequirements(
      normalizeInteractionUseRequirements(
        interactable.useRequirements,
        resolveItemId,
      ),
      playerInventoryRef.current,
      currentStoryChapterRef.current,
      (questId) =>
        questRuntimeManagerRef.current?.isQuestActive(questId) ?? false,
      (requirement) => {
        return evaluateInteractionStageRequirement(
          requirement,
          (questId, stageId) =>
            questRuntimeManagerRef.current?.isQuestAtStage(questId, stageId) ?? false,
          (questId, stageId) =>
            questRuntimeManagerRef.current?.hasQuestReachedStage(questId, stageId) ?? false,
        );
      },
      (questId, questState) =>
        questRuntimeManagerRef.current?.isQuestInState(questId, questState) ?? false,
    )[0];

    canActivateStoryTriggerRef.current = (zone) => {
      const trigger = toStoryTriggerInteractable(zone);
      return !isInteractableLocked(trigger) &&
        !getInteractionRequirementFailure(trigger) &&
        !getInteractionUseRequirementFailure(trigger);
    };

    const isInteractableConditionActive = (
      interactable: SceneInteractable,
    ) => shouldExposeInteraction(
      Boolean(getInteractionUseRequirementFailure(interactable)),
    );

    const isInteractableSelectable = (interactable: SceneInteractable) =>
      isInteractableConditionActive(interactable) &&
      !isInteractableLocked(interactable);

    const openInteractionFailureDialogue = (
      interactable: SceneInteractable,
      source: PendingInteraction["source"],
    ) => {
      if (source === "pointer") pointerGestureConsumed = true;
      const failureDialogue = selectInteractionDialogue(interactable, "failure");
      openDialogue(interactable, undefined, failureDialogue);
      if (source === "pointer") pointerInteractionTriggeredId = interactable.id;
      return false;
    };

    const onControlBindingsChanged = () => {
      keyboardInteractionKey = (localStorage.getItem("echoes:interaction-key") ?? "e").toLowerCase();
      keyboardInteractionLabel = localStorage.getItem("echoes:interaction-key-label") ?? keyboardInteractionKey.toUpperCase();
    };

    const activateGamepadCursor = () => {
      virtualCursorVisible = true;
      if (gamepadCursorActive) return;
      gamepadCursorActive = true;
      document.documentElement.classList.add("gamepad-cursor-active");
    };

    const deactivateGamepadCursor = () => {
      if (!gamepadCursorActive) return;
      gamepadCursorActive = false;
      document.documentElement.classList.remove("gamepad-cursor-active");
    };

    const activateOptionsDpadMode = () => {
      optionsGamepadModeRef.current = "dpad";
      virtualCursorVisible = false;
      deactivateGamepadCursor();
    };

    const activateInventoryDpadMode = () => {
      inventoryGamepadModeRef.current = "dpad";
      virtualCursorVisible = false;
      deactivateGamepadCursor();
    };

    const setGamepadInputCursorHidden = (hidden: boolean) => {
      if (gamepadInputCursorHidden === hidden) return;
      gamepadInputCursorHidden = hidden;
      document.documentElement.classList.toggle("gamepad-input-active", hidden);
    };

    const requestFootstepPlayback = () => {
      if (
        !footstepShouldPlay ||
        !footstepAudio.paused ||
        footstepPlayPending ||
        footstepPlayBlocked
      ) {
        return;
      }

      footstepPlayPending = true;
      void audioEvents
        .play("footsteps")
        .catch(() => {
          footstepPlayBlocked = true;
        })
        .finally(() => {
          footstepPlayPending = false;
          if (!footstepShouldPlay) {
            audioEvents.stop("footsteps", { reset: false });
          }
        });
    };

    const requestBgmPlayback = () => {
      if (
        bgmDisposed ||
        !bgmEnabledRef.current ||
        document.hidden ||
        !bgmAudio.paused ||
        bgmPlayPending ||
        bgmPlayBlocked
      ) {
        return;
      }

      bgmPlayPending = true;
      void audioEvents
        .play("bgm")
        .catch(() => {
          bgmPlayBlocked = true;
        })
        .finally(() => {
          bgmPlayPending = false;
          if (bgmDisposed || !bgmEnabledRef.current || document.hidden) {
            audioEvents.stop("bgm", { reset: false });
          }
        });
    };
    requestBgmPlaybackRef.current = requestBgmPlayback;

    const allowAudioPlaybackRetry = () => {
      footstepPlayBlocked = false;
      bgmPlayBlocked = false;
      requestFootstepPlayback();
      requestBgmPlayback();
      requestDialogueTypingAudioPlayback(false);
    };

    const stopFootsteps = () => {
      footstepShouldPlay = false;
      audioEvents.stop("footsteps", { reset: false });
    };

    const teleportPlayer = (point: SceneTeleportPoint) => {
      if (!isWalkable(point, sizeRef.current * 0.14)) {
        console.warn(`[QuestTeleport] Point is not walkable: ${point.id}`);
        return true;
      }
      autoPath = [];
      autoDestination = null;
      pendingInteraction = null;
      movementGuideSuppressedForPendingInteraction = false;
      lockedAutoMovementGuideId = null;
      bypassedAutoMovementGuideId = null;
      touchJoystickPointerId = null;
      touchJoystickVisible = false;
      touchJoystick.input = { x: 0, y: 0 };
      heldPointerId = null;
      heldPointerScreen = null;
      heldPointerContinuous = false;
      activePromptOwner = null;
      activePromptTargetId = null;
      previousPlayerPromptTargetId = null;
      previousCursorPromptTargetId = null;
      mobileInteractionTargetId = null;
      activeStoryTriggerZoneIds.clear();
      eligibleStoryTriggerZoneIds.clear();
      player.x = point.x;
      player.y = point.y;
      camera.x = point.x;
      camera.y = point.y;
      currentFacing = point.facing;
      playerPositionRef.current = { x: point.x, y: point.y };
      playerFacingRef.current = point.facing;
      setFacing(point.facing);
      setMoving(false);
      stopFootsteps();
      storyTriggerContactCheckRequested = true;
      return true;
    };
    playerTeleportHandlerRef.current = teleportPlayer;
    const pendingTeleportPoints = pendingTeleportPointsRef.current.splice(0);
    for (const point of pendingTeleportPoints) teleportPlayer(point);

    Object.entries(SPRITE_SOURCES).forEach(([direction, source]) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        sprites.set(direction as Direction, makeChromaKeySprite(image));
      };
      image.src = source;
    });

    const seWalkImages = new Array<HTMLImageElement>(
      SE_WALK_FRAME_SOURCES.length,
    );
    let loadedSeWalkFrameCount = 0;
    SE_WALK_FRAME_SOURCES.forEach((source, index) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        seWalkImages[index] = image;
        loadedSeWalkFrameCount += 1;
        if (loadedSeWalkFrameCount === SE_WALK_FRAME_SOURCES.length) {
          seWalkSprites = makeChromaKeySpriteSequence(seWalkImages);
        }
      };
      image.src = source;
    });

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      viewportWidth = Math.max(1, bounds.width);
      viewportHeight = Math.max(1, bounds.height);
      canvas.width = Math.round(viewportWidth * ratio);
      canvas.height = Math.round(viewportHeight * ratio);
      cursorCanvas.width = Math.round(viewportWidth * ratio);
      cursorCanvas.height = Math.round(viewportHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      cursorContext.setTransform(ratio, 0, 0, ratio, 0, 0);

      const marginX = Math.min(16, viewportWidth / 2);
      const marginY = Math.min(16, viewportHeight / 2);
      if (!virtualCursorPositioned) {
        virtualCursor.x = clamp(
          viewportWidth / 2 + Math.min(150, viewportWidth * 0.18),
          marginX,
          viewportWidth - marginX,
        );
        virtualCursor.y = viewportHeight / 2;
        virtualCursorPositioned = true;
      } else {
        virtualCursor.x = clamp(
          virtualCursor.x,
          marginX,
          viewportWidth - marginX,
        );
        virtualCursor.y = clamp(
          virtualCursor.y,
          marginY,
          viewportHeight - marginY,
        );
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const eventTarget = event.target;
      if (
        eventTarget instanceof HTMLInputElement ||
        eventTarget instanceof HTMLTextAreaElement ||
        eventTarget instanceof HTMLSelectElement ||
        (eventTarget instanceof HTMLElement && eventTarget.isContentEditable)
      ) {
        return;
      }
      activeInputMode = "keyboard-mouse";
      activateQuestPromptInputMode("keyboard-mouse");
      if (timePassInputLockedRef.current) {
        event.preventDefault();
        return;
      }
      if (
        event.code === "Backquote" &&
        !storyInputLockedRef.current &&
        !optionsOpenRef.current &&
        !inventoryOpenRef.current &&
        !dialoguePlaybackRef.current &&
        !restartConfirmationOpenRef.current
      ) {
        event.preventDefault();
        if (!event.repeat) {
          pressedKeys.clear();
          setActiveKeyboardKeys([]);
          debugItemSpawnerOpenRef.current = true;
          setDebugItemSpawnCommand("");
          setDebugItemSpawnerOpen(true);
        }
        return;
      }
      if (debugItemSpawnerOpenRef.current) {
        event.preventDefault();
        return;
      }
      if (
        key === "tab" &&
        !storyInputLockedRef.current &&
        !optionsOpenRef.current &&
        !dialoguePlaybackRef.current
      ) {
        event.preventDefault();
        if (!event.repeat) setInventoryPanelOpen(!inventoryOpenRef.current);
        return;
      }
      if (restartConfirmationOpenRef.current) {
        if (key === "escape") {
          event.preventDefault();
          closeRestartConfirmation();
        } else if (key === "arrowleft" || key === "arrowright") {
          event.preventDefault();
          setRestartConfirmationChoiceValue(
            key === "arrowright" ? "confirm" : "cancel",
          );
        } else if (key === "enter" && !event.repeat) {
          event.preventDefault();
          if (restartConfirmationChoiceRef.current === "confirm") {
            confirmRestartNewGame();
          } else {
            closeRestartConfirmation();
          }
        }
        return;
      }
      if (key === "escape") {
        event.preventDefault();
        if (storyFlowActiveRef.current && !optionsOpenRef.current) {
          if (!event.repeat) beginStorySkipHold("keyboard");
          return;
        }
        if (!event.repeat) {
          pressedKeys.clear();
          setActiveKeyboardKeys([]);
          setOptionsPanelOpen(!optionsOpenRef.current);
        }
        return;
      }
      if (
        (key === "q" || key === "r") &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !storyInputLockedRef.current &&
        !optionsOpenRef.current &&
        !inventoryOpenRef.current &&
        !dialoguePlaybackRef.current
      ) {
        event.preventDefault();
        if (!event.repeat) {
          if (key === "q") toggleQuestPanel();
          else toggleSurvivalPanel();
        }
        return;
      }
      if (event.code === "Space" && dialoguePlaybackRef.current) {
        event.preventDefault();
        if (!event.repeat) advanceDialogue();
        return;
      }
      if (key === keyboardInteractionKey) {
        event.preventDefault();
        if (!event.repeat) {
          if (!advanceDialogue() && !storyInputLockedRef.current) {
            activateBestInteraction("keyboard");
          }
        }
        return;
      }
      if (
        /^[1-7]$/.test(key) &&
        !storyInputLockedRef.current &&
        !optionsOpenRef.current &&
        !inventoryOpenRef.current &&
        !dialoguePlaybackRef.current
      ) {
        event.preventDefault();
        if (!event.repeat) activateHotbarItem(Number(key) - 1);
        return;
      }
      if (!MOVEMENT_KEYS.has(key)) return;
      event.preventDefault();
      if (storyInputLockedRef.current) return;
      pressedKeys.add(key);
      setActiveKeyboardKeys(Array.from(pressedKeys));
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        key === "escape" &&
        storySkipHoldRef.current?.source === "keyboard"
      ) {
        event.preventDefault();
        const revealed = storySkipHoldRef.current.revealed;
        cancelStorySkipHold();
        if (!revealed && storyFlowActiveRef.current) {
          setOptionsPanelOpen(true);
        }
        return;
      }
      if (!MOVEMENT_KEYS.has(key)) return;
      event.preventDefault();
      pressedKeys.delete(key);
      setActiveKeyboardKeys(Array.from(pressedKeys));
    };

    const onWindowBlur = () => {
      pressedKeys.clear();
      setActiveKeyboardKeys([]);
      deactivateGamepadCursor();
      setGamepadInputCursorHidden(false);
      virtualCursorVisible = false;
      stopFootsteps();
      audioEvents.stop("dialogueTyping", { reset: false });
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopFootsteps();
        audioEvents.stop("bgm", { reset: false });
        audioEvents.stop("dialogueTyping", { reset: false });
      } else {
        bgmPlayBlocked = false;
        requestBgmPlayback();
        requestDialogueTypingAudioPlayback(false);
      }
    };

    const screenToWorld = (screenPoint: Point) => {
      const zoom = getSceneZoom(viewportWidth, viewportHeight);
      return {
        x: camera.x + (screenPoint.x - viewportWidth / 2) / zoom,
        y: camera.y + (screenPoint.y - viewportHeight / 2) / zoom,
      };
    };

    const showInteractionItemFeedback = (message: string) => {
      hotbarUseSequenceRef.current += 1;
      setHotbarFeedback({
        message,
        sequence: hotbarUseSequenceRef.current,
        slotIndex: -1,
      });
      if (hotbarFeedbackTimerRef.current !== null) {
        window.clearTimeout(hotbarFeedbackTimerRef.current);
      }
      hotbarFeedbackTimerRef.current = window.setTimeout(() => {
        setHotbarFeedback(null);
        hotbarFeedbackTimerRef.current = null;
      }, 1800);
    };

    debugItemSpawnHandlerRef.current = (command: string) => {
      const parsed = parseDebugItemSpawnCommand(command);
      if (!parsed) {
        showInteractionItemFeedback(
          "格式錯誤 · 請輸入：道具ID 數量（數量為 1～999）",
        );
        return false;
      }

      const item = ITEM_BY_ID.get(parsed.itemId);
      if (!item) {
        showInteractionItemFeedback(`找不到道具 ID：${parsed.itemId}`);
        return false;
      }

      if (getItemDebugSpawnDelivery(item) === "inventory") {
        const nextInventory = grantInventoryItem(
          playerInventoryRef.current,
          item.id,
          parsed.quantity,
        );
        playerInventoryRef.current = nextInventory;
        setPlayerInventory(nextInventory);
        try {
          savePlayerInventory(nextInventory);
        } catch {
          // 儲存空間不可用時，仍保留本次遊玩階段的生成結果。
        }
        showInteractionItemFeedback(
          `Debug：${item.name} ×${parsed.quantity} 已放入背包`,
        );
        return true;
      }

      const placement = findDroppedWorldItemPlacement(
        player,
        currentFacing,
        sizeRef.current * 0.14,
        droppedWorldItemsRef.current.filter(
          (worldItem) => worldItem.sceneId === SCENE_DATA.sceneId,
        ),
      );
      if (!placement) {
        showInteractionItemFeedback(
          `角色附近沒有足夠空間生成 ${item.name}`,
        );
        return false;
      }

      let worldItemId = "";
      do {
        droppedWorldItemSequenceRef.current += 1;
        worldItemId =
          `debug-spawn:${SCENE_DATA.sceneId}:` +
          `${droppedWorldItemSequenceRef.current}`;
      } while (
        droppedWorldItemsRef.current.some(
          (worldItem) => worldItem.id === worldItemId,
        )
      );

      const droppedWorldItem: DroppedWorldItem = {
        id: worldItemId,
        sceneId: SCENE_DATA.sceneId,
        itemId: item.id,
        quantity: parsed.quantity,
        position: placement.position,
        interactionPoint: placement.interactionPoint,
        pickRadius: 26,
        activationDistance: 48,
        createdFromInventory: false,
      };
      const spawnDirection = {
        x: placement.position.x - player.x,
        y: placement.position.y - player.y,
      };
      const spawnDistance = Math.max(
        1,
        Math.hypot(spawnDirection.x, spawnDirection.y),
      );
      const spawnLanding = {
        x: placement.position.x - (spawnDirection.x / spawnDistance) * 20,
        y: placement.position.y - (spawnDirection.y / spawnDistance) * 20,
      };
      const facingVector = getDirectionVector(currentFacing);
      const spawnStart = {
        x: player.x + facingVector.x * 8,
        y: player.y - sizeRef.current * 0.42,
      };
      worldItemSpawnMotionsRef.current.set(
        worldItemId,
        createWorldItemSpawnMotion(
          performance.now(),
          spawnStart,
          spawnLanding,
          placement.position,
        ),
      );
      worldItemLandingAudioPlayedRef.current.delete(worldItemId);
      const nextDroppedWorldItems = [
        ...droppedWorldItemsRef.current,
        droppedWorldItem,
      ];
      applyDroppedWorldItems(nextDroppedWorldItems);
      try {
        saveDroppedWorldItems(nextDroppedWorldItems);
      } catch {
        // 儲存空間不可用時，仍保留本次遊玩階段的生成結果。
      }
      showInteractionItemFeedback(
        `Debug：${item.name} ×${parsed.quantity} 已生成在角色旁`,
      );
      return true;
    };

    const grantInteractionItemRewards = (interactable: SceneInteractable) => {
      const configuredRewardCount = Array.isArray(interactable.itemRewards)
        ? interactable.itemRewards.length
        : interactable.itemReward
          ? 1
          : 0;
      if (configuredRewardCount === 0) return true;

      const rewards = normalizeInteractionItemRewards(
        interactable.itemRewards,
        interactable.itemReward,
        resolveItemId,
      );
      if (rewards.length !== configuredRewardCount) {
        showInteractionItemFeedback("互動獎勵設定不完整，未發放任何道具。");
        return false;
      }

      const resolvedRewards = rewards.flatMap((reward) => {
        const item = ITEM_BY_ID.get(reward.itemId);
        return item ? [{ reward, item }] : [];
      });
      if (resolvedRewards.length !== rewards.length) {
        showInteractionItemFeedback("互動獎勵包含未知道具，未發放任何道具。");
        return false;
      }

      const spawnOrigin = getInteractionTweenPoint(interactable);
      const plannedWorldItems: Array<{
        item: DroppedWorldItem;
        motion: WorldItemSpawnMotion;
      }> = [];
      const nearbyWorldItems = droppedWorldItemsRef.current.filter(
        (worldItem) => worldItem.sceneId === SCENE_DATA.sceneId,
      );

      for (const { reward, item } of resolvedRewards) {
        if (reward.delivery !== "world") continue;
        const placement = findSpawnedWorldItemPlacement(
          spawnOrigin,
          sizeRef.current * 0.14,
          [...nearbyWorldItems, ...plannedWorldItems.map((entry) => entry.item)],
        );
        if (!placement) {
          showInteractionItemFeedback(
            `「${item.name}」附近沒有足夠空間，未發放任何獎勵。`,
          );
          return false;
        }

        let rewardWorldItemId = "";
        do {
          droppedWorldItemSequenceRef.current += 1;
          rewardWorldItemId =
            `interaction-reward:${SCENE_DATA.sceneId}:` +
            `${interactable.id}:${droppedWorldItemSequenceRef.current}`;
        } while (
          droppedWorldItemsRef.current.some(
            (worldItem) => worldItem.id === rewardWorldItemId,
          ) ||
          plannedWorldItems.some((entry) => entry.item.id === rewardWorldItemId)
        );
        const droppedWorldItem: DroppedWorldItem = {
          id: rewardWorldItemId,
          sceneId: SCENE_DATA.sceneId,
          itemId: item.id,
          quantity: reward.quantity,
          position: placement.position,
          interactionPoint: placement.interactionPoint,
          pickRadius: 26,
          activationDistance: 48,
          createdFromInventory: false,
        };
        plannedWorldItems.push({
          item: droppedWorldItem,
          motion: createWorldItemSpawnMotion(
            performance.now(),
            spawnOrigin,
            placement.landing,
            placement.position,
          ),
        });
      }

      let nextInventory = playerInventoryRef.current;
      for (const { reward, item } of resolvedRewards) {
        if (reward.delivery !== "inventory") continue;
        nextInventory = grantInventoryItem(
          nextInventory,
          item.id,
          reward.quantity,
        );
      }
      if (nextInventory !== playerInventoryRef.current) {
        playerInventoryRef.current = nextInventory;
        setPlayerInventory(nextInventory);
        try {
          savePlayerInventory(nextInventory);
        } catch {
          // localStorage 不可用時仍保留本次記憶體狀態。
        }
      }

      if (plannedWorldItems.length > 0) {
        for (const entry of plannedWorldItems) {
          worldItemSpawnMotionsRef.current.set(entry.item.id, entry.motion);
          worldItemLandingAudioPlayedRef.current.delete(entry.item.id);
        }
        const nextDroppedWorldItems = [
          ...droppedWorldItemsRef.current,
          ...plannedWorldItems.map((entry) => entry.item),
        ];
        applyDroppedWorldItems(nextDroppedWorldItems);
        try {
          saveDroppedWorldItems(nextDroppedWorldItems);
        } catch {
          // localStorage 不可用時仍保留本次記憶體狀態。
        }
      }

      showInteractionItemFeedback(
        `獲得 ${resolvedRewards
          .map(({ reward, item }) => `「${item.name}」×${reward.quantity}`)
          .join("、")}`,
      );
      return true;
    };

    const scheduleTimePassStep = (callback: () => void, delayMs: number) => {
      const timerId = window.setTimeout(() => {
        timePassTransitionTimersRef.current =
          timePassTransitionTimersRef.current.filter((current) => current !== timerId);
        callback();
      }, delayMs);
      timePassTransitionTimersRef.current.push(timerId);
    };

    const settleInteractionSurvival = (
      startGameMinutes: number,
      elapsedGameMinutes: number,
      effects: SurvivalEffects | undefined,
    ) => {
      let nextSurvival = survivalStateRef.current;
      if (elapsedGameMinutes > 0) {
        nextSurvival = advanceSurvivalByGameMinutes(
          nextSurvival,
          elapsedGameMinutes,
        );
      }
      nextSurvival = applySurvivalEffects(nextSurvival, effects);
      survivalStateRef.current = nextSurvival;
      setSurvivalState(nextSurvival);
      saveSurvivalState(nextSurvival);
      requestStoryTriggerContactCheckRef.current();
      if (elapsedGameMinutes > 0) {
        showTimeElapsedNotice(startGameMinutes, elapsedGameMinutes);
      }
    };

    const runTimePassTransition = (
      startGameMinutes: number,
      elapsedGameMinutes: number,
      effects: SurvivalEffects | undefined,
    ) => {
      clearTimePassTransition();
      timePassInputLockedRef.current = true;
      pressedKeys.clear();
      setActiveKeyboardKeys([]);
      fadeBlackScreen(255, 500);

      const holdMs = getTimePassTransitionHoldMs(elapsedGameMinutes);
      timePassTransitionWatchdogRef.current = window.setTimeout(() => {
        timePassTransitionWatchdogRef.current = null;
        cancelBlackScreenFade();
        setBlackScreenOpacity(0);
        timePassInputLockedRef.current = false;
      }, 500 + holdMs + 500 + 250);

      scheduleTimePassStep(() => {
        try {
          settleInteractionSurvival(startGameMinutes, elapsedGameMinutes, effects);
        } catch (error) {
          console.error("Failed to settle time-passing interaction", error);
        } finally {
          scheduleTimePassStep(() => {
            fadeBlackScreen(0, 500, () => {
              clearTimePassTransition();
              timePassInputLockedRef.current = false;
            });
          }, holdMs);
        }
      }, 500);
    };

    completeStoryTriggerRef.current = (zone) => {
      const trigger = toStoryTriggerInteractable(zone);
      if (isInteractableLocked(trigger) || !grantInteractionItemRewards(trigger)) {
        return false;
      }

      const elapsedGameMinutes = Math.max(
        0,
        Number(trigger.survivalEffects?.timeMinutes ?? 0),
      );
      if (elapsedGameMinutes > 0 || trigger.survivalEffects) {
        const interactionStartGameMinutes = survivalStateRef.current.gameMinutes;
        if (elapsedGameMinutes >= 60) {
          runTimePassTransition(
            interactionStartGameMinutes,
            elapsedGameMinutes,
            trigger.survivalEffects,
          );
        } else {
          settleInteractionSurvival(
            interactionStartGameMinutes,
            elapsedGameMinutes,
            trigger.survivalEffects,
          );
        }
      }

      const usage = recordInteractionUse(
        refreshInteractionUsageCycle(),
        trigger.id,
        trigger.dailyInteractionLimit,
        trigger.interactionLimitMode,
      );
      if (usage !== interactionUsageRef.current) {
        interactionUsageRef.current = usage;
        saveInteractionUsageState(usage);
      }

      const manager = questRuntimeManagerRef.current;
      if (manager) {
        const clock = getGameClock(survivalStateRef.current.gameMinutes);
        for (const questId of zone.startQuestIds ?? []) {
          manager.requestQuestStart(
            questId,
            clock.day,
            clock.hour * 60 + clock.minute,
          );
        }
        saveQuestSaveData(manager.exportSave());
      }
      return true;
    };

    const completeInteraction = (
      interactable: SceneInteractable,
      source: PendingInteraction["source"],
    ) => {
      if (isInteractableLocked(interactable)) {
        return openInteractionFailureDialogue(interactable, source);
      }

      // 有生成獎勵的互動必須先成功建立獎勵，才結算生存值與每日額度。
      // 找不到合法落點時，整次互動保持失敗，避免玩家白白被扣次數。
      if (
        interactable.type !== "pickup" &&
        !grantInteractionItemRewards(interactable)
      ) {
        return false;
      }

      const elapsedGameMinutes = Math.max(
        0,
        Number(interactable.survivalEffects?.timeMinutes ?? 0),
      );
      if (elapsedGameMinutes > 0 || interactable.survivalEffects) {
        const interactionStartGameMinutes =
          survivalStateRef.current.gameMinutes;
        if (elapsedGameMinutes >= 60) {
          runTimePassTransition(
            interactionStartGameMinutes,
            elapsedGameMinutes,
            interactable.survivalEffects,
          );
        } else {
          settleInteractionSurvival(
            interactionStartGameMinutes,
            elapsedGameMinutes,
            interactable.survivalEffects,
          );
        }
      }
      const usage = recordInteractionUse(
        refreshInteractionUsageCycle(),
        interactable.id,
        interactable.dailyInteractionLimit,
        interactable.interactionLimitMode,
      );
      if (usage !== interactionUsageRef.current) {
        interactionUsageRef.current = usage;
        saveInteractionUsageState(usage);
      }
      if (interactionFeedbackTimer !== null) {
        window.clearTimeout(interactionFeedbackTimer);
      }
      setInteractionJustTriggered(true);
      interactionFeedbackTimer = window.setTimeout(() => {
        interactionFeedbackTimer = null;
        setInteractionJustTriggered(false);
      }, 800);
      window.dispatchEvent(
        new CustomEvent("echoes:interaction", {
          detail: {
            action: interactable.type ?? interactable.action ?? "dialogue",
            id: interactable.id,
            label: interactable.label,
            source,
          },
        }),
      );
      void storyEventManagerRef.current?.emit("interactionCompleted", {
        interactionId: interactable.id,
      });

      if (
        interactable.type === "pickup" &&
        interactable.itemId &&
        interactable.worldItemId
      ) {
        const item = ITEM_BY_ID.get(interactable.itemId);
        if (
          item &&
          (interactable.worldItemKind !== "placed" ||
            !collectedWorldItemIdsRef.current.has(interactable.worldItemId))
        ) {
          const quantity = Math.max(
            1,
            Math.floor(interactable.quantity ?? 1),
          );
          const nextInventory = grantInventoryItem(
            playerInventoryRef.current,
            item.id,
            quantity,
          );
          playerInventoryRef.current = nextInventory;
          setPlayerInventory(nextInventory);

          if (
            interactable.worldItemKind === "itemPoint" &&
            interactable.itemPointId
          ) {
            const itemPoint = SCENE_ITEM_POINTS.find(
              (candidate) => candidate.id === interactable.itemPointId,
            );
            if (itemPoint) {
              const nextProgress = recordItemPointCollected(
                itemPoint,
                itemPointProgressRef.current,
                survivalStateRef.current.gameMinutes,
                sceneEntryCollectedItemPointIdsRef.current,
              );
              itemPointProgressRef.current = nextProgress;
              try {
                saveItemPointProgress(nextProgress);
              } catch {
                // 儲存空間不可用時，本次工作階段仍會移除 ItemPoint 道具。
              }
              applyDroppedWorldItems(droppedWorldItemsRef.current);
            }
          } else if (interactable.worldItemKind === "dropped") {
            worldItemSpawnMotionsRef.current.delete(interactable.worldItemId);
            worldItemLandingAudioPlayedRef.current.delete(
              interactable.worldItemId,
            );
            const nextDroppedWorldItems =
              droppedWorldItemsRef.current.filter(
                (worldItem) =>
                  worldItem.id !== interactable.worldItemId,
              );
            applyDroppedWorldItems(nextDroppedWorldItems);
            try {
              saveDroppedWorldItems(nextDroppedWorldItems);
            } catch {
              // 無法使用本機儲存時，本次工作階段仍會移除場上道具。
            }
          } else {
            const nextCollectedWorldItemIds = new Set(
              collectedWorldItemIdsRef.current,
            );
            nextCollectedWorldItemIds.add(interactable.worldItemId);
            collectedWorldItemIdsRef.current =
              nextCollectedWorldItemIds;
            setCollectedWorldItemIds(nextCollectedWorldItemIds);
            try {
              saveCollectedWorldItemIds(nextCollectedWorldItemIds);
            } catch {
              // 無法使用本機儲存時，本次工作階段仍會移除固定拾取物。
            }
          }

          try {
            savePlayerInventory(nextInventory);
          } catch {
            // 無法使用本機儲存時，本次遊戲工作階段仍保留真實數量。
          }
          const questManager = questRuntimeManagerRef.current;
          if (questManager) {
            questManager.handleEvent({
              type: "itemCollected",
              targetId: item.id,
              amount: quantity,
              eventId: `itemCollected:${interactable.worldItemId}`,
            });
            saveQuestSaveData(questManager.exportSave());
          }
          playOneShotAudio("worldItemPickedUp");

          hotbarUseSequenceRef.current += 1;
          setHotbarFeedback({
            message:
              `已拾取「${item.name}」×${quantity}` +
              ` · 目前持有 ${nextInventory[item.id]}`,
            sequence: hotbarUseSequenceRef.current,
            slotIndex: -1,
          });
          if (hotbarFeedbackTimerRef.current !== null) {
            window.clearTimeout(hotbarFeedbackTimerRef.current);
          }
          hotbarFeedbackTimerRef.current = window.setTimeout(() => {
            setHotbarFeedback(null);
            hotbarFeedbackTimerRef.current = null;
          }, 1800);
        }
        if (source === "pointer") {
          pointerInteractionTriggeredId = interactable.id;
        }
        return true;
      }

      if (source === "pointer") pointerInteractionTriggeredId = interactable.id;
      questGameEventSequenceRef.current += 1;
      const questManager = questRuntimeManagerRef.current;
      if (questManager) {
        questManager.handleEvent({
          type: "interactionSucceeded",
          targetId: interactable.id,
          eventId:
            `interactionSucceeded:${SCENE_DATA.sceneId}:${interactable.id}:` +
            `${Date.now()}:${questGameEventSequenceRef.current}`,
        });
        saveQuestSaveData(questManager.exportSave());
      }
      const completionDialogue = selectInteractionDialogue(
        interactable,
        "completion",
      );
      if (completionDialogue) {
        openDialogue(interactable, undefined, completionDialogue);
      }
      return true;
    };

    const triggerInteraction = (
      interactable: SceneInteractable,
      source: PendingInteraction["source"],
    ) => {
      if (source === "pointer") pointerGestureConsumed = true;
      hideHotbarSelectionHint();
      if (isInteractableLocked(interactable)) {
        return openInteractionFailureDialogue(interactable, source);
      }
      if (!isInteractableConditionActive(interactable)) return false;
      if (getInteractionRequirementFailure(interactable)) {
        return openInteractionFailureDialogue(interactable, source);
      }

      const hasDialogueSequence = shouldCompleteAfterDialogue(interactable);
      if (hasDialogueSequence) {
        openDialogue(interactable, () => {
          completeInteraction(interactable, source);
        });
        if (source === "pointer") pointerInteractionTriggeredId = interactable.id;
        return true;
      }

      return completeInteraction(interactable, source);
    };

    const findPathFromLimitedCandidates = (
      requestedCandidates: Point[],
      maximumFullSearches = 3,
    ) => {
      const radius = sizeRef.current * 0.14;
      const seen = new Set<string>();
      const candidates = requestedCandidates.filter((candidate) => {
        const key = `${Math.round(candidate.x * 10)},${Math.round(candidate.y * 10)}`;
        if (seen.has(key) || !isWalkable(candidate, radius)) return false;
        seen.add(key);
        return true;
      });

      for (const candidate of candidates.slice(0, 8)) {
        if (hasWalkableLine(player, candidate, radius)) return [candidate];
      }

      for (const candidate of candidates.slice(0, maximumFullSearches)) {
        const path = findPath(player, candidate, radius);
        if (path) return path;
      }
      return null;
    };

    const findReachablePickupApproach = (
      interactable: SceneInteractable,
      attempt = 0,
    ) => {
      const target = getInteractableCenter(interactable);
      const radius = sizeRef.current * 0.14;
      const contactDistance = Math.max(
        8,
        radius + (interactable.pickRadius ?? 32) - 4,
      );
      const baseAngle =
        Math.atan2(player.y - target.y, player.x - target.x) +
        attempt * (Math.PI / 6);
      const candidates: Point[] = [];
      const angleIndices = [
        0, 3, 6, 9, 12, 15, 18, 21,
        1, 2, 4, 5, 7, 8, 10, 11,
        13, 14, 16, 17, 19, 20, 22, 23,
      ];

      for (const ringScale of [0.92, 0.72]) {
        for (const angleIndex of angleIndices) {
          const angle = baseAngle + (angleIndex / 24) * Math.PI * 2;
          candidates.push({
            x: target.x + Math.cos(angle) * contactDistance * ringScale,
            y: target.y + Math.sin(angle) * contactDistance * ringScale,
          });
        }
      }

      const minimumPlayerDistance = attempt > 0 ? 8 : 0;
      const viableCandidates = candidates.filter(
        (candidate) =>
          Math.hypot(candidate.x - player.x, candidate.y - player.y) >
          minimumPlayerDistance,
      );
      const path = findPathFromLimitedCandidates(viableCandidates, 8);
      if (!path) return null;
      return {
        path,
        destination: path[path.length - 1],
      };
    };

    const findReachableInteractionPath = (target: Point) => {
      const candidates: Point[] = [target];
      for (const ring of [18, 30, 44, 60, 78]) {
        for (let index = 0; index < 16; index += 1) {
          const angle = (index / 16) * Math.PI * 2;
          candidates.push({
            x: target.x + Math.cos(angle) * ring,
            y: target.y + Math.sin(angle) * ring,
          });
        }
      }
      return findPathFromLimitedCandidates(candidates, 4);
    };

    const assignWorldAction = (
      requestedDestination: Point,
      source: PendingInteraction["source"],
      showTouchEffect = true,
      forcedInteractable?: SceneInteractable,
      playAcceptedInteractionSound = false,
      allowInteractableSelection = true,
    ) => {
      if (blackScreenOpacityRef.current > 0) return;

      const selectedInteractable = allowInteractableSelection
        ? forcedInteractable ??
          findInteractableAt(
            requestedDestination,
            sceneInteractablesRef.current,
            collectedWorldItemIdsRef.current,
            isInteractableConditionActive,
          )
        : null;
      const interactable =
        selectedInteractable && isInteractableConditionActive(selectedInteractable)
          ? selectedInteractable
          : null;
      if (
        source === "pointer" &&
        interactable &&
        pointerInteractionTriggeredId === interactable.id
      ) {
        return;
      }
      if (interactable && isInteractableLocked(interactable)) {
        autoPath = [];
        autoDestination = null;
        pendingInteraction = null;
        openInteractionFailureDialogue(interactable, source);
        if (showTouchEffect) {
          touchEffect = {
            point: getInteractionTweenPoint(interactable),
            reachable: false,
            startedAt: performance.now(),
          };
        }
        return;
      }
      if (interactable && getInteractionRequirementFailure(interactable)) {
        autoPath = [];
        autoDestination = null;
        pendingInteraction = null;
        openInteractionFailureDialogue(interactable, source);
        if (showTouchEffect) {
          touchEffect = {
            point: getInteractionTweenPoint(interactable),
            reachable: false,
            startedAt: performance.now(),
          };
        }
        return;
      }
      if (
        interactable?.type === "pickup" &&
        isTouchingInteractable(
          player,
          sizeRef.current * 0.14,
          interactable,
        )
      ) {
        autoPath = [];
        autoDestination = null;
        pendingInteraction = null;
        movementGuideSuppressedForPendingInteraction = false;
        lockedAutoMovementGuideId = null;
        bypassedAutoMovementGuideId = null;
        if (playAcceptedInteractionSound) {
          playOneShotAudio("interactionAccepted");
        }
        if (showTouchEffect) {
          touchEffect = {
            point: getInteractionTweenPoint(interactable),
            reachable: true,
            startedAt: performance.now(),
          };
        }
        triggerInteraction(interactable, source);
        return;
      }
      const interactionPoint = interactable
        ? findNearestInteractionPoint(interactable, player)
        : undefined;
      const pickupApproach = interactable?.type === "pickup"
        ? findReachablePickupApproach(interactable)
        : null;
      const destination =
        pickupApproach?.destination ?? interactionPoint ?? requestedDestination;
      const path = interactable?.type === "pickup"
        ? pickupApproach?.path ?? null
        : interactable
          ? interactionPoint
            ? findReachableInteractionPath(destination)
            : findPath(player, requestedDestination, sizeRef.current * 0.14)
          : findPath(player, destination, sizeRef.current * 0.14);

      autoPath = path ?? [];
      autoDestination = path !== null ? destination : null;
      pendingInteraction =
        interactable && path !== null
          ? { interactable, interactionPoint, source, repathAttempts: 0 }
          : null;
      if (
        interactable &&
        path !== null &&
        playAcceptedInteractionSound
      ) {
        playOneShotAudio("interactionAccepted");
      }
      movementGuideSuppressedForPendingInteraction = false;
      lockedAutoMovementGuideId = null;
      bypassedAutoMovementGuideId = null;
      if (showTouchEffect) {
        touchEffect = {
          point: interactable ? getInteractionTweenPoint(interactable) : requestedDestination,
          reachable: path !== null,
          startedAt: performance.now(),
        };
      }
    };

    const assignScreenAction = (
      screenPoint: Point,
      source: PendingInteraction["source"],
    ) => {
      assignWorldAction(screenToWorld(screenPoint), source);
    };

    const completePendingInteraction = () => {
      if (!pendingInteraction) {
        autoDestination = null;
        return;
      }

      const { interactable, interactionPoint, source } = pendingInteraction;
      const isPickup = interactable.type === "pickup";
      const closeEnough = isPickup
        ? isTouchingInteractable(
            player,
            sizeRef.current * 0.14,
            interactable,
          )
        : interactionPoint
          ? Math.hypot(
              player.x - interactionPoint.x,
              player.y - interactionPoint.y,
            ) <= (interactable.activationDistance ?? 52)
          : isTouchingInteractable(
              player,
              sizeRef.current * 0.14,
              interactable,
            );

      if (closeEnough) {
        if (!isPickup && interactionPoint?.facing) {
          currentFacing = interactionPoint.facing;
        }
        triggerInteraction(interactable, source);
      } else if (isPickup && (pendingInteraction.repathAttempts ?? 0) < 2) {
        const repathAttempts = (pendingInteraction.repathAttempts ?? 0) + 1;
        const pickupApproach = findReachablePickupApproach(
          interactable,
          repathAttempts,
        );
        if (pickupApproach) {
          pendingInteraction = {
            ...pendingInteraction,
            repathAttempts,
          };
          autoPath = pickupApproach.path;
          autoDestination = pickupApproach.destination;
          return;
        }
      }

      pendingInteraction = null;
      autoDestination = null;
      movementGuideSuppressedForPendingInteraction = false;
      lockedAutoMovementGuideId = null;
      bypassedAutoMovementGuideId = null;
    };

    const activateBestInteraction = (source: PendingInteraction["source"]) => {
      if (dialoguePlaybackRef.current) {
        advanceDialogue();
        return;
      }
      if (blackScreenOpacityRef.current > 0) return;

      const canUseCursorForSource =
        source !== "gamepad" || virtualCursorControlsEnabledRef.current;
      const cursorTarget = canUseCursorForSource && virtualCursorVisible
          ? findInteractableAt(
              screenToWorld(virtualCursor),
              sceneInteractablesRef.current,
              collectedWorldItemIdsRef.current,
              isInteractableSelectable,
            )
        : null;
      const playerTarget = findInteractableTouching(
        player,
        sizeRef.current * 0.14,
        sceneInteractablesRef.current,
        collectedWorldItemIdsRef.current,
        isInteractableSelectable,
      );
      const lockedPlayerTarget =
        activePromptOwner === "player" &&
        playerTarget?.id === activePromptTargetId
          ? playerTarget
          : null;
      const lockedCursorTarget =
        activePromptOwner === "cursor" &&
        cursorTarget?.id === activePromptTargetId
          ? cursorTarget
          : null;
      const lockedTarget = lockedPlayerTarget ?? lockedCursorTarget;
      const target = lockedTarget ?? cursorTarget ?? playerTarget;
      const targetOwner = lockedTarget
        ? activePromptOwner
        : cursorTarget
          ? "cursor"
          : playerTarget
            ? "player"
            : null;
      if (!target) {
        if (
          source !== "keyboard" &&
          canUseCursorForSource &&
          virtualCursorVisible
        ) {
          assignScreenAction(virtualCursor, source);
        }
        return;
      }
      if (
        targetOwner === "player" &&
        (
          target.type === "pickup" ||
          getInteractionPoints(target).length === 0
        )
      ) {
        if (source === "gamepad") {
          playOneShotAudio("interactionAccepted");
        }
        triggerInteraction(target, source);
        return;
      }
      assignWorldAction(
        targetOwner === "cursor"
          ? screenToWorld(virtualCursor)
          : getInteractableCenter(target),
        source,
        true,
        target,
        source === "gamepad",
      );
    };

    mobileInteractionActionRef.current = () => {
      if (dialoguePlaybackRef.current) {
        advanceDialogue();
        return;
      }

      const target = findInteractableTouching(
        player,
        sizeRef.current * 0.14,
        sceneInteractablesRef.current,
        collectedWorldItemIdsRef.current,
        isInteractableSelectable,
      );
      if (!target) return;

      if (
        target.type === "pickup" ||
        getInteractionPoints(target).length === 0
      ) {
        // The mobile button is a discrete action and must not share the
        // canvas pointer-hold de-duplication latch.
        triggerInteraction(target, "mobile");
        return;
      }

      assignWorldAction(
        getInteractableCenter(target),
        "mobile",
        true,
        target,
      );
    };

    const activateVirtualCursorUi = (): "activated" | "blocked" | "none" => {
      if (!virtualCursorControlsEnabledRef.current || !virtualCursorVisible) {
        return "none";
      }

      const bounds = canvas.getBoundingClientRect();
      const element = document.elementFromPoint(
        bounds.left + virtualCursor.x,
        bounds.top + virtualCursor.y,
      );
      if (!(element instanceof HTMLElement) || !element.closest(".game-shell")) {
        return "none";
      }

      const interactive = element.closest<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), [role='button']",
      );
      if (interactive) {
        interactive.focus({ preventScroll: true });
        if (
          interactive instanceof HTMLButtonElement ||
          interactive.getAttribute("role") === "button"
        ) {
          interactive.click();
        }
        return "activated";
      }

      return element.closest(
        ".inventory-hotbar, .inventory-overlay, .inventory-dialog, .options-overlay, .options-dialog, .dialogue-box, .quest-hud",
      )
        ? "blocked"
        : "none";
    };

    const getVirtualCursorInventoryIndex = () => {
      if (!virtualCursorControlsEnabledRef.current || !virtualCursorVisible) {
        return null;
      }
      const bounds = canvas.getBoundingClientRect();
      const element = document.elementFromPoint(
        bounds.left + virtualCursor.x,
        bounds.top + virtualCursor.y,
      );
      const inventoryItem = element instanceof HTMLElement
        ? element.closest<HTMLElement>(".inventory-item[data-inventory-index]")
        : null;
      const index = Number(inventoryItem?.dataset.inventoryIndex);
      const item = Number.isInteger(index)
        ? ITEM_DATABASE[index]?.item
        : null;
      return item && (playerInventoryRef.current[item.id] ?? 0) > 0
        ? index
        : null;
    };

    const assignHeldPointerAction = (force: boolean) => {
      if (!heldPointerScreen || pointerGestureConsumed) return;
      if (!force && !heldPointerContinuous) return;

      const worldTarget = screenToWorld(heldPointerScreen);
      if (
        !force &&
        lastHeldPointerWorldTarget &&
        Math.hypot(
          worldTarget.x - lastHeldPointerWorldTarget.x,
          worldTarget.y - lastHeldPointerWorldTarget.y,
        ) < POINTER_RETARGET_MIN_WORLD_DISTANCE
      ) {
        return;
      }

      lastHeldPointerWorldTarget = worldTarget;
      const allowInteractableSelection = !heldPointerContinuous;
      const target = allowInteractableSelection
        ? findInteractableAt(
            worldTarget,
            sceneInteractablesRef.current,
            collectedWorldItemIdsRef.current,
            isInteractableConditionActive,
          )
        : null;
      assignWorldAction(
        worldTarget,
        "pointer",
        false,
        undefined,
        force,
        allowInteractableSelection,
      );
      heldPointerFeedback = {
        point: target ? getInteractionTweenPoint(target) : worldTarget,
        reachable: target
          ? pointerInteractionTriggeredId === target.id ||
            pendingInteraction?.interactable.id === target.id
          : autoDestination !== null,
      };
    };

    const updateTouchJoystick = (screenPoint: Point) => {
      const deltaX = screenPoint.x - touchJoystick.inputOrigin.x;
      const deltaY = screenPoint.y - touchJoystick.inputOrigin.y;
      const distance = Math.hypot(deltaX, deltaY);
      const maximumRadius = 58;
      const directionX = distance > 0 ? deltaX / distance : 0;
      const directionY = distance > 0 ? deltaY / distance : 0;
      const visualDistance = Math.min(distance, maximumRadius);
      const inputStrength = clamp((distance - 8) / (maximumRadius - 8), 0, 1);

      touchJoystick.knob.x = touchJoystick.origin.x + directionX * visualDistance;
      touchJoystick.knob.y = touchJoystick.origin.y + directionY * visualDistance;
      touchJoystick.input.x = directionX * inputStrength;
      touchJoystick.input.y = directionY * inputStrength;
    };

    const beginTouchJoystick = (event: PointerEvent, screenPoint: Point) => {
      touchJoystickPointerId = event.pointerId;
      touchJoystickVisible = true;
      touchJoystick.inputOrigin.x = screenPoint.x;
      touchJoystick.inputOrigin.y = screenPoint.y;
      touchJoystick.origin.x = screenPoint.x;
      touchJoystick.origin.y = screenPoint.y;
      touchJoystick.knob.x = touchJoystick.origin.x;
      touchJoystick.knob.y = touchJoystick.origin.y;
      touchJoystick.input.x = 0;
      touchJoystick.input.y = 0;
      canvas.setPointerCapture(event.pointerId);
    };

    const endTouchJoystick = (event: PointerEvent) => {
      if (event.pointerId !== touchJoystickPointerId) return false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      touchJoystickPointerId = null;
      touchJoystickVisible = false;
      touchJoystick.input.x = 0;
      touchJoystick.input.y = 0;
      return true;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (blackScreenOpacityRef.current > 0) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      activeInputMode = "keyboard-mouse";
      activateQuestPromptInputMode(
        event.pointerType === "touch" ? "mobile" : "keyboard-mouse",
      );
      deactivateGamepadCursor();
      setGamepadInputCursorHidden(false);
      const bounds = canvas.getBoundingClientRect();
      const screenPoint = {
        x: clamp(event.clientX - bounds.left, 0, viewportWidth),
        y: clamp(event.clientY - bounds.top, 0, viewportHeight),
      };
      if (
        event.pointerType === "touch" &&
        screenPoint.y >= viewportHeight * 0.5
      ) {
        beginTouchJoystick(event, screenPoint);
        canvas.focus({ preventScroll: true });
        return;
      }
      virtualCursor.x = screenPoint.x;
      virtualCursor.y = screenPoint.y;
      virtualCursorVisible = event.pointerType === "mouse";
      heldPointerId = event.pointerId;
      heldPointerScreen = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      heldPointerRetargetElapsed = 0;
      heldPointerDuration = 0;
      heldPointerContinuous = false;
      lastHeldPointerWorldTarget = null;
      heldPointerFeedback = null;
      pointerGestureConsumed = false;
      pointerInteractionTriggeredId = null;
      touchEffect = null;
      canvas.setPointerCapture(event.pointerId);
      assignHeldPointerAction(true);
      canvas.focus({ preventScroll: true });
    };

    const onDialoguePointerDown = (event: PointerEvent) => {
      if (!dialoguePlaybackRef.current || !event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (storyFlowActiveRef.current && event.pointerType === "touch") return;
      if (
        event.target instanceof Element &&
        event.target.closest(".dialogue-box")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      advanceDialogue();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId === touchJoystickPointerId) {
        event.preventDefault();
        const bounds = canvas.getBoundingClientRect();
        updateTouchJoystick({
          x: clamp(event.clientX - bounds.left, 0, viewportWidth),
          y: clamp(event.clientY - bounds.top, 0, viewportHeight),
        });
        return;
      }
      if (event.pointerId !== heldPointerId) return;
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      heldPointerScreen = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    };

    const onPhysicalMouseMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;

      activeInputMode = "keyboard-mouse";
      activateQuestPromptInputMode("keyboard-mouse");
      deactivateGamepadCursor();
      setGamepadInputCursorHidden(false);
      if (blackScreenOpacityRef.current > 0) {
        const bounds = canvas.getBoundingClientRect();
        virtualCursor.x = clamp(event.clientX - bounds.left, 0, viewportWidth);
        virtualCursor.y = clamp(event.clientY - bounds.top, 0, viewportHeight);
        virtualCursorVisible = true;
        return;
      }
      if (dialoguePlaybackRef.current) {
        const overDialogue =
          event.target instanceof Element &&
          event.target.closest(".dialogue-box") !== null;
        if (overDialogue) {
          virtualCursorVisible = false;
          return;
        }
        const bounds = canvas.getBoundingClientRect();
        virtualCursor.x = clamp(event.clientX - bounds.left, 0, viewportWidth);
        virtualCursor.y = clamp(event.clientY - bounds.top, 0, viewportHeight);
        virtualCursorVisible = true;
        return;
      }
      if (event.target !== canvas) {
        virtualCursorVisible = false;
        return;
      }

      const bounds = canvas.getBoundingClientRect();
      virtualCursor.x = clamp(event.clientX - bounds.left, 0, viewportWidth);
      virtualCursor.y = clamp(event.clientY - bounds.top, 0, viewportHeight);
      virtualCursorVisible = true;
    };

    const endHeldPointer = (event: PointerEvent, showTapEffect: boolean) => {
      if (event.pointerId !== heldPointerId) return;
      const releasedScreen = heldPointerScreen;
      const shouldShowTapEffect =
        showTapEffect && !heldPointerContinuous && releasedScreen !== null;
      const feedback = heldPointerFeedback;
      const hadPointerCapture = canvas.hasPointerCapture(event.pointerId);

      heldPointerId = null;
      heldPointerScreen = null;
      heldPointerRetargetElapsed = 0;
      heldPointerDuration = 0;
      heldPointerContinuous = false;
      lastHeldPointerWorldTarget = null;
      heldPointerFeedback = null;
      pointerGestureConsumed = false;
      pointerInteractionTriggeredId = null;

      if (hadPointerCapture) canvas.releasePointerCapture(event.pointerId);
      if (shouldShowTapEffect && feedback) {
        touchEffect = {
          point: feedback.point,
          reachable: feedback.reachable,
          startedAt: performance.now(),
        };
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (endTouchJoystick(event)) return;
      if (event.pointerId === heldPointerId) {
        const bounds = canvas.getBoundingClientRect();
        heldPointerScreen = {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        };
      }
      endHeldPointer(event, true);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (endTouchJoystick(event)) return;
      endHeldPointer(event, false);
    };

    const describeGamepad = (gamepad: Gamepad) => {
      const axes = gamepad.axes.map((value) => value.toFixed(2)).join(", ");
      const pressedButtons = gamepad.buttons
        .map((button, index) => (button.pressed ? index : -1))
        .filter((index) => index >= 0)
        .join(", ");

      return `Axes [${axes || "無"}] · Buttons [${pressedButtons || "無"}]`;
    };

    const onGamepadConnected = (event: GamepadEvent) => {
      wasGamepadConnected = true;
      setGamepadConnected(true);
      setGamepadLabel(event.gamepad.id || `Gamepad ${event.gamepad.index + 1}`);
      setGamepadDiagnostic(describeGamepad(event.gamepad));
    };

    const onGamepadDisconnected = () => {
      wasGamepadConnected = false;
      wasGamepadActionPressed = false;
      if (gamepadCursorActive) {
        deactivateGamepadCursor();
        virtualCursorVisible = false;
      }
      setGamepadInputCursorHidden(false);
      setGamepadConnected(false);
      setGamepadLabel(null);
      setGamepadDiagnostic("手把已中斷，請重新連線並按任一按鈕");
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp, { passive: false });
    window.addEventListener("keydown", allowAudioPlaybackRetry);
    window.addEventListener("pointerdown", allowAudioPlaybackRetry, {
      passive: true,
    });
    window.addEventListener("pointerdown", onDialoguePointerDown, {
      capture: true,
      passive: false,
    });
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("pointermove", onPhysicalMouseMove, {
      passive: true,
    });
    window.addEventListener("gamepadconnected", onGamepadConnected);
    window.addEventListener("gamepaddisconnected", onGamepadDisconnected);
    window.addEventListener("echoes:control-bindings-changed", onControlBindingsChanged);
    document.addEventListener("visibilitychange", onVisibilityChange);
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("lostpointercapture", onPointerCancel);
    requestBgmPlayback();

    const drawMap = () => {
      context.fillStyle = "#07121f";
      context.fillRect(0, 0, WORLD.width, WORLD.height);

      if (sceneImage.complete && sceneImage.naturalWidth > 0) {
        context.drawImage(sceneImage, 0, 0, WORLD.width, WORLD.height);
      }
    };

    const drawWorldItemPickups = (time: number) => {
      sceneInteractablesRef.current.forEach((interactable) => {
        if (
          !interactable.position ||
          !interactable.itemId ||
          (interactable.worldItemKind === "placed" &&
            interactable.worldItemId &&
            collectedWorldItemIdsRef.current.has(interactable.worldItemId))
        ) {
          return;
        }

        const item = ITEM_BY_ID.get(interactable.itemId);
        if (!item) return;
        let drawPosition = interactable.position;
        let drawRotation = 0;
        let drawScaleX = 1;
        let drawScaleY = 1;
        if (
          interactable.worldItemKind === "dropped" &&
          interactable.worldItemId
        ) {
          const spawnMotion = worldItemSpawnMotionsRef.current.get(
            interactable.worldItemId,
          );
          if (spawnMotion) {
            const pose = getWorldItemSpawnPose(spawnMotion, time);
            drawPosition = pose.position;
            drawRotation = pose.rotation;
            drawScaleX = pose.scaleX;
            drawScaleY = pose.scaleY;
            if (
              pose.phase !== "flight" &&
              !worldItemLandingAudioPlayedRef.current.has(
                interactable.worldItemId,
              )
            ) {
              worldItemLandingAudioPlayedRef.current.add(
                interactable.worldItemId,
              );
              playOneShotAudio("worldItemLanded");
            }
            if (pose.finished) {
              worldItemSpawnMotionsRef.current.delete(interactable.worldItemId);
              worldItemLandingAudioPlayedRef.current.delete(
                interactable.worldItemId,
              );
            }
          }
        }
        const pulse = 0.82 + Math.sin(time / 420) * 0.12;
        const floatOffset = Math.sin(time / 620) * 2.2;
        context.save();
        context.translate(
          drawPosition.x,
          drawPosition.y + floatOffset,
        );
        context.rotate(drawRotation);
        context.scale(drawScaleX, drawScaleY);
        context.globalAlpha = 0.95;
        context.shadowColor = "#4ddcff";
        context.shadowBlur = 20 * pulse;

        if (item.id === "R0001") {
          context.fillStyle = "rgba(62, 205, 255, 0.96)";
          context.strokeStyle = "#c2f5ff";
          context.lineWidth = 1.5;
          context.beginPath();
          context.moveTo(0, -22);
          context.lineTo(12, -3);
          context.lineTo(6, 17);
          context.lineTo(-8, 13);
          context.lineTo(-13, -4);
          context.closePath();
          context.fill();
          context.stroke();

          context.fillStyle = "rgba(172, 244, 255, 0.72)";
          context.beginPath();
          context.moveTo(0, -18);
          context.lineTo(4, -2);
          context.lineTo(-2, 10);
          context.lineTo(-8, -3);
          context.closePath();
          context.fill();
        } else {
          context.fillStyle = "rgba(32, 57, 62, 0.9)";
          context.beginPath();
          context.arc(0, 0, 19, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#dffefa";
          context.font = "700 22px system-ui";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(item.symbol, 0, 1);
        }

        context.shadowBlur = 0;
        context.fillStyle = "rgba(77, 220, 255, 0.18)";
        context.beginPath();
        context.ellipse(0, 20, 22 * pulse, 7 * pulse, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      });
    };

    const drawInteractionHintPoints = (time: number) => {
      const playerTarget = findInteractableTouching(
        player,
        sizeRef.current * 0.14,
        sceneInteractablesRef.current,
        collectedWorldItemIdsRef.current,
        isInteractableSelectable,
      );
      const nextMobileInteractionTargetId = playerTarget?.id ?? null;
      if (mobileInteractionTargetId !== nextMobileInteractionTargetId) {
        mobileInteractionTargetId = nextMobileInteractionTargetId;
        setMobileInteractionTarget(
          playerTarget
            ? { id: playerTarget.id, label: playerTarget.label }
            : null,
        );
      }
      const activeDialogueTargetId =
        dialoguePlaybackRef.current?.interactable.id ?? null;
      const zoom = getSceneZoom(viewportWidth, viewportHeight);

      sceneInteractablesRef.current.forEach((interactable) => {
        const point = interactable.interactionHintPoint;
        if (!point) return;
        if (
          interactable.worldItemKind === "placed" &&
          interactable.worldItemId &&
          collectedWorldItemIdsRef.current.has(interactable.worldItemId)
        ) {
          return;
        }

        if (!isInteractableConditionActive(interactable)) {
          interactionHintAnimation.delete(interactable.id);
          return;
        }

        if (isInteractableLocked(interactable)) {
          const radius = 8 / zoom;
          context.save();
          context.translate(point.x, point.y);
          context.strokeStyle = "rgba(166, 173, 180, 0.88)";
          context.lineWidth = 3 / zoom;
          context.lineCap = "round";
          context.beginPath();
          context.moveTo(-radius, -radius);
          context.lineTo(radius, radius);
          context.moveTo(radius, -radius);
          context.lineTo(-radius, radius);
          context.stroke();
          context.restore();
          return;
        }

        const animation = interactionHintAnimation.get(interactable.id) ?? {
          opacity: 1,
          emphasis: 0,
          lastTime: time,
        };
        const elapsed = Math.max(0, Math.min(100, time - animation.lastTime));
        const targetOpacity =
          activeDialogueTargetId === interactable.id ? 0 : 1;
        const targetEmphasis =
          playerTarget?.id === interactable.id && targetOpacity > 0 ? 1 : 0;
        if (animation.opacity < targetOpacity) {
          animation.opacity = Math.min(
            targetOpacity,
            animation.opacity + elapsed / 100,
          );
        } else if (animation.opacity > targetOpacity) {
          animation.opacity = Math.max(
            targetOpacity,
            animation.opacity - elapsed / 100,
          );
        }
        if (animation.emphasis < targetEmphasis) {
          animation.emphasis = Math.min(
            targetEmphasis,
            animation.emphasis + elapsed / 100,
          );
        } else if (animation.emphasis > targetEmphasis) {
          animation.emphasis = Math.max(
            targetEmphasis,
            animation.emphasis - elapsed / 100,
          );
        }
        animation.lastTime = time;
        interactionHintAnimation.set(interactable.id, animation);
        if (animation.opacity <= 0.001) return;

        const emphasis =
          animation.emphasis * animation.emphasis *
          (3 - 2 * animation.emphasis);
        const breathing = 1 + Math.sin(time / 420) * 0.08;
        const activePulse = 1 + Math.sin(time / 180) * 0.035;
        const idleRadius = 6.4 * breathing;
        const activeRadius = 7.4 * 1.28 * activePulse;
        const radius =
          (idleRadius + (activeRadius - idleRadius) * emphasis) / zoom;
        const bob = Math.sin(time / 210) * (4 / zoom) * emphasis;
        const fillAlpha = 0.58 + (0.82 - 0.58) * emphasis;
        const outlineAlpha = 0.34 + (0.72 - 0.34) * emphasis;

        context.save();
        context.globalAlpha = animation.opacity;
        context.translate(point.x, point.y + bob);
        context.shadowColor = "rgba(255, 255, 255, 0.82)";
        context.shadowBlur = (12 + (18 - 12) * emphasis) / zoom;
        context.fillStyle = `rgba(255, 255, 255, ${fillAlpha})`;
        context.beginPath();
        context.arc(0, 0, radius, 0, Math.PI * 2);
        context.fill();

        context.shadowBlur = 0;
        context.strokeStyle = `rgba(255, 255, 255, ${outlineAlpha})`;
        context.lineWidth = 1.2 / zoom;
        context.beginPath();
        context.arc(0, 0, radius * 1.85, 0, Math.PI * 2);
        context.stroke();

        const interactionName = interactable.label.trim();
        if (interactionName && emphasis > 0.001) {
          const labelOffset = 50 / zoom;
          context.globalAlpha = animation.opacity * emphasis;
          context.font = `600 ${16 / zoom}px "Microsoft JhengHei UI", system-ui, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "bottom";
          context.lineJoin = "round";
          context.lineWidth = 3 / zoom;
          context.strokeStyle = "rgba(5, 12, 18, 0.82)";
          context.strokeText(interactionName, 0, -labelOffset);
          context.shadowColor = "rgba(255, 255, 255, 0.48)";
          context.shadowBlur = 6 / zoom;
          context.fillStyle = "rgba(255, 255, 255, 0.98)";
          context.fillText(interactionName, 0, -labelOffset);
        }
        context.restore();
      });
    };

    const drawSceneCollision = () => {
      if (!showSceneCollisionRef.current) return;

      context.save();
      context.setLineDash([9, 7]);
      context.lineWidth = 2.5;

      context.fillStyle = "rgba(73, 255, 115, 0.12)";
      context.strokeStyle = "#65ff88";
      NAV_REGIONS.forEach((region) => {
        tracePolygon(context, region);
        context.fill();
        context.stroke();
      });

      context.fillStyle = "rgba(255, 80, 80, 0.16)";
      context.strokeStyle = "#ff6565";
      SCENE_COLLIDERS.forEach((collider) => {
        if (collider.kind === "circle") {
          context.beginPath();
          context.arc(
            collider.x,
            collider.y,
            collider.radius,
            0,
            Math.PI * 2,
          );
        } else {
          tracePolygon(context, collider.points);
        }
        context.fill();
        context.stroke();
      });

      context.fillStyle = "rgba(255, 226, 55, 0.16)";
      context.strokeStyle = "#ffe347";
      sceneInteractablesRef.current.forEach((interactable) => {
        if (
          interactable.worldItemKind === "placed" &&
          interactable.worldItemId &&
          collectedWorldItemIdsRef.current.has(interactable.worldItemId)
        ) {
          return;
        }
        if (!interactable.points || interactable.points.length < 3) return;
        tracePolygon(context, interactable.points);
        context.fill();
        context.stroke();
        getInteractionPoints(interactable).forEach((interactionPoint) => {
          context.beginPath();
          context.arc(interactionPoint.x, interactionPoint.y, 8, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        });
      });

      SCENE_MOVEMENT_GUIDES.forEach((guide) => {
        if (guide.points.length < 2) return;
        context.beginPath();
        context.moveTo(guide.points[0].x, guide.points[0].y);
        guide.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.setLineDash([]);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = guide.width ?? 36;
        context.strokeStyle = "rgba(90, 205, 255, 0.18)";
        context.stroke();

        context.beginPath();
        context.moveTo(guide.points[0].x, guide.points[0].y);
        guide.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.setLineDash([8, 6]);
        context.lineWidth = 2.5;
        context.strokeStyle = "#5cdaff";
        context.stroke();

        const drawArrowhead = (tip: Point, direction: Point) => {
          const size = 13;
          const perpendicular = { x: -direction.y, y: direction.x };
          context.beginPath();
          context.moveTo(tip.x, tip.y);
          context.lineTo(
            tip.x - direction.x * size + perpendicular.x * size * 0.55,
            tip.y - direction.y * size + perpendicular.y * size * 0.55,
          );
          context.lineTo(
            tip.x - direction.x * size - perpendicular.x * size * 0.55,
            tip.y - direction.y * size - perpendicular.y * size * 0.55,
          );
          context.closePath();
          context.fillStyle = "#5cdaff";
          context.fill();
        };
        const first = guide.points[0];
        const second = guide.points[1];
        const last = guide.points[guide.points.length - 1];
        const beforeLast = guide.points[guide.points.length - 2];
        const firstLength = Math.max(Math.hypot(first.x - second.x, first.y - second.y), Number.EPSILON);
        const lastLength = Math.max(Math.hypot(last.x - beforeLast.x, last.y - beforeLast.y), Number.EPSILON);
        drawArrowhead(first, {
          x: (first.x - second.x) / firstLength,
          y: (first.y - second.y) / firstLength,
        });
        drawArrowhead(last, {
          x: (last.x - beforeLast.x) / lastLength,
          y: (last.y - beforeLast.y) / lastLength,
        });
      });

      context.restore();
    };

    const drawPlayer = () => {
      const seWalkSprite =
        currentFacing === "SE" &&
        wasMoving &&
        seWalkSprites.length === SE_WALK_FRAME_SOURCES.length
          ? seWalkSprites[
              Math.floor(seWalkElapsedSeconds * SE_WALK_REFERENCE_FPS) %
                seWalkSprites.length
            ]
          : null;
      const sprite = seWalkSprite ?? sprites.get(currentFacing);
      const renderedHeight = sizeRef.current;
      const radius = renderedHeight * 0.14;

      if (sprite) {
        const renderedWidth =
          renderedHeight * (sprite.width / Math.max(1, sprite.height));
        context.drawImage(
          sprite,
          player.x - renderedWidth / 2,
          player.y - renderedHeight,
          renderedWidth,
          renderedHeight,
        );
      } else {
        context.fillStyle = "#7be0d4";
        context.beginPath();
        context.arc(player.x, player.y - radius, radius, 0, Math.PI * 2);
        context.fill();
      }

      if (showPlayerCollisionRef.current) {
        context.save();
        context.setLineDash([8, 6]);
        context.strokeStyle = "#62e9ff";
        context.lineWidth = 2.5;
        context.beginPath();
        context.arc(
          player.x,
          player.y - radius,
          radius,
          0,
          Math.PI * 2,
        );
        context.stroke();
        context.restore();
      }
    };

    const drawPlayerStatuses = (time: number) => {
      const statuses = getCharacterStatuses(survivalStateRef.current.values);
      if (statuses.length === 0) return;
      const zoom = getSceneZoom(viewportWidth, viewportHeight);
      const fontSize = 14 / zoom;
      const rowHeight = 19 / zoom;
      const pulse = 1 + Math.sin(time / 430) * 0.055;
      context.save();
      context.translate(player.x, player.y - sizeRef.current - 14 / zoom);
      context.scale(pulse, pulse);
      context.font = `700 ${fontSize}px "Segoe UI", "Noto Sans TC", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.lineJoin = "round";
      context.lineWidth = 3 / zoom;
      statuses.forEach((status, index) => {
        const y = -((statuses.length - index - 1) * rowHeight);
        context.globalAlpha = 0.82 + Math.sin(time / 430 + index * 0.8) * 0.15;
        context.strokeStyle = "rgba(5, 12, 17, 0.9)";
        context.strokeText(status.label, 0, y);
        context.fillStyle = status.color;
        context.fillText(status.label, 0, y);
      });
      context.restore();
    };

    const drawTouchEffect = (time: number) => {
      if (!touchEffect) return;

      const elapsed = time - touchEffect.startedAt;
      if (elapsed >= TOUCH_EFFECT_DURATION_MS) {
        touchEffect = null;
        return;
      }

      const progress = clamp(elapsed / TOUCH_EFFECT_DURATION_MS, 0, 1);
      const entranceProgress = clamp(progress / 0.24, 0, 1);
      const entrance = 1 - Math.pow(1 - entranceProgress, 3);
      const fade = 1 - clamp((progress - 0.58) / 0.42, 0, 1);
      const bounce = Math.sin(progress * Math.PI * 4) * 2.5 * (1 - progress);
      const markerY = touchEffect.point.y - 45 + entrance * 23 + bounce;
      const color = touchEffect.reachable ? "#7be0d4" : "#ff7b7b";

      context.save();
      context.globalAlpha = fade;
      context.strokeStyle = color;
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(
        touchEffect.point.x,
        touchEffect.point.y,
        8 + progress * 20,
        0,
        Math.PI * 2,
      );
      context.stroke();

      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.beginPath();
      context.moveTo(touchEffect.point.x - 10, markerY);
      context.lineTo(touchEffect.point.x + 10, markerY);
      context.lineTo(touchEffect.point.x, markerY + 14);
      context.closePath();
      context.fill();
      context.restore();
    };

    const drawTouchJoystick = (time: number) => {
      if (!touchJoystickVisible) return;

      const deltaX = touchJoystick.knob.x - touchJoystick.origin.x;
      const deltaY = touchJoystick.knob.y - touchJoystick.origin.y;
      const distance = Math.hypot(deltaX, deltaY);
      const angle = distance > 0.5 ? Math.atan2(deltaY, deltaX) : -Math.PI / 2;
      const pulse = 1 + Math.sin(time / 180) * 0.025;

      context.save();
      context.translate(touchJoystick.origin.x, touchJoystick.origin.y);
      context.scale(pulse, pulse);
      context.lineWidth = 2;
      context.strokeStyle = "rgba(162, 249, 238, 0.78)";
      context.fillStyle = "rgba(10, 31, 35, 0.3)";
      context.shadowColor = "rgba(89, 231, 216, 0.52)";
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(0, 0, 58, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      context.shadowBlur = 0;
      context.strokeStyle = "rgba(162, 249, 238, 0.27)";
      context.beginPath();
      context.arc(0, 0, 35, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(-58, 0);
      context.lineTo(58, 0);
      context.moveTo(0, -58);
      context.lineTo(0, 58);
      context.stroke();

      context.save();
      context.rotate(angle);
      context.fillStyle = "rgba(121, 244, 229, 0.9)";
      context.strokeStyle = "rgba(228, 255, 250, 0.9)";
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(42, 0);
      context.lineTo(25, -9);
      context.lineTo(28, 0);
      context.lineTo(25, 9);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();

      context.translate(deltaX, deltaY);
      context.fillStyle = "rgba(80, 224, 210, 0.82)";
      context.strokeStyle = "rgba(224, 255, 250, 0.94)";
      context.lineWidth = 2;
      context.shadowColor = "rgba(84, 223, 208, 0.72)";
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(0, 0, 18, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    };

    const drawPointerCursor = (time: number) => {
      if (
        !virtualCursorControlsEnabledRef.current ||
        !virtualCursorVisible
      ) {
        return;
      }

      if (dialoguePlaybackRef.current) {
        const pulse = 1 + Math.sin(time / 190) * 0.035;
        cursorContext.save();
        cursorContext.translate(virtualCursor.x, virtualCursor.y);
        cursorContext.scale(pulse, pulse);
        cursorContext.lineWidth = 2;
        cursorContext.lineJoin = "round";
        cursorContext.strokeStyle = "#e9f4ed";
        cursorContext.fillStyle = "rgba(23, 32, 29, 0.92)";
        cursorContext.shadowColor = "#61ead8";
        cursorContext.shadowBlur = 9;

        cursorContext.beginPath();
        cursorContext.moveTo(0, -11);
        cursorContext.quadraticCurveTo(-8, -16, -18, -13);
        cursorContext.lineTo(-18, 8);
        cursorContext.quadraticCurveTo(-8, 7, 0, 13);
        cursorContext.closePath();
        cursorContext.fill();
        cursorContext.stroke();

        cursorContext.beginPath();
        cursorContext.moveTo(0, -11);
        cursorContext.quadraticCurveTo(8, -16, 18, -13);
        cursorContext.lineTo(18, 8);
        cursorContext.quadraticCurveTo(8, 7, 0, 13);
        cursorContext.closePath();
        cursorContext.fill();
        cursorContext.stroke();

        cursorContext.shadowBlur = 0;
        cursorContext.beginPath();
        cursorContext.moveTo(0, -11);
        cursorContext.lineTo(0, 13);
        cursorContext.stroke();
        cursorContext.fillStyle = "#61ead8";
        for (const x of [25, 31, 37]) {
          cursorContext.beginPath();
          cursorContext.arc(x, 4, 1.7, 0, Math.PI * 2);
          cursorContext.fill();
        }
        cursorContext.restore();
        return;
      }

      const pulse = 1 + Math.sin(time / 150) * 0.07;
      const radius = 13 * pulse;
      cursorContext.save();
      cursorContext.translate(virtualCursor.x, virtualCursor.y);
      cursorContext.strokeStyle = "#80f5e7";
      cursorContext.fillStyle = "rgba(9, 25, 30, 0.86)";
      cursorContext.lineWidth = 2.2;
      cursorContext.shadowColor = "#54dfd0";
      cursorContext.shadowBlur = 11;

      cursorContext.beginPath();
      cursorContext.arc(0, 0, radius, 0, Math.PI * 2);
      cursorContext.fill();
      cursorContext.stroke();

      cursorContext.shadowBlur = 0;
      cursorContext.beginPath();
      cursorContext.moveTo(-radius - 7, 0);
      cursorContext.lineTo(-radius + 2, 0);
      cursorContext.moveTo(radius - 2, 0);
      cursorContext.lineTo(radius + 7, 0);
      cursorContext.moveTo(0, -radius - 7);
      cursorContext.lineTo(0, -radius + 2);
      cursorContext.moveTo(0, radius - 2);
      cursorContext.lineTo(0, radius + 7);
      cursorContext.stroke();

      cursorContext.fillStyle = "#d9fffa";
      cursorContext.beginPath();
      cursorContext.arc(0, 0, 2.6, 0, Math.PI * 2);
      cursorContext.fill();
      cursorContext.restore();
    };

    const drawHeldPointerIndicator = (time: number) => {
      if (!heldPointerContinuous || !heldPointerScreen) return;

      const bob = Math.sin(time / 125) * 2;
      const triangleTop = -39 + bob;
      context.save();
      context.translate(heldPointerScreen.x, heldPointerScreen.y);
      context.fillStyle = "#80f5e7";
      context.shadowColor = "#54dfd0";
      context.shadowBlur = 10;
      context.beginPath();
      context.moveTo(-10, triangleTop);
      context.lineTo(10, triangleTop);
      context.lineTo(0, triangleTop + 14);
      context.closePath();
      context.fill();
      context.restore();
    };

    const drawMouseLeftClickIcon = (
      left: number,
      top: number,
      width = 20,
      height = 25,
    ) => {
      const buttonHeight = height * 0.47;
      context.save();
      context.fillStyle = "#17201d";
      context.strokeStyle = "#f3f7ed";
      context.lineWidth = 1.5;
      context.beginPath();
      context.roundRect(left, top, width, height, 3.5);
      context.fill();
      context.stroke();

      context.fillStyle = "#61ead8";
      context.beginPath();
      context.roundRect(left + 1, top + 1, width / 2 - 1, buttonHeight - 1, [2.5, 0, 0, 0]);
      context.fill();

      context.beginPath();
      context.moveTo(left + width / 2, top);
      context.lineTo(left + width / 2, top + buttonHeight);
      context.moveTo(left, top + buttonHeight);
      context.lineTo(left + width, top + buttonHeight);
      context.stroke();
      context.restore();
    };

    const drawPromptPill = (
      centerX: number,
      topY: number,
      text: string,
      showMouseLeftIcon = false,
    ) => {
      context.save();
      context.font = '600 16px "Segoe UI", "Noto Sans TC", sans-serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      const prefix = showMouseLeftIcon ? "按" : "";
      const mouseIconWidth = showMouseLeftIcon ? 20 : 0;
      const inlineGaps = showMouseLeftIcon ? 18 : 0;
      const contentWidth = showMouseLeftIcon
        ? context.measureText(prefix).width +
          mouseIconWidth +
          inlineGaps +
          context.measureText(text).width
        : context.measureText(text).width;
      const width = Math.max(154, contentWidth + 34);
      const height = 46;
      const left = clamp(centerX - width / 2, 8, viewportWidth - width - 8);
      const top = clamp(topY, 8, viewportHeight - height - 8);
      context.fillStyle = "rgba(45, 58, 45, 0.88)";
      context.strokeStyle = "rgba(239, 250, 230, 0.82)";
      context.lineWidth = 1.2;
      context.beginPath();
      context.roundRect(left, top, width, height, 18);
      context.fill();
      context.stroke();
      context.fillStyle = "#f3f7ed";
      if (showMouseLeftIcon) {
        let cursorX = left + (width - contentWidth) / 2;
        const prefixWidth = context.measureText(prefix).width;
        context.textAlign = "left";
        context.fillText(prefix, cursorX, top + height / 2 + 0.5);
        cursorX += prefixWidth + 7;
        drawMouseLeftClickIcon(cursorX, top + (height - 25) / 2);
        cursorX += mouseIconWidth + 11;
        context.fillText(text, cursorX, top + height / 2 + 0.5);
      } else {
        context.fillText(text, left + width / 2, top + height / 2 + 0.5);
      }
      context.restore();
    };

    const drawInteractionPrompts = () => {
      const radius = sizeRef.current * 0.14;
      const foundPlayerTarget = findInteractableTouching(
        player,
        radius,
        sceneInteractablesRef.current,
        collectedWorldItemIdsRef.current,
        isInteractableSelectable,
      );
      const foundCursorTarget = virtualCursorVisible
        ? findInteractableAt(
            screenToWorld(virtualCursor),
            sceneInteractablesRef.current,
            collectedWorldItemIdsRef.current,
            isInteractableSelectable,
          )
        : null;
      const playerTarget = foundPlayerTarget && !isInteractableLocked(foundPlayerTarget)
        ? foundPlayerTarget
        : null;
      const cursorTarget = foundCursorTarget && !isInteractableLocked(foundCursorTarget)
        ? foundCursorTarget
        : null;
      const playerTargetId = playerTarget?.id ?? null;
      const cursorTargetId = cursorTarget?.id ?? null;

      if (playerTargetId && playerTargetId !== previousPlayerPromptTargetId) {
        activePromptOwner = "player";
      }
      if (cursorTargetId && cursorTargetId !== previousCursorPromptTargetId) {
        activePromptOwner = "cursor";
      }

      if (activePromptOwner === "player" && !playerTarget) {
        activePromptOwner = cursorTarget ? "cursor" : null;
      } else if (activePromptOwner === "cursor" && !cursorTarget) {
        activePromptOwner = playerTarget ? "player" : null;
      } else if (!activePromptOwner) {
        activePromptOwner = cursorTarget ? "cursor" : playerTarget ? "player" : null;
      }

      previousPlayerPromptTargetId = playerTargetId;
      previousCursorPromptTargetId = cursorTargetId;
      activePromptTargetId =
        activePromptOwner === "player"
          ? playerTargetId
          : activePromptOwner === "cursor"
            ? cursorTargetId
            : null;
      if (dialoguePlaybackRef.current) return;

      if (activePromptOwner === "player" && playerTarget) {
        const zoom = getSceneZoom(viewportWidth, viewportHeight);
        const screenX = viewportWidth / 2 + (player.x - camera.x) * zoom;
        const screenY = viewportHeight / 2 + (player.y - camera.y) * zoom;
        drawPromptPill(
          screenX,
          screenY + 18,
          `按 [${activeInteractionKeyLabel}] 進行${playerTarget.verb ?? "互動"}`,
        );
      }

      if (activePromptOwner === "cursor" && cursorTarget) {
        if (activeInputMode === "gamepad") {
          drawPromptPill(
            virtualCursor.x,
            virtualCursor.y - 64,
            `按 [A] 進行${cursorTarget.verb ?? "互動"}`,
          );
        } else {
          drawPromptPill(
            virtualCursor.x,
            virtualCursor.y - 64,
            `進行${cursorTarget.verb ?? "互動"}`,
            true,
          );
        }
      }
    };

    const updateFootstepAudio = (
      movementSpeed: number,
      deltaTime: number,
    ) => {
      if (movementSpeed < FOOTSTEP_MIN_MOVEMENT_SPEED || document.hidden) {
        stopFootsteps();
        return;
      }

      footstepShouldPlay = true;
      const targetPlaybackRate = clamp(
        (movementSpeed / FOOTSTEP_REFERENCE_SPEED) *
          FOOTSTEP_REFERENCE_PLAYBACK_RATE,
        0.5,
        3.2,
      );
      const playbackRateSmoothing = 1 - Math.exp(-deltaTime * 9);
      footstepPlaybackRate +=
        (targetPlaybackRate - footstepPlaybackRate) * playbackRateSmoothing;
      footstepAudio.playbackRate = footstepPlaybackRate;
      requestFootstepPlayback();
    };

    const update = (deltaTime: number) => {
      const movementStart = { x: player.x, y: player.y };
      const effectiveMovementSpeed =
        speedRef.current *
        getSurvivalSpeedMultiplier(survivalStateRef.current.values);
      const keyboardHorizontal =
        Number(pressedKeys.has("d") || pressedKeys.has("arrowright")) -
        Number(pressedKeys.has("a") || pressedKeys.has("arrowleft"));
      const keyboardVertical =
        Number(pressedKeys.has("s") || pressedKeys.has("arrowdown")) -
        Number(pressedKeys.has("w") || pressedKeys.has("arrowup"));

      if (heldPointerScreen) {
        heldPointerDuration += deltaTime;
        if (
          !heldPointerContinuous &&
          heldPointerDuration >= POINTER_HOLD_INDICATOR_DELAY_SECONDS
        ) {
          heldPointerContinuous = true;
          touchEffect = null;
        }

        heldPointerRetargetElapsed += deltaTime;
        if (
          heldPointerRetargetElapsed >= POINTER_RETARGET_INTERVAL_SECONDS
        ) {
          heldPointerRetargetElapsed = 0;
          assignHeldPointerAction(false);
        }
      }

      const browserGamepadInput = getGamepadInput();
      const nativeGamepadInput = getNativeGamepadInput(
        nativeGamepadRef.current,
      );
      const gamepadInput = browserGamepadInput.connected
        ? browserGamepadInput
        : nativeGamepadInput;
      const hasGamepadActivity =
        Math.abs(gamepadInput.stickX) > 0.01 ||
        Math.abs(gamepadInput.stickY) > 0.01 ||
        Math.abs(gamepadInput.cursorX) > 0.01 ||
        Math.abs(gamepadInput.cursorY) > 0.01 ||
        Math.abs(gamepadInput.dpadX) > 0.01 ||
        Math.abs(gamepadInput.dpadY) > 0.01 ||
        gamepadInput.actionPressed ||
        gamepadInput.confirmPressed ||
        gamepadInput.secondaryActionPressed ||
        gamepadInput.hotbarUsePressed ||
        gamepadInput.backPressed ||
        gamepadInput.startPressed ||
        gamepadInput.leftBumperPressed ||
        gamepadInput.rightBumperPressed;
      if (gamepadInput.connected && hasGamepadActivity) {
        activeInputMode = "gamepad";
        activateQuestPromptInputMode("gamepad");
      }
      if (!virtualCursorControlsEnabledRef.current && gamepadCursorActive) {
        deactivateGamepadCursor();
        virtualCursorVisible = false;
      }
      setGamepadInputCursorHidden(
        !virtualCursorControlsEnabledRef.current &&
          gamepadInput.connected &&
          hasGamepadActivity,
      );
      activeInteractionKeyLabel =
        activeInputMode === "gamepad" ? "A" : keyboardInteractionLabel;

      if (gamepadInput.connected !== wasGamepadConnected) {
        wasGamepadConnected = gamepadInput.connected;
        if (!gamepadInput.connected) {
          wasGamepadActionPressed = false;
          wasGamepadBackPressed = false;
          wasGamepadConfirmPressed = false;
          wasGamepadSecondaryActionPressed = false;
          wasGamepadHotbarUsePressed = false;
          wasGamepadStartPressed = false;
          wasGamepadLeftBumperPressed = false;
          wasGamepadRightBumperPressed = false;
          heldGamepadDpadX = 0;
          heldGamepadDpadY = 0;
          gamepadDpadXRepeatSeconds = 0;
          gamepadDpadYRepeatSeconds = 0;
          gameplayHotbarDpadX = 0;
        }
        setGamepadConnected(gamepadInput.connected);
        setGamepadLabel(gamepadInput.label);

        if (!gamepadInput.connected) {
          if (gamepadCursorActive) {
            deactivateGamepadCursor();
            virtualCursorVisible = false;
          }
          setGamepadInputCursorHidden(false);
          lastGamepadDiagnostic = "";
          setGamepadDiagnostic("等待手把輸入…");
        }
      }

      const cursorInputLength = Math.hypot(
        gamepadInput.cursorX,
        gamepadInput.cursorY,
      );
      if (
        virtualCursorControlsEnabledRef.current &&
        gamepadInput.connected &&
        cursorInputLength > 0
      ) {
        if (optionsOpenRef.current) {
          optionsGamepadModeRef.current = "cursor";
        } else if (inventoryOpenRef.current) {
          inventoryGamepadModeRef.current = "cursor";
        }
        activateGamepadCursor();
        const marginX = Math.min(16, viewportWidth / 2);
        const marginY = Math.min(16, viewportHeight / 2);
        virtualCursor.x = clamp(
          virtualCursor.x +
            gamepadInput.cursorX * GAMEPAD_CURSOR_SPEED * deltaTime,
          marginX,
          viewportWidth - marginX,
        );
        virtualCursor.y = clamp(
          virtualCursor.y +
            gamepadInput.cursorY * GAMEPAD_CURSOR_SPEED * deltaTime,
          marginY,
          viewportHeight - marginY,
        );
      }

      const startJustPressed =
        gamepadInput.connected &&
        gamepadInput.startPressed &&
        !wasGamepadStartPressed;
      if (startJustPressed && !timePassInputLockedRef.current) {
        toggleOptionsPanel();
      }
      wasGamepadStartPressed = gamepadInput.startPressed;

      const backJustPressed =
        gamepadInput.connected &&
        gamepadInput.backPressed &&
        !wasGamepadBackPressed;
      if (
        backJustPressed &&
        storyFlowActiveRef.current &&
        !timePassInputLockedRef.current &&
        !optionsOpenRef.current
      ) {
        beginStorySkipHold("gamepad");
      }
      if (
        !gamepadInput.backPressed &&
        wasGamepadBackPressed &&
        storySkipHoldRef.current?.source === "gamepad"
      ) {
        cancelStorySkipHold();
      }
      const leftBumperJustPressed =
        gamepadInput.connected &&
        gamepadInput.leftBumperPressed &&
        !wasGamepadLeftBumperPressed;
      const rightBumperJustPressed =
        gamepadInput.connected &&
        gamepadInput.rightBumperPressed &&
        !wasGamepadRightBumperPressed;
      let optionsMenuOpen = optionsOpenRef.current;
      if (optionsMenuOpen && backJustPressed) {
        if (restartConfirmationOpenRef.current) {
          closeRestartConfirmation();
        } else {
          setOptionsPanelOpen(false);
          optionsMenuOpen = false;
        }
      } else if (
        backJustPressed &&
        !timePassInputLockedRef.current &&
        !storyInputLockedRef.current &&
        !dialoguePlaybackRef.current
      ) {
        setInventoryPanelOpen(!inventoryOpenRef.current);
      }
      const inventoryMenuOpen = inventoryOpenRef.current;

      if (!optionsMenuOpen && !inventoryMenuOpen) {
        heldGamepadDpadX = 0;
        heldGamepadDpadY = 0;
        gamepadDpadXRepeatSeconds = 0;
        gamepadDpadYRepeatSeconds = 0;
      }
      if (optionsMenuOpen) {
        gameplayHotbarDpadX = 0;
        if (leftBumperJustPressed) {
          activateOptionsDpadMode();
          changeOptionsTab(-1);
        }
        if (rightBumperJustPressed) {
          activateOptionsDpadMode();
          changeOptionsTab(1);
        }

        const dpadVertical = Math.sign(gamepadInput.dpadY);
        if (dpadVertical === 0) {
          heldGamepadDpadY = 0;
          gamepadDpadYRepeatSeconds = 0;
        } else if (dpadVertical !== heldGamepadDpadY) {
          activateOptionsDpadMode();
          heldGamepadDpadY = dpadVertical;
          gamepadDpadYRepeatSeconds = GAMEPAD_MENU_REPEAT_DELAY_SECONDS;
          moveOptionsMenuSelection(dpadVertical);
        } else {
          gamepadDpadYRepeatSeconds -= deltaTime;
          if (gamepadDpadYRepeatSeconds <= 0) {
            activateOptionsDpadMode();
            moveOptionsMenuSelection(dpadVertical);
            gamepadDpadYRepeatSeconds += GAMEPAD_MENU_REPEAT_INTERVAL_SECONDS;
          }
        }

        const dpadHorizontal = Math.sign(gamepadInput.dpadX);
        if (dpadHorizontal === 0) {
          heldGamepadDpadX = 0;
          gamepadDpadXRepeatSeconds = 0;
        } else if (dpadHorizontal !== heldGamepadDpadX) {
          activateOptionsDpadMode();
          heldGamepadDpadX = dpadHorizontal;
          gamepadDpadXRepeatSeconds = GAMEPAD_MENU_REPEAT_DELAY_SECONDS;
          adjustOptionsMenuSelection(dpadHorizontal);
        } else {
          gamepadDpadXRepeatSeconds -= deltaTime;
          if (gamepadDpadXRepeatSeconds <= 0) {
            activateOptionsDpadMode();
            adjustOptionsMenuSelection(dpadHorizontal);
            gamepadDpadXRepeatSeconds += GAMEPAD_MENU_REPEAT_INTERVAL_SECONDS;
          }
        }

        if (
          gamepadInput.confirmPressed &&
          !wasGamepadConfirmPressed
        ) {
          if (shouldUseOptionsCursor(optionsGamepadModeRef.current)) {
            activateVirtualCursorUi();
          } else {
            activateOptionsMenuSelection();
          }
        }

        if (
          gamepadInput.connected &&
          gamepadInput.secondaryActionPressed &&
          !wasGamepadSecondaryActionPressed
        ) {
          activateVirtualCursorUi();
        }
      } else if (inventoryMenuOpen) {
        gameplayHotbarDpadX = 0;
        if (leftBumperJustPressed) {
          activateInventoryDpadMode();
          changeInventoryCategoryByOffset(
            getInventoryCategoryOffsetForBumper("LB"),
          );
        }
        if (rightBumperJustPressed) {
          activateInventoryDpadMode();
          changeInventoryCategoryByOffset(
            getInventoryCategoryOffsetForBumper("RB"),
          );
        }

        const dpadVertical = Math.sign(gamepadInput.dpadY);
        if (dpadVertical === 0) {
          heldGamepadDpadY = 0;
          gamepadDpadYRepeatSeconds = 0;
        } else if (dpadVertical !== heldGamepadDpadY) {
          activateInventoryDpadMode();
          heldGamepadDpadY = dpadVertical;
          gamepadDpadYRepeatSeconds = GAMEPAD_MENU_REPEAT_DELAY_SECONDS;
          moveInventorySelection(0, dpadVertical);
        } else {
          gamepadDpadYRepeatSeconds -= deltaTime;
          if (gamepadDpadYRepeatSeconds <= 0) {
            activateInventoryDpadMode();
            moveInventorySelection(0, dpadVertical);
            gamepadDpadYRepeatSeconds += GAMEPAD_MENU_REPEAT_INTERVAL_SECONDS;
          }
        }

        const dpadHorizontal = Math.sign(gamepadInput.dpadX);
        if (dpadHorizontal === 0) {
          heldGamepadDpadX = 0;
          gamepadDpadXRepeatSeconds = 0;
        } else if (dpadHorizontal !== heldGamepadDpadX) {
          activateInventoryDpadMode();
          heldGamepadDpadX = dpadHorizontal;
          gamepadDpadXRepeatSeconds = GAMEPAD_MENU_REPEAT_DELAY_SECONDS;
          moveInventorySelection(dpadHorizontal, 0);
        } else {
          gamepadDpadXRepeatSeconds -= deltaTime;
          if (gamepadDpadXRepeatSeconds <= 0) {
            activateInventoryDpadMode();
            moveInventorySelection(dpadHorizontal, 0);
            gamepadDpadXRepeatSeconds += GAMEPAD_MENU_REPEAT_INTERVAL_SECONDS;
          }
        }

        if (
          gamepadInput.connected &&
          gamepadInput.confirmPressed &&
          !wasGamepadConfirmPressed
        ) {
          if (inventoryGamepadModeRef.current === "cursor") {
            const hoveredInventoryIndex = getVirtualCursorInventoryIndex();
            if (hoveredInventoryIndex !== null) {
              activateInventoryItem(hoveredInventoryIndex);
            } else {
              activateVirtualCursorUi();
            }
          } else {
            activateInventoryItem(selectedInventoryIndexRef.current);
          }
        }
      } else {
        const canToggleGameplayHud =
          !storyInputLockedRef.current &&
          !timePassInputLockedRef.current &&
          !dialoguePlaybackRef.current;
        if (canToggleGameplayHud && leftBumperJustPressed) {
          toggleSurvivalPanel();
        }
        if (canToggleGameplayHud && rightBumperJustPressed) {
          toggleQuestPanel();
        }

        const hotbarDpadHorizontal = Math.sign(gamepadInput.dpadX);
        if (
          !storyInputLockedRef.current &&
          !timePassInputLockedRef.current &&
          hotbarDpadHorizontal !== 0 &&
          gameplayHotbarDpadX === 0
        ) {
          selectHotbarSlot(hotbarDpadHorizontal);
        }
        gameplayHotbarDpadX = hotbarDpadHorizontal;

        if (
          !storyInputLockedRef.current &&
          !timePassInputLockedRef.current &&
          gamepadInput.connected &&
          gamepadInput.hotbarUsePressed &&
          !wasGamepadHotbarUsePressed
        ) {
          hideHotbarSelectionHint();
          activateHotbarItem(activeHotbarSlotRef.current);
        }

        if (
          !startJustPressed &&
          !timePassInputLockedRef.current &&
          gamepadInput.connected &&
          gamepadInput.actionPressed &&
          !wasGamepadActionPressed
        ) {
          if (storyInputLockedRef.current) {
            advanceDialogue();
          } else {
            const uiResult = activateVirtualCursorUi();
            if (uiResult === "none") {
              if (virtualCursorControlsEnabledRef.current) activateGamepadCursor();
              activateBestInteraction("gamepad");
            }
          }
        }
      }

      wasGamepadConfirmPressed = gamepadInput.confirmPressed;
      wasGamepadBackPressed = gamepadInput.backPressed;
      wasGamepadLeftBumperPressed = gamepadInput.leftBumperPressed;
      wasGamepadRightBumperPressed = gamepadInput.rightBumperPressed;
      wasGamepadSecondaryActionPressed = gamepadInput.secondaryActionPressed;
      wasGamepadHotbarUsePressed = gamepadInput.hotbarUsePressed;
      wasGamepadActionPressed = gamepadInput.actionPressed;

      gamepadDiagnosticElapsed += deltaTime;
      if (gamepadInput.connected && gamepadDiagnosticElapsed >= 0.15) {
        gamepadDiagnosticElapsed = 0;
        const diagnostic = gamepadInput.gamepad
          ? describeGamepad(gamepadInput.gamepad)
          : gamepadInput.diagnostic;

        if (diagnostic && diagnostic !== lastGamepadDiagnostic) {
          lastGamepadDiagnostic = diagnostic;
          setGamepadDiagnostic(diagnostic);
        }
      }

      const gamepadMovementX = gamepadInput.stickX;
      const gamepadMovementY = gamepadInput.stickY;
      let horizontal = clamp(
        keyboardHorizontal + gamepadMovementX + touchJoystick.input.x,
        -1,
        1,
      );
      let vertical = clamp(
        keyboardVertical + gamepadMovementY + touchJoystick.input.y,
        -1,
        1,
      );
      if (
        storyInputLockedRef.current ||
        timePassInputLockedRef.current ||
        dialoguePlaybackRef.current ||
        inventoryOpenRef.current ||
        debugItemSpawnerOpenRef.current ||
        survivalStateRef.current.gameOverReason
      ) {
        horizontal = 0;
        vertical = 0;
        autoPath = [];
        autoDestination = null;
        pendingInteraction = null;
        lockedAutoMovementGuideId = null;
        bypassedAutoMovementGuideId = null;
      }
      let inputLength = Math.hypot(horizontal, vertical);
      let inputStrength = Math.min(1, inputLength);
      let followingAutoPath = false;

      if (inputLength > 0) {
        autoPath = [];
        autoDestination = null;
        pendingInteraction = null;
        movementGuideSuppressedForPendingInteraction = false;
        lockedAutoMovementGuideId = null;
        bypassedAutoMovementGuideId = null;
      } else {
        while (autoPath.length > 0) {
          const waypoint = autoPath[0];
          const distanceToWaypoint = Math.hypot(
            waypoint.x - player.x,
            waypoint.y - player.y,
          );

          if (distanceToWaypoint <= 2) {
            player.x = waypoint.x;
            player.y = waypoint.y;
            autoPath.shift();
            continue;
          }

          horizontal = (waypoint.x - player.x) / distanceToWaypoint;
          vertical = (waypoint.y - player.y) / distanceToWaypoint;
          inputLength = 1;
          followingAutoPath = true;
          inputStrength = Math.min(
            1,
            distanceToWaypoint /
              Math.max(effectiveMovementSpeed * deltaTime, Number.EPSILON),
          );
          break;
        }

        if (autoPath.length === 0) completePendingInteraction();
      }

      if (inputLength > 0) {
        const guideRadius = sizeRef.current * 0.14;
        const pendingInteractionPoint = pendingInteraction?.interactionPoint;
        if (
          pendingInteractionPoint &&
          Math.hypot(
            player.x - pendingInteractionPoint.x,
            player.y - pendingInteractionPoint.y,
          ) <= (pendingInteraction?.interactable.activationDistance ?? 52)
        ) {
          movementGuideSuppressedForPendingInteraction = true;
        }
        if (!pendingInteraction) {
          movementGuideSuppressedForPendingInteraction = false;
        }
        let guideContact = movementGuideSuppressedForPendingInteraction
          ? null
          : getMovementGuideContact(player, guideRadius);
        if (bypassedAutoMovementGuideId) {
          if (guideContact?.guide.id === bypassedAutoMovementGuideId) {
            guideContact = null;
          } else {
            bypassedAutoMovementGuideId = null;
          }
        }
        if (guideContact) {
          const normalizedInput = {
            x: horizontal / inputLength,
            y: vertical / inputLength,
          };
          const inputDot =
            normalizedInput.x * guideContact.tangent.x +
            normalizedInput.y * guideContact.tangent.y;
          if (followingAutoPath) {
            if (lockedAutoMovementGuideId !== guideContact.guide.id) {
              const finalTarget =
                autoDestination ?? autoPath[autoPath.length - 1];
              const finalTargetDot = finalTarget
                ? (finalTarget.x - player.x) * guideContact.tangent.x +
                  (finalTarget.y - player.y) * guideContact.tangent.y
                : 0;
              if (Math.abs(finalTargetDot) > 0.08) {
                lastMovementGuideSign = Math.sign(finalTargetDot);
              } else if (Math.abs(inputDot) > 0.08) {
                lastMovementGuideSign = Math.sign(inputDot);
              } else {
                const facingVector = getDirectionVector(currentFacing);
                const facingDot =
                  facingVector.x * guideContact.tangent.x +
                  facingVector.y * guideContact.tangent.y;
                if (Math.abs(facingDot) > 0.08) {
                  lastMovementGuideSign = Math.sign(facingDot);
                }
              }
              lockedAutoMovementGuideId = guideContact.guide.id;
            }
          } else {
            lockedAutoMovementGuideId = null;
            if (Math.abs(inputDot) > 0.08) {
              lastMovementGuideSign = Math.sign(inputDot);
            } else {
              const facingVector = getDirectionVector(currentFacing);
              const facingDot =
                facingVector.x * guideContact.tangent.x +
                facingVector.y * guideContact.tangent.y;
              if (Math.abs(facingDot) > 0.08) {
                lastMovementGuideSign = Math.sign(facingDot);
              }
            }
          }

          let releasedAtGuideEndpoint = false;
          if (
            followingAutoPath &&
            lockedAutoMovementGuideId === guideContact.guide.id &&
            autoDestination
          ) {
            const guideExit =
              lastMovementGuideSign >= 0
                ? guideContact.guide.points[guideContact.guide.points.length - 1]
                : guideContact.guide.points[0];
            const exitDistance = Math.hypot(
              guideExit.x - player.x,
              guideExit.y - player.y,
            );
            const exitReleaseDistance = Math.max(
              8,
              Math.min(18, guideRadius * 0.6),
            );
            if (exitDistance <= exitReleaseDistance) {
              const pickupApproach =
                pendingInteraction?.interactable.type === "pickup"
                  ? findReachablePickupApproach(
                      pendingInteraction.interactable,
                      pendingInteraction.repathAttempts ?? 0,
                    )
                  : null;
              const replannedPath = pickupApproach?.path ?? (
                pendingInteraction?.interactionPoint
                  ? findReachableInteractionPath(autoDestination)
                  : findPath(player, autoDestination, guideRadius)
              );
              autoPath = replannedPath ?? [];
              if (pickupApproach) {
                autoDestination = pickupApproach.destination;
              }
              bypassedAutoMovementGuideId = guideContact.guide.id;
              lockedAutoMovementGuideId = null;
              horizontal = 0;
              vertical = 0;
              inputLength = 0;
              releasedAtGuideEndpoint = true;
            }
          }

          if (!releasedAtGuideEndpoint) {
            const toLineX = guideContact.nearest.x - player.x;
            const toLineY = guideContact.nearest.y - player.y;
            const alongLine =
              toLineX * guideContact.tangent.x +
              toLineY * guideContact.tangent.y;
            const perpendicularX =
              toLineX - guideContact.tangent.x * alongLine;
            const perpendicularY =
              toLineY - guideContact.tangent.y * alongLine;
            const perpendicularDistance = Math.hypot(perpendicularX, perpendicularY);
            const centeringStrength = clamp(
              perpendicularDistance / Math.max((guideContact.guide.width ?? 36) / 2, 1),
              0,
              1,
            ) * 0.32;
            const correctionX =
              perpendicularDistance > 0.001
                ? (perpendicularX / perpendicularDistance) * centeringStrength
                : 0;
            const correctionY =
              perpendicularDistance > 0.001
                ? (perpendicularY / perpendicularDistance) * centeringStrength
                : 0;
            horizontal =
              guideContact.tangent.x * lastMovementGuideSign + correctionX;
            vertical =
              guideContact.tangent.y * lastMovementGuideSign + correctionY;
            inputLength = Math.hypot(horizontal, vertical);
          }
        } else {
          lockedAutoMovementGuideId = null;
        }
      }

      const isMoving = inputLength > 0;

      if (isMoving) {
        const velocityX = horizontal / inputLength;
        const velocityY = vertical / inputLength;
        const distance = effectiveMovementSpeed * deltaTime * inputStrength;
        const radius = sizeRef.current * 0.14;
        const desiredPosition = {
          x: player.x + velocityX * distance,
          y: player.y + velocityY * distance,
        };
        const startX = player.x;
        const startY = player.y;

        currentFacing = getDirection(horizontal, vertical);

        if (isWalkable(desiredPosition, radius)) {
          player.x = desiredPosition.x;
          player.y = desiredPosition.y;
        } else {
          if (Math.abs(velocityX) > 0.001) {
            const nextX = {
              x: player.x + velocityX * distance,
              y: player.y,
            };
            if (isWalkable(nextX, radius)) player.x = nextX.x;
          }

          if (Math.abs(velocityY) > 0.001) {
            const nextY = {
              x: player.x,
              y: player.y + velocityY * distance,
            };
            if (isWalkable(nextY, radius)) player.y = nextY.y;
          }

          const movedDistance = Math.hypot(
            player.x - startX,
            player.y - startY,
          );

          if (movedDistance < distance * 0.2) {
            const slidePosition = getCollisionSlidePosition(
              { x: startX, y: startY },
              desiredPosition,
              radius,
              { x: velocityX, y: velocityY },
              distance,
              collisionSlideToleranceRef.current,
            );

            if (slidePosition) {
              player.x = slidePosition.x;
              player.y = slidePosition.y;
            }
          }
        }
      }

      if (
        pendingInteraction?.interactable.type === "pickup" &&
        isTouchingInteractable(
          player,
          sizeRef.current * 0.14,
          pendingInteraction.interactable,
        )
      ) {
        autoPath = [];
        completePendingInteraction();
      }

      const actualMovementDistance = Math.hypot(
        player.x - movementStart.x,
        player.y - movementStart.y,
      );
      const actualMovementSpeed =
        actualMovementDistance / Math.max(deltaTime, Number.EPSILON);
      const isActuallyMoving =
        actualMovementSpeed >= FOOTSTEP_MIN_MOVEMENT_SPEED;
      if (isActuallyMoving && currentFacing === "SE") {
        seWalkElapsedSeconds +=
          deltaTime *
          clamp(actualMovementSpeed / FOOTSTEP_REFERENCE_SPEED, 0.55, 1.75);
      } else {
        seWalkElapsedSeconds = 0;
      }
      updateFootstepAudio(actualMovementSpeed, deltaTime);

      const survivalPaused =
        survivalFlowPausedRef.current ||
        storyFlowActiveRef.current ||
        optionsOpenRef.current ||
        inventoryOpenRef.current ||
        debugItemSpawnerOpenRef.current ||
        Boolean(dialoguePlaybackRef.current);
      if (!survivalPaused && !survivalStateRef.current.gameOverReason) {
        const previousSurvivalValues = survivalStateRef.current.values;
        const nextSurvivalState = advanceSurvivalState(
          survivalStateRef.current,
          deltaTime,
          actualMovementDistance,
          actualMovementSpeed,
        );
        const touchingStorySurvivalConditionBecameEligible =
          SCENE_STORY_TRIGGERS.some((zone) => {
            if (!activeStoryTriggerZoneIds.has(zone.id)) return false;
            const wasEligible = getUnmetSurvivalRequirements(
              previousSurvivalValues,
              zone.survivalRequirements,
            ).length === 0;
            const isEligible = getUnmetSurvivalRequirements(
              nextSurvivalState.values,
              zone.survivalRequirements,
            ).length === 0;
            return !wasEligible && isEligible;
          });
        survivalStateRef.current = nextSurvivalState;
        if (touchingStorySurvivalConditionBecameEligible) {
          requestStoryTriggerContactCheckRef.current();
        }
        refreshInteractionUsageCycle();
      }
      survivalUiElapsed += deltaTime;
      survivalSaveElapsed += deltaTime;
      if (survivalUiElapsed >= 0.12) {
        survivalUiElapsed = 0;
        setSurvivalState({
          ...survivalStateRef.current,
          values: { ...survivalStateRef.current.values },
          zeroDurationMinutes: {
            ...survivalStateRef.current.zeroDurationMinutes,
          },
        });
      }
      if (survivalSaveElapsed >= 1) {
        survivalSaveElapsed = 0;
        saveSurvivalState(survivalStateRef.current);
        saveInteractionUsageState(interactionUsageRef.current);
      }

      if (isActuallyMoving !== wasMoving) {
        wasMoving = isActuallyMoving;
        setMoving(isActuallyMoving);
      }

      setFacing((previous) =>
        previous === currentFacing ? previous : currentFacing,
      );
      playerPositionRef.current.x = player.x;
      playerPositionRef.current.y = player.y;
      playerFacingRef.current = currentFacing;
      if (!storyInputLockedRef.current) {
        const shouldRecheckTouchingStoryTriggers =
          storyTriggerContactCheckRequested;
        storyTriggerContactCheckRequested = false;
        const enteredNow = new Set<string>();
        for (const zone of SCENE_STORY_TRIGGERS) {
          if (!pointInPolygon(player, zone.points)) continue;
          enteredNow.add(zone.id);
          const wasTouching = activeStoryTriggerZoneIds.has(zone.id);
          if (!wasTouching || shouldRecheckTouchingStoryTriggers) {
            const wasEligible = eligibleStoryTriggerZoneIds.has(zone.id);
            const isEligible = canActivateStoryTriggerRef.current(zone);
            if (isEligible) {
              eligibleStoryTriggerZoneIds.add(zone.id);
            } else {
              eligibleStoryTriggerZoneIds.delete(zone.id);
            }
            if (!isEligible || wasEligible) continue;
            void storyEventManagerRef.current?.emit("storyZoneEntered", {
              zoneId: zone.id,
            });
          }
        }
        activeStoryTriggerZoneIds.clear();
        enteredNow.forEach((id) => activeStoryTriggerZoneIds.add(id));
        for (const zoneId of [...eligibleStoryTriggerZoneIds]) {
          if (!enteredNow.has(zoneId)) {
            eligibleStoryTriggerZoneIds.delete(zoneId);
          }
        }
      }
      minimapSyncElapsed += deltaTime;
      if (
        minimapPlayerMarker &&
        minimapSyncElapsed >= 1 / 30 &&
        (!Number.isFinite(lastMinimapPlayerX) ||
          Math.hypot(
            player.x - lastMinimapPlayerX,
            player.y - lastMinimapPlayerY,
          ) >= 0.5)
      ) {
        minimapSyncElapsed = 0;
        lastMinimapPlayerX = player.x;
        lastMinimapPlayerY = player.y;
        minimapPlayerMarker.style.left = `${clamp(player.x / WORLD.width, 0, 1) * 100}%`;
        minimapPlayerMarker.style.top = `${clamp(player.y / WORLD.height, 0, 1) * 100}%`;
      }

      const zoom = getSceneZoom(viewportWidth, viewportHeight);
      const desiredCameraX = getCameraCoordinate(
        player.x,
        viewportWidth,
        WORLD.width,
        zoom,
      );
      const desiredCameraY = getCameraCoordinate(
        player.y,
        viewportHeight,
        WORLD.height,
        zoom,
      );
      const cameraFollow = 1 - Math.exp(-8 * deltaTime);
      camera.x += (desiredCameraX - camera.x) * cameraFollow;
      camera.y += (desiredCameraY - camera.y) * cameraFollow;
    };

    const render = (time: number) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const zoom = getSceneZoom(viewportWidth, viewportHeight);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      cursorContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      cursorContext.clearRect(0, 0, viewportWidth, viewportHeight);
      context.clearRect(0, 0, viewportWidth, viewportHeight);
      context.fillStyle = "#06101b";
      context.fillRect(0, 0, viewportWidth, viewportHeight);

      context.save();
      context.translate(viewportWidth / 2, viewportHeight / 2);
      context.scale(zoom, zoom);
      context.translate(-camera.x, -camera.y);
      drawMap();
      drawWorldItemPickups(time);
      drawSceneCollision();
      drawPlayer();
      drawInteractionHintPoints(time);
      drawPlayerStatuses(time);
      drawTouchEffect(time);
      context.restore();
      drawHeldPointerIndicator(time);
      drawTouchJoystick(time);
      drawPointerCursor(time);
      drawInteractionPrompts();
    };

    const frame = (time: number) => {
      const deltaTime = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;
      update(deltaTime);
      render(time);
      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);

    return () => {
      saveSurvivalState(survivalStateRef.current);
      saveInteractionUsageState(interactionUsageRef.current);
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", allowAudioPlaybackRetry);
      window.removeEventListener("pointerdown", allowAudioPlaybackRetry);
      window.removeEventListener("pointerdown", onDialoguePointerDown, true);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("pointermove", onPhysicalMouseMove);
      window.removeEventListener("gamepadconnected", onGamepadConnected);
      window.removeEventListener("gamepaddisconnected", onGamepadDisconnected);
      window.removeEventListener("echoes:control-bindings-changed", onControlBindingsChanged);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onPointerCancel);
      bgmDisposed = true;
      requestBgmPlaybackRef.current = () => {};
      debugItemSpawnHandlerRef.current = () => false;
      mobileInteractionActionRef.current = () => {};
      canActivateStoryTriggerRef.current = () => false;
      completeStoryTriggerRef.current = () => false;
      requestStoryTriggerContactCheckRef.current = () => {};
      if (playerTeleportHandlerRef.current === teleportPlayer) {
        playerTeleportHandlerRef.current = () => false;
      }
      stopFootsteps();
      stopDialogueTyping();
      if (interactionFeedbackTimer !== null) {
        window.clearTimeout(interactionFeedbackTimer);
      }
      setInteractionJustTriggered(false);
      audioEvents.dispose();
      if (audioEventManagerRef.current === audioEvents) {
        audioEventManagerRef.current = null;
      }
      document.documentElement.classList.remove("gamepad-cursor-active");
      document.documentElement.classList.remove("gamepad-input-active");
      document.documentElement.classList.remove("dialogue-cursor-active");
    };
    // The canvas simulation must be initialized once; gamepad actions use refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ownedInventoryItems = getOwnedItemStacks(playerInventory);
  const filteredInventoryItems = ownedInventoryItems
    .filter(
      (stack) =>
        inventoryCategory === "all" ||
        stack.definition.category === inventoryCategory,
    )
    .map((stack) => ({
      item: { ...stack.definition, count: stack.count },
      index: stack.databaseIndex,
    }));
  const inventoryPageCount = Math.max(1, Math.ceil(filteredInventoryItems.length / 16));
  const currentInventoryPage = Math.min(inventoryPage, inventoryPageCount - 1);
  const visibleInventoryItems = filteredInventoryItems.slice(
    currentInventoryPage * 16,
    currentInventoryPage * 16 + 16,
  );
  const selectedInventoryStack =
    ownedInventoryItems.find(
      (stack) => stack.databaseIndex === selectedInventoryIndex,
    ) ?? ownedInventoryItems[0] ?? null;
  const selectedInventoryItem = selectedInventoryStack
    ? {
        ...selectedInventoryStack.definition,
        count: selectedInventoryStack.count,
      }
    : null;
  const inventoryWeight = calculateInventoryWeight(playerInventory);
  const inventoryWeightPercent = Math.min(
    100,
    (inventoryWeight / 60) * 100,
  );
  const inventoryCategoryCounts = ownedInventoryItems.reduce(
    (counts, stack) => {
      counts[stack.definition.category] += stack.count;
      return counts;
    },
    { resource: 0, tool: 0, quest: 0, main: 0 } as Record<ItemCategory, number>,
  );

  const changeInventoryPage = (offset: number) => {
    const nextPage =
      (currentInventoryPage + offset + inventoryPageCount) %
      inventoryPageCount;
    setInventoryPage(nextPage);
    const firstItem = filteredInventoryItems[nextPage * 16];
    if (firstItem) selectInventoryItem(firstItem.index);
  };

  const openInventoryItemContextMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    databaseIndex: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const shellRect = gameShellRef.current?.getBoundingClientRect();
    const pointer = getGameShellPointerPosition(event.clientX, event.clientY);
    const menuWidth = 164;
    const menuHeight = 196;
    const menuOffsetX = 20;
    const menuOffsetY = 12;
    const menuEdgeGap = 8;
    selectInventoryItem(databaseIndex);
    setInventoryContextMenu({
      kind: "inventory",
      x: Math.max(
        menuEdgeGap,
        Math.min(
          pointer.x + menuOffsetX,
          (shellRect?.width ?? window.innerWidth) - menuWidth - menuEdgeGap,
        ),
      ),
      y: Math.max(
        menuEdgeGap,
        Math.min(
          pointer.y + menuOffsetY,
          (shellRect?.height ?? window.innerHeight) - menuHeight - menuEdgeGap,
        ),
      ),
      databaseIndex,
    });
  };

  const handleUiInputClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return;
    const inputTarget = event.target.closest(
      [
        ".inventory-dialog button",
        ".inventory-context-menu button",
        ".inventory-hotbar .hotbar-slot",
        ".inventory-trigger",
        ".quest-collapse",
        ".survival-toggle-hitbox",
        ".minimap-hud",
        ".options-trigger",
        ".options-close",
      ].join(","),
    );
    if (inputTarget) playOneShotAudio("uiInput");
  };

  const handleUiInputContextMenuCapture = (
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".inventory-item, .hotbar-slot")) {
      playOneShotAudio("uiInput");
    }
  };

  const openHotbarContextMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    slotIndex: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const slotRect = event.currentTarget.getBoundingClientRect();
    const shellRect = gameShellRef.current?.getBoundingClientRect();
    const shellLeft = shellRect?.left ?? 0;
    const shellTop = shellRect?.top ?? 0;
    const shellWidth = shellRect?.width ?? window.innerWidth;
    const menuHalfWidth = 75;
    const menuEdgeGap = 8;
    const slotCenterX = slotRect.left - shellLeft + slotRect.width / 2;
    activeHotbarSlotRef.current = slotIndex;
    setActiveHotbarSlot(slotIndex);
    setInventoryContextMenu({
      kind: "hotbar",
      x: Math.max(
        menuHalfWidth + menuEdgeGap,
        Math.min(
          slotCenterX,
          shellWidth - menuHalfWidth - menuEdgeGap,
        ),
      ),
      y: slotRect.top - shellTop - menuEdgeGap,
      slotIndex,
    });
  };

  const showUnavailableInventoryAction = (label: string) => {
    showInventoryFeedback(`${label}功能暫未開放`);
    setInventoryContextMenu(null);
  };

  const restartSurvivalTest = () => {
    const next = createInitialSurvivalState();
    const usage = createInteractionUsageState(next.gameMinutes);
    survivalStateRef.current = next;
    interactionUsageRef.current = usage;
    saveSurvivalState(next);
    saveInteractionUsageState(usage);
    setSurvivalState(next);
    requestStoryTriggerContactCheckRef.current();
  };

  const confirmRestartNewGame = () => {
    const progress = resetStoredNewGameProgress();
    survivalStateRef.current = progress.survival;
    interactionUsageRef.current = progress.interactionUsage;
    playerInventoryRef.current = progress.inventory;
    collectedWorldItemIdsRef.current = progress.collectedWorldItemIds;
    hotbarAssignmentsRef.current = progress.hotbarAssignments;
    currentStoryChapterRef.current = progress.story.currentChapter;
    storyProgressRef.current = progress.story;
    droppedWorldItemSequenceRef.current = 0;
    itemPointProgressRef.current = progress.itemPointProgress;
    sceneEntryCollectedItemPointIdsRef.current.clear();
    worldItemSpawnMotionsRef.current.clear();
    worldItemLandingAudioPlayedRef.current.clear();
    activeHotbarSlotRef.current = 0;
    selectedInventoryIndexRef.current = DEFAULT_SELECTED_INVENTORY_INDEX;
    applyDroppedWorldItems(progress.droppedWorldItems);

    setSurvivalState(progress.survival);
    setPlayerInventory(progress.inventory);
    setCollectedWorldItemIds(progress.collectedWorldItemIds);
    setHotbarAssignments(progress.hotbarAssignments);
    setActiveHotbarSlot(0);
    setSelectedInventoryIndex(DEFAULT_SELECTED_INVENTORY_INDEX);
    setInventoryPage(0);
    setInventoryCategory("all");
    setHotbarFeedback(null);
    setOptionsPanelOpen(false);

    window.setTimeout(() => window.location.reload(), 0);
  };

  const handleStoryPointerDownCapture = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (timePassInputLockedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    beginStorySkipHold("touch");
  };

  const handleStoryPointerUpCapture = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (timePassInputLockedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (
      event.pointerType !== "touch" ||
      storySkipHoldRef.current?.source !== "touch"
    ) {
      return;
    }
    const revealed = storySkipHoldRef.current.revealed;
    cancelStorySkipHold(revealed);
    if (revealed) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (
      dialoguePlaybackRef.current &&
      event.target instanceof Element &&
      !event.target.closest(".dialogue-box")
    ) {
      event.preventDefault();
      event.stopPropagation();
      advanceDialogue();
    }
  };

  const handleGameShellClickCapture = (
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    if (timePassInputLockedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (suppressNextStoryClickRef.current) {
      suppressNextStoryClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    handleUiInputClickCapture(event);
  };

  const draggedInventoryItem = inventoryDrag
    ? ITEM_BY_ID.get(inventoryDrag.itemId) ?? null
    : null;
  const renderSurvivalValueTween = (metricId: SurvivalMetricId) => {
    const tween = survivalValueTweens[metricId];
    if (!tween) return null;
    const elapsedMilliseconds = Math.max(
      0,
      window.performance.now() - tween.startedAt,
    );
    if (elapsedMilliseconds >= SURVIVAL_VALUE_TWEEN_DURATION_MS) return null;
    return (
      <span
        className={`survival-value-tween is-${tween.delta > 0 ? "increase" : "decrease"}`}
        key={tween.sequence}
        style={{ animationDelay: `-${elapsedMilliseconds}ms` }}
        aria-hidden="true"
      >
        {tween.delta > 0 ? "+" : ""}{tween.delta}
      </span>
    );
  };
  const contextInventoryItem =
    inventoryContextMenu?.kind === "inventory"
      ? ITEM_DATABASE[inventoryContextMenu.databaseIndex]?.item ?? null
      : null;
  const contextHotbarItemId =
    inventoryContextMenu?.kind === "hotbar"
      ? hotbarAssignments[inventoryContextMenu.slotIndex] ?? null
      : null;
  const contextHotbarItem = contextHotbarItemId
    ? ITEM_BY_ID.get(contextHotbarItemId) ?? null
    : null;
  const timeElapsedClockMotion = timeElapsedNotice
    ? getElapsedClockHandMotion(
        timeElapsedNotice.startGameMinutes,
        timeElapsedNotice.gameMinutes,
      )
    : null;
  const timeElapsedClockStyle = timeElapsedClockMotion
    ? ({
        "--clock-minute-start": `${timeElapsedClockMotion.minuteStartDegrees}deg`,
        "--clock-minute-travel": `${timeElapsedClockMotion.minuteTravelDegrees}deg`,
        "--clock-hour-start": `${timeElapsedClockMotion.hourStartDegrees}deg`,
        "--clock-hour-travel": `${timeElapsedClockMotion.hourTravelDegrees}deg`,
      } as CSSProperties)
    : undefined;
  const questCompletedObjectiveCount = activeQuestHud?.objectives.filter(
    (objective) => objective.current >= objective.required,
  ).length ?? 0;
  const questObjectiveCount = activeQuestHud?.objectives.length ?? 0;
  const activeQuestHudEvent = questHudEvent?.questId === activeQuestHud?.id
    ? questHudEvent
    : null;
  const activeQuestObjectiveTween = questObjectiveTween?.questId === activeQuestHud?.id
    ? questObjectiveTween
    : null;

  return (
    <div
      className="game-viewport"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDownCapture={(event) => {
        activateQuestPromptInputMode(
          event.pointerType === "touch" ? "mobile" : "keyboard-mouse",
        );
      }}
      onPointerDown={(event) => {
        if (
          inventoryContextMenu &&
          !(event.target as Element).closest?.(".inventory-context-menu")
        ) {
          setInventoryContextMenu(null);
        }
      }}
    >
      <div
        className="game-backdrop"
        style={{ backgroundImage: `url(${MAP_SOURCE})` }}
        aria-hidden="true"
      />
      <main
        ref={gameShellRef}
        className={`game-shell${stageFullscreen ? " is-fullscreen" : ""}${storyFlowActive ? " is-story-flow" : ""}${storyFlowPaused ? " is-story-flow-paused" : ""}${storyInputLocked ? " is-story-input-locked" : ""}`}
        onClickCapture={handleGameShellClickCapture}
        onPointerDownCapture={handleStoryPointerDownCapture}
        onPointerUpCapture={handleStoryPointerUpCapture}
        onPointerCancelCapture={() => cancelStorySkipHold(true)}
        onContextMenuCapture={handleUiInputContextMenuCapture}
      >
      <canvas
        ref={canvasRef}
        className={`game-canvas${virtualCursorControlsEnabled ? "" : " physical-cursor-enabled"}`}
        aria-label="八方向角色移動地圖測試場景"
        tabIndex={0}
      />

      <img
        ref={blackScreenImageRef}
        className="black-screen-image"
        src="./ui/black-screen.svg?v=3"
        alt=""
        data-opacity="255"
        data-input-blocking="true"
        data-virtual-cursor-enabled={virtualCursorControlsEnabled ? "true" : "false"}
        draggable={false}
        style={{ opacity: 1 }}
        aria-hidden="true"
      />

      {storyCenteredText ? (
        <section
          key={storyCenteredText.sequence}
          className="story-centered-text"
          style={{
            "--story-text-fade-in": `${storyCenteredText.fadeInMs}ms`,
            "--story-text-fade-out": `${storyCenteredText.fadeOutMs}ms`,
            "--story-text-fade-out-delay": `${storyCenteredText.fadeInMs + storyCenteredText.holdMs}ms`,
          } as CSSProperties}
          aria-live="polite"
        >
          {storyCenteredText.lines.map((line, index) => (
            <p key={`${index}-${line}`}>{line}</p>
          ))}
        </section>
      ) : null}

      {storySkipVisible ? (
        <section
          key={storySkipSequence}
          className="story-skip-progress"
          role="status"
          aria-label="正在跳過劇情"
        >
          <span>SKIP</span>
          <i><b /></i>
        </section>
      ) : null}

      {mainObjectiveMarker ? (
        <MainObjectiveMarker
          key={mainObjectiveMarker.sequence}
          durationMs={mainObjectiveMarker.durationMs}
        />
      ) : null}

      {debugItemSpawnerOpen ? (
        <form
          className="debug-item-spawner"
          aria-label="Debug 生成道具"
          onSubmit={submitDebugItemSpawn}
        >
          <span className="debug-item-spawner-label">ITEM SPAWN</span>
          <input
            ref={debugItemInputRef}
            value={debugItemSpawnCommand}
            onChange={(event) => setDebugItemSpawnCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeDebugItemSpawner();
              } else if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="道具ID 數量（例：R0004 3）"
            aria-label="輸入道具 ID 與數量"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" aria-label="生成道具">Enter</button>
        </form>
      ) : null}

      <section
        className="compass-strip"
        aria-label={`角色目前面向：${DIRECTION_NAMES[facing]}`}
      >
        <div className="compass-minor-ticks" aria-hidden="true">
          {COMPASS_MINOR_TICK_POSITIONS.map((position) => (
            <i key={position} style={{ left: `${position}%` }} />
          ))}
        </div>
        <div className="compass-directions">
          {getCompassWindow(facing).map(({ direction, offset }) => (
            <span
              key={`${direction}-${offset}`}
              className={`compass-direction${offset === 0 ? " is-current" : ""}${["N", "S", "E", "W"].includes(direction) ? " is-cardinal" : ""}`}
            >
              {direction}
            </span>
          ))}
        </div>
      </section>

      {dialogueView ? (
        <button
          className={`dialogue-box dialogue-size-${dialogueTextSize}`}
          type="button"
          aria-label="對話；按下顯示下一頁"
          onClick={advanceDialogue}
        >
          {dialogueView.speaker ? (
            <strong className="dialogue-speaker">{dialogueView.speaker}</strong>
          ) : null}
          <span className="dialogue-text">{dialogueView.text}</span>
          <span className="dialogue-next" aria-hidden="true" />
        </button>
      ) : null}

      {timeElapsedNotice ? (
        <section
          key={timeElapsedNotice.sequence}
          className={`time-elapsed-notice${timeElapsedNotice.dismissing ? " is-dismissing" : ""}`}
          role="status"
          aria-live="polite"
        >
          <div className="time-elapsed-notice-content">
            <span
              className="time-elapsed-clock-icon"
              style={timeElapsedClockStyle}
              aria-hidden="true"
            />
            <span>
              時間經過了 {formatElapsedGameHours(timeElapsedNotice.gameMinutes)} 小時
            </span>
          </div>
        </section>
      ) : null}

      {questEventNotice ? (
        <section
          key={questEventNotice.sequence}
          className={`time-elapsed-notice quest-event-notice is-${questEventNotice.kind}`}
          role="status"
          aria-live="polite"
          data-quest-event-notice={questEventNotice.kind}
        >
          <div className="time-elapsed-notice-content">
            <span className="quest-event-notice-icon" aria-hidden="true">!</span>
            <span>
              {questEventNotice.kind === "completed"
                ? "任務目標已完成"
                : "已啟動任務目標"}
            </span>
          </div>
        </section>
      ) : null}

      <section className="top-left-hud" aria-label="場景資訊">
        <p className="eyebrow">Echoes Beyond the Stars</p>
        <h1>地圖測試場景</h1>
        <div className="status-row">
          <i className="status-dot" aria-hidden="true" />
          <span>map_test01 · NavMesh ready</span>
        </div>
        <p className={`hud-gamepad-status${gamepadConnected ? " is-connected" : ""}`}>
          🎮 {gamepadConnected ? "手把已連線" : "請按手把任一按鈕啟用"}
        </p>
      </section>

      <aside ref={survivalHudRef} className={`survival-hud${survivalExpanded ? " is-expanded" : ""}${inventoryOpen ? " is-inventory-open" : ""}`} aria-label="生存狀態指示表">
        <header className="survival-clock">
          <span>
            Day <strong>{gameClock.day}</strong>
          </span>
          <span>
            <i aria-hidden="true">{gameClock.hour >= 6 && gameClock.hour < 18 ? "☀" : "☾"}</i>
            <strong>{String(gameClock.hour).padStart(2, "0")}:{String(gameClock.minute).padStart(2, "0")}</strong>
          </span>
        </header>
        <div className="survival-mini-panel" aria-hidden={survivalExpanded}>
          {SURVIVAL_STATS.map((stat) => {
            const value = survivalState.values[stat.id];
            const critical = value <= 20;
            return (
            <span className={`survival-mini-stat is-${stat.id}${critical ? " is-critical" : ""}`} key={stat.id} title={`${stat.label} ${Math.round(value)}/100`}>
              <i aria-hidden="true">{stat.symbol}</i>
              <b aria-hidden="true"><em style={{ width: `${value}%` }} /></b>
              <small>{Math.round(value)}</small>
              {renderSurvivalValueTween(stat.id)}
            </span>
          )})}
        </div>
        <div className="survival-panel" aria-hidden={!survivalExpanded}>
          {SURVIVAL_STATS.map((stat) => {
            const value = survivalState.values[stat.id];
            const critical = value <= 20;
            return (
            <div className={`survival-stat is-${stat.id}${critical ? " is-critical" : ""}`} key={stat.id}>
              <span className="survival-stat-icon" aria-hidden="true">{stat.symbol}</span>
              <span className="survival-stat-label">{stat.label}</span>
              <output>{Math.round(value)}/100</output>
              <span className="survival-meter" aria-hidden="true">
                <i style={{ width: `${value}%` }} />
              </span>
              {renderSurvivalValueTween(stat.id)}
            </div>
          )})}
        </div>
        <button
          className="survival-toggle-hitbox"
          type="button"
          aria-label={survivalExpanded ? "收合生存狀態" : "展開生存狀態"}
          aria-expanded={survivalExpanded}
          aria-keyshortcuts="R"
          disabled={inventoryOpen}
          onClick={toggleSurvivalPanel}
        />
      </aside>

      <aside
        ref={questHudRef}
        className={`quest-hud${questPanelCollapsed ? " is-collapsed" : ""}${
          hasActiveQuest ? "" : " is-history"
        }${activeQuestHudEvent ? ` is-event-${activeQuestHudEvent.kind}` : ""}${
          questStageEntering ? " is-stage-entering" : ""
        }`}
        aria-label={hasActiveQuest ? activeQuestHud!.title : EMPTY_QUEST_TITLE}
        data-quest-hud-event={activeQuestHudEvent?.kind ?? "idle"}
      >
        {activeQuestHudEvent && (
          activeQuestHudEvent.kind === "completed" || activeQuestHudEvent.kind === "failed"
        ) ? (
          <span className="quest-event-frame" aria-hidden="true" />
        ) : null}
        <header className="quest-header">
          <span className="quest-type-icon" aria-hidden="true">
            {hasActiveQuest ? "◇" : "✓"}
          </span>
          <div className="quest-title">
            <small>{activeQuestHud?.categoryLabel ?? "MAIN OBJECTIVE"}</small>
            <strong>{activeQuestHud?.title ?? EMPTY_QUEST_TITLE}</strong>
            {activeQuestHudEvent && activeQuestHudEvent.kind !== "accepted" ? (
              <b className="quest-result-label">
                {activeQuestHudEvent.kind === "next"
                  ? "NEXT"
                  : activeQuestHudEvent.kind === "completed"
                    ? "COMPLETE"
                    : "FAILED"}
              </b>
            ) : null}
          </div>
          {hasActiveQuest ? (
            <output className="quest-summary-progress">
              {questCompletedObjectiveCount}/{questObjectiveCount}
            </output>
          ) : null}
        </header>
        {hasActiveQuest && !questPanelCollapsed ? (
          <div className="quest-objectives" key={activeQuestHud!.stageId}>
            {activeQuestHud!.objectives.map((objective) => {
              const progress = Math.min(1, objective.current / objective.required);
              const isCompletionPop = activeQuestObjectiveTween?.objectiveId === objective.id;
              return (
                <div
                  className={`quest-objective${isCompletionPop ? " is-completion-pop" : ""}`}
                  key={`${objective.id}-${isCompletionPop ? activeQuestObjectiveTween.sequence : 0}`}
                >
                  <span
                    className={`quest-objective-check${objective.completed ? " is-complete" : ""}`}
                    aria-hidden="true"
                  >
                    {objective.completed ? "☑" : "☐"}
                  </span>
                  <span className="quest-objective-label">
                    {renderQuestObjectiveLabel(objective.label, questPromptInputMode)}
                  </span>
                  {objective.showProgress ? (
                    <output>[{Math.min(objective.current, objective.required)}/{objective.required}]</output>
                  ) : null}
                  {objective.showProgress ? (
                    <i aria-hidden="true"><b style={{ width: `${progress * 100}%` }} /></i>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {!hasActiveQuest && !questPanelCollapsed ? (
          <div className="quest-history" aria-label="最近完成的任務">
            {completedQuestHistory.length > 0 ? (
              completedQuestHistory.map((quest) => (
                <div className="quest-history-item" key={quest.id}>
                  <span className="quest-history-check" aria-hidden="true">☑</span>
                  <span className="quest-history-title">{quest.title}</span>
                </div>
              ))
            ) : (
              <p className="quest-history-empty">尚無已完成的任務</p>
            )}
          </div>
        ) : null}
        <button
          className="quest-collapse"
          type="button"
          aria-label={questPanelCollapsed ? "展開任務提示" : "收合任務提示"}
          aria-expanded={!questPanelCollapsed}
          aria-keyshortcuts="Q"
          onClick={() => {
            toggleQuestPanel();
          }}
        >
          <span aria-hidden="true" />
        </button>
      </aside>

      <button
        className="survival-pause-trigger"
        type="button"
        aria-label={survivalFlowPaused ? "恢復生存時間流逝" : "暫停生存時間流逝"}
        aria-pressed={survivalFlowPaused}
        title={survivalFlowPaused ? "恢復生存時間流逝" : "暫停生存時間流逝"}
        onClick={toggleSurvivalFlowPaused}
      >
        <span aria-hidden="true"><i /><i /></span>
      </button>

      <button
        className="options-trigger"
        type="button"
        aria-label="開啟選項"
        aria-expanded={optionsOpen}
        aria-controls="options-dialog"
        onClick={toggleOptionsPanel}
      >
        <span aria-hidden="true">⚙</span>
      </button>

      <section className={`inventory-hotbar${inventoryOpen ? " is-inventory-open" : ""}`} aria-label="背包道具快捷工具列">
        {hotbarFeedback ? (
          <p className="hotbar-feedback" key={hotbarFeedback.sequence} aria-live="polite">
            {hotbarFeedback.message}
          </p>
        ) : null}
        <div className="hotbar-slots">
          {hotbarAssignments.map((itemId, index) => {
            const item = itemId ? ITEM_BY_ID.get(itemId) : null;
            const count = item ? playerInventory[item.id] ?? 0 : 0;
            const selectionHintMode = getHotbarSelectionHintMode(
              item?.id ?? null,
              count,
            );
            const isUsing = hotbarFeedback?.slotIndex === index;
            return (
              <button
                className={`hotbar-slot${activeHotbarSlot === index ? " is-selected" : ""}${isUsing ? " is-using" : ""}${count <= 0 ? " is-empty" : ""}${hotbarDropTarget === index ? " is-drop-target" : ""}`}
                key={`${index}-${item?.id ?? "empty"}-${isUsing ? hotbarFeedback.sequence : 0}`}
                type="button"
                data-hotbar-index={index}
                aria-label={
                  item && count > 0
                    ? `${index + 1}：使用${item.name}，持有 ${count}`
                    : item
                      ? `${index + 1}：${item.name}，尚未持有`
                      : `${index + 1}：尚未指派道具`
                }
                title={`${index + 1} · ${item?.name ?? "空白快捷格"}`}
                onContextMenu={(event) => openHotbarContextMenu(event, index)}
                onClick={() => {
                  if (inventoryOpenRef.current) {
                    activeHotbarSlotRef.current = index;
                    setActiveHotbarSlot(index);
                    return;
                  }
                  activateHotbarItem(index);
                }}
              >
                <span className="hotbar-key" aria-hidden="true">{index + 1}</span>
                <span className="hotbar-item-icon" aria-hidden="true">{item?.symbol ?? "＋"}</span>
                <span className="hotbar-count" aria-hidden="true">{item ? count > 0 ? count : "—" : ""}</span>
                {hotbarSelectionHint?.slotIndex === index ? (
                  <span
                    className={`hotbar-selection-hint${hotbarSelectionHint.visible ? " is-visible" : ""}`}
                    key={hotbarSelectionHint.sequence}
                    aria-live="polite"
                  >
                    <strong>{item?.name ?? "空白快捷格"}</strong>
                    {selectionHintMode === "use" ? (
                      <small>按 <b>[Y]</b> 進行使用</small>
                    ) : (
                      <small className="is-unavailable">
                        {selectionHintMode === "unavailable"
                          ? "暫無此道具"
                          : "尚未指派道具"}
                      </small>
                    )}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <button
          className="inventory-trigger"
          type="button"
          aria-label={inventoryOpen ? "關閉背包" : "開啟背包"}
          aria-pressed={inventoryOpen}
          title={inventoryOpen ? "關閉背包" : "開啟背包"}
          onClick={() => setInventoryPanelOpen(!inventoryOpenRef.current)}
        >
          <span className="inventory-trigger-icon" aria-hidden="true">
            <i className="inventory-trigger-handle" />
            <i className="inventory-trigger-body" />
            <i className="inventory-trigger-pocket" />
          </span>
        </button>
      </section>

      {inventoryOpen ? (
        <div
          className="inventory-overlay"
          onPointerDown={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest(".inventory-body, .inventory-close")
            ) return;
            playOneShotAudio("uiInput");
            setInventoryPanelOpen(false);
          }}
        >
          <section
            className="inventory-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="背包"
          >
            <header className="inventory-header">
              <div className="inventory-title-ornament" aria-hidden="true" />
              <h2>背包</h2>
              <p>Inventory</p>
              <button
                className="inventory-close"
                type="button"
                aria-label="關閉背包"
                onClick={() => setInventoryPanelOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="inventory-body">
              <aside className="inventory-summary-panel">
                <h3>生存背包</h3>
                <section className="inventory-survival-panel" aria-label="背包生存狀態">
                  {SURVIVAL_STATS.map((stat) => {
                    const value = survivalState.values[stat.id];
                    const critical = value <= 20;
                    return (
                      <div className={`survival-stat is-${stat.id}${critical ? " is-critical" : ""}`} key={stat.id}>
                        <span className="survival-stat-icon" aria-hidden="true">{stat.symbol}</span>
                        <span className="survival-stat-label">{stat.label}</span>
                        <output>{Math.round(value)}/100</output>
                        <span className="survival-meter" aria-hidden="true">
                          <i style={{ width: `${value}%` }} />
                        </span>
                        {renderSurvivalValueTween(stat.id)}
                      </div>
                    );
                  })}
                </section>
                <div className="inventory-bag-art" aria-hidden="true">
                  <svg viewBox="0 0 180 190">
                    <path d="M57 48c3-25 18-36 33-36s30 11 33 36" />
                    <path d="M42 55c12-12 84-12 96 0l9 106c-17 18-97 18-114 0z" />
                    <path d="M51 85h78v62H51z" />
                    <path d="M68 43v112M112 43v112M35 77l-16 20 7 51M145 77l16 20-7 51" />
                    <path d="M60 92h60M73 118h34M81 75h18" />
                  </svg>
                </div>
                <div className="inventory-weight">
                  <span>▣</span><strong>{inventoryWeight.toFixed(1)} / 60.0 kg</strong>
                  <i><b style={{ width: `${inventoryWeightPercent}%` }} /></i>
                </div>
                <section className="inventory-category-stats">
                  <h4>分類統計</h4>
                  <p><span>♣　資源</span><strong>{inventoryCategoryCounts.resource}</strong></p>
                  <p><span>⌘　工具</span><strong>{inventoryCategoryCounts.tool}</strong></p>
                  <p><span>⚑　任務道具</span><strong>{inventoryCategoryCounts.quest}</strong></p>
                  <p><span>♔　主線道具</span><strong>{inventoryCategoryCounts.main}</strong></p>
                </section>
              </aside>

              <article className="inventory-selected-panel">
                <header><span>選中道具</span><small>SELECTED ITEM</small></header>
                {selectedInventoryItem ? (
                  <>
                    <div className="inventory-feature-art">
                      <span aria-hidden="true">{selectedInventoryItem.symbol}</span>
                    </div>
                    <section className="inventory-selected-copy">
                      <h3>{selectedInventoryItem.name}</h3>
                      <strong>{selectedInventoryItem.category === "main" ? "♔ 主線道具" : selectedInventoryItem.category === "quest" ? "⚑ 任務道具" : selectedInventoryItem.category === "tool" ? "⌘ 工具" : "♣ 資源"}</strong>
                      <p>{selectedInventoryItem.description}</p>
                      <p className={`inventory-survival-effects${hasConfiguredSurvivalEffects(selectedInventoryItem.survivalEffects) ? " is-configured" : ""}`}>
                        生存影響　{formatSurvivalEffects(selectedInventoryItem.survivalEffects)}
                      </p>
                      <output>重量　{selectedInventoryItem.weight.toFixed(2)} kg　　持有 ×{selectedInventoryItem.count}</output>
                    </section>
                    <div className="inventory-selected-actions">
                      <button type="button" onClick={() => activateInventoryItem(selectedInventoryStack?.databaseIndex ?? selectedInventoryIndex)}>使用</button>
                      <button type="button">查看</button>
                      <button type="button">標記</button>
                      <button
                        className="is-danger"
                        type="button"
                        disabled={!selectedInventoryItem.inventoryRules.discardable}
                        title={
                          selectedInventoryItem.inventoryRules.discardable
                            ? "丟棄一個到角色附近"
                            : "此道具不可丟棄"
                        }
                        onClick={(event) =>
                          discardInventoryItem(
                            selectedInventoryStack?.databaseIndex ??
                              selectedInventoryIndex,
                            event.currentTarget,
                          )
                        }
                      >
                        丟棄
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="inventory-empty-message">目前沒有持有任何道具</p>
                )}
              </article>

              <section className="inventory-catalog">
                <nav className="inventory-categories" aria-label="背包分類">
                  {INVENTORY_CATEGORIES.map((category) => (
                    <button
                      className={inventoryCategory === category.id ? "is-active" : undefined}
                      type="button"
                      key={category.id}
                      onClick={() => changeInventoryCategory(category.id)}
                    >
                      {category.label}
                    </button>
                  ))}
                </nav>
                <div className="inventory-catalog-tools">
                  <button type="button">排序：預設排序　▼</button>
                  <button type="button">篩選：全部顯示　▼</button>
                  <label>
                    <input type="search" placeholder="搜尋道具…" aria-label="搜尋道具" />
                    <span aria-hidden="true">⌕</span>
                  </label>
                </div>
                <div className="inventory-items" aria-label="背包道具">
                  {visibleInventoryItems.length === 0 ? (
                    <p className="inventory-empty-message">這個分類目前沒有持有道具</p>
                  ) : null}
                  {visibleInventoryItems.map(({ item, index }) => (
                    <button
                      className={`inventory-item is-${item.category}${selectedInventoryIndex === index ? " is-selected" : ""}`}
                      type="button"
                      key={item.id}
                      data-inventory-index={index}
                      data-inventory-item-id={item.id}
                      aria-label={`${item.name}，持有 ${item.count}，生存影響：${formatSurvivalEffects(item.survivalEffects)}`}
                      title={`生存影響：${formatSurvivalEffects(item.survivalEffects)}`}
                      onPointerDown={(event) => beginInventoryDrag(event, item.id)}
                      onPointerMove={moveInventoryDrag}
                      onPointerUp={finishInventoryDrag}
                      onPointerCancel={cancelInventoryDrag}
                      onLostPointerCapture={cancelInventoryDrag}
                      onContextMenu={(event) => openInventoryItemContextMenu(event, index)}
                      onClick={(event) => {
                        if (suppressInventoryClickRef.current) {
                          event.preventDefault();
                          return;
                        }
                        selectInventoryItem(index);
                      }}
                    >
                      <span className="inventory-item-kind" aria-hidden="true">{item.category === "main" ? "♔" : item.category === "quest" ? "⚑" : item.category === "tool" ? "⌘" : "♣"}</span>
                      <span className="inventory-item-icon" aria-hidden="true">{item.symbol}</span>
                      <strong>{item.name}</strong>
                      <small>×{item.count}</small>
                    </button>
                  ))}
                </div>
                <footer className="inventory-pages">
                  <button type="button" disabled={inventoryPageCount <= 1} onClick={() => changeInventoryPage(-1)} aria-label="上一頁">◀</button>
                  <strong>{currentInventoryPage + 1} / {inventoryPageCount}</strong>
                  <button type="button" disabled={inventoryPageCount <= 1} onClick={() => changeInventoryPage(1)} aria-label="下一頁">▶</button>
                </footer>
              </section>
            </div>
          </section>

          <footer className="inventory-screen-footer">
            <strong>拖曳／長按道具 → 指派快捷格　·　右鍵：更多功能　·　Tab / B：關閉背包</strong>
            <div className="inventory-currency"><span>◉　23,450</span><span>▣　{inventoryWeight.toFixed(1)} / 60.0 kg</span></div>
          </footer>
        </div>
      ) : null}

      {inventoryDrag && draggedInventoryItem ? (
        <div
          className="inventory-drag-ghost"
          style={{ left: inventoryDrag.x, top: inventoryDrag.y }}
          aria-hidden="true"
        >
          <span>{draggedInventoryItem.symbol}</span>
          <strong>{draggedInventoryItem.name}</strong>
          <small>拖曳至快捷格</small>
        </div>
      ) : null}

      {inventoryContextMenu?.kind === "inventory" ? (
        <menu
          className="inventory-context-menu"
          style={{ left: inventoryContextMenu.x, top: inventoryContextMenu.y }}
          aria-label={`${contextInventoryItem?.name ?? "道具"}功能選單`}
        >
          <button
            type="button"
            onClick={() => {
              activateInventoryItem(inventoryContextMenu.databaseIndex);
              setInventoryContextMenu(null);
            }}
          >
            使用
          </button>
          <button type="button" onClick={() => showUnavailableInventoryAction("查看")}>查看</button>
          <button type="button" onClick={() => showUnavailableInventoryAction("標記")}>標記</button>
          <button
            className="is-danger"
            type="button"
            disabled={!contextInventoryItem?.inventoryRules.discardable}
            onClick={(event) => {
              discardInventoryItem(
                inventoryContextMenu.databaseIndex,
                event.currentTarget,
              );
              setInventoryContextMenu(null);
            }}
          >
            丟棄
          </button>
        </menu>
      ) : null}

      {inventoryContextMenu?.kind === "hotbar" ? (
        <menu
          className="inventory-context-menu is-hotbar-menu"
          style={{ left: inventoryContextMenu.x, top: inventoryContextMenu.y }}
          aria-label={`快捷格 ${inventoryContextMenu.slotIndex + 1} 功能選單`}
        >
          <button
            type="button"
            disabled={!contextHotbarItem}
            onClick={() => {
              if (contextHotbarItem) {
                useInventoryItem(contextHotbarItem.id, inventoryContextMenu.slotIndex);
              }
              setInventoryContextMenu(null);
            }}
          >
            使用
          </button>
          <button
            className="is-danger"
            type="button"
            disabled={!contextHotbarItemId}
            onClick={() => {
              setHotbarSlotAssignment(inventoryContextMenu.slotIndex, null);
              setInventoryContextMenu(null);
            }}
          >
            移除
          </button>
        </menu>
      ) : null}

      {optionsOpen ? (
        <div
          className="options-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              playOneShotAudio("uiInput");
              setOptionsPanelOpen(false);
            }
          }}
        >
          <section
            className="options-dialog"
            id="options-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="遊戲選項"
          >
            <header className="options-header">
              <div>
                <p>OPTIONS</p>
                <h2>選項</h2>
              </div>
              <button
                className="options-close"
                type="button"
                aria-label="關閉選項"
                onClick={() => setOptionsPanelOpen(false)}
              >
                ×
              </button>
            </header>

            <nav className="options-tabs" aria-label="選項分類">
              {OPTIONS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={optionsTab === tab.id ? "is-active" : undefined}
                  type="button"
                  aria-selected={optionsTab === tab.id}
                  onClick={() => {
                    optionsTabRef.current = tab.id;
                    setOptionsTab(tab.id);
                    setOptionsMenuSelectionValue(OPTIONS_TAB_ITEMS[tab.id][0]);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="options-content">
              {optionsTab === "display" ? (
                <>
                  <div className="options-section-heading">
                    <span>畫面</span>
                    <small>調整對話與角色的閱讀／顯示比例</small>
                  </div>
                  <div
                    className="choice-row"
                    data-gamepad-selected={
                      optionsMenuSelection === "dialogue-text-size" || undefined
                    }
                  >
                    <div>
                      <strong>對話框文字大小</strong>
                      <span>行動裝置預設為「大」</span>
                    </div>
                    <div className="choice-buttons" aria-label="對話框文字大小">
                      {(["small", "medium", "large"] as DialogueTextSize[]).map((value) => (
                        <button
                          key={value}
                          className={dialogueTextSize === value ? "is-active" : undefined}
                          type="button"
                          onFocus={() => setOptionsMenuSelectionValue("dialogue-text-size")}
                          onClick={() => {
                            setOptionsMenuSelectionValue("dialogue-text-size");
                            setDialogueTextSize(value);
                          }}
                        >
                          {{ small: "小", medium: "中", large: "大" }[value]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    className="slider-row"
                    data-gamepad-selected={
                      optionsMenuSelection === "character-size" || undefined
                    }
                  >
                    <label htmlFor="character-size">角色顯示尺寸</label>
                    <output className="slider-value" htmlFor="character-size">{size}</output>
                    <input id="character-size" type="range" min="90" max="220" step="4" value={size} onFocus={() => setOptionsMenuSelectionValue("character-size")} onChange={(event) => setSizeValue(Number(event.target.value))} />
                  </div>
                </>
              ) : null}

              {optionsTab === "audio" ? (
                <>
                  <div className="options-section-heading">
                    <span>音效</span>
                    <small>管理背景音樂與播放音量</small>
                  </div>
                  <button
                    className="toggle-button"
                    type="button"
                    data-gamepad-selected={optionsMenuSelection === "bgm-enabled" || undefined}
                    aria-pressed={bgmEnabled}
                    onFocus={() => setOptionsMenuSelectionValue("bgm-enabled")}
                    onClick={() => {
                      setOptionsMenuSelectionValue("bgm-enabled");
                      activateOptionsMenuSelection();
                    }}
                  >
                    <span>BGM</span><span className="toggle-pill" aria-hidden="true" />
                  </button>
                  <div className="slider-row" data-gamepad-selected={optionsMenuSelection === "bgm-volume" || undefined}>
                    <label htmlFor="bgm-volume">BGM 音量</label>
                    <output className="slider-value" htmlFor="bgm-volume">{bgmVolume}%</output>
                    <input id="bgm-volume" type="range" min="0" max="100" step="5" value={bgmVolume} disabled={!bgmEnabled} onFocus={() => setOptionsMenuSelectionValue("bgm-volume")} onChange={(event) => setBgmVolumeValue(Number(event.target.value))} />
                  </div>
                </>
              ) : null}

              {optionsTab === "controls" ? (
                <>
                  <div className="options-section-heading">
                    <span>操作</span>
                    <small>移動手感與目前輸入裝置狀態</small>
                  </div>
                  <button
                    className="toggle-button"
                    type="button"
                    data-gamepad-selected={optionsMenuSelection === "virtual-cursor-controls" || undefined}
                    aria-pressed={virtualCursorControlsEnabled}
                    onFocus={() => setOptionsMenuSelectionValue("virtual-cursor-controls")}
                    onClick={() => {
                      setOptionsMenuSelectionValue("virtual-cursor-controls");
                      activateOptionsMenuSelection();
                    }}
                  >
                    <span>
                      <strong>開啟虛擬游標控制</strong>
                      <small>關閉後右搖桿不再控制遊戲內游標；實體滑鼠仍可使用</small>
                    </span>
                    <span className="toggle-pill" aria-hidden="true" />
                  </button>
                  <div className="slider-row" data-gamepad-selected={optionsMenuSelection === "movement-speed" || undefined}>
                    <label htmlFor="movement-speed">移動速度</label>
                    <output className="slider-value" htmlFor="movement-speed">{speed}</output>
                    <input id="movement-speed" type="range" min="100" max="380" step="10" value={speed} onFocus={() => setOptionsMenuSelectionValue("movement-speed")} onChange={(event) => setSpeedValue(Number(event.target.value))} />
                  </div>
                  <div className="gamepad-debug" aria-live="polite">
                    <strong>{gamepadConnected ? gamepadLabel || "手把已連線" : "尚未偵測到手把"}</strong>
                    <span>{gamepadDiagnostic}</span>
                    <span className="gamepad-menu-hint">START：開啟／關閉 · LB／RB：切換頁籤 · 十字鍵上下：選擇 · 左右：調整／開關（左 OFF、右 ON）· A：確認 · B：關閉 · 左搖桿：角色移動</span>
                  </div>
                </>
              ) : null}

              {optionsTab === "advanced" ? (
                <>
                  <div className="options-section-heading">
                    <span>進階</span>
                    <small>測試場景碰撞與移動輔助設定</small>
                  </div>
                  <button className="toggle-button" type="button" data-gamepad-selected={optionsMenuSelection === "player-collision" || undefined} aria-pressed={showPlayerCollision} onFocus={() => setOptionsMenuSelectionValue("player-collision")} onClick={() => { setOptionsMenuSelectionValue("player-collision"); activateOptionsMenuSelection(); }}>
                    <span>角色 Collision 描繪</span><span className="toggle-pill" aria-hidden="true" />
                  </button>
                  <button className="toggle-button" type="button" data-gamepad-selected={optionsMenuSelection === "scene-collision" || undefined} aria-pressed={showSceneCollision} onFocus={() => setOptionsMenuSelectionValue("scene-collision")} onClick={() => { setOptionsMenuSelectionValue("scene-collision"); activateOptionsMenuSelection(); }}>
                    <span>場景 Collision 描繪</span><span className="toggle-pill" aria-hidden="true" />
                  </button>
                  <div className="slider-row" data-gamepad-selected={optionsMenuSelection === "collision-slide-tolerance" || undefined}>
                    <label htmlFor="collision-slide-tolerance">碰撞滑動輔助</label>
                    <output className="slider-value" htmlFor="collision-slide-tolerance">{collisionSlideTolerance}%</output>
                    <input id="collision-slide-tolerance" type="range" min="20" max="100" step="5" value={collisionSlideTolerance} onFocus={() => setOptionsMenuSelectionValue("collision-slide-tolerance")} onChange={(event) => setCollisionSlideToleranceValue(Number(event.target.value))} />
                  </div>
                  <button
                    className="restart-game-option"
                    type="button"
                    data-gamepad-selected={optionsMenuSelection === "restart-game" || undefined}
                    onFocus={() => setOptionsMenuSelectionValue("restart-game")}
                    onClick={() => {
                      setOptionsMenuSelectionValue("restart-game");
                      openRestartConfirmation();
                    }}
                  >
                    <span>
                      <strong>重新開始</strong>
                      <small>重置生存狀態、日期時間、資源與遊戲進度</small>
                    </span>
                    <b>重新開始</b>
                  </button>
                </>
              ) : null}
            </div>

            <footer className="options-footer">
              <span>START／齒輪：關閉</span><span>LB／RB：切換頁籤 · 十字鍵：選擇／調整 · A：確認 · B：關閉</span>
            </footer>
          </section>
          {restartConfirmationOpen ? (
            <div
              className="restart-confirmation-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeRestartConfirmation();
              }}
            >
              <section
                className="restart-confirmation"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="restart-confirmation-title"
              >
                <small>NEW GAME</small>
                <h3 id="restart-confirmation-title">確定要重新開始新遊戲？</h3>
                <p>目前的生存狀態、日期時間、背包資源及場景進度都會被重置。</p>
                <div>
                  <button
                    className={restartConfirmationChoice === "cancel" ? "is-selected" : undefined}
                    type="button"
                    onFocus={() => setRestartConfirmationChoiceValue("cancel")}
                    onClick={closeRestartConfirmation}
                  >
                    取消
                  </button>
                  <button
                    className={`is-confirm${restartConfirmationChoice === "confirm" ? " is-selected" : ""}`}
                    type="button"
                    onFocus={() => setRestartConfirmationChoiceValue("confirm")}
                    onClick={confirmRestartNewGame}
                  >
                    確定
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeKeyboardKeys.length > 0 ? (
        <section className="keyboard-input-hint" aria-label="目前鍵盤移動輸入">
          <div className="key-group" aria-hidden="true">
            <span className={`keycap w${activeKeyboardKeys.includes("w") || activeKeyboardKeys.includes("arrowup") ? " is-active" : ""}`}>W</span>
            <span className={`keycap a${activeKeyboardKeys.includes("a") || activeKeyboardKeys.includes("arrowleft") ? " is-active" : ""}`}>A</span>
            <span className={`keycap s${activeKeyboardKeys.includes("s") || activeKeyboardKeys.includes("arrowdown") ? " is-active" : ""}`}>S</span>
            <span className={`keycap d${activeKeyboardKeys.includes("d") || activeKeyboardKeys.includes("arrowright") ? " is-active" : ""}`}>D</span>
          </div>
        </section>
      ) : null}

      <p className="controls-subtitle" aria-label="操作提示">
        <span className="controls-subtitle-desktop">WASD／方向鍵、滑鼠點擊、左搖桿移動 · 右搖桿游標 · Q／RB：任務 · R／LB：生存 · ESC／START：選項</span>
        <span className="controls-subtitle-touch">上半部點擊前往 · 下半部按住移動 · START：選項</span>
      </p>

      <section className="movement-status" aria-live="polite">
        {interactionJustTriggered ? "INTERACTIVE" : moving ? "MOVING" : "FACING"}
      </section>

      <button
        className={`minimap-hud${minimapCollapsed ? " is-collapsed" : ""}`}
        type="button"
        aria-label={minimapCollapsed ? "展開小地圖" : "收折小地圖"}
        aria-expanded={!minimapCollapsed}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setMinimapCollapsed((collapsed) => !collapsed);
        }}
      >
        <span className="minimap-frame" aria-hidden="true">
          <span
            className="minimap-map-content"
            style={{
              width: `${88 * (WORLD.width / Math.max(WORLD.width, WORLD.height))}%`,
              height: `${88 * (WORLD.height / Math.max(WORLD.width, WORLD.height))}%`,
            }}
          >
            <canvas ref={minimapCanvasRef} className="minimap-map-layer" />
            {activeMinimapItemPoints.map((itemPoint) => (
              <span
                key={itemPoint.id}
                className="minimap-item-point-marker"
                style={{
                  left: `${clamp(
                    (ITEM_POINT_RUNTIME_POSITIONS.get(itemPoint.id)?.x ?? itemPoint.x) /
                      WORLD.width,
                    0,
                    1,
                  ) * 100}%`,
                  top: `${clamp(
                    (ITEM_POINT_RUNTIME_POSITIONS.get(itemPoint.id)?.y ?? itemPoint.y) /
                      WORLD.height,
                    0,
                    1,
                  ) * 100}%`,
                }}
              />
            ))}
            <span
              ref={minimapPlayerMarkerRef}
              className="minimap-player-marker"
              style={{
                left: `${clamp(SPAWN.x / WORLD.width, 0, 1) * 100}%`,
                top: `${clamp(SPAWN.y / WORLD.height, 0, 1) * 100}%`,
              }}
            />
          </span>
          <span className="minimap-north">N</span>
          <span className="minimap-toggle-mark" />
        </span>
      </button>

      <button
        className={`mobile-interaction-trigger${
          mobileInteractionTarget &&
          !optionsOpen &&
          !inventoryOpen &&
          !dialogueView
            ? " is-visible"
            : ""
        }`}
        type="button"
        aria-label={
          mobileInteractionTarget
            ? `與${mobileInteractionTarget.label}互動`
            : "目前沒有可互動物件"
        }
        disabled={
          !mobileInteractionTarget ||
          optionsOpen ||
          inventoryOpen ||
          Boolean(dialogueView)
        }
        onClick={(event) => {
          event.stopPropagation();
          mobileInteractionActionRef.current();
        }}
      >
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path className="mobile-interaction-object" d="M42 8l4 4-4 4-4-4z" />
          <path d="M15 36V24a4 4 0 0 1 8 0v8-15a4 4 0 0 1 8 0v14-12a4 4 0 0 1 8 0v13-8a4 4 0 0 1 8 0v14l4-5c3-4 9 0 6 4L47 51c-3 4-7 6-13 6h-5c-7 0-11-3-15-8l-7-9c-3-4 2-9 6-5z" />
          <path d="M23 31v7M31 30v8M39 31v7" />
        </svg>
      </button>

      {!optionsOpen && !inventoryOpen && !dialogueView ? (
        <button
          className="fullscreen-trigger"
          type="button"
          aria-label={stageFullscreen ? "退出全螢幕" : "進入全螢幕"}
          aria-pressed={stageFullscreen}
          onClick={() => void toggleStageFullscreen()}
        >
          <span aria-hidden="true"><i /><i /><i /><i /></span>
        </button>
      ) : null}

      {survivalState.gameOverReason ? (
        <section className="survival-game-over" role="alertdialog" aria-modal="true" aria-label="遊戲結束">
          <small>SURVIVAL FAILURE</small>
          <h2>GAME OVER</h2>
          <p>
            {{
              hunger: "角色已連續五個遊戲日處於飢餓歸零狀態。",
              thirst: "角色已連續三個遊戲日處於口渴歸零狀態。",
              spirit: "角色已連續十個遊戲日處於精神歸零狀態。",
            }[survivalState.gameOverReason]}
          </p>
          <button type="button" onClick={restartSurvivalTest}>重新開始生存測試</button>
        </section>
      ) : null}

      <canvas
        ref={cursorCanvasRef}
        className="cursor-layer"
        aria-hidden="true"
      />
      </main>
    </div>
  );
}
