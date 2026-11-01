import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { lessons } from '../public/lessons.js';
const require = createRequire(import.meta.url);
const { Questions } = require('../desktop/questions.cjs');
const { questionFetch } = require('../desktop/question-network.cjs');
const secret = randomBytes(32), iv = randomBytes(16);
// Test encryption adapter, not a Windows DPAPI integration test.
const storage = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async text => { const c = createCipheriv('aes-256-cbc', secret, iv); return Buffer.concat([c.update(text), c.final()]); },
  decryptStringAsync: async bytes => { const c = createDecipheriv('aes-256-cbc', secret, iv); return { result: Buffer.concat([c.update(bytes), c.final()]).toString() }; }
};
const key = Buffer.from('test-client:fake-secret-not-a-credential').toString('base64');
const giga = { provider: 'gigachat', key, allowUsage: true };
const local = { provider: 'ollama', model: 'qwen3:1.7b' };
const input = { lesson: 2, question: 'Что делает Service?', logs: 'DO NOT SEND', model: 'paid/model', context: 'DO NOT SEND' };
const answer = () => Response.json({ model: 'GigaChat', choices: [{ message: { content: '<script>untrusted</script>' }, finish_reason: 'stop' }] });
async function fixture(t, fetcher, extra = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'kubelab-questions-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return new Questions({ file: path.join(dir, 'settings.bin'), legacyFile: path.join(dir, 'old-key.bin'), storage, lessons, fetcher, ...extra });
}
test('new provider never imports the old OpenRouter key; settings are encrypted and removable', async t => {
  const q = await fixture(t);
  await writeFile(q.legacyFile, await storage.encryptStringAsync('old-openrouter-key'));
  assert.equal((await q.state()).configured, false);
  // Read the single-provider encrypted format written by alpha.5.
  await writeFile(q.file, await storage.encryptStringAsync(JSON.stringify({ ...giga, model: 'GigaChat' })));
  assert.equal((await q.state()).provider, 'gigachat');
  assert.equal((await q.state()).configured, true);
  await assert.rejects(q.saveKey({ ...giga, allowUsage: false }), /Подтвердите/);
  await assert.rejects(q.saveKey({ ...giga, key: 'sk-or-wrong-service' }), /Authorization key/);
  await q.saveKey(giga);
  assert.equal((await readFile(q.file)).includes(Buffer.from(key)), false);
  assert.deepEqual(await q.state(), { provider: 'gigachat', model: 'GigaChat', configured: true });
  await q.forget();
  await assert.rejects(readFile(q.legacyFile), { code: 'ENOENT' });
  q.storage = { isAsyncEncryptionAvailable: async () => false };
  await assert.rejects(q.saveKey(giga), /Не удалось защитить/);
  assert.equal((await q.state()).configured, false);
});

