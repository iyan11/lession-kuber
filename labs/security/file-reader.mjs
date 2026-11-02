import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
let previous;
async function check(){try{const bytes=await readFile('/config/DEMO_TOKEN');const current=createHash('sha256').update(bytes).digest('hex');if(current!==previous){console.log(JSON.stringify({event:'configuration_changed',present:bytes.length>0,initial:previous===undefined}));previous=current;}}catch(error){console.error(JSON.stringify({event:'configuration_unavailable',code:error.code}));}}
await check();setInterval(check,1000);
