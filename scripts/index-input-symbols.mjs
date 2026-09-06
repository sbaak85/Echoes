// Read-only by default. Explicit --write refreshes documentation snapshots only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { GAMEPAD_GLYPHS, GAMEPAD_GLYPH_LABELS, getGamepadGlyphSvg } from '../app/gamepad-glyph.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = 'docs/ui/input-symbols';
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sourceFiles = ['app/gamepad-glyph.ts', 'app/gamepad-button-icon.tsx', 'public/ui/input/mouse-left.svg', 'public/ui/input/mouse-right.svg', 'tests/fixtures/gamepad-glyph-approved.json', `${directory}/keyboard-mouse-preview-source.html`];
const sources = sourceFiles.map(p => ({ path: p, sha256: hash(read(p)) }));
const approved = JSON.parse(read('tests/fixtures/gamepad-glyph-approved.json'));
const normalize = s => s.replace(/>\s+</g, '><').trim();
const glyph = (id, label, status, source, svg) => ({ id, label, status, source,
  viewBox: svg.match(/viewBox="([^"]+)"/)[1],
  text: [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map(m => ({ content: m[2], attributes: Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])) })),
  sha256: hash(svg), svg });
const gamepad = GAMEPAD_GLYPHS.map(id => {
  const svg = getGamepadGlyphSvg(id);
  if (normalize(svg) !== normalize(approved[GAMEPAD_GLYPH_LABELS[id]])) throw new Error(`Approved fixture mismatch: ${id}; do not silently rebaseline.`);
  return glyph(`gamepad.${id}`, GAMEPAD_GLYPH_LABELS[id], 'runtime-approved', 'app/gamepad-glyph.ts', svg);
});
const mouseLeft = glyph('mouse.left', '滑鼠左鍵（確認版 5）', 'runtime-approved', 'public/ui/input/mouse-left.svg', read('public/ui/input/mouse-left.svg').trim());
const mouseRight = glyph('mouse.right', '滑鼠右鍵', 'runtime-approved', 'public/ui/input/mouse-right.svg', read('public/ui/input/mouse-right.svg').trim());
const mouse = [mouseLeft, mouseRight];
const ids = ['E','M','Q','R','Tab','Space','Enter','Escape','W','A','S','D','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','1','2','3','4','5','6','7','MouseLeft','MouseRight','MouseHoldLeft','MouseDragLeft'];
const articles = [...read(`${directory}/keyboard-mouse-preview-source.html`).matchAll(/<article>([\s\S]*?)<\/article>/g)];
if (articles.length !== ids.length) throw new Error('Preview inventory changed: review IDs before refreshing.');
const keyboardMousePreview = articles.map((m, i) => glyph(`preview.${ids[i]}`, m[1].match(/<strong>(.*?)<\/strong>/)[1], i === 23 ? 'preview-copy-of-approved-mouse-left' : i === 24 ? 'preview-copy-of-approved-mouse-right' : 'preview-only-not-runtime-approved', `${directory}/keyboard-mouse-preview-source.html`, m[1].match(/<svg[\s\S]*?<\/svg>/)[0]));
const css = read('app/globals.css');
// Capture exact relevant rules in source order, including later overrides.
const cssRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => /gamepad-button-icon|gamepad-glyph-group|\.keycap|\.keyboard-input-hint|\.inventory-item-inspect-exit img/.test(m[1])).map(m => ({ selector: m[1].trim(), declarations: m[2].trim() }));
const index = { schemaVersion: 1, baselineDate: '2026-09-05',
  reservePolicy: 'All 27 keyboard/mouse candidates are reserve-only by default. Only apply the specific symbols the user explicitly requests to replace. Approved runtime mouse.left and explicitly authorized mouse.right are separate baselines.',
  authority: 'Current worktree runtime source + approved fixture. Archived keyboard/mouse preview is explicitly not a runtime baseline.',
  sources, gamepad, mouse, keyboardMousePreview,
  runtimeKeyboard: { representation: 'Text hints and CSS WASD keycaps; no shared keyboard SVG renderer in this baseline.', keycaps: ['W','A','S','D'], sources: ['app/movement-lab.tsx', 'app/globals.css'], debugPolicy: 'Preserve debug keyboard text; do not automatically replace.' },
  layout: { source: 'app/globals.css', cssRules },
};
const records = [...gamepad, ...mouse, ...keyboardMousePreview];
const rows = records.map(g => `| \`${g.id}\` | ${g.label} | ${g.status} | ${g.viewBox} | ${g.text.map(t => `${t.content}: ${t.attributes['font-size']}, x=${t.attributes.x}, y=${t.attributes.y}`).join('; ') || '向量圖形'} |`).join('\n');
const table = `# 完整符號規格清單（自動產生）\n\n由 scripts/index-input-symbols.mjs 產生；先讀 [README](README.md)。字級與座標是 SVG viewBox 單位，不是介面 CSS px。\n\n| ID | 名稱 | 狀態 | viewBox | 文字規格 |\n|---|---|---|---|---|\n${rows}\n\n逐筆完整 SVG、SHA-256、文字屬性與 CSS 規則見 [index.json](index.json)。CSS WASD 現行樣式另見 README；不是金色 SVG 預覽。\n`;
const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>手把與鍵鼠符號索引</title><style>body{background:#081a20;color:#e8dfc7;font:16px system-ui;padding:24px}a{color:#7edccb}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}article{border:1px solid #526052;padding:16px;background:#10262c;display:grid;gap:8px;justify-items:center;text-align:center}img{height:60px;max-width:100%}small{overflow-wrap:anywhere;color:#b4c4bd}code{font-size:12px}h2{margin-top:32px}</style><h1>目前 worktree 的按鍵符號索引</h1><p>已套用：19 個手把 + 滑鼠左鍵第 5 版 + 依明確需求套用的滑鼠右鍵。下方 27 款鍵鼠頁保留原稿，其中其他 25 款為預覽狀態。</p><p><a href="README.md">引用規則</a> · <a href="catalog.md">規格表</a> · <a href="index.json">機器索引</a></p>${[['遊戲已套用', [...gamepad,...mouse]],['鍵鼠預覽原稿（不代表已套用或核准）',keyboardMousePreview]].map(([title,gs])=>`<h2>${title}</h2><div class="grid">${gs.map(g=>`<article><img alt="${escape(g.label)}" src="data:image/svg+xml,${encodeURIComponent(g.svg)}"><strong>${escape(g.label)}</strong><code>${g.id}</code><small>${g.viewBox} · ${g.status}</small></article>`).join('')}</div>`).join('')}</html>`;
const reserveNotice = '27 款鍵鼠圖形僅為預備款，禁止直接引用或套用；只有使用者明確指定要替換的符號才可使用。';
const outputs = {
  'index.json': `${JSON.stringify(index,null,2)}\n`,
  'catalog.md': `${reserveNotice}\n\n${table}`,
  'preview.html': html.replace('<h1>', `<p><strong>${reserveNotice}</strong></p><h1>`),
};
let drift = false;
for (const [file, content] of Object.entries(outputs)) {
  const target = path.join(root, directory, file);
  if (process.argv.includes('--write')) fs.writeFileSync(target, content);
  else if (!fs.existsSync(target) || fs.readFileSync(target,'utf8') !== content) { console.error(`Out of date: ${directory}/${file}`); drift = true; }
}
if (drift) process.exitCode = 1;
else console.log(`Input symbol index ${process.argv.includes('--write') ? 'written' : 'verified'}: ${gamepad.length} gamepad, ${mouse.length} runtime mouse, ${keyboardMousePreview.length} archived previews; approved fixture matched.`);
