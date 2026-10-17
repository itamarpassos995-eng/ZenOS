/** Validacao pura (backend) de imagens Commerce; nenhuma gravacao fora deste modulo. */
import { createHash } from 'node:crypto';
const ID = /^[a-zA-Z0-9._:-]{1,120}$/;
const HASH = /^[a-f0-9]{64}$/;
export const TAMANHO_PRINCIPAL_MAX = 3_000_000;
export const TAMANHO_MINIATURA_MAX = 450_000;
const WEBP_TYPE = 'image/webp';

export function dimensoesWebP(b) {
  if (!Buffer.isBuffer(b) || b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP')
    throw new Error('Imagem WebP inválida.');
  if (b.readUInt32LE(4) + 8 !== b.length) throw new Error('Tamanho WebP inconsistente.');
  const t = b.toString('ascii',12,16);
  let w,h;
  if (t === 'VP8X') {
    if (b.readUInt32LE(16) < 10) throw new Error('WebP VP8X incompleto.');
    w = 1 + b.readUIntLE(24, 3); h = 1 + b.readUIntLE(27, 3);
  } else if (t === 'VP8 ') {
    if (b.readUInt32LE(16) < 10 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) throw new Error('WebP VP8 inválido.');
    w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff;
  } else if (t === 'VP8L') {
    if (b.readUInt32LE(16) < 5 || b[20] !== 0x2f) throw new Error('WebP VP8L inválido.');
    const z=b.readUInt32LE(21); w=(z&0x3fff)+1;h=((z>>>14)&0x3fff)+1;
  } else throw new Error('Codificação WebP não suportada.');
  if (!w || !h || w > 1800 || h > 1800 || w*h > 3_240_000) throw new Error('Dimensões WebP excedem o limite.');
  return {largura:w,altura:h};
}

function decodificar(base64,maxBytes) {
  if (typeof base64 !== 'string' || !base64.length || base64.length > Math.ceil(maxBytes*4/3)+4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
    throw new Error('Imagem codificada inválida ou excede o limite.');
  const buf=Buffer.from(base64,'base64');
  if (!buf.length || buf.length>maxBytes || buf.toString('base64')!==base64) throw new Error('Dados da imagem inválidos.');
  return buf;
}
export function prepararMidiaCommerce({lojaId,produtoId,principalBase64,miniaturaBase64,origem='galeria'}={}){
  if(!ID.test(lojaId||'')||!ID.test(produtoId||'')||['__proto__','constructor','prototype','.','..'].includes(produtoId)) throw new Error('Identidade de loja/produto inválida.');
  if(!['galeria','cadastro'].includes(origem)) throw new Error('Origem da foto inválida.');
  const principal=decodificar(principalBase64,TAMANHO_PRINCIPAL_MAX), miniatura=decodificar(miniaturaBase64,TAMANHO_MINIATURA_MAX);
  const dims=dimensoesWebP(principal),thumbDims=dimensoesWebP(miniatura);
  if(thumbDims.largura>480||thumbDims.altura>480)throw new Error('Miniatura excede 480 pixels.');
  const hash=createHash('sha256').update(principal).digest('hex');
  const path=`commerce/${lojaId}/produtos/${produtoId}/${origem}/${hash}.webp`;
  const thumbPath=`commerce/${lojaId}/produtos/${produtoId}/miniaturas/${hash}.webp`;
  return {id:'img-'+hash.slice(0,28),hash,path,thumbPath,principal,miniatura,mime:WEBP_TYPE,dims,thumbDims};
}
export function caminhoCommerceValido(path,lojaId,produtoId,{origem='galeria'}={}){
  if(!ID.test(lojaId||'')||!ID.test(produtoId||'')||!['galeria','cadastro'].includes(origem))return false;
  const prefix=`commerce/${lojaId}/produtos/${produtoId}/${origem}/`;
  return typeof path==='string'&&path.startsWith(prefix)&&HASH.test(path.slice(prefix.length,-5))&&path.endsWith('.webp');
}
export function derivarMiniaturaPath(path,lojaId,produtoId,origem='galeria'){
  if(!caminhoCommerceValido(path,lojaId,produtoId,{origem}))throw new Error('Imagem fora do domínio autorizado.');
  return `commerce/${lojaId}/produtos/${produtoId}/miniaturas/${path.split('/').at(-1)}`;
}
export function produtoPertenceLoja(operacao,produtoId){
  return Array.isArray(operacao?.produtos) && operacao.produtos.filter(p=>String(p?.id)===String(produtoId)&&p.estado!=='inativo').length===1;
}

export function prepararBannerCommerce({lojaId,bannerId,tipo='desktop',principalBase64,miniaturaBase64}={}) {
 if(!/^b-[a-z0-9-]{1,30}$/.test(bannerId||'')||!['desktop','mobile'].includes(tipo))throw Error('Banner ou formato inválido.');
 const plano=prepararMidiaCommerce({lojaId,produtoId:bannerId,principalBase64,miniaturaBase64});
 return {...plano,path:`commerce/${lojaId}/banners/${bannerId}/${tipo}/${plano.hash}.webp`,thumbPath:`commerce/${lojaId}/banners/${bannerId}/miniaturas/${plano.hash}.webp`};
}
export function caminhoBannerValido(path,lojaId,bannerId,tipo='desktop') {
 if(!ID.test(lojaId||'')||!/^b-[a-z0-9-]{1,30}$/.test(bannerId||'')||!['desktop','mobile'].includes(tipo))return false;
 const prefix=`commerce/${lojaId}/banners/${bannerId}/${tipo}/`;
 return typeof path==='string'&&path.startsWith(prefix)&&path.endsWith('.webp')&&HASH.test(path.slice(prefix.length,-5));
}
