import assert from 'node:assert/strict';
import {gerarPdfComprovante} from '../src/core/zenReceiptPdf.js';
import {prepararCompartilhamento,compartilharDocumento} from '../src/core/zenShare.js';
import {readFileSync} from 'node:fs';

const venda={
 id:'VENDA-TESTE-001',tipoDocumento:'venda',dataHora:'15/10/2026 16:39:11',
 clienteNome:'Consumidor',cpf:'123.456.789-00',saldoDevedorBRL:900,
 totalBRL:3523.20,descontoBRL:10,
 itens:[{nome:'ARGAMASSA TESTE',qtd:48,precoPraticadoBRL:35.45,totalBRL:1701.60},
 {nome:'PRODUTO 2',qtd:2,precoPraticadoBRL:910.8,totalBRL:1821.6}],
 pagamentos:[{rotulo:'Dinheiro (BRL)',moedaOrigem:'BRL',valorOriginal:3523.20,valorConvertidoBRL:3523.20}],
};
const perfil={nomeFantasia:'Loja de testes',pais:'BR',rodapeRecibo:'Obrigado pela preferência!'};
const result=await gerarPdfComprovante(venda,perfil);
assert.ok(result.bytes.length>1200);
const body=Buffer.from(result.bytes).toString('latin1');
assert.ok(body.startsWith('%PDF-1.4'));
assert.ok(body.includes('VENDA-TESTE-001'));
assert.ok(body.includes('3.523,20'));
assert.ok(body.includes('ARGAMASSA TESTE'));
assert.ok(body.includes('DOCUMENTO N'));
assert.ok(body.endsWith('%%EOF\n'));
assert.equal(result.paginas,1);
const multi=await gerarPdfComprovante({...venda,itens:Array.from({length:180},(_,i)=>({
 nome:'PRODUTO TESTE '+(i+1)+' COM NOME DE TAMANHO VARIAVEL',qtd:1,precoPraticadoBRL:1
}))},perfil);
assert.ok(multi.paginas>=3,'PDF extenso deve paginar');
await assert.rejects(()=>gerarPdfComprovante({...venda,tipoDocumento:'nfce'},perfil),/fiscais/);
const prep=prepararCompartilhamento({documento:venda,perfilLoja:perfil});
assert.equal(prep.ok,true);
assert.ok(!prep.texto.includes('123.456.789'));
assert.ok(!prep.texto.includes('900'));
assert.ok(prep.urlWhatsApp.startsWith('https://wa.me/'));
const file=new File([result.bytes],result.nome,{type:'application/pdf'});
let native=0,download=0;
const nativeResult=await compartilharDocumento({documento:venda,perfilLoja:perfil,arquivoPdf:file,navegador:{
 canShare:()=>true,share:async()=>{native++}
},salvar:()=>{throw Error('download não deveria ocorrer')}});
assert.equal(nativeResult.arquivoIncluido,true);
assert.equal(native,1);
const fallback=await compartilharDocumento({documento:venda,perfilLoja:perfil,arquivoPdf:file,navegador:{},
 salvar:()=>{download++;return true;},abrir:url=>{assert.ok(url.startsWith('https://wa.me/'));return {}; }});
assert.equal(fallback.arquivoIncluido,false);
assert.equal(download,1);
assert.ok(fallback.aviso.includes('Anexe'));
const cancel=await compartilharDocumento({documento:venda,perfilLoja:perfil,arquivoPdf:file,navegador:{
 canShare:()=>true,share:async()=>{const error=new Error('Cancel');error.name='AbortError';throw error;}
}});
assert.equal(cancel.cancelado,true);
assert.equal(prepararCompartilhamento({documento:venda,urlDocumento:'http://example.com'}).ok,false);
const pdv=readFileSync(new URL('../src/components/PDV.jsx',import.meta.url),'utf8');
const sales=readFileSync(new URL('../src/components/Vendas.jsx',import.meta.url),'utf8');
for(const src of [pdv,sales]){
 assert.ok(src.includes('ZenShareButton'));
 assert.ok(src.includes("gridTemplateColumns:'repeat(3, minmax(0, 1fr))'"));
 assert.ok(src.includes('height:62'));
}
console.log('ZenOS Share V2: PDF, paginação, isolamento, desktop, nativo e botões verificados.');
