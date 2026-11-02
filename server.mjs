import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/lessons.js', ['lessons.js', 'text/javascript; charset=utf-8']],
  ['/advanced-lessons.js', ['advanced-lessons.js', 'text/javascript; charset=utf-8']],
  ['/operator-lesson.js', ['operator-lesson.js', 'text/javascript; charset=utf-8']],
  ['/advanced-manifests.js', ['advanced-manifests.js', 'text/javascript; charset=utf-8']],
  ['/advanced-simulation.js', ['advanced-simulation.js', 'text/javascript; charset=utf-8']],
  ['/course-details.js', ['course-details.js', 'text/javascript; charset=utf-8']],
  ['/extra-lessons.js', ['extra-lessons.js', 'text/javascript; charset=utf-8']],
  ['/lab-manifests.js', ['lab-manifests.js', 'text/javascript; charset=utf-8']],
  ['/coach.js', ['coach.js', 'text/javascript; charset=utf-8']],
  ['/lesson-view.js', ['lesson-view.js', 'text/javascript; charset=utf-8']],
  ['/course-view.js', ['course-view.js', 'text/javascript; charset=utf-8']],
  ['/help-view.js', ['help-view.js', 'text/javascript; charset=utf-8']],
  ['/questions-view.js', ['questions-view.js', 'text/javascript; charset=utf-8']],
  ['/updates-view.js', ['updates-view.js', 'text/javascript; charset=utf-8']],
  ['/chat-history.js', ['chat-history.js', 'text/javascript; charset=utf-8']]
]);
for (const name of ['index','catalog','model','resources','foundations','operations','storage','network','secrets','admission','observability','identity-platform','delivery']) files.set(`/professional/${name}.js`, [`professional/${name}.js`, 'text/javascript; charset=utf-8']);
files.set('/coverage-view.js', ['coverage-view.js', 'text/javascript; charset=utf-8']);
let requests = 0;
let observedRequests = 0, observedErrors = 0, observedDuration = 0;
const started = Date.now();
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end();
  }
  const path = new URL(req.url, 'http://localhost').pathname;
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(incomingId) ? incomingId : randomUUID();
  const trace = typeof req.headers.traceparent === 'string' ? req.headers.traceparent.match(/^00-((?!0{32})[a-f0-9]{32})-(?!0{16})[a-f0-9]{16}-[a-f0-9]{2}$/) : null;
  const traceId = trace?.[1] || null;
  res.setHeader('X-Request-ID', requestId);
  if (path === '/api/runtime') {
    const began = performance.now();
    res.once('finish', () => {
      const durationSeconds = (performance.now() - began) / 1000;
      observedRequests++; observedDuration += durationSeconds;
      if (res.statusCode >= 500) observedErrors++;
      console.log(JSON.stringify({ time: new Date().toISOString(), event: 'http', pod: process.env.POD_NAME || hostname(), route: '/api/runtime', status: res.statusCode, durationSeconds, requestId, ...(traceId ? { traceId } : {}) }));
    });
  }
  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
  };
  if (path === '/healthz' || path === '/readyz') return json({ status: 'ok' });
  if (path === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
    return res.end(req.method === 'HEAD' ? undefined : `# HELP kubelab_http_requests_total Completed runtime requests in this process.\n# TYPE kubelab_http_requests_total counter\nkubelab_http_requests_total{route="/api/runtime"} ${observedRequests}\n# TYPE kubelab_http_errors_total counter\nkubelab_http_errors_total ${observedErrors}\n# TYPE kubelab_http_duration_seconds_sum counter\nkubelab_http_duration_seconds_sum ${observedDuration}\n# TYPE kubelab_process_resident_memory_bytes gauge\nkubelab_process_resident_memory_bytes ${process.memoryUsage().rss}\n`);
  }
  if (path === '/api/runtime') {
    requests++;
    return json({ pod: process.env.POD_NAME || hostname(), namespace: process.env.POD_NAMESPACE || 'local', version: process.env.APP_VERSION || '1.0', message: process.env.LAB_MESSAGE || 'Привет из KubeLab!', uptimeSeconds: Math.floor((Date.now() - started) / 1000), requests, requestId, traceId });
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
