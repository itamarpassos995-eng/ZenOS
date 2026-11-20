import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,vi,test,expect} from 'vitest';
import Clientes from '../../src/components/Clientes.jsx';
import {traducoes} from '../../src/data.js';

afterEach(cleanup);
const base={
 id:1790633161249,nome:'Constructora del Este S.A.',saldoDevedorBRL:4999.70,
 limiteCreditoBRL:15000,documento:'80054231-4',pais:'PY',tipoDocumento:'RUC',
};
const venda={
 id:'VENDA-1792235811140-08elus',createdAt:'2026-10-17T08:16:51Z',
 clienteId:base.id,clienteNome:'Marcos Roberto (Pinturas & Reformas)',
 tipoDocumento:'venda',estado:'concluida',
 pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:100},{formaId:'crediario',valorConvertidoBRL:799.70}],
};
const lancamento={
 id:'VENDA-'+venda.id+'-FIADO',createdAt:venda.createdAt,
 tipo:'venda_fiada',clienteId:base.id,clienteNome:venda.clienteNome,
 referenciaId:venda.id,formaPagamento:'crediario',valor:799.70,
 saldoClienteAntes:850,saldoClienteDepois:1649.70,
};
const setup=({historicoVendas=[venda],livroFinanceiro=[lancamento]}={})=>{
 const commit=vi.fn(async ({changes})=>({
  cloudOk:true,
  values:Object.fromEntries(changes.map(c=>[c.field,c.value])),
 }));
 const props={
  clientes:[base],setClientes:vi.fn(),historicoVendas,livroFinanceiro,
  commitOperacaoNegocio:commit,
  caixaMovimentos:[],setCaixaMovimentos:vi.fn(),
  sessaoAtiva:null,operadorAtivo:{id:'admin',nome:'Admin'},
  moeda:'BRL',fmt:n=>'R$ '+Number(n||0).toFixed(2),
  t:k=>traducoes.pt[k]||k,tx:pt=>pt,
  converterDeBRL:v=>v,converterParaBRL:v=>v,
 };
 render(<Clientes {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'Receber Conta'}));
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'pix'}});
 fireEvent.change(screen.getByPlaceholderText('0.00'),{target:{value:'50'}});
 fireEvent.click(screen.getByRole('button',{name:'Baixar e Quitar'}));
 return {commit,props};
};

test('nome histórico diferente com MESMO ID: recebe conta, sem reatribuir dívida',async()=>{
 const {commit}=setup();
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 const [args]=commit.mock.calls[0];
 expect(args.guards).toEqual(expect.arrayContaining([
  expect.objectContaining({type:'client_receipt_snapshot',clientId:base.id,balanceBRL:4999.70}),
 ]));
 expect(args.changes.find(x=>x.field==='clientes').value[0].saldoDevedorBRL)
   .toBeCloseTo(4949.70,2);
 expect(args.financialEntries[0].clienteId).toBe(base.id);
 expect(args.financialEntries[0].valor).toBe(50);
});

test('ID da venda diferente do ID financeiro: impede baixa',async()=>{
 const {commit}=setup({historicoVendas:[{...venda,clienteId:'OUTRO-CLIENTE'}]});
 await waitFor(()=>expect(screen.getByText(/Conta com vínculo financeiro inconsistente/)).toBeTruthy());
 expect(commit).not.toHaveBeenCalled();
});
