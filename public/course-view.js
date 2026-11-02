const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function renderCourse(lessons, progress, query = '') {
  const plural = new Intl.PluralRules('ru');
  const countLabel = count => `${count} ${{ one: 'занятие', few: 'занятия', many: 'занятий', other: 'занятия' }[plural.select(count)]}`;
  const groups = new Map();
  const words = query.toLocaleLowerCase('ru').trim().split(/\s+/).filter(Boolean);
  lessons.forEach((lesson, index) => {
    const module = lesson.module || 'Основы Kubernetes';
    const search = `${module} ${lesson.title} ${lesson.goal} ${lesson.tag}`.toLocaleLowerCase('ru');
    if (!words.every(word => search.includes(word))) return;
    if (!groups.has(module)) groups.set(module, []);
    groups.get(module).push({ lesson, index });
  });
  if (!groups.size) return '<p class="empty">Уроки не найдены. Попробуйте название темы: сеть, хранение, доступ или обновление.</p>';
  return [...groups].map(([name, entries]) => `<section class="course-module"><h2>${esc(name)} <span>${countLabel(entries.length)}</span></h2><div class="lesson-list">${entries.map(({ lesson, index }) => `<a href="#lesson/${index}" class="lesson-tile"><span class="lesson-number">${progress.includes(index) ? '✓' : String(index + 1).padStart(2, '0')}</span><div><span class="eyebrow">${esc(lesson.tag)} · ${lesson.minutes} минут${lesson.practiceKind ? ' · ' + esc(lesson.practiceKind) : ''}</span><h3>${esc(lesson.title)}</h3><p>${esc(lesson.goal)}</p></div><span>→</span></a>`).join('')}</div></section>`).join('');
}
