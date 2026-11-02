import { advancedManifests as examples } from './advanced-manifests.js';
import { manifests } from './lab-manifests.js';
const copy = value => JSON.parse(JSON.stringify(value));
const key = (context, resource) => `${context}/${resource.kind}/${resource.metadata.namespace || ''}/${resource.metadata.name}`;
export function simulateAdvanced(command, state) {
  const a = state.advanced ||= { objects: {}, profiles: { kubelab: true }, images: {}, secretSource: 1, secretProcess: 1, metrics: false, observations: false, logs: [], helmRevision: 0, helmReplicas: 0 };
  const ok = text => ({ code: 0, text });
  const fail = text => ({ code: 1, text });
  const context = command.match(/--(?:kube-)?context[= ]([^ ]+)/)?.[1] || 'kubelab';
  const namespace = command.match(/(?:-n|--namespace) ([^ ]+)/)?.[1] || 'kubelab';
  const objects = Object.values(a.objects).filter(x => x.context === context).map(x => x.resource);
  const find = (kind, name, ns = namespace) => objects.find(x => x.kind === kind && x.metadata.name === name && (x.metadata.namespace || '') === ns);
  const set = resource => { a.objects[key(context, resource)] = { context, resource: copy(resource) }; };
  const reconcile = () => {
    const controller = a.objects[`${context}/Deployment/kubelab/kubelab-operator`];
    const parent = a.objects[`${context}/LabService/kubelab/welcome`]?.resource;
    if (!controller || !parent) return;
    const name = 'labservice-welcome';
    const before = a.objects[`${context}/Deployment/kubelab/${name}`]?.resource;
    if (before?.spec.replicas === parent.spec.replicas && before?.spec.template.spec.containers[0].env[0].value === parent.spec.message) return;
    set({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name, namespace: 'kubelab', ownerReferences: [{ kind: 'LabService', name: 'welcome', uid: 'simulated-uid' }] }, spec: { replicas: parent.spec.replicas, template: { spec: { containers: [{ name: 'web', env: [{ name: 'LAB_MESSAGE', value: parent.spec.message }] }] } } } });
    (a.controllerLog ||= []).push(JSON.stringify({ event: before ? 'updated' : 'created', resource: 'welcome' }));
  };
  if (command === 'minikube stop -p kubelab') { if (!state.cluster) return fail('Учебный профиль не запущен.'); state.cluster = false; return ok('Симуляция: основной профиль остановлен, данные сохранены.'); }
  if (command === 'minikube start -p kubelab') { state.cluster = true; return ok('Симуляция: основной профиль снова запущен.'); }
  if (command === 'minikube start -p kubelab-policy --driver=docker --cni=calico --cpus=2 --memory=3072') { a.profiles['kubelab-policy'] = true; return ok('Симуляция: отдельный профиль с моделью NetworkPolicy готов. Настоящий Calico не устанавливался.'); }
  if (command === 'minikube delete -p kubelab-policy') { delete a.profiles['kubelab-policy']; for (const k of Object.keys(a.objects)) if (k.startsWith('kubelab-policy/')) delete a.objects[k]; return ok('Симуляция: профиль опыта и его данные удалены.'); }
  const build = command.match(/^minikube image build -t (kubelab:(?:observe|delivery|operator|1\.0)) \. -p (kubelab(?:-policy)?)$/);
  if (build && (build[1] !== 'kubelab:1.0' || build[2] !== 'kubelab')) {
    if (!(build[2] === 'kubelab' ? state.cluster : a.profiles[build[2]])) return fail('Учебный профиль не запущен.');
    a.images[`${build[2]}/${build[1]}`] = true; return ok('Симуляция сборки: ' + build[1] + '. Файлы компьютера не читались.');
  }
  if (command === 'minikube addons enable metrics-server -p kubelab') { if (!state.cluster) return fail('Кластер не запущен.'); a.metrics = true; return ok('Симуляция: источник учебных метрик включён. Реальные измерения не выполнялись.'); }
  if (command.startsWith('helm ')) {
    if (command === 'helm version --short') return ok('Helm [учебная модель; установленная версия не проверялась]');
    if (command === 'helm lint charts/kubelab') return ok('Симуляция: подготовленный учебный пакет проходит проверку. Пользовательские файлы не читались.');
    if (command === 'helm template kubelab-package charts/kubelab --namespace kubelab') return ok('Симуляция результата шаблона:\nkind: Deployment\nmetadata:\n  name: kubelab-package\nspec:\n  replicas: 1\n[Сокращённое представление; настоящий Helm формирует полный документ.]');
    if (!state.cluster) return fail('Учебный кластер не запущен.');
    if (/^helm upgrade (?:--install )?kubelab-package charts\/kubelab --kube-context kubelab --namespace kubelab(?: --set replicaCount=2)? --wait --timeout 120s$/.test(command)) { a.helmRevision++; a.helmReplicas = command.includes('--set') ? 2 : 1; return ok(`Симуляция: kubelab-package deployed, revision ${a.helmRevision}, replicas ${a.helmReplicas}.`); }
    if (command === 'helm history kubelab-package --kube-context kubelab --namespace kubelab') return a.helmRevision ? ok(`Симуляция: текущая версия установки ${a.helmRevision}; копий ${a.helmReplicas}.`) : fail('Установка не найдена.');
    if (command === 'helm uninstall kubelab-package --kube-context kubelab --namespace kubelab') { if (!a.helmReplicas) return fail('Установка не найдена.'); a.helmReplicas = 0; return ok('Симуляция: установка удалена.'); }
    return null;
  }
  if (!command.startsWith('kubectl ')) return null;
  if (!command.includes('--context ')) return null;
  if (!(context === 'kubelab' ? state.cluster : a.profiles[context])) return fail('Учебный кластер не запущен.');
  if (context === 'kubelab-policy' && command.endsWith(' apply -f k8s/lab.yaml')) { a.policyApp = true; return ok('Симуляция: сервер и Service созданы в отдельном профиле.'); }
  const file = command.match(/ (apply|delete)( --dry-run=server)? -f k8s\/advanced\/([a-z-]+)\.yaml$/);
  if (file && examples[file[3]]) {
    const [, action, dry, name] = file;
    const docs = examples[name].resources;
    if (dry) return ok(docs.map(x => `${x.kind}/${x.metadata.name} (server dry run; симуляция)`).join('\n'));
    if (action === 'apply') {
      if (name === 'custom-instance' && !find('CustomResourceDefinition', 'labservices.training.kubelab.local', '')) return fail('Вид LabService ещё не зарегистрирован.');
      if (name === 'client' && context === 'kubelab-policy' && !a.policyApp) return fail('Сначала создайте сервер и пространство имён.');
      if (name === 'operator' && !a.images['kubelab/kubelab:operator']) return fail('Сначала соберите образ контроллера.');
      for (const resource of docs) set(resource);
      if (name === 'rotation') a.secretSource = a.secretProcess = 1;
      if (name === 'stateful') for (const i of [0, 1]) set({ apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: { name: `notes-kubelab-stateful-${i}`, namespace: 'kubelab' }, status: { phase: 'Bound' } });
      if (name === 'operator' || name === 'custom-instance') reconcile();
      return ok(docs.map(x => `${x.kind}/${x.metadata.name} configured (симуляция)`).join('\n'));
    }
    for (const resource of docs) {
      delete a.objects[key(context, resource)];
      if (resource.kind === 'Namespace') for (const k of Object.keys(a.objects)) if (k.startsWith(context + '/') && a.objects[k].resource.metadata.namespace === resource.metadata.name) delete a.objects[k];
    }
    if (name === 'custom-instance') delete a.objects[`${context}/Deployment/kubelab/labservice-welcome`];
    return ok(docs.map(x => `${x.kind}/${x.metadata.name} deleted (симуляция)`).join('\n'));
  }
  if (command.endsWith(' apply --dry-run=server -f k8s/lab.yaml')) return ok('Симуляция: Namespace, ConfigMap, Deployment и Service прошли серверную пробу; живое состояние не менялось.');
  if (command.endsWith(' kustomize k8s/overlays/dev')) return ok(manifests.lab.replace('replicas: 2', 'replicas: 1'));
  if (command.endsWith(' apply --dry-run=server -k k8s/overlays/dev')) return ok('Симуляция: сформированные ресурсы прошли пробу; число копий не изменено.');
  if (command.endsWith(' get --raw=/readyz')) return ok('ok [симуляция]');
  if (command.endsWith(' wait --for=condition=Ready pod/kubelab-client --timeout=120s')) return find('Pod', 'kubelab-client') ? ok('condition met [симуляция]') : fail('Клиент не создан.');
  if (command.endsWith(' wait --for=create deployment/labservice-welcome --timeout=120s')) return find('Deployment', 'labservice-welcome') ? ok('condition met [симуляция]') : fail('Контроллер ещё не создал приложение.');
  if (/ version -o yaml$/.test(command)) return ok('clientVersion: {gitVersion: "учебная версия"}\nserverVersion: {gitVersion: "учебная версия"}\n[Настоящие версии не проверялись.]');
  if (command.endsWith(' describe node kubelab')) return ok('Симуляция описания узла\nCapacity: 2 CPU, 3072Mi\nAllocatable: условные значения учебной модели\n[Это не измерение компьютера.]');
  if (command.endsWith(" get node kubelab -o jsonpath='{.status.nodeInfo.containerRuntimeVersion}'")) return ok('containerd://учебная-модель');
  if (command.endsWith(' get nodes --show-labels')) return ok('kubelab   Ready   kubernetes.io/os=linux');
  if (namespace === 'kube-system' && command.endsWith(' get pods')) return ok('Симуляция: kube-apiserver-kubelab, etcd-kubelab, kube-scheduler-kubelab, kube-controller-manager-kubelab, CoreDNS — Running.');
  if (namespace === 'kube-system' && command.endsWith(' get daemonsets')) return ok('Симуляция: kube-proxy. Состав зависит от сетевой реализации настоящего кластера.');
  if (command.endsWith(' get replicasets')) return ok(`Симуляция: ReplicaSet текущего шаблона, DESIRED ${state.replicas}, READY ${state.replicas}.`);
  if (command.endsWith(' auth can-i create deployments')) return ok('yes');
  if (command.endsWith(' get ingressclass')) return ok('No resources found (учебная модель без контроллера Ingress).');
  if (command.endsWith(' get storageclass -o yaml')) return ok('apiVersion: storage.k8s.io/v1\nkind: StorageClass\nmetadata:\n  name: standard\nprovisioner: k8s.io/minikube-hostpath\nreclaimPolicy: Delete\nvolumeBindingMode: Immediate\n[Симуляция локального класса.]');
  if (command.endsWith(' get persistentvolumes')) return ok(objects.some(x => x.kind === 'PersistentVolumeClaim') ? 'Учебные тома: Bound, политика Delete (симуляция).' : 'No resources found.');
  if (command.endsWith(' get pvc')) return ok(objects.filter(x => x.kind === 'PersistentVolumeClaim').map(x => `${x.metadata.name}   Bound`).join('\n') || 'No resources found.');
  if (command.endsWith(' delete pvc notes-kubelab-stateful-0 notes-kubelab-stateful-1')) { for (const i of [0, 1]) delete a.objects[`${context}/PersistentVolumeClaim/kubelab/notes-kubelab-stateful-${i}`]; return ok('Симуляция: две учебные заявки и их данные удалены.'); }
  if (/ get pods -l app=kubelab-(placement|stateful) -o wide$/.test(command)) {
    const type = command.includes('stateful') ? 'StatefulSet' : 'Deployment'; const name = type === 'StatefulSet' ? 'kubelab-stateful' : 'kubelab-placement';
    return find(type, name) ? ok(type === 'StatefulSet' ? 'kubelab-stateful-0  1/1 Running kubelab\nkubelab-stateful-1  1/1 Running kubelab' : 'kubelab-placement-sim  1/1 Running kubelab') : ok('No resources found.');
  }
  if (command.endsWith(' get pods -o wide')) return ok(`Симуляция: ${state.replicas} Pod, разные адреса 10.244.0.…, узел kubelab.`);
  if (namespace === 'kubelab-security' && command.endsWith(' get pods')) return find('Pod', 'kubelab-safe') ? ok('kubelab-safe  1/1  Running [симуляция]') : ok('No resources found.');
  if (command.endsWith(' get service kubelab -o yaml')) return ok(manifests.lab.split('---').at(-1) + '\n# Учебная модель ClusterIP: 10.96.0.10');
  if (command.endsWith(' get endpointslices -l kubernetes.io/service-name=kubelab')) return ok('kubelab-sim   IPv4   3000   10.244.0.2,10.244.0.3');
  const rollout = command.match(/ rollout status (deployment|statefulset)\/(kubelab-(?:rotation|canary|stateful)) --timeout=(?:120|180)s$/);
  if (rollout) return find(rollout[1] === 'deployment' ? 'Deployment' : 'StatefulSet', rollout[2]) ? ok(`${rollout[2]} successfully rolled out [симуляция]`) : fail('Объект опыта не создан.');
  if (context === 'kubelab-policy' && / rollout status deployment\/kubelab --timeout=180s$/.test(command)) return a.policyApp ? ok('successfully rolled out [симуляция]') : fail('Сначала создайте сервер.');
  if (/ wait --for=condition=complete job\/kubelab-report --timeout=120s$/.test(command)) return find('Job', 'kubelab-report') ? ok('condition met [симуляция]') : fail('Job не создан.');
  if (command.endsWith(' logs job/kubelab-report')) return find('Job', 'kubelab-report') ? ok('{"report":"learning","rows":3}') : fail('Job не создан.');
  if (command.endsWith(' logs pod/kubelab-lifecycle --pod-running-timeout=120s')) return find('Pod', 'kubelab-lifecycle') ? ok('started') : fail('Pod не создан.');
  if (command.endsWith(' get cronjob kubelab-schedule')) return find('CronJob', 'kubelab-schedule') ? ok('kubelab-schedule   */5 * * * *   SUSPEND True') : fail('CronJob не создан.');
  if (command.endsWith(' describe resourcequota team-budget')) return find('ResourceQuota', 'team-budget') ? ok('Симуляция: Used 0, Hard pods=5, requests.cpu=500m, requests.memory=512Mi, limits.cpu=1, limits.memory=1Gi.') : fail('Квота не создана.');
  if (command.endsWith(' get limitrange container-defaults -o yaml')) return find('LimitRange', 'container-defaults') ? ok(JSON.stringify(find('LimitRange', 'container-defaults'), null, 2)) : fail('LimitRange не создан.');
  if (command.endsWith(" patch secret kubelab-rotation --type merge -p '{\"stringData\":{\"DEMO_TOKEN\":\"example-generation-two\"}}'")) { if (!find('Secret', 'kubelab-rotation')) return fail('Secret не создан.'); a.secretSource = 2; return ok('Secret patched [симуляция]'); }
  if (command.endsWith(' rollout restart deployment/kubelab-rotation')) { if (!find('Deployment', 'kubelab-rotation')) return fail('Потребитель не создан.'); a.secretProcess = a.secretSource; return ok('Deployment restarted [симуляция]'); }
  if (command.includes(' exec deployment/kubelab-rotation -- node -e ')) return find('Deployment', 'kubelab-rotation') ? ok(String(a.secretProcess === 2)) : fail('Потребитель не создан.');
  if (namespace === 'kube-system' && command.endsWith(' wait --for=condition=Available deployment/metrics-server --timeout=180s')) return a.metrics ? ok('condition met [симуляция]') : fail('Источник метрик не включён.');
  if (command.endsWith(' top pods')) return a.metrics ? ok('Симуляция измерений: CPU 5m, MEMORY 40Mi на копию. Настоящие ресурсы не измерялись.') : fail('Metrics API unavailable');
  const image = command.match(/ set image deployment\/kubelab web=kubelab:(observe|delivery|1\.0)$/);
  if (image && (image[1] !== '1.0' || a.observations)) { if (image[1] !== '1.0' && !a.images[`kubelab/kubelab:${image[1]}`]) return fail('Сначала соберите указанный учебный образ.'); a.observations = image[1] !== '1.0'; return ok('Deployment image updated [симуляция]'); }
  if (command.endsWith(' get hpa kubelab-scale') || command.endsWith(' describe hpa kubelab-scale')) return find('HorizontalPodAutoscaler', 'kubelab-scale') ? a.metrics ? ok('Симуляция: CPU 10% / 60%, MIN 2, MAX 4, REPLICAS 3. AbleToScale=True, ScalingActive=True. Масштабирование нагрузки не исполнялось.') : ok('TARGETS <unknown>/60%; ScalingActive=False: метрики недоступны.') : fail('HPA не создан.');
  if (command.endsWith(' get pdb kubelab-availability')) return find('PodDisruptionBudget', 'kubelab-availability') ? ok(`Симуляция: MIN AVAILABLE 1, ALLOWED DISRUPTIONS ${Math.max(0, state.replicas - 1)}.`) : fail('Бюджет не создан.');
  if (command.endsWith(' wait --for=condition=Established crd/labservices.training.kubelab.local --timeout=120s')) return find('CustomResourceDefinition', 'labservices.training.kubelab.local', '') ? ok('condition met [симуляция]') : fail('CRD не создано.');
  if (command.endsWith(' get labservices.training.kubelab.local welcome -o yaml')) return find('LabService', 'welcome') ? ok(JSON.stringify(find('LabService', 'welcome'), null, 2)) : fail('LabService не создан.');
  if (/ rollout status deployment\/(kubelab-operator|labservice-welcome) --timeout=120s$/.test(command)) return find('Deployment', command.includes('deployment/kubelab-operator') ? 'kubelab-operator' : 'labservice-welcome') ? ok('successfully rolled out [симуляция цикла контроллера]') : fail('Deployment ещё не создан.');
  if (command.includes(' patch labservices.training.kubelab.local welcome --type merge -p ')) {
    const parent = find('LabService', 'welcome'); if (!parent) return fail('LabService не создан.');
    try {
      const patch = JSON.parse(command.split(' -p ')[1].replace(/^'|'$/g, ''));
      if (!Number.isInteger(patch.spec?.replicas) || patch.spec.replicas < 1 || patch.spec.replicas > 4 || !patch.spec.message) return fail('Значения не соответствуют учебной схеме.');
      parent.spec = patch.spec; reconcile(); return ok('LabService patched; учебный цикл применил изменение.');
    } catch { return fail('Неправильный JSON.'); }
  }
  if (command.endsWith(' get deployment labservice-welcome -o yaml')) return find('Deployment', 'labservice-welcome') ? ok(JSON.stringify(find('Deployment', 'labservice-welcome'), null, 2)) : fail('Deployment не создан.');
  if (command.endsWith(' logs deployment/kubelab-operator --tail=20')) return find('Deployment', 'kubelab-operator') ? ok((a.controllerLog || []).join('\n')) : fail('Контроллер не создан.');
  if (command.endsWith(' get deployments,services,configmaps,pvc')) return ok('Симуляция: Deployment kubelab; Service kubelab; ConfigMap kubelab-config. Дополнительные учебные объекты: ' + objects.map(x => x.kind + '/' + x.metadata.name).join(', '));
  if (command.endsWith(' port-forward service/kubelab-preview 8082:80')) return find('Service', 'kubelab-preview') ? ok('Симуляция предпросмотра: APP_VERSION=candidate. Настоящий порт не открывался; доли трафика не распределялись.') : fail('Service предпросмотра не создан.');
  if (context === 'kubelab-policy' && command.endsWith(' label pod kubelab-client access=web --overwrite')) { const client = find('Pod', 'kubelab-client'); if (!client) return fail('Клиент не создан.'); client.metadata.labels = { access: 'web' }; return ok('Pod labeled [симуляция]'); }
  if (command.includes(' exec pod/kubelab-client -- node -e ')) {
    const client = find('Pod', 'kubelab-client'); if (!client) return fail('Сначала создайте клиентский Pod.');
    if (command.includes("require('node:dns').lookup")) return ok('10.96.0.10');
    const policy = find('NetworkPolicy', 'kubelab-web-ingress');
    if (policy && (!policy.spec.ingress.length || client.metadata.labels?.access !== 'web')) return fail('TimeoutError [симуляция запрета сети]');
    if (command.includes('kubelab-log-example')) { if (!a.observations) return fail('Сначала подготовьте образ для наблюдений.'); a.logs.push({ event: 'http', requestId: 'kubelab-log-example', status: 200 }); return ok('kubelab-log-example'); }
    if (command.includes('traceparent:')) { if (!a.observations) return fail('Сначала подготовьте образ для наблюдений.'); const traceId = '0123456789abcdef0123456789abcdef'; a.logs.push({ event: 'http', traceId, status: 200 }); return ok(traceId); }
    if (command.includes("fetch('http://kubelab/healthz'")) return ok('200');
    if (command.includes("fetch('http://kubelab/api/runtime'")) return ok('kubelab-simulated-pod');
    return null;
  }
  if (command.endsWith(' logs -l app=kubelab --all-containers=true --prefix=true --tail=20')) return ok(a.logs.map(x => 'kubelab-sim/web ' + JSON.stringify(x)).join('\n') || '[Симуляция: проверяемых запросов пока не было.]');
  return null;
}
