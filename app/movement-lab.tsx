"use client";

import { useEffect, useRef, useState } from "react";

type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
type Point = { x: number; y: number };
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

const WORLD = { width: 1254, height: 1254 };
const MAP_SOURCE = "./maps/map_test01.png";
const SPAWN: Point = { x: 620, y: 820 };

// The map has one main plateau and two lower approach roads. The three
// polygons overlap only at the illustrated stairs, so their union is the
// complete walkable NavMesh.
const NAV_REGIONS: Point[][] = [
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

const SCENE_COLLIDERS: SceneCollider[] = [
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getDirection(x: number, y: number): Direction {
  if (x === 0) return y < 0 ? "N" : "S";
  if (y === 0) return x > 0 ? "E" : "W";
  if (x > 0) return y < 0 ? "NE" : "SE";
  return y < 0 ? "NW" : "SW";
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

function getShallowCornerSlide(
  desiredFootPoint: Point,
  radius: number,
  velocity: Point,
) {
  const center = getCollisionCenter(desiredFootPoint, radius);

  for (const collider of SCENE_COLLIDERS) {
    const contact = getColliderContact(center, collider);
    if (
      !contact ||
      !contact.isCorner ||
      contact.distance >= radius ||
      contact.distance <= 0
    ) {
      continue;
    }

    const penetration = radius - contact.distance;
    if (penetration > radius * 0.38) continue;

    const approach = -(
      velocity.x * contact.normal.x +
      velocity.y * contact.normal.y
    );
    if (approach <= 0.08 || approach >= 0.93) continue;

    const tangent = { x: -contact.normal.y, y: contact.normal.x };
    const tangentAlignment =
      velocity.x * tangent.x + velocity.y * tangent.y;
    const direction = tangentAlignment >= 0 ? 1 : -1;

    return {
      x: tangent.x * direction,
      y: tangent.y * direction,
    };
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
  const speedRef = useRef(210);
  const sizeRef = useRef(142);
  const showPlayerCollisionRef = useRef(false);
  const showSceneCollisionRef = useRef(false);

  const [debugOpen, setDebugOpen] = useState(false);
  const [showPlayerCollision, setShowPlayerCollision] = useState(false);
  const [showSceneCollision, setShowSceneCollision] = useState(false);
  const [speed, setSpeed] = useState(210);
  const [size, setSize] = useState(142);
  const [facing, setFacing] = useState<Direction>("S");
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    showPlayerCollisionRef.current = showPlayerCollision;
  }, [showPlayerCollision]);

  useEffect(() => {
    showSceneCollisionRef.current = showSceneCollision;
  }, [showSceneCollision]);

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

    let currentFacing: Direction = "S";
    let wasMoving = false;
    let animationFrame = 0;
    let lastTime = performance.now();
    let viewportWidth = 1;
    let viewportHeight = 1;

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
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
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

    const clearKeys = () => pressedKeys.clear();

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp, { passive: false });
    window.addEventListener("blur", clearKeys);

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

      context.restore();
    };

    const drawPlayer = () => {
      const sprite = sprites.get(currentFacing);
      const renderedHeight = sizeRef.current;
      const radius = renderedHeight * 0.14;

      context.save();
      context.globalAlpha = 0.3;
      context.fillStyle = "#000";
      context.beginPath();
      context.ellipse(
        player.x,
        player.y + 2,
        renderedHeight * 0.21,
        renderedHeight * 0.07,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();

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

    const update = (deltaTime: number) => {
      const horizontal =
        Number(pressedKeys.has("d") || pressedKeys.has("arrowright")) -
        Number(pressedKeys.has("a") || pressedKeys.has("arrowleft"));
      const vertical =
        Number(pressedKeys.has("s") || pressedKeys.has("arrowdown")) -
        Number(pressedKeys.has("w") || pressedKeys.has("arrowup"));
      const isMoving = horizontal !== 0 || vertical !== 0;

      if (isMoving) {
        const length = Math.hypot(horizontal, vertical);
        const velocityX = horizontal / length;
        const velocityY = vertical / length;
        const distance = speedRef.current * deltaTime;
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
            const cornerSlide = getShallowCornerSlide(
              desiredPosition,
              radius,
              { x: velocityX, y: velocityY },
            );

            if (cornerSlide) {
              const slideDistance = Math.min(
                distance * 0.48,
                radius * 0.11,
              );
              const slidePosition = {
                x: player.x + cornerSlide.x * slideDistance,
                y: player.y + cornerSlide.y * slideDistance,
              };

              if (isWalkable(slidePosition, radius)) {
                player.x = slidePosition.x;
                player.y = slidePosition.y;
              }
            }
          }
        }
      }

      if (isMoving !== wasMoving) {
        wasMoving = isMoving;
        setMoving(isMoving);
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

    const render = () => {
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
      context.restore();
    };

    const frame = (time: number) => {
      const deltaTime = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;
      update(deltaTime);
      render();
      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
    };
  }, []);

  return (
    <main className="game-shell">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        aria-label="八方向角色移動地圖測試場景"
        tabIndex={0}
      />

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
          onClick={() => setDebugOpen((open) => !open)}
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
              aria-pressed={showPlayerCollision}
              onClick={() => setShowPlayerCollision((visible) => !visible)}
            >
              <span>角色 Collision 描繪</span>
              <span className="toggle-pill" aria-hidden="true" />
            </button>
            <button
              className="toggle-button"
              type="button"
              aria-pressed={showSceneCollision}
              onClick={() => setShowSceneCollision((visible) => !visible)}
            >
              <span>場景 Collision 描繪</span>
              <span className="toggle-pill" aria-hidden="true" />
            </button>

            <div className="debug-divider" />
            <p className="debug-section-label">Character Tuning</p>

            <div className="slider-row">
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
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
            </div>

            <div className="slider-row">
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
                onChange={(event) => setSize(Number(event.target.value))}
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
        <span>WASD／方向鍵移動</span>
      </section>

      <section className="direction-readout" aria-live="polite">
        <span>{moving ? "Moving" : "Facing"}</span>
        <strong>{DIRECTION_NAMES[facing]}</strong>
      </section>
    </main>
  );
}
