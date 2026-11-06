import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['operational-functions/src/distribution/server.js'],{stdio:'inherit'});
try{
 for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:8787/query');break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const code=await new Promise(resolve=>{const c=spawn(process.execPath,['scripts/distribution/pdv-concurrency.mjs'],{stdio:'inherit'});c.on('exit',resolve);});
 if(code!==0)process.exitCode=code||1;
}finally{server.kill();}
