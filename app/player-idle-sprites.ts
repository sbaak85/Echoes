import metadata from "./player-idle-assets.json";
import type { BootShadowAnchor } from "./boot-shadow-tracking";
import type { WalkDirection, TransparentCharacterSprite } from "./player-walk-sprites";

type IdleAsset = {
  source: string;
  crop: { x: number; y: number; width: number; height: number };
  bootAnchors: [BootShadowAnchor, BootShadowAnchor] | null;
};
export const PLAYER_IDLE_ASSETS = metadata as Record<WalkDirection, IdleAsset>;

export function getIdleSpriteSources(): Record<WalkDirection, string> {
  return Object.fromEntries(Object.entries(PLAYER_IDLE_ASSETS).map(([direction, asset]) =>
    [direction, asset.source])) as Record<WalkDirection, string>;
}

/** Already keyed and resized offline; loading only binds the image to saved geometry. */
export function makeTransparentIdleSprite(direction: WalkDirection, image: HTMLImageElement): TransparentCharacterSprite {
  if (image.naturalWidth !== 570 || image.naturalHeight !== 720) {
    throw new Error(`Unexpected idle sprite size: ${direction}`);
  }
  const asset = PLAYER_IDLE_ASSETS[direction];
  return { image, crop: asset.crop, width: asset.crop.width, height: asset.crop.height,
    bootAnchors: asset.bootAnchors };
}
