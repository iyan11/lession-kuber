export function desired(resource, namespace) {
  const name = `labservice-${resource.metadata.name}`;
  return { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name, namespace, ownerReferences: [{ apiVersion: resource.apiVersion, kind: resource.kind, name: resource.metadata.name, uid: resource.metadata.uid, controller: true, blockOwnerDeletion: false }] }, spec: { replicas: resource.spec.replicas ?? 1, selector: { matchLabels: { app: name } }, template: { metadata: { labels: { app: name } }, spec: { automountServiceAccountToken: false, securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } }, containers: [{ name: 'web', image: 'kubelab:1.0', imagePullPolicy: 'Never', env: [{ name: 'LAB_MESSAGE', value: resource.spec.message }], resources: { requests: { cpu: '25m', memory: '32Mi' }, limits: { cpu: '200m', memory: '128Mi' } }, securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } } }] } } } };
}
export async function reconcile(resource, { namespace, request, log = () => {} }) {
  const scope = `/apis/apps/v1/namespaces/${namespace}/deployments`;
  if (resource.metadata.deletionTimestamp) return;
  const next = desired(resource, namespace);
  const route = scope + '/' + encodeURIComponent(next.metadata.name);
  const current = await request('GET', route);
  if (current.status === 404) {
    const result = await request('POST', scope, next);
    if (result.status !== 201 && result.status !== 409) throw new Error(`Create failed: ${result.status}`);
    if (result.status === 201) log(JSON.stringify({ event: 'created', resource: resource.metadata.name })); return;
  }
  if (current.status !== 200) throw new Error(`Read failed: ${current.status}`);
  if (!current.value.metadata.ownerReferences?.some(owner => owner.uid === resource.metadata.uid && owner.controller)) throw new Error('Refusing to adopt an unrelated Deployment');
  const oldContainer = current.value.spec.template.spec.containers.find(x => x.name === 'web');
  const message = oldContainer?.env?.find(x => x.name === 'LAB_MESSAGE')?.value;
  // Avoid an update on every polling pass. Only our two teaching fields are managed.
  if (current.value.spec.replicas === next.spec.replicas && message === resource.spec.message) return;
  const patch = { metadata: { resourceVersion: current.value.metadata.resourceVersion }, spec: { replicas: next.spec.replicas, template: next.spec.template } };
  const result = await request('PATCH', route, patch);
  if (![200, 409].includes(result.status)) throw new Error(`Update failed: ${result.status}`);
  if (result.status === 200) log(JSON.stringify({ event: 'updated', resource: resource.metadata.name }));
}
