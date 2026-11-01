const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
function toolDirectories(resources, packaged) {
  const result = [packaged ? path.join(resources, 'setup/payload') : path.join(resources, 'payload')];
  if (process.env.LOCALAPPDATA) result.push(path.join(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin'));
  if (process.env.ProgramFiles) result.push(path.join(process.env.ProgramFiles, 'Docker/Docker/resources/bin'));
  return result;
}
function resolveTool(tool, directories, dependencies = {}) {
  const exists = dependencies.exists || existsSync;
  const run = dependencies.run || spawnSync;
  const found = run('where.exe', [`${tool}.exe`], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  const candidate = found.status === 0 ? found.stdout.trim().split(/\r?\n/).find(x => exists(x)) : null;
  // Keep a compatible installed CLI. Fall back to our private bundled copy.
  if (candidate && ['minikube', 'kubectl'].includes(tool)) {
    const args = tool === 'minikube' ? ['version', '--short'] : ['version', '--client', '-o', 'json'];
    const version = run(candidate, args, { encoding: 'utf8', windowsHide: true, timeout: 12000 });
    const match = version.stdout?.match(/v?(\d+)\.(\d+)\.(\d+)/);
    if (version.status === 0 && match && Number(match[1]) === 1 && (tool === 'minikube' ? Number(match[2]) >= 39 : [36, 37, 38].includes(Number(match[2])))) return candidate;
  } else if (candidate) return candidate;
  return directories.map(dir => path.join(dir, `${tool}.exe`)).find(exists) || candidate || `${tool}.exe`;
}
module.exports = { toolDirectories, resolveTool };
