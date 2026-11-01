const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { parseCommand } = require('./command.cjs');
const { toolDirectories, resolveTool } = require('./tools.cjs');
const { autoUpdater } = require('electron-updater');
const { Updates } = require('./updates.cjs');
const { Questions } = require('./questions.cjs');
const { questionFetch } = require('./question-network.cjs');
let win, child, killTimer;
let setupChild;
let workspace;
const page = pathToFileURL(path.join(__dirname, '../public/index.html')).href;
const trusted = event => event.sender === win?.webContents && event.senderFrame?.url.split('#')[0] === page;
function requireTrusted(event) { if (!trusted(event)) throw new Error('Untrusted sender'); }
function stop() {
  if (!child) return false;
  child.kill();
  return true;
}
app.whenReady().then(async () => {
  const { lessons } = await import('../public/lessons.js');
  const questions = new Questions({ file: path.join(app.getPath('userData'), 'questions-settings.bin'), legacyFile: path.join(app.getPath('userData'), 'questions-key.bin'), storage: safeStorage, lessons, fetcher: questionFetch });
  app.on('before-quit', () => questions.cancel());
  workspace = app.isPackaged ? path.join(process.resourcesPath, 'lab') : path.resolve(__dirname, '..');
  const resources = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
  const directories = toolDirectories(resources, app.isPackaged);
  win = new BrowserWindow({ width: 1440, height: 940, minWidth: 980, minHeight: 680, title: 'KubeLab', backgroundColor: '#0b1019', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(kubernetes\.io|minikube\.sigs\.k8s\.io|docs\.docker\.com)\//.test(url) || ['https://openrouter.ai/keys', 'https://openrouter.ai/settings/privacy', 'https://developers.sber.ru/docs/ru/gigachat/individuals-quickstart', 'https://developers.sber.ru/docs/ru/gigachat/certificates', 'https://developers.sber.ru/docs/ru/gigachat/tariffs/individual-tariffs', 'https://ollama.com/download/windows'].includes(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => { if (url.split('#')[0] !== page) event.preventDefault(); });
  const updates = new Updates(autoUpdater, { packaged: app.isPackaged, version: app.getVersion(), canInstall: () => !child && !setupChild });
  const questionResult = async action => { try { return { ok: true, value: await action() }; } catch (error) { return { ok: false, message: error.message }; } };
  ipcMain.handle('questions:state', event => { requireTrusted(event); return questionResult(() => questions.state()); });
  ipcMain.handle('questions:save', (event, input) => { requireTrusted(event); return questionResult(() => questions.saveKey(input)); });
  ipcMain.handle('questions:forget', event => { requireTrusted(event); return questionResult(() => questions.forget()); });
  ipcMain.handle('questions:ask', (event, input) => { requireTrusted(event); return questionResult(() => questions.ask(input)); });
  ipcMain.handle('questions:cancel', event => { requireTrusted(event); return questions.cancel(); });
  updates.on('state', state => {
    if (win.isDestroyed()) return;
    win.webContents.send('updates:state', state);
    win.setProgressBar(state.status === 'downloading' ? (state.percent === null ? 2 : state.percent / 100) : state.status === 'installing' ? 2 : -1);
  });
  ipcMain.handle('updates:state', event => { requireTrusted(event); return updates.state; });
  ipcMain.handle('updates:check', event => { requireTrusted(event); return updates.check(); });
  ipcMain.handle('updates:download', event => { requireTrusted(event); return updates.download(); });
  ipcMain.handle('updates:install', event => { requireTrusted(event); return updates.install(); });
  if (app.isPackaged) {
    setTimeout(() => updates.check(), 10000).unref();
    setInterval(() => updates.check(), 6 * 60 * 60 * 1000).unref();
  }
  ipcMain.handle('environment', event => { requireTrusted(event); return { workspace, platform: os.platform(), desktop: true }; });
  ipcMain.handle('workspace:choose', async event => {
    requireTrusted(event);
    if (child) throw new Error('Сначала остановите текущую команду.');
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: workspace });
    if (!result.canceled) workspace = result.filePaths[0];
    return workspace;
  });
  ipcMain.handle('cli:stop', event => { requireTrusted(event); return stop(); });
  ipcMain.handle('setup:open', event => {
    requireTrusted(event);
    if (setupChild) return { started: false };
    setupChild = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(resources, 'setup/Prerequisites.ps1')], { windowsHide: true, stdio: 'ignore' });
    setupChild.on('error', () => { setupChild = null; });
    setupChild.on('close', () => { setupChild = null; });
    return { started: true };
  });
  ipcMain.handle('cli:run', (event, command) => {
    requireTrusted(event);
    if (child) throw new Error('Другая команда уже выполняется. Остановите её кнопкой «Стоп».');
    const { executable, args } = parseCommand(command);
    const send = value => { if (!win.isDestroyed()) win.webContents.send('cli:output', value); };
    return new Promise(resolve => {
      let settled = false;
      const finish = (code, error) => {
        if (settled) return; settled = true;
        clearTimeout(killTimer); child = null;
        if (error) send({ stream: 'stderr', text: error });
        send({ done: true, code }); resolve({ code });
      };
      try {
        const binary = process.platform === 'win32' ? resolveTool(executable, directories) : executable;
        child = spawn(binary, args, { cwd: workspace, env: { ...process.env, PATH: [...directories, process.env.PATH || ''].join(path.delimiter) }, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', text => send({ stream: 'stdout', text }));
        child.stderr.on('data', text => send({ stream: 'stderr', text }));
        child.on('error', error => finish(1, error.code === 'ENOENT' ? `${executable} не найден в PATH. Установите инструмент и перезапустите KubeLab.` : error.message));
        child.on('close', code => finish(code ?? 1));
        killTimer = setTimeout(() => { send({ stream: 'stderr', text: '\nЛимит выполнения 15 минут. Команда остановлена; при необходимости запустите снова.\n' }); stop(); }, 15 * 60 * 1000);
      } catch (error) { finish(1, error.message); }
    });
  });
  win.loadFile(path.join(__dirname, '../public/index.html'));
});
app.on('before-quit', stop);
app.on('window-all-closed', () => app.quit());
