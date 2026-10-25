import React from 'react';
import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
vi.mock('../../src/firebase',()=>({db:{}}));
vi.mock('../../src/core/operationalRepository',()=>({getOperationalSnapshot:vi.fn()}));
import {getOperationalSnapshot} from '../../src/core/operationalRepository';
import PDV from '../../src/components/PDV.jsx';
const nome='Teste Inventário';
const item={id:'it-1',produtoOriginalId:'p-1',produtoOriginalSku:'P-1',sku:'P-1',nome:'Produto',tipoItem:'servico',qtd:'1',precoBRL:10,precoPraticadoBRL:10,custoBRL:2,precoTexto:'10.00'};
const base=(historicoVendas,setHistoricoVendas,commitVendaCritica)=>render(<PDV
 perfilLoja={{nomeFantasia:'Loja Teste'}} taxasCambio={{BRL:1}}
 registrarFinanceiro={vi.fn()} commitVendaCritica={commitVendaCritica} recarregarDadosPDV={vi.fn()}
 userId="teste-prepedido-20261021" produtos={[{...item,id:'p-1',estoque:100}]} setProdutos={vi.fn()}
 clientes={[]} setClientes={vi.fn()} moeda="BRL" fmt={v=>String(v)} t={v=>v} tx={v=>v}
 converterDeBRL={v=>v} converterParaBRL={v=>v}
 historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas}
 patenteUsuario="operador" idioma="pt" regrasDesconto={{margemMinima:0}}
 vendedores={[]} operadorAtivo={{id:'operator-extra',nome:'Peterson'}}
 sessaoAtiva={{id:'cx',status:'aberta'}}/>);
const doc=(id,estado)=>({id,estado,clienteNome:nome,itens:[item],totalBRL:10,clienteQuerFiscal:false});
const snapshot=docs=>({exists:()=>true,data:()=>({historicoVendas:docs})});
afterEach(()=>{cleanup();vi.resetAllMocks();});
test('operador só resgata pré-pedido confirmado no servidor, sem venda',async()=>{
 const pedido=doc('pre-1','pendente'),commit=vi.fn(),set=vi.fn();
 getOperationalSnapshot.mockResolvedValue(snapshot([pedido]));
 base([pedido],set,commit);
 fireEvent.click(screen.getByRole('button',{name:/Resgatar/}));
 fireEvent.click(screen.getByText(/PRÉ-PEDIDO/));
 await waitFor(()=>expect(getOperationalSnapshot).toHaveBeenCalledWith({},'teste-prepedido-20261021'));
 await waitFor(()=>expect(set).toHaveBeenCalledWith([pedido]));
 expect(commit).not.toHaveBeenCalled();
});
test('orçamento aparece em Resgatar e recupera sem liquidar no clique',async()=>{
 const orc={...doc('orc-1','orcamento'),totalBRL:8},set=vi.fn(),commit=vi.fn();
 getOperationalSnapshot.mockResolvedValue(snapshot([orc]));
 base([orc],set,commit);
 fireEvent.click(screen.getByRole('button',{name:/Resgatar/}));
 fireEvent.click(screen.getByText(/ORÇAMENTO/));
 await waitFor(()=>expect(screen.getByText(/Orçamento recuperado/)).toBeTruthy());
 expect(screen.getByDisplayValue('2.00')).toBeTruthy(); // R$10 original - R$8 cotados
 expect(commit).not.toHaveBeenCalled();
});
test('pré-pedido stale no terminal é bloqueado após consulta e carrinho preservado',async()=>{
 const pendente=doc('pre-2','pendente'),pago=doc('pre-2','concluida'),commit=vi.fn();
 getOperationalSnapshot.mockResolvedValue(snapshot([pago]));
 base([pendente],vi.fn(),commit);
 fireEvent.click(screen.getByRole('button',{name:/Resgatar/}));
 fireEvent.click(screen.getByText(/PRÉ-PEDIDO/));
 await waitFor(()=>expect(screen.getByText(/Documento indisponível/)).toBeTruthy());
 expect(commit).not.toHaveBeenCalled();
});
test('sem servidor resgate mantém rascunho e não confirma operação',async()=>{
 const pedido=doc('pre-3','pendente'),commit=vi.fn();
 getOperationalSnapshot.mockRejectedValue(new Error('offline'));
 base([pedido],vi.fn(),commit);
 fireEvent.click(screen.getByRole('button',{name:/Resgatar/}));
 fireEvent.click(screen.getByText(/PRÉ-PEDIDO/));
 await waitFor(()=>expect(screen.getByText(/Resgate não confirmado/)).toBeTruthy());
 expect(commit).not.toHaveBeenCalled();
});
test('caixa B liquida pré-pedido de A sem transferir a autoria nem fazer consulta nova',async()=>{
 const pedido={...doc('pre-autoria','pendente'),vendedorId:'vend-ana',vendedorNome:'Ana'};
 const commit=vi.fn(async()=>({cloudOk:true,values:{}}));
 getOperationalSnapshot.mockResolvedValue(snapshot([pedido]));
 base([pedido],vi.fn(),commit);
 fireEvent.click(screen.getByRole('button',{name:/Resgatar/}));
 fireEvent.click(screen.getByText(/PRÉ-PEDIDO/));
 await waitFor(()=>expect(getOperationalSnapshot).toHaveBeenCalledTimes(1));
 fireEvent.click(screen.getByRole('button',{name:/Receber no Caixa/}));
 fireEvent.click(screen.getByRole('button',{name:/Lançar Pagamento/}));
 fireEvent.click(screen.getByRole('button',{name:/Liquidar no Caixa/}));
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 const proposta=commit.mock.calls[0][0].changes.find(c=>c.field==='historicoVendas').value;
 const venda=proposta.find(v=>v.estado==='concluida');
 expect(venda.vendedorId).toBe('vend-ana');
 expect(venda.vendedorNome).toBe('Ana');
 expect(venda.finalizadoPorId).toBe('operator-extra');
 expect(venda.finalizadoPorNome).toBe('Peterson');
 expect(venda.sessaoId).toBe('cx');
 const guards=commit.mock.calls[0][0].guards;
 expect(guards).toContainEqual(expect.objectContaining({property:'vendedorId',expected:'vend-ana'}));
 expect(guards).toContainEqual(expect.objectContaining({property:'vendedorNome',expected:'Ana'}));
 expect(getOperationalSnapshot).toHaveBeenCalledTimes(2); // resgate e guard já existentes
});
