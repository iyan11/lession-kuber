import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {lessons} from '../public/lessons.js';
import {requiredTopics} from '../public/professional/catalog.js';
import {professionalFiles} from '../public/professional/resources.js';
import {coverageRows,renderCoverage} from '../public/coverage-view.js';
import {renderLesson} from '../public/lesson-view.js';
import {simulate,createSimulation} from '../public/coach.js';
import {encrypt,decrypt,demo} from '../labs/security/envelope.mjs';
import {review} from '../labs/admission/handler.mjs';
import {save} from '../labs/storage/backup.mjs';
import {capacity,scale,choose} from '../labs/platform/decisions.mjs';
import {planArtifact} from '../labs/platform/operator.mjs';
const require=createRequire(import.meta.url),{parseCommand}=require('../desktop/command.cjs');

test('every audit item links to authored explanation, worked example and answer; original indices stay stable',()=>{
 assert.equal(requiredTopics.length,222);assert.equal(lessons.length,75);
 const rows=coverageRows(lessons);assert.equal(rows.filter(r=>!r.section).length,0);
 for(const row of rows){assert.equal(row.index,row.lessonNumber-1);assert.ok(row.section.paragraphs.length>=2,row.id);for(const key of ['example','mistake','assignment','solution'])assert.ok(row.section[key]?.length>20,row.id+' '+key);}
 const html=renderCoverage(lessons);assert.equal((html.match(/href="#lesson\//g)||[]).length,222);assert.match(html,/не подтверждает испытание/);
 for(const lesson of lessons.slice(38)){
  assert.deepEqual(lesson.coverageMissing,[]);assert.ok(lesson.requiresReal);assert.ok(lesson.goal&&lesson.before&&lesson.exercise&&lesson.answerExplanation);
  const rendered=renderLesson(lesson,lesson.number-1,lessons.length,false);
  for(const section of lesson.deepSections)assert.ok(rendered.includes(`id="${section.id}"`));
  for(const step of lesson.steps){assert.ok(step.why&&step.parts.length&&step.expected);if(step.executor==='external'){assert.ok(!lesson.commands.includes(step.command));continue;}const parsed=parseCommand(step.command);if(step.command.includes(' -- node -e '))assert.doesNotThrow(()=>new Function(parsed.args.at(-1)));}
 }
 assert.match(renderLesson(lessons[56],56,75,false),/Внешний терминал Windows/);
 assert.equal(simulate('kubectl --context kubelab-deep get nodes',createSimulation()).code,1);
});

test('pinned cluster versions exist in the reviewed compatibility set and match bundled kubectl minor',async()=>{
 const payload=JSON.parse(await readFile(new URL('../setup/payload.lock.json',import.meta.url),'utf8'));
 const clientMinor=Number(payload.packages.find(x=>x.id==='kubectl').version.split('.')[1]);
 const reviewed=new Set(['v1.35.5','v1.36.1']);
 for(const lesson of lessons.slice(38))for(const step of lesson.steps){const version=step.command.match(/--kubernetes-version=(v\d+\.\d+\.\d+)/)?.[1];if(version){assert.ok(reviewed.has(version),version);assert.ok(Math.abs(Number(version.split('.')[1])-clientMinor)<=1,version);}}
});

test('displayed examples are exact shipped files and YAML resources have valid object identities',async()=>{
 const packages=new URL('../node_modules/.pnpm/',import.meta.url);const entry=(await readdir(packages)).find(name=>name.startsWith('js-yaml@'));
 assert.ok(entry,'Builder dependency js-yaml must be installed for this check');const yaml=require(new URL(entry+'/node_modules/js-yaml',packages).pathname.replace(/^\/([A-Z]:)/,'$1'));
 const objects=[];
 for(const [name,text] of Object.entries(professionalFiles)){assert.equal(text,await readFile(new URL('../'+name,import.meta.url),'utf8'),name);if(name.startsWith('k8s/'))for(const object of yaml.loadAll(text)){assert.ok(object.apiVersion&&object.kind&&object.metadata?.name,name);objects.push(object);}}
 for(const object of objects){if(object.kind==='Deployment')assert.ok(object.spec.template.spec.containers.length);if(object.kind==='Service')assert.ok(object.spec.ports.length);}
 const policy=yaml.loadAll(professionalFiles['k8s/professional/admission-policy.yaml']);assert.ok(!policy.some(x=>x.kind==='Namespace'),'Policy cleanup must not delete the whole study namespace');
 const mesh=yaml.loadAll(professionalFiles['k8s/professional/mesh.yaml']);assert.ok(mesh.some(x=>x.kind==='Deployment'&&x.metadata.name==='mesh-server'));
});

test('envelope model authenticates both wrapped key and payload, including corruption',()=>{
 const key=randomBytes(32),plain=Buffer.from('fictional-only'),sealed=encrypt(key,plain);assert.deepEqual(decrypt(key,sealed),plain);
 const bad={...sealed,tag:randomBytes(16).toString('base64')};assert.throws(()=>decrypt(key,bad));assert.throws(()=>decrypt(randomBytes(32),sealed));assert.equal(demo().restored,true);
});

test('admission preserves uid and mutation becomes a no-op after the patch is applied',()=>{
 const input={request:{uid:'request-1',operation:'CREATE',kind:{kind:'Pod'},object:{spec:{containers:[{name:'a'},{name:'b',env:[{name:'OTHER',value:'keep'}]}]}}}};
 const result=review(input);assert.equal(result.response.uid,'request-1');assert.equal(result.response.patchType,'JSONPatch');
 const patch=JSON.parse(Buffer.from(result.response.patch,'base64'));
 for(const op of patch){const parts=op.path.split('/');const container=input.request.object.spec.containers[Number(parts[3])];if(parts.at(-1)==='env')container.env=op.value;else container.env.push(op.value);}
 assert.equal(review(input).response.patch,undefined);assert.equal(input.request.object.spec.containers[1].env[0].value,'keep');assert.throws(()=>review({}));
});

test('backup validates content, restores the same bytes, and rejects invalid input',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'kubelab-backup-'));
 try{const original=path.join(folder,'original.json'),copy=path.join(folder,'backup.json'),restored=path.join(folder,'restored.json');await writeFile(original,JSON.stringify({format:1,note:'fictional'}));assert.equal(await save(original,copy),await save(copy,restored));assert.deepEqual(await readFile(original),await readFile(restored));await writeFile(original,'{"format":2}');await assert.rejects(save(original,copy));}finally{await rm(folder,{recursive:true,force:true});}
});

