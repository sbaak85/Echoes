// Actual MovementLab + isolated Vite scene fixture. Never edits public/maps or player saves.
// 驗證：獨立 NPC（npcs＋npcId）、腳底錨點與 100% 身高、前後遮擋順序、點角色身體開啟對話、
// 對話中轉向主角再轉回、待機呼吸、8 方向圖預先載入、牆面前景仍在最上層。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'output/npc-integration');
const site = path.join(out, 'fixture-site');
const scenePath = path.join(root, 'public/maps/ship_interior.scene.json');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ||
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const source = await readFile(scenePath);
const originalHash = createHash('sha256').update(source).digest('hex');
const original = JSON.parse(source.toString('utf8'));
const fixture = structuredClone(original);
const catalog = JSON.parse(await readFile(path.join(root, 'public/characters/npc-catalog.json'), 'utf8'));
const spawnPoint = { x: 733.88, y: 1016.15, facing: 'S' };
fixture.playerSpawn = spawnPoint;
fixture.storyTriggers = [];
// A safe test-only walking patch allows deterministic depth crossing without changing production navigation.
fixture.navMesh = [{ id: 'npc-fixture-walk', label: 'NPC test movement patch', points: [
  { x: 450, y: 750 }, { x: 1050, y: 750 }, { x: 1050, y: 1250 }, { x: 450, y: 1250 },
] }];
fixture.collisions = [];
fixture.foregroundLayers = (fixture.foregroundLayers ?? []).map(layer => ({ ...layer }));
// 測試用遮擋片段：一段水平牆腳線 y=1000（x 600–900），主角出生在牆前，往上走到牆後
fixture.occluders = [{
  id: 'occluder-fixture', label: '測試牆段', layerId: fixture.foregroundLayers[0].id,
  points: [{ x: 600, y: 860 }, { x: 900, y: 860 }, { x: 900, y: 1000 }, { x: 600, y: 1000 }],
  baselineStart: { x: 600, y: 1000 }, baselineEnd: { x: 900, y: 1000 },
}];
const placements = [
  { suffix: '011', id: 'npc-owen', characterId: 'owen', x: 660, y: 1160, facing: 'NE', scale: 0.85 },
  { suffix: '012', id: 'npc-captain', characterId: 'captain', x: 760, y: 985, facing: 'SE', scale: 1 },
  { suffix: '013', id: 'npc-rena', characterId: 'rena', x: 1000, y: 870, facing: 'NW', scale: 1.15 },
  { suffix: '014', id: 'npc-ian', characterId: 'ian', x: 560, y: 850, facing: 'SW', scale: 1 },
];
fixture.npcs = placements.map(({ suffix, ...npc }) => ({ label: npc.id, facePlayer: true, breathing: true, ...npc }));
fixture.interactables = placements.map(({ suffix, id, x, y }) => {
  const existing = original.interactables.find(i => i.id === `shipinterior-interaction-${suffix}`);
  assert.ok(existing, `Fixture must reuse existing Interaction ${suffix}`);
  // 對話區畫在腳邊（點不到頭），互動點在角色右下方：主角走過去後，NPC 應轉向東南
  const interaction = { ...existing, npcId: id, useRequirements: [], skipSuccessDialogue: false,
    points: [{ x: x - 30, y: y - 12 }, { x: x + 30, y: y - 12 }, { x: x + 30, y: y + 18 }, { x: x - 30, y: y + 18 }],
    interactionPoints: [{ x: x + 70, y: y + 32, facing: 'NW' }],
    dialogue: { lines: [{ speaker: 'NPC fixture', text: 'NPC interaction fixture' }] } };
  for (const key of ['npc', 'interactionPoint', 'interactionHintPoint', 'completionDialogue', 'storyDialogueId']) delete interaction[key];
  return interaction;
});
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'ship-fixture.json'), JSON.stringify(fixture, null, 2));
const configPath = path.join(out, 'vite.fixture.config.ts');
await writeFile(configPath, `
import fs from 'node:fs';
import path from 'node:path';
import base from '../../vite.pages.config';
const fixture = fs.readFileSync(path.resolve('output/npc-integration/ship-fixture.json'), 'utf8');
export default {
  ...base,
  plugins: [{ name: 'npc-test-scene-fixture', enforce: 'pre', load(id) {
    if (id.replaceAll('\\\\', '/').endsWith('/public/maps/ship_interior.scene.json')) return fixture;
  } }, ...base.plugins],
  build: { ...base.build, outDir: path.resolve('output/npc-integration/fixture-site'), emptyOutDir: true, copyPublicDir: false },
};
`);
if (!process.env.NPC_TEST_SKIP_BUILD) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', configPath], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
    child.on('error', reject); child.on('close', code => resolve({ code, log }));
  });
  await writeFile(path.join(out, 'fixture-build.log'), result.log);
  assert.equal(result.code, 0, result.log);
}

