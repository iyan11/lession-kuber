import https from 'node:https';
import { readFile } from 'node:fs/promises';
export async function createKubeClient() {
  const directory = '/var/run/secrets/kubernetes.io/serviceaccount/';
  const namespace = (await readFile(directory + 'namespace', 'utf8')).trim();
  if (namespace !== 'kubelab-deep') throw new Error('This exercise only operates in namespace kubelab-deep.');
  const ca = await readFile(directory + 'ca.crt');
  const request = async (method, pathname, data, contentType = 'application/json') => {
    const token = (await readFile(directory + 'token', 'utf8')).trim();
    const body = data === undefined ? undefined : JSON.stringify(data);
    return new Promise((resolve,reject) => {
      const req = https.request({ hostname: 'kubernetes.default.svc', port: 443, path: pathname, method, ca, timeout: 5000, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? {'Content-Type':contentType,'Content-Length':Buffer.byteLength(body)} : {}) } }, res => {
        let size=0; const chunks=[];
        res.on('error',reject); res.on('data',chunk=>{size+=chunk.length;if(size>1024*1024)res.destroy(new Error('Response too large'));else chunks.push(chunk);});
        res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300){const error=new Error('Kubernetes API rejected request');error.status=res.statusCode;reject(error);return;}try{resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch{reject(new Error('Invalid API response'));}});
      });
      req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('API timeout')));if(body)req.write(body);req.end();
    });
  };
  return { namespace, request };
}
