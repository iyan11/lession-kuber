const { EventEmitter } = require('node:events');
class Updates extends EventEmitter {
  constructor(updater, { packaged, version, canInstall }) {
    super(); this.updater = updater; this.packaged = packaged; this.canInstall = canInstall;
    this.state = { status: packaged ? 'idle' : 'disabled', currentVersion: version, version: '', percent: 0, message: packaged ? 'Проверка релизов GitHub' : 'Обновления доступны в установленном приложении.' };
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = version.includes('-');
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    updater.on('checking-for-update', () => this.set({ status: 'checking', message: 'Проверяем релизы GitHub…' }));
    updater.on('update-available', info => this.set({ status: 'available', version: info.version, message: `Доступна версия ${info.version}` }));
    updater.on('update-not-available', () => this.set({ status: 'current', message: 'Установлена актуальная версия.' }));
    updater.on('download-progress', info => this.set({ status: 'downloading', percent: Math.max(0, Math.min(100, info.percent || 0)), message: 'Скачиваем обновление…' }));
    updater.on('update-downloaded', info => this.set({ status: 'ready', version: info.version, percent: 100, message: 'Обновление проверено и готово к установке.' }));
    updater.on('error', error => this.set({ status: 'error', message: `Не удалось обновиться: ${error.message}`.slice(0, 700) }));
  }
  set(patch) { this.state = { ...this.state, ...patch }; this.emit('state', { ...this.state }); }
  async check() {
    if (!this.packaged || ['checking', 'downloading', 'ready', 'installing'].includes(this.state.status)) return this.state;
    this.set({ status: 'checking', message: 'Проверяем релизы GitHub…', percent: 0 });
    try { await this.updater.checkForUpdates(); } catch (error) { this.set({ status: 'error', message: `Проверка не выполнена: ${error.message}`.slice(0, 700) }); }
    return this.state;
  }
  async download() {
    if (!this.packaged || this.state.status !== 'available') return this.state;
    this.set({ status: 'downloading', message: 'Скачиваем обновление…', percent: 0 });
    try { await this.updater.downloadUpdate(); } catch (error) { this.set({ status: 'error', message: `Загрузка не выполнена: ${error.message}`.slice(0, 700) }); }
    return this.state;
  }
  install() {
    if (!this.packaged || this.state.status !== 'ready') throw new Error('Сначала скачайте обновление.');
    if (!this.canInstall()) throw new Error('Сначала остановите команду и закройте мастер подготовки системы.');
    this.set({ status: 'installing', message: 'Устанавливаем обновление и перезапускаем KubeLab…' });
    try { this.updater.quitAndInstall(true, true); }
    catch (error) { this.set({ status: 'error', message: `Установка не выполнена: ${error.message}` }); throw error; }
    return this.state;
  }
}
module.exports = { Updates };
