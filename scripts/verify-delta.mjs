// Reconstruct a new installer from old blocks + changed bytes without running it.
import { open, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const updaterRequire = createRequire(require.resolve('electron-updater'));
const { computeOperations } = updaterRequire('./differentialDownloader/downloadPlanBuilder');
const [oldFile, newFile] = process.argv.slice(2);
if (!oldFile || !newFile) throw new Error('Usage: node scripts/verify-delta.mjs old.exe new.exe');
const oldMap = JSON.parse(gunzipSync(await readFile(oldFile + '.blockmap')));
const newMap = JSON.parse(gunzipSync(await readFile(newFile + '.blockmap')));
const operations = computeOperations(oldMap, newMap, { info() {}, warn() {} });
const oldHandle = await open(oldFile, 'r'), newHandle = await open(newFile, 'r');
const rebuilt = createHash('sha512'), actual = createHash('sha512');
let reused = 0, downloaded = 0;
async function digestRange(handle, start, end, digest) {
  const buffer = Buffer.alloc(65536);
  for (let at = start; at < end;) { const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, end - at), at); if (!bytesRead) throw new Error('Unexpected EOF'); digest.update(buffer.subarray(0, bytesRead)); at += bytesRead; }
}
try {
  for (const op of operations) {
    await digestRange(op.kind === 0 ? oldHandle : newHandle, op.start, op.end, rebuilt);
    if (op.kind === 0) reused += op.end - op.start; else downloaded += op.end - op.start;
  }
  const size = (await stat(newFile)).size;
  await digestRange(newHandle, 0, size, actual);
  if (reused + downloaded !== size || rebuilt.digest('hex') !== actual.digest('hex')) throw new Error('Differential reconstruction mismatch');
  console.log(JSON.stringify({ verified: true, size, reused, changedBytes: downloaded, reusedPercent: Number((reused / size * 100).toFixed(2)) }));
} finally { await oldHandle.close(); await newHandle.close(); }
