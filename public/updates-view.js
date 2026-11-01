const locked = status => ['downloading', 'installing'].includes(status);
const megabytes = bytes => (Math.max(0, bytes || 0) / 1048576).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
export function progressText(state) {
  if (state.status === 'installing') return 'Далее — окно установщика с ходом установки.';
  if (state.status === 'ready') return 'Файлы проверены. Можно установить обновление.';
  if (state.status !== 'downloading') return '';
  if (!Number.isFinite(state.percent)) return 'Подготовка загрузки. Процент появится, когда начнётся передача данных.';
  const percent = Math.max(0, Math.min(100, state.percent)).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  const volume = state.total > 0 ? ` · ${megabytes(state.transferred)} из ${megabytes(state.total)} МБ` : '';
  const speed = state.bytesPerSecond > 0 && state.percent < 100 ? ` · ${megabytes(state.bytesPerSecond)} МБ/с` : '';
  return `${percent}%${volume}${speed}${state.percent >= 100 ? ' · проверка и подготовка файлов' : ''}`;
}
export function setupUpdates(desktop, mount = document.querySelector('.topbar>div')) {
  if (!desktop) return;
  const button = document.createElement('button'); button.className = 'setup-button'; button.textContent = 'Обновления';
  const dialog = document.createElement('dialog'); dialog.className = 'updates-dialog'; dialog.setAttribute('aria-labelledby', 'update-title');
  dialog.innerHTML = '<h2 id="update-title">Обновления KubeLab</h2><p id="update-version"></p><p id="update-message" role="status"></p><progress id="update-progress" max="100" aria-label="Ход загрузки обновления" hidden></progress><p id="update-details" aria-live="polite"></p><p class="update-note">После скачивания файлы проверяются. Затем откроется установщик с ходом установки. Прогресс уроков сохранится. Повторно устанавливать остальные программы не нужно.</p><div class="update-actions"><button id="update-check">Проверить обновления</button><button id="update-download" hidden>Скачать</button><button id="update-install" hidden>Установить и перезапустить</button><button id="update-close">Закрыть</button></div>';
  document.body.append(dialog); mount.prepend(button);
  const $ = id => dialog.querySelector('#update-' + id);
  let state = { status: 'idle' };
  function render(next) {
    state = next;
    $('version').textContent = `Установлена ${state.currentVersion}${state.version ? ' · новая ' + state.version : ''}`;
    $('message').textContent = state.message;
    $('details').textContent = progressText(state);
    $('progress').hidden = !['downloading', 'ready', 'installing'].includes(state.status);
    if (Number.isFinite(state.percent)) $('progress').value = state.percent;
    else $('progress').removeAttribute('value');
    $('check').disabled = ['checking', 'downloading', 'ready', 'installing', 'disabled'].includes(state.status);
    $('download').hidden = state.status !== 'available'; $('install').hidden = state.status !== 'ready';
    $('close').disabled = locked(state.status);
    button.textContent = state.status === 'downloading' ? (Number.isFinite(state.percent) ? `Обновление: ${Math.round(state.percent)}%` : 'Подготовка обновления…') : state.status === 'installing' ? 'Установка обновления…' : ['available', 'ready'].includes(state.status) ? 'Обновление доступно ●' : 'Обновления';
    if (locked(state.status) && !dialog.open) dialog.showModal();
  }
  async function action(fn) {
    try { render(await fn()); }
    catch (error) { render({ ...state, status: 'error', message: error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') }); }
  }
  button.onclick = () => { if (!dialog.open) dialog.showModal(); action(desktop.updateState); };
  $('close').onclick = () => { if (!locked(state.status)) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (locked(state.status)) event.preventDefault(); });
  $('check').onclick = () => action(desktop.checkUpdates);
  $('download').onclick = () => action(desktop.downloadUpdate);
  $('install').onclick = () => action(desktop.installUpdate);
  desktop.onUpdate(render); action(desktop.updateState);
}
