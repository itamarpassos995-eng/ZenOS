import React from 'react';
import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import Despesas from '../../src/components/Despesas.jsx';
afterEach(cleanup);
const montar=(lista,commit)=>{
 const setDespesas=vi.fn();
 render(<Despesas despesas={lista} setDespesas={setDespesas}
  commitOperacaoNegocio={commit} registrarFinanceiro={vi.fn()}
  caixaMovimentos={[]} setCaixaMovimentos={vi.fn()}
  sessaoAtiva={{id:'cx-1',status:'aberta'}} saldoSessaoFisicoBRL={1000}
  operadorAtivo={{id:'adm-1',nome:'Admin'}} patenteUsuario="gerencia"
  moeda="BRL" converterParaBRL={v=>v} fmt={v=>String(v)} tx={pt=>pt}/>);
 return {setDespesas};
};
const confirmado=vi.fn(async({changes})=>({cloudOk:true,values:{despesas:changes[0].value}}));
test('despesa pendente é ocultada reversivelmente apenas após confirmação da nuvem',async()=>{
 const expense={id:'DESP-1',descricao:'Aluguel',status:'pendente',valorBRL:100,dataVencimento:'2026-10-20'};
 const {setDespesas}=montar([expense],confirmado);
 fireEvent.click(screen.getByRole('button',{name:'Excluir'}));
 expect(screen.getByText(/Remover despesa/)).toBeTruthy();
 expect(confirmado).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Confirmar remoção'}));
 await waitFor(()=>expect(confirmado).toHaveBeenCalledTimes(1));
 const params=confirmado.mock.calls[0][0];
 expect(params.changes[0].value[0]).toMatchObject({id:'DESP-1',status:'excluida',excluida:true});
 expect(params.financialEntries).toEqual([]);
 await waitFor(()=>expect(setDespesas).toHaveBeenCalled());
 expect(screen.getByText(/Despesa removida/)).toBeTruthy();
});
test('despesa de compra nunca é excluída pelo módulo de despesas',async()=>{
 const expense={id:'DESP-C',descricao:'Compra de Estoque - Tambasa | Boleto',status:'pendente',valorBRL:100};
 const commit=vi.fn();montar([expense],commit);
 fireEvent.click(screen.getByRole('button',{name:'Excluir'}));
 expect(screen.getByText(/Despesa vinculada a compra/)).toBeTruthy();
 expect(commit).not.toHaveBeenCalled();
});
test('despesa paga pode sair da lista mantendo resultado e livro imutável',async()=>{
 const expense={id:'DESP-2',descricao:'Salário',status:'paga',dataPagamento:'2026-10-20T12:00:00Z',valorBRL:100};
 const commit=vi.fn(async({changes})=>({cloudOk:true,values:{despesas:changes[0].value}}));
 montar([expense],commit);
 fireEvent.click(screen.getByRole('button',{name:/Pagas/}));
 fireEvent.click(screen.getByRole('button',{name:'Excluir'}));
 expect(screen.getByLabelText(/manter o valor no resultado financeiro/).checked).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Confirmar remoção'}));
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 const operation=commit.mock.calls[0][0];
 expect(operation.changes[0].value[0]).toMatchObject({status:'excluida',financeiroMantido:true});
 expect(operation.financialEntries).toEqual([]);
});
test('opção explícita estorna resultado sem simular devolução de caixa',async()=>{
 const expense={id:'DESP-3',descricao:'Salário incorreto',status:'paga',dataPagamento:'2026-10-20T12:00:00Z',valorBRL:99};
 const commit=vi.fn(async({changes})=>({cloudOk:true,values:{despesas:changes[0].value}}));
 montar([expense],commit);
 fireEvent.click(screen.getByRole('button',{name:/Pagas/}));
 fireEvent.click(screen.getByRole('button',{name:'Excluir'}));
 fireEvent.click(screen.getByLabelText(/estornar o valor no resultado financeiro/));
 fireEvent.click(screen.getByRole('button',{name:'Confirmar remoção'}));
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 const operation=commit.mock.calls[0][0];
 expect(operation.changes[0].value[0]).toMatchObject({status:'excluida',financeiroMantido:false,ajusteResultado:'estornado'});
 expect(operation.financialEntries[0]).toMatchObject({
  id:'ESTORNO-RESULTADO-DESPESA-DESP-3',valor:99,afetaCaixaFisico:false,
  afetaResultado:true,direcao:'entrada',
 });
 expect(operation.operationKey).toBe('despesa-remocao:DESP-3');
 expect(operation.guards[0]).toMatchObject({type:'entity_unchanged',entityId:'DESP-3'});
});
test('falha na nuvem mantém dado e aviso sem confirmação',async()=>{
 const expense={id:'DESP-4',descricao:'Internet',status:'pendente',valorBRL:99};
 const commit=vi.fn(async()=>({cloudOk:false,error:new Error('Rede')}));
 const {setDespesas}=montar([expense],commit);
 fireEvent.click(screen.getByRole('button',{name:'Excluir'}));
 fireEvent.click(screen.getByRole('button',{name:'Confirmar remoção'}));
 await waitFor(()=>expect(screen.getByText(/Remoção sem confirmação/)).toBeTruthy());
 expect(setDespesas).not.toHaveBeenCalled();
});
