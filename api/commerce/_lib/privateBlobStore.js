/**
 * Driver único da fila PRIVADA do ZenOS Commerce.
 * Nunca usa BLOB_READ_WRITE_TOKEN (catálogo público) como fallback.
 * SDK oficial >=2.3, com token da store privada passado explicitamente.
 */
const PREFIX='commerce/pedidos/';
const STORE_ID='Ub5FhVPSfclqNq5p';
const urlBase='https://'+STORE_ID+'.private.blob.vercel-storage.com/';
const validPath=path=>typeof path==='string'&&path.startsWith(PREFIX)&&
  /^commerce\/pedidos\/[a-zA-Z0-9_-]{1,128}\/(?:pendentes|arquivados)\/ON-[A-F0-9]{24}\.json$/.test(path);
const token=()=>{
 const value=process.env.ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN;
 if(typeof value!=='string'||!value.startsWith('vercel_blob_rw_'))throw Error('credencial-privada-indisponivel');
 const store=process.env.ZENOS_COMMERCE_PRIVATE_BLOB_STORE_ID;
 if(store && store!==STORE_ID && store!=='store_'+STORE_ID)throw Error('store-privada-incorreta');
 return value;
};
export function privateStoreReady(){
 try{token();return true;}catch{return false;}
}
const moduleSdk=()=>import('@vercel/blob');
export function createPrivateBlobDriver({sdk=moduleSdk}={}){
 async function putPrivate(path,payload,{overwrite=false}={}){
   if(!validPath(path))throw Error('caminho-privado-invalido');
   const {put}=await sdk();
   try{
     const written=await put(path,JSON.stringify(payload),{
       token:token(),access:'private',addRandomSuffix:false,
       allowOverwrite:overwrite,contentType:'application/json',
       cacheControlMaxAge:60
     });
     const url=new URL(written.url);
     if(url.origin!==new URL(urlBase).origin||url.pathname!=='/'+path)
       throw Error('resposta-privada-invalida');
     return written;
   }catch(err){
     if(err?.name==='BlobAlreadyExistsError'||err?.status===409||
       err?.code==='blob_already_exists'||err?.code==='BLOB_ALREADY_EXISTS')
       throw Error('pedido-ja-registrado');
     throw err;
   }
 }
 async function readPrivate(path){
   if(!validPath(path))throw Error('caminho-privado-invalido');
   const {get}=await sdk();
   const output=await get(path,{access:'private',token:token(),useCache:false});
   if(!output)return null;
   if(output.statusCode!==200||!output.stream)throw Error('fila-leitura-indisponivel');
   if(output.blob?.size>80_000)throw Error('pedido-grande-demais');
   const reader=output.stream.getReader();
   const chunks=[];let total=0;
   try{
     while(true){
       const {done,value}=await reader.read();
       if(done)break;
       total+=value.byteLength;
       if(total>80_000)throw Error('pedido-grande-demais');
       chunks.push(value);
     }
   }finally{reader.releaseLock();}
   return JSON.parse(Buffer.concat(chunks.map(c=>Buffer.from(c))).toString('utf8'));
 }
 async function listPrivate(uid,cursor){
   if(typeof uid!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(uid))throw Error('uid-invalido');
   if(cursor!==undefined&&(typeof cursor!=='string'||cursor.length>1024))throw Error('cursor-invalido');
   const {list}=await sdk();
   return list({token:token(),prefix:PREFIX+uid+'/pendentes/',limit:80,cursor});
 }
 async function deletePrivate(path){
   if(!validPath(path))throw Error('caminho-privado-invalido');
   const {del}=await sdk();
   await del(path,{token:token()});
 }
 return {putPrivate,readPrivate,listPrivate,deletePrivate};
}
export const {putPrivate,readPrivate,listPrivate,deletePrivate}=createPrivateBlobDriver();
