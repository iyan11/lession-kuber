import { requiredTopics } from './catalog.js';
import { professionalFiles } from './resources.js';
export const context = 'kubelab-deep';
export const cli = 'kubectl --context kubelab-deep -n kubelab-deep';
export const clusterCli = 'kubectl --context kubelab-deep';
export const section = (title, covers, paragraphs, example, mistake, assignment, solution) => ({ title, covers, paragraphs, example, mistake, assignment, solution });
export const command = (title, text, why, parts, expected, problem = '', options = {}) => ({ title, command: text, why, parts, expected, problem, ...options });
export const useFile = (name, description, expected) => command('Примените полный файл опыта', `${clusterCli} apply -f k8s/professional/${name}.yaml`, description, [['-f', 'Путь к готовому файлу относительно рабочей папки. Перед запуском прочитайте его ниже.']], expected);
export const cleanFile = (name, description) => command('Удалите только объекты опыта', `${clusterCli} delete -f k8s/professional/${name}.yaml`, description, [['delete -f', 'Удалить перечисленные объекты. Связанные данные могут быть потеряны; последствия указаны в тексте.']], 'Перечисленные учебные объекты удалены.');
export function defineLesson(number, data) {
  const topics = requiredTopics.filter(topic => topic.lessonNumber === number);
  const seen = new Set();
  const sections = data.deepSections.map((item,index) => {
    const mapped = item.covers.map(position => { const topic = topics[position]; if(!topic)throw Error(`Unknown topic ${number}/${position}`);if(seen.has(topic.id))throw Error(`Duplicate coverage ${topic.id}`);seen.add(topic.id);return topic; });
    return { ...item, id: `deep-${number}-${index}`, topics: mapped };
  });
  const missing = topics.filter(topic => !seen.has(topic.id));
  // Missing mappings remain visible in the audit; they never become a completed topic automatically.
  return { id: `professional-${number}`, number, module: data.module, tag: data.tag, minutes: data.minutes || 70, context, namespace: 'kubelab-deep', requiresReal: true, practiceKind: data.practiceKind || 'Отдельный учебный стенд', before: 'Сначала закончите первые 38 занятий. Этот модуль использует отдельный профиль kubelab-deep; основной профиль не переустанавливается. Прочитайте подготовку и объём ресурсов конкретного опыта. Условная модель консоли не исполняет дополнительные службы.', ...data, deepSections: sections, coverageMissing: missing.map(topic=>topic.id), examples: (data.files || []).map(path => { if(!professionalFiles[path])throw Error('Missing example '+path);return { path, text: professionalFiles[path] }; }), commands: data.steps.filter(step=>step.executor!=='external').map(step=>step.command) };
}
export const positions = (from,to=from) => Array.from({length:to-from+1},(_,i)=>from+i);
