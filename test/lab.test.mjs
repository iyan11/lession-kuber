import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { manifests } from '../public/lab-manifests.js';
import { advancedManifests, advancedAssets } from '../public/advanced-manifests.js';
import { renderCourse } from '../public/course-view.js';
import { createSimulation, simulate, suggest } from '../public/coach.js';
import { lessons } from '../public/lessons.js';
import { renderLesson } from '../public/lesson-view.js';
const { parseCommand } = createRequire(import.meta.url)('../desktop/command.cjs');

test('CLI argument boundaries preserve JSON and paths without executing a shell', () => {
  assert.deepEqual(parseCommand('minikube image build -t kubelab:1.0 . -p kubelab'), { executable: 'minikube', args: ['image', 'build', '-t', 'kubelab:1.0', '.', '-p', 'kubelab'] });
  assert.equal(parseCommand('docker build -t kubelab:1.0 .').executable, 'docker');
  assert.deepEqual(parseCommand('kubectl --context kubelab exec pod/example -- printenv -t').args.slice(-2), ['printenv', '-t']);
  for (const cmd of ['kubectl --context kubelab exec pod/example -it -- sh', 'docker run -dit example', 'kubectl run example --tty=true']) assert.throws(() => parseCommand(cmd), /Интерактивный/);
  assert.deepEqual(parseCommand(`kubectl patch configmap lab -p '{"data":{"message":"hello world"}}'`), { executable: 'kubectl', args: ['patch', 'configmap', 'lab', '-p', '{"data":{"message":"hello world"}}'] });
  assert.deepEqual(parseCommand('docker build -f "C:\\my lab\\Dockerfile" .').args, ['build', '-f', 'C:\\my lab\\Dockerfile', '.']);
  for (const cmd of ['powershell whoami', 'docker ps; whoami', 'docker ps | more', 'kubectl "bad', 'kubectl exec -it pod -- sh']) assert.throws(() => parseCommand(cmd));
});

test('first 38 lessons can be practiced in simulation, including config, rollout and recovery', () => {
  const state = createSimulation();
  for (const lesson of lessons.filter(item => !item.requiresReal)) {
    assert.ok(typeof lesson.goal === 'string' && lesson.goal.trim(), lesson.title);
    for (const step of lesson.steps) {
      const command = step.command;
      const actual = command.includes(' edit ') ? lesson.alternative : command;
      assert.doesNotThrow(() => parseCommand(actual), actual);
      if (actual.includes(' -- node -e ')) assert.doesNotThrow(() => new Function(parseCommand(actual).args.at(-1)), actual);
      const result = simulate(actual, state);
      assert.equal(result.code, step.exitCode || 0, `${actual}: ${result.text}`);
    }
  }
  assert.equal(state.loaded, true);
  assert.equal(state.replicas, 3);
  assert.equal(state.version, '1.0');
  assert.equal(state.broken, false);
  assert.equal(state.appliedMessage, 'Hello from ConfigMap');
});

test('simulator failures and hints distinguish cluster, image and syntax errors', () => {
  const state = createSimulation();
  assert.equal(simulate('kubectl --context kubelab get nodes', state).code, 1);
  assert.match(suggest('minicube start').title, /Опечатка/);
  assert.equal(suggest('minicube start', 'Ошибка: minicube — незнакомая команда.').command, 'minikube start');
  assert.match(suggest('', 'ErrImageNeverPull').command, /describe deployment/);
  assert.match(suggest('', 'CrashLoopBackOff').title, /перезапускается/);
  assert.equal(simulate('docker made-up-command', state).code, 1);
  assert.equal(simulate('minicube start', state).code, 1);
});

