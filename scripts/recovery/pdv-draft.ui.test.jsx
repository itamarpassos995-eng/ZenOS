import React from 'react';
import { afterEach, beforeEach, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { salvarRascunhoPDV, lerRascunhoPDV, apagarRascunhoPDV } from '../../src/core/pdvDraft.js';
import { traducoes } from '../../src/data.js';

vi.mock('../../src/firebase', () => ({ db: {} }));
import PDV from '../../src/components/PDV.jsx';

const loja = 'loja-teste-resiliencia';
const operador = { id:'operador-1', nome:'Caixa 1', patente:'gerencia', permissoes:{admin:true} };
const produtos = Array.from({ length: 30 }, (_,i) => ({
  id:`prod-${i+1}`, sku:`SKU-${i+1}`, nome:`Item de teste ${i+1}`,
  tipoItem:'servico', custoBRL:2, precoBRL:10, estoque:500, estoqueVitrine:0, estoqueGalpao:500,
}));
const itensVenda=produtos.map((item,i)=>({
  ...item, id:`carrinho-${i+1}`, produtoOriginalId:item.id, produtoOriginalSku:item.sku,
  qtd:'1', precoPraticadoBRL:10, precoTexto:'10.00',
}));

const montar = () => render(<PDV
  perfilLoja={{ nomeFantasia:'Teste' }} taxasCambio={{BRL:1}} registrarFinanceiro={async()=>({})}
  commitVendaCritica={async()=>({cloudOk:false,error:new Error('Falha de teste')})}
  userId={loja} produtos={produtos} setProdutos={()=>{}} clientes={[]} setClientes={()=>{}}
  moeda="BRL" fmt={n=>Number(n||0).toFixed(2)} t={k=>traducoes.pt[k]||k}
  tx={pt=>pt} converterDeBRL={v=>v} converterParaBRL={v=>v}
  historicoVendas={[]} setHistoricoVendas={()=>{}} patenteUsuario="gerencia" idioma="pt"
  regrasDesconto={{ margemMinima:0 }} vendedores={[operador]} operadorAtivo={operador}
  sessaoAtiva={{id:'caixa-1',status:'aberta'}} />);

beforeEach(() => {
  apagarRascunhoPDV(loja,operador.id);
  salvarRascunhoPDV(loja,operador.id, {
    itensVenda, descontoTexto:'0', clienteQuerFiscal:false, nomeClienteVulso:'',
    pagamentosLancados:[], prePedidoEmAbertoId:null, modalFechamentoAberto:false,
    operacaoDocumento:{assinatura:null,id:null,instante:null},
  });
});
afterEach(() => { cleanup(); apagarRascunhoPDV(loja,operador.id); });

test('PDV restaura 30 itens e conserva edicoes apos remontar o componente', () => {
  const rendered=montar();
  expect(screen.getByText('Item de teste 1')).toBeTruthy();
  expect(screen.getByText('Item de teste 30')).toBeTruthy();
  expect(screen.getAllByRole('spinbutton')).toHaveLength(30);
  expect(screen.getByText(/Atendimento anterior recuperado/)).toBeTruthy();
  fireEvent.change(screen.getAllByRole('spinbutton')[0],{target:{value:'3'}});
  expect(lerRascunhoPDV(loja,operador.id).itensVenda[0].qtd).toBe('3');
  rendered.unmount();
  montar();
  expect(screen.getAllByRole('spinbutton')[0].value).toBe('3');
  expect(screen.getAllByRole('spinbutton')).toHaveLength(30);
});
