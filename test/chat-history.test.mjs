import test from 'node:test';
import assert from 'node:assert/strict';
import { completedHistory, createChatRooms, historyForRequest, MAX_CONTEXT_CHARACTERS } from '../public/chat-history.js';

test('chat context keeps recent complete pairs within a bounded budget', () => {
  const history = Array.from({ length: 8 }, (_, index) => [{ role: 'user', content: 'Вопрос ' + index }, { role: 'assistant', content: 'Ответ ' + index }]).flat();
  const recent = historyForRequest(history);
  assert.equal(recent.length, 12); assert.equal(recent[0].content, 'Вопрос 2');
  const longPair = [{ role: 'user', content: 'q'.repeat(2000) }, { role: 'assistant', content: 'a'.repeat(16000) }];
  const bounded = historyForRequest([...longPair, ...longPair]);
  assert.equal(bounded.length, 2);
  assert.ok(bounded.reduce((size, message) => size + message.content.length, 0) <= MAX_CONTEXT_CHARACTERS);
  for (const invalid of [[{ role: 'user', content: 'unfinished' }], [{ role: 'tool', content: 'tool' }, longPair[1]], [{ role: 'user', content: 'q'.repeat(2001) }, longPair[1]], Array(21).fill(longPair).flat()]) assert.throws(() => historyForRequest(invalid));
});

test('lesson, provider and local model have separate chats; failed replies never enter context', () => {
  const rooms = createChatRooms();
  const first = rooms.get(0, 'ollama', 'qwen3:4b');
  first.draft = 'Мой черновик';
  first.turns.push({ question: 'Вопрос', answer: 'Ответ', status: 'complete' }, { question: 'Неудачный вопрос', status: 'error', error: 'Нет сети' });
  assert.equal(rooms.get(0, 'ollama', 'qwen3:4b'), first);
  for (const other of [rooms.get(1, 'ollama', 'qwen3:4b'), rooms.get(0, 'openrouter', 'openrouter/free'), rooms.get(0, 'ollama', 'qwen3:1.7b')]) {
    assert.equal(other.turns.length, 0); assert.equal(other.draft, '');
  }
  assert.deepEqual(completedHistory(first.turns), [{ role: 'user', content: 'Вопрос' }, { role: 'assistant', content: 'Ответ' }]);
  first.turns = [];
  assert.deepEqual(completedHistory(first.turns), []);
});