test('lab HTTP app exposes runtime, probes and only explicitly served assets', async () => {
  const process = spawn(globalThis.process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...globalThis.process.env, PORT: '0', HOST: '127.0.0.1', POD_NAME: 'test-pod', POD_NAMESPACE: 'test-lab', APP_VERSION: '2.0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
      process.on('error', error => { clearTimeout(timer); reject(error); });
      process.stdout.on('data', chunk => { const match = String(chunk).match(/http:\/\/127.0.0.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    });
    for (const route of ['/', '/styles.css', '/app.js', '/lessons.js', '/course-details.js', '/extra-lessons.js', '/lab-manifests.js', '/advanced-lessons.js', '/advanced-manifests.js', '/advanced-simulation.js', '/course-view.js', '/coach.js', '/lesson-view.js', '/help-view.js', '/healthz', '/readyz']) assert.equal((await fetch(base + route)).status, 200, route);
    const first = await (await fetch(base + '/api/runtime')).json();
    const second = await (await fetch(base + '/api/runtime')).json();
    assert.equal(first.pod, 'test-pod'); assert.equal(first.namespace, 'test-lab'); assert.equal(first.version, '2.0');
    assert.equal(second.requests, first.requests + 1);
    const trace = '0123456789abcdef0123456789abcdef';
    const traced = await fetch(base + '/api/runtime?private=do-not-log', { headers: { 'x-request-id': 'learning-example', traceparent: `00-${trace}-0123456789abcdef-01`, Authorization: 'Bearer do-not-log' } });
    assert.equal(traced.headers.get('x-request-id'), 'learning-example');
    const runtime = await traced.json(); assert.equal(runtime.traceId, trace); assert.equal(runtime.requestId, 'learning-example');
    const invalid = await (await fetch(base + '/api/runtime', { headers: { 'x-request-id': 'not a valid id', traceparent: 'invalid' } })).json();
    assert.equal(invalid.traceId, null); assert.notEqual(invalid.requestId, 'not a valid id');
    const metrics = await (await fetch(base + '/metrics')).text();
    assert.match(metrics, /kubelab_http_requests_total\{route="\/api\/runtime"\} 4/);
    assert.ok(!metrics.includes('private') && !metrics.includes('learning-example') && !metrics.includes('do-not-log'));
    assert.equal((await fetch(base + '/server.mjs')).status, 404);
    assert.equal((await fetch(base + '/api/runtime', { method: 'POST' })).status, 405);
  } finally { process.kill(); }
});

test('every lesson command has an explanation, argument breakdown and expected result', () => {
  assert.equal(lessons.length, 75);
  for (const lesson of lessons.filter(item => !item.requiresReal)) {
    assert.ok(lesson.introduction.length >= 2);
    assert.ok(lesson.answerExplanation);
    for (const step of lesson.steps) {
      assert.match(step.command, /^(minikube|kubectl|helm) /);
      assert.ok(step.why.trim(), step.command);
      assert.ok(step.parts.length > 0 && step.parts.every(([part, explanation]) => part && explanation));
      assert.ok(step.expected.trim(), step.command);
    }
    const html = renderLesson(lesson, 0, lessons.length, false);
    assert.ok(html.includes('Ожидаемый результат'));
    assert.ok(html.includes('Вставить команду'));
  }
});

test('advanced examples match shipped files; course filtering retains stable lesson numbers', async () => {
  for (const [name, value] of Object.entries(advancedManifests)) assert.equal(value.text, await readFile(new URL(`../k8s/advanced/${name}.yaml`, import.meta.url), 'utf8'));
  for (const [name, value] of Object.entries(advancedAssets)) assert.equal(value, await readFile(new URL('../' + name, import.meta.url), 'utf8'));
  const selected = renderCourse(lessons, [], 'StatefulSet');
  assert.ok(selected.includes('#lesson/18'));
  assert.ok(!selected.includes('#lesson/0"'));
  const full = renderCourse(lessons, [0]);
  assert.equal((full.match(/class="lesson-tile"/g) || []).length, 75);
  assert.equal(new Set(lessons.slice(11).map(x => x.id)).size, 64);
});

test('advanced simulation checks preparation, network denial, secret rotation and cleanup', () => {
  const state = createSimulation();
  for (const lesson of lessons.slice(0, 11)) for (const step of lesson.steps) simulate(step.command, state);
  const lesson = id => lessons.find(x => x.id === id);
  assert.equal(simulate(lesson('dns').steps[1].command, state).code, 1);
  assert.equal(simulate(lesson('operators').steps[5].command, state).code, 1);
  assert.equal(simulate(lesson('metrics').steps[5].command, state).code, 1);
  for (const current of lessons.slice(11, 38)) {
    for (const step of current.steps) {
      const result = simulate(step.command, state);
      assert.equal(result.code, step.exitCode || 0, `${current.id}: ${step.command}\n${result.text}`);
      if (current.id === 'secret-rotation' && step.title === 'Проверьте старый процесс') assert.equal(result.text, 'false');
      if (current.id === 'secret-rotation' && step.title === 'Подтвердите получение новой версии') assert.equal(result.text, 'true');
    }
  }
  assert.deepEqual(state.advanced.objects, {});
  assert.equal(state.advanced.helmReplicas, 0);
  assert.equal(state.advanced.observations, false);
  assert.equal(state.advanced.profiles['kubelab-policy'], undefined);
  assert.equal(state.cluster, true);
});

test('displayed manifests and Dockerfile are the complete shipped source examples', async () => {
  for (const [name, value] of Object.entries(manifests)) {
    const actual = await readFile(new URL(`../k8s/${name}.yaml`, import.meta.url), 'utf8');
    assert.equal(value, actual, name);
  }
  assert.equal(lessons[1].manifest, manifests.lab);
  assert.equal(lessons[1].imageGuide.dockerfile.trim(), (await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')).trim());
});

test('new practice distinguishes readiness failure, retained data and denied authorization', () => {
  const state = createSimulation();
  for (const lesson of lessons.slice(0, 7)) for (const step of lesson.steps) simulate(step.command, state);
  const k = 'kubectl --context kubelab -n kubelab';
  assert.equal(simulate('minikube image ls -p kubelab', state).text.includes('kubelab:1.0'), true);
  simulate(lessons[7].steps[1].command, state);
  assert.match(simulate(`${k} get pods`, state).text, /0\/1\s+Running/);
  assert.match(simulate(`${k} get events --sort-by=.metadata.creationTimestamp`, state).text, /Readiness probe failed/);
  assert.equal(simulate(`${k} rollout status deployment/kubelab --timeout=120s`, state).code, 1);
  simulate(lessons[7].steps[4].command, state);
  assert.equal(state.readinessBroken, false);
  const storage = lessons[9].steps;
  assert.equal(simulate(storage[7].command, state).code, 1);
  simulate(storage[1].command, state);
  assert.equal(simulate(storage[7].command, state).code, 1);
  simulate(storage[4].command, state);
  simulate(storage[5].command, state);
  assert.equal(simulate(storage[7].command, state).text, 'Hello from a persistent volume');
  simulate(storage[8].command, state);
  simulate(storage[1].command, state);
  assert.equal(simulate(storage[7].command, state).code, 1);
  for (const step of lessons[10].steps) assert.equal(simulate(step.command, state).code, step.exitCode || 0);
});
