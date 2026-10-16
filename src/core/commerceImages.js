/** Galeria Commerce — leitura do cadastro V1 sem gravar novamente a foto no Firestore. */
export const MAX_FOTOS_ADICIONAIS = 8;
export const MAX_UPLOAD_BYTES = 12_000_000;
export const MAX_LADO_ORIGINAL = 1800;
export const MAX_LADO_MINIATURA = 480;
const MIME = new Set(['image/jpeg','image/png','image/webp']);
const DATA = /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i;
const ID = /^[a-zA-Z0-9_-]{1,64}$/;
export const urlFotoSegura = value => {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && url.href.length <= 1400 ? url.href : '';
  } catch { return ''; }
};
export function fotoCadastroParaPrevia(produto={}) {
  const src = produto?.imagem;
  if (typeof src !== 'string') return '';
  if (src.length <= 12_000_000 && DATA.test(src)) return src;
  return urlFotoSegura(src);
}
export function normalizarFotosExtras(raw=[]) {
  if (!Array.isArray(raw)) return [];
  const seen=new Set();
  return raw.slice(0, MAX_FOTOS_ADICIONAIS).flatMap((img,i)=> {
    if (!img || typeof img !== 'object' || Array.isArray(img) || !ID.test(String(img.id || ''))) return [];
    if (seen.has(img.id)) return [];
    const url=urlFotoSegura(img.url);
    if (!url) return []; // Nada de base64 no rascunho do Commerce
    seen.add(img.id);
    return [{id:String(img.id),url,miniaturaUrl:urlFotoSegura(img.miniaturaUrl)||url,
      storagePath:typeof img.storagePath==='string'?img.storagePath.slice(0,350):'',
      alt:String(img.alt||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,140),
      ordem:Number.isSafeInteger(Number(img.ordem)) ? Math.max(0,Math.min(99,Number(img.ordem))):i}];
  }).sort((a,b)=>a.ordem-b.ordem).map((img,i)=>({...img,ordem:i}));
}
/** Prévia: usa a foto original Base64 do produto. Público: SOMENTE HTTPS autorizado. */
export function montarGaleriaProduto({produto={},regra={},previa=false}={}) {
  const original=previa?fotoCadastroParaPrevia(produto):urlFotoSegura(produto?.imagem);
  const adicionais=normalizarFotosExtras(regra.galeriaImagens);
  const fotoCadastro=regra.usarFotoCadastro!==false && original
    ? [{id:'cadastro',url:original,miniaturaUrl:original,alt:String(produto.nome||'').slice(0,140),origem:'cadastro'}]:[];
  const galeria=[...fotoCadastro,...adicionais.map(x=>({...x,origem:'commerce'}))];
  const preferida=regra.capaImagemId;
  const capa=galeria.find(x=>x.id===preferida)||galeria[0]||null;
  const pendente=Boolean(regra.usarFotoCadastro!==false && fotoCadastroParaPrevia(produto)
    && !urlFotoSegura(produto?.imagem));
  return {capa,imagens:galeria,pendenteSincronizacao:pendente,
    temFotoCadastro:Boolean(fotoCadastroParaPrevia(produto)),origemCapa:capa?.origem||null};
}
const drawBlob=(canvas,mime,quality)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao preparar imagem.')),mime,quality));
/** Usa Canvas somente no navegador. Mantém alta resolução, cria thumb leve e não envia Base64 ao Firestore. */
export async function prepararFotoProduto(arquivo,{createImageBitmapFn=globalThis.createImageBitmap,createCanvasFn=()=>document.createElement('canvas')}={}) {
  if (!arquivo || !MIME.has(arquivo.type) || arquivo.size > MAX_UPLOAD_BYTES || arquivo.size <= 0)
    throw new Error('Escolha JPEG, PNG ou WebP com até 12 MB.');
  if (typeof createImageBitmapFn !== 'function') throw new Error('O navegador não suporta processamento seguro de imagem.');
  const bitmap=await createImageBitmapFn(arquivo);
  try {
    const w=bitmap.width,h=bitmap.height;
    if (!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<120||h<120||w*h>60_000_000)
      throw new Error('Resolução de imagem inválida.');
    async function render(limite,quality) {
      const scale=Math.min(1,limite/Math.max(w,h));
      const canvas=createCanvasFn();canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
      const ctx=canvas.getContext('2d');if (!ctx) throw new Error('Processamento de imagem indisponível.');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await drawBlob(canvas,'image/webp',quality);
      if (blob.type!=='image/webp')throw new Error('WebP não suportado neste navegador.');
      return {blob,largura:canvas.width,altura:canvas.height};
    }
    const [principal,miniatura]=await Promise.all([render(MAX_LADO_ORIGINAL,.88),render(MAX_LADO_MINIATURA,.78)]);
    return {principal,miniatura,qualidadeBaixa:Math.max(w,h)<900,larguraOriginal:w,alturaOriginal:h};
  } finally { if (typeof bitmap.close==='function') bitmap.close(); }
}
