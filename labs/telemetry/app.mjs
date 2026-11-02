import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
const role = process.env.LAB_ROLE === 'backend' ? 'backend' : 'frontend';
const endpoint = process.env.OTLP_ENDPOINT || '';
const backend = process.env.BACKEND_URL || '';
const pending = new Set();
const counters = { total: 0, errors: 0, sum: 0, buckets: new Map([.01,.05,.1,.5,1,5].map(x=>[x,0])) };
const id = length => randomBytes(length).toString('hex');
const now = () => BigInt(Date.now()) * 1000000n;
const incoming = value => typeof value==='string' ? value.match(/^00-((?!0{32})[a-f0-9]{32})-((?!0{16})[a-f0-9]{16})-[a-f0-9]{2}$/) : null;
export function otlpSpan({ traceId, spanId, parentSpanId, name, kind, start, end, status }) {
  return { traceId, spanId, ...(parentSpanId ? {parentSpanId}:{}), name, kind, startTimeUnixNano:String(start), endTimeUnixNano:String(end), attributes:[{key:'http.response.status_code',value:{intValue:String(status)}}], status:{code:status>=500?2:1} };
}
async function emit(span) {
  if(!endpoint)return;
  const data={resourceSpans:[{resource:{attributes:[{key:'service.name',value:{stringValue:role}},{key:'service.namespace',value:{stringValue:'kubelab-deep'}}]},scopeSpans:[{scope:{name:'kubelab-manual-example',version:'1'},spans:[span]}]}]};
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw Error('Collector rejected telemetry');
}
function send(span){const work=emit(span).catch(()=>console.error(JSON.stringify({event:'telemetry_export_error'})));pending.add(work);work.finally(()=>pending.delete(work));}
function metrics(){
  const lines=['# TYPE kubelab_requests_total counter',`kubelab_requests_total{service="${role}"} ${counters.total}`,'# TYPE kubelab_errors_total counter',`kubelab_errors_total{service="${role}"} ${counters.errors}`,'# TYPE kubelab_duration_seconds histogram'];
  for(const [limit,value] of counters.buckets)lines.push(`kubelab_duration_seconds_bucket{service="${role}",le="${limit}"} ${value}`);
  lines.push(`kubelab_duration_seconds_bucket{service="${role}",le="+Inf"} ${counters.total}`,`kubelab_duration_seconds_count{service="${role}"} ${counters.total}`,`kubelab_duration_seconds_sum{service="${role}"} ${counters.sum}`);
  return lines.join('\n')+'\n';
}
export function createApp() {
 return http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  if(url.pathname==='/metrics'){res.setHeader('Content-Type','text/plain; version=0.0.4');res.end(req.method==='HEAD'?undefined:metrics());return;}
  if(['/healthz','/readyz'].includes(url.pathname)){res.end('ok');return;}
  if(!['/work','/api/runtime','/'].includes(url.pathname)){res.writeHead(404);res.end();return;}
  const context=incoming(req.headers.traceparent),traceId=context?.[1]||id(16),parentSpanId=context?.[2],spanId=id(8),start=now();
  const provided=req.headers['x-request-id'];const requestId=typeof provided==='string'&&/^[A-Za-z0-9-]{1,64}$/.test(provided)?provided:randomUUID();
  const delay=Math.max(0,Math.min(250,Number(url.searchParams.get('delay'))||0));
  let status=url.searchParams.get('fail')==='1'?500:200,upstream=null;
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  if(backend&&role==='frontend'){
   const child=id(8),began=now();
   try{
    const target=new URL('/work',backend);if(url.searchParams.get('fail')==='1')target.searchParams.set('fail','1');
    const response=await fetch(target,{headers:{traceparent:`00-${traceId}-${child}-01`,'x-request-id':requestId},signal:AbortSignal.timeout(2000)});upstream=response.status;if(upstream>=500)status=502;
    send(otlpSpan({traceId,spanId:child,parentSpanId:spanId,name:'backend request',kind:3,start:began,end:now(),status:upstream}));
   }catch{status=502;send(otlpSpan({traceId,spanId:child,parentSpanId:spanId,name:'backend request',kind:3,start:began,end:now(),status:502}));}
  }
  const end=now(),duration=Number(end-start)/1e9;counters.total++;if(status>=500)counters.errors++;counters.sum+=duration;for(const limit of counters.buckets.keys())if(duration<=limit)counters.buckets.set(limit,counters.buckets.get(limit)+1);
  send(otlpSpan({traceId,spanId,parentSpanId,name:`${role} request`,kind:2,start,end,status}));
  console.log(JSON.stringify({time:new Date().toISOString(),event:'request',service:role,pod:process.env.POD_NAME||hostname(),requestId,traceId,status,durationSeconds:duration}));
  res.writeHead(status,{'Content-Type':'application/json','X-Request-ID':requestId});res.end(req.method==='HEAD'?undefined:JSON.stringify({service:role,pod:process.env.POD_NAME||hostname(),traceId,requestId,upstream,status}));
 });
}
if(process.argv[1]&&new URL(import.meta.url).pathname.replace(/^\//,'').endsWith(process.argv[1].replaceAll('\\','/').replace(/^\//,''))){
 const server=createApp().listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Learning service ${role} started`));
 process.on('SIGTERM',()=>server.close(async()=>{await Promise.allSettled([...pending]);process.exit(0);}));
}