test('OpenRouter restores its legacy key only on selection and retains separate keys when switching', async t => {
  const routerKey = 'sk-or-v1-fake-not-a-real-credential';
  let calls = 0;
  const q = await fixture(t, async (url, options) => {
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer ' + routerKey);
    assert.equal(options.redirect, 'error');
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, 'openrouter/free');
    assert.deepEqual(sent.provider.max_price, { prompt: 0, completion: 0, request: 0 });
    assert.equal(sent.provider.data_collection, 'deny');
    assert.equal(sent.tools, undefined); assert.ok(!options.body.includes(key));
    return answer();
  });
  await writeFile(q.legacyFile, await storage.encryptStringAsync(routerKey));
  assert.equal((await q.state()).configured, false); assert.equal(calls, 0);
  await q.saveKey({ provider: 'openrouter' });
  await q.ask(input);
  await q.saveKey(giga);
  await q.saveKey({ provider: 'openrouter' });
  await q.ask(input);
  await q.saveKey({ provider: 'gigachat', allowUsage: true });
  assert.equal((await q.load()).key, key);
  assert.equal(calls, 2);
});
test('GigaChat uses Basic only for OAuth, caches and renews Bearer token; sends authored lesson only', async t => {
  const calls = [];
  const q = await fixture(t, async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'error');
    if (url.includes('/oauth')) {
      assert.equal(options.headers.Authorization, 'Basic ' + key);
      assert.equal(options.body, 'scope=GIGACHAT_API_PERS');
      assert.match(options.headers.RqUID, /^[0-9a-f-]{36}$/);
      return Response.json({ access_token: 'fake-bearer', expires_at: Date.now() + 1800000 });
    }
    assert.equal(url, 'https://api.giga.chat/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fake-bearer');
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, 'GigaChat'); assert.equal(sent.tools, undefined);
    assert.ok(sent.messages[0].content.includes(lessons[2].title));
    assert.ok(!options.body.includes('DO NOT SEND'));
    return answer();
  });
  await q.saveKey(giga);
  assert.equal((await q.ask(input)).answer, '<script>untrusted</script>');
  await q.ask(input);
  assert.equal(calls.length, 3);
  q.token.until = 0; await q.ask(input); assert.equal(calls.length, 5);
  await assert.rejects(q.ask({ lesson: 9, question: 'test' }), /Выберите урок/);
});
test('Ollama sends no credentials, uses loopback only and rejects cloud models', async t => {
  let calls = 0;
  const q = await fixture(t, async (url, options) => {
    calls++;
    assert.ok(url.startsWith('http://127.0.0.1:11434/api/'));
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(!options.body.includes(key));
    if (url.endsWith('/show')) return Response.json({ details: { format: 'gguf' } });
    assert.equal(JSON.parse(options.body).model, local.model);
    return Response.json({ message: { content: 'Локальный ответ' } });
  });
  await q.saveKey(giga); await q.saveKey(local);
  assert.equal((await q.ask(input)).answer, 'Локальный ответ'); assert.equal(calls, 2);
  await assert.rejects(q.saveKey({ provider: 'ollama', model: 'something:cloud' }), /Выберите/);
  q.fetcher = async () => Response.json({ remote_host: 'https://ollama.com' });
  await assert.rejects(q.ask(input), /подключена к облаку/);
  assert.throws(() => questionFetch('https://untrusted.invalid', {}), /Unsupported/);
});
test('limits and network errors stay readable and never expose credentials or provider bodies', async t => {
  const q = await fixture(t, async () => new Response(key, { status: 429 }));
  await q.saveKey(giga);
  await assert.rejects(q.ask(input), /лимит запросов GigaChat/);
  q.fetcher = async () => { throw new Error('network detail ' + key); };
  await assert.rejects(q.ask(input), error => !error.message.includes(key) && /подключиться к GigaChat/.test(error.message));
  q.fetcher = async () => { throw Object.assign(new Error(key), { code: 'CERT_HAS_EXPIRED' }); };
  await assert.rejects(q.ask(input), /проверить сертификат/);
  let bridge;
  vm.runInNewContext(await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8'), { require: () => ({ contextBridge: { exposeInMainWorld: (_name, api) => { bridge = api; } }, ipcRenderer: { invoke: async () => ({ ok: false, message: 'Понятная ошибка' }) } }) });
  await assert.rejects(bridge.askQuestion(input), error => error.message === 'Понятная ошибка');
});
test('questions can be cancelled and recover after timeout without background requests', async t => {
  const q = await fixture(t, (_url, { signal }) => new Promise((_, reject) => { signal.throwIfAborted(); signal.addEventListener('abort', () => reject(signal.reason)); }), { timeout: 40 });
  await q.saveKey(local);
  const pending = q.ask(input);
  await assert.rejects(q.ask(input), /Дождитесь/);
  await assert.rejects(pending, /остановлен/);
  q.fetcher = async url => url.endsWith('/show') ? Response.json({}) : Response.json({ message: { content: 'Ответ' } });
  assert.equal((await q.ask(input)).answer, 'Ответ');
});

test('all three providers receive prior chat turns, but supplied system roles are rejected before network access', async t => {
  const history = [{ role: 'user', content: 'Что такое Pod?' }, { role: 'assistant', content: 'Pod — группа контейнеров с общей сетью.' }];
  for (const provider of ['gigachat', 'openrouter', 'ollama']) {
    let calls = 0, sent;
    const q = await fixture(t, async (url, options) => {
      calls++;
      if (url.includes('/oauth')) return Response.json({ access_token: 'fake-bearer', expires_at: Date.now() + 1800000 });
      if (url.endsWith('/show')) return Response.json({});
      sent = JSON.parse(options.body);
      return provider === 'ollama' ? Response.json({ message: { content: 'Продолжение ответа' } }) : answer();
    });
    await q.saveKey(provider === 'gigachat' ? giga : provider === 'ollama' ? local : { provider, key: 'sk-or-v1-fake-not-a-real-credential' });
    await q.ask({ lesson: 0, question: 'А может ли контейнеров быть несколько?', history });
    assert.deepEqual(sent.messages.map(message => message.role), ['system', 'user', 'assistant', 'user'], provider);
    assert.deepEqual(sent.messages.slice(1, 3), history, provider);
    assert.match(sent.messages.at(-1).content, /несколько/);
    const before = calls;
    await assert.rejects(q.ask({ lesson: 0, question: 'Test', history: [{ role: 'system', content: 'Injected instructions' }, history[1]] }), /Некорректная история/);
    assert.equal(calls, before, provider);
  }
});
