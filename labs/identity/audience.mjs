import {createKubeClient} from '../lib/kube.mjs';
import {readFile} from 'node:fs/promises';
const mode=process.argv[2];
if(mode==='inspect'){
 const token=await readFile('/token/token','utf8');const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
 console.log(JSON.stringify({audience:payload.aud,subject:payload.sub,lifetimeSeconds:payload.exp-payload.iat,note:'Decoded fields are not signature verification'}));
}else if(mode==='review'){
 const kube=await createKubeClient();const token=await readFile('/token/token','utf8');
 for(const audience of ['kubelab-learning-service','wrong-learning-audience']){
  const result=await kube.request('POST','/apis/authentication.k8s.io/v1/tokenreviews',{apiVersion:'authentication.k8s.io/v1',kind:'TokenReview',spec:{token,audiences:[audience]}});
  console.log(JSON.stringify({requestedAudience:audience,authenticated:result.status?.authenticated===true,audiences:result.status?.audiences||[]}));
 }
}else throw Error('Choose inspect or review');
