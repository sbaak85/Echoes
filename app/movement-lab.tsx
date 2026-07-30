"use client";

import { useEffect, useRef, useState } from "react";
import mapTest01Scene from "../public/maps/map_test01.scene.json";
import {
  AUDIO_EVENT_CONFIG,
  AudioEventManager,
  type AudioEventName,
} from "./audio-event-manager";

type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
type Point = { x: number; y: number };
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
  pickRadius?: number;
  activationDistance?: number;
  action?: string;
  type?: "dialogue";
  verb?: string;
  dialogue?: {
    characterDelaySeconds?: number;
    speakers?: string[];
    lines: Array<{ speaker?: string; text: string }>;
  };
};
type PendingInteraction = {
  interactable: SceneInteractable;
  interactionPoint?: InteractionPoint;
  source: "gamepad" | "pointer" | "keyboard";
};
type DialoguePlayback = {
  interactable: SceneInteractable;
  lineIndex: number;
  pageIndex: number;
  pages: string[];
};
type DialogueView = { speaker: string; text: string } | null;
type DialogueTyping = {
  characters: string[];
  visibleCount: number;
  speaker: string;
  delayMilliseconds: number;
  timerId: number | null;
};
type MovementGuide = {
  id: string;
  label: string;
  points: Point[];
  width?: number;
  bidirectional?: boolean;
};

