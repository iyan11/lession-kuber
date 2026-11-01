import { completedHistory, createChatRooms, MAX_CHAT_TURNS } from './chat-history.js';

export function setupQuestions(desktop, getLesson) {
  const dialog = document.createElement('dialog');
  dialog.className = 'questions-dialog';
  dialog.setAttribute('aria-labelledby', 'questions-title');
  dialog.innerHTML = `<div class="questions-heading"><h2 id="questions-title">Чат по уроку</h2><div><button type="button" id="questions-clear">Новый чат</button><button type="button" id="questions-close">Закрыть</button></div></div>
    <p id="questions-lesson"></p>
    <p class="question-notice" id="questions-privacy">Для ответа передаются текст урока и последние сообщения этого чата. Консоль и файлы не прикладываются. Не вводите секреты. Переписка хранится до закрытия приложения.</p>
    <details id="questions-settings"><summary>Подключение помощника</summary>
      <form id="questions-key-form"><label for="questions-provider">Где получать ответы</label><select id="questions-provider"><option value="gigachat">GigaChat — российский API</option><option value="openrouter">OpenRouter — бесплатные модели</option><option value="ollama">Ollama — на этом компьютере, без API-ключа</option></select>
      <div id="questions-router-settings" hidden><p>Создайте личный <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">API-ключ OpenRouter ↗</a>. Используется только бесплатный маршрут openrouter/free с нулевой допустимой ценой, без перехода на платные модели. Доступность зависит от лимитов, региона и <a href="https://openrouter.ai/settings/privacy" target="_blank" rel="noreferrer">правил обработки данных ↗</a>.</p><label for="questions-router-key">API-ключ OpenRouter</label><input id="questions-router-key" type="password" autocomplete="off" spellcheck="false" maxlength="1024" placeholder="sk-or-…; оставьте пустым для сохранённого ключа"><p>Если ключ от alpha.4 не был удалён, выберите OpenRouter, оставьте поле пустым и сохраните подключение. Ключи разных сервисов хранятся отдельно и сохраняются при переключении.</p></div>
      <div id="questions-giga-settings"><p>Создайте проект для физлица по <a href="https://developers.sber.ru/docs/ru/gigachat/individuals-quickstart" target="_blank" rel="noreferrer">инструкции GigaChat ↗</a> и скопируйте Authorization key. Это не Client Secret и не ключ OpenRouter.</p>
      <p>Условия бесплатного режима зависят от аккаунта. Проверьте <a href="https://developers.sber.ru/docs/ru/gigachat/tariffs/individual-tariffs" target="_blank" rel="noreferrer">тариф и остаток токенов ↗</a> перед подключением. Приложение использует модель Lite (GigaChat), не покупает пакеты и не меняет ваш тариф. Запросы могут расходовать купленные токены, если они есть на аккаунте.</p>
      <label for="questions-key">Authorization key</label><input id="questions-key" type="password" autocomplete="off" spellcheck="false" maxlength="1024" placeholder="Вставьте ключ; оставьте пустым, чтобы сохранить прежний">
      <label class="question-consent"><input id="questions-usage" type="checkbox"> Разрешаю расходовать токены моего аккаунта GigaChat</label>
      <p>Ключ хранится с защитой Windows. <a href="https://developers.sber.ru/docs/ru/gigachat/certificates" target="_blank" rel="noreferrer">О сертификатах GigaChat ↗</a>. Необходимый корневой сертификат уже включён в приложение и используется только при соединении с GigaChat.</p></div>
      <div id="questions-local-settings" hidden><p>Установите <a href="https://ollama.com/download/windows" target="_blank" rel="noreferrer">Ollama для Windows ↗</a>, запустите её и один раз скачайте модель в обычном PowerShell. В консоли урока эта команда недоступна.</p><label for="questions-local-model">Локальная модель</label><select id="questions-local-model"><option value="qwen3:4b">Qwen 3 · 4B</option><option value="qwen3:1.7b">Qwen 3 · 1.7B — меньше памяти</option><option value="qwen2.5:3b">Qwen 2.5 · 3B</option></select><pre id="questions-pull">ollama pull qwen3:4b</pre><p>После скачивания интернет для ответов не нужен. Модель использует память и процессор компьютера, поэтому может отвечать медленно, особенно при запущенном Minikube. При нехватке памяти выберите модель 1.7B. Облачные модели Ollama здесь не подключаются.</p></div>
      <div class="question-actions"><button type="submit">Сохранить подключение</button><button type="button" id="questions-forget">Удалить все подключения и ключи</button></div></form>
    </details>
    <p id="questions-state" role="status"></p>
    <div id="questions-messages" class="questions-messages" role="log" aria-label="Переписка по уроку" aria-live="polite" aria-relevant="additions text" tabindex="0"></div>
    <p id="questions-result-state" role="status"></p>
    <form id="questions-form"><label for="questions-input">Сообщение</label><textarea id="questions-input" rows="2" maxlength="2000" required placeholder="Спросите о команде или уточните предыдущий ответ…"></textarea><div class="question-actions"><span>Enter — отправить · Shift+Enter — новая строка</span><button type="button" id="questions-stop" hidden>Остановить</button><button type="submit" id="questions-send" class="primary">Отправить</button></div></form>
    <p class="chat-footnote">Модель учитывает до 6 последних вопросов с ответами; длинная история сокращается. Ответ может содержать ошибку — сверяйте команды с уроком.</p>`;
  document.body.append(dialog);
  const $ = id => dialog.querySelector('#questions-' + id);
  let lesson = 0, pending = false, configured = false, dirty = false;
  const rooms = createChatRooms();
  let room = rooms.get(lesson, 'gigachat', 'GigaChat');
  function rememberDraft() { room.draft = $('input').value; }
  function messageContent(container, text) {
    // Fenced code is formatted with DOM nodes. Model HTML is always plain text.
    const pieces = String(text).split(/```[^\n`]*\n([\s\S]*?)```/g);
    pieces.forEach((piece, index) => {
      const node = document.createElement(index % 2 ? 'pre' : 'div');
      node.className = index % 2 ? 'chat-code' : 'chat-prose';
      if (index % 2) node.textContent = piece;
      else {
        for (const part of piece.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)) {
          if (part.startsWith('`') && part.endsWith('`') && part.length > 2) { const code = document.createElement('code'); code.textContent = part.slice(1, -1); node.append(code); }
          else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) { const strong = document.createElement('strong'); strong.textContent = part.slice(2, -2); node.append(strong); }
          else node.append(document.createTextNode(part));
        }
      }
      container.append(node);
    });
  }
  function drawChat() {
    const log = $('messages'); log.replaceChildren();
    if (!room.turns.length) {
      const empty = document.createElement('div'); empty.className = 'chat-empty';
      empty.textContent = 'Спросите о шаге урока, команде или результате. Затем можно уточнить: «А почему?» или «Покажи пример».';
      log.append(empty);
    }
    if (room.removed) { const note = document.createElement('p'); note.className = 'chat-footnote'; note.textContent = 'Показаны последние 20 вопросов.'; log.append(note); }
    const bubble = (role, text, label) => {
      const item = document.createElement('article'); item.className = 'chat-message chat-' + role;
      const author = document.createElement('strong'); author.className = 'chat-author'; author.textContent = label;
      item.append(author); messageContent(item, text); log.append(item); return item;
    };
    room.turns.forEach((turn, index) => {
      bubble('user', turn.question, 'Вы');
      if (turn.status === 'complete') {
        const item = bubble('assistant', turn.answer, 'Помощник');
        const model = document.createElement('small'); model.className = 'chat-model'; model.textContent = turn.model || '';
        if (turn.truncated) model.textContent += ' · Ответ достиг предела длины. Можно попросить продолжить.';
        item.append(model);
      } else if (turn.status === 'pending') bubble('waiting', 'Помощник отвечает…', 'Ответ');
      else {
        const item = bubble('error', turn.error, 'Ответ не получен');
        if (index === room.turns.length - 1) {
          const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Повторить';
          retry.disabled = pending || !configured || dirty; retry.onclick = () => send(turn.question, turn); item.append(retry);
        }
      }
    });
    log.scrollTop = log.scrollHeight;
  }
  const basePrivacy = $('privacy').textContent;
  function providerFields() {
    const local = $('provider').value === 'ollama';
    $('giga-settings').hidden = $('provider').value !== 'gigachat'; $('local-settings').hidden = !local;
    $('router-settings').hidden = $('provider').value !== 'openrouter';
    $('key').value = ''; $('router-key').value = ''; $('usage').checked = false;
  }
  function changed() { dirty = true; $('send').disabled = true; $('state').textContent = 'Сохраните выбранное подключение перед отправкой вопроса.'; $('privacy').textContent = basePrivacy + ' Отправка отключена до сохранения настроек.'; }
  $('provider').onchange = () => { providerFields(); changed(); };
  $('local-model').onchange = () => { $('pull').textContent = 'ollama pull ' + $('local-model').value; changed(); };
  $('key').oninput = changed;
  $('router-key').oninput = changed;
  $('usage').onchange = changed;
  function renderState(state) {
    dirty = false;
    configured = Boolean(state.configured);
    rememberDraft();
    room = rooms.get(lesson, state.provider || 'gigachat', state.model || 'GigaChat');
    $('input').value = room.draft;
    $('provider').value = state.provider || 'gigachat';
    if (state.provider === 'ollama') $('local-model').value = state.model;
    providerFields();
    $('usage').checked = configured && state.provider === 'gigachat';
    $('pull').textContent = 'ollama pull ' + $('local-model').value;
    const service = state.provider === 'openrouter' ? 'OpenRouter' : 'GigaChat';
    $('state').textContent = configured ? `Подключено: ${state.provider === 'ollama' ? 'Ollama · ' + state.model : service}. Можно задать вопрос.` : 'Выберите подключение и сохраните настройки. Ключи используются только для своего сервиса.';
    $('privacy').textContent = (configured ? (state.provider === 'ollama' ? 'Вопрос и текст урока отправляются только локальной Ollama на этом компьютере. ' : `Вопрос и текст урока будут отправлены в ${service}${state.provider === 'openrouter' ? ' и выбранному поставщику модели' : ''}. `) : '') + basePrivacy;
    $('send').disabled = !configured || pending;
    $('forget').disabled = !configured || pending;
    if (!configured) $('settings').open = true;
    drawChat();
  }
  function busy(value) {
    pending = value;
    $('send').disabled = value || !configured || dirty;
    $('stop').hidden = !value;
    $('clear').disabled = value;
    $('key-form').querySelectorAll('button, input, select').forEach(node => { node.disabled = value; });
    $('forget').disabled = value;
  }
  function close() { rememberDraft(); desktop?.cancelQuestion(); dialog.close(); }
  $('close').onclick = close;
  dialog.addEventListener('cancel', () => { rememberDraft(); desktop?.cancelQuestion(); });
  $('stop').onclick = () => desktop?.cancelQuestion();
  $('clear').onclick = () => { if (pending) return; room.turns = []; room.draft = ''; room.removed = 0; $('input').value = ''; $('result-state').textContent = ''; drawChat(); $('input').focus(); };
  $('input').oninput = rememberDraft;
  $('input').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!pending && configured && !dirty) $('form').requestSubmit(); }
  });
  $('key-form').onsubmit = async event => {
    event.preventDefault();
    if (!desktop || pending) return;
    const input = { provider: $('provider').value, model: $('local-model').value, key: $('provider').value === 'openrouter' ? $('router-key').value : $('key').value, allowUsage: $('usage').checked };
    $('key').value = ''; $('router-key').value = ''; busy(true);
    try { renderState(await desktop.saveQuestionKey(input)); $('settings').open = false; }
    catch (error) { $('state').textContent = error.message; }
    finally { busy(false); }
  };
  $('forget').onclick = async () => {
    if (!desktop || pending) return;
    busy(true);
    try { renderState(await desktop.forgetQuestionKey()); }
    catch (error) { $('state').textContent = error.message; }
    finally { busy(false); }
  };
  async function send(question, retryTurn) {
    if (!desktop || pending || !configured || dirty || !question.trim()) return;
    const targetRoom = room, targetLesson = lesson;
    const history = completedHistory(targetRoom.turns);
    const turn = retryTurn || { question: question.trim() };
    turn.status = 'pending'; turn.error = '';
    if (!retryTurn) {
      targetRoom.turns.push(turn);
      if (targetRoom.turns.length > MAX_CHAT_TURNS) { targetRoom.turns.shift(); targetRoom.removed++; }
      targetRoom.draft = ''; $('input').value = '';
    }
    busy(true); drawChat(); $('result-state').textContent = '';
    try {
      const result = await desktop.askQuestion({ lesson: targetLesson, question: turn.question, history });
      Object.assign(turn, { status: 'complete', answer: result.answer, model: result.model, truncated: result.truncated });
    } catch (error) { turn.status = 'error'; turn.error = error.message; }
    finally { busy(false); drawChat(); if (dialog.open) $('input').focus(); }
  }
  $('form').onsubmit = event => { event.preventDefault(); send($('input').value); };
  return async function open() {
    const current = getLesson();
    if (pending) { dialog.showModal(); return; }
    rememberDraft();
    lesson = current.index;
    $('result-state').textContent = '';
    $('lesson').textContent = `Урок ${lesson + 1}: ${current.title}`;
    dialog.showModal();
    if (!desktop) {
      $('state').textContent = 'Ответы через API доступны в Windows-приложении. Браузерный тренажёр работает без подключения помощника.';
      $('form').hidden = true; $('settings').hidden = true; $('clear').hidden = true; drawChat(); return;
    }
    busy(true);
    try { renderState(await desktop.questionState()); }
    catch (error) { $('state').textContent = error.message; }
    finally { busy(false); }
  };
}
