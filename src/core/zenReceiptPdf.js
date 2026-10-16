/* ZenOS Share V2: PDF não fiscal, 100% local, sem pagamentos, Firestore ou bibliotecas externas.
   Valores originam-se exclusivamente do snapshot salvo. */
const W=595.28,H=841.89,M=42;
const money=(n,moeda='BRL')=>Number.isFinite(Number(n))?new Intl.NumberFormat('pt-BR',{minimumFractionDigits:moeda==='PYG'?0:2,maximumFractionDigits:moeda==='PYG'?0:2}).format(Number(n))+' '+moeda:'—';
const clean=(v,n=160)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const cp1252=new Map([[8364,128],[8216,145],[8217,146],[8220,147],[8221,148],[8226,149],[8211,150],[8212,151],[8230,133]]);
function encoded(s){const a=[];for(const c of String(s)){const n=c.codePointAt(0);a.push(n<=255?n:(cp1252.get(n)??63));}return Uint8Array.from(a);}
function join(a){const n=a.reduce((s,b)=>s+b.length,0),u=new Uint8Array(n);let p=0;for(const b of a){u.set(b,p);p+=b.length;}return u;}
function esc(s){return clean(s,999).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function pdf(pages,logo){
 const objects=[null],reserve=(x)=>{objects.push(x);return objects.length-1;};
 const catalog=reserve(null),root=reserve(null),font=reserve(encoded('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
 const bold=reserve(encoded('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
 let img=0;
 if(logo)img=reserve(join([encoded('<< /Type /XObject /Subtype /Image /Width '+logo.w+' /Height '+logo.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+logo.data.length+' >>\nstream\n'),logo.data,encoded('\nendstream')]));
 const ids=[];
 for(const commands of pages){
  const stream=encoded(commands.join('\n')+'\n');
  const contents=reserve(join([encoded('<< /Length '+stream.length+' >>\nstream\n'),stream,encoded('endstream')]));
  ids.push(reserve(encoded('<< /Type /Page /Parent '+root+' 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 '+font+' 0 R /F2 '+bold+' 0 R >> '+(img?'/XObject << /Logo '+img+' 0 R >>':'')+' >> /Contents '+contents+' 0 R >>')));
 }
 objects[catalog]=encoded('<< /Type /Catalog /Pages '+root+' 0 R >>');
 objects[root]=encoded('<< /Type /Pages /Kids ['+ids.map(v=>v+' 0 R').join(' ')+'] /Count '+ids.length+' >>');
 const parts=[encoded('%PDF-1.4\n%ZenOS\n')],offsets=[0];let n=parts[0].length;
 for(let k=1;k<objects.length;k++){offsets[k]=n;const item=join([encoded(k+' 0 obj\n'),objects[k],encoded('\nendobj\n')]);parts.push(item);n+=item.length;}
 const start=n;parts.push(encoded('xref\n0 '+objects.length+'\n0000000000 65535 f \n'));
 for(let k=1;k<objects.length;k++)parts.push(encoded(String(offsets[k]).padStart(10,'0')+' 00000 n \n'));
 parts.push(encoded('trailer\n<< /Root '+catalog+' 0 R /Size '+objects.length+' >>\nstartxref\n'+start+'\n%%EOF\n'));
 return join(parts);
}
async function imageForPdf(src,env={}){
 if(typeof src!=='string'||!(/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/i.test(src)))return null;
 const Img=env.Image||(typeof Image==='undefined'?null:Image);
 const canvas=env.createCanvas||(typeof document==='undefined'?null:()=>document.createElement('canvas'));
 if(!Img||!canvas)return null;
 try{
  const im=await new Promise((ok,fail)=>{const a=new Img();a.crossOrigin='anonymous';a.onload=()=>ok(a);a.onerror=()=>fail(new Error('Imagem indisponível'));a.src=src;});
  const origW=im.naturalWidth||im.width,origH=im.naturalHeight||im.height;
  if(!origW||!origH)return null;
  const w=Math.min(480,origW),h=Math.max(1,Math.round(w*origH/origW));
  const c=canvas();c.width=w;c.height=h;
  const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(im,0,0,w,h);
  const base64=c.toDataURL('image/jpeg',0.88).split(',')[1];
  const decode=env.atob||(typeof atob==='undefined'?null:atob);if(!decode)return null;
  return {w,h,data:Uint8Array.from(decode(base64),x=>x.charCodeAt(0))};
 }catch{return null;}
}
export async function gerarPdfComprovante(doc,loja={},ambiente={}){
 if(!doc?.id)throw new Error('Salve o documento antes de gerar o PDF.');
 if(['nfe','nfce','nota_fiscal','factura_fiscal'].includes(String(doc.tipoDocumento||'').toLowerCase())||doc.chaveAcessoFiscal)
  throw new Error('Documentos fiscais devem utilizar o PDF oficial do emissor.');
 const nome=clean(doc.id,70).replace(/[^a-z0-9_-]/gi,'-');
 const logo=await imageForPdf(loja.mostrarLogoRecibo===false?'':loja.logoLoja,ambiente);
 const titles={venda:'COMPROVANTE DE VENDA',orcamento:'ORÇAMENTO',pre_pedido:'PRÉ-PEDIDO'};
 const tipo=doc.tipoDocumento||(doc.estado==='orcamento'?'orcamento':doc.estado==='pendente'?'pre_pedido':'venda');
 const pages=[];let commands=[],y=H-M;
 const q=n=>Number(n.toFixed(2));
 const newPage=()=>{if(commands.length)pages.push(commands);commands=[];y=H-M;};
 const reserve=n=>{if(y-n<70)newPage();};
 const put=(s,x,yy,size=10,strong=false)=>commands.push('BT /'+(strong?'F2':'F1')+' '+size+' Tf 0 g 1 0 0 1 '+q(x)+' '+q(yy)+' Tm ('+esc(s)+') Tj ET');
 const right=(s,x,yy,size=10,strong=false)=>put(s,Math.max(M,x-clean(s).length*size*(strong?.54:.50)),yy,size,strong);
 const line=()=>commands.push('0.74 G 0.6 w '+M+' '+q(y)+' m '+q(W-M)+' '+q(y)+' l S');
 const add=(s,size=10,strong=false,space=17)=>{reserve(space);put(s,M,y,size,strong);y-=space;};
 const wrap=(s,max=55)=>{const words=clean(s,500).split(' ');const arr=[];let current='';for(const word of words){const part=(current+' '+word).trim();if(part.length>max&&current){arr.push(current);current=word;}else current=part;}if(current)arr.push(current);return arr.length?arr:[''];};
 if(logo){const pw=Math.min(105,logo.w/3.5),ph=Math.min(58,pw*logo.h/logo.w);commands.push('q '+q(pw)+' 0 0 '+q(ph)+' '+M+' '+q(y-ph)+' cm /Logo Do Q');y-=ph+15;}
 add(clean(loja.nomeFantasia||'ZenOS — SISTEMA DE GESTÃO',70),15,true,25);
 if(loja.mostrarEnderecoRecibo!==false&&loja.endereco)add(clean(loja.endereco,90),9);
 if(loja.mostrarTelefoneRecibo!==false&&loja.telefone)add('Telefone: '+clean(loja.telefone,45),9);
 line();y-=24;add(titles[tipo]||'COMPROVANTE',14,true,23);
 add('Documento: '+clean(doc.id,100),10,true);
 if(doc.dataHora||doc.createdAt)add('Data: '+clean(doc.dataHora||doc.createdAt,60),9);
 if(doc.clienteNome&&doc.clienteNome!=='Consumidor Balcão')add('Cliente: '+clean(doc.clienteNome,95),9);
 y-=7;line();y-=21;add('ITENS',11,true,21);
 put('Qtd',M,y,9,true);put('Descrição',M+52,y,9,true);right('Unitário',W-M-95,y,9,true);right('Total',W-M,y,9,true);y-=12;line();y-=16;
 for(const item of Array.isArray(doc.itens)?doc.itens:[]){
  const desc=wrap(item.nome||'Item',38),qtd=Number(item.qtd),unit=Number(item.precoPraticadoBRL??item.precoBRL);
  const persisted=item.totalBRL??item.totalItemBRL;
  const total=persisted==null?(Number.isFinite(qtd)&&Number.isFinite(unit)?qtd*unit:NaN):Number(persisted);
  reserve(Math.max(28,desc.length*14+8));
  put(Number.isFinite(qtd)?String(qtd):'—',M,y,9);
  desc.forEach((text,i)=>put(text,M+52,y-14*i,9));
  right(money(unit),W-M-95,y,8);right(money(total),W-M,y,8);
  y-=Math.max(28,desc.length*14+8);
 }
 reserve(80);line();y-=22;
 if(doc.descontoGlobalBRL!=null||doc.descontoBRL!=null){put('Desconto registrado',M,y,9);right(money(doc.descontoGlobalBRL??doc.descontoBRL),W-M,y,9);y-=19;}
 put('TOTAL OFICIAL',M,y,12,true);right(doc.totalBRL!=null?money(doc.totalBRL):'—',W-M,y,12,true);y-=30;
 if(Array.isArray(doc.pagamentos)&&doc.pagamentos.length){
  add('PAGAMENTOS REGISTRADOS',10,true,20);
  for(const p of doc.pagamentos){reserve(19);const coin=['BRL','USD','EUR','PYG'].includes(p.moedaOrigem)?p.moedaOrigem:null;
   const value=coin&&p.valorOriginal!=null?money(p.valorOriginal,coin):p.valorConvertidoBRL!=null?money(p.valorConvertidoBRL):'—';
   put(clean(p.rotulo||p.formaId||'Pagamento',42),M,y,9);right(value,W-M,y,9);y-=18;
  }
 }
 if(Number(doc.trocoBRL)>0){reserve(21);const coin=['BRL','USD','EUR','PYG'].includes(doc.moedaTrocoInfo)?doc.moedaTrocoInfo:'BRL';
   const value=doc.trocoOriginal!=null?money(doc.trocoOriginal,coin):coin==='BRL'?money(doc.trocoBRL):'indisponível';
   put('Troco registrado',M,y,10,true);right(value,W-M,y,10,true);y-=22;
 }
 y-=9;reserve(60);line();y-=20;
 for(const t of wrap(loja.rodapeRecibo||'Obrigado pela preferência!',90))add(t,9,false,14);
 add('DOCUMENTO NÃO FISCAL — NÃO SUBSTITUI NOTA FISCAL.',8,true);
 pages.push(commands);
 const bytes=pdf(pages,logo);
 return {nome:'ZenOS-'+nome+'.pdf',bytes,blob:new Blob([bytes],{type:'application/pdf'}),paginas:pages.length,logoIncluida:!!logo};
}
