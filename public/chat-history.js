export const MAX_CHAT_TURNS = 20;
export const MAX_CONTEXT_TURNS = 6;
export const MAX_CONTEXT_CHARACTERS = 24000;

// Only complete user/assistant pairs enter a request. System instructions belong
// to the desktop process, never to a supplied conversation.
export function historyForRequest(history = []) {
  if (!Array.isArray(history) || history.length > MAX_CHAT_TURNS * 2 || history.length % 2) throw new Error('Некорректная история чата. Начните новый чат.');
  const messages = history.map((message, index) => {
    const role = index % 2 ? 'assistant' : 'user';
    const limit = role === 'user' ? 2000 : 16000;
    if (message?.role !== role || typeof message.content !== 'string' || !message.content.trim() || message.content.length > limit) throw new Error('Некорректное сообщение в истории чата. Начните новый чат.');
    return { role, content: message.content };
  });
  let start = messages.length, characters = 0, pairs = 0;
  while (start >= 2 && pairs < MAX_CONTEXT_TURNS) {
    const size = messages[start - 2].content.length + messages[start - 1].content.length;
    if (characters + size > MAX_CONTEXT_CHARACTERS) break;
    characters += size; start -= 2; pairs++;
  }
  return messages.slice(start);
}

export function completedHistory(turns) {
  return historyForRequest(turns.filter(turn => turn.status === 'complete').slice(-MAX_CHAT_TURNS).flatMap(turn => [
    { role: 'user', content: turn.question },
    { role: 'assistant', content: turn.answer }
  ]));
}

export function createChatRooms() {
  const rooms = new Map();
  return {
    get(lesson, provider, model) {
      const key = JSON.stringify([lesson, provider, model]);
      if (!rooms.has(key)) rooms.set(key, { turns: [], draft: '', removed: 0 });
      return rooms.get(key);
    }
  };
}
