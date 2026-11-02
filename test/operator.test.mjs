import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../lab-operator-model.mjs';
const resource = () => ({ apiVersion: 'training.kubelab.local/v1', kind: 'LabService', metadata: { name: 'welcome', uid: 'owner-1' }, spec: { message: 'first', replicas: 2 } });
test('operator reconciliation creates once, updates its managed fields and retries conflicts', async () => {
  let stored, conflict = false; const mutations = [];
  const request = async (method, route, body) => {
    assert.match(route, /^\/apis\/apps\/v1\/namespaces\/kubelab\/deployments/);
    if (method === 'GET') return stored ? { status: 200, value: structuredClone(stored) } : { status: 404, value: {} };
    mutations.push({ method, body });
    if (method === 'POST') { stored = structuredClone(body); stored.metadata.resourceVersion = '1'; return { status: 201 }; }
    assert.equal(method, 'PATCH'); assert.equal(body.metadata.resourceVersion, stored.metadata.resourceVersion);
    if (conflict) { conflict = false; stored.metadata.resourceVersion = '2'; return { status: 409 }; }
    stored.spec = { ...stored.spec, ...structuredClone(body.spec) }; return { status: 200 };
  };
  const input = resource(); const dependencies = { namespace: 'kubelab', request };
  await reconcile(input, dependencies); await reconcile(input, dependencies);
  assert.equal(mutations.length, 1);
  assert.equal(stored.metadata.ownerReferences[0].uid, input.metadata.uid);
  input.spec = { replicas: 3, message: 'changed' }; conflict = true;
  await reconcile(input, dependencies); assert.equal(stored.spec.replicas, 2);
  await reconcile(input, dependencies); assert.equal(stored.spec.replicas, 3);
  assert.equal(stored.spec.template.spec.containers[0].env[0].value, 'changed');
  assert.equal(stored.spec.template.spec.automountServiceAccountToken, false);
  const count = mutations.length; await reconcile(input, dependencies); assert.equal(mutations.length, count);
});
test('operator refuses an unrelated Deployment and ignores a deleting parent', async () => {
  let writes = 0, reads = 0;
  const request = async method => { if (method !== 'GET') writes++; else reads++; return { status: 200, value: { metadata: { ownerReferences: [{ uid: 'someone-else', controller: true }] } } }; };
  await assert.rejects(reconcile(resource(), { namespace: 'kubelab', request }), /Refusing to adopt/);
  assert.equal(writes, 0);
  const input = resource(); input.metadata.deletionTimestamp = '2026-01-01T00:00:00Z';
  await reconcile(input, { namespace: 'kubelab', request }); assert.equal(reads, 1);
});
