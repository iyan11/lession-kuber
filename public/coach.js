import { manifests } from './lab-manifests.js';
import { simulateAdvanced } from './advanced-simulation.js';
export function suggest(command, output = '') {
  const text = `${command}\n${output}`;
  if (/^minicube\b/i.test(command)) return { title: 'Опечатка в названии', text: 'Правильное имя инструмента — minikube, через k.', command: command.replace(/^minicube/i, 'minikube') };
  if (/ErrImageNeverPull|ImagePullBackOff|ErrImagePull|image.*not found/i.test(output)) return { title: 'Контейнер не запущен: образ недоступен', text: 'Посмотрите, какой образ указан в Deployment. При политике Never этот образ должен уже находиться на узле. В последнем уроке мы намеренно указали неправильный тег и исправляем его откатом.', command: 'kubectl --context kubelab -n kubelab describe deployment kubelab' };
  if (/connection.*refused|cannot connect|daemon.*not running|docker.*unavailable|error during connect/i.test(output)) return { title: 'Нет подключения', text: 'Открой Docker Desktop и дождись запуска Engine. Затем проверь состояние профиля.', command: 'minikube status -p kubelab' };
  if (/context.*(not found|does not exist)|profile.*not found|does not exist.*profile/i.test(output)) return { title: 'Учебный кластер не создан', text: 'Создай профиль kubelab. Он используется во всех командах курса.', command: 'minikube start -p kubelab --driver=docker --cpus=2 --memory=3072' };
  if (/not found in PATH|не найден в PATH|ENOENT/i.test(output)) return { title: 'Не найдена нужная программа', text: 'Откройте «Помощь» → «Проверить установленные компоненты». Эта проверка покажет, какой программы не хватает.', command: 'help' };
  if (/address already in use|bind.*(failed|forbidden)|port.*allocated/i.test(output)) return { title: 'Порт занят', text: 'Останови предыдущий туннель или выбери другой локальный порт, например 8082.', command: 'kubectl --context kubelab -n kubelab port-forward service/kubelab 8082:80' };
  if (/CrashLoopBackOff/i.test(output)) return { title: 'Контейнер перезапускается', text: 'Прочитай логи предыдущего запуска контейнера. Имя Pod возьми из get pods.', command: 'kubectl --context kubelab -n kubelab get pods' };
  if (/notfound|not found|No resources found/i.test(output)) return { title: 'Ресурс не найден', text: 'Проверь namespace kubelab и применён ли lab.yaml.', command: 'kubectl --context kubelab apply -f k8s/lab.yaml' };
  if (/unknown command|unknown flag|незнаком|не поддерж/i.test(output)) return { title: 'Проверь синтаксис', text: 'Обрати внимание на имя команды и флаги. Tab дополняет команды курса. В консоли запускаются команды по одной.', command: `${command.trim().split(/\s+/)[0] || 'kubectl'} --help` };
  if (/^kubectl\s+get\s+(pod|pods)\s*$/.test(command)) return { title: 'Выбери учебный namespace', text: 'Без namespace команда смотрит в default. В курсе ресурсы находятся в kubelab.', command: 'kubectl --context kubelab -n kubelab get pods' };
  if (/\bedit\b/.test(command)) return { title: 'Нужен внешний редактор', text: 'Встроенная консоль не поддерживает интерактивный редактор. Используй patch из урока ConfigMap или обычный PowerShell.', command: '' };
  if (output && /error|ошибка|failed/i.test(output)) return { title: 'Команда завершилась с ошибкой', text: 'Прочитай сообщение выше. Проверь контекст, namespace и справку команды.', command: 'kubectl --context kubelab -n kubelab get events --sort-by=.metadata.creationTimestamp' };
  return { title: 'Пояснение к команде', text: 'Вставьте команду из текста урока. Здесь появится объяснение её назначения, результата или обнаруженной ошибки.', command: '' };
}

export function createSimulation() {
  return { cluster: false, image: false, loaded: false, container: false, deployed: false, replicas: 2, version: '1.0', previous: '1.0', broken: false, readinessBroken: false, secret: false, storage: false, note: null, reader: false, revision: 1, message: 'Привет из Kubernetes!', appliedMessage: 'Привет из Kubernetes!' };
}

