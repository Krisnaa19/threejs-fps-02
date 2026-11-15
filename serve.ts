// serve.ts — a tiny static server for game/ (Node 22, standard library only).
// Run: `node serve.ts --port 8090` then open http://localhost:8090
// It serves only files under game/, with the MIME types a browser game needs.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8090 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8090;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  let path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!path.startsWith(root + sep) && path !== root) {
    response.writeHead(403); response.end('forbidden'); return;
  }
  if (path === root) path = join(root, 'index.html');
  let st;
  try { st = statSync(path); } catch { response.writeHead(404); response.end('not found'); return; }
  if (!st.isFile()) { response.writeHead(404); response.end('not found'); return; }
  response.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
  createReadStream(path).pipe(response);
}).listen(port, () => console.log('DUSTLINE serving game/ on http://localhost:' + port));
