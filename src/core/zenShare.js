// ZenOS Share V2 — PDF local. Não publica arquivos nem utiliza API paga.
const LABELS={venda:'Comprovante de venda',orcamento:'Orçamento',pre_pedido:'Pré-pedido',recibo:'Comprovante',cobranca:'Cobrança',pedido_fornecedor:'Pedido de fornecedor'};
export function identificarTipoDocumento(d={}){
 const tipo=String(d.tipoDocumento||'').toLowerCase();
 return LABELS[tipo]?tipo:d.estado==='orcamento'?'orcamento':d.estado==='pendente'?'pre_pedido':'venda';
}
export function limparTelefoneInternacional(valor,pais='BR'){
 if(!String(valor||'').trim())return '';
 const str=String(valor).replace(/\D/g,'').replace(/^00/,'');if(!str||str.length>15)return null;
 const ddi=pais==='PY'?'595':'55',result=str.startsWith(ddi)?str:ddi+str.replace(/^0/,'');
 return /^\d{10,15}$/.test(result)?result:null;
}
const clean=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100);
export function prepararCompartilhamento({documento,perfilLoja={},tipo,telefone='',urlDocumento=''}={}){
 const d=documento||{},t=tipo||identificarTipoDocumento(d);
 if(!LABELS[t])return {ok:false,erro:'Tipo de documento não autorizado.'};
 if(!d.id)return {ok:false,erro:'Salve o documento antes de compartilhar.'};
 const linhas=[clean(perfilLoja.nomeFantasia||'Minha Loja'),LABELS[t]+' nº '+clean(d.id)];
 const total=Number(d.totalBRL??d.valorBRL);
 if((d.totalBRL!=null||d.valorBRL!=null)&&Number.isFinite(total)&&total>=0)
  linhas.push('Valor: '+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(total));
 if(d.dataHora)linhas.push('Data: '+clean(d.dataHora));
 // Nunca incluir automaticamente CPF, fiado, endereço ou dados particulares na mensagem.
 if(urlDocumento){
  try{const u=new URL(urlDocumento);if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('URL inválida');
   linhas.push('Documento: '+u.href);
  }catch{return {ok:false,erro:'Link do documento inválido.'};}
 }
 linhas.push('Comprovante preparado pelo ZenOS.');
 const tel=limparTelefoneInternacional(telefone,perfilLoja.pais||'BR');
 if(tel===null)return {ok:false,erro:'Telefone inválido.'};
 const texto=linhas.join('\n');
 return {ok:true,texto,urlWhatsApp:'https://wa.me/'+(tel||'')+'?text='+encodeURIComponent(texto)};
}
export function salvarArquivoLocal(arquivo,{documento=(typeof document==='undefined'?null:document),URLObject=(typeof URL==='undefined'?null:URL)}={}){
 if(!arquivo||!documento||!URLObject||typeof URLObject.createObjectURL!=='function')return false;
 const href=URLObject.createObjectURL(arquivo);
 const link=documento.createElement('a');link.href=href;link.download=arquivo.name||'ZenOS-Comprovante.pdf';link.rel='noopener';link.style.display='none';
 documento.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URLObject.revokeObjectURL(href),60000);
 return true;
}
export async function compartilharDocumento({documento,perfilLoja,tipo,telefone,urlDocumento,arquivoPdf=null,navegador=(typeof navigator==='undefined'?{}:navigator),abrir,salvar=salvarArquivoLocal}={}){
 const dado=prepararCompartilhamento({documento,perfilLoja,tipo,telefone,urlDocumento});if(!dado.ok)return dado;
 if(!arquivoPdf)return {ok:false,erro:'PDF ainda não está disponível.'};
 if(typeof navegador.canShare==='function'&&typeof navegador.share==='function'){
  let suporta=false;try{suporta=navegador.canShare({files:[arquivoPdf]});}catch{}
  if(suporta){
   try{await navegador.share({files:[arquivoPdf],title:'Comprovante ZenOS',text:dado.texto});
     return {ok:true,canal:'nativo',arquivoIncluido:true,aviso:'Arquivo compartilhado. Confira o destinatário.'};
   }catch(e){return {ok:false,cancelado:e?.name==='AbortError',erro:e?.name==='AbortError'?'Compartilhamento cancelado.':'Não foi possível compartilhar o PDF.'};}
  }
 }
 // Desktop não possui API universal para anexar PDF ao WhatsApp Web.
 const baixado=salvar(arquivoPdf);
 if(!baixado)return {ok:false,erro:'Não foi possível baixar o comprovante. Nenhum envio foi iniciado.'};
 const abrirUrl=abrir||(typeof window==='undefined'?null:url=>window.open(url,'_blank','noopener,noreferrer'));
 if(!abrirUrl)return {ok:true,canal:'download',arquivoIncluido:false,aviso:'PDF baixado. Envie-o como anexo no WhatsApp.'};
 const popup=abrirUrl(dado.urlWhatsApp);
 return {ok:true,canal:'download+whatsapp',arquivoIncluido:false,
  aviso:popup===null?'PDF salvo. Abra o WhatsApp e anexe o arquivo baixado.':'PDF salvo e WhatsApp aberto. Anexe o arquivo baixado para enviar o cupom completo.'};
}
