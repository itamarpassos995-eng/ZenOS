/** A prévia deste PR usa somente o SDK público do projeto isolado. Produção mantém o build habitual. */
import {spawnSync} from 'node:child_process';
const preview=process.env.VERCEL_ENV==='preview'&&['feat/commerce-studio-galeria-p2-homologacao-20261016','feat/commerce-vitrine-confianca-hml-20261018'].includes(process.env.VERCEL_GIT_COMMIT_REF);
const env={...process.env};
if(preview){
 const response=await fetch('https://zenos-commerce-homologacao.web.app/__/firebase/init.json',{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Não foi possível preparar o SDK público da homologação para a prévia.');
 const cfg=await response.json();
 if(cfg.projectId!=='zenos-commerce-homologacao'||cfg.storageBucket!=='zenos-commerce-homologacao.firebasestorage.app'||!cfg.appId||!cfg.apiKey)throw Error('Prévia recusou configuração fora da homologação.');
 env.VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG=JSON.stringify(cfg);
 console.log('Prévia Commerce: somente Firebase isolado de homologação. Nenhuma credencial privada.');
}
const r=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build',...(preview?['--mode','commerce-hml']:[])],{stdio:'inherit',env});
if(r.error)throw r.error;process.exit(r.status??1);
