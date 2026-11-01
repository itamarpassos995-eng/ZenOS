// Cache apenas da configuração retornada pelo backend; nunca recebe certificados ou chaves.
// Compartilha a leitura entre montagens simultâneas, sem polling ou listeners.
export function criarCacheConfiguracaoFiscal({agora=Date.now,ttlMs=60000,maxEntradas=32}={}){
 const entries=new Map();
 const chave=(uid,lojaId)=>{if(!uid||!lojaId)throw Error('FISCAL_CONTEXTO_AUSENTE');return JSON.stringify([uid,lojaId]);};
 return {
  async ler({uid,lojaId,carregar,forcar=false}){
   const key=chave(uid,lojaId),old=entries.get(key);
   if(!forcar&&old&&(old.pendente||old.expira>agora()))return structuredClone(await old.promise);
   const entry={pendente:true,expira:0,promise:null};
   entry.promise=Promise.resolve().then(carregar).then(result=>{
    entry.pendente=false;entry.expira=agora()+ttlMs;return structuredClone(result);
   }).catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error;});
   entries.delete(key);entries.set(key,entry);
   while(entries.size>maxEntradas)entries.delete(entries.keys().next().value);
   return structuredClone(await entry.promise);
  },
  invalidar({uid,lojaId}){entries.delete(chave(uid,lojaId));},
  limpar(){entries.clear();},
 };
}
export const cacheConfiguracaoFiscal=criarCacheConfiguracaoFiscal();
