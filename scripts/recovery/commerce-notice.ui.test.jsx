import React from 'react';import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({api:vi.fn(async()=>({data:{novos:3}}))}));
vi.mock('../../src/core/commerceZenOSSession',()=>({estadoSessaoCommerceZenOS:()=>({pronto:true}),observarSessaoCommerceZenOS:()=>()=>{},callableCommerceZenOS:()=>mocks.api}));
import Notice from '../../src/components/ZenCommerceOrderNotice';
afterEach(()=>{cleanup();vi.clearAllMocks();});
test('aviso global consulta contador autorizado e abre central pelo callback real do shell',async()=>{
 const abrir=vi.fn();render(<Notice userId="A" operadorId="1" onAbrir={abrir}/>);
 await screen.findByText('3');expect(screen.getByText(/novos pedidos online/)).toBeTruthy();expect(mocks.api).toHaveBeenCalledWith({action:'resumoPedidos'});
 fireEvent.click(screen.getByRole('button',{name:/Ver pedidos/}));expect(abrir).toHaveBeenCalledTimes(1);
});
test('erro não confirma ausência de pedidos e oferece nova consulta',async()=>{
 mocks.api.mockRejectedValueOnce(Error('offline'));
 render(<Notice userId="A" operadorId="1" onAbrir={()=>{}}/>);
 await screen.findByText('Atualização dos pedidos indisponível');expect(screen.queryByText('Nenhum novo pedido online')).toBe(null);
 fireEvent.click(screen.getByRole('button',{name:'Tentar atualizar'}));await screen.findByText('3');
});

test('painel de notificações lista somente pedidos ativos e mantém atalho para fila completa',async()=>{
 mocks.api.mockImplementation(async p=>{
  if(p.action==='resumoPedidos')return {data:{novos:2}};
  if(p.action==='listarPedidos')return {data:{pedidos:[
   {id:'n123456789',status:'recebido',cliente:{nome:'Maria'}},
   {id:'c123456789',status:'cancelado',cliente:{nome:'Cancelado antigo'}},
   {id:'a123456789',status:'em_atendimento',cliente:{nome:'Pedro'}}
  ]}};
  throw Error('inesperado');
 });
 const abrir=vi.fn();
 render(<Notice userId="A" operadorId="1" onAbrir={abrir}/>);
 await screen.findByText('2');
 fireEvent.click(screen.getByRole('button',{name:'▤ Ver notificações'}));
 await screen.findByText('Maria');
 expect(screen.getByText('Pedro')).toBeTruthy();
 expect(screen.queryByText('Cancelado antigo')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Ver fila completa de pedidos/}));
 expect(abrir).toHaveBeenCalledTimes(1);
});
