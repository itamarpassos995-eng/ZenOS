import { caminhoCommerceValido, caminhoBannerValido } from './commerceMediaServiceCore.js';
/** ZenOS Commerce: validação CANÔNICA no servidor, sem importação do frontend. */
const estadosLicenca = new Set(['nao_contratado','solicitado','em_homologacao','ativo','suspenso','cancelado']);
const texto=(v,n)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const cor=(v,padrao)=>/^#[0-9A-Fa-f]{6}$/.test(v||'')?v.toUpperCase():padrao;
const url=(v)=>{if(!v)return '';try {const u=new URL(String(v));return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&u.href.length<=1000?u.href:'';}catch{return '';}};
const bannersLimite=5,produtosLimite=3000,maxFotosExtras=8;
const fotoId=(v)=>/^[a-zA-Z0-9_-]{1,64}$/.test(String(v||''))?String(v):null;
const destino=(v)=>/^(\/catalogo|\/categoria\/[a-z0-9-]{1,60}|\/produto\/[a-z0-9-]{1,80}|\/colecao\/[a-z0-9-]{1,60})$/.test(v||'')?v:'/catalogo';
const inteiro=(value,min,max,padrao=0)=>{if(value===null||value===undefined||value==='')return padrao;const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Número inteiro fora do limite.');return n;};
const moeda=(value)=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<=0||n>1e9||!Number.isSafeInteger(Math.round(n*100)))throw Error('Preço online inválido.');return Math.round(n*100)/100;};
export const configInicialCommerce=Object.freeze({
 versao:2,nomeLoja:'Minha Loja',slogan:'Escolha com confiança. Receba com praticidade.',textoTopo:'Conheça nossas novidades',etiquetaFrete:'Consulte entrega e retirada',
 corPrincipal:'#193D4E',corDestaque:'#D9A65B',corSuperficie:'#F7F6F3',corTexto:'#162D38',layoutGrade:'4',exibirCategorias:true,exibirPesquisa:true,exibirWhatsapp:true,
 banners:[{id:'b-1',ativo:true,titulo:'Sua loja, sua identidade',subtitulo:'Conheça os produtos selecionados.',selo:'NOVIDADES',chamada:'Ver catálogo',caminho:'/catalogo',imagemDesktop:'',imagemMobile:'',corFundo:'#193D4E',ordem:0,alinhamento:'esquerda'}]
});
export function normalizarGaleriaServidor(entrada,{lojaId=null,produtoId=null}={}){
 if(entrada==null)return [];
 if(!Array.isArray(entrada)||entrada.length>maxFotosExtras)throw Error('Limite de oito fotos extras por produto.');
 const used=new Set();
 return entrada.map((f,i)=>{
  if(!f||typeof f!=='object'||Array.isArray(f))throw Error('Foto inválida.');
  const id=fotoId(f.id),original=url(f.url),miniatura=url(f.miniaturaUrl);
  if(!id||used.has(id)||(!original&&!f.storagePath))throw Error('Foto sem ID, mídia privada ou link seguro, ou repetida.');
  const storagePath=typeof f.storagePath==='string'?f.storagePath:'';
  // Com identidade autenticada, imagens só podem pertencer à loja e ao produto atuais.
  if(lojaId){
   if(!caminhoCommerceValido(storagePath,lojaId,produtoId,{origem:'galeria'}))
    throw Error('Foto não pertence ao catálogo privado desta loja e produto.');
  }
  used.add(id);
  return {id,url:lojaId?'':original,miniaturaUrl:lojaId?'':(miniatura||original),storagePath,alt:texto(f.alt,140),ordem:inteiro(f.ordem,0,99,i)};
 }).sort((a,b)=>a.ordem-b.ordem).map((item,i)=>({...item,ordem:i}));
}
export function validarRascunhoCommerce(dados,lojaId=null){
 if(!dados||typeof dados!=='object'||Array.isArray(dados))throw Error('Rascunho inválido.');
 if(JSON.stringify(dados).length>110_000)throw Error('Rascunho excede o tamanho permitido.');
 const fonte=dados.aparencia||{},regras=dados.regras||{};
 if(!fonte||typeof fonte!=='object'||Array.isArray(fonte)||!regras||typeof regras!=='object'||Array.isArray(regras))throw Error('Formato da configuração inválido.');
 if(!Array.isArray(fonte.banners)&&fonte.banners!==undefined)throw Error('Banners inválidos.');
 if((fonte.banners||[]).length>bannersLimite)throw Error('Máximo de cinco banners.');
 const ids=new Set();
 const banners=(fonte.banners||configInicialCommerce.banners).map((b,i)=>{
  if(!b||typeof b!=='object'||Array.isArray(b))throw Error('Banner inválido.');
  const id=/^b-[a-z0-9-]{1,30}$/.test(b.id||'')?b.id:`b-${i+1}`;
  if(ids.has(id))throw Error('Identificador de banner repetido.');ids.add(id);
  const midia={};
  for(const tipo of ['Desktop','Mobile']){
   const campo='imagem'+tipo,path=b[campo+'StoragePath']||'';
   if(path&&(!lojaId||!caminhoBannerValido(path,lojaId,id,tipo.toLowerCase())))throw Error('Imagem do banner pertence a outra loja, banner ou formato.');
   midia[campo+'StoragePath']=path;midia[campo]=path?'':url(b[campo]);
  }
  return {id,ativo:b.ativo!==false,titulo:texto(b.titulo,90),subtitulo:texto(b.subtitulo,180),selo:texto(b.selo,36),
   chamada:texto(b.chamada,32),caminho:destino(b.caminho),...midia,
   alinhamento:b.alinhamento==='centro'?'centro':'esquerda',corFundo:cor(b.corFundo,'#193D4E'),ordem:inteiro(b.ordem,0,99,i)};
 }).sort((a,b)=>a.ordem-b.ordem);
 const aparencia={versao:2,nomeLoja:texto(fonte.nomeLoja||configInicialCommerce.nomeLoja,65),slogan:texto(fonte.slogan,120),
  textoTopo:texto(fonte.textoTopo,100),etiquetaFrete:texto(fonte.etiquetaFrete,90),
  corPrincipal:cor(fonte.corPrincipal,'#193D4E'),corDestaque:cor(fonte.corDestaque,'#D9A65B'),
  corSuperficie:cor(fonte.corSuperficie,'#F7F6F3'),corTexto:cor(fonte.corTexto,'#162D38'),
  layoutGrade:fonte.layoutGrade==='3'?'3':'4',exibirCategorias:fonte.exibirCategorias!==false,
  exibirPesquisa:fonte.exibirPesquisa!==false,exibirWhatsapp:fonte.exibirWhatsapp!==false,banners};
 const chaves=Object.keys(regras);if(chaves.length>produtosLimite)throw Error('Muitos produtos na configuração.');
 let totalFotosExtras=0;
 const regrasLimpas=Object.create(null);
 for(const id of chaves){
  if(!/^[a-zA-Z0-9._:-]{1,120}$/.test(id)||id==='__proto__')throw Error('ID de produto inválido.');
  const r=regras[id];if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Regra de produto inválida.');
  const galeria=normalizarGaleriaServidor(r.galeriaImagens,{lojaId,produtoId:id});
  totalFotosExtras+=galeria.length;
  if(totalFotosExtras>256)throw Error('Máximo de 256 fotos adicionais por estabelecimento na homologação.');
  const fotoCadastroStoragePath=typeof r.fotoCadastroStoragePath==='string'?r.fotoCadastroStoragePath:'';
  if(fotoCadastroStoragePath&&lojaId&&!caminhoCommerceValido(fotoCadastroStoragePath,lojaId,id,{origem:'cadastro'}))throw Error('Foto de cadastro pertence a outra loja ou produto.');
  regrasLimpas[id]={publicado:r.publicado===true,fonteEstoque:['vitrine','deposito','ambos'].includes(r.fonteEstoque)?r.fonteEstoque:'ambos',
   reservaMinima:inteiro(r.reservaMinima,0,1e9),limiteOnline:inteiro(r.limiteOnline,0,1e9,null),
   precoOnlineBRL:moeda(r.precoOnlineBRL),precoAnteriorBRL:moeda(r.precoAnteriorBRL),descricaoWeb:texto(r.descricaoWeb,800),categoriaPublica:texto(r.categoriaPublica,60),imagemPublica:url(r.imagemPublica),
   usarFotoCadastro:r.usarFotoCadastro!==false,
   capaImagemId:fotoId(r.capaImagemId)||'cadastro',
   fotoCadastroStoragePath,galeriaImagens:galeria};
 }
 return {aparencia,regras:{...regrasLimpas}};
}
export function resumoLicencaCommerce(licenca){
 const x=licenca&&typeof licenca==='object'?licenca:{};
 const status=estadosLicenca.has(x.status)?x.status:'nao_contratado';
 // A origem deste objeto deve ser sempre o documento do servidor, nunca request.data.
 return {modulo:'commerce',status,ativacaoConfirmadaServidor:x.ativacaoConfirmadaServidor===true,
  bloqueado:x.bloqueado===true,planoId:status==='ativo'?texto(x.planoId,50):null,
  ativo:status==='ativo'&&x.ativacaoConfirmadaServidor===true&&x.bloqueado!==true};
}
export function validarRevisao(expectedRevision,currentRevision){
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('Revisão obrigatória.');
 return expectedRevision===currentRevision;
}
export function construirInteresseCommerce(atual,uid,pais,agora){
 if(!['BR','PY'].includes(pais))throw Error('País da loja não informado.');
 if(atual?.status==='solicitado')return {documento:atual,jaSolicitado:true};
 const historico=Array.isArray(atual?.historico)?atual.historico.slice(-9):[];
 historico.push({tipo:'solicitacao_de_proposta',por:uid,em:agora});
 return {documento:{status:'solicitado',tipo:'solicitacao_de_proposta',semCobranca:true,semAtivacao:true,
  pais,solicitadoPor:uid,createdAt:atual?.createdAt||agora,updatedAt:agora,historico},jaSolicitado:false};
}
