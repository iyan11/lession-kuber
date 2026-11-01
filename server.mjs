import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/lessons.js', ['lessons.js', 'text/javascript; charset=utf-8']],
  ['/coach.js', ['coach.js', 'text/javascript; charset=utf-8']],
  ['/lesson-view.js', ['lesson-view.js', 'text/javascript; charset=utf-8']],
  ['/help-view.js', ['help-view.js', 'text/javascript; charset=utf-8']]
]);
let requests = 0;
const started = Date.now();
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end();
  }
  const path = new URL(req.url, 'http://localhost').pathname;
  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
  };
  if (path === '/healthz' || path === '/readyz') return json({ status: 'ok' });
  if (path === '/api/runtime') {
    requests++;
    return json({ pod: process.env.POD_NAME || hostname(), namespace: process.env.POD_NAMESPACE || 'local', version: process.env.APP_VERSION || '1.0', message: process.env.LAB_MESSAGE || 'Привет из KubeLab!', uptimeSeconds: Math.floor((Date.now() - started) / 1000), requests });
  }
  const asset = files.get(path);
  if (!asset) return json({ error: 'Not found' }, 404);
  try {
    const body = await readFile(fileURLToPath(new URL(`./public/${asset[0]}`, import.meta.url)));
    res.writeHead(200, { 'Content-Type': asset[1] });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error.message); json({ error: 'Cannot read asset' }, 500);
  }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => {
  console.log(`KubeLab: http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  console.log(`${signal}: closing server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 9000).unref();
});
