import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3457;

// Orders that actually reached the server: the guardrail must keep this at zero.
let ordersReceived = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname === '/api/orders/count') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: ordersReceived }));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/orders' && req.method === 'POST') ordersReceived++;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ method: req.method, path: url.pathname, synthetic: req.headers['x-synthetic'] ?? null }));
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'fixtures', 'shop.html'), 'utf-8'));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end(`Not found: ${url.pathname}`);
});

server.listen(PORT);
