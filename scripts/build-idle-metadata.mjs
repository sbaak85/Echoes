import { readFileSync, writeFileSync } from 'node:fs';
import { trackBootShadowAnchors } from '../app/boot-shadow-tracking.ts';
const geometry = JSON.parse(readFileSync(new URL('../output/idle-eight-directions/geometry-input.json', import.meta.url), 'utf8'));
const manifest = Object.fromEntries(Object.entries(geometry).map(([direction, asset]) => [direction, {
  source: asset.source, crop: asset.crop,
  bootAnchors: trackBootShadowAnchors(asset.columns, asset.crop.width, asset.crop.height),
}]));
writeFileSync(new URL('../app/player-idle-assets.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log('Built 8 idle sprite paths, crops and precomputed boot anchors.');