const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (!url.pathname.startsWith('/Echoes/')) { res.writeHead(404); res.end(); return; }
    const relative = decodeURIComponent(url.pathname.slice('/Echoes/'.length)) || 'index.html';
    if (relative.split(/[\\/]/).includes('..')) { res.writeHead(400); res.end(); return; }
    let file = path.join(site, relative);
    try { if (!(await stat(file)).isFile()) throw new Error('not file'); }
    catch { file = path.join(root, 'public', relative); }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const url = `http://127.0.0.1:${server.address().port}/Echoes/?scene=ship_interior&noSave`;
const browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [], imageResponses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(`console: ${message.text()}`); });
  page.on('response', response => { if (response.url().includes('/characters/idle/')) imageResponses.push({ url: decodeURIComponent(response.url()), status: response.status() }); });
  await page.addInitScript(() => {
    window.__npcProbe = { frame: [], last: [], frames: 0 };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('game-canvas')) {
        window.__npcProbe.last = window.__npcProbe.frame;
        window.__npcProbe.frame = [];
        window.__npcProbe.frames++;
      }
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (this.canvas.classList.contains('game-canvas') && image instanceof HTMLImageElement) {
        const src = decodeURIComponent(image.currentSrc || image.src);
        if (src.includes('/characters/') || src.includes('ship_interior_Wall')) {
          const box = args.slice(-4), transform = this.getTransform();
          window.__npcProbe.frame.push({ src, x: box[0], y: box[1], width: box[2], height: box[3], transform: { a: transform.a, d: transform.d, e: transform.e, f: transform.f }, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
        }
      }
      return draw.call(this, image, ...args);
    };
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.game-canvas').waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForFunction(() => {
    const frame = window.__npcProbe.last;
    return frame.filter(call => /\/idle\/(歐文|艦長|蕾娜|伊恩)\//.test(call.src)).length === 4 &&
      frame.some(call => /\/characters\/(idle\/Transparent_570x720|walk)\//.test(call.src)) &&
      frame.some(call => /ship_interior_Wall\.png/.test(call.src));
  }, null, { timeout: 45000 });
  await page.waitForTimeout(450);
  assert.deepEqual(errors, [], 'no browser page errors while loading');
  const before = await page.evaluate(() => window.__npcProbe.last);
  const lookup = Object.fromEntries(catalog.characters.flatMap(character => Object.entries(character.sprites).map(([direction, asset]) => [asset.file, { ...asset, characterId: character.id, direction }])));
  const npcCall = (frame, characterId) => frame.map(call => ({ call, asset: lookup[decodeURIComponent(new URL(call.src).pathname.slice('/Echoes/'.length))] }))
    .find(item => item.asset?.characterId === characterId);
  function analyze(frame) {
    const actors = [];
    for (const call of frame) {
      const relative = new URL(call.src).pathname.slice('/Echoes/'.length);
      const asset = lookup[decodeURIComponent(relative)];
      if (asset) {
        const placement = placements.find(p => p.characterId === asset.characterId);
        const pixelScale = call.height / asset.height;
        const footX = call.x + asset.anchorX * pixelScale, footY = call.y + asset.anchorY * pixelScale;
        assert.ok(Math.abs(footX - placement.x) < 1e-7 && Math.abs(footY - placement.y) < 1e-7, `${asset.characterId}: foot anchor preserved`);
        // 100% 可見身高＝主角同方向的可見身高（152 × 主角可見身高比例）
        const expected = 152 * catalog.reference.bodyRatio[asset.direction] * placement.scale;
        assert.ok(Math.abs(pixelScale * asset.bodyHeight - expected) < 1e-7, `${asset.characterId}: world body height`);
        assert.ok(Math.abs(call.width / call.height - 570 / 720) < 1e-10, `${asset.characterId}: no width distortion`);
        assert.equal(call.naturalWidth, 570); assert.equal(call.naturalHeight, 720);
        assert.ok(new URL(call.src).pathname.startsWith('/Echoes/characters/idle/'));
        actors.push({ id: asset.characterId, direction: asset.direction, footX, footY, bodyHeight: pixelScale * asset.bodyHeight,
          breathing: call.transform.d / call.transform.a });
      } else if (/\/characters\/(idle\/Transparent_570x720|walk)\//.test(call.src)) {
        actors.push({ id: 'player', footX: call.x + call.width / 2, footY: call.y + call.height, breathing: call.transform.d / call.transform.a });
      }
    }
    assert.equal(actors.length, 5, `exactly four NPCs and player were drawn: ${actors.map(a => a.id).join(',')} / ${frame.map(call => decodeURIComponent(call.src).split('/').slice(-2).join('/')).join(' | ')}`);
    assert.deepEqual(actors.map(a => a.footY), [...actors.map(a => a.footY)].sort((a, b) => a - b), 'actual canvas draw order follows foot Y');
    assert.match(frame.at(-1).src, /ship_interior_Wall\.png/, 'walls remain above all character art');
    return actors;
  }
  const beforeActors = analyze(before);
  // 遮擋片段：牆面圖會畫兩次——片段（參與排序）＋其餘部分（最上層）
  const wallDraws = frame => frame.map((call, index) => ({ call, index })).filter(item => /ship_interior_Wall\.png/.test(item.call.src));
  const indexOf = (frame, pattern) => frame.findIndex(call => pattern.test(call.src));
  const PLAYER = /\/characters\/(idle\/Transparent_570x720|walk)\//, CAPTAIN = /\/idle\/艦長\//;
  const occluderBefore = wallDraws(before);
  assert.equal(occluderBefore.length, 2, 'foreground drawn as one occluder piece plus the remaining wall');
  assert.ok(indexOf(before, CAPTAIN) < occluderBefore[0].index, 'captain behind the wall foot line: the wall piece covers him');
  assert.ok(occluderBefore[0].index < indexOf(before, PLAYER), 'player in front of the wall foot line: the player covers the wall piece');
  assert.ok(beforeActors.findIndex(a => a.id === 'captain') < beforeActors.findIndex(a => a.id === 'player'));
  await page.screenshot({ path: path.join(out, 'npc-ship-before.png') });

  // 待機呼吸：NPC 垂直/水平縮放比例隨時間輕微變動，主角不受影響
  const breathingSamples = [];
  for (let sample = 0; sample < 12; sample++) {
    await page.waitForTimeout(150);
    const actors = analyze(await page.evaluate(() => window.__npcProbe.last));
    breathingSamples.push(actors);
  }
  const captainRatios = breathingSamples.map(actors => actors.find(a => a.id === 'captain').breathing);
  const playerRatios = breathingSamples.map(actors => actors.find(a => a.id === 'player').breathing);
  assert.ok(Math.max(...captainRatios) - Math.min(...captainRatios) > 0.0015, 'NPC breathing changes over time');
  assert.ok(captainRatios.every(ratio => Math.abs(ratio - 1) < 0.01), 'NPC breathing stays subtle');
  assert.ok(playerRatios.every(ratio => Math.abs(ratio - 1) < 1e-9), 'player is not affected by NPC breathing');

  // 前後遮擋：主角走到艦長後方，繪製順序互換
  await page.locator('.game-canvas').focus();
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => {
    const player = window.__npcProbe.last.find(call => /\/characters\/(idle\/Transparent_570x720|walk)\//.test(call.src));
    return player && player.y + player.height < 970;
  }, null, { timeout: 5000 });
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__npcProbe.last);
  const afterActors = analyze(after);
  const occluderAfter = wallDraws(after);
  assert.equal(occluderAfter.length, 2);
  assert.ok(indexOf(after, PLAYER) < occluderAfter[0].index, 'player walked behind the wall foot line: the wall piece now covers the player');
  assert.ok(afterActors.findIndex(a => a.id === 'player') < afterActors.findIndex(a => a.id === 'captain'), 'walking across NPC depth reverses player/NPC draw order');
  await page.screenshot({ path: path.join(out, 'npc-ship-after.png') });

  // 點伊恩的頭（在對話多邊形外）→ 走到互動點開啟對話 → 伊恩轉向主角（東南）
  const ian = npcCall(after, 'ian');
  assert.equal(ian.asset.direction, 'SW');
  const canvasBox = await page.locator('.game-canvas').boundingBox();
  const headWorld = { x: 560, y: 850 - (ian.call.height / ian.asset.height) * ian.asset.bodyHeight * 0.8 };
  const headScreen = { x: canvasBox.x + ian.call.transform.a * headWorld.x + ian.call.transform.e,
    y: canvasBox.y + ian.call.transform.d * headWorld.y + ian.call.transform.f };
  await page.mouse.click(headScreen.x, headScreen.y);
  await page.getByText('NPC interaction fixture').first().waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForFunction(() => window.__npcProbe.last.some(call => /\/idle\/伊恩\/04_SE/.test(call.src)), null, { timeout: 3000 });
  const talking = await page.evaluate(() => window.__npcProbe.last);
  const talkingIan = npcCall(talking, 'ian');
  assert.equal(talkingIan.asset.direction, 'SE', 'NPC faces the player during dialogue');
  await page.screenshot({ path: path.join(out, 'npc-ship-talking.png') });
  // 結束對話 → 轉回原本面向
  for (let attempt = 0; attempt < 8 && await page.getByText('NPC interaction fixture').first().isVisible(); attempt++) {
    await page.getByText('NPC interaction fixture').first().click();
    await page.waitForTimeout(400);
  }
  assert.equal(await page.getByText('NPC interaction fixture').first().isVisible(), false, 'dialogue closed');
  await page.waitForFunction(() => window.__npcProbe.last.some(call => /\/idle\/伊恩\/06_SW/.test(call.src)), null, { timeout: 4000 });
  assert.deepEqual(errors, [], 'no browser page errors');

  // 預先載入：每個 NPC 8 個方向都已請求並成功
  const npcResponses = imageResponses.filter(r => /\/idle\/(歐文|艦長|蕾娜|伊恩)\//.test(r.url));
  const uniqueNpcFiles = new Set(npcResponses.map(r => r.url));
  assert.equal(uniqueNpcFiles.size, 32, 'all 8 directions of the 4 NPCs were preloaded');
  assert.ok(npcResponses.every(r => r.status === 200));
  assert.equal(createHash('sha256').update(await readFile(scenePath)).digest('hex'), originalHash, 'production ship scene unchanged');
  const report = { url, fixtureOnly: true, viewport: { width: 1600, height: 1000 }, before: beforeActors, after: afterActors,
    breathing: { captainMin: Math.min(...captainRatios), captainMax: Math.max(...captainRatios) },
    clickedHead: headScreen, talkingDirection: talkingIan.asset.direction, npcFiles: uniqueNpcFiles.size,
    pageErrors: errors, productionSceneHash: originalHash, productionSceneUnchanged: true };
  await writeFile(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('PASS actual MovementLab: wall occluder piece flips with the wall-foot line, independent NPCs, player-matched height, depth reversal, breathing, head click opens dialogue, NPC turns to player and back, 32 preloaded sprites, foreground order, no page errors.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
