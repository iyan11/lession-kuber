// Small polling controller for the isolated LabService exercise.
import https from 'node:https';
import { reconcile } from './lab-operator-model.mjs';
import { readFile } from 'node:fs/promises';
const credentials = '/var/run/secrets/kubernetes.io/serviceaccount/';
const namespace = (await readFile(credentials + 'namespace', 'utf8')).trim();
if (namespace !== 'kubelab') throw new Error('This learning controller only operates in namespace kubelab.');
const ca = await readFile(credentials + 'ca.crt');
let stopped = false;
process.on('SIGTERM', () => { stopped = true; });
async function request(method, pathname, data) {
  // Read the projected token for each request so rotation does not require restart.
  const token = (await readFile(credentials + 'token', 'utf8')).trim();
  const body = data === undefined ? undefined : JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'kubernetes.default.svc', port: 443, path: pathname, method, ca, timeout: 5000, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': method === 'PATCH' ? 'application/merge-patch+json' : 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}) } }, res => {
      let size = 0; const chunks = [];
      res.on('error', reject);
      res.on('data', chunk => { size += chunk.length; if (size > 1024 * 1024) res.destroy(new Error('Response exceeds learning limit')); else chunks.push(chunk); });
      res.on('end', () => { try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve({ status: res.statusCode, value }); } catch { reject(new Error('Invalid API response')); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('API timeout')));
    if (body) req.write(body);
    req.end();
  });
}
while (!stopped) {
  try {
    const list = await request('GET', `/apis/training.kubelab.local/v1/namespaces/${namespace}/labservices`);
    if (list.status !== 200) throw new Error(`List failed: ${list.status}`);
    for (const resource of list.value.items) { if (stopped) break; await reconcile(resource, { namespace, request, log: line => console.log(line) }); }
  } catch (error) { console.error(JSON.stringify({ event: 'reconcile-error', reason: error.message })); }
  if (!stopped) await new Promise(resolve => setTimeout(resolve, 5000));
}