type SceneFile = {
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
const SCENE_INTERACTABLES = SCENE_DATA.interactables ?? [];
const SCENE_MOVEMENT_GUIDES = SCENE_DATA.movementGuides ?? [];

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

const GAME_DAY_REAL_DURATION_MS = 60 * 60 * 1000;
const GAME_START_TIME_MINUTES = 6 * 60;
const SURVIVAL_STATS = [
  { id: "stamina", label: "體力", symbol: "♥", value: 100 },
  { id: "hunger", label: "飢餓", symbol: "♨", value: 100 },
  { id: "thirst", label: "口渴", symbol: "◒", value: 100 },
  { id: "spirit", label: "精神", symbol: "✦", value: 100 },
] as const;

const HOTBAR_ITEMS = [
  { id: "medkit", name: "醫療包", symbol: "+", count: 2 },
  { id: "water", name: "純淨水", symbol: "◉", count: 3 },
  { id: "ration", name: "能量棒", symbol: "▰", count: 4 },
  { id: "flare", name: "照明棒", symbol: "✦", count: 2 },
  { id: "crystal", name: "結晶碎片", symbol: "◆", count: 12 },
  { id: "rope", name: "工具繩", symbol: "∞", count: 1 },
  { id: "datapad", name: "資料板", symbol: "▤", count: 1 },
] as const;

type InventoryCategory = "all" | "resource" | "tool" | "quest" | "main";

const INVENTORY_CATEGORIES: Array<{ id: InventoryCategory; label: string }> = [
  { id: "all", label: "全部" },
  { id: "resource", label: "資源" },
  { id: "tool", label: "道具" },
  { id: "quest", label: "任務道具" },
  { id: "main", label: "主線道具" },
];

const INVENTORY_ITEMS = [
  { id: "crystal-shard", name: "藍色晶體碎片", symbol: "◆", count: 12, weight: 0.2, category: "resource", description: "帶有微弱共振反應的晶體碎片，可作為能源與精密裝置的材料。" },
  { id: "metal-parts", name: "金屬零件", symbol: "⚙", count: 24, weight: 0.4, category: "resource", description: "從舊設備拆下的通用機械零件。" },
  { id: "fiber-bundle", name: "纖維束", symbol: "≋", count: 15, weight: 0.15, category: "resource", description: "耐磨且富有韌性的植物纖維。" },
  { id: "water-bottle", name: "淨水瓶", symbol: "◉", count: 5, weight: 0.8, category: "resource", description: "經過濾的飲用水，可恢復口渴數值。" },
  { id: "emergency-ration", name: "緊急口糧", symbol: "▰", count: 8, weight: 0.35, category: "resource", description: "便於攜帶的高熱量壓縮食品。" },
  { id: "alien-spore", name: "外星種子", symbol: "✺", count: 3, weight: 0.1, category: "resource", description: "來源不明的活性種子，仍在緩慢脈動。" },
  { id: "utility-rope", name: "繩索", symbol: "∞", count: 6, weight: 0.7, category: "tool", description: "可用於攀爬、固定與臨時修繕。" },
  { id: "scanner-parts", name: "掃描器零件", symbol: "◫", count: 7, weight: 0.3, category: "tool", description: "適用於便攜掃描器的替換模組。" },
  { id: "repair-kit", name: "修理工具", symbol: "⌘", count: 1, weight: 1.8, category: "tool", description: "維修野外設備使用的基礎工具組。" },
  { id: "tracking-module", name: "訊號模組", symbol: "◈", count: 4, weight: 0.25, category: "tool", description: "能夠標定近距離異常訊號來源。" },
  { id: "time-crystal", name: "時間定位晶體", symbol: "♢", count: 1, weight: 0.8, category: "main", description: "內部封存著扭曲的時間共振頻率，似乎能標記並導引過去的特定位置。" },
  { id: "navigation-data", name: "飛船導航資料", symbol: "▤", count: 1, weight: 0.2, category: "quest", description: "從墜落飛船中取出的導航資料。" },
  { id: "memory-charm", name: "遺留下的記憶物", symbol: "◍", count: 2, weight: 0.1, category: "quest", description: "一件承載著陌生記憶的隨身物品。" },
  { id: "ancient-plate", name: "古代符號板", symbol: "▥", count: 1, weight: 0.6, category: "quest", description: "刻著尚未解讀符號的古老金屬板。" },
  { id: "medkit", name: "醫療包", symbol: "+", count: 3, weight: 1.1, category: "tool", description: "包含基礎止血與傷口處理用品。" },
  { id: "lantern", name: "照明燈", symbol: "✦", count: 2, weight: 0.9, category: "tool", description: "適合遺跡探索的耐用照明設備。" },
  { id: "battery", name: "電池組", symbol: "▣", count: 6, weight: 0.5, category: "resource", description: "可為小型電子設備供電。" },
  { id: "energy-cell", name: "能量單元", symbol: "●", count: 4, weight: 0.45, category: "resource", description: "具高密度儲能能力的標準單元。" },
  { id: "metal-scrap", name: "金屬碎片", symbol: "⬟", count: 18, weight: 0.2, category: "resource", description: "可重新熔製利用的金屬廢料。" },
  { id: "synthetic-cloth", name: "合成布料", symbol: "▧", count: 9, weight: 0.18, category: "resource", description: "輕薄且防水的合成纖維布。" },
] as const;

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

function findInteractableAt(point: Point) {
  let nearest: SceneInteractable | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  SCENE_INTERACTABLES.forEach((interactable) => {
    if (interactable.points && interactable.points.length >= 3) {
      if (pointInPolygon(point, interactable.points)) {
        nearest = interactable;
        nearestDistance = 0;
      }
      return;
    }
    if (!interactable.position) return;
    const distance = Math.hypot(point.x - interactable.position.x, point.y - interactable.position.y);
    if (distance <= (interactable.pickRadius ?? 32) && distance < nearestDistance) {
      nearest = interactable;
      nearestDistance = distance;
    }
  });

  return nearest;
}

function findInteractableTouching(point: Point, radius: number) {
  return SCENE_INTERACTABLES.find((interactable) =>
    isTouchingInteractable(point, radius, interactable),
  ) ?? null;
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
  const lines = interactable.dialogue?.lines ?? [];
  for (let index = lineIndex; index >= 0; index -= 1) {
    const speaker = lines[index]?.speaker?.trim();
    if (speaker) return speaker;
  }
  return interactable.dialogue?.speakers?.[0]?.trim() || "Sbaak";
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

function makeChromaKeySprite(image: HTMLImageElement) {
  const scale = Math.min(1, 720 / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const working = document.createElement("canvas");
  working.width = width;
  working.height = height;
  const context = working.getContext("2d", { willReadFrequently: true });

  if (!context) return working;

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

  if (minX > maxX || minY > maxY) return working;

  const padding = 4;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  const cropped = document.createElement("canvas");
  cropped.width = maxX - minX + 1;
  cropped.height = maxY - minY + 1;
  cropped
    .getContext("2d")
    ?.drawImage(
      working,
      minX,
      minY,
      cropped.width,
      cropped.height,
      0,
      0,
      cropped.width,
      cropped.height,
    );
  return cropped;
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

export function MovementLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const nativeGamepadRef = useRef<NativeGamepadState>(
    EMPTY_NATIVE_GAMEPAD_STATE,
  );
  const speedRef = useRef(210);
  const sizeRef = useRef(142);
  const collisionSlideToleranceRef = useRef(0.55);
  const showPlayerCollisionRef = useRef(false);
  const showSceneCollisionRef = useRef(false);
  const bgmEnabledRef = useRef(true);
  const bgmVolumeRef = useRef(AUDIO_EVENT_CONFIG.bgm.volume);
  const virtualCursorControlsEnabledRef = useRef(true);
  const audioEventManagerRef = useRef<AudioEventManager | null>(null);
  const requestBgmPlaybackRef = useRef<() => void>(() => {});
  const optionsOpenRef = useRef(false);
  const inventoryOpenRef = useRef(false);
  const optionsTabRef = useRef<OptionsTab>("display");
  const optionsMenuSelectionRef = useRef<OptionsMenuItem>(
    OPTIONS_MENU_ITEMS[0],
  );
  const dialoguePlaybackRef = useRef<DialoguePlayback | null>(null);
  const dialogueTypingRef = useRef<DialogueTyping | null>(null);
  const hotbarFeedbackTimerRef = useRef<number | null>(null);
  const hotbarUseSequenceRef = useRef(0);
  const activeHotbarSlotRef = useRef(0);
  const selectedInventoryIndexRef = useRef(10);
  const inventoryGamepadModeRef = useRef<"cursor" | "dpad">("dpad");

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
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
    useState<DialogueTextSize>(getDefaultDialogueTextSize);
  const [facing, setFacing] = useState<Direction>(SCENE_START_FACING);
  const [moving, setMoving] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [gamepadLabel, setGamepadLabel] = useState<string | null>(null);
  const [gamepadDiagnostic, setGamepadDiagnostic] = useState(
    "等待手把輸入…",
  );
  const [activeKeyboardKeys, setActiveKeyboardKeys] = useState<string[]>([]);
  const [interactionJustTriggered, setInteractionJustTriggered] = useState(false);
  const [gameClock, setGameClock] = useState({ day: 1, hour: 6, minute: 0 });
  const [questCollapsed, setQuestCollapsed] = useState(false);
  const [activeHotbarSlot, setActiveHotbarSlot] = useState(0);
  const [inventoryCategory, setInventoryCategory] = useState<InventoryCategory>("all");
  const [inventoryPage, setInventoryPage] = useState(0);
  const [selectedInventoryIndex, setSelectedInventoryIndex] = useState(10);
  const [hotbarFeedback, setHotbarFeedback] = useState<{
    message: string;
    sequence: number;
    slotIndex: number;
  } | null>(null);
  const [dialogueView, setDialogueView] = useState<DialogueView>(null);

  useEffect(() => {
    const startedAt = performance.now();

    const updateGameClock = () => {
      const elapsedRealMilliseconds = performance.now() - startedAt;
      const elapsedGameMinutes = Math.floor(
        (elapsedRealMilliseconds / GAME_DAY_REAL_DURATION_MS) * 24 * 60,
      );
      const totalMinutes = GAME_START_TIME_MINUTES + elapsedGameMinutes;
      const day = Math.floor(totalMinutes / (24 * 60)) + 1;
      const minutesInDay = totalMinutes % (24 * 60);
      const hour = Math.floor(minutesInDay / 60);
      const minute = minutesInDay % 60;

      setGameClock((current) =>
        current.day === day && current.hour === hour && current.minute === minute
          ? current
          : { day, hour, minute },
      );
    };

    updateGameClock();
    const timer = window.setInterval(updateGameClock, 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (hotbarFeedbackTimerRef.current !== null) {
      window.clearTimeout(hotbarFeedbackTimerRef.current);
    }
  }, []);

  const activateHotbarItem = (slotIndex: number) => {
    if (optionsOpenRef.current || inventoryOpenRef.current || dialoguePlaybackRef.current) return;
    const item = HOTBAR_ITEMS[slotIndex];
    if (!item) return;

    hotbarUseSequenceRef.current += 1;
    activeHotbarSlotRef.current = slotIndex;
    setActiveHotbarSlot(slotIndex);
    setHotbarFeedback({
      message: `嘗試使用「${item.name}」· 功能尚未開放`,
      sequence: hotbarUseSequenceRef.current,
      slotIndex,
    });

    if (hotbarFeedbackTimerRef.current !== null) {
      window.clearTimeout(hotbarFeedbackTimerRef.current);
    }
    hotbarFeedbackTimerRef.current = window.setTimeout(() => {
      setHotbarFeedback(null);
      hotbarFeedbackTimerRef.current = null;
    }, 1100);
  };

  const selectHotbarSlot = (offset: number) => {
    setActiveHotbarSlot((current) => {
      const next = (current + offset + HOTBAR_ITEMS.length) % HOTBAR_ITEMS.length;
      activeHotbarSlotRef.current = next;
      return next;
    });
  };

  const selectInventoryItem = (slotIndex: number) => {
    if (!INVENTORY_ITEMS[slotIndex]) return;
    selectedInventoryIndexRef.current = slotIndex;
    setSelectedInventoryIndex(slotIndex);
  };

  const activateInventoryItem = (slotIndex: number) => {
    const item = INVENTORY_ITEMS[slotIndex];
    if (!item) return;
    selectInventoryItem(slotIndex);
    hotbarUseSequenceRef.current += 1;
    setHotbarFeedback({
      message: `嘗試使用「${item.name}」· 功能尚未開放`,
      sequence: hotbarUseSequenceRef.current,
      slotIndex: -1,
    });
    if (hotbarFeedbackTimerRef.current !== null) {
      window.clearTimeout(hotbarFeedbackTimerRef.current);
    }
    hotbarFeedbackTimerRef.current = window.setTimeout(() => {
      setHotbarFeedback(null);
      hotbarFeedbackTimerRef.current = null;
    }, 1100);
  };

  const changeInventoryCategory = (category: InventoryCategory) => {
    setInventoryCategory(category);
    setInventoryPage(0);
    const currentItem = INVENTORY_ITEMS[selectedInventoryIndexRef.current];
    if (category !== "all" && currentItem.category !== category) {
      const nextIndex = INVENTORY_ITEMS.findIndex((item) => item.category === category);
      if (nextIndex >= 0) selectInventoryItem(nextIndex);
    }
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

  const closeDialogue = () => {
    stopDialogueTyping();
    dialoguePlaybackRef.current = null;
    document.documentElement.classList.remove("dialogue-cursor-active");
    setDialogueView(null);
  };

  const showDialoguePage = (playback: DialoguePlayback) => {
    const line = playback.interactable.dialogue?.lines[playback.lineIndex];
    if (!line) {
      closeDialogue();
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

    if (delayMilliseconds <= 0) {
      typing.visibleCount = characters.length;
      setDialogueView({ speaker, text: characters.join("") });
    } else {
      requestDialogueTypingAudioPlayback(true);
      revealNextCharacter();
    }
  };

  const openDialogue = (interactable: SceneInteractable) => {
    const lines = interactable.dialogue?.lines?.filter((line) => line.text.trim()) ?? [];
    const effectiveLines = lines.length > 0 ? lines : [{ speaker: "", text: "..." }];
    const normalized = {
      ...interactable,
      dialogue: {
        characterDelaySeconds:
          interactable.dialogue?.characterDelaySeconds ?? 0.02,
        speakers:
          interactable.dialogue?.speakers?.filter((speaker) => speaker.trim()) ??
          ["Sbaak", "Echo"],
        lines: effectiveLines,
      },
    };
    const playback: DialoguePlayback = {
      interactable: normalized,
      lineIndex: 0,
      pageIndex: 0,
      pages: splitDialoguePages(effectiveLines[0].text),
    };
    dialoguePlaybackRef.current = playback;
    document.documentElement.classList.add("dialogue-cursor-active");
    playOneShotAudio("dialogueOpened");
    showDialoguePage(playback);
  };

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
    closeDialogue();
    return true;
  };

  const setOptionsPanelOpen = (open: boolean) => {
    if (open) {
      inventoryOpenRef.current = false;
      setInventoryOpen(false);
    }
    optionsOpenRef.current = open;
    setOptionsOpen(open);

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

  const setInventoryPanelOpen = (open: boolean) => {
    inventoryOpenRef.current = open;
    setInventoryOpen(open);
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

  const moveOptionsMenuSelection = (direction: number) => {
    const items = OPTIONS_TAB_ITEMS[optionsTabRef.current];
    const currentIndex = items.indexOf(optionsMenuSelectionRef.current);
    const nextIndex = currentIndex + Math.sign(direction);
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setOptionsMenuSelectionValue(items[nextIndex]);
  };

  const changeOptionsTab = (direction: number) => {
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
    }
  };

  const adjustOptionsMenuSelection = (direction: number) => {
    switch (optionsMenuSelectionRef.current) {
      case "dialogue-text-size": {
        const sizes: DialogueTextSize[] = ["small", "medium", "large"];
        const currentIndex = sizes.indexOf(dialogueTextSize);
        const nextIndex =
          (currentIndex + Math.sign(direction) + sizes.length) % sizes.length;
        setDialogueTextSize(sizes[nextIndex]);
        break;
      }
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
    if (!canvas || !cursorCanvas) return;

    const context = canvas.getContext("2d");
    const cursorContext = cursorCanvas.getContext("2d");
    if (!context || !cursorContext) return;

    const pressedKeys = new Set<string>();
    const sprites = new Map<Direction, HTMLCanvasElement>();
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
    let keyboardInteractionKey = (localStorage.getItem("echoes:interaction-key") ?? "e").toLowerCase();
    let keyboardInteractionLabel = localStorage.getItem("echoes:interaction-key-label") ?? keyboardInteractionKey.toUpperCase();

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

    Object.entries(SPRITE_SOURCES).forEach(([direction, source]) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        sprites.set(direction as Direction, makeChromaKeySprite(image));
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
      if (
        key === "tab" &&
        !optionsOpenRef.current &&
        !dialoguePlaybackRef.current
      ) {
        event.preventDefault();
        if (!event.repeat) setInventoryPanelOpen(!inventoryOpenRef.current);
        return;
      }
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
      if (key === "escape" && optionsOpenRef.current) {
        event.preventDefault();
        setOptionsPanelOpen(false);
        return;
      }
      if (
        key === "q" &&
        !optionsOpenRef.current &&
        !inventoryOpenRef.current &&
        !dialoguePlaybackRef.current
      ) {
        event.preventDefault();
        if (!event.repeat) setQuestCollapsed((current) => !current);
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
          if (!advanceDialogue()) activateBestInteraction("keyboard");
        }
        return;
      }
      if (
        /^[1-7]$/.test(key) &&
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
      pressedKeys.add(key);
      setActiveKeyboardKeys(Array.from(pressedKeys));
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
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

    const triggerInteraction = (
      interactable: SceneInteractable,
      source: PendingInteraction["source"],
    ) => {
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
      if ((interactable.type ?? "dialogue") === "dialogue") openDialogue(interactable);
      if (source === "pointer") pointerInteractionTriggeredId = interactable.id;
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
    ) => {
      const interactable =
        forcedInteractable ?? findInteractableAt(requestedDestination);
      if (
        source === "pointer" &&
        interactable &&
        pointerInteractionTriggeredId === interactable.id
      ) {
        return;
      }
      const interactionPoint = interactable
        ? findNearestInteractionPoint(interactable, player)
        : undefined;
      const destination = interactionPoint ?? requestedDestination;
      const path = interactable
        ? interactionPoint
          ? findReachableInteractionPath(destination)
          : findPath(player, requestedDestination, sizeRef.current * 0.14)
        : findPath(player, destination, sizeRef.current * 0.14);

      autoPath = path ?? [];
      autoDestination = path !== null ? destination : null;
      pendingInteraction =
        interactable && path !== null
          ? { interactable, interactionPoint, source }
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
          point: interactable ? getInteractableCenter(interactable) : requestedDestination,
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
      const closeEnough = interactionPoint
        ? Math.hypot(
            player.x - interactionPoint.x,
            player.y - interactionPoint.y,
          ) <= (interactable.activationDistance ?? 52)
        : isTouchingInteractable(player, sizeRef.current * 0.14, interactable);

      if (closeEnough) {
        if (interactionPoint?.facing) {
          currentFacing = interactionPoint.facing;
        }
        triggerInteraction(interactable, source);
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
      const canUseCursorForSource =
        source !== "gamepad" || virtualCursorControlsEnabledRef.current;
      const cursorTarget = canUseCursorForSource && virtualCursorVisible
        ? findInteractableAt(screenToWorld(virtualCursor))
        : null;
      const playerTarget = findInteractableTouching(player, sizeRef.current * 0.14);
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
        getInteractionPoints(target).length === 0
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
      return Number.isInteger(index) && INVENTORY_ITEMS[index] ? index : null;
    };

    const assignHeldPointerAction = (force: boolean) => {
      if (!heldPointerScreen) return;

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
      assignWorldAction(
        worldTarget,
        "pointer",
        false,
        undefined,
        force,
      );
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
      const visualMargin = 72;
      touchJoystickPointerId = event.pointerId;
      touchJoystickVisible = true;
      touchJoystick.inputOrigin.x = screenPoint.x;
      touchJoystick.inputOrigin.y = screenPoint.y;
      touchJoystick.origin.x = clamp(viewportWidth * 0.13, visualMargin, viewportWidth - visualMargin);
      touchJoystick.origin.y = clamp(viewportHeight * 0.7, visualMargin, viewportHeight - visualMargin);
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

      event.preventDefault();
      activeInputMode = "keyboard-mouse";
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
      pointerInteractionTriggeredId = null;
      touchEffect = null;
      canvas.setPointerCapture(event.pointerId);
      assignHeldPointerAction(true);
      canvas.focus({ preventScroll: true });
    };

    const onDialoguePointerDown = (event: PointerEvent) => {
      if (!dialoguePlaybackRef.current || !event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
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
      deactivateGamepadCursor();
      setGamepadInputCursorHidden(false);
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
      const hadPointerCapture = canvas.hasPointerCapture(event.pointerId);

      heldPointerId = null;
      heldPointerScreen = null;
      heldPointerRetargetElapsed = 0;
      heldPointerDuration = 0;
      heldPointerContinuous = false;
      lastHeldPointerWorldTarget = null;
      pointerInteractionTriggeredId = null;

      if (hadPointerCapture) canvas.releasePointerCapture(event.pointerId);
      if (shouldShowTapEffect) {
        assignScreenAction(releasedScreen, "pointer");
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
      SCENE_INTERACTABLES.forEach((interactable) => {
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
      const sprite = sprites.get(currentFacing);
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
      if (!virtualCursorControlsEnabledRef.current || !virtualCursorVisible) return;

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
      const playerTarget = findInteractableTouching(player, radius);
      const cursorTarget = virtualCursorVisible
        ? findInteractableAt(screenToWorld(virtualCursor))
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
        if (inventoryOpenRef.current) inventoryGamepadModeRef.current = "cursor";
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
      if (startJustPressed) toggleOptionsPanel();
      wasGamepadStartPressed = gamepadInput.startPressed;

      const backJustPressed =
        gamepadInput.connected &&
        gamepadInput.backPressed &&
        !wasGamepadBackPressed;
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
        setOptionsPanelOpen(false);
        optionsMenuOpen = false;
      } else if (backJustPressed && !dialoguePlaybackRef.current) {
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
        if (leftBumperJustPressed) changeOptionsTab(-1);
        if (rightBumperJustPressed) changeOptionsTab(1);

        const dpadVertical = Math.sign(gamepadInput.dpadY);
        if (dpadVertical === 0) {
          heldGamepadDpadY = 0;
          gamepadDpadYRepeatSeconds = 0;
        } else if (dpadVertical !== heldGamepadDpadY) {
          heldGamepadDpadY = dpadVertical;
          gamepadDpadYRepeatSeconds = GAMEPAD_MENU_REPEAT_DELAY_SECONDS;
          moveOptionsMenuSelection(dpadVertical);
        } else {
          gamepadDpadYRepeatSeconds -= deltaTime;
          if (gamepadDpadYRepeatSeconds <= 0) {
            moveOptionsMenuSelection(dpadVertical);
            gamepadDpadYRepeatSeconds += GAMEPAD_MENU_REPEAT_INTERVAL_SECONDS;
          }
        }

        const dpadHorizontal = Math.sign(gamepadInput.dpadX);
        if (dpadHorizontal === 0) {
          heldGamepadDpadX = 0;
          gamepadDpadXRepeatSeconds = 0;
        } else if (dpadHorizontal !== heldGamepadDpadX) {
          heldGamepadDpadX = dpadHorizontal;
          gamepadDpadXRepeatSeconds = GAMEPAD_MENU_REPEAT_DELAY_SECONDS;
          adjustOptionsMenuSelection(dpadHorizontal);
        } else {
          gamepadDpadXRepeatSeconds -= deltaTime;
          if (gamepadDpadXRepeatSeconds <= 0) {
            adjustOptionsMenuSelection(dpadHorizontal);
            gamepadDpadXRepeatSeconds += GAMEPAD_MENU_REPEAT_INTERVAL_SECONDS;
          }
        }

        if (
          gamepadInput.confirmPressed &&
          !wasGamepadConfirmPressed
        ) {
          const uiResult = activateVirtualCursorUi();
          if (uiResult !== "activated") activateOptionsMenuSelection();
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

        const dpadVertical = Math.sign(gamepadInput.dpadY);
        if (dpadVertical === 0) {
          heldGamepadDpadY = 0;
          gamepadDpadYRepeatSeconds = 0;
        } else if (dpadVertical !== heldGamepadDpadY) {
          inventoryGamepadModeRef.current = "dpad";
          virtualCursorVisible = false;
          deactivateGamepadCursor();
          heldGamepadDpadY = dpadVertical;
          gamepadDpadYRepeatSeconds = GAMEPAD_MENU_REPEAT_DELAY_SECONDS;
          moveInventorySelection(0, dpadVertical);
        } else {
          gamepadDpadYRepeatSeconds -= deltaTime;
          if (gamepadDpadYRepeatSeconds <= 0) {
            inventoryGamepadModeRef.current = "dpad";
            moveInventorySelection(0, dpadVertical);
            gamepadDpadYRepeatSeconds += GAMEPAD_MENU_REPEAT_INTERVAL_SECONDS;
          }
        }

        const dpadHorizontal = Math.sign(gamepadInput.dpadX);
        if (dpadHorizontal === 0) {
          heldGamepadDpadX = 0;
          gamepadDpadXRepeatSeconds = 0;
        } else if (dpadHorizontal !== heldGamepadDpadX) {
          inventoryGamepadModeRef.current = "dpad";
          virtualCursorVisible = false;
          deactivateGamepadCursor();
          heldGamepadDpadX = dpadHorizontal;
          gamepadDpadXRepeatSeconds = GAMEPAD_MENU_REPEAT_DELAY_SECONDS;
          moveInventorySelection(dpadHorizontal, 0);
        } else {
          gamepadDpadXRepeatSeconds -= deltaTime;
          if (gamepadDpadXRepeatSeconds <= 0) {
            inventoryGamepadModeRef.current = "dpad";
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
        const hotbarDpadHorizontal = Math.sign(gamepadInput.dpadX);
        if (hotbarDpadHorizontal !== 0 && gameplayHotbarDpadX === 0) {
          selectHotbarSlot(hotbarDpadHorizontal);
        }
        gameplayHotbarDpadX = hotbarDpadHorizontal;

        if (
          gamepadInput.connected &&
          gamepadInput.hotbarUsePressed &&
          !wasGamepadHotbarUsePressed
        ) {
          activateHotbarItem(activeHotbarSlotRef.current);
        }

        if (
          !startJustPressed &&
          gamepadInput.connected &&
          gamepadInput.actionPressed &&
          !wasGamepadActionPressed
        ) {
          const uiResult = activateVirtualCursorUi();
          if (uiResult === "none") {
            if (virtualCursorControlsEnabledRef.current) activateGamepadCursor();
            activateBestInteraction("gamepad");
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
      if (dialoguePlaybackRef.current || inventoryOpenRef.current) {
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
              Math.max(speedRef.current * deltaTime, Number.EPSILON),
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
              const replannedPath = pendingInteraction?.interactionPoint
                ? findReachableInteractionPath(autoDestination)
                : findPath(player, autoDestination, guideRadius);
              autoPath = replannedPath ?? [];
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
        const distance = speedRef.current * deltaTime * inputStrength;
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

      const actualMovementDistance = Math.hypot(
        player.x - movementStart.x,
        player.y - movementStart.y,
      );
      const actualMovementSpeed =
        actualMovementDistance / Math.max(deltaTime, Number.EPSILON);
      const isActuallyMoving =
        actualMovementSpeed >= FOOTSTEP_MIN_MOVEMENT_SPEED;
      updateFootstepAudio(actualMovementSpeed, deltaTime);

      if (isActuallyMoving !== wasMoving) {
        wasMoving = isActuallyMoving;
        setMoving(isActuallyMoving);
      }

      setFacing((previous) =>
        previous === currentFacing ? previous : currentFacing,
      );

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
      drawSceneCollision();
      drawPlayer();
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

  const filteredInventoryItems = INVENTORY_ITEMS
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => inventoryCategory === "all" || item.category === inventoryCategory);
  const inventoryPageCount = Math.max(1, Math.ceil(filteredInventoryItems.length / 16));
  const currentInventoryPage = Math.min(inventoryPage, inventoryPageCount - 1);
  const visibleInventoryItems = filteredInventoryItems.slice(
    currentInventoryPage * 16,
    currentInventoryPage * 16 + 16,
  );
  const selectedInventoryItem = INVENTORY_ITEMS[selectedInventoryIndex] ?? INVENTORY_ITEMS[0];

  const changeInventoryPage = (offset: number) => {
    const nextPage = (currentInventoryPage + offset + inventoryPageCount) % inventoryPageCount;
    setInventoryPage(nextPage);
    const firstItem = filteredInventoryItems[nextPage * 16];
    if (firstItem) selectInventoryItem(firstItem.index);
  };

  return (
    <div
      className="game-viewport"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="game-backdrop"
        style={{ backgroundImage: `url(${MAP_SOURCE})` }}
        aria-hidden="true"
      />
      <main className="game-shell">
      <canvas
        ref={canvasRef}
        className={`game-canvas${virtualCursorControlsEnabled ? "" : " physical-cursor-enabled"}`}
        aria-label="八方向角色移動地圖測試場景"
        tabIndex={0}
      />

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

      <aside className={`survival-hud${inventoryOpen ? " is-inventory-open" : ""}`} aria-label="生存狀態指示表">
        <header className="survival-clock">
          <span>
            Day <strong>{gameClock.day}</strong>
          </span>
          <span>
            <i aria-hidden="true">{gameClock.hour >= 6 && gameClock.hour < 18 ? "☀" : "☾"}</i>
            <strong>{String(gameClock.hour).padStart(2, "0")}:{String(gameClock.minute).padStart(2, "0")}</strong>
          </span>
        </header>
        <div className="survival-panel">
          {SURVIVAL_STATS.map((stat) => (
            <div className={`survival-stat is-${stat.id}`} key={stat.id}>
              <span className="survival-stat-icon" aria-hidden="true">{stat.symbol}</span>
              <span className="survival-stat-label">{stat.label}</span>
              <output>{stat.value}/100</output>
              <span className="survival-meter" aria-hidden="true">
                <i style={{ width: `${stat.value}%` }} />
              </span>
            </div>
          ))}
        </div>
      </aside>

      <aside
        className={`quest-hud${questCollapsed ? " is-collapsed" : ""}`}
        aria-label="目前任務目標"
      >
        <header className="quest-header">
          <span className="quest-type-icon" aria-hidden="true">⌂</span>
          <div className="quest-title">
            <small>MAIN OBJECTIVE</small>
            <strong>主線目標：調查未知訊號</strong>
          </div>
          <output className="quest-summary-progress" aria-label="任務總進度">
            0/2
          </output>
          <button
            className="quest-collapse"
            type="button"
            aria-label={questCollapsed ? "展開任務提示" : "收折任務提示"}
            aria-expanded={!questCollapsed}
            onClick={() => setQuestCollapsed((current) => !current)}
          >
            <span aria-hidden="true" />
          </button>
        </header>
        {!questCollapsed ? (
          <div className="quest-objectives">
            <div className="quest-objective">
              <span>前往訊號來源</span>
              <output>0/1</output>
              <i aria-hidden="true"><b style={{ width: "0%" }} /></i>
            </div>
            <div className="quest-objective">
              <span>收集必要物資</span>
              <output>0/3</output>
              <i aria-hidden="true"><b style={{ width: "0%" }} /></i>
            </div>
          </div>
        ) : null}
      </aside>

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
          {HOTBAR_ITEMS.map((item, index) => {
            const isUsing = hotbarFeedback?.slotIndex === index;
            return (
              <button
                className={`hotbar-slot${activeHotbarSlot === index ? " is-selected" : ""}${isUsing ? " is-using" : ""}`}
                key={`${item.id}-${isUsing ? hotbarFeedback.sequence : 0}`}
                type="button"
                aria-label={`${index + 1}：使用${item.name}，持有 ${item.count}`}
                title={`${index + 1} · ${item.name}`}
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
                <span className="hotbar-item-icon" aria-hidden="true">{item.symbol}</span>
                <span className="hotbar-count" aria-hidden="true">{item.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {inventoryOpen ? (
        <div className="inventory-overlay">
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
                  <span>▣</span><strong>32.6 / 60.0 kg</strong>
                  <i><b style={{ width: "54%" }} /></i>
                </div>
                <section className="inventory-category-stats">
                  <h4>分類統計</h4>
                  <p><span>♣　資源</span><strong>22</strong></p>
                  <p><span>⌘　道具</span><strong>15</strong></p>
                  <p><span>⚑　任務道具</span><strong>7</strong></p>
                  <p><span>♔　主線道具</span><strong>5</strong></p>
                </section>
              </aside>

              <article className="inventory-selected-panel">
                <header><span>選中道具</span><small>SELECTED ITEM</small></header>
                <div className="inventory-feature-art">
                  <span aria-hidden="true">{selectedInventoryItem.symbol}</span>
                </div>
                <section className="inventory-selected-copy">
                  <h3>{selectedInventoryItem.name}</h3>
                  <strong>{selectedInventoryItem.category === "main" ? "♔ 主線道具" : selectedInventoryItem.category === "quest" ? "⚑ 任務道具" : selectedInventoryItem.category === "tool" ? "⌘ 道具" : "♣ 資源"}</strong>
                  <p>{selectedInventoryItem.description}</p>
                  <output>重量　{selectedInventoryItem.weight.toFixed(2)} kg　　持有 ×{selectedInventoryItem.count}</output>
                </section>
                <div className="inventory-selected-actions">
                  <button type="button" onClick={() => activateInventoryItem(selectedInventoryIndex)}>使用</button>
                  <button type="button">查看</button>
                  <button type="button">標記</button>
                  <button className="is-danger" type="button">丟棄</button>
                </div>
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
                  {visibleInventoryItems.map(({ item, index }) => (
                    <button
                      className={`inventory-item is-${item.category}${selectedInventoryIndex === index ? " is-selected" : ""}`}
                      type="button"
                      key={item.id}
                      data-inventory-index={index}
                      aria-label={`${item.name}，持有 ${item.count}`}
                      onClick={() => selectInventoryItem(index)}
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
            <strong>Tab / B　關閉背包</strong>
            <div className="inventory-currency"><span>◉　23,450</span><span>▣　32.6 / 60.0 kg</span></div>
          </footer>
        </div>
      ) : null}

      {optionsOpen ? (
        <div
          className="options-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOptionsPanelOpen(false);
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
                    <span className="gamepad-menu-hint">START：開啟／關閉 · LB／RB：切換頁籤 · 十字鍵上下：選擇 · 左右：調整 · A：確認 · B：關閉 · 左搖桿：角色移動</span>
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
                </>
              ) : null}
            </div>

            <footer className="options-footer">
              <span>START／齒輪：關閉</span><span>LB／RB：切換頁籤 · 十字鍵：選擇／調整 · A：確認 · B：關閉</span>
            </footer>
          </section>
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
        <span className="controls-subtitle-desktop">WASD／方向鍵、滑鼠點擊、左搖桿移動 · 右搖桿游標 · START：選項</span>
        <span className="controls-subtitle-touch">上半部點擊前往 · 下半部按住移動 · START：選項</span>
      </p>

      <section className="movement-status" aria-live="polite">
        {interactionJustTriggered ? "INTERACTIVE" : moving ? "MOVING" : "FACING"}
      </section>

      <canvas
        ref={cursorCanvasRef}
        className="cursor-layer"
        aria-hidden="true"
      />
      <div className="game-entry-fade" aria-hidden="true" />
      </main>
    </div>
  );
}
