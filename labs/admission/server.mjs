import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { review } from './handler.mjs';
const [key,cert]=await Promise.all([readFile('/tls/tls.key'),readFile('/tls/tls.crt')]);
const server=https.createServer({key,cert},async(req,res)=>{
 if(req.url==='/healthz'){res.end('ok');return;}
 if(req.method!=='POST'||req.url!=='/mutate'){res.writeHead(404);res.end();return;}
 const chunks=[];let bytes=0;
 try{
  for await(const chunk of req){bytes+=chunk.length;if(bytes>1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const result=review(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
 }catch{res.writeHead(400);res.end('Invalid AdmissionReview');}
});
server.listen(8443,'0.0.0.0',()=>console.log('Learning admission handler ready'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
