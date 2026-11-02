export function review(value){
 const request=value?.request;if(typeof request?.uid!=='string')throw Error('Admission request uid is required');
 const response={uid:request.uid,allowed:true};
 const object=request.object;
 if(request.operation==='CREATE'&&request.kind?.kind==='Pod'&&Array.isArray(object?.spec?.containers)){
  const patches=[];
  object.spec.containers.forEach((container,index)=>{
   const variables=container.env||[];
   if(variables.some(x=>x.name==='KUBELAB_ADMITTED'))return;
   if(!container.env)patches.push({op:'add',path:`/spec/containers/${index}/env`,value:[]});
   patches.push({op:'add',path:`/spec/containers/${index}/env/-`,value:{name:'KUBELAB_ADMITTED',value:'yes'}});
  });
  if(patches.length){response.patchType='JSONPatch';response.patch=Buffer.from(JSON.stringify(patches)).toString('base64');}
 }
 return {apiVersion:'admission.k8s.io/v1',kind:'AdmissionReview',response};
}
