import { readFile,writeFile,rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function save(source,destination){const bytes=await readFile(source);const value=JSON.parse(bytes);if(value.format!==1||typeof value.note!=='string')throw Error('Unexpected learning document');await writeFile(destination+'.tmp',bytes,{mode:0o600});await rename(destination+'.tmp',destination);return digest(bytes);}
export async function run(action){
 if(action==='write'){await writeFile('/data/note.json',JSON.stringify({format:1,note:'A note that must survive'}));console.log('Learning document written');}
 else if(action==='backup')console.log('Backup SHA256 '+await save('/data/note.json','/backup/note.json'));
 else if(action==='restore')console.log('Restore SHA256 '+await save('/backup/note.json','/data/note.json'));
 else if(action==='verify'){const bytes=await readFile('/data/note.json');JSON.parse(bytes);console.log('Document SHA256 '+digest(bytes));}
 else throw Error('Choose write, backup, restore or verify');
}
if(['write','backup','restore','verify'].includes(process.argv[2]))await run(process.argv[2]);
