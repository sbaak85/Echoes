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
  N: "N — 背面",
  NE: "NE — 右後",
  E: "E — 右側",
  SE: "SE — 右前",
  S: "S — 正面",
  SW: "SW — 左前",
  W: "W — 左側",
  NW: "NW — 左後",
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

const DEBUG_MENU_ITEMS = [
  "player-collision",
  "scene-collision",
  "bgm-enabled",
  "bgm-volume",
  "movement-speed",
  "character-size",
  "collision-slide-tolerance",
] as const;

type DebugMenuItem = (typeof DEBUG_MENU_ITEMS)[number];

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
  label: string | null;
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
const XINPUT_BUTTON_A = 0x1000;
const XINPUT_BUTTON_B = 0x2000;
const XINPUT_BUTTON_X = 0x4000;

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
      label: null,
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
    label: `Windows XInput Controller ${state.index + 1}`,
    secondaryActionPressed: (state.buttons & XINPUT_BUTTON_X) !== 0,
    startPressed: (state.buttons & XINPUT_BUTTON_START) !== 0,
    stickX: leftX,
    stickY: leftY,
    x: dpadX || leftX,
    y: dpadY || leftY,
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
      label: null,
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
      label: null,
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
    label: gamepad.id || `Gamepad ${gamepad.index + 1}`,
    secondaryActionPressed: Boolean(gamepad.buttons[2]?.pressed),
    startPressed: Boolean(gamepad.buttons[9]?.pressed),
    stickX: applyGamepadDeadZone(gamepad.axes[0] ?? 0),
    stickY: applyGamepadDeadZone(gamepad.axes[1] ?? 0),
    x: dpadX || applyGamepadDeadZone(gamepad.axes[0] ?? 0),
    y: dpadY || applyGamepadDeadZone(gamepad.axes[1] ?? 0),
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
  const audioEventManagerRef = useRef<AudioEventManager | null>(null);
  const requestBgmPlaybackRef = useRef<() => void>(() => {});
  const debugOpenRef = useRef(false);
  const debugMenuSelectionRef = useRef<DebugMenuItem>(
    DEBUG_MENU_ITEMS[0],
  );
  const dialoguePlaybackRef = useRef<DialoguePlayback | null>(null);
  const dialogueTypingRef = useRef<DialogueTyping | null>(null);

  const [debugOpen, setDebugOpen] = useState(false);
  const [debugMenuSelection, setDebugMenuSelection] =
    useState<DebugMenuItem>(DEBUG_MENU_ITEMS[0]);
  const [showPlayerCollision, setShowPlayerCollision] = useState(false);
  const [showSceneCollision, setShowSceneCollision] = useState(false);
  const [speed, setSpeed] = useState(210);
  const [size, setSize] = useState(142);
  const [collisionSlideTolerance, setCollisionSlideTolerance] = useState(55);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [bgmVolume, setBgmVolume] = useState(
    Math.round(AUDIO_EVENT_CONFIG.bgm.volume * 100),
  );
  const [facing, setFacing] = useState<Direction>(SCENE_START_FACING);
  const [moving, setMoving] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [gamepadLabel, setGamepadLabel] = useState<string | null>(null);
  const [gamepadDiagnostic, setGamepadDiagnostic] = useState(
    "等待手把輸入…",
  );
  const [dialogueView, setDialogueView] = useState<DialogueView>(null);

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

  const setDebugPanelOpen = (open: boolean) => {
    debugOpenRef.current = open;
    setDebugOpen(open);

    if (open) {
      debugMenuSelectionRef.current = DEBUG_MENU_ITEMS[0];
      setDebugMenuSelection(DEBUG_MENU_ITEMS[0]);
    }
  };

  const toggleDebugPanel = () => {
    setDebugPanelOpen(!debugOpenRef.current);
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

  const setDebugMenuSelectionValue = (item: DebugMenuItem) => {
    debugMenuSelectionRef.current = item;
    setDebugMenuSelection(item);
  };

  const moveDebugMenuSelection = (direction: number) => {
    const currentIndex = DEBUG_MENU_ITEMS.indexOf(debugMenuSelectionRef.current);
    const nextIndex =
      (currentIndex + Math.sign(direction) + DEBUG_MENU_ITEMS.length) %
      DEBUG_MENU_ITEMS.length;
    setDebugMenuSelectionValue(DEBUG_MENU_ITEMS[nextIndex]);
  };

  const activateDebugMenuSelection = () => {
    switch (debugMenuSelectionRef.current) {
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

  const adjustDebugMenuSelection = (direction: number) => {
    switch (debugMenuSelectionRef.current) {
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
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

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
    let wasGamepadStartPressed = false;
    let heldGamepadDpadX = 0;
    let heldGamepadDpadY = 0;
    let gamepadDpadXRepeatSeconds = 0;
    let gamepadDpadYRepeatSeconds = 0;
    const virtualCursor = { x: 0, y: 0 };
    let virtualCursorPositioned = false;
    let virtualCursorVisible = false;
    let gamepadCursorActive = false;
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
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

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
      activeInputMode = "keyboard-mouse";
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
      if (!MOVEMENT_KEYS.has(key)) return;
      event.preventDefault();
      pressedKeys.add(key);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!MOVEMENT_KEYS.has(key)) return;
      event.preventDefault();
      pressedKeys.delete(key);
    };

    const onWindowBlur = () => {
      pressedKeys.clear();
      deactivateGamepadCursor();
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
      const cursorTarget = virtualCursorVisible
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
        if (source !== "keyboard" && virtualCursorVisible) {
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

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      event.preventDefault();
      activeInputMode = "keyboard-mouse";
      deactivateGamepadCursor();
      const bounds = canvas.getBoundingClientRect();
      virtualCursor.x = clamp(event.clientX - bounds.left, 0, viewportWidth);
      virtualCursor.y = clamp(event.clientY - bounds.top, 0, viewportHeight);
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

    const drawPointerCursor = (time: number) => {
      if (!virtualCursorVisible) return;

      if (dialoguePlaybackRef.current) {
        const pulse = 1 + Math.sin(time / 190) * 0.035;
        context.save();
        context.translate(virtualCursor.x, virtualCursor.y);
        context.scale(pulse, pulse);
        context.lineWidth = 2;
        context.lineJoin = "round";
        context.strokeStyle = "#e9f4ed";
        context.fillStyle = "rgba(23, 32, 29, 0.92)";
        context.shadowColor = "#61ead8";
        context.shadowBlur = 9;

        context.beginPath();
        context.moveTo(0, -11);
        context.quadraticCurveTo(-8, -16, -18, -13);
        context.lineTo(-18, 8);
        context.quadraticCurveTo(-8, 7, 0, 13);
        context.closePath();
        context.fill();
        context.stroke();

        context.beginPath();
        context.moveTo(0, -11);
        context.quadraticCurveTo(8, -16, 18, -13);
        context.lineTo(18, 8);
        context.quadraticCurveTo(8, 7, 0, 13);
        context.closePath();
        context.fill();
        context.stroke();

        context.shadowBlur = 0;
        context.beginPath();
        context.moveTo(0, -11);
        context.lineTo(0, 13);
        context.stroke();
        context.fillStyle = "#61ead8";
        for (const x of [25, 31, 37]) {
          context.beginPath();
          context.arc(x, 4, 1.7, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
        return;
      }

      const pulse = 1 + Math.sin(time / 150) * 0.07;
      const radius = 13 * pulse;
      context.save();
      context.translate(virtualCursor.x, virtualCursor.y);
      context.strokeStyle = "#80f5e7";
      context.fillStyle = "rgba(9, 25, 30, 0.86)";
      context.lineWidth = 2.2;
      context.shadowColor = "#54dfd0";
      context.shadowBlur = 11;

      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      context.shadowBlur = 0;
      context.beginPath();
      context.moveTo(-radius - 7, 0);
      context.lineTo(-radius + 2, 0);
      context.moveTo(radius - 2, 0);
      context.lineTo(radius + 7, 0);
      context.moveTo(0, -radius - 7);
      context.lineTo(0, -radius + 2);
      context.moveTo(0, radius - 2);
      context.lineTo(0, radius + 7);
      context.stroke();

      context.fillStyle = "#d9fffa";
      context.beginPath();
      context.arc(0, 0, 2.6, 0, Math.PI * 2);
      context.fill();
      context.restore();
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
        gamepadInput.backPressed ||
        gamepadInput.startPressed;
      if (gamepadInput.connected && hasGamepadActivity) {
        activeInputMode = "gamepad";
      }
      activeInteractionKeyLabel =
        activeInputMode === "gamepad" ? "A" : keyboardInteractionLabel;

      if (gamepadInput.connected !== wasGamepadConnected) {
        wasGamepadConnected = gamepadInput.connected;
        if (!gamepadInput.connected) {
          wasGamepadActionPressed = false;
          wasGamepadBackPressed = false;
          wasGamepadConfirmPressed = false;
          wasGamepadSecondaryActionPressed = false;
          wasGamepadStartPressed = false;
          heldGamepadDpadX = 0;
          heldGamepadDpadY = 0;
          gamepadDpadXRepeatSeconds = 0;
          gamepadDpadYRepeatSeconds = 0;
        }
        setGamepadConnected(gamepadInput.connected);
        setGamepadLabel(gamepadInput.label);

        if (!gamepadInput.connected) {
          if (gamepadCursorActive) {
            deactivateGamepadCursor();
            virtualCursorVisible = false;
          }
          lastGamepadDiagnostic = "";
          setGamepadDiagnostic("等待手把輸入…");
        }
      }

      const cursorInputLength = Math.hypot(
        gamepadInput.cursorX,
        gamepadInput.cursorY,
      );
      if (gamepadInput.connected && cursorInputLength > 0) {
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
      if (startJustPressed) toggleDebugPanel();
      wasGamepadStartPressed = gamepadInput.startPressed;

      const backJustPressed =
        gamepadInput.connected &&
        gamepadInput.backPressed &&
        !wasGamepadBackPressed;
      let debugMenuOpen = debugOpenRef.current;
      if (debugMenuOpen && backJustPressed) {
        setDebugPanelOpen(false);
        debugMenuOpen = false;
      }

      if (!debugMenuOpen) {
        heldGamepadDpadX = 0;
        heldGamepadDpadY = 0;
        gamepadDpadXRepeatSeconds = 0;
        gamepadDpadYRepeatSeconds = 0;
      }
      if (debugMenuOpen) {
        const dpadVertical = Math.sign(gamepadInput.dpadY);
        if (dpadVertical === 0) {
          heldGamepadDpadY = 0;
          gamepadDpadYRepeatSeconds = 0;
        } else if (dpadVertical !== heldGamepadDpadY) {
          heldGamepadDpadY = dpadVertical;
          gamepadDpadYRepeatSeconds = GAMEPAD_MENU_REPEAT_DELAY_SECONDS;
          moveDebugMenuSelection(dpadVertical);
        } else {
          gamepadDpadYRepeatSeconds -= deltaTime;
          if (gamepadDpadYRepeatSeconds <= 0) {
            moveDebugMenuSelection(dpadVertical);
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
          adjustDebugMenuSelection(dpadHorizontal);
        } else {
          gamepadDpadXRepeatSeconds -= deltaTime;
          if (gamepadDpadXRepeatSeconds <= 0) {
            adjustDebugMenuSelection(dpadHorizontal);
            gamepadDpadXRepeatSeconds += GAMEPAD_MENU_REPEAT_INTERVAL_SECONDS;
          }
        }

        if (
          gamepadInput.confirmPressed &&
          !wasGamepadConfirmPressed
        ) {
          activateDebugMenuSelection();
        }

        if (
          gamepadInput.connected &&
          gamepadInput.secondaryActionPressed &&
          !wasGamepadSecondaryActionPressed
        ) {
          activateGamepadCursor();
          activateBestInteraction("gamepad");
        }
      } else if (
        !startJustPressed &&
        gamepadInput.connected &&
        gamepadInput.actionPressed &&
        !wasGamepadActionPressed
      ) {
        activateGamepadCursor();
        activateBestInteraction("gamepad");
      }

      wasGamepadConfirmPressed = gamepadInput.confirmPressed;
      wasGamepadBackPressed = gamepadInput.backPressed;
      wasGamepadSecondaryActionPressed = gamepadInput.secondaryActionPressed;
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

      const gamepadMovementX = debugMenuOpen
        ? gamepadInput.stickX
        : gamepadInput.x;
      const gamepadMovementY = debugMenuOpen
        ? gamepadInput.stickY
        : gamepadInput.y;
      let horizontal = clamp(keyboardHorizontal + gamepadMovementX, -1, 1);
      let vertical = clamp(keyboardVertical + gamepadMovementY, -1, 1);
      if (dialoguePlaybackRef.current) {
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
      audioEvents.dispose();
      if (audioEventManagerRef.current === audioEvents) {
        audioEventManagerRef.current = null;
      }
      document.documentElement.classList.remove("gamepad-cursor-active");
      document.documentElement.classList.remove("dialogue-cursor-active");
    };
    // The canvas simulation must be initialized once; gamepad actions use refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="game-shell">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        aria-label="八方向角色移動地圖測試場景"
        tabIndex={0}
      />

      {dialogueView ? (
        <button
          className="dialogue-box"
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
      </section>

      <aside className="debug-wrap">
        <button
          className="debug-trigger"
          type="button"
          aria-expanded={debugOpen}
          aria-controls="debug-panel"
          onClick={toggleDebugPanel}
        >
          <span>Debug</span>
          <span className="debug-chevron" aria-hidden="true">
            ⌄
          </span>
        </button>

        {debugOpen ? (
          <div className="debug-panel" id="debug-panel">
            <p className="debug-section-label">Collision Draw</p>
            <button
              className="toggle-button"
              type="button"
              data-gamepad-selected={
                debugMenuSelection === "player-collision" || undefined
              }
              aria-pressed={showPlayerCollision}
              onFocus={() => setDebugMenuSelectionValue("player-collision")}
              onClick={() => {
                setDebugMenuSelectionValue("player-collision");
                activateDebugMenuSelection();
              }}
            >
              <span>角色 Collision 描繪</span>
              <span className="toggle-pill" aria-hidden="true" />
            </button>
            <button
              className="toggle-button"
              type="button"
              data-gamepad-selected={
                debugMenuSelection === "scene-collision" || undefined
              }
              aria-pressed={showSceneCollision}
              onFocus={() => setDebugMenuSelectionValue("scene-collision")}
              onClick={() => {
                setDebugMenuSelectionValue("scene-collision");
                activateDebugMenuSelection();
              }}
            >
              <span>場景 Collision 描繪</span>
              <span className="toggle-pill" aria-hidden="true" />
            </button>

            <div className="debug-divider" />
            <p className="debug-section-label">Audio</p>
            <button
              className="toggle-button"
              type="button"
              data-gamepad-selected={
                debugMenuSelection === "bgm-enabled" || undefined
              }
              aria-pressed={bgmEnabled}
              onFocus={() => setDebugMenuSelectionValue("bgm-enabled")}
              onClick={() => {
                setDebugMenuSelectionValue("bgm-enabled");
                activateDebugMenuSelection();
              }}
            >
              <span>BGM</span>
              <span className="toggle-pill" aria-hidden="true" />
            </button>
            <div
              className="slider-row"
              data-gamepad-selected={
                debugMenuSelection === "bgm-volume" || undefined
              }
            >
              <label htmlFor="bgm-volume">BGM 音量</label>
              <output className="slider-value" htmlFor="bgm-volume">
                {bgmVolume}%
              </output>
              <input
                id="bgm-volume"
                type="range"
                min="0"
                max="100"
                step="5"
                value={bgmVolume}
                disabled={!bgmEnabled}
                onFocus={() => setDebugMenuSelectionValue("bgm-volume")}
                onChange={(event) => setBgmVolumeValue(Number(event.target.value))}
              />
            </div>

            <div className="debug-divider" />
            <p className="debug-section-label">Gamepad</p>
            <div className="gamepad-debug" aria-live="polite">
              <strong>
                {gamepadConnected
                  ? gamepadLabel || "Gamepad 已連線"
                  : "Chrome 尚未回報手把"}
              </strong>
              <span>{gamepadDiagnostic}</span>
              <span className="gamepad-menu-hint">
                START：開啟／關閉 · 十字鍵：選擇／調整 · A：確認 ·
                B：關閉 · 左搖桿：角色移動 · X：游標點擊
              </span>
            </div>

            <div className="debug-divider" />
            <p className="debug-section-label">Character Tuning</p>

            <div
              className="slider-row"
              data-gamepad-selected={
                debugMenuSelection === "movement-speed" || undefined
              }
            >
              <label htmlFor="movement-speed">移動速度</label>
              <output className="slider-value" htmlFor="movement-speed">
                {speed}
              </output>
              <input
                id="movement-speed"
                type="range"
                min="100"
                max="380"
                step="10"
                value={speed}
                onFocus={() => setDebugMenuSelectionValue("movement-speed")}
                onChange={(event) => setSpeedValue(Number(event.target.value))}
              />
            </div>

            <div
              className="slider-row"
              data-gamepad-selected={
                debugMenuSelection === "character-size" || undefined
              }
            >
              <label htmlFor="character-size">角色尺寸</label>
              <output className="slider-value" htmlFor="character-size">
                {size}
              </output>
              <input
                id="character-size"
                type="range"
                min="90"
                max="220"
                step="4"
                value={size}
                onFocus={() => setDebugMenuSelectionValue("character-size")}
                onChange={(event) => setSizeValue(Number(event.target.value))}
              />
            </div>

            <div
              className="slider-row"
              data-gamepad-selected={
                debugMenuSelection === "collision-slide-tolerance" || undefined
              }
            >
              <label htmlFor="collision-slide-tolerance">
                碰撞滑動輔助
              </label>
              <output
                className="slider-value"
                htmlFor="collision-slide-tolerance"
              >
                {collisionSlideTolerance}%
              </output>
              <input
                id="collision-slide-tolerance"
                type="range"
                min="20"
                max="100"
                step="5"
                value={collisionSlideTolerance}
                onFocus={() =>
                  setDebugMenuSelectionValue("collision-slide-tolerance")
                }
                onChange={(event) =>
                  setCollisionSlideToleranceValue(Number(event.target.value))
                }
              />
            </div>
          </div>
        ) : null}
      </aside>

      <section className="controls-card" aria-label="操作方式">
        <div className="key-group" aria-hidden="true">
          <span className="keycap w">W</span>
          <span className="keycap a">A</span>
          <span className="keycap s">S</span>
          <span className="keycap d">D</span>
        </div>
        <span
          className={`gamepad-status${gamepadConnected ? " is-connected" : ""}`}
        >
          🎮 {gamepadConnected ? "手把已連線" : "請按手把任一按鈕啟用"}
        </span>
        <span>WASD／左搖桿移動 · 右搖桿游標 · A/X／點擊／長按指派</span>
        <span>
          START：DEBUG · 十字鍵選擇／調整 · A：確認 · B：關閉 ·
          左搖桿仍可移動
        </span>
      </section>

      <section className="direction-readout" aria-live="polite">
        <span>{moving ? "Moving" : "Facing"}</span>
        <strong>{DIRECTION_NAMES[facing]}</strong>
      </section>
    </main>
  );
}
