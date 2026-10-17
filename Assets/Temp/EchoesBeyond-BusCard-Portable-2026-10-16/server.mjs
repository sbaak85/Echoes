import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const folders = { portrait: 'bus-card-portrait-preview', landscape: 'bus-card-preview' };
const common = ['index.html', 'style.css', 'drag.css', 'hardware.css', 'app.mjs', 'model.mjs', 'input.mjs', 'drag.mjs'];
const allowed = {
  portrait: new Set([...common, 'portrait.css', 'assets/motherboard-portrait.png', 'assets/bus-module-portrait.png']),
  landscape: new Set([...common, 'assets/motherboard.png', 'assets/bus-module.png', 'assets/motherboard-v2.png', 'assets/bus-module-v2.png']),
};
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
let port = 3070, view = 'portrait', openBrowser = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--open') openBrowser = true;
  else if (arg === '--no-open') openBrowser = false;
  else if (arg === '--port') port = Number(args[++i]);
  else if (arg.startsWith('--port=')) port = Number(arg.slice(7));
  else if (arg === '--view') view = args[++i];
  else if (arg.startsWith('--view=')) view = arg.slice(7);
  else if (arg === '--help') {
    console.log('node server.mjs [--port 3070] [--view portrait|landscape] [--open|--no-open]');
    process.exit(0);
  } else { console.error(`Unknown argument: ${arg}`); process.exit(1); }
}
if (!Number.isInteger(port) || port < 0 || port > 65535 || !Object.hasOwn(folders, view)) {
  console.error('Use a port from 0 to 65535 and view portrait or landscape.'); process.exit(1);
}
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405, { Allow: 'GET, HEAD' }).end();
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { return res.writeHead(400).end(); }
  if (pathname === '/') return res.writeHead(302, { Location: `/${view}/` }).end();
  if (['/portrait', '/landscape'].includes(pathname)) return res.writeHead(302, { Location: `${pathname}/` }).end();
  const match = /^\/(portrait|landscape)\/(.*)$/.exec(pathname);
  if (!match) return res.writeHead(404).end('Not found');
  const [, variant, tail] = match;
  const file = tail || 'index.html';
  if (!allowed[variant].has(file)) return res.writeHead(404).end('Not found');
  try {
    const content = await readFile(path.join(root, 'previews', folders[variant], file));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(500).end('Preview file unavailable. Extract the whole ZIP and run verify.cmd.'); }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Try start.cmd --port 3071 or --port 0.` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Ithaca Bus Card | ${process.version} | ${process.platform}/${process.arch}`);
  console.log(`Portrait:  ${origin}/portrait/`);
  console.log(`Landscape: ${origin}/landscape/`);
  console.log('Local preview only. Keep this window open; Ctrl+C stops the server.');
  if (openBrowser) {
    const url = `${origin}/${view}/`;
    const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const params = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
    const child = spawn(command, params, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log(`Open this URL manually: ${url}`));
    child.unref();
  }
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
