import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { Updates } = createRequire(import.meta.url)('../desktop/updates.cjs');
class FakeUpdater extends EventEmitter {
  checks = 0; downloads = 0; installs = 0;
  async checkForUpdates() { this.checks++; this.emit('update-available', { version: '0.1.0-alpha.3' }); }
  async downloadUpdate() { this.downloads++; this.emit('download-progress', { percent: 50 }); this.emit('update-downloaded', { version: '0.1.0-alpha.3' }); }
  quitAndInstall() { this.installs++; }
}
test('updates require explicit download/install and reject installation during an active CLI command', async () => {
  const fake = new FakeUpdater(); let commandRunning = true;
  const updates = new Updates(fake, { packaged: true, version: '0.1.0-alpha.2', canInstall: () => !commandRunning });
  assert.equal(fake.autoDownload, false); assert.equal(fake.autoInstallOnAppQuit, false); assert.equal(fake.allowDowngrade, false);
  await updates.check(); assert.equal(updates.state.status, 'available'); assert.equal(fake.downloads, 0);
  assert.throws(() => updates.install(), /скачайте/);
  await updates.download(); assert.equal(updates.state.status, 'ready'); assert.equal(fake.installs, 0);
  await updates.check(); assert.equal(fake.checks, 1);
  assert.throws(() => updates.install(), /остановите/);
  commandRunning = false; updates.install(); assert.equal(fake.installs, 1);
});
test('offline errors remain visible and development mode never checks the release server', async () => {
  const fake = new FakeUpdater();
  const dev = new Updates(fake, { packaged: false, version: '0.1.0-alpha.2', canInstall: () => true });
  await dev.check(); assert.equal(fake.checks, 0); assert.equal(dev.state.status, 'disabled');
  const network = new FakeUpdater(); network.checkForUpdates = async () => { throw new Error('offline'); };
  const updates = new Updates(network, { packaged: true, version: '0.1.0', canInstall: () => true });
  await updates.check(); assert.equal(updates.state.status, 'error'); assert.match(updates.state.message, /offline/); assert.equal(network.allowPrerelease, false);
});
