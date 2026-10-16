import {createHash} from 'node:crypto';
export const urlImagemCommerce=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&u.href.length<=1400?u.href:null;}catch{return null;}};
export const publicIdValido=id=>/^zc-[a-z2-9]{14}$/.test(id||'');
const text=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
export function telefoneCommerce(value){const v=String(value||'').replace(/[\s()+.-]/g,'');if(!/^[1-9]\d{9,14}$/.test(v))throw Error('Informe o WhatsApp com código do país e DDD.');return v;}
const saldo=n=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
export function catalogoCommerceServidor(produtos,regras){
 const ids=new Set(),skus=new Set();
 return (Array.isArray(produtos)?produtos:[]).flatMap(p=>{
  const id=String(p?.id||''),r=regras?.[id];
  if(!id||ids.has(id)||!r?.publicado||p.tipoItem==='servico'||p.usoUnicoEncomendado)return [];
  ids.add(id);const sku=text(p.sku||id,80);if(!sku||skus.has(sku))return [];skus.add(sku);
  const n=Number(r.precoOnlineBRL??p.preco1BRL??p.precoBRL??p.preco1??0),precoCentavos=Math.round(n*100);
  if(!Number.isFinite(n)||n<=0||!Number.isSafeInteger(precoCentavos)||precoCentavos<=0)return [];
  const presente=k=>p[k]!==undefined&&p[k]!==null&&p[k]!=='';
  const total=presente('estoque')?saldo(p.estoque):saldo(p.estoqueVitrine)+saldo(p.estoqueGalpao);
  const legado=!presente('estoqueVitrine')&&!presente('estoqueGalpao');
  const deposito=legado?0:Math.min(saldo(p.estoqueGalpao),total),vitrine=total-deposito;
  const fonte=r.fonteEstoque==='deposito'?deposito:r.fonteEstoque==='vitrine'?vitrine:total;
  const quantidadeMaxima=Math.floor(Math.max(0,Math.min(Math.max(0,fonte-saldo(r.reservaMinima)),r.limiteOnline==null?Infinity:saldo(r.limiteOnline))));
  return [{produtoId:id,skuPublico:sku,nome:text(p.nome,120),descricao:text(p.descricaoPublica,800),categoria:text(r.categoriaPublica||p.grupo||'Produtos',60),precoCentavos,precoBRL:precoCentavos/100,quantidadeMaxima,disponivel:quantidadeMaxima>0}];
 });
}
export function validarPedidoCommerce(input,catalogo){
 if(!input||!Array.isArray(input.itens)||input.itens.length<1||input.itens.length>50)throw Error('Carrinho inválido.');
 const nome=text(input.nome,100),telefone=telefoneCommerce(input.telefone),observacao=text(input.observacao,500);
 if(nome.length<2||input.aceiteContato!==true)throw Error('Informe seu nome e autorize o contato para atender o pedido.');
 const quantidades=new Map();
 for(const item of input.itens){
  if(!Number.isSafeInteger(item.quantidade)||item.quantidade<1||item.quantidade>1000||typeof item.skuPublico!=='string')throw Error('Quantidade inválida.');
  quantidades.set(item.skuPublico,(quantidades.get(item.skuPublico)||0)+item.quantidade);
 }
 let totalCentavos=0;
 const itens=[...quantidades].sort(([a],[b])=>a.localeCompare(b)).map(([skuPublico,quantidade])=>{
  const p=catalogo.find(x=>x.skuPublico===skuPublico);
  if(!p?.disponivel||quantidade>p.quantidadeMaxima)throw Error('Produto indisponível ou quantidade acima do saldo. Atualize o catálogo.');
  totalCentavos+=p.precoCentavos*quantidade;
  return {produtoId:p.produtoId,skuPublico,nome:p.nome,quantidade,precoUnitarioCentavos:p.precoCentavos};
 });
 if(!Number.isSafeInteger(totalCentavos)||totalCentavos<=0)throw Error('Total inválido.');
 return {cliente:{nome,telefone},observacao,itens,totalCentavos,moeda:'BRL',status:'recebido',pagamento:'a_combinar',estoqueReservado:false};
}
export const chavePedidoCommerce=(uid,key)=>{
 if(!/^[a-zA-Z0-9_-]{16,80}$/.test(key||''))throw Error('Identificador de envio inválido.');
 return createHash('sha256').update(uid+'|'+key).digest('hex').slice(0,32);
};
export const assinaturaPedidoCommerce=input=>createHash('sha256').update(JSON.stringify({nome:input.nome,telefone:input.telefone,observacao:input.observacao||'',aceiteContato:input.aceiteContato,itens:input.itens})).digest('hex');
export function respostaPedidoCommerce(pedido,id,whatsapp){
 const total=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(pedido.totalCentavos/100);
 const mensagem=`Olá! Enviei o pedido ${id.slice(0,10).toUpperCase()} pela loja online.\n`+pedido.itens.map(p=>`${p.quantidade} × ${p.nome}`).join('\n')+`\nProdutos: ${total}. Aguardo confirmação de disponibilidade, entrega e pagamento.`;
 return {id,status:pedido.status,totalCentavos:pedido.totalCentavos,moeda:'BRL',estoqueReservado:false,whatsappUrl:`https://wa.me/${telefoneCommerce(whatsapp)}?text=${encodeURIComponent(mensagem)}`};
}
