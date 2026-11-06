import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {requireEmulators} from '../../operational-functions/src/distribution/security.js';
requireEmulators();
const children=[];
function start(args){const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});children.push(child);return child;}
async function waitFor(url){for(let i=0;i<100;i++){try{await fetch(url);return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(`Service unavailable: ${url}`);}
async function run(args){await new Promise((resolve,reject)=>{const child=start(args);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Failed (${code}): ${args.join(' ')}`)));});}
try {
 start(['operational-functions/src/distribution/server.js']);
 await waitFor('http://127.0.0.1:8787/query');
 if(!process.argv.includes('--ui-only'))await run(['--test','operational-functions/test/distribution/emulator.test.mjs']);
 if(!process.argv.includes('--backend-only')){
  await run(['operational-functions/test/distribution/fixture.mjs']);
  await run(['node_modules/vitest/vitest.mjs','run','--config','vitest.distribution.config.js']);
 }
 if(process.argv.includes('--browser')){
  const {seed}=await import('../../operational-functions/test/distribution/fixture.mjs');await seed('distribution-browser');
  start(['node_modules/vite/bin/vite.js','--mode','homologacao','--host','127.0.0.1','--strictPort']);
  await waitFor('http://127.0.0.1:5173/distribution-homologacao.html');
  await mkdir('tmp/distribution',{recursive:true});
  await run(['scripts/distribution/browser.mjs']);
 }
}finally{for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');}
