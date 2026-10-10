import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
const filename = new URL('app/player-walk-sprites.ts', root);
const source = readFileSync(filename, 'utf8');
const module = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText)(createRequire(filename), module, module.exports);
const { PLAYER_WALK_ASSETS: assets, getWalkFrameSources, makeTransparentWalkSprites, drawTransparentWalkSprite } = module.exports;

test('all eight directions contain 26 runtime RGBA PNGs at 570x720 without depending on movable masters', () => {
  assert.deepEqual(Object.keys(assets).sort(), ['N','NE','E','SE','S','SW','W','NW'].sort());
  const paths = new Set();
  for (const [direction, asset] of Object.entries(assets)) {
    assert.equal(asset.frames.length, 26);
    assert.deepEqual(getWalkFrameSources(direction), asset.frames.map(f => f.source));
    const { x, y, width, height } = asset.crop;
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 570 && y + height <= 720);
    for (const frame of asset.frames) {
      assert.match(frame.source, /Walking_2_Transparent_570x720\//);
      paths.add(frame.source);
      for (const [path, w, h] of [[frame.source,570,720]]) {
        const png = readFileSync(new URL(`public/${path.slice(2)}`, root));
        assert.equal(png.subarray(1,4).toString(), 'PNG');
        assert.equal(png.readUInt32BE(16), w); assert.equal(png.readUInt32BE(20), h);
        assert.equal(png[25], 6, 'PNG must contain RGBA transparency');
      }
      assert.equal(frame.bootAnchors.length, 2);
      for (const anchor of frame.bootAnchors) for (const v of Object.values(anchor)) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
    }
  }
  assert.equal(paths.size, 208);
});

test('preprocessed images bind to fixed directional crops and offline shadow anchors without a canvas or pixel scan', () => {
  for (const [direction, asset] of Object.entries(assets)) {
    const images = asset.frames.map(() => ({ naturalWidth:570, naturalHeight:720 }));
    const sprites = makeTransparentWalkSprites(direction, images);
    for (const [i, sprite] of sprites.entries()) {
      assert.equal(sprite.image, images[i]); assert.equal(sprite.crop, asset.crop);
      assert.equal(sprite.width, asset.crop.width); assert.equal(sprite.height, asset.crop.height);
      assert.equal(sprite.bootAnchors, asset.frames[i].bootAnchors);
      const calls=[];drawTransparentWalkSprite({drawImage(...args){calls.push(args)}},sprite,10,20,100,152);
      assert.deepEqual(calls,[[images[i],asset.crop.x,asset.crop.y,asset.crop.width,asset.crop.height,10,20,100,152]]);
    }
    assert.throws(()=>makeTransparentWalkSprites(direction, images.slice(1)),/Incomplete/);
    assert.throws(()=>makeTransparentWalkSprites(direction, images.map(()=>({naturalWidth:1280,naturalHeight:1616}))),/Unexpected/);
  }
});

test('formal game uses the transparent loader in every direction', () => {
  const game=readFileSync(new URL('app/movement-lab.tsx', root),'utf8');
  for (const direction of Object.keys(assets)) {
    assert.ok(game.includes(`getWalkFrameSources("${direction}")`));
    assert.ok(game.includes(`makeTransparentWalkSprites("${direction}",`));
  }
  assert.doesNotMatch(game,/makeChromaKeySpriteSequence/);
  assert.doesNotMatch(source,/getImageData|putImageData|createElement|prepareChromaKeySprite/);
});