export function simulate(command, state) {
  if (/kubelab-(deep|multi|upgrade|mesh|gitops|project)/.test(command)) return {code:1,text:'Этот опыт требует отдельного реального стенда. Тренажёр его не исполняет и не подтверждает результат.'};
  const cmd = command.trim();
  const advanced = simulateAdvanced(cmd, state);
  if (advanced !== null) return advanced;
  const words = cmd.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const tool = words[0];
  const ok = text => ({ code: 0, text });
  const fail = text => ({ code: 1, text });
  if (tool === 'minicube') return fail('Ошибка: minicube — незнакомая команда. Правильно: minikube.');
  if (tool === 'docker') {
    if (/^docker (version|--version)$/.test(cmd)) return ok('Docker Engine • Linux containers\n[Симуляция: Docker не опрашивался]');
    if (/^docker build -t kubelab:1\.0 \.$/.test(cmd)) { state.image = true; return ok('Симуляция сборки: kubelab:1.0 создан.'); }
    if (/^docker run -d --name kubelab-web -p 127\.0\.0\.1:8080:3000 kubelab:1\.0$/.test(cmd)) {
      if (!state.image) return fail('Error: image kubelab:1.0 not found. Сначала выполни build.');
      if (state.container) return fail('Error: container name kubelab-web already in use.');
      state.container = true; return ok('sim-container-01\nСимуляция: контейнер запущен. Реальный порт не открывался.');
    }
    if (cmd === 'docker ps') return ok('CONTAINER ID    IMAGE           STATUS      NAMES\n' + (state.container ? 'sim-01          kubelab:1.0     Up          kubelab-web' : ''));
    if (cmd === 'docker logs kubelab-web') return state.container ? ok('KubeLab: http://0.0.0.0:3000') : fail('Error: container kubelab-web not found');
    if (cmd === 'docker rm -f kubelab-web') { state.container = false; return ok('kubelab-web'); }
  }
  if (tool === 'minikube') {
    if (cmd === 'minikube image ls -p kubelab') {
      if (!state.cluster) return fail('Error: profile kubelab not found');
      return ok('Симуляция: показаны учебные образы.\n' + (state.loaded ? 'docker.io/library/kubelab:1.0' : 'Образ kubelab:1.0 пока не собран.'));
    }
    if (cmd === 'minikube image build -t kubelab:1.0 . -p kubelab') {
      if (!state.cluster) return fail('Error: profile kubelab not found');
      state.image = state.loaded = true; return ok('Симуляция: образ kubelab:1.0 собран внутри профиля kubelab.');
    }
    if (/^minikube start -p kubelab --driver=docker --cpus=2 --memory=3072$/.test(cmd)) { state.cluster = true; return ok('Симуляция: профиль kubelab запущен.\nAPI server: Running • kubelet: Running'); }
    if (cmd === 'minikube status -p kubelab') return state.cluster ? ok('kubelab\nhost: Running\nkubelet: Running\napiserver: Running') : fail('Error: profile kubelab not found');
    if (cmd === 'minikube image load kubelab:1.0 -p kubelab') {
      if (!state.cluster) return fail('Error: profile kubelab not found');
      if (!state.image) return fail('Error: image kubelab:1.0 not found');
      state.loaded = true; return ok('Образ kubelab:1.0 загружен в учебный профиль (симуляция).');
    }
  }
  if (tool === 'kubectl') {
    if (!state.cluster) return fail('The connection to the server was refused. Учебный кластер не запущен.');
    if (!cmd.includes('--context kubelab')) return fail('Симулятор ожидает явный --context kubelab. Используй команды курса.');
    if (/ get nodes$/.test(cmd)) return ok('NAME      STATUS   ROLES           AGE\nkubelab   Ready    control-plane   2m');
    if (/ get storageclass$/.test(cmd)) return ok('NAME                 PROVISIONER\nstandard (default)   k8s.io/minikube-hostpath');
    const fileAction = cmd.match(/ (apply|delete) -f k8s\/(secret|storage|reader)\.yaml$/);
    if (fileAction) {
      if (!state.deployed) return fail('Error from server (NotFound): namespace kubelab not found');
      const [, action, name] = fileAction;
      if (action === 'delete' && !state[name]) return fail('Error from server (NotFound): учебные объекты не созданы');
      state[name] = action === 'apply';
      if (name === 'storage' && action === 'delete') state.note = null;
      return ok(`Симуляция: объекты ${name}.yaml ${action === 'apply' ? 'созданы или обновлены' : 'удалены'}.`);
    }
    if (/ apply -f k8s\/lab.yaml$/.test(cmd)) { state.deployed = true; state.broken = false; state.replicas = 2; state.version = '1.0'; state.message = state.appliedMessage = 'Привет из Kubernetes!'; return ok('namespace/kubelab configured\nconfigmap/kubelab-config configured\ndeployment.apps/kubelab configured\nservice/kubelab configured'); }
    if (!cmd.includes('-n kubelab')) return fail('Симулятор ожидает -n kubelab. Ресурсы курса находятся в этом namespace.');
    if (!state.deployed) return fail('Error from server (NotFound): namespace kubelab not found');
    if (/ get deployment kubelab -o yaml$/.test(cmd)) return ok(manifests.lab.split('---')[2].replace('/readyz', state.readinessBroken ? '/missing' : '/readyz'));
    if (/ patch deployment kubelab --type strategic -p /.test(cmd)) {
      try {
        const patch = JSON.parse(cmd.split(' -p ')[1].replace(/^'|'$/g, ''));
        const container = patch.spec?.template?.spec?.containers?.[0];
        const path = container?.readinessProbe?.httpGet?.path;
        if (container?.name !== 'web' || !['/missing', '/readyz'].includes(path)) throw new Error();
        state.readinessBroken = path === '/missing'; state.revision++;
        return ok('deployment.apps/kubelab patched (симуляция)');
      } catch { return fail('Error: используйте частичное описание проверки из урока.'); }
    }
    if (/ get secret kubelab-demo$/.test(cmd)) return state.secret ? ok('NAME           TYPE     DATA\nkubelab-demo   Opaque   1') : fail('Error: Secret not found');
    if (/ logs pod\/kubelab-secret-check --pod-running-timeout=120s$/.test(cmd)) return state.secret && state.loaded ? ok('DEMO_TOKEN is set') : fail('Error: учебный Pod или образ не создан');
    if (/ get pod kubelab-secret-check$/.test(cmd)) return state.secret && state.loaded ? ok('NAME                   READY   STATUS\nkubelab-secret-check   0/1     Completed') : fail('Error: учебный Pod или образ не создан');
    if (/ rollout status deployment\/kubelab-storage --timeout=120s$/.test(cmd)) return state.storage && state.loaded ? ok('deployment "kubelab-storage" successfully rolled out') : fail('Error: учебное приложение или образ не создан');
    if (/ get pvc kubelab-notes$/.test(cmd)) return state.storage ? ok('NAME            STATUS   VOLUME\nkubelab-notes   Bound    pvc-sim-notes') : fail('Error: PVC not found');
    if (/ exec deployment\/kubelab-storage -- node -e /.test(cmd)) {
      if (!state.storage || !state.loaded) return fail('Error: учебный контейнер не запущен');
      if (cmd.endsWith(`"require('node:fs').writeFileSync('/data/note.txt','Hello from a persistent volume')"`)) { state.note = 'Hello from a persistent volume'; return ok(''); }
      if (cmd.endsWith(`"console.log(require('node:fs').readFileSync('/data/note.txt','utf8'))"`)) return state.note === null ? fail('Error: ENOENT: /data/note.txt') : ok(state.note);
    }
    if (/ delete pods -l app=kubelab-storage$/.test(cmd)) return state.storage ? ok('Симуляция: Pod хранилища заменён, данные заявки сохранены.') : fail('Error: учебное приложение не создано');
    const access = cmd.match(/ auth can-i (get|delete) (pods|secrets) --as=system:serviceaccount:kubelab:kubelab-reader$/);
    if (access) return state.reader && access[1] === 'get' && access[2] === 'pods' ? ok('yes') : fail('no');
    if (/ get pods$/.test(cmd)) {
      const rows = Array.from({ length: state.replicas }, (_, i) => `kubelab-r${state.revision}-${i + 1}     1/1     Running             0`);
      if (state.readinessBroken) rows.push(`kubelab-r${state.revision}-unready   0/1     Running    0`);
      if (state.broken || !state.loaded) rows.push(`kubelab-r${state.revision}-bad   0/1     ErrImageNeverPull    0`);
      return ok('NAME                 READY   STATUS              RESTARTS\n' + (!state.loaded ? rows.at(-1) : rows.join('\n')));
    }
    if (/ get services$/.test(cmd)) return ok('NAME      TYPE        CLUSTER-IP    PORT(S)\nkubelab   ClusterIP   10.96.0.10    80/TCP');
    if (/ get endpointslices$/.test(cmd)) return ok('NAME           ADDRESSTYPE   PORTS   ENDPOINTS\nkubelab-sim    IPv4          3000    10.244.0.2,10.244.0.3');
    if (/ port-forward service\/kubelab \d+:80$/.test(cmd)) return state.loaded ? ok('Симуляция туннеля: реальный порт не открывался.\nВ режиме реальных команд эта операция работает до нажатия «Стоп».') : fail('Error: pod is not running (ErrImageNeverPull)');
    if (/ scale deployment\/kubelab --replicas=[1-5]$/.test(cmd)) { state.replicas = Number(cmd.at(-1)); return ok(`deployment.apps/kubelab scaled: ${state.replicas}`); }
    if (/ delete pods -l app=kubelab$/.test(cmd)) { state.revision++; return ok('Учебные Pod удалены. Deployment создал замены (переходы сокращены симулятором).'); }
    if (/ set env deployment\/kubelab APP_VERSION=2\.0$/.test(cmd)) { state.previous = state.version; state.version = '2.0'; state.revision++; return ok('deployment.apps/kubelab env updated'); }
    if (/ patch configmap kubelab-config --type merge -p /.test(cmd)) {
      try { const patch = JSON.parse(cmd.split(' -p ')[1].replace(/^'|'$/g, '')); if (typeof patch.data?.LAB_MESSAGE !== 'string') throw new Error(); state.message = patch.data.LAB_MESSAGE; return ok('configmap/kubelab-config patched'); }
      catch { return fail('Error: invalid JSON patch. Используй команду из урока.'); }
    }
    if (/ rollout restart deployment\/kubelab$/.test(cmd)) { state.appliedMessage = state.message; state.revision++; return ok('deployment.apps/kubelab restarted'); }
    if (/ set image deployment\/kubelab web=kubelab:missing$/.test(cmd)) { state.broken = true; state.revision++; return ok('deployment.apps/kubelab image updated'); }
    if (/ rollout undo deployment\/kubelab$/.test(cmd)) { if (state.broken) state.broken = false; else [state.version, state.previous] = [state.previous, state.version]; state.revision++; return ok('deployment.apps/kubelab rolled back'); }
    if (/ rollout status deployment\/kubelab --timeout=120s$/.test(cmd)) return state.readinessBroken ? fail('Error: rollout timed out. Readiness probe failed: 404.') : state.broken || !state.loaded ? fail('Error: rollout timed out. Pod: ErrImageNeverPull.') : ok(`deployment "kubelab" successfully rolled out\nВерсия: ${state.version}\nСообщение: ${state.appliedMessage}`);
    if (/ rollout history deployment\/kubelab$/.test(cmd)) return ok(`deployment.apps/kubelab\nREVISION: ${state.revision}\nСимулятор хранит только предыдущую версию; полная история доступна в реальном кластере.`);
    if (/ describe deployment kubelab$/.test(cmd) || / get events --sort-by=.metadata.creationTimestamp$/.test(cmd)) return ok(state.readinessBroken ? 'Warning  Unhealthy  kubelet  Readiness probe failed: HTTP probe failed with statuscode: 404' : state.broken || !state.loaded ? 'Warning  Failed  kubelet  Error: ErrImageNeverPull\nОбраз отсутствует в локальном runtime.' : 'Normal  ScalingReplicaSet  deployment-controller  Scaled up replica set');
    if (/ logs deployment\/kubelab --tail=30$/.test(cmd)) return ok('KubeLab: http://0.0.0.0:3000\n[Симуляция логов]');
  }
  if (/ --help$/.test(cmd) && ['docker', 'minikube', 'kubectl'].includes(tool)) return ok('Симулятор поддерживает команды курса. Нажмите команду в уроке, чтобы вставить её.\nРеальный режим показывает справку установленной программы.');
  return fail('Команда не поддерживается учебным симулятором. Используй точные команды из урока или переключись в реальный режим.');
}
