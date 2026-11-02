import {requiredTopics} from './professional/catalog.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function coverageRows(lessons){return requiredTopics.map(topic=>{const index=lessons.findIndex(l=>l.number===topic.lessonNumber);const lesson=lessons[index];const section=lesson?.deepSections?.find(s=>s.topics.some(t=>t.id===topic.id));return {...topic,index,section,lesson};});}
export function renderCoverage(lessons,query=''){
 const all=coverageRows(lessons),missing=all.filter(row=>!row.section),words=query.toLocaleLowerCase('ru').trim().split(/\s+/).filter(Boolean);
 const rows=all.filter(row=>words.every(word=>`${row.group} ${row.title} ${row.lesson?.title||''}`.toLocaleLowerCase('ru').includes(word)));
 const groups=new Map();for(const row of rows){if(!groups.has(row.group))groups.set(row.group,[]);groups.get(row.group).push(row);}
 return `<p class="coverage-summary">${all.length} тематических пунктов · ${all.length-missing.length} привязаны к разделам · ${missing.length} без материала.</p><p>Привязка показывает, где находится объяснение. Она не подтверждает испытание в Kubernetes или освоение учеником. Новые опыты пока не прошли сквозную проверку на живом стенде. Для расчётных заданий и внешних систем границы указаны в уроке.</p>${[...groups].map(([group,entries])=>`<section class="reading-section"><h2>${esc(group)}</h2><ul class="coverage-list">${entries.map(row=>`<li>${row.section?`<a href="#lesson/${row.index}/topic/${row.section.id}">${esc(row.title)}</a><span>Урок ${row.index+1} · ${esc(row.section.title)}</span>`:`<strong>${esc(row.title)}</strong><span>Пробел: раздел ещё не подготовлен</span>`}</li>`).join('')}</ul></section>`).join('')||'<p>Нет совпадений.</p>'}`;
}
