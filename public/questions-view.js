export function setupQuestions(desktop, getLesson) {
  const dialog = document.createElement('dialog');
  dialog.className = 'questions-dialog';
  dialog.setAttribute('aria-labelledby', 'questions-title');
  dialog.innerHTML = `<div class="questions-heading"><h2 id="questions-title">Вопрос по уроку</h2><button type="button" id="questions-close">Закрыть</button></div>
    <p id="questions-lesson"></p>
    <p>Задайте вопрос о Kubernetes или команде из урока. Ответ может содержать ошибку — сверяйте команды с уроком.</p>
    <p class="question-notice" id="questions-privacy">История консоли и файлы не прикладываются. Не вводите пароли, токены и kubeconfig. Каждый вопрос отправляется отдельно, без предыдущих ответов.</p>
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
    <form id="questions-form"><label for="questions-input">Ваш вопрос</label><textarea id="questions-input" rows="3" maxlength="2000" required placeholder="Чем Pod отличается от Deployment?"></textarea><div class="question-actions"><button type="submit" id="questions-send" class="primary">Отправить вопрос</button><button type="button" id="questions-stop" hidden>Остановить</button><button type="button" id="questions-clear">Очистить</button></div></form>
    <p id="questions-result-state" role="status"></p><pre id="questions-answer"></pre><p id="questions-model"></p>`;
  document.body.append(dialog);
  const $ = id => dialog.querySelector('#questions-' + id);
  let lesson = 0, pending = false, configured = false, dirty = false;
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
  }
  function busy(value) {
    pending = value;
    $('send').disabled = value || !configured || dirty;
    $('stop').hidden = !value;
    $('clear').disabled = value;
    $('input').disabled = value;
    $('key-form').querySelectorAll('button, input, select').forEach(node => { node.disabled = value; });
    $('forget').disabled = value;
  }
  function close() { desktop?.cancelQuestion(); dialog.close(); }
  $('close').onclick = close;
  dialog.addEventListener('cancel', () => desktop?.cancelQuestion());
  $('stop').onclick = () => desktop?.cancelQuestion();
  $('clear').onclick = () => { $('input').value = ''; $('answer').textContent = ''; $('model').textContent = ''; $('result-state').textContent = ''; };
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
  $('form').onsubmit = async event => {
    event.preventDefault();
    if (!desktop || pending || !configured || dirty) return;
    busy(true); $('answer').textContent = ''; $('model').textContent = '';
    $('result-state').textContent = 'Ожидаем ответ…';
    try {
      const result = await desktop.askQuestion({ lesson, question: $('input').value });
      $('answer').textContent = result.answer;
      $('model').textContent = 'Ответ модели: ' + result.model;
      $('result-state').textContent = result.truncated ? 'Ответ достиг предела длины. Уточните вопрос.' : 'Ответ получен.';
    } catch (error) { $('result-state').textContent = error.message; }
    finally { busy(false); }
  };
  return async function open() {
    const current = getLesson();
    if (pending) { dialog.showModal(); return; }
    if (lesson !== current.index) { $('input').value = ''; $('answer').textContent = ''; $('model').textContent = ''; $('result-state').textContent = ''; }
    lesson = current.index;
    $('lesson').textContent = `Урок ${lesson + 1}: ${current.title}`;
    dialog.showModal();
    if (!desktop) {
      $('state').textContent = 'Ответы через API доступны в Windows-приложении. Браузерный тренажёр работает без подключения помощника.';
      $('form').hidden = true; $('settings').hidden = true; return;
    }
    busy(true);
    try { renderState(await desktop.questionState()); }
    catch (error) { $('state').textContent = error.message; }
    finally { busy(false); }
  };
}
