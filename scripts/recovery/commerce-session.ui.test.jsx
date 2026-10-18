import React from 'react';import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
const mocks=vi.hoisted(()=>({signOut:vi.fn(),calls:vi.fn(async data=>({data:data.action==='consultar'?{lojaId:'loja-A',revision:0,licenca:{status:'nao_contratado'},regras:{}}:{pedidos:[]}}))}));
vi.mock('../../src/core/commerceZenOSSession',()=>({ponteCommerceZenOSHabilitada:true,obterAuthCommerceZenOS:()=>({app:{}}),callableCommerceZenOS:()=>mocks.calls,observarSessaoCommerceZenOS:()=>()=>{}}));
vi.mock('../../src/core/commerceOperatorAuth',()=>({obterSessaoOperadorCommerce:()=>{throw Error('Não deve abrir outra conta');},entrarOperadorCommerce:()=>{throw Error('Não deve pedir Google');}}));
vi.mock('firebase/auth',()=>({onAuthStateChanged:(_auth,fn)=>{fn({uid:'loja-A'});return()=>{};},signOut:mocks.signOut}));
vi.mock('../../src/components/ZenCommerceStudio',()=>({default:()=> <p>Editor integrado</p>}));
import Portal from '../../src/components/ZenCommercePortal';
afterEach(()=>{cleanup();vi.clearAllMocks();});
test('Loja Online usa acesso existente, não pede Google e sair do módulo preserva login ZenOS',async()=>{
 const view=render(<Portal integrado userId="loja-A" operadorAtivo={{id:'caixa-1'}} nuvemSincronizada produtos={[]}/>);
 await screen.findByText('Editor integrado');await waitFor(()=>expect(mocks.calls).toHaveBeenCalledWith({action:'consultar'}));
 expect(screen.queryByRole('button',{name:/Entrar como administrador/})).toBe(null);
 expect(screen.queryByRole('button',{name:/Encerrar acesso individual/})).toBe(null);
 view.unmount();expect(mocks.signOut).not.toHaveBeenCalled();
});
