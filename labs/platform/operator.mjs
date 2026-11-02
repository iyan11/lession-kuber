import {createKubeClient} from '../lib/kube.mjs';
import {desired} from './decisions.mjs';
let kube,prefix,core;
const finalizer='learning.kubelab.local/artifact';
export function planArtifact(parent,existing){
 const spec=desired(parent),uid=parent.metadata.uid;
 if(existing&&!existing.metadata?.ownerReferences?.some(owner=>owner.uid===uid))throw Error('Refusing foreign object');
 return {apiVersion:'v1',kind:'ConfigMap',metadata:{name:spec.name,namespace:parent.metadata.namespace,...(existing?{resourceVersion:existing.metadata.resourceVersion}:{}),ownerReferences:[{apiVersion:parent.apiVersion,kind:parent.kind,name:parent.metadata.name,uid,controller:true,blockOwnerDeletion:false}]},data:{replicas:String(spec.replicas)}};
}
async function optional(path){try{return await kube.request('GET',path);}catch(e){if(e.status===404)return null;throw e;}}
export async function reconcile(parent){
 const path=prefix+'/'+encodeURIComponent(parent.metadata.name),target=core+'/'+encodeURIComponent(parent.spec.name),existing=await optional(target);
 const owned=existing?.metadata?.ownerReferences?.some(x=>x.uid===parent.metadata.uid);
 if(parent.metadata.deletionTimestamp){
  if(existing&&!owned)throw Error('Refusing foreign cleanup');
  if(owned)await kube.request('DELETE',target,{apiVersion:'v1',kind:'DeleteOptions',preconditions:{uid:existing.metadata.uid,resourceVersion:existing.metadata.resourceVersion}});
  await kube.request('PATCH',path,{metadata:{resourceVersion:parent.metadata.resourceVersion,finalizers:(parent.metadata.finalizers||[]).filter(x=>x!==finalizer)}},'application/merge-patch+json');return;
 }
 if(!(parent.metadata.finalizers||[]).includes(finalizer)){
  await kube.request('PATCH',path,{metadata:{resourceVersion:parent.metadata.resourceVersion,finalizers:[...(parent.metadata.finalizers||[]),finalizer]}},'application/merge-patch+json');return;
 }
 const artifact=planArtifact(parent,existing);
 if(!existing)await kube.request('POST',core,artifact);
 else if(existing.data?.replicas!==artifact.data.replicas)await kube.request('PUT',target,artifact);
 const status={observedGeneration:parent.metadata.generation,ready:true,artifact:parent.spec.name};
 if(JSON.stringify(parent.status)!==JSON.stringify(status))await kube.request('PATCH',path+'/status',{metadata:{resourceVersion:parent.metadata.resourceVersion},status},'application/merge-patch+json');
}
async function main(){kube=await createKubeClient();prefix='/apis/learning.kubelab.local/v1/namespaces/'+kube.namespace+'/workshops';core='/api/v1/namespaces/'+kube.namespace+'/configmaps';while(true){try{const list=await kube.request('GET',prefix);for(const item of list.items||[])try{await reconcile(item);}catch(e){console.error('Reconcile failed:',e.status||'validation');}}catch(e){console.error('List failed:',e.status||'network');}await new Promise(r=>setTimeout(r,3000));}}
if(process.argv[2]==='run')await main();
