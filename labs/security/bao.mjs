import { readFile,writeFile,rename } from 'node:fs/promises';
const address='http://deep-bao:8200';
const learningRoot='kubelab-fictional-root';
export async function api(path,body,token,fetcher=fetch){const response=await fetcher(address+'/v1/'+path,{method:body===undefined?'GET':'POST',headers:{...(token?{'X-Vault-Token':token}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(3000)});const text=await response.text();return {status:response.status,data:text?JSON.parse(text):{}};}
const requireOK=result=>{if(result.status<200||result.status>=300)throw Error('Secret service HTTP '+result.status);return result.data;};
export async function setup(){
 requireOK(await api('secret/data/application',{data:{DEMO_TOKEN:'fictional-generation-one'}},learningRoot));
 requireOK(await api('sys/policies/acl/application-read',{policy:'path "secret/data/application" { capabilities = ["read"] }'},learningRoot));
 const enabled=await api('sys/auth/kubernetes',{type:'kubernetes'},learningRoot);if(![200,204,400].includes(enabled.status))requireOK(enabled);
 requireOK(await api('auth/kubernetes/config',{kubernetes_host:'https://kubernetes.default.svc:443'},learningRoot));
 requireOK(await api('auth/kubernetes/role/application',{bound_service_account_names:['deep-reader'],bound_service_account_namespaces:['kubelab-deep'],audience:'bao',token_policies:['application-read'],token_ttl:'60s',token_max_ttl:'5m'},learningRoot));
 console.log(JSON.stringify({event:'learning_secret_service_configured'}));
}
export async function exercise(){
 const created=requireOK(await api('auth/token/create',{policies:['application-read'],no_default_policy:true,ttl:'60s'},learningRoot));
 const token=created.auth.client_token;
 const read=await api('secret/data/application',undefined,token);
 const denied=await api('secret/data/application',{data:{DEMO_TOKEN:'should-not-write'}},token);
 requireOK(await api('auth/token/revoke',{token},learningRoot));
 const revoked=await api('secret/data/application',undefined,token);
 console.log(JSON.stringify({readStatus:read.status,writeStatus:denied.status,revokedStatus:revoked.status}));
 if(read.status!==200||denied.status!==403||revoked.status!==403)throw Error('Permission exercise did not meet expected results');
}
export async function copySecret(){
 const jwt=(await readFile('/identity/token','utf8')).trim();
 const login=requireOK(await api('auth/kubernetes/login',{role:'application',jwt}));
 const result=requireOK(await api('secret/data/application',undefined,login.auth.client_token));
 const value=result.data.data.DEMO_TOKEN;if(typeof value!=='string'||value.length>4096)throw Error('Unexpected learning value');
 await writeFile('/config/DEMO_TOKEN.tmp',value,{mode:0o600});await rename('/config/DEMO_TOKEN.tmp','/config/DEMO_TOKEN');
}
if(process.argv[2]==='setup')await setup();
if(process.argv[2]==='exercise')await exercise();
if(process.argv[2]==='rotate'){requireOK(await api('secret/data/application',{data:{DEMO_TOKEN:'fictional-generation-two'}},learningRoot));console.log('Learning version changed');}
if(process.argv[2]==='agent'){let stopped=false;process.on('SIGTERM',()=>{stopped=true;});while(!stopped){try{await copySecret();}catch{console.error(JSON.stringify({event:'learning_secret_fetch_failed'}));}await new Promise(r=>setTimeout(r,5000));}}
