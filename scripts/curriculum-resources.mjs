import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const ns = 'kubelab';
const meta = (name, extra = {}) => ({ name, namespace: ns, ...extra });
const security = { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } };
const containerSecurity = { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } };
const container = (name = 'web', extra = {}) => ({ name, image: 'kubelab:1.0', imagePullPolicy: 'Never', ports: [{ name: 'http', containerPort: 3000 }], resources: { requests: { cpu: '25m', memory: '32Mi' }, limits: { cpu: '200m', memory: '128Mi' } }, securityContext: containerSecurity, ...extra });
const spec = (containers, extra = {}) => ({ automountServiceAccountToken: false, securityContext: security, containers, ...extra });
const template = (labels, containers, extra = {}) => ({ metadata: { labels }, spec: spec(containers, extra) });
const deployment = (name, extra = {}, podExtra = {}, containers = [container()]) => ({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: meta(name), spec: { replicas: 1, selector: { matchLabels: { app: name } }, template: template({ app: name }, containers, podExtra), ...extra } });
const pod = (name, containers, extra = {}) => ({ apiVersion: 'v1', kind: 'Pod', metadata: meta(name), spec: spec(containers, extra) });
const documents = {
  lifecycle: [pod('kubelab-lifecycle', [container('worker', { command: ['node', '-e'], args: ["console.log('started'); process.on('SIGTERM', () => { console.log('finishing'); setTimeout(() => process.exit(0), 1000) }); setInterval(() => {}, 1000)"] })], { terminationGracePeriodSeconds: 10 })],
  scheduling: [deployment('kubelab-placement', {}, { nodeSelector: { 'kubernetes.io/os': 'linux' } })],
  batch: [
    { apiVersion: 'batch/v1', kind: 'Job', metadata: meta('kubelab-report'), spec: { backoffLimit: 1, template: template({ app: 'kubelab-report' }, [container('report', { command: ['node', '-e'], args: ["console.log(JSON.stringify({report:'learning',rows:3}))"] })], { restartPolicy: 'Never' }) } },
    { apiVersion: 'batch/v1', kind: 'CronJob', metadata: meta('kubelab-schedule'), spec: { schedule: '*/5 * * * *', timeZone: 'Etc/UTC', suspend: true, concurrencyPolicy: 'Forbid', successfulJobsHistoryLimit: 1, failedJobsHistoryLimit: 1, jobTemplate: { spec: { backoffLimit: 1, template: template({ app: 'kubelab-schedule' }, [container('report', { command: ['node', '-e'], args: ["console.log('scheduled report')"] })], { restartPolicy: 'Never' }) } } } }
  ],
  stateful: [
    { apiVersion: 'v1', kind: 'Service', metadata: meta('kubelab-stateful'), spec: { clusterIP: 'None', selector: { app: 'kubelab-stateful' }, ports: [{ name: 'http', port: 3000, targetPort: 'http' }] } },
    { apiVersion: 'apps/v1', kind: 'StatefulSet', metadata: meta('kubelab-stateful'), spec: { serviceName: 'kubelab-stateful', replicas: 2, selector: { matchLabels: { app: 'kubelab-stateful' } }, template: template({ app: 'kubelab-stateful' }, [container('web', { volumeMounts: [{ name: 'notes', mountPath: '/data' }] })]), volumeClaimTemplates: [{ metadata: { name: 'notes' }, spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '200Mi' } } } }] } }
  ],
  client: [pod('kubelab-client', [container('client', { command: ['node', '-e'], args: ['setInterval(() => {}, 1000)'] })])],
  ingress: [{ apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata: meta('kubelab-route'), spec: { ingressClassName: 'nginx', rules: [{ host: 'kubelab.test', http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'kubelab', port: { number: 80 } } } }] } }] } }],
  deny: [{ apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata: meta('kubelab-web-ingress'), spec: { podSelector: { matchLabels: { app: 'kubelab' } }, policyTypes: ['Ingress'], ingress: [] } }],
  allow: [{ apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata: meta('kubelab-web-ingress'), spec: { podSelector: { matchLabels: { app: 'kubelab' } }, policyTypes: ['Ingress'], ingress: [{ from: [{ podSelector: { matchLabels: { access: 'web' } } }], ports: [{ protocol: 'TCP', port: 3000 }] }] } }],
  tenant: [
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'kubelab-team' } },
    { apiVersion: 'v1', kind: 'ResourceQuota', metadata: { name: 'team-budget', namespace: 'kubelab-team' }, spec: { hard: { pods: '5', 'requests.cpu': '500m', 'requests.memory': '512Mi', 'limits.cpu': '1', 'limits.memory': '1Gi' } } },
    { apiVersion: 'v1', kind: 'LimitRange', metadata: { name: 'container-defaults', namespace: 'kubelab-team' }, spec: { limits: [{ type: 'Container', defaultRequest: { cpu: '25m', memory: '32Mi' }, default: { cpu: '200m', memory: '128Mi' } }] } }
  ],
  restricted: [{ apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'kubelab-security', labels: { 'pod-security.kubernetes.io/enforce': 'restricted', 'pod-security.kubernetes.io/enforce-version': 'latest' } } }],
  'security-check': [{ ...pod('kubelab-safe', [container()]), metadata: { name: 'kubelab-safe', namespace: 'kubelab-security' } }],
  rotation: [
    { apiVersion: 'v1', kind: 'Secret', metadata: meta('kubelab-rotation'), type: 'Opaque', stringData: { DEMO_TOKEN: 'example-generation-one' } },
    deployment('kubelab-rotation', {}, {}, [container('check', { command: ['node', '-e'], args: ["console.log('token mounted: '+Boolean(process.env.DEMO_TOKEN)); setInterval(() => {}, 1000)"], env: [{ name: 'DEMO_TOKEN', valueFrom: { secretKeyRef: { name: 'kubelab-rotation', key: 'DEMO_TOKEN' } } }] })])
  ],
  autoscale: [{ apiVersion: 'autoscaling/v2', kind: 'HorizontalPodAutoscaler', metadata: meta('kubelab-scale'), spec: { scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'kubelab' }, minReplicas: 2, maxReplicas: 4, metrics: [{ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 60 } } }] } }],
  disruption: [{ apiVersion: 'policy/v1', kind: 'PodDisruptionBudget', metadata: meta('kubelab-availability'), spec: { minAvailable: 1, selector: { matchLabels: { app: 'kubelab' } } } }],
  canary: [
    deployment('kubelab-canary', {}, {}, [container('web', { env: [{ name: 'APP_VERSION', value: 'candidate' }] })]),
    { apiVersion: 'v1', kind: 'Service', metadata: meta('kubelab-preview'), spec: { selector: { app: 'kubelab-canary' }, ports: [{ port: 80, targetPort: 'http' }] } }
  ],
  custom: [{ apiVersion: 'apiextensions.k8s.io/v1', kind: 'CustomResourceDefinition', metadata: { name: 'labservices.training.kubelab.local' }, spec: { group: 'training.kubelab.local', scope: 'Namespaced', names: { plural: 'labservices', singular: 'labservice', kind: 'LabService', shortNames: ['labsrv'] }, versions: [{ name: 'v1', served: true, storage: true, schema: { openAPIV3Schema: { type: 'object', properties: { spec: { type: 'object', required: ['message'], properties: { message: { type: 'string', minLength: 1 }, replicas: { type: 'integer', minimum: 1, maximum: 4, default: 1 } } } } } } }] } }],
  'custom-instance': [{ apiVersion: 'training.kubelab.local/v1', kind: 'LabService', metadata: meta('welcome'), spec: { message: 'Hello from a custom resource', replicas: 2 } }]
};
documents.operator = [
  { apiVersion: 'v1', kind: 'ServiceAccount', metadata: meta('kubelab-operator') },
  { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'Role', metadata: meta('kubelab-operator'), rules: [{ apiGroups: ['training.kubelab.local'], resources: ['labservices'], verbs: ['get', 'list', 'watch'] }, { apiGroups: ['apps'], resources: ['deployments'], verbs: ['get', 'create', 'patch'] }] },
  { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding', metadata: meta('kubelab-operator'), subjects: [{ kind: 'ServiceAccount', name: 'kubelab-operator', namespace: ns }], roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'kubelab-operator' } },
  deployment('kubelab-operator', {}, { serviceAccountName: 'kubelab-operator', automountServiceAccountToken: true }, [container('controller', { image: 'kubelab:operator', command: ['node', 'lab-operator.mjs'] })])
];
await mkdir(new URL('k8s/advanced/', root), { recursive: true });
// JSON is valid YAML; use it for generation, so no YAML parser is required by the generator.
// Human-readable YAML is produced below with scalar quoting and indentation.
const scalar = v => typeof v === 'string' ? JSON.stringify(v) : String(v);
function yaml(value, depth = 0) {
  const indent = ' '.repeat(depth);
  if (Array.isArray(value)) return value.map(item => item && typeof item === 'object' ? indent + '-\n' + yaml(item, depth + 2) : indent + '- ' + scalar(item) + '\n').join('');
  return Object.entries(value).map(([key, val]) => {
    const field = /^[a-zA-Z0-9_./-]+$/.test(key) ? key : JSON.stringify(key);
    if (val && typeof val === 'object') return Object.keys(val).length ? `${indent}${field}:\n${yaml(val, depth + 2)}` : `${indent}${field}: ${Array.isArray(val) ? '[]' : '{}'}\n`;
    return `${indent}${field}: ${scalar(val)}\n`;
  }).join('');
}
const manifests = Object.fromEntries(Object.entries(documents).map(([name, docs]) => [name, { text: docs.map(d => yaml(d)).join('---\n'), resources: docs }]));
for (const [name, {text}] of Object.entries(manifests)) await writeFile(new URL(`k8s/advanced/${name}.yaml`, root), text);
await writeFile(new URL('public/advanced-manifests.js', root), '// Generated by scripts/curriculum-resources.mjs\nexport const advancedManifests = ' + JSON.stringify(manifests, null, 2) + ';\n');
await mkdir(new URL('k8s/overlays/dev/', root), { recursive: true });
await writeFile(new URL('k8s/overlays/dev/kustomization.yaml', root), 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n  - ../../lab.yaml\nreplicas:\n  - name: kubelab\n    count: 1\n');
await mkdir(new URL('charts/kubelab/templates/', root), { recursive: true });
await writeFile(new URL('charts/kubelab/Chart.yaml', root), 'apiVersion: v2\nname: kubelab-example\nversion: 0.1.0\ntype: application\n');
await writeFile(new URL('charts/kubelab/values.yaml', root), 'replicaCount: 1\nimage: kubelab:1.0\n');
await writeFile(new URL('charts/kubelab/templates/deployment.yaml', root), `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  namespace: {{ .Release.Namespace }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
      containers:
        - name: web
          image: {{ .Values.image | quote }}
          imagePullPolicy: Never
          resources:
            requests:
              cpu: 25m
              memory: 32Mi
            limits:
              cpu: 200m
              memory: 128Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
`);
const assetPaths = ['charts/kubelab/Chart.yaml', 'charts/kubelab/values.yaml', 'charts/kubelab/templates/deployment.yaml', 'k8s/overlays/dev/kustomization.yaml', 'lab-operator.mjs', 'lab-operator-model.mjs'];
const assets = Object.fromEntries(await Promise.all(assetPaths.map(async name => [name, await readFile(new URL(name, root), 'utf8')])));
await appendFile(new URL('public/advanced-manifests.js', root), 'export const advancedAssets = ' + JSON.stringify(assets, null, 2) + ';\n');
console.log(`${Object.keys(manifests).length} example files generated`);
