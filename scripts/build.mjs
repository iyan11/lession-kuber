import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const payload = JSON.parse(await readFile(path.join(root, 'setup/payload.lock.json'), 'utf8'));
for (const entry of payload.packages) {
  if (entry.bundled === false) continue;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path.join(root, 'payload', entry.file))) hash.update(chunk);
  if (hash.digest('hex') !== entry.sha256) throw new Error(`Offline payload checksum mismatch: ${entry.file}`);
}
const lab = path.join(root, '.lab');
await mkdir(lab, { recursive: true });
for (const name of ['public', 'k8s', 'charts', 'Dockerfile', '.dockerignore', 'server.mjs', 'lab-operator.mjs', 'lab-operator-model.mjs']) {
  await cp(path.join(root, name), path.join(lab, name), { recursive: true });
}
await mkdir(path.join(lab, 'scripts'), { recursive: true });
await cp(path.join(root, 'scripts/Start-Lab.ps1'), path.join(lab, 'scripts/Start-Lab.ps1'));
await cp(path.join(root, 'RUNNING.md'), path.join(lab, 'README.md'));
await mkdir(path.join(lab, 'docs'), { recursive: true });
await cp(path.join(root, 'docs/COURSE.md'), path.join(lab, 'docs/COURSE.md'));
await writeFile(path.join(lab, 'package.json'), JSON.stringify({ name: 'kubelab-workload', private: true, type: 'module', scripts: { start: 'node server.mjs', web: 'node server.mjs' } }, null, 2));
// Stage lab resources separately so electron-builder cannot exclude the desktop
// package.json as an overlapping extraResource.
const builder = path.join(path.dirname(require.resolve('electron-builder/package.json')), 'cli.js');
const electronDist = path.dirname(require('electron'));
const child = spawn(process.execPath, [builder, '--win', 'nsis', '--x64', '--publish', 'never', `--config.electronDist=${electronDist}`], { cwd: root, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', async code => {
  process.exitCode = code ?? 1;
  if (code !== 0) return;
  try {
    const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const channel = version.match(/-(alpha|beta)(?:\.|$)/)?.[1];
    if (channel) await cp(path.join(root, 'release/latest.yml'), path.join(root, `release/${channel}.yml`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
});
