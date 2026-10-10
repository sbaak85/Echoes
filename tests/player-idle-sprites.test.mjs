import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
function load(name){const file=new URL(`app/${name}.ts`,root),module={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(createRequire(file),module,module.exports);return module.exports;}
const {PLAYER_IDLE_ASSETS:assets,getIdleSpriteSources,makeTransparentIdleSprite}=load('player-idle-sprites');
const {makeTransparentWalkSprites,drawTransparentCharacterSprite}=load('player-walk-sprites');
test('eight idle runtime sprites are preprocessed 570x720 RGBA PNGs with valid geometry',()=>{
 assert.equal(Object.keys(assets).length,8);
 for(const [d,a] of Object.entries(assets)){
  assert.equal(getIdleSpriteSources()[d],a.source);
  assert.match(a.source,/characters\/idle\/Transparent_570x720\//);
  const png=readFileSync(new URL(`public/${a.source.slice(2)}`,root));
  assert.equal(png.readUInt32BE(16),570);assert.equal(png.readUInt32BE(20),720);assert.equal(png[25],6);
  const c=a.crop;assert.ok(c.x>=0&&c.y>=0&&c.width>0&&c.height>0&&c.x+c.width<=570&&c.y+c.height<=720);
  assert.equal(a.bootAnchors.length,2);
  for(const p of a.bootAnchors)for(const v of Object.values(p))assert.ok(Number.isFinite(v)&&v>=0&&v<=1);
 }
});
test('idle and walking share source-rectangle rendering without runtime canvas preparation',()=>{
 for(const [d,a] of Object.entries(assets)){
  const image={naturalWidth:570,naturalHeight:720};const idle=makeTransparentIdleSprite(d,image);
  assert.equal(idle.image,image);assert.equal(idle.crop,a.crop);assert.equal(idle.bootAnchors,a.bootAnchors);
  const walking=makeTransparentWalkSprites(d,Array.from({length:26},()=>image));
  for(const sprite of [idle,...walking,idle]){
   let args;const height=152,width=height*sprite.width/sprite.height;
   drawTransparentCharacterSprite({drawImage(...v){args=v}},sprite,200-width/2,300-height,width,height);
   assert.deepEqual(args,[image,sprite.crop.x,sprite.crop.y,sprite.width,sprite.height,200-width/2,148,width,152]);
  }
  assert.throws(()=>makeTransparentIdleSprite(d,{naturalWidth:1280,naturalHeight:1616}),/Unexpected idle sprite size/);
 }
});
test('formal game no longer keys, rescales or pixel-scans standing sprites',()=>{
 const game=readFileSync(new URL('app/movement-lab.tsx',root),'utf8');
 assert.match(game,/SPRITE_SOURCES: Record<Direction, string> = getIdleSpriteSources\(\)/);
 assert.match(game,/makeTransparentIdleSprite\(facing, image\)/);
 assert.match(game,/idleBootShadowFrames.set\(facing, sprite.bootAnchors\)/);
 assert.doesNotMatch(game,/prepareChromaKeySprite|makeChromaKeySprite|cropPreparedChromaKeySprites|detectBootShadowAnchors|\.\/characters\/0[1-8]_/);
});
