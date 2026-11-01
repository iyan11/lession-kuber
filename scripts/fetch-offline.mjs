import { readFile, mkdir, rename, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'setup/payload.lock.json'), 'utf8'));
const target = path.join(root, 'payload');
await mkdir(target, { recursive: true });
async function hash(file) { const h = createHash('sha256'); for await (const c of createReadStream(file)) h.update(c); return h.digest('hex'); }
for (const entry of manifest.packages) {
  if (entry.bundled === false) { console.log(`External download only: ${entry.id}`); continue; }
  const file = path.join(target, entry.file);
  if (await stat(file).catch(() => null)) {
    if (await hash(file) === entry.sha256) { console.log(`Verified cache: ${entry.id} ${entry.version}`); continue; }
    throw new Error(`Checksum mismatch in existing ${entry.file}; remove this file before retrying.`);
  }
  console.log(`Downloading official ${entry.id} ${entry.version}...`);
  const response = await fetch(entry.url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${entry.url}`);
  let received = 0, last = 0;
  const progress = new Transform({ transform(chunk, _encoding, done) { received += chunk.length; if (Date.now() - last > 12000) { console.log(`${entry.id}: ${Math.round(received / 1048576)} MiB`); last = Date.now(); } done(null, chunk); } });
  const partial = file + '.partial';
  await pipeline(response.body, progress, createWriteStream(partial));
  if (await hash(partial) !== entry.sha256) throw new Error(`SHA-256 verification failed: ${entry.id}`);
  await rename(partial, file);
  console.log(`SHA-256 verified: ${entry.id}`);
}
console.log('All offline payloads verified. No software was installed on this computer.');
