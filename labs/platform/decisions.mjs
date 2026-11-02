// Small executable calculations, not a replacement for the Kubernetes scheduler or autoscaler.
export function capacity({allocatable,reserve,request}){
 for(const value of [allocatable,reserve,request])if(!Number.isFinite(value)||value<0)throw Error('Expected nonnegative finite capacity');
 if(request===0||reserve>allocatable)throw Error('Invalid request or reserve');
 return Math.floor((allocatable-reserve)/request);
}
export function scale({current,measured,target,min,max}){
 if(![current,measured,target,min,max].every(Number.isFinite)||target<=0||min<1||max<min||current<1||measured<0)throw Error('Invalid scaling inputs');
 return Math.max(min,Math.min(max,Math.ceil(current*measured/target)));
}
export function choose(nodes,{cpu,memory,os='linux'}){
 if(!Number.isFinite(cpu)||cpu<=0||!Number.isFinite(memory)||memory<=0)throw Error('Positive requests required');
 const eligible=nodes.filter(n=>n.ready&&!n.unschedulable&&n.os===os&&n.freeCpu>=cpu&&n.freeMemory>=memory&&!n.tainted);
 return eligible.sort((a,b)=>b.freeCpu-a.freeCpu||a.name.localeCompare(b.name))[0]?.name||null;
}
export function desired(resource){
 const spec=resource.spec;
 if(!spec||!Number.isInteger(spec.replicas)||spec.replicas<1||spec.replicas>3||!/^learning-[a-z0-9-]+$/.test(spec.name))throw Error('Invalid learning resource');
 return {replicas:spec.replicas,name:spec.name,observedGeneration:resource.metadata.generation};
}
if(process.argv[2]==='capacity')console.log(JSON.stringify({cpuSlots:capacity({allocatable:1800,reserve:300,request:250}),memorySlots:capacity({allocatable:3072,reserve:512,request:384}),effectiveSlots:Math.min(capacity({allocatable:1800,reserve:300,request:250}),capacity({allocatable:3072,reserve:512,request:384}))}));
if(process.argv[2]==='scale')console.log(JSON.stringify({current:2,measured:90,target:60,recommended:scale({current:2,measured:90,target:60,min:1,max:5})}));
if(process.argv[2]==='schedule')console.log(JSON.stringify({chosen:choose([{name:'a',ready:true,os:'linux',freeCpu:500,freeMemory:512},{name:'b',ready:true,os:'linux',freeCpu:1000,freeMemory:128}],{cpu:250,memory:256}),note:'Calculation only: no binding sent to API'}));
