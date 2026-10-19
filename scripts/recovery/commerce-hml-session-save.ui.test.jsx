import React from 'react';
import {test,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,waitFor,fireEvent,cleanup} from '@testing-library/react';
const mocks=vi.hoisted(()=>({auth:vi.fn(),session:vi.fn(),calls:vi.fn(),signOut:vi.fn(),lastSave:null}));
vi.mock('../../src/core/runtimeEnvironment',()=>({ZENOS_RUNTIME:{isCloudCommerceHml:true}}));
vi.mock('../../src/core/commerceZenOSSession',()=>({
 ponteCommerceZenOSHabilitada:true,obterAuthCommerceZenOS:()=>({app:{}}),
 callableCommerceZenOS:()=>mocks.calls,observarSessaoCommerceZenOS:()=>()=>{}
}));
vi.mock('../../src/core/commerceOperatorAuth',()=>({
 obterSessaoOperadorCommerce:()=>{throw Error('Não pedir segunda conta');},
 entrarOperadorCommerce:()=>{throw Error('Não pedir Google');}
}));
vi.mock('firebase/auth',()=>({
 onAuthStateChanged:(_auth,fn)=>{fn({uid:'loja-HML'});return ()=>{};},
 signOut:mocks.signOut
}));
vi.mock('../../src/components/ZenCommerceStudio',()=>({
 default:({onSalvarRascunho})=><div><p>Studio desbloqueado</p>
  <button type="button" disabled={!onSalvarRascunho} onClick={async()=>{
   mocks.lastSave=await onSalvarRascunho({aparencia:{nomeLoja:'Teste'},regras:{'HML-PDV-001':{publicado:true}}});
  }}>Salvar rascunho simulado</button>
 </div>
}));
import Portal from '../../src/components/ZenCommercePortal.jsx';
beforeEach(()=>{mocks.lastSave=null;mocks.calls.mockReset();});
afterEach(()=>{cleanup();vi.clearAllMocks();});
test('HML não oferece editor se callable consultar não autorizou a sessão',async()=>{
 mocks.calls.mockRejectedValue(Error('Acesso à Loja Online ainda não confirmado'));
 render(<Portal integrado userId="loja-HML" operadorAtivo={{id:'admin'}} nuvemSincronizada produtos={[]}/>);
 const alert=await screen.findByRole('alert');
 expect(alert.textContent).toContain('Loja Online ainda não conectada para salvar');
 expect(alert.textContent).toContain('Acesso à Loja Online ainda não confirmado');
 expect(screen.queryByText('Studio desbloqueado')).toBeNull();
 expect(screen.queryByRole('button',{name:'Salvar rascunho simulado'})).toBeNull();
});
test('HML com sessão validada salva com revisão do servidor e sem publicar',async()=>{
 mocks.calls.mockImplementation(async data=>{
  if(data.action==='consultar')return {data:{lojaId:'loja-HML',contratoHml:'zenos-commerce-tenant-20261019-v1',revision:0,regras:{},licenca:{status:'ativo',ativacaoConfirmadaServidor:true}}};
  if(data.action==='listarPedidos')return {data:{lojaId:'loja-HML',contratoHml:'zenos-commerce-tenant-20261019-v1',pedidos:[]}};
  if(data.action==='salvarRascunho')return {data:{lojaId:'loja-HML',contratoHml:'zenos-commerce-tenant-20261019-v1',revision:1,status:'rascunho_privado',publicado:false}};
  throw Error('Ação inesperada: '+data.action);
 });
 render(<Portal integrado userId="loja-HML" operadorAtivo={{id:'admin'}} nuvemSincronizada produtos={[]}/>);
 expect(await screen.findByText('Studio desbloqueado')).toBeTruthy();
 // O editor agora fica na aba Personalizar, montado mas oculto durante o atendimento.
 fireEvent.click(screen.getByRole('button',{name:'Personalizar loja'}));
 fireEvent.click(screen.getByRole('button',{name:'Salvar rascunho simulado'}));
 await waitFor(()=>expect(mocks.lastSave?.revision).toBe(1));
 expect(mocks.calls).toHaveBeenCalledWith({
  action:'salvarRascunho',expectedRevision:0,
  rascunho:{aparencia:{nomeLoja:'Teste'},regras:{'HML-PDV-001':{publicado:true}}}
 });
 expect(mocks.lastSave.publicado).toBe(false);
 expect(mocks.signOut).not.toHaveBeenCalled();
});

test('HML não mostra dados quando serviço legado responde loja incompatível',async()=>{
 mocks.calls.mockImplementation(async data=>({data:{lojaId:'OUTRA_LOJA',revision:0,regras:{'x':{publicado:true}},licenca:{status:'ativo'}}}));
 render(<Portal integrado userId="loja-HML" operadorAtivo={{id:'admin'}} nuvemSincronizada produtos={[]}/>);
 const alert=await screen.findByRole('alert');
 expect(alert.textContent).toContain('identidade de loja divergente');
 expect(screen.queryByText('Studio desbloqueado')).toBeNull();
});
test('HML não aceita backend desatualizado mesmo que devolva o UID correto',async()=>{
 mocks.calls.mockImplementation(async data=>({data:{lojaId:'loja-HML',revision:0,regras:{}}}));
 render(<Portal integrado userId="loja-HML" operadorAtivo={{id:'admin'}} nuvemSincronizada produtos={[]}/>);
 const alert=await screen.findByRole('alert');
 expect(alert.textContent).toContain('versão de servidor incompatível');
 expect(screen.queryByRole('button',{name:'Salvar rascunho simulado'})).toBeNull();
});
