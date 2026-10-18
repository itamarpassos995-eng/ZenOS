import React from 'react';
import {test,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {salvarRascunhoPDV,lerRascunhoPDV} from '../../src/core/pdvDraft';
import {traducoes} from '../../src/data';
vi.mock('../../src/firebase',()=>({db:{}}));
const mocks=vi.hoisted(()=>({confirmar:vi.fn(async()=>({data:{faturado:true}}))}));
vi.mock('../../src/core/commerceZenOSSession',()=>({callableCommerceZenOS:()=>mocks.confirmar}));
import PDV from '../../src/components/PDV';
const pedidoId='ab'.repeat(16),vendaId=`COMMERCE-${pedidoId}`,loja='loja-ui-commerce',op={id:'op',nome:'Teste',patente:'gerencia',permissoes:{admin:true}};
const produto={id:'P1',sku:'S1',nome:'Produto online',tipoItem:'produto',custoBRL:2,precoBRL:99,estoque:5,estoqueVitrine:0,estoqueGalpao:5};
function mount(commit){return render(<PDV userId={loja} operadorAtivo={op} produtos={[produto]} clientes={[]} vouchers={[]} vendedores={[op]}
 setProdutos={()=>{}} setClientes={()=>{}} setHistoricoVendas={()=>{}} historicoVendas={[]} commitVendaCritica={commit}
 sessaoAtiva={{id:'caixa',status:'aberta'}} idioma="pt" moeda="BRL" fmt={n=>Number(n||0).toFixed(2)}
 t={k=>traducoes.pt[k]||k} tx={pt=>pt} converterDeBRL={v=>v} converterParaBRL={v=>v} regrasDesconto={{margemMinima:0}} taxasCambio={{BRL:1}}/>);}
beforeEach(()=>{
 localStorage.clear();mocks.confirmar.mockClear();
 salvarRascunhoPDV(loja,op.id,{itensVenda:[{...produto,id:'linha',produtoOriginalId:'P1',produtoOriginalSku:'S1',qtd:'2',precoPraticadoBRL:12.5,precoTexto:'12.50'}],
  commerceOrigem:{pedidoId,vendaId,preparadoEm:'2026-10-18T12:00:00Z'},nomeClienteVulso:'Comprador online',descontoTexto:'0',modalFechamentoAberto:true,
  pagamentosLancados:[{id:1,formaId:'dinheiro_brl',rotulo:'Dinheiro',moedaOrigem:'BRL',valorOriginal:25,valorConvertidoBRL:25,taxaCambioAplicada:1}]});
});
afterEach(cleanup);
test('PDV usa preço online, baixa/financeiro normais e referência/trava estáveis no retry',async()=>{
 const calls=[];const commit=vi.fn(async args=>{calls.push(args);return calls.length===1?{cloudOk:false,error:new Error('Rede interrompida')}:{cloudOk:true,values:{}};});
 mount(commit);fireEvent.click(screen.getByRole('button',{name:'Liquidar no Caixa'}));
 await waitFor(()=>expect(calls).toHaveLength(1));await screen.findByText(/Rede interrompida/);
 expect(lerRascunhoPDV(loja,op.id).commerceOrigem.pedidoId).toBe(pedidoId);expect(mocks.confirmar).not.toHaveBeenCalled();
 fireEvent.click(screen.getAllByRole('button',{name:'OK',exact:true}).at(-1));
 fireEvent.click(screen.getByRole('button',{name:'Liquidar no Caixa'}));
 await screen.findByRole('button',{name:'Novo Atendimento'});
 expect(calls).toHaveLength(2);for(const call of calls){
  expect(call.operationKey).toBe(`pdv:${vendaId}`);
  expect(call.guards).toContainEqual({type:'commerce_order_once',orderId:pedidoId,saleId:vendaId});
  expect(call.changes.find(c=>c.field==='historicoVendas').value[0]).toMatchObject({id:vendaId,commercePedidoId:pedidoId,origem:'commerce',totalBRL:25});
  expect(call.changes.find(c=>c.field==='produtos').value[0].estoque).toBe(3);
  expect(call.financialEntries.reduce((sum,e)=>sum+e.valor,0)).toBe(25);
 }
 expect(mocks.confirmar).toHaveBeenCalledWith({action:'confirmarFaturamento',id:pedidoId});expect(lerRascunhoPDV(loja,op.id)).toBe(null);
});
test('pedido online não vira pré-pedido, preservando rascunho e financeiro',async()=>{
 const commit=vi.fn();mount(commit);
 // Close checkout to use the existing pre-order action.
 const close=screen.getAllByRole('button',{name:'✕'}).at(-1);fireEvent.click(close);
 const button=screen.getAllByRole('button').find(b=>/Pré-Pedido|Pré Pedido/.test(b.textContent)&&!/Resgatar/.test(b.textContent));
 expect(button).toBeTruthy();fireEvent.click(button);
 await screen.findByText(/Conclua este pedido como venda/);expect(commit).not.toHaveBeenCalled();
 expect(lerRascunhoPDV(loja,op.id).commerceOrigem.pedidoId).toBe(pedidoId);
});
