// Bounded requests to named learning services. Never prints response bodies from secret stores.
const base='http://deep-web:3000';
const mode=process.argv[2];
const get=async(url)=>{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('HTTP '+r.status);return r;};
if(mode==='load'){
 for(let i=0;i<100;i++){await fetch(base+'/work?'+(i%5===0?'fail=1':'delay=20'),{signal:AbortSignal.timeout(3000)});await new Promise(r=>setTimeout(r,100));}console.log('100 learning requests completed');
}else if(mode==='push-log'){
 const record={time:new Date().toISOString(),event:'learning_request',requestId:'learning-001',status:500};
 const r=await fetch('http://deep-loki:3100/loki/api/v1/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({streams:[{stream:{job:'kubelab-learning',namespace:'kubelab-deep'},values:[[(BigInt(Date.now())*1000000n).toString(),JSON.stringify(record)]]}]}),signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Push HTTP '+r.status);console.log('One fictional structured record accepted');
}else if(mode==='logs'){
 const q=new URL('http://deep-loki:3100/loki/api/v1/query_range');q.searchParams.set('query','{job="kubelab-learning"}');q.searchParams.set('limit','5');console.log(JSON.stringify(await(await get(q)).json(),null,2));
}else if(mode==='metrics'){
 const q=new URL('http://deep-prometheus:9090/api/v1/query');q.searchParams.set('query',process.argv[3]||'up');console.log(JSON.stringify(await(await get(q)).json(),null,2));
}else if(mode==='alerts')console.log(JSON.stringify(await(await get('http://deep-prometheus:9090/api/v1/alerts')).json(),null,2));
else if(mode==='trace'){
 const r=await(await get('http://deep-frontend:3000/work')).json();console.log('traceId='+r.traceId);await new Promise(r=>setTimeout(r,5000));console.log(JSON.stringify(await(await get('http://deep-tempo:3200/api/traces/'+r.traceId)).json(),null,2));
}else throw Error('Choose load, push-log, logs, metrics, alerts or trace');
