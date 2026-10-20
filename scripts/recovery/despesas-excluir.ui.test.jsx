import React from 'react';
import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import Despesas from '../../src/components/Despesas.jsx';

afterEach(cleanup);
const montar = (lista, commit) => {
 const setDespesas=vi.fn();
 render(<Despesas
  despesas={lista} setDespesas={setDespesas} commitOperacaoNegocio={commit}
  registrarFinanceiro={vi.fn()} caixaMovimentos={[]} setCaixaMovimentos={vi.fn()}
  sessaoAtiva={{id:'cx-1',status:'aberta'}} saldoSessaoFisicoBRL={1000}
  operadorAtivo={{id:'adm-1',nome:'Admin'}} patenteUsuario="gerencia"
  moeda="BRL" converterParaBRL={v=>v} fmt={v=>String(v)} tx={pt=>pt}
 />);
 return {setDespesas};
};
test('excluir despesa manual exige confirmação, escreve uma vez e avisa sucesso',async()=>{
 const expense={id:'DESP-1',descricao:'Aluguel',status:'pendente',valorBRL:100,dataVencimento:'2026-10-20'};
 const commit=vi.fn(async()=>({cloudOk:true,values:{despesas:[]}}));
 const {setDespesas}=montar([expense],commit);
 fireEvent.click(screen.getByRole('button',{name:'Excluir'}));
 expect(screen.getByText(/Excluir registro/)).toBeTruthy();
 expect(commit).not.toHaveBeenCalled();
 const excluir=screen.getAllByRole('button',{name:'Excluir'});
 fireEvent.click(excluir[0]);
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 expect(commit.mock.calls[0][0].changes[0]).toMatchObject({field:'despesas',value:[]});
 await waitFor(()=>expect(setDespesas).toHaveBeenCalledWith([]));
 expect(screen.getByText(/Despesa excluída/)).toBeTruthy();
});
test('exclusão de despesa de compra é bloqueada sem mexer no histórico',async()=>{
 const expense={id:'DESP-2',descricao:'Compra de Estoque - Tambasa | Boleto',status:'pendente',valorBRL:100,dataVencimento:'2026-10-20'};
 const commit=vi.fn();
 montar([expense],commit);
 fireEvent.click(screen.getByRole('button',{name:'Excluir'}));
 expect(screen.getByText(/Despesa vinculada a compra/)).toBeTruthy();
 expect(commit).not.toHaveBeenCalled();
});
test('falha da nuvem não remove despesa manual',async()=>{
 const expense={id:'DESP-3',descricao:'Internet',status:'pendente',valorBRL:99,dataVencimento:'2026-10-20'};
 const commit=vi.fn(async()=>({cloudOk:false,error:new Error('Rede')}));
 const {setDespesas}=montar([expense],commit);
 fireEvent.click(screen.getByRole('button',{name:'Excluir'}));
 const btn=screen.getAllByRole('button',{name:'Excluir'});
 fireEvent.click(btn[0]);
 await waitFor(()=>expect(screen.getByText(/Exclusão sem confirmação/)).toBeTruthy());
 expect(setDespesas).not.toHaveBeenCalled();
});

test('pagamento já realizado exige estorno e não permite apagar conta paga',async()=>{
 const expense={id:'DESP-PAGA',descricao:'Aluguel',status:'paga',dataPagamento:'2026-10-20T12:00:00Z',valorBRL:100};
 const commit=vi.fn();
 montar([expense],commit);
 fireEvent.click(screen.getByRole('button',{name:/Pagas/}));
 fireEvent.click(screen.getByRole('button',{name:'Excluir'}));
 expect(screen.getByText(/Despesa com pagamento registrado/)).toBeTruthy();
 expect(commit).not.toHaveBeenCalled();
});
