import React from 'react';
import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,within} from '@testing-library/react';
import ZenCommerceCommandCenter,{filtrarPedidosCommerce,resumoPedidosCommerce} from '../../src/components/ZenCommerceCommandCenter';

vi.mock('../../src/components/ZenCommerceOrderCard',()=>({
 default:({pedido,onAbrirPDV,onCancelar})=><div data-testid="detalle">
  <strong>Pedido {pedido.id}</strong>
  <button type="button" onClick={()=>onAbrirPDV?.(pedido.id)}>Abrir no PDV</button>
  <button type="button" onClick={()=>onCancelar?.(pedido)}>Cancelar pedido</button>
 </div>
}));
const pedidos=[
 {id:'NOVO123456',status:'recebido',criadoEm:'2026-10-19T14:11:00Z',cliente:{nome:'Maria Silva',telefone:'5511999999999'},totalCentavos:14950,itens:[{nome:'Produto A',quantidade:5}]},
 {id:'ATEND9999',status:'em_atendimento',criadoEm:'2026-10-19T13:14:00Z',cliente:{nome:'Pedro Oliveira',telefone:'5511988888888'},totalCentavos:21150,itens:[{nome:'Produto B',quantidade:4}]},
 {id:'CANCEL0987',status:'cancelado',criadoEm:'2026-10-19T12:00:00Z',cliente:{nome:'Cliente antigo',telefone:'5511977777777'},totalCentavos:8970,itens:[{nome:'Produto C',quantidade:3}]},
 {id:'ENCERRADO7',status:'encerrado',criadoEm:'2026-10-19T11:00:00Z',cliente:{nome:'Cliente concluído',telefone:'5511966666666'},totalCentavos:7600,itens:[{nome:'Produto D',quantidade:2}]},
];
const cliente={id:'cid1',nome:'Cliente CRM',telefone:'5511000112233',ultimoPedido:'NOVO123456',marketingStatus:'pendente_verificacao'};
const props={pedidos,clientesOnline:[cliente],lojaPublicada:true,idPublico:'zc-abcdefghjkmnpq',whatsapp:'5511988888888'};
afterEach(cleanup);
test('visão geral mostra somente ações imediatas, sem lista de cancelados',()=>{
 render(<ZenCommerceCommandCenter {...props} editor={<div>Editor premium</div>}/>);
 expect(screen.getByRole('heading',{name:'O que precisa da sua atenção'})).toBeTruthy();
 const painel=screen.getByText('Próximos atendimentos').closest('.zcc-pane');
 expect(within(painel).getByText('Maria Silva')).toBeTruthy();
 expect(within(painel).getByText('Pedro Oliveira')).toBeTruthy();
 expect(within(painel).queryByText('Cliente antigo')).toBeNull();
 expect(resumoPedidosCommerce(pedidos)).toEqual({novos:1,atendimento:1,concluidos:1,cancelados:1});
});
test('central mostra apenas ativos por padrão e permite recuperar cancelados pelo histórico',()=>{
 render(<ZenCommerceCommandCenter {...props} editor={<div>Editor</div>}/>);
 fireEvent.click(screen.getByRole('button',{name:/^Pedidos 1$/}));
 const lista=screen.getByRole('heading',{name:'Fila de atendimento'}).closest('.zcc-pane');
 expect(within(lista).getByText('Maria Silva')).toBeTruthy();
 expect(within(lista).getByText('Pedro Oliveira')).toBeTruthy();
 expect(within(lista).queryByText('Cliente antigo')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Histórico 2/}));
 expect(screen.getByText('Cliente antigo')).toBeTruthy();
 expect(screen.getByText('Cliente concluído')).toBeTruthy();
 expect(screen.queryByText('Maria Silva')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Cancelados'}));
 expect(screen.getByText('Cliente antigo')).toBeTruthy();
 expect(screen.queryByText('Cliente concluído')).toBeNull();
});
test('detalhe sob demanda não dispara nenhum faturamento; ação usa o callback existente',()=>{
 const pdv=vi.fn();
 render(<ZenCommerceCommandCenter {...props} onAtenderPedido={pdv} editor={<div>Editor</div>}/>);
 fireEvent.click(screen.getByRole('button',{name:/^Pedidos 1$/}));
 expect(pdv).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Ver detalhes do pedido NOVO123456'}));
 expect(screen.getByLabelText('Detalhes do pedido selecionado')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Abrir no PDV'}));
 expect(pdv).toHaveBeenCalledTimes(1);
 expect(pdv).toHaveBeenCalledWith('NOVO123456');
 fireEvent.click(screen.getByRole('button',{name:'Fechar detalhes do pedido'}));
 expect(screen.queryByTestId('detalle')).toBeNull();
});
test('clientes online tem área própria sem misturar com pedidos ou fiado',()=>{
 const load=vi.fn();
 render(<ZenCommerceCommandCenter {...props} onConsultarClientes={load} editor={<div>Editor</div>}/>);
 fireEvent.click(screen.getByRole('button',{name:'Clientes'}));
 expect(load).toHaveBeenCalledTimes(1);
 expect(screen.getByRole('heading',{name:'Clientes da Loja Online'})).toBeTruthy();
 expect(screen.getByText('Cliente CRM')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/Cliente CRM/}));
 expect(screen.getByLabelText('Detalhes do cliente')).toBeTruthy();
 expect(screen.getByText(/Solicitado — aguardando verificação/)).toBeTruthy();
});
test('editor fica montado e mantém rascunho local ao navegar entre áreas',()=>{
 render(<ZenCommerceCommandCenter {...props} editor={<label>Nome do banner<input type="text" defaultValue="Campanha inicial"/></label>}/>);
 fireEvent.click(screen.getByRole('button',{name:'Personalizar loja'}));
 const input=screen.getByLabelText('Nome do banner');
 fireEvent.change(input,{target:{value:'Campanha ainda não salva'}});
 fireEvent.click(screen.getByRole('button',{name:'Pedidos ativos 1'}));
 fireEvent.click(screen.getByRole('button',{name:'Personalizar loja'}));
 expect(screen.getByLabelText('Nome do banner').value).toBe('Campanha ainda não salva');
});
test('avisos externos abrem a fila sem perder o pedido registrado',()=>{
 const v=render(<ZenCommerceCommandCenter {...props} focoPedidosOnline={0} editor={<div>Editor</div>}/>);
 v.rerender(<ZenCommerceCommandCenter {...props} focoPedidosOnline={1} editor={<div>Editor</div>}/>);
 expect(screen.getByRole('heading',{name:'Central de pedidos'})).toBeTruthy();
 expect(screen.getByText('Maria Silva')).toBeTruthy();
});
test('filtros puros jamais ocultam cancelados do histórico',()=>{
 expect(filtrarPedidosCommerce(pedidos,'ativos').map(x=>x.status)).toEqual(['recebido','em_atendimento']);
 expect(filtrarPedidosCommerce(pedidos,'historico').map(x=>x.status)).toEqual(['cancelado','encerrado']);
 expect(filtrarPedidosCommerce(pedidos,'historico','CANCEL0987')).toHaveLength(1);
});
