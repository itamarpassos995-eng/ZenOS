import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({stores:new Map(),reads:0,writes:0,network:0}));
vi.mock('../../functions/src/firebaseAdmin.js',()=>({obterAdminFirestore:async()=>({
 doc:path=>({path,get:async()=>{mocks.reads++;return {exists:mocks.stores.has(path),data:()=>mocks.stores.get(path)};}}),
 runTransaction:async callback=>callback({
  get:async ref=>{mocks.reads++;return {exists:mocks.stores.has(ref.path),data:()=>mocks.stores.get(ref.path)};},
  set:(ref,value)=>{mocks.writes++;mocks.stores.set(ref.path,value);},
  create:(ref,value)=>{mocks.writes++;mocks.stores.set(ref.path,value);},
  update:(ref,value)=>{mocks.writes++;mocks.stores.set(ref.path,{...mocks.stores.get(ref.path),...value});},
 }),
})}));
vi.mock('../../functions/src/fiscalAuthorization.js',()=>({resolverLojaFiscalAutorizada:async({auth,requestedLojaId})=>{if(auth.uid!==requestedLojaId)throw Error('tenant denied');return requestedLojaId;}}));
vi.mock('../../functions/src/fiscalFocusOnboarding.js',()=>({obterTokenFocus:async()=>{mocks.network++;throw Error('must not call');},validarEmpresaFocus:async()=>{mocks.network++;throw Error('must not call');}}));
vi.mock('../../functions/src/fiscalCredenciaisVault.js',()=>({lerCredenciais:vi.fn(),guardarCredenciais:vi.fn(),removerCredenciais:vi.fn()}));
import {fiscalSolicitacaoCliente} from '../../functions/src/fiscalSolicitacaoCliente.js';
const config={action:'configurar',lojaId:'store-A',pais:'PY',cadastro:{razonSocial:'Teste',ruc:'80012345',email:'teste@example.invalid'},tiposDocumento:['factura_electronica','nota_remision_electronica'],integracao:{modalidade:'propria',provedor:'kuota'},aceiteConfiguracao:true};
const request=(data=config,uid='store-A')=>({auth:{uid},data});
beforeEach(()=>{mocks.stores.clear();mocks.reads=0;mocks.writes=0;mocks.network=0;});
it('salva preferência junto ao cadastro em uma leitura de configuração e uma gravação, sem rede fiscal',async()=>{
 const result=await fiscalSolicitacaoCliente.run(request());
 expect(result.integracao).toEqual({versao:1,modalidade:'propria',provedor:'kuota'});
 expect(result.versaoConfiguracao).toBe(2);expect(result.habilitado).toBe(false);
 expect(mocks.reads).toBe(1);expect(mocks.writes).toBe(1);expect(mocks.network).toBe(0);
 const current=mocks.stores.get('lojas/store-A/fiscal_configuracao/solicitacao');
 await fiscalSolicitacaoCliente.run(request());expect(mocks.reads).toBe(2);expect(mocks.writes).toBe(1);
 expect(mocks.stores.get('lojas/store-A/fiscal_configuracao/solicitacao')).toBe(current);
});
it('mudar provedor invalida aprovação anterior, sem gravar noutra loja',async()=>{
 await fiscalSolicitacaoCliente.run(request());
 const ref='lojas/store-A/fiscal_configuracao/solicitacao';
 mocks.stores.set(ref,{...mocks.stores.get(ref),validacaoProvedor:{cadastroValidado:true},compartilhamentoFocus:{por:'old'}});
 const result=await fiscalSolicitacaoCliente.run(request({...config,integracao:{modalidade:'propria',provedor:'sifende'}}));
 expect(result.integracao.provedor).toBe('sifende');expect(result.ativacao.validacaoProvedor).toBeNull();
 expect(mocks.stores.size).toBe(1);expect(mocks.network).toBe(0);
});
it('recusa outro tenant, país incompatível e alteração em configuração ativa',async()=>{
 await expect(fiscalSolicitacaoCliente.run(request(config,'other'))).rejects.toThrow('tenant denied');
 await expect(fiscalSolicitacaoCliente.run(request({...config,integracao:{modalidade:'propria',provedor:'focus'}}))).rejects.toThrow();
 expect(mocks.reads).toBe(0);expect(mocks.writes).toBe(0);
 const ref='lojas/store-A/fiscal_configuracao/solicitacao';mocks.stores.set(ref,{status:'ativo',habilitado:true});
 await expect(fiscalSolicitacaoCliente.run(request())).rejects.toThrow();expect(mocks.writes).toBe(0);
});
it('consultar não escreve nem transmite; cadastro PY não usa validação brasileira',async()=>{
 const empty=await fiscalSolicitacaoCliente.run(request({action:'consultar',lojaId:'store-A'}));
 expect(empty.versaoConfiguracao).toBe(2);expect(mocks.reads).toBe(1);expect(mocks.writes).toBe(0);
 await fiscalSolicitacaoCliente.run(request());
 await expect(fiscalSolicitacaoCliente.run(request({action:'validarConfiguracao',lojaId:'store-A',aceiteCompartilhamentoFocus:true}))).rejects.toThrow();
 expect(mocks.network).toBe(0);
});
