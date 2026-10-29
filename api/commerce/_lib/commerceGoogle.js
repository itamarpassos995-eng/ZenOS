import { createSign, createVerify, createHash, createPublicKey } from 'node:crypto';
const PROJECT = 'zenos-ac6b2';
const text = (v,n=128) => String(v??'').slice(0,n);
const nowSeconds = () => Math.floor(Date.now()/1000);
function jsonPart(value){return Buffer.from(JSON.stringify(value)).toString('base64url');}
function serviceAccount(){
  let account;
  try{account=JSON.parse(process.env.ZENOS_COMMERCE_SERVICE_ACCOUNT_JSON||'null');}catch{}
  if(!account||account.project_id!==PROJECT||!account.client_email?.endsWith('.gserviceaccount.com')||!account.private_key) throw Error('credenciais-servico-indisponiveis');
  return account;
}
let accessCache=null;
export async function googleServiceToken({fetchImpl=fetch,at=nowSeconds()}={}){
  if(accessCache&&accessCache.expiresAt>at+90)return accessCache.token;
  const account=serviceAccount();
  const header=jsonPart({alg:'RS256',typ:'JWT'});
  const payload=jsonPart({iss:account.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:at,exp:at+3500});
  const signingInput=header+'.'+payload;
  const s=createSign('RSA-SHA256');s.update(signingInput);s.end();
  const assertion=signingInput+'.'+s.sign(account.private_key).toString('base64url');
  const resp=await fetchImpl('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
    signal:AbortSignal.timeout(5000)});
  if(!resp.ok)throw Error('token-servico-indisponivel');
  const data=await resp.json();
  if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_in))throw Error('token-servico-invalido');
  accessCache={token:data.access_token,expiresAt:at+Math.min(data.expires_in,3500)};
  return data.access_token;
}
let jwksCache={keys:null,expiresAt:0};
export async function verifyOwnerFirebaseIdToken(token,{fetchImpl=fetch,at=nowSeconds()}={}){
  if(typeof token!=='string'||token.length>6500||token.split('.').length!==3)throw Error('login-invalido');
  const [a,b,signature]=token.split('.');
  let header,payload;
  try{header=JSON.parse(Buffer.from(a,'base64url').toString());payload=JSON.parse(Buffer.from(b,'base64url').toString());}catch{throw Error('login-invalido');}
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>150||!payload||typeof payload!=='object')throw Error('login-invalido');
  if(payload.aud!==PROJECT||payload.iss!=='https://securetoken.google.com/'+PROJECT||
      typeof payload.sub!=='string'||!payload.sub||payload.sub.length>128||
      !Number.isFinite(payload.exp)||payload.exp<=at||
      !Number.isFinite(payload.iat)||payload.iat>at+60||
      !Number.isFinite(payload.auth_time)||payload.auth_time>at+60||
      payload.firebase?.sign_in_provider==='anonymous')
    throw Error('login-invalido');
  if(!jwksCache.keys||jwksCache.expiresAt<=at){
    const res=await fetchImpl('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',{
      signal:AbortSignal.timeout(5000)});
    if(!res.ok)throw Error('verificacao-login-indisponivel');
    const jwks=await res.json();
    if(!Array.isArray(jwks.keys))throw Error('verificacao-login-indisponivel');
    const maxAge=Number(/max-age=(\d+)/.exec(res.headers?.get?.('cache-control')||'')?.[1]||300);
    jwksCache={keys:jwks.keys,expiresAt:at+Math.min(Math.max(maxAge,60),3600)};
  }
  const key=jwksCache.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(k.alg===undefined||k.alg==='RS256')&&k.use==='sig');
  if(!key)throw Error('login-invalido');
  let verified=false;
  try{const verify=createVerify('RSA-SHA256');verify.update(a+'.'+b);verify.end();verified=verify.verify(createPublicKey({key,format:'jwk'}),Buffer.from(signature,'base64url'));}catch{}
  if(!verified)throw Error('login-invalido');
  return {uid:payload.sub};
}
function decodeValue(v){
  if(!v||typeof v!=='object')return null;
  if('stringValue' in v)return v.stringValue;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return Number(v.doubleValue);
  if('booleanValue' in v)return v.booleanValue;
  if('timestampValue' in v)return v.timestampValue;
  if('nullValue' in v)return null;
  if('arrayValue' in v)return (v.arrayValue.values||[]).map(decodeValue);
  if('mapValue' in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,item])=>[k,decodeValue(item)]));
  return null;
}
export function decodeDocument(data){
  if(!data?.fields)return null;
  return Object.fromEntries(Object.entries(data.fields).map(([k,v])=>[k,decodeValue(v)]));
}
export function documentUrl(...segments){
  if(!segments.length||segments.some(s=>typeof s!=='string'||!s||s.includes('/')||s.includes('..')))throw Error('caminho-firestore-invalido');
  return 'https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+segments.map(encodeURIComponent).join('/');
}
export async function getOfficialDocument(pathSegments,{fetchImpl=fetch,token}={}){
  const bearer=token||await googleServiceToken({fetchImpl});
  const res=await fetchImpl(documentUrl(...pathSegments),{headers:{Authorization:'Bearer '+bearer},signal:AbortSignal.timeout(5000)});
  if(res.status===404)return null;
  if(!res.ok)throw Error('firestore-leitura-indisponivel');
  return decodeDocument(await res.json());
}
export async function putPublicBlob(pathname,body,{fetchImpl=fetch,contentType='application/json',maxAge=60}={}){
  if(!/^commerce\/(?:catalogos\/[a-z0-9-]+\.json|fotos\/[a-zA-Z0-9_-]+\/[a-f0-9]{64}\.(?:png|jpg|webp))$/.test(pathname))throw Error('blob-caminho-invalido');
  const token=process.env.BLOB_READ_WRITE_TOKEN;
  if(!token)throw Error('blob-credencial-indisponivel');
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);
  if(bytes.byteLength>2_000_000)throw Error('blob-grande-demais');
  const res=await fetchImpl('https://vercel.com/api/blob/?pathname='+encodeURIComponent(pathname),{
    method:'PUT',headers:{
      'authorization':'Bearer '+token,
      'x-vercel-blob-store-id':'store_fKepXWjAeW2ueMrB',
      'x-api-version':'13',
      'x-api-blob-request-id':'zenos-'+createHash('sha256').update(pathname+Date.now()).digest('hex').slice(0,26),
      'x-vercel-blob-access':'public','x-add-random-suffix':'false','x-allow-overwrite':'true',
      'x-cache-control-max-age':String(maxAge),'x-content-type':contentType,
    },body:bytes,signal:AbortSignal.timeout(15000)
  });
  if(!res.ok)throw Error('blob-publicacao-falhou');
  const result=await res.json();
  const url=new URL(result.url);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.public.blob.vercel-storage.com')||url.pathname!=='/'+pathname)throw Error('blob-resposta-invalida');
  return result.url;
}
export async function migrarFotosPublicas(snapshot,{put=putPublicBlob}={}){
  const seen=new Map();let count=0,total=0;
  const convert=async url=>{
    if(!url?.startsWith('data:'))return url;
    if(seen.has(url))return seen.get(url);
    const found=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if(!found)throw Error('imagem-nao-suportada');
    const bytes=Buffer.from(found[2],'base64');
    count++;total+=bytes.length;
    if(count>120||total>10_000_000||bytes.length>400_000)throw Error('limite-fotos-publicas');
    const ext=found[1]==='jpeg'?'jpg':found[1];
    const hash=createHash('sha256').update(bytes).digest('hex');
    const path='commerce/fotos/'+snapshot.lojaId+'/'+hash+'.'+ext;
    const dest=await put(path,bytes,{contentType:'image/'+found[1],maxAge:2592000});
    seen.set(url,dest);return dest;
  };
  snapshot.config.logoUrl=await convert(snapshot.config.logoUrl);
  snapshot.config.bannerUrl=await convert(snapshot.config.bannerUrl);
  for(const item of snapshot.produtos){
    item.fotoUrl=await convert(item.fotoUrl);
    const p=snapshot.config.produtosLoja[item.id];
    if(p){
      p.imagemLoja=await convert(p.imagemLoja);
      if(Array.isArray(p.imagensLoja))p.imagensLoja=await Promise.all(p.imagensLoja.map(convert));
    }
  }
  return snapshot;
}