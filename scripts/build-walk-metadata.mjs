import { readFileSync, writeFileSync } from 'node:fs';
import { trackBootShadowAnchors } from '../app/boot-shadow-tracking.ts';
const geometry = JSON.parse(readFileSync(new URL('../output/walk-eight-directions/geometry-input.json', import.meta.url), 'utf8'));
const manifest = {};
for (const [direction, asset] of Object.entries(geometry)) {
  manifest[direction] = {
    crop: asset.crop,
    frames: asset.frames.map(frame => ({
      source: frame.source,
      bootAnchors: trackBootShadowAnchors(frame.columns, asset.crop.width, asset.crop.height),
    })),
  };
}
writeFileSync(new URL('../app/player-walk-assets.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log('Built 8 directions / 208 frame paths and precomputed boot anchors.');
