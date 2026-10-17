import {Timestamp} from 'firebase/firestore';
export const V2_COLLECTIONS = Object.freeze({produtos:'produtos',clientes:'clientes',
  historicoVendas:'vendas',historicoCompras:'compras',caixaMovimentos:'movimentosCaixa',
  sessoesCaixa:'sessoesCaixa',vendedores:'operadores',fornecedores:'fornecedores',
  despesas:'despesas',vouchers:'vouchers'});
export const V2_VALUES = Object.freeze(['regrasDesconto','regrasComissao','_syncMeta']);
export const encodeV2Id = value => {
  const raw=String(value);
  if(!raw||raw==='.'||raw==='..'||new TextEncoder().encode(raw).length>1000)throw new Error('ID legado inválido para V2.');
  const encoded=encodeURIComponent(raw).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  if(new TextEncoder().encode(encoded).length>1500)throw new Error('ID codificado excede o limite do Firestore.');
  return encoded;
};
export const entityIdV2=(field,entity)=>{
  const value=field==='vouchers'?entity?.codigo:entity?.id;
  if(value===undefined||value===null||String(value)==='')throw new Error(`Registro sem ID em ${field}; operação bloqueada.`);
  return String(value);
};
export const v2ControlPath=userId=>['lojas',String(userId),'dados','storage_control'];
export const v2RootPath=(userId,generation)=>['lojas',String(userId),'v2_generations',generation];
export function cleanV2Value(value){
  if(value===undefined)throw new Error('Valor indefinido não pode ser gravado.');
  if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Valor numérico não finito.');
  if(Array.isArray(value))return value.map(cleanV2Value);
  if(value instanceof Timestamp)return new Timestamp(value.seconds,Math.floor(value.nanoseconds/1000)*1000);
  if(value&&typeof value==='object'){
    // Preserve Firestore native values rather than JSON-normalizing timestamps.
    if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return value;
    return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,cleanV2Value(v)]));
  }
  return value;
}
const canonical=value=>{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object'){
  if(value.type==='document'&&typeof value.path==='string')return {__type:'reference',project:value.firestore.app.options.projectId,database:value.firestore._databaseId.database,path:value.path};
  if(typeof value.toJSON==='function')return canonical(value.toJSON());
  if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new Error('Tipo não suportado no comando V2.');
  return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
 }return value;
};
export const stableV2Json=value=>JSON.stringify(canonical(value));
export const hashV2=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(typeof value==='string'?value:stableV2Json(value))))).map(v=>v.toString(16).padStart(2,'0')).join('');
export const v2Error=(code,message)=>Object.assign(new Error(message),{code});
