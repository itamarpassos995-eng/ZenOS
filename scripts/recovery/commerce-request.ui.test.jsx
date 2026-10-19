import React from 'react';
import {test,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
const mocks=vi.hoisted(()=>({currentUser:{uid:'loja-A'},callable:vi.fn(),getFunctions:vi.fn()}));
vi.mock('../../src/firebase',()=>({auth:{get currentUser(){return mocks.currentUser;}}}));
vi.mock('firebase/functions',()=>({getFunctions:mocks.getFunctions,httpsCallable:()=>mocks.callable}));
import CommerceSolicitacao from '../../src/components/CommerceSolicitacao';

afterEach(()=>{cleanup();vi.clearAllMocks();});
beforeEach(()=>{mocks.currentUser={uid:'loja-A'};});
test('somente CONSULTA inicialmente, não ativa nem publica a loja',async()=>{
 mocks.callable.mockResolvedValue({data:{status:'nao_solicitado',habilitado:false,createdAt:null}});
 render(<CommerceSolicitacao lojaId="loja-A" />);
 const enviar=await screen.findByRole('button',{name:'Solicitar ativação'});
 expect(mocks.callable).toHaveBeenCalledTimes(1);
 expect(mocks.callable).toHaveBeenCalledWith({action:'consultar',lojaId:'loja-A'});
 expect(enviar.disabled).toBe(false);
 expect(screen.getByText(/A solicitação não gera cobrança/)).toBeTruthy();
});
test('clique envia somente interesse, mantém status pendente ao recarregar o componente',async()=>{
 let status='nao_solicitado';
 mocks.callable.mockImplementation(async args=>{
  if(args.action==='solicitar')status='pendente_analise';
  return {data:{status,habilitado:false,createdAt:'2026-10-19T18:00:00Z'}};
 });
 const view=render(<CommerceSolicitacao lojaId="loja-A" />);
 fireEvent.click(await screen.findByRole('button',{name:'Solicitar ativação'}));
 await screen.findByText('Solicitação recebida');
 expect(screen.queryByRole('button',{name:'Solicitar ativação'})).toBeNull();
 expect(mocks.callable).toHaveBeenCalledWith({action:'solicitar',lojaId:'loja-A'});
 view.unmount();
 render(<CommerceSolicitacao lojaId="loja-A" />);
 await screen.findByText('Solicitação recebida');
 expect(mocks.callable.mock.calls.filter(c=>c[0].action==='solicitar')).toHaveLength(1);
});
test('bloqueio de identidade não consulta nem grava loja diferente',async()=>{
 mocks.currentUser={uid:'loja-B'};
 render(<CommerceSolicitacao lojaId="loja-A" />);
 await screen.findByRole('alert');
 expect(mocks.callable).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'Solicitar ativação'})).toBeNull();
});
test('erro temporário informa ausência de ativação e permite nova consulta sem duplicar solicitação',async()=>{
 mocks.callable.mockRejectedValue(new Error('unavailable'));
 render(<CommerceSolicitacao lojaId="loja-A" />);
 await screen.findByRole('alert');
 expect(screen.getByText(/Nenhum módulo foi ativado/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Atualizar situação'}));
 await waitFor(()=>expect(mocks.callable).toHaveBeenCalledTimes(2));
 expect(mocks.callable.mock.calls.some(c=>c[0].action==='solicitar')).toBe(false);
});
