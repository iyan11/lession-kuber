const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function renderLesson(lesson, index, total, complete) {
  const sections = (items, prefix) => (items || []).map((item, i) => `<section class="reading-section" id="${prefix}-${i}"><h2>${esc(item.title)}</h2>${item.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}${item.code ? `<pre class="lesson-example">${esc(item.code)}</pre>` : ''}${item.fields?.length ? `<dl class="command-parts">${item.fields.map(([name, meaning]) => `<div><dt><code>${esc(name)}</code></dt><dd>${esc(meaning)}</dd></div>`).join('')}</dl>` : ''}</section>`).join('');
  return `<article class="lesson-panel lesson-prose" aria-label="Текст урока">
    <div class="panel-label">Урок ${index + 1} из ${total} <span>Около ${lesson.minutes} минут</span></div>
    <nav class="reading-section lesson-contents" aria-label="Содержание урока"><h2>В этом уроке</h2><ul>${(lesson.sections || []).map((item, i) => `<li><a href="#theory-${i}" data-reading-target="theory-${i}">${esc(item.title)}</a></li>`).join('')}${lesson.manifestGuide ? '<li><a href="#manifest-0" data-reading-target="manifest-0">Подробный разбор манифеста</a></li>' : ''}${lesson.steps.map((item, i) => `<li><a href="#step-${i + 1}" data-reading-target="step-${i + 1}">Практика ${i + 1}: ${esc(item.title)}</a></li>`).join('')}</ul></nav>
    <section class="reading-section"><h2>Перед началом</h2><p>${esc(lesson.before)}</p></section>
    <section class="reading-section"><h2>Что будем делать и зачем</h2>${lesson.introduction.map(p => `<p>${esc(p)}</p>`).join('')}</section>
    <section class="reading-section"><h2>Новые понятия</h2><dl class="terms">${lesson.terms.map(([term, meaning]) => `<dt>${esc(term)}</dt><dd>${esc(meaning)}</dd>`).join('')}</dl></section>
    ${sections(lesson.sections, 'theory')}
    ${lesson.imageGuide ? `<section class="reading-section image-guide" aria-label="Подготовка образа приложения">
      <h2>Из чего мы собираем образ</h2><p>${esc(lesson.imageGuide.introduction)}</p>
      <h3>Готовые файлы из комплекта KubeLab</h3><p>${esc(lesson.imageGuide.source)}</p><dl class="terms">${lesson.imageGuide.files.map(([name, meaning]) => `<dt><code>${esc(name)}</code></dt><dd>${esc(meaning)}</dd>`).join('')}</dl>
      <h3>Откуда берётся основа для нашего образа</h3><p>${esc(lesson.imageGuide.base)}</p>
      <h3>Что написано в нашем Dockerfile</h3><pre class="lesson-example">${esc(lesson.imageGuide.dockerfile)}</pre><dl class="command-parts">${lesson.imageGuide.instructions.map(([instruction, meaning]) => `<div><dt><code>${esc(instruction)}</code></dt><dd>${esc(meaning)}</dd></div>`).join('')}</dl>
      <h3>Как файлы станут работающим приложением</h3><ol class="image-build-flow">${lesson.imageGuide.flow.map(item => `<li>${esc(item)}</li>`).join('')}</ol><p>${esc(lesson.imageGuide.location)}</p><p>${esc(lesson.imageGuide.result)}</p>
    </section>` : ''}
    ${lesson.manifest ? `<section class="reading-section"><h2>Что записано в манифесте</h2><pre class="lesson-example">${esc(lesson.manifest)}</pre><p>${esc(lesson.manifestExplanation)}</p></section>` : ''}
    ${sections(lesson.manifestGuide, 'manifest')}
    <section class="reading-section common-flags"><h2>Как читать команды kubectl</h2><p><code>--context kubelab</code> выбирает учебный кластер. <code>-n kubelab</code> выбирает namespace — область с объектами приложения внутри этого кластера. Эти параметры не являются частью действия: само действие находится дальше, например <code>get pods</code>.</p></section>
    ${lesson.steps.map((step, i) => `<section class="reading-section lesson-step" id="step-${i + 1}">
      <h2><span class="step-index">${i + 1}.</span> ${esc(step.title)}</h2><p>${esc(step.why)}</p>
      <button class="command-card" data-insert="${esc(step.command)}" aria-label="Вставить команду ${esc(step.command)}"><code>${esc(step.command)}</code><span>Вставить</span></button>
      <dl class="command-parts">${step.parts.map(([part, meaning]) => `<div><dt><code>${esc(part)}</code></dt><dd>${esc(meaning)}</dd></div>`).join('')}</dl>
      <h3>Что должно получиться</h3><p>${esc(step.expected)}</p>
      ${step.example ? `<div class="example-block"><span>Пример вывода. Имена и адреса могут отличаться.</span><pre class="lesson-example">${esc(step.example)}</pre></div>` : ''}
      ${step.exitCode ? `<p class="expected-exit">В этом задании ожидается код завершения ${step.exitCode}. Прочитайте объяснение результата перед исправлением ошибки.</p>` : ''}
      ${step.problem ? `<aside class="lesson-problem"><h3>Если результат другой</h3><p>${esc(step.problem)}</p></aside>` : ''}
    </section>`).join('')}
    <section class="reading-section"><h2>Проверьте результат урока</h2><ul>${lesson.recap.map(item => `<li>${esc(item)}</li>`).join('')}</ul><h3>Небольшое задание</h3><p>${esc(lesson.exercise)}</p></section>
    <section class="reading-section"><h2>Для дальнейшего чтения</h2><p>Описание отдельных полей и дополнительные примеры можно найти в <a href="https://kubernetes.io/docs/home/" target="_blank" rel="noreferrer">документации Kubernetes</a>. В этой практике команды адресованы только учебному кластеру kubelab.</p></section>
    <section class="quiz"><h2>Вопрос к уроку</h2><p>${esc(lesson.question)}</p>${lesson.options.map((answer, i) => `<button data-answer="${i}" class="answer">${esc(answer)}</button>`).join('')}<div id="quiz-feedback" role="status"></div><button class="primary finish" id="finish" disabled>${complete ? 'Урок завершён' : 'Завершить урок'}</button><small>Отметьте урок после выполнения шагов и ответа на вопрос. Приложение не проверяет ваш кластер автоматически.</small></section>
    <div class="lesson-pager"><button id="prev" ${index === 0 ? 'disabled' : ''}>Предыдущий урок</button><button id="next" ${index === total - 1 ? 'disabled' : ''}>Следующий урок</button></div>
  </article>`;
}
