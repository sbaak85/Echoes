import type { BootShadowAnchor } from "./boot-shadow-tracking";

export type CharacterShadowTuning = {
  ambientOffsetX: number;
  ambientOffsetY: number;
  bootOffsetX: number;
  bootOffsetY: number;
  widthPercent: number;
  heightPercent: number;
};

/** 角色在畫面上的外框（世界座標）：雙腳接地點的比例以這個框為基準 */
export type CharacterShadowBox = { left: number; top: number; width: number; height: number };

const DEFAULT_BOOT_ANCHORS: [BootShadowAnchor, BootShadowAnchor] = [
  { xRatio: 0.3, yRatio: 0.985, contact: 1 },
  { xRatio: 0.7, yRatio: 0.985, contact: 1 },
];

function drawSoftShadowEllipse(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  centerAlpha: number,
  fadeStart: number,
) {
  context.save();
  context.translate(x, y);
  context.scale(1, radiusY / Math.max(radiusX, Number.EPSILON));
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radiusX);
  gradient.addColorStop(0, `rgba(3, 9, 12, ${centerAlpha})`);
  gradient.addColorStop(fadeStart, `rgba(3, 9, 12, ${centerAlpha * 0.58})`);
  gradient.addColorStop(1, "rgba(3, 9, 12, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, radiusX, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/**
 * 主角與 NPC 共用的腳底影子：
 *   - 一層大柔影讓整個身體貼地，不像一塊固定的黑圓盤；
 *   - 兩隻腳各一個接地影，位置直接來自角色圖的腳底像素（bootAnchors），抬起的腳影子較小較淡。
 * `size` 是角色的基準身高（主角為 size 設定、NPC 為可見身高），影子大小依此縮放。
 */
export function drawCharacterGroundShadow(
  context: CanvasRenderingContext2D,
  options: {
    footX: number;
    footY: number;
    size: number;
    box: CharacterShadowBox;
    tuning: CharacterShadowTuning;
    bootAnchors: [BootShadowAnchor, BootShadowAnchor] | null;
  },
) {
  const { footX, footY, size, box, tuning } = options;
  const widthScale = tuning.widthPercent / 100;
  const heightScale = tuning.heightPercent / 100;
  drawSoftShadowEllipse(
    context,
    footX + tuning.ambientOffsetX,
    footY - size * 0.012 + tuning.ambientOffsetY,
    size * 0.155 * widthScale,
    size * 0.047 * heightScale,
    0.7,
    0.48,
  );
  for (const anchor of options.bootAnchors ?? DEFAULT_BOOT_ANCHORS) {
    const liftScale = 0.67 + anchor.contact * 0.33;
    drawSoftShadowEllipse(
      context,
      box.left + anchor.xRatio * box.width + tuning.bootOffsetX,
      box.top + anchor.yRatio * box.height + tuning.bootOffsetY + size * 0.006,
      size * 0.056 * widthScale * liftScale,
      size * 0.019 * heightScale * liftScale,
      0.31 + anchor.contact * 0.25,
      0.62,
    );
  }
}
