import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const allowed = new Set(['index.html', 'style.css', 'drag.css', 'hardware.css', 'portrait.css', 'app.mjs', 'model.mjs', 'input.mjs', 'drag.mjs', 'assets/motherboard-portrait.png', 'assets/bus-module-portrait.png']);
const port = Number(process.env.PORT || 3067);
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
  const resource = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!allowed.has(resource)) return res.writeHead(404).end();
  try {
    const content = await readFile(path.join(root, resource));
    const type = resource.endsWith('.png') ? 'image/png' : resource.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : resource.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(500).end('Preview file unavailable'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Bus-card preview: http://127.0.0.1:${port}/`));
