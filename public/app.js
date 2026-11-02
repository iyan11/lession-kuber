import { renderLesson } from './lesson-view.js';
import { renderHelp } from './help-view.js';
import { setupQuestions } from './questions-view.js';
import { setupUpdates } from './updates-view.js';
import { lessons, prefix } from './lessons.js';
import { renderCourse } from './course-view.js';
import { renderCoverage } from './coverage-view.js';
import { suggest, simulate, createSimulation } from './coach.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const desktop = window.kubeDesktop;
const openQuestions = setupQuestions(desktop, () => ({ index: selected, title: lessons[selected].title }));
let progress = [], selected = 0, mode = 'sim', busy = false, current = '', history = [], historyIndex = 0, sim = createSimulation(), outputBuffer = '', workspace = 'Папка проекта KubeLab';
let log = [{ type: 'welcome', text: 'Здесь выполняются команды из урока.\n\nВключён тренажёр: команды не меняют ваш компьютер. Читайте шаги по порядку. Кнопка «Вставить» заполняет поле; Enter выполняет команду.' }];
let hint = suggest('');
function commandHint(command, output = '') {
  const diagnostic = suggest(command, output);
  const explanation = lessons[selected].steps.find(step => step.command === command);
  if (explanation && diagnostic.title === 'Пояснение к команде') return { title: explanation.title, text: output ? explanation.expected : explanation.why, command: '' };
  return diagnostic;
}
try { const saved = JSON.parse(localStorage.getItem('kubelab-progress-v2') || '[]'); if (Array.isArray(saved)) progress = saved.filter(x => Number.isInteger(x) && x >= 0 && x < lessons.length); } catch {}
function notify(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 3000); }
function save() { try { localStorage.setItem('kubelab-progress-v2', JSON.stringify([...new Set(progress)])); } catch { notify('Хранилище прогресса недоступно. В этой сессии прогресс сохранится.'); } }
function updateProgress() { if ($('#lesson-count')) $('#lesson-count').textContent = lessons.length; $('#side-count').textContent = `${new Set(progress).size} / ${lessons.length}`; $('#side-bar').style.width = `${new Set(progress).size / lessons.length * 100}%`; }
function insert(command) { if (!$('#command')) { location.hash = '#home'; setTimeout(() => insert(command), 0); return; } $('#command').value = command; $('#command').focus({ preventScroll: true }); updateSyntax(); hint = commandHint(command); drawHint(); }
function syntax(command) {
  if (!command.trim()) return '';
  if (/^minicube\b/.test(command)) return 'Опечатка: minikube пишется через k. Нажми на подсказку ниже.';
  if (!/^(docker|minikube|kubectl|helm|help|clear|history|reset)(\s|$)/.test(command)) return 'Неизвестная команда. Доступны docker, minikube, kubectl, helm, help, clear, history, reset.';
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
  if (command === 'help') { append('stdout', 'В уроках используются minikube и kubectl\nhelp — справка · clear — очистить экран · history — история\nreset — сбросить состояние тренажёра (прогресс уроков сохранится)\n\nРеальный режим: отдельный процесс на команду, без PowerShell-конвейеров и -it. Доступны exec без -it, logs -f, get --watch, port-forward.\nРабочая папка: ' + workspace + '\nДля длительной команды нажми «Стоп». Файлы уроков: k8s/lab.yaml и Dockerfile.'); return; }
  if (command === 'history') { append('stdout', history.map((x, i) => `${i + 1}  ${x}`).join('\n')); return; }
  if (command === 'reset') { sim = createSimulation(); append('stdout', 'Состояние тренажёра сброшено. Реальные ресурсы не изменялись.'); return; }
  current = command; outputBuffer = ''; setBusy(true);
  hint = commandHint(command); drawHint();
  try {
    if (mode === 'sim') {
      if (lessons[selected].requiresReal || /kubelab-(deep|multi|upgrade|mesh|gitops|project)/.test(command)) throw new Error('Этот опыт требует настоящего отдельного стенда. Тренажёр не выполняет его и не подтверждает результат. В настольном приложении выберите «Реальные команды» после чтения подготовки.');
      await new Promise(resolve => setTimeout(resolve, 250));
      const result = simulate(command, sim); outputBuffer = result.text;
      append(result.code ? 'stderr' : 'stdout', result.text + '\n');
      append('status', `Симуляция · код ${result.code}`);
      hint = commandHint(command, result.text); drawHint();
    } else {
      if (!desktop) throw new Error('Реальные команды доступны в Windows-приложении KubeLab.');
      const result = await desktop.run(command);
      append('status', `Процесс завершён · код ${result.code}`);
      hint = commandHint(command, outputBuffer); drawHint();
    }
  } catch (error) { append('stderr', error.message); hint = suggest(command, error.message); drawHint(); }
  finally { setBusy(false); $('#command')?.focus(); }
}
function lessonPanel() { return renderLesson(lessons[selected], selected, lessons.length, progress.includes(selected)); }
function consoleView() {
  const profile=lessons[selected].context||'kubelab';
  const selectedPrefix='kubectl --context '+profile+' -n '+(lessons[selected].namespace||'kubelab');
  $('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">Урок ${selected + 1} из ${lessons.length}</div><h1>${escape(lessons[selected].title)}</h1><p>${escape(lessons[selected].goal)}</p></div></div><div class="lab-grid">${lessonPanel()}<div class="console-column"><section class="terminal"><div class="terminal-bar"><div class="dots"><i></i><i></i><i></i></div><span>Консоль</span><label class="mode-label"><select id="mode" aria-label="Режим консоли"><option value="sim">Тренажёр</option><option value="real" ${desktop ? '' : 'disabled'}>Реальные команды</option></select></label></div><div class="mode-banner" id="mode-banner"></div><div id="output" tabindex="0" role="log" aria-label="Вывод консоли" aria-live="off"></div><form id="console-form"><div class="input-line"><span>❯</span><input id="command" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Команда консоли" aria-describedby="syntax" placeholder="minikube status -p kubelab"><button id="run" type="submit">Выполнить ↵</button></div><div class="terminal-bottom"><span id="syntax"></span><button type="button" id="stop" disabled>■ Стоп</button></div></form></section><section id="hint" class="hint"></section><div class="workspace-line"><span>⌁</span><span id="workspace">${escape(workspace)}</span>${desktop ? '<button id="folder">Сменить папку</button>' : '<span>Браузерная версия · только тренажёр</span>'}</div><div class="quick-commands"><span>Проверка кластера</span><button data-insert="kubectl --context ${escape(profile)} get nodes">Узлы кластера</button><button data-insert="minikube status -p ${escape(profile)}">Статус кластера</button><button data-insert="${escape(selectedPrefix)} get pods">Pod</button><button data-insert="help">Справка</button></div></div></div>`;
  const questionButton = document.createElement('button');
  questionButton.className = 'question-open'; questionButton.textContent = 'Вопрос по уроку';
  questionButton.onclick = openQuestions;
  $('.quick-commands').before(questionButton);
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
  document.querySelectorAll('[data-reading-target]').forEach(link => link.onclick = event => { event.preventDefault(); document.getElementById(link.dataset.readingTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('#next').onclick = () => { selected++; location.hash = `#lesson/${selected}`; };
  $('#finish').onclick = () => { if (!progress.includes(selected)) progress.push(selected); save(); updateProgress(); notify('Урок завершён'); $('#finish').textContent = 'Урок завершён'; };
  document.querySelectorAll('[data-answer]').forEach(button => button.onclick = () => {
    const correct = Number(button.dataset.answer) === lessons[selected].answer;
    document.querySelectorAll('[data-answer]').forEach(b => b.classList.remove('correct', 'wrong'));
    button.classList.add(correct ? 'correct' : 'wrong');
    $('#quiz-feedback').textContent = (correct ? 'Верно. ' : 'Не совсем. ') + lessons[selected].answerExplanation;
    $('#finish').disabled = !correct;
  });
}
function updateModeBanner() { $('#mode-banner').textContent = mode === 'sim' ? (lessons[selected].requiresReal ? 'Для этого урока нужен отдельный реальный стенд. Тренажёр не исполняет эти команды.' : '● Тренажёр · результаты смоделированы · реальный кластер не используется') : `● Реальные команды · профиль ${lessons[selected].context||'kubelab'} · прочитайте подготовку`; $('#mode-banner').classList.toggle('real', mode === 'real'); }
function coverageView() {
  $('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">Программа курса</div><h1>Карта тем</h1><p>Каждая ссылка открывает конкретное объяснение, пример и вопрос для самостоятельной проверки.</p><a href="#course">Вернуться к урокам</a></div></div><input id="coverage-search" class="search" type="search" placeholder="Найти тему…" aria-label="Поиск по карте тем"><div id="coverage-results">${renderCoverage(lessons)}</div>`;
  $('#coverage-search').oninput=event=>{$('#coverage-results').innerHTML=renderCoverage(lessons,event.target.value);};
}
function courseView() {
  $('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">Курс Kubernetes</div><h1>Уроки Kubernetes</h1><p>${lessons.length} занятий по модулям: от первого приложения до эксплуатации и собственной платформы. Читайте условия подготовки каждого опыта. Прежние номера уроков сохранены.</p></div></div><input id="course-search" class="search" type="search" aria-label="Найти урок" placeholder="Найти тему или модуль…"><div id="course-modules">${renderCourse(lessons, progress)}</div>`;
  const coverageLink=document.createElement('a');coverageLink.href='#coverage';coverageLink.className='coverage-open';coverageLink.textContent='Карта тем и границы практики →';$('#course-search').before(coverageLink);
  $('#course-search').addEventListener('input', event => { $('#course-modules').innerHTML = renderCourse(lessons, progress, event.target.value); });
}
function mapView() {
  $('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">Справка</div><h1>Как устроен учебный кластер</h1><p>Это схема учебного стенда, а не обнаруженные ресурсы компьютера.</p></div></div><div class="architecture"><div class="arch-box windows"><b>Windows</b><span>KubeLab Desktop → CLI: docker / minikube / kubectl</span><div class="arch-box docker"><b>Docker Desktop · Linux containers</b><span>Запускает контейнер Node для Minikube</span><div class="arch-box cluster"><b>Minikube · профиль kubelab</b><span>Kubernetes API + Node</span><div class="arch-box namespace"><b>Namespace: kubelab</b><div class="flow"><div>Service<br><small>порт 80</small></div><span>→</span><div>Pod A<br><small>web :3000</small></div><div>Pod B<br><small>web :3000</small></div></div><p>Deployment → ReplicaSet → Pod<br>ConfigMap → LAB_MESSAGE → окружение контейнера</p></div></div></div></div><div class="callout"><h2>Как запрос попадает в приложение</h2><p>Браузер Windows → localhost:8081 → kubectl port-forward → выбранный Pod:3000. Команда с service/kubelab находит Pod через Service, но держит туннель к одной реплике.</p><h2>Что можно наблюдать</h2><p>GET /api/runtime возвращает имя Pod, namespace, версию, сообщение, время работы и счётчик запросов конкретного процесса. Счётчик сбрасывается при замене Pod. Прогресс уроков хранится локально в приложении.</p><button class="primary" data-insert="${prefix} get pods">Посмотреть Pod →</button></div></div>`;
}
function commandsView() {
  $('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow">Справка</div><h1>Шпаргалка <span>по командам.</span></h1><p>Команда вставляется в консоль. Выполнение — по Enter.</p></div></div><input class="search" id="search" type="search" placeholder="Найти команду или тему…" aria-label="Поиск команд"><div id="command-results"></div><div class="callout"><h2>Остановить и удалить стенд</h2><p>В обычном PowerShell: minikube stop -p kubelab остановит кластер, сохранив его состояние. minikube delete -p kubelab удалит только этот учебный профиль.</p></div>`;
  const render = query => {
    const matches = lessons.flatMap(l => [...l.commands, ...(l.alternative ? [l.alternative] : [])].map(c => ({ title: l.title, command: c }))).filter(({ title, command }) => `${title} ${command}`.toLowerCase().includes(query.toLowerCase()));
    $('#command-results').innerHTML = matches.length ? matches.map(({ title, command }) => `<div class="cheat"><span>${escape(title)}</span><button class="command-card" data-insert="${escape(command)}"><code>${escape(command)}</code><b>↗</b></button><button class="copy" data-copy="${escape(command)}" aria-label="Копировать команду">Копировать</button></div>`).join('') : '<p class="empty">Ничего не найдено. Попробуйте «pods» или «rollout».</p>';
  }; render(''); $('#search').oninput = event => render(event.target.value);
}
function helpView() {
  $('#main').innerHTML = renderHelp(Boolean(desktop));
  $('#repair-components')?.addEventListener('click', async () => { try { await desktop.openSetup(); } catch (error) { notify(error.message); } });
}
function route() {
  const hash = location.hash || '#home';
  if (hash.startsWith('#lesson/')) { const value = Number(hash.split('/')[1]); selected = Number.isInteger(value) ? Math.max(0, Math.min(lessons.length - 1, value)) : 0; }
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (hash === '#course' || hash.startsWith('#lesson') ? 'lesson' : hash.slice(1))));
  if (hash === '#help') helpView(); else if (hash === '#map') mapView(); else if (hash === '#commands') commandsView(); else if (hash === '#course') courseView(); else if (hash === '#coverage') coverageView(); else consoleView();
  const target=hash.match(/^#lesson\/\d+\/topic\/(deep-\d+-\d+)$/)?.[1];
  if(target&&lessons[selected].deepSections?.some(section=>section.id===target)) document.getElementById(target)?.scrollIntoView({block:'start'});
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
  hint = commandHint(current, outputBuffer); drawHint();
});
route();
setupUpdates(desktop);
if (desktop) desktop.environment().then(info => { workspace = info.workspace; if ($('#workspace')) $('#workspace').textContent = workspace; });
