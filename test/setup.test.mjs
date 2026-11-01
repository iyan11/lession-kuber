import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const { resolveTool } = createRequire(import.meta.url)('../desktop/tools.cjs');

test('CLI discovery keeps a compatible installed tool and uses bundled fallback for an incompatible tool', () => {
  const installed = 'C:\\Tools\\kubectl.exe';
  const fallback = 'payload\\kubectl.exe';
  const mock = minor => ({ exists: file => [installed, fallback].includes(file), run: (file) => file === 'where.exe' ? { status: 0, stdout: installed } : { status: 0, stdout: JSON.stringify({ clientVersion: { gitVersion: `v1.${minor}.1` } }) } });
  assert.equal(resolveTool('kubectl', ['payload'], mock(36)), installed);
  assert.equal(resolveTool('kubectl', ['payload'], mock(34)), fallback);
});

test('Docker is external-only and cannot be included by the package resource filter', async () => {
  const lock = JSON.parse(await readFile(new URL('../setup/payload.lock.json', import.meta.url)));
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(lock.packages.find(p => p.id === 'docker').bundled, false);
  const resource = pkg.build.extraResources.find(p => p.from === 'payload');
  assert.deepEqual(resource.filter.sort(), ['kubectl.exe', 'minikube.exe', 'wsl.x64.msi']);
  for (const p of lock.packages) assert.match(p.sha256, /^[a-f0-9]{64}$/);
});

test('Windows PowerShell 5 parses the actual installer and reads localized WSL versions without running setup', { skip: process.platform !== 'win32' }, () => {
  const result = spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ". './setup/Prerequisites.ps1' -LibraryOnly; if ((Get-VersionNumber 'WSL version: 2.7.10.0') -ne [version]'2.7.10.0') { exit 1 }; if ((Get-VersionNumber 'not installed') -ne [version]'0.0.0') { exit 2 }; Write-Output 'read-only helper test passed'"], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
});

test('completed setup distinguishes installed software from a stopped Docker engine and pending reboot', { skip: process.platform !== 'win32' }, () => {
  const code = ". './setup/Prerequisites.ps1' -LibraryOnly; $s=[pscustomobject]@{WslReady=$true;DockerDesktop='installed';DockerEngineReady=$false;MinikubeBundled=$true;KubectlBundled=$true}; $view=Get-SetupView $s; if($view.Phase -ne 'complete'){exit 1}; if((Get-SetupView $s $true).Phase -ne 'restart'){exit 2}; $s.WslReady=$false; if((Get-SetupView $s).Phase -ne 'missing'){exit 3}; Write-Output 'setup states passed'";
  const result = spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', code], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
});
