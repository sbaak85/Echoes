import metadata from "./player-walk-assets.json";
import type { BootShadowAnchor } from "./boot-shadow-tracking";

export type WalkDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
type WalkCrop = { x: number; y: number; width: number; height: number };
type WalkFrame = { source: string; bootAnchors: [BootShadowAnchor, BootShadowAnchor] | null };
type WalkAsset = { crop: WalkCrop; frames: WalkFrame[] };
export const PLAYER_WALK_ASSETS = metadata as Record<WalkDirection, WalkAsset>;
export type TransparentCharacterSprite = {
  image: HTMLImageElement;
  crop: WalkCrop;
  width: number;
  height: number;
  bootAnchors: [BootShadowAnchor, BootShadowAnchor] | null;
};

export type TransparentWalkSprite = TransparentCharacterSprite;

export function getWalkFrameSources(direction: WalkDirection): string[] {
  return PLAYER_WALK_ASSETS[direction].frames.map(frame => frame.source);
}

/** Images arrive pre-sized and keyed. Crops and boot anchors are generated offline. */
export function makeTransparentWalkSprites(direction: WalkDirection, images: HTMLImageElement[]): TransparentWalkSprite[] {
  const asset = PLAYER_WALK_ASSETS[direction];
  if (images.length !== asset.frames.length) throw new Error(`Incomplete walk sequence: ${direction}`);
  return images.map((image, index) => {
    if (image.naturalWidth !== 570 || image.naturalHeight !== 720) {
      throw new Error(`Unexpected walk frame size: ${direction}/${index + 1}`);
    }
    return { image, crop: asset.crop, width: asset.crop.width, height: asset.crop.height,
      bootAnchors: asset.frames[index].bootAnchors };
  });
}

export function drawTransparentCharacterSprite(
  context: CanvasRenderingContext2D, sprite: TransparentCharacterSprite,
  x: number, y: number, width: number, height: number,
) {
  const crop = sprite.crop;
  context.drawImage(sprite.image, crop.x, crop.y, crop.width, crop.height, x, y, width, height);
}

// Retain the walking preview API while sharing the same renderer with idle sprites.
export const drawTransparentWalkSprite = drawTransparentCharacterSprite;
