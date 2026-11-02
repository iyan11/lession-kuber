import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const packages=path.join(root,'node_modules/.pnpm'),entries=await readdir(packages);
const dep=name=>require(path.join(packages,entries.find(x=>x.startsWith(name.replace('/','+')+'@')),'node_modules',name));
const asar=dep('@electron/asar'),yaml=dep('js-yaml');
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const archive=path.join(root,'release/win-unpacked/resources/app.asar'),lab=path.join(root,'release/win-unpacked/resources/lab');
async function files(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);result.push(...(entry.isDirectory()?await files(target):[target]));}return result;}
let appCount=0,labCount=0;
for(const directory of ['public','desktop'])for(const file of await files(path.join(root,directory))){const relative=path.relative(root,file);assert.deepEqual(asar.extractFile(archive,relative),await readFile(file),relative);appCount++;}
assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version);
const expected=new Set(['package.json']);
for(const directory of ['public','k8s','charts','labs','examples'])for(const file of await files(path.join(root,directory))){const relative=path.relative(root,file);expected.add(relative);assert.deepEqual(await readFile(path.join(lab,relative)),await readFile(file),relative);labCount++;}
for(const name of ['Dockerfile','.dockerignore','server.mjs','lab-operator.mjs','lab-operator-model.mjs','scripts/Start-Lab.ps1','scripts/Seal-LearningSecret.ps1','docs/COURSE.md','docs/COURSE_REVIEW.md']){expected.add(path.normalize(name));assert.deepEqual(await readFile(path.join(lab,name)),await readFile(path.join(root,name)),name);labCount++;}
expected.add('README.md');assert.deepEqual(await readFile(path.join(lab,'README.md')),await readFile(path.join(root,'RUNNING.md')));
assert.deepEqual(new Set((await files(lab)).map(file=>path.relative(lab,file))),expected,'Unexpected or missing staged file');
const channel=version.match(/-(alpha|beta)/)?.[1]||'latest';
const raw=await readFile(path.join(root,`release/${channel}.yml`),'utf8');
assert.equal(raw,await readFile(path.join(root,'release/latest.yml'),'utf8'));
const metadata=yaml.load(raw);assert.equal(metadata.version,version);
const installer=path.join(root,'release',metadata.path),sha256=createHash('sha256'),sha512=createHash('sha512');
assert.equal((await stat(installer)).size,metadata.files[0].size);
for await(const chunk of createReadStream(installer)){sha256.update(chunk);sha512.update(chunk);}
assert.equal(sha512.digest('base64'),metadata.sha512);await stat(installer+'.blockmap');
const hash=sha256.digest('hex');await writeFile(path.join(root,'release/SHA256SUMS.txt'),`${hash}  ${path.basename(installer)}\n`);
console.log(JSON.stringify({version,appFiles:appCount,labFiles:labCount,sha256:hash,installer},null,2));
