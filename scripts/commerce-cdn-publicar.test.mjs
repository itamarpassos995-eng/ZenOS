import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublishHandler,publicarCatalogoCore} from '../api/commerce/publicar.js';
import {migrarFotosPublicas,documentUrl} from '../api/commerce/_lib/commerceGoogle.js';

const original={env:process.env.VERCEL_ENV,publish:process.env.ZENOS_COMMERCE_PUBLISH_ENABLED};
test.after(()=>{
  if(original.env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=original.env;
  if(original.publish===undefined)delete process.env.ZENOS_COMMERCE_PUBLISH_ENABLED;
  else process.env.ZENOS_COMMERCE_PUBLISH_ENABLED=original.publish;
});
const config={commerceConfig:{slug:'loja-teste',nomeLoja:'Loja Teste',slogan:'Melhor preço',
  corTema:'#112233',produtosLoja:{p1:{ativo:true,nomeLoja:'Tinta Suprema',precoPromoBRL:25}},
  adminKey:'NUNCA_PUBLICAR'}};
const store={produtos:[{id:'p1',nome:'Tinta',precoBRL:30,estoque:8,custo:9,
  fornecedor:'DADO_PRIVADO'}]};
const mockData=owner=>async path=>{
  const key=path.join('/');
  if(key==='lojas/'+owner+'/dados/configuracoes')return config;
  if(key==='lojas/'+owner)return store;
  if(key==='lojas_slugs/loja-teste')return {lojaId:owner};
  return null;
};
function res(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},
  status(c){this.code=c;return this;},json(v){this.value=v;return this;}};}
