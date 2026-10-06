import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.SHIP_TUTORIAL_PREVIEW_PORT || 3043);
const url = `http://127.0.0.1:${port}/starship-crafting-preview`;
const server = await createServer({
  configFile: false, root, cacheDir: path.join(tmpdir(), `echoes-starship-tutorial-preview-${port}`),
  plugins: [react(), { name: 'starship-crafting-preview-entry', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, url).pathname !== '/starship-crafting-preview') return next();
      try {
        const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>飛船製作系統教學 · 預覽</title><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import Preview from '/app/starship-crafting-preview/page.tsx';import '/app/globals.css';createRoot(document.getElementById('root')).render(React.createElement(Preview));</script></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await vite.transformIndexHtml(req.url, html));
      } catch (error) { next(error); }
    });
  }}],
  server: { host: '127.0.0.1', port, strictPort: true },
});
await server.listen(); console.log(`${url} — Interaction entry + production tutorial, no player saves`);
