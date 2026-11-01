import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createSimulation, simulate, suggest } from '../public/coach.js';
import { lessons } from '../public/lessons.js';
import { renderLesson } from '../public/lesson-view.js';
const { parseCommand } = createRequire(import.meta.url)('../desktop/command.cjs');

test('CLI argument boundaries preserve JSON and paths without executing a shell', () => {
  assert.deepEqual(parseCommand(`kubectl patch configmap lab -p '{"data":{"message":"hello world"}}'`), { executable: 'kubectl', args: ['patch', 'configmap', 'lab', '-p', '{"data":{"message":"hello world"}}'] });
  assert.deepEqual(parseCommand('docker build -f "C:\\my lab\\Dockerfile" .').args, ['build', '-f', 'C:\\my lab\\Dockerfile', '.']);
  for (const cmd of ['powershell whoami', 'docker ps; whoami', 'docker ps | more', 'kubectl "bad', 'kubectl exec -it pod -- sh']) assert.throws(() => parseCommand(cmd));
});

test('entire course can be practiced in simulation, including config, rollout and recovery', () => {
  const state = createSimulation();
  for (const lesson of lessons) {
    for (const command of lesson.commands) {
      const actual = command.includes(' edit ') ? lesson.alternative : command;
      const result = simulate(actual, state);
      assert.equal(result.code, 0, `${actual}: ${result.text}`);
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
    for (const route of ['/', '/styles.css', '/app.js', '/lessons.js', '/coach.js', '/lesson-view.js', '/help-view.js', '/healthz', '/readyz']) assert.equal((await fetch(base + route)).status, 200, route);
    const first = await (await fetch(base + '/api/runtime')).json();
    const second = await (await fetch(base + '/api/runtime')).json();
    assert.equal(first.pod, 'test-pod'); assert.equal(first.namespace, 'test-lab'); assert.equal(first.version, '2.0');
    assert.equal(second.requests, first.requests + 1);
    assert.equal((await fetch(base + '/server.mjs')).status, 404);
    assert.equal((await fetch(base + '/api/runtime', { method: 'POST' })).status, 405);
  } finally { process.kill(); }
});

test('every lesson command has an explanation, argument breakdown and expected result', () => {
  assert.equal(lessons.length, 7);
  for (const lesson of lessons) {
    assert.ok(lesson.introduction.length >= 2);
    assert.ok(lesson.answerExplanation);
    for (const step of lesson.steps) {
      assert.match(step.command, /^(minikube|kubectl) /);
      assert.ok(step.why.trim(), step.command);
      assert.ok(step.parts.length > 0 && step.parts.every(([part, explanation]) => part && explanation));
      assert.ok(step.expected.trim(), step.command);
    }
    const html = renderLesson(lesson, 0, lessons.length, false);
    assert.ok(html.includes('Что должно получиться'));
    assert.ok(html.includes('Вставить команду'));
  }
});
