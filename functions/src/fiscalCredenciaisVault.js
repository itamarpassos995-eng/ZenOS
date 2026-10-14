const emulator=new Map();let sequence=0;
const project=()=>process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT;
const resource=()=>`projects/${project()}/secrets/ZENOS_FISCAL_CREDENTIALS`;
async function request(path,body){
 const {applicationDefault}=await import('firebase-admin/app');
 const {access_token}=await applicationDefault().getAccessToken();
 const r=await fetch(`https://secretmanager.googleapis.com/v1/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('FISCAL_COFRE_INDISPONIVEL');
 return r.json();
}
export async function lerCredenciais(ref){
 if(!ref)return null;
 if(process.env.FUNCTIONS_EMULATOR==='true')return emulator.get(ref)||null;
 if(!ref.startsWith(resource()+'/versions/')||!/^\d+$/.test(ref.split('/').at(-1)))throw new Error('FISCAL_COFRE_INDISPONIVEL');
 const d=await request(ref+':access');return JSON.parse(Buffer.from(d.payload.data,'base64').toString('utf8'));
}
export async function guardarCredenciais(payload){
 if(process.env.FUNCTIONS_EMULATOR==='true'){const ref='emulator/'+(++sequence);emulator.set(ref,payload);return ref;}
 const data=Buffer.from(JSON.stringify(payload)).toString('base64');
 if(Buffer.from(data,'base64').length>65536)throw new Error('FISCAL_CREDENCIAIS_INVALIDAS');
 return (await request(resource()+':addVersion',{payload:{data}})).name;
}
export async function removerCredenciais(ref){
 if(process.env.FUNCTIONS_EMULATOR==='true'){emulator.delete(ref);return;}
 if(!ref?.startsWith(resource()+'/versions/')||!/^\d+$/.test(ref.split('/').at(-1)))throw new Error('FISCAL_COFRE_INDISPONIVEL');
 await request(ref+':destroy',{});
}