test('capacity and scheduler respect hard constraints; operator refuses foreign ownership',()=>{
 assert.equal(capacity({allocatable:1800,reserve:300,request:250}),6);assert.throws(()=>capacity({allocatable:10,reserve:0,request:0}));
 assert.equal(scale({current:2,measured:90,target:60,min:1,max:5}),3);assert.equal(scale({current:4,measured:999,target:60,min:1,max:5}),5);
 assert.equal(choose([{name:'wrong',ready:true,os:'linux',freeCpu:2000,freeMemory:128}],{cpu:250,memory:256}),null);
 const parent={apiVersion:'learning.kubelab.local/v1',kind:'Workshop',metadata:{name:'demo',namespace:'kubelab-deep',uid:'owner',generation:2},spec:{name:'learning-artifact',replicas:2}};
 assert.throws(()=>planArtifact(parent,{metadata:{ownerReferences:[{uid:'other'}]}}),/foreign/);
 const output=planArtifact(parent,{metadata:{resourceVersion:'4',ownerReferences:[{uid:'owner'}]}});assert.equal(output.metadata.resourceVersion,'4');assert.equal(output.data.replicas,'2');
});

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
async function freePort(){const server=http.createServer();const port=await listen(server);await new Promise(r=>server.close(r));return port;}
async function waitFor(url){for(let i=0;i<100;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(100)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,25));}throw Error('Learning HTTP process did not become ready');}
test('two actual HTTP processes export three linked OTLP spans and safe logs and metrics',async()=>{
 const exports=[],collector=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);exports.push(JSON.parse(Buffer.concat(chunks)));res.setHeader('Content-Type','application/json');res.end('{}');});
 const port=await listen(collector),children=[],logs=[];
 try{
  const backend=await freePort(),frontend=await freePort();
  for(const [role,appPort] of [['backend',backend],['frontend',frontend]]){const child=spawn(process.execPath,['labs/telemetry/app.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(appPort),LAB_ROLE:role,OTLP_ENDPOINT:`http://127.0.0.1:${port}/v1/traces`,BACKEND_URL:role==='frontend'?`http://127.0.0.1:${backend}`:''},windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);child.stdout.on('data',chunk=>logs.push(String(chunk)));child.stderr.on('data',chunk=>logs.push(String(chunk)));await waitFor(`http://127.0.0.1:${appPort}/healthz`);}
  const response=await fetch(`http://127.0.0.1:${frontend}/work?private=must-not-be-logged`,{headers:{'x-request-id':'test-001',Authorization:'Bearer must-not-be-logged'}});const result=await response.json();assert.equal(response.status,200);
  for(let i=0;i<100&&exports.length<3;i++)await new Promise(r=>setTimeout(r,20));
  const spans=exports.flatMap(e=>e.resourceSpans.flatMap(r=>r.scopeSpans.flatMap(s=>s.spans))).filter(s=>s.traceId===result.traceId);assert.equal(spans.length,3);
  const root=spans.find(s=>!s.parentSpanId),client=spans.find(s=>s.kind===3),remote=spans.find(s=>s.parentSpanId===client.spanId);assert.equal(client.parentSpanId,root.spanId);assert.ok(remote);assert.equal(new Set(spans.map(s=>s.spanId)).size,3);
  const metrics=await(await fetch(`http://127.0.0.1:${frontend}/metrics`)).text();assert.match(metrics,/kubelab_requests_total\{service="frontend"\} 1/);assert.match(metrics,/le="\+Inf"\} 1/);
  assert.ok(!logs.join('').includes('must-not-be-logged'));assert.ok(logs.join('').includes(result.traceId));
 }finally{await Promise.all(children.map(child=>new Promise(resolve=>{child.once('exit',resolve);child.kill();})));await new Promise(r=>collector.close(r));}
});