test('publisher só usa três caminhos diretos e nunca os dados de custo',async()=>{
  const paths=[];const published=[];
  const result=await publicarCatalogoCore('loja-1',{
    load:async path=>{paths.push(path.join('/'));return mockData('loja-1')(path);},
    produtosPublicos:store.produtos,
    migrate:async snapshot=>snapshot,
    put:async(path,body)=>{published.push({path,body});return 'https://exemplo.com/catalogo.json';},
    at:()=> '2026-10-29T12:00:00.000Z'
  });
  assert.deepEqual(paths,['lojas/loja-1/dados/configuracoes','lojas_slugs/loja-teste']);
  assert.equal(result.slug,'loja-teste');
  assert.equal(result.quantidadeProdutos,1);
  assert.equal(published.at(-1).path,'commerce/catalogos/loja-teste.json');
  assert.equal(published.length,2);
  const pagina=JSON.parse(published[0].body);
  const manifesto=JSON.parse(published[1].body);
  assert.equal(manifesto.versao,2);
  assert.equal(pagina.produtos.length,1);
  assert.equal(pagina.produtosLoja.p1.nomeLoja,'Tinta Suprema');
  assert.equal(manifesto.publicacaoId,pagina.publicacaoId);
  assert.ok(!JSON.stringify(published).includes('DADO_PRIVADO'));
  assert.ok(!JSON.stringify(published).includes('NUNCA_PUBLICAR'));
});
test('publisher recusa slug pertencente a outra loja sem gravar Blob',async()=>{
  let writes=0;
  await assert.rejects(publicarCatalogoCore('loja-1',{
    load:async path=>path[0]==='lojas_slugs'?{lojaId:'outra-loja'}:mockData('loja-1')(path),
    produtosPublicos:store.produtos,
    migrate:async x=>x,put:async()=>{writes++;},
  }),/apelido-nao-confirmado/);
  assert.equal(writes,0);
});
test('migração retira fotos base64 do JSON e mantém URL pública',async()=>{
  const raw='data:image/png;base64,'+Buffer.from('imagem-de-teste').toString('base64');
  const snapshot={lojaId:'loja-1',config:{logoUrl:raw,bannerUrl:'https://exemplo.com/banner.png',
    produtosLoja:{p1:{imagemLoja:raw,imagensLoja:[raw,'https://exemplo.com/2.jpg']}}},
    produtos:[{id:'p1',fotoUrl:raw}]};
  const calls=[];
  await migrarFotosPublicas(snapshot,{put:async(path,data,opts)=>{
    calls.push({path,bytes:data.length,opts});return 'https://blob.example.com/'+path;
  }});
  assert.equal(calls.length,1);
  assert.match(snapshot.config.logoUrl,/^https:\/\/blob.example.com\//);
  assert.equal(snapshot.config.produtosLoja.p1.imagensLoja[0],snapshot.config.logoUrl);
  assert.equal(snapshot.produtos[0].fotoUrl,snapshot.config.logoUrl);
  assert.equal(snapshot.config.produtosLoja.p1.imagensLoja[1],'https://exemplo.com/2.jpg');
});
test('publicador repassa o token do proprietário somente às leituras pontuais',async()=>{
  const calls=[];
  const expected='firebase-owner-token';
  await publicarCatalogoCore('loja-1',{
    authToken:expected,produtosPublicos:store.produtos,
    load:async(path,opts)=>{
      calls.push({path:path.join('/'),token:opts.token});
      if(path.join('/').startsWith('lojas_slugs/'))return {lojaId:'loja-1'};
      return path.length===4?config:store;
    },
    migrate:async x=>x,put:async()=> 'https://exemplo.com/c.json',
  });
  assert.equal(calls.length,2);
  assert.ok(calls.every(x=>x.token===expected));
});
test('publisher é inerte em produção e quando não habilitado',async()=>{
  let count=0;
  const h=createPublishHandler({verify:async()=>{count++;return {uid:'loja-1'};},publish:async()=>{count++;}});
  process.env.VERCEL_ENV='production';process.env.ZENOS_COMMERCE_PUBLISH_ENABLED='false';
  const r=res();await h({method:'POST',headers:{authorization:'Bearer fake'},body:{produtos:store.produtos}},r);
  assert.equal(r.code,503);assert.equal(count,0);
  process.env.VERCEL_ENV='preview';delete process.env.ZENOS_COMMERCE_PUBLISH_ENABLED;
  const q=res();await h({method:'POST',headers:{authorization:'Bearer fake'}},q);
  assert.equal(q.code,503);assert.equal(count,0);
});
test('publisher exige dono com ID token verificável e URL validada',async()=>{
  process.env.VERCEL_ENV='preview';process.env.ZENOS_COMMERCE_PUBLISH_ENABLED='true';
  let uid;
  const h=createPublishHandler({verify:async token=>{assert.equal(token,'fake');return {uid:'loja-1'};},
    publish:async owner=>{uid=owner;return {slug:'loja-teste',quantidadeProdutos:1};}});
  const no=res();await h({method:'POST',headers:{}},no);assert.equal(no.code,401);
  const yes=res();await h({method:'POST',headers:{authorization:'Bearer fake'},body:{produtos:store.produtos}},yes);
  assert.equal(yes.code,200);assert.equal(uid,'loja-1');
});
test('nunca lê listas ou caminhos arbitrários',()=>{
  assert.equal(documentUrl('lojas','loja-1','dados','configuracoes'),
    'https://firestore.googleapis.com/v1/projects/zenos-ac6b2/databases/(default)/documents/lojas/loja-1/dados/configuracoes');
  assert.throws(()=>documentUrl('lojas','../outros'),/caminho-firestore-invalido/);
});

test('Blob usa store-id sem prefixo e flags REST oficiais',async()=>{
 const {readFileSync}=await import('node:fs');
 const code=readFileSync('api/commerce/_lib/commerceGoogle.js','utf8');
 assert.match(code,/'x-vercel-blob-store-id':'fKepXWjAeW2ueMrB'/);
 assert.match(code,/'x-allow-overwrite':'1'/);
 assert.match(code,/'x-add-random-suffix':'0'/);
});

test('publicador não faz leitura de estoque nem coleção para catálogo vindo do V2',async()=>{
 let paths=[];const payload=[];
 const products=[{id:'p1',nome:'Tinta V2',precoBRL:50,estoque:3,custoBRL:25,fornecedor:'SEGREDO'}];
 const result=await publicarCatalogoCore('loja-1',{
   produtosPublicos:products,
   load:async segments=>{
     paths.push(segments.join('/'));
     return segments[0]==='lojas_slugs'?{lojaId:'loja-1'}:config;
   },
   migrate:async s=>s,
   put:async(_path,body)=>{payload.push(body);return 'https://exemplo.com/json';},
 });
 assert.equal(result.quantidadeProdutos,1);
 assert.deepEqual(paths,['lojas/loja-1/dados/configuracoes','lojas_slugs/loja-teste']);
 assert.ok(payload.some(x=>x.includes('Tinta V2')));
 assert.ok(!payload.some(x=>x.includes('SEGREDO')));
});
test('publicador recusa catálogo sem produtos em vez de apagar a vitrine',async()=>{
 let n=0;
 await assert.rejects(publicarCatalogoCore('loja-1',{
   produtosPublicos:[],load:async()=>{n++;throw Error('nao ler');}
 }),/produtos-publicos-invalidos/);
 assert.equal(n,0);
});

test('produção habilitada exige ID token e lista de produtos antes de publicar',async()=>{
 process.env.VERCEL_ENV='production';process.env.ZENOS_COMMERCE_PUBLISH_ENABLED='true';
 let calls=0;
 const h=createPublishHandler({verify:async()=>({uid:'loja-1'}),
   publish:async()=>{calls++;return {slug:'loja-teste'};}});
 const missing=res();await h({method:'POST',headers:{authorization:'Bearer fake'},body:{}},missing);
 assert.equal(missing.code,400);
 assert.equal(calls,0);
 const present=res();await h({method:'POST',headers:{authorization:'Bearer fake'},body:{produtos:store.produtos}},present);
 assert.equal(present.code,200);
 assert.equal(calls,1);
});

test('lotes de 1200 produtos são todos enviados antes do manifesto',async()=>{
 const produtos=Array.from({length:1200},(_,i)=>({
   id:'p'+i,nome:'Produto '+i,grupo:'Tintas',precoBRL:99,estoque:8
 }));
 const saved=[];
 const result=await publicarCatalogoCore('loja-1',{
   produtosPublicos:produtos,
   load:async seg=>seg[0]==='lojas_slugs'?{lojaId:'loja-1'}:config,
   migrate:async snap=>snap,
   put:async(path,body)=>{saved.push({path,body});return 'https://exemplo.com/x';}
 });
 assert.equal(result.quantidadeProdutos,1200);
 assert.equal(result.totalPaginas,15);
 assert.equal(saved.length,16);
 assert.equal(saved.at(-1).path,'commerce/catalogos/loja-teste.json');
 assert.equal(JSON.parse(saved.at(-1).body).totalProdutos,1200);
 assert.deepEqual(saved.slice(0,-1).map(x=>JSON.parse(x.body).pagina).sort((a,b)=>a-b),
   Array.from({length:15},(_,i)=>i+1));
});
test('falha de upload mantém manifesto anterior sem atualização',async()=>{
 const p=Array.from({length:180},(_,i)=>({id:'p'+i,nome:'Produto '+i,precoBRL:99,estoque:8}));
 const writes=[];
 await assert.rejects(publicarCatalogoCore('loja-1',{
   produtosPublicos:p,
   load:async seg=>seg[0]==='lojas_slugs'?{lojaId:'loja-1'}:config,
   migrate:async snap=>snap,
   put:async path=>{
     writes.push(path);
     if(path.includes('pagina-2.json'))throw Error('upload-interrompido');
     return 'https://exemplo.com/x';
   }
 }),/upload-interrompido/);
 assert.ok(!writes.includes('commerce/catalogos/loja-teste.json'));
});
