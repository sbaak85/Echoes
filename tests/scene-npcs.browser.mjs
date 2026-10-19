// Actual MovementLab + isolated Vite scene fixture. Never edits public/maps or player saves.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'output/npc-integration');
const site = path.join(out, 'fixture-site');
const scenePath = path.join(root, 'public/maps/ship_interior.scene.json');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'C:/Users/sbaak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
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
const placements = [
  { suffix: '011', characterId: 'owen', x: 660, y: 1160, facing: 'NE', scale: 0.85 },
  { suffix: '012', characterId: 'captain', x: 760, y: 985, facing: 'SE', scale: 1 },
  { suffix: '013', characterId: 'rena', x: 1090, y: 870, facing: 'NW', scale: 1.15 },
  { suffix: '014', characterId: 'ian', x: 530, y: 850, facing: 'SW', scale: 1 },
];
fixture.interactables = placements.map(({ suffix, ...npc }) => {
  const existing = original.interactables.find(i => i.id === `shipinterior-interaction-${suffix}`);
  assert.ok(existing, `Fixture must reuse existing Interaction ${suffix}`);
  return { ...existing, npc, useRequirements: [], dialogue: { lines: [{ speaker: 'NPC fixture', text: 'NPC interaction fixture' }] } };
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
  await page.waitForFunction(() => window.__npcProbe.last.filter(call => /\/idle\/(歐文|艦長|蕾娜|伊恩)\//.test(call.src)).length === 4, { timeout: 45000 });
  await page.waitForTimeout(450);
  const before = await page.evaluate(() => window.__npcProbe.last);
  const lookup = Object.fromEntries(catalog.characters.flatMap(character => Object.entries(character.sprites).map(([direction, asset]) => [asset.file, { ...asset, characterId: character.id, direction }])));
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
        assert.ok(Math.abs(pixelScale * asset.bodyHeight - 152 * placement.scale) < 1e-7, `${asset.characterId}: world body height`);
        assert.ok(Math.abs(call.width / call.height - 570 / 720) < 1e-10, `${asset.characterId}: no width distortion`);
        assert.equal(call.naturalWidth, 570); assert.equal(call.naturalHeight, 720);
        assert.ok(new URL(call.src).pathname.startsWith('/Echoes/characters/idle/'));
        actors.push({ id: asset.characterId, footX, footY, bodyHeight: pixelScale * asset.bodyHeight });
      } else if (/\/characters\/(idle\/Transparent_570x720|walk)\//.test(call.src)) {
        actors.push({ id: 'player', footX: call.x + call.width / 2, footY: call.y + call.height });
      }
    }
    assert.equal(actors.length, 5, 'exactly four NPCs and player were drawn');
    assert.deepEqual(actors.map(a => a.footY), [...actors.map(a => a.footY)].sort((a, b) => a - b), 'actual canvas draw order follows foot Y');
    assert.match(frame.at(-1).src, /ship_interior_Wall\.png/, 'walls remain above all character art');
    return actors;
  }
  const beforeActors = analyze(before);
  assert.ok(beforeActors.findIndex(a => a.id === 'captain') < beforeActors.findIndex(a => a.id === 'player'));
  await page.screenshot({ path: path.join(out, 'npc-ship-before.png') });
  await page.locator('.game-canvas').focus();
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => {
    const player = window.__npcProbe.last.find(call => /\/characters\/(idle\/Transparent_570x720|walk)\//.test(call.src));
    return player && player.y + player.height < 970;
  }, { timeout: 5000 });
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__npcProbe.last);
  const afterActors = analyze(after);
  assert.ok(afterActors.findIndex(a => a.id === 'player') < afterActors.findIndex(a => a.id === 'captain'), 'walking across NPC depth reverses player/NPC draw order');
  await page.screenshot({ path: path.join(out, 'npc-ship-after.png') });
  assert.deepEqual(errors, [], 'no browser page errors');
  const npcResponses = imageResponses.filter(r => /\/idle\/(歐文|艦長|蕾娜|伊恩)\//.test(r.url));
  assert.equal(npcResponses.length, 4); assert.ok(npcResponses.every(r => r.status === 200));
  assert.equal(createHash('sha256').update(await readFile(scenePath)).digest('hex'), originalHash, 'production ship scene unchanged');
  const report = { url, fixtureOnly: true, viewport: { width: 1600, height: 1000 }, before: beforeActors, after: afterActors, npcResponses, pageErrors: errors, productionSceneHash: originalHash, productionSceneUnchanged: true };
  await writeFile(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('PASS actual MovementLab: four NPCs, real keyboard walking, depth reversal, 152px/scale geometry, /Echoes/ assets, foreground order, no page errors.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
