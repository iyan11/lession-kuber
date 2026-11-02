// CLI arguments, not PowerShell source. No shell interpolation is performed.
const tools = new Set(['docker', 'minikube', 'kubectl', 'helm']);
function parseCommand(source) {
  if (typeof source !== 'string' || !source.trim() || source.length > 4096) throw new Error('Введите команду длиной до 4096 символов.');
  const tokens = []; let word = '', quote = '', active = false;
  for (const char of source.trim()) {
    if (quote) { if (char === quote) quote = ''; else word += char; active = true; continue; }
    if (char === '"' || char === "'") { quote = char; active = true; }
    else if (/\s/.test(char)) { if (active) { tokens.push(word); word = ''; active = false; } }
    else if (/[|;&<>`\u0000-\u001f]/.test(char)) throw new Error('Выполняйте по одной команде. Конвейеры, перенаправления и PowerShell-выражения здесь не поддерживаются.');
    else { word += char; active = true; }
  }
  if (quote) throw new Error('Не закрыта кавычка. Добавьте такую же кавычку в конце аргумента.');
  if (active) tokens.push(word);
  const executable = tokens.shift();
  if (!tools.has(executable)) throw new Error('Доступны docker, minikube, kubectl и дополнительно установленный helm. Команда help покажет справку.');
  const separator = tokens.indexOf('--');
  const options = separator < 0 ? tokens : tokens.slice(0, separator);
  if (executable === 'kubectl' && options.includes('edit')) throw new Error('kubectl edit требует внешнего редактора. Используйте patch из урока или обычный PowerShell.');
  // -t is a tag for image builds, but a terminal flag for exec/run/attach.
  // Arguments after -- belong to the program inside the container.
  const interactiveOperation = (executable === 'kubectl' && options.some(x => ['exec', 'run', 'attach', 'debug'].includes(x))) || (executable === 'docker' && options.some(x => ['exec', 'run', 'attach', 'start'].includes(x)));
  if (interactiveOperation && options.some(x => /^--(interactive|tty|attach)(=|$)/.test(x) || /^-[a-zA-Z]*[it][a-zA-Z]*(=|$)/.test(x))) throw new Error('Интерактивный ввод (-it/--tty) не поддерживается. Используйте kubectl exec … -- команду без -it.');
  return { executable, args: tokens };
}
module.exports = { parseCommand };
