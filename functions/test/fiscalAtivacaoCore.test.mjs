import test from 'node:test';
import assert from 'node:assert/strict';
import {validarConfiguracaoFiscal,avaliarConfiguracaoFiscal,prepararCadastroFocus} from '../src/fiscalAtivacaoCore.js';
import {validarEmpresaFocus} from '../src/fiscalFocusOnboarding.js';
const cadastro={razaoSocial:'Teste controlado',cnpj:'11222333000181',email:'teste@example.invalid',regimeTributario:'1',uf:'SP',municipio:'São Paulo',municipioCodigoIbge:'3550308',logradouro:'Rua Teste',numero:'10',bairro:'Centro',cep:'01001000',inscricaoEstadual:'ISENTO'};
const configurar=extra=>validarConfiguracaoFiscal({pais:'BR',cadastro,tiposDocumento:['nfce'],aceiteConfiguracao:true,...extra});
test('exige aceite e documento compatível com país',()=>{
 assert.throws(()=>configurar({aceiteConfiguracao:false}));
 assert.throws(()=>configurar({tiposDocumento:['factura_electronica']}));
 assert.throws(()=>configurar({tiposDocumento:[]}));
});
test('recusa município de outro estado e regime inválido',()=>{
 assert.throws(()=>configurar({cadastro:{...cadastro,uf:'PR'}}));
 assert.throws(()=>configurar({cadastro:{...cadastro,regimeTributario:'999'}}));
 assert.throws(()=>configurar({cadastro:{...cadastro,cep:'123'}}));
});
test('credenciais e sinalização de ativação do cliente não são persistidas',()=>{
 const r=configurar({habilitado:true,provedorHomologado:true,cadastro:{...cadastro,apiKey:'NAO_PERSISTIR',senha_certificado:'NAO_PERSISTIR'}});
 assert(!JSON.stringify(r).includes('NAO_PERSISTIR'));
 assert.equal(avaliarConfiguracaoFiscal(r).emissaoHabilitada,false);
});
test('cadastro completo e provedor validado não ativam emissão',()=>{
 const r=avaliarConfiguracaoFiscal({...configurar(),validacaoProvedor:{cadastroValidado:true,codigo:'FOCUS_CADASTRO_VALIDADO',token_producao:'NAO_EXPOR'}});
 assert.equal(r.cadastroCompleto,true);assert.equal(r.etapas[1].estado,'concluido');assert.equal(r.emissaoHabilitada,false);
 assert(!JSON.stringify(r).includes('NAO_EXPOR'));
 assert(r.etapas.some(step=>step.codigo==='emissao_validada'&&step.estado==='pendente'));
});
test('NFS-e exige inscrição municipal e código de serviço',()=>{
 const r=avaliarConfiguracaoFiscal(configurar({tiposDocumento:['nfse']}));
 assert(r.etapas[0].camposAusentes.includes('inscricaoMunicipal'));assert(r.etapas[0].camposAusentes.includes('codigoServico'));
});
test('Paraguai mantém dados e documento separados do Brasil',()=>{
 const r=validarConfiguracaoFiscal({pais:'PY',cadastro:{razonSocial:'Prueba',ruc:'12345678',email:'teste@example.invalid'},tiposDocumento:['factura_electronica'],aceiteConfiguracao:true});
 assert.equal(avaliarConfiguracaoFiscal(r).provedor,null);assert.equal(avaliarConfiguracaoFiscal(r).emissaoHabilitada,false);
 assert.throws(()=>validarConfiguracaoFiscal({...r,tiposDocumento:['nfe']}));
});
test('mapeamento de empresa Focus mantém todos os documentos desabilitados',()=>{
 const r=prepararCadastroFocus(cadastro);assert.equal(r.habilita_nfe,false);assert.equal(r.habilita_nfce,false);assert.equal(r.habilita_nfse,false);assert.equal(r.habilita_nfsen_producao,false);assert.equal(r.certificado_especifico,true);
});
test('Focus valida com dry_run e não retorna tokens ou respostas privadas',async()=>{
 const result=await validarEmpresaFocus({cadastro,token:'TOKEN_TESTE_FICTICIO',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.focusnfe.com.br/v2/empresas?dry_run=1');assert.equal(options.redirect,'error');
  assert.equal(JSON.parse(options.body).habilita_nfce,false);
  return {ok:true,status:200,json:async()=>({cnpj:cadastro.cnpj,token_producao:'NAO_EXPOR',token_homologacao:'NAO_EXPOR'})};
 }});assert.deepEqual(result,{cadastroValidado:true,codigo:'FOCUS_CADASTRO_VALIDADO'});assert(!JSON.stringify(result).includes('NAO_EXPOR'));
});
test('sem credencial não realiza chamadas externas',async()=>{
 let chamadas=0;const r=await validarEmpresaFocus({cadastro,token:null,fetchImpl:async()=>{chamadas++;}});assert.equal(chamadas,0);assert.equal(r.codigo,'FOCUS_CONTA_PENDENTE');
});
test('resposta divergente, rejeição e timeout falham sem expor dados do provedor',async()=>{
 for(const response of [{ok:true,status:200,json:async()=>({cnpj:'00000000000000'})},{ok:false,status:401,json:async()=>({message:'TOKEN_NAO_EXPOR'})}]){
  const r=await validarEmpresaFocus({cadastro,token:'TOKEN_TESTE_FICTICIO',fetchImpl:async()=>response});assert.equal(r.cadastroValidado,false);assert(!JSON.stringify(r).includes('TOKEN_NAO_EXPOR'));
 }
 const r=await validarEmpresaFocus({cadastro,token:'TOKEN_TESTE_FICTICIO',fetchImpl:async()=>{throw Error('TOKEN_NAO_EXPOR');}});assert.deepEqual(r,{cadastroValidado:false,codigo:'FOCUS_INDISPONIVEL'});
});
