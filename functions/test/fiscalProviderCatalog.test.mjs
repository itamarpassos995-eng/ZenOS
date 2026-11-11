import test from 'node:test';
import assert from 'node:assert/strict';
import {DOCUMENTOS_CONFIGURACAO,provedoresDoPais,validarEscolhaIntegracao,coberturaConfigurada} from '../src/fiscalProviderCatalog.js';
import {validarConfiguracaoFiscal,avaliarConfiguracaoFiscal} from '../src/fiscalAtivacaoCore.js';
const cadastro={razonSocial:'Empresa teste',ruc:'80012345',email:'teste@example.invalid'};
test('catálogo separa países sem chamadas externas e mantém documentos brasileiros',()=>{
 assert.deepEqual(DOCUMENTOS_CONFIGURACAO.BR,['nfce','nfe','nfse']);
 assert.deepEqual(provedoresDoPais('PY').map(p=>p.id),['sifende','kuota']);
 assert(provedoresDoPais('BR').every(p=>p.pais==='BR'));
 assert.throws(()=>validarEscolhaIntegracao('PY',{modalidade:'propria',provedor:'focus'}));
 assert.throws(()=>validarEscolhaIntegracao('BR',{modalidade:'propria',provedor:'sifende'}));
 assert.throws(()=>validarEscolhaIntegracao('BR',{modalidade:'propria',provedor:'https://untrusted.invalid'}));
});
test('padrão é resolvido no servidor e campos de ativação/chaves são descartados',()=>{
 assert.deepEqual(validarEscolhaIntegracao('PY',{modalidade:'zenos',provedor:'focus',apiKey:'NAO_SALVAR',homologado:true}),{versao:1,modalidade:'zenos',provedor:'sifende'});
 assert.equal(validarEscolhaIntegracao('BR',{modalidade:'zenos'}).provedor,'focus');
});
test('cliente pode solicitar quatro documentos PY sem habilitar emissão',()=>{
 for(const provedor of ['sifende','kuota']){
  const result=validarConfiguracaoFiscal({pais:'PY',cadastro,aceiteConfiguracao:true,tiposDocumento:DOCUMENTOS_CONFIGURACAO.PY,integracao:{modalidade:'propria',provedor}});
  assert.equal(result.tiposDocumento.length,4);assert.equal(result.integracao.provedor,provedor);
  assert.equal(avaliarConfiguracaoFiscal(result).emissaoHabilitada,false);
  assert(coberturaConfigurada(result).documentos.every(d=>d.emissaoHabilitada===false));
 }
});
test('legado continua separado e tipos de configuração não liberam gateway de emissão',async()=>{
 const {TIPOS_FISCAIS}=await import('../../src/core/fiscalCore.js');
 assert.deepEqual(TIPOS_FISCAIS.PY,['factura_electronica']);
 assert.equal(avaliarConfiguracaoFiscal({pais:'BR'}).provedor,'focus');
 assert.equal(avaliarConfiguracaoFiscal({pais:'PY'}).provedor,null);
 assert.throws(()=>validarConfiguracaoFiscal({pais:'PY',cadastro,aceiteConfiguracao:true,tiposDocumento:['nfe']}));
});
