import { lessons, prefix } from './lessons.js';
import { suggest, simulate, createSimulation } from './coach.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const desktop = window.kubeDesktop;
let progress = [], selected = 0, mode = 'sim', busy = false, current = '', history = [], historyIndex = 0, sim = createSimulation(), outputBuffer = '', workspace = 'Папка проекта KubeLab';
let log = [{ type: 'welcome', text: 'KubeLab Terminal\nТвой первый кластер начинается с одной команды.\n\nТренажёр включён: команды не меняют систему. Введи help или выбери команду справа.' }];
let hint = suggest('');
try { const saved = JSON.parse(localStorage.getItem('kubelab-progress-v2') || '[]'); if (Array.isArray(saved)) progress = saved.filter(x => Number.isInteger(x) && x >= 0 && x < lessons.length); } catch {}
function notify(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 3000); }
function save() { try { localStorage.setItem('kubelab-progress-v2', JSON.stringify([...new Set(progress)])); } catch { notify('Хранилище прогресса недоступно. В этой сессии прогресс сохранится.'); } }
function updateProgress() { $('#side-count').textContent = `${new Set(progress).size} / ${lessons.length}`; $('#side-bar').style.width = `${new Set(progress).size / lessons.length * 100}%`; }
function insert(command) { if (!$('#command')) { location.hash = '#home'; setTimeout(() => insert(command), 0); return; } $('#command').value = command; $('#command').focus(); updateSyntax(); }
function syntax(command) {
  if (!command.trim()) return '';
  if (/^minicube\b/.test(command)) return 'Опечатка: minikube пишется через k. Нажми на подсказку ниже.';
  if (!/^(docker|minikube|kubectl|help|clear|history|reset)(\s|$)/.test(command)) return 'Неизвестная команда. Доступны docker, minikube, kubectl, help, clear, history, reset.';
  const quotes = command.match(/"|'/g) || [];
  let open = ''; for (const c of quotes) { if (!open) open = c; else if (open === c) open = ''; }
  if (open) return `Не закрыта кавычка ${open}`;
  if (/\bkubectl\s+(gett|desribe|aply|log)\b/.test(command)) return 'Проверь имя операции: get, describe, apply или logs.';
  return '';
}
function updateSyntax() {
  const input = $('#command'); if (!input) return;
  const message = syntax(input.value); $('#syntax').textContent = message || 'Enter — выполнить · ↑↓ — история · Tab — дополнить · Ctrl+C — остановить';
  $('#syntax').classList.toggle('error', Boolean(message)); input.classList.toggle('invalid', Boolean(message)); input.setAttribute('aria-invalid', String(Boolean(message)));
  if (/^minicube\b/.test(input.value)) { hint = suggest(input.value); drawHint(); }
}
function drawLog() {
  const out = $('#output'); if (!out) return;
  const atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 80;
  out.replaceChildren();
  for (const item of log) {
    const el = document.createElement('pre'); el.className = `log-${item.type}`;
    if (item.type === 'command') { const mark = document.createElement('span'); mark.textContent = mode === 'sim' ? 'SIM ❯ ' : 'CLI ❯ '; el.append(mark, document.createTextNode(item.text)); }
    else if (item.type === 'stdout') {
      for (const line of item.text.split('\n')) {
        const row = document.createElement('span');
        if (/ErrImageNeverPull|ImagePullBackOff|ErrImagePull|CrashLoopBackOff|\bError\b|\bFailed\b/i.test(line)) row.className = 'output-error';
        row.textContent = line + '\n'; el.append(row);
      }
    } else el.textContent = item.text;
    out.append(el);
  }
  if (atBottom) out.scrollTop = out.scrollHeight;
}
function append(type, text) {
  // Bound retained output; long watches must not exhaust renderer memory.
  const last = log.at(-1);
  if (last?.type === type && ['stdout', 'stderr'].includes(type) && last.text.length < 20000) last.text += text;
  else log.push({ type, text: String(text).slice(-20000) });
  if (log.length > 160) log = log.slice(-160);
  drawLog();
}
function drawHint() {
  const panel = $('#hint'); if (!panel) return;
  panel.innerHTML = `<div class="hint-symbol">✦</div><div><strong>${escape(hint.title)}</strong><p>${escape(hint.text)}</p>${hint.command ? `<button class="hint-command" data-insert="${escape(hint.command)}">${escape(hint.command)} <span>↗</span></button>` : ''}</div>`;
}
function setBusy(value) { busy = value; $('#run') && ($('#run').disabled = value); $('#stop') && ($('#stop').disabled = !value); $('#mode') && ($('#mode').disabled = value); $('#run') && ($('#run').textContent = value ? 'Выполняется…' : 'Выполнить ↵'); }
async function run(command) {
  if (busy || !command.trim()) return;
  command = command.trim();
  if (command === 'clear') { log = []; drawLog(); $('#command').value = ''; return; }
  append('command', command); history.push(command); historyIndex = history.length; $('#command').value = ''; updateSyntax();
  if (command === 'help') { append('stdout', 'Команды: docker, minikube, kubectl\nhelp — справка · clear — очистить экран · history — история\nreset — сбросить состояние тренажёра (прогресс уроков сохранится)\n\nРеальный режим: отдельный процесс на команду, без PowerShell-конвейеров и -it. Доступны exec без -it, logs -f, get --watch, port-forward.\nРабочая папка: ' + workspace + '\nДля длительной команды нажми «Стоп». Файлы уроков: k8s/lab.yaml и Dockerfile.'); return; }
  if (command === 'history') { append('stdout', history.map((x, i) => `${i + 1}  ${x}`).join('\n')); return; }
  if (command === 'reset') { sim = createSimulation(); append('stdout', 'Состояние тренажёра сброшено. Реальные ресурсы не изменялись.'); return; }
  current = command; outputBuffer = ''; setBusy(true);
  hint = suggest(command); drawHint();
  try {
    if (mode === 'sim') {
      await new Promise(resolve => setTimeout(resolve, 250));
      const result = simulate(command, sim); outputBuffer = result.text;
      append(result.code ? 'stderr' : 'stdout', result.text + '\n');
      append('status', `Симуляция · код ${result.code}`);
      hint = suggest(command, result.text); drawHint();
    } else {
      if (!desktop) throw new Error('Реальные команды доступны в Windows-приложении KubeLab.');
      const result = await desktop.run(command);
      append('status', `Процесс завершён · код ${result.code}`);
      hint = suggest(command, outputBuffer); drawHint();
    }
  } catch (error) { append('stderr', error.message); hint = suggest(command, error.message); drawHint(); }
  finally { setBusy(false); $('#command')?.focus(); }
}
function lessonPanel() {
  const lesson = lessons[selected];
  return `<section class="lesson-panel"><div class="panel-label">ТВОЯ ТЕКУЩАЯ ЗАДАЧА <span>${String(selected + 1).padStart(2, '0')} / ${String(lessons.length).padStart(2, '0')}</span></div><div class="lesson-head"><span class="eyebrow">${lesson.tag} <span>· ${lesson.minutes} МИН</span></span><h2>${escape(lesson.title)}</h2><p>${escape(lesson.concept)}</p></div><div class="goal"><span>◎</span><p>${escape(lesson.goal)}</p></div><div class="lesson-commands"><h3>Попробуй в консоли <small>НАЖМИ, ЧТОБЫ ВСТАВИТЬ</small></h3>${lesson.commands.map((command, i) => `<button class="command-card" data-insert="${escape(command)}"><span>${String(i + 1).padStart(2, '0')}</span><code>${escape(command)}</code><b>↗</b></button>`).join('')}${lesson.alternative ? `<p class="note">Вместо edit во встроенной консоли:</p><button class="command-card" data-insert="${escape(lesson.alternative)}"><code>${escape(lesson.alternative)}</code><b>↗</b></button>` : ''}</div><details><summary>Как проверить результат</summary><p>${escape(lesson.check)}</p></details><details><summary>Подсказка по теме</summary><p>${escape(lesson.tip)}</p></details><div class="quiz"><h3>Проверь понимание</h3><p>${escape(lesson.question)}</p>${lesson.options.map((answer, i) => `<button data-answer="${i}" class="answer">${escape(answer)}</button>`).join('')}<div id="quiz-feedback" role="status"></div><button class="primary finish" id="finish" disabled>${progress.includes(selected) ? 'Урок уже завершён ✓' : 'Понял, отметить урок ✓'}</button><small>Отметка — самооценка после практики и вопроса; кластер автоматически не проверяется.</small></div><div class="lesson-pager"><button id="prev" ${selected === 0 ? 'disabled' : ''}>← Назад</button><button id="next" ${selected === lessons.length - 1 ? 'disabled' : ''}>Дальше →</button></div></section>`;
}
function consoleView() {
  $('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">УЧИСЬ ЧЕРЕЗ ПРАКТИКУ</div><h1>Твой Kubernetes.<br><span>Твоя лаборатория.</span></h1><p>Docker уже знаком. Теперь — Kubernetes, команды и реальные задачи.</p></div><div class="course-badge"><span>⎈</span><div>ОТ КОНТЕЙНЕРА<br><strong>ДО КЛАСТЕРА</strong></div></div></div><div class="lab-grid"><div class="console-column"><section class="terminal"><div class="terminal-bar"><div class="dots"><i></i><i></i><i></i></div><span>KubeLab Terminal</span><label class="mode-label"><select id="mode" aria-label="Режим консоли"><option value="sim">Тренажёр</option><option value="real" ${desktop ? '' : 'disabled'}>Реальные команды</option></select></label></div><div class="mode-banner" id="mode-banner"></div><div id="output" tabindex="0" role="log" aria-label="Вывод консоли" aria-live="off"></div><form id="console-form"><div class="input-line"><span>❯</span><input id="command" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Команда консоли" aria-describedby="syntax" placeholder="Например, docker version"><button id="run" type="submit">Выполнить ↵</button></div><div class="terminal-bottom"><span id="syntax"></span><button type="button" id="stop" disabled>■ Стоп</button></div></form></section><section id="hint" class="hint"></section><div class="workspace-line"><span>⌁</span><span id="workspace">${escape(workspace)}</span>${desktop ? '<button id="folder">Сменить папку</button>' : '<span>Браузерная версия · только тренажёр</span>'}</div><div class="quick-commands"><span>БЫСТРЫЙ СТАРТ</span><button data-insert="docker version">Docker version</button><button data-insert="minikube status -p kubelab">Статус кластера</button><button data-insert="${prefix} get pods">Pod</button><button data-insert="help">Справка</button></div></div>${lessonPanel()}</div>`;
  $('#mode').value = mode; updateModeBanner(); drawLog(); drawHint(); updateSyntax(); setBusy(busy);
  $('#console-form').addEventListener('submit', event => { event.preventDefault(); run($('#command').value); });
  $('#command').addEventListener('input', updateSyntax);
  $('#command').addEventListener('keydown', event => {
    if (event.ctrlKey && event.key.toLowerCase() === 'c' && busy) { event.preventDefault(); desktop?.stop(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); historyIndex = Math.max(0, historyIndex - 1); event.target.value = history[historyIndex] || ''; updateSyntax(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); historyIndex = Math.min(history.length, historyIndex + 1); event.target.value = history[historyIndex] || ''; updateSyntax(); }
    if (event.key === 'Tab' && !event.shiftKey && event.target.value.trim()) {
      const match = lessons.flatMap(l => [...l.commands, ...(l.alternative ? [l.alternative] : [])]).find(c => c.startsWith(event.target.value.trim()) && c !== event.target.value);
      if (match) { event.preventDefault(); event.target.value = match; updateSyntax(); }
    }
  });
  $('#stop').onclick = () => desktop?.stop();
  $('#mode').onchange = event => { mode = event.target.value; append('status', mode === 'sim' ? 'ТРЕНАЖЁР: система не изменяется.' : 'РЕАЛЬНЫЕ КОМАНДЫ: команды меняют контейнеры и кластер от имени твоего пользователя.'); updateModeBanner(); };
  $('#folder')?.addEventListener('click', async () => { try { workspace = await desktop.chooseFolder(); $('#workspace').textContent = workspace; } catch (e) { notify(e.message); } });
  $('#prev').onclick = () => { selected--; location.hash = `#lesson/${selected}`; };
  $('#next').onclick = () => { selected++; location.hash = `#lesson/${selected}`; };
  $('#finish').onclick = () => { if (!progress.includes(selected)) progress.push(selected); save(); updateProgress(); notify('Урок отмечен как пройденный'); $('#finish').textContent = 'Урок завершён ✓'; };
  document.querySelectorAll('[data-answer]').forEach(button => button.onclick = () => {
    const correct = Number(button.dataset.answer) === lessons[selected].answer;
    document.querySelectorAll('[data-answer]').forEach(b => b.classList.remove('correct', 'wrong'));
    button.classList.add(correct ? 'correct' : 'wrong');
    $('#quiz-feedback').textContent = correct ? 'Верно. Теперь можешь отметить урок после практики.' : 'Попробуй ещё раз. Ответ есть в объяснении выше.';
    $('#finish').disabled = !correct;
  });
}
function updateModeBanner() { $('#mode-banner').textContent = mode === 'sim' ? '● Тренажёр · результаты смоделированы · реальный кластер не используется' : '● Реальный режим · команды выполняются на твоём компьютере'; $('#mode-banner').classList.toggle('real', mode === 'real'); }
function courseView() {
  $('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">ТВОЙ МАРШРУТ</div><h1>От первого кластера<br><span>до уверенного kubectl.</span></h1><p>${lessons.length} лабораторных работ. Одно приложение, которое ты изучишь изнутри.</p></div></div><div class="lesson-list">${lessons.map((lesson, i) => `<a href="#lesson/${i}" class="lesson-tile"><span class="lesson-number">${progress.includes(i) ? '✓' : String(i + 1).padStart(2, '0')}</span><div><span class="eyebrow">${lesson.tag} · ${lesson.minutes} МИН</span><h2>${escape(lesson.title)}</h2><p>${escape(lesson.goal)}</p></div><span>→</span></a>`).join('')}</div>`;
}
function mapView() {
  $('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">ПОНЯТЬ АРХИТЕКТУРУ</div><h1>Одна система.<br><span>Несколько уровней.</span></h1><p>Это схема учебного стенда, а не обнаруженные ресурсы компьютера.</p></div></div><div class="architecture"><div class="arch-box windows"><b>Windows</b><span>KubeLab Desktop → CLI: docker / minikube / kubectl</span><div class="arch-box docker"><b>Docker Desktop · Linux containers</b><span>Запускает контейнер Node для Minikube</span><div class="arch-box cluster"><b>Minikube · профиль kubelab</b><span>Kubernetes API + Node</span><div class="arch-box namespace"><b>Namespace: kubelab</b><div class="flow"><div>Service<br><small>порт 80</small></div><span>→</span><div>Pod A<br><small>web :3000</small></div><div>Pod B<br><small>web :3000</small></div></div><p>Deployment → ReplicaSet → Pod<br>ConfigMap → LAB_MESSAGE → окружение контейнера</p></div></div></div></div><div class="callout"><h2>Как запрос попадает в приложение</h2><p>Браузер Windows → localhost:8081 → kubectl port-forward → выбранный Pod:3000. Команда с service/kubelab находит Pod через Service, но держит туннель к одной реплике.</p><h2>Что можно наблюдать</h2><p>GET /api/runtime возвращает имя Pod, namespace, версию, сообщение, время работы и счётчик запросов конкретного процесса. Счётчик сбрасывается при замене Pod. Прогресс уроков хранится локально в приложении.</p><button class="primary" data-insert="${prefix} get pods">Посмотреть Pod →</button></div></div>`;
}
function commandsView() {
  $('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">ПОД РУКОЙ</div><h1>Шпаргалка <span>по командам.</span></h1><p>Команда вставляется в консоль. Выполнение — по Enter.</p></div></div><input class="search" id="search" type="search" placeholder="Найти команду или тему…" aria-label="Поиск команд"><div id="command-results"></div><div class="callout"><h2>Остановить и удалить стенд</h2><p>В обычном PowerShell: minikube stop -p kubelab остановит кластер, сохранив его состояние. minikube delete -p kubelab удалит только этот учебный профиль. docker rm -f kubelab-web удалит учебный контейнер Docker.</p></div>`;
  const render = query => {
    const matches = lessons.flatMap(l => [...l.commands, ...(l.alternative ? [l.alternative] : [])].map(c => ({ title: l.title, command: c }))).filter(({ title, command }) => `${title} ${command}`.toLowerCase().includes(query.toLowerCase()));
    $('#command-results').innerHTML = matches.length ? matches.map(({ title, command }) => `<div class="cheat"><span>${escape(title)}</span><button class="command-card" data-insert="${escape(command)}"><code>${escape(command)}</code><b>↗</b></button><button class="copy" data-copy="${escape(command)}" aria-label="Копировать команду">Копировать</button></div>`).join('') : '<p class="empty">Ничего не найдено. Попробуй «pods» или «Docker».</p>';
  }; render(''); $('#search').oninput = event => render(event.target.value);
}
function route() {
  const hash = location.hash || '#home';
  if (hash.startsWith('#lesson/')) { const value = Number(hash.split('/')[1]); selected = Number.isInteger(value) ? Math.max(0, Math.min(lessons.length - 1, value)) : 0; }
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (hash === '#course' || hash.startsWith('#lesson') ? 'lesson' : hash.slice(1))));
  if (hash === '#map') mapView(); else if (hash === '#commands') commandsView(); else if (hash === '#course') courseView(); else consoleView();
  updateProgress();
}
document.querySelector('[data-nav="lesson"]').href = '#course';
document.addEventListener('click', async event => {
  const insertButton = event.target.closest('[data-insert]'); if (insertButton) insert(insertButton.dataset.insert);
  const copy = event.target.closest('[data-copy]'); if (copy) { try { await navigator.clipboard.writeText(copy.dataset.copy); notify('Команда скопирована'); } catch { notify('Копирование недоступно. Выдели текст команды.'); } }
});
window.addEventListener('hashchange', route);
desktop?.onOutput(value => {
  if (value.done) return;
  const plain = value.text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
  outputBuffer = (outputBuffer + plain).slice(-50000);
  append(value.stream, plain);
  hint = suggest(current, outputBuffer); drawHint();
});
route();
if (desktop) {
  const button = document.createElement('button'); button.className = 'setup-button'; button.textContent = 'Настройка системы';
  button.onclick = async () => { try { const result = await desktop.openSetup(); notify(result.started ? 'Открываем мастер подготовки системы' : 'Мастер подготовки уже открыт'); } catch (error) { notify(error.message); } };
  $('.topbar>div').prepend(button);
}
if (desktop) desktop.environment().then(info => { workspace = info.workspace; if ($('#workspace')) $('#workspace').textContent = workspace; });
