import {getAuth} from 'firebase/auth';
import {ZENOS_RUNTIME} from '../runtimeEnvironment.js';
export async function finalizeDistributionPdv({db,userId,session,payload}){
 if(!ZENOS_RUNTIME.isHomologacao||getAuth(db.app).currentUser?.uid!==String(userId))throw Object.assign(new Error('Distribuição indisponível neste ambiente.'),{code:'FORBIDDEN'});
 const response=await fetch('/__distribution/finalize',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await getAuth(db.app).currentUser.getIdToken()}`},body:JSON.stringify(payload)});
 const result=await response.json();if(!response.ok||result.error)throw Object.assign(new Error(result.error||'Liquidação não confirmada.'),{code:result.error});
 let requiresReload=false;
 try{await session.catchUp();}catch{requiresReload=true;if(result.receipt.sequence===session.sequence+1)session.apply(result.receipt);}
 const values=session.materialize();
 return {ok:true,cloudOk:true,localOk:true,requiresReload,values,revisions:result.receipt.revisions,financialEntries:result.receipt.financialEntries,sale:result.sale,alreadyCommitted:result.alreadyCommitted};
}
