import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.SHIP_TUTORIAL_TEST_PORT || 3042);
const recipeOrder = process.env.SHIP_TUTORIAL_TEST_ORDER || 'original';
const font = (await readFile(path.join(root, 'app/globals.css'), 'utf8')).match(/--inventory-font-family\s*:\s*[^;]+;/)?.[0] ?? '';
const server = await createServer({
  configFile: false, root, cacheDir: path.join(tmpdir(), `echoes-starship-tutorial-test-${port}-${recipeOrder}`),
  plugins: [{ name: 'starship-tutorial-test-recipe-order', enforce: 'pre', transform(code, id) {
    if (!['first', 'last'].includes(recipeOrder) || !id.replaceAll('\\', '/').split('?')[0].endsWith('/app/crafting-workbench.tsx')) return;
    // QA-only source transform. The production recipe table is never changed.
    const marker = 'const recipes=cooking?COOKING_RECIPES:WORKBENCH_RECIPES;';
    if (!code.includes(marker)) throw new Error('Tutorial recipe-order test needs review');
    const delta = recipeOrder === 'first' ? -1 : 1;
    return code.replace(marker, `const recipes=cooking?COOKING_RECIPES:[...WORKBENCH_RECIPES].sort((a,b)=>a.id==="T0006"?${delta}:b.id==="T0006"?${-delta}:0);`);
  }}, react(), { name: 'starship-tutorial-test-entry', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, `http://127.0.0.1:${port}`).pathname !== '/') return next();
      try {
        const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>正式飛船教學元件驗證</title><link rel="icon" href="data:,"><style>:root{${font}}*{box-sizing:border-box}html,body,#root{margin:0;width:100%;height:100%;background:#06131b;color:#dfdfd2;font-family:var(--inventory-font-family)}button{font:inherit}</style></head><body><div id="root"></div><script type="module" src="/tests/fixtures/starship-crafting-tutorial-harness.tsx"></script></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await vite.transformIndexHtml('/', html));
      } catch (error) { next(error); }
    });
  }}],
  server: { host: '127.0.0.1', port, strictPort: true },
});
await server.listen(); console.log(`http://127.0.0.1:${port}/ — isolated real-component QA, recipe order: ${recipeOrder} (no player saves)`);
