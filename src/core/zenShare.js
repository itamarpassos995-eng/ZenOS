// Mensagem WhatsApp gratuita, sem API, sem enviar nem publicar documentos privados.
const LABELS={venda:'Comprovante de venda',orcamento:'Orçamento',pre_pedido:'Pré-pedido',recibo:'Comprovante'};
export function identificarTipoDocumento(d={}) { const t=String(d.tipoDocumento||'').toLowerCase();return LABELS[t]?t:d.estado==='orcamento'?'orcamento':d.estado==='pendente'?'pre_pedido':'venda'; }
export function limparTelefoneInternacional(valor,pais='BR') {
  if(!String(valor||'').trim())return '';
  const a=String(valor).replace(/\D/g,'').replace(/^00/,''); if(!a||a.length>15)return null;
  const ddi=pais==='PY'?'595':'55';const n=a.startsWith(ddi)?a:ddi+a.replace(/^0/,'');
  return /^\d{10,15}$/.test(n)?n:null;
}
const seguro=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100);
export function prepararCompartilhamento({documento,perfilLoja={},tipo,telefone='',urlDocumento=''}={}) {
  const d=documento||{};const t=tipo||identificarTipoDocumento(d);if(!LABELS[t])return {ok:false,erro:'Documento não permitido.'};
  if(!d.id)return {ok:false,erro:'Salve o documento antes de compartilhar.'};
  const linhas=[seguro(perfilLoja.nomeFantasia||'Minha Loja'),LABELS[t]+' nº '+seguro(d.id)];
  const total=Number(d.totalBRL??d.valorBRL);
  if((d.totalBRL!=null||d.valorBRL!=null)&&Number.isFinite(total)&&total>=0)linhas.push('Valor: '+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(total));
  if(d.dataHora)linhas.push('Data: '+seguro(d.dataHora));
  // NUNCA incluir saldo de fiado, CPF ou endereço; links somente se explicitamente autorizados.
  if(urlDocumento){try{const u=new URL(urlDocumento);if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error();linhas.push('Documento: '+u.href);}catch{return {ok:false,erro:'Link HTTPS inválido.'};}}
  linhas.push('Mensagem enviada pelo ZenOS.');
  const tel=limparTelefoneInternacional(telefone,perfilLoja.pais||'BR');if(tel===null)return {ok:false,erro:'Telefone inválido.'};
  const texto=linhas.join('\n');
  return {ok:true,texto,urlWhatsApp:'https://wa.me/'+(tel||'')+'?text='+encodeURIComponent(texto),temArquivo:false};
}
export async function compartilharDocumento({documento,perfilLoja,tipo,telefone,urlDocumento,arquivoPdf=null,navegador=(typeof navigator==='undefined'?{}:navigator),abrir}={}) {
  const r=prepararCompartilhamento({documento,perfilLoja,tipo,telefone,urlDocumento});if(!r.ok)return r;
  if(arquivoPdf&&typeof navegador.share==='function'&&typeof navegador.canShare==='function'&&navegador.canShare({files:[arquivoPdf]})){
    try{await navegador.share({files:[arquivoPdf],title:'Documento ZenOS',text:r.texto});return {ok:true,canal:'nativo',arquivoIncluido:true,aviso:'Selecione o WhatsApp para enviar o documento.'};}
    catch(e){return {ok:false,cancelado:e?.name==='AbortError',erro:'Compartilhamento cancelado ou indisponível.'};}
  }
  const abrirUrl=abrir||(typeof window!=='undefined'?url=>window.open(url,'_blank','noopener,noreferrer'):null);
  if(!abrirUrl)return {ok:false,erro:'Navegador indisponível.'};
  const popup=abrirUrl(r.urlWhatsApp);if(popup===null)return {ok:false,erro:'O navegador bloqueou a janela do WhatsApp.'};
  return {ok:true,canal:'whatsapp',arquivoIncluido:false,aviso:'WhatsApp aberto com a mensagem. Para anexar PDF, salve uma cópia pelo menu Imprimir e anexe manualmente.'};
}
