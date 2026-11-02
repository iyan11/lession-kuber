import http from 'node:http';
let ready=true,closing=false;
const started=Date.now();
const server=http.createServer((req,res)=>{
 if(req.url==='/healthz'){res.end('alive');return;}
 if(req.url==='/startup'){res.statusCode=Date.now()-started>=5000?200:503;res.end('startup');return;}
 if(req.url==='/readyz'){res.statusCode=ready&&!closing?200:503;res.end('ready');return;}
 // Only this isolated learning server has a switch. Do not add it to a public production service.
 if(req.url==='/learning/not-ready'&&req.method==='POST'){ready=false;res.end('learning readiness disabled');return;}
 if(req.url==='/learning/ready'&&req.method==='POST'){ready=true;res.end('learning readiness enabled');return;}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:process.env.APP_VERSION||'blue',ready,closing}));
});
server.listen(3000,'0.0.0.0');
process.on('SIGTERM',()=>{closing=true;ready=false;console.log('SIGTERM: stop accepting new requests, drain existing connections');server.close(()=>{console.log('drained');process.exit(0);});setTimeout(()=>process.exit(1),8000).unref();});
