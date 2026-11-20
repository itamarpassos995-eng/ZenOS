import React from 'react';
import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import Despesas from '../../src/components/Despesas.jsx';
afterEach(cleanup);
const montar=(lista,commit,config={})=>{
 const setDespesas=vi.fn();
 render(<Despesas despesas={lista} setDespesas={setDespesas}
  commitOperacaoNegocio={commit} registrarFinanceiro={vi.fn()}
  caixaMovimentos={[]} setCaixaMovimentos={vi.fn()}
  sessaoAtiva={{id:'cx-1',status:'aberta'}} saldoSessaoFisicoBRL={1000}
  operadorAtivo={{id:'adm-1',nome:'Admin'}} patenteUsuario="gerencia"
  moeda="BRL" moedaPadrao={config.moedaPadrao||"BRL"} taxasCambio={config.taxasCambio||{BRL:1,PYG:1100,USD:0.2,EUR:0.18}} converterParaBRL={v=>v} fmt={v=>String(v)} tx={pt=>pt}/>);
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
 expect(screen.getByLabelText(/estornar o valor no resultado financeiro/).checked).toBe(true);
 fireEvent.click(screen.getByLabelText(/manter o valor no resultado financeiro/));
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

test('editar despesa manual pendente preenche valor e grava sem trocar ID ou perder metadados',async()=>{
 const expense={id:'DESP-EDIT',descricao:'Internet',status:'pendente',categoria:'Infraestrutura',valorBRL:500,moedaOrigem:'BRL',valorOriginal:500,taxaCambioAplicada:1,dataVencimento:'2026-10-25',origemImportacao:'registro_legado'};
 const commit=vi.fn(async({changes})=>({cloudOk:true,values:{despesas:changes[0].value}}));
 const {setDespesas}=montar([expense],commit);
 fireEvent.click(screen.getByRole('button',{name:'Editar'}));
 expect(screen.getByText(/Editar Despesa/)).toBeTruthy();
 expect(screen.getByDisplayValue('500')).toBeTruthy();
 fireEvent.change(screen.getByDisplayValue('500'),{target:{value:'550'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar alterações'}));
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 const req=commit.mock.calls[0][0];
 expect(req.changes[0].value[0]).toMatchObject({id:'DESP-EDIT',valorBRL:550,valorOriginal:550,moedaOrigem:'BRL',taxaCambioAplicada:1,origemImportacao:'registro_legado',status:'pendente'});
 expect(req.guards[0]).toMatchObject({type:'entity_unchanged',entityId:'DESP-EDIT',field:'despesas'});
 await waitFor(()=>expect(setDespesas).toHaveBeenCalled());
});
test('editar despesa paga preserva registro e exige fluxo financeiro',async()=>{
 const expense={id:'DESP-PEDIT',descricao:'Recebimento pago',status:'paga',valorBRL:500};
 const commit=vi.fn();montar([expense],commit);
 fireEvent.click(screen.getByRole('button',{name:/Pagas/}));
 fireEvent.click(screen.getByRole('button',{name:'Editar'}));
 expect(screen.getByText(/Edição exige correção financeira/)).toBeTruthy();
 expect(commit).not.toHaveBeenCalled();
});

test('despesa legada sem origem permite apenas edição administrativa, sem câmbio nem alteração de valor',async()=>{
 const expense={id:'LEGADO',descricao:'Despesa antiga',status:'pendente',valorBRL:500};
 const commit=vi.fn(async({changes})=>({cloudOk:true,values:{despesas:changes[0].value}}));
 montar([expense],commit,{moedaPadrao:'PYG',taxasCambio:{BRL:1,PYG:1100}});
 fireEvent.click(screen.getByRole('button',{name:'Editar'}));
 expect(screen.getByText(/Valor BRL contábil/)).toBeTruthy();
 const input=screen.getByDisplayValue('500');
 expect(input.disabled).toBe(true);
 fireEvent.change(screen.getByDisplayValue('Despesa antiga'),{target:{value:'Descrição corrigida'}});
 fireEvent.click(screen.getByRole('button',{name:/Salvar alterações/}));
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 expect(commit.mock.calls[0][0].changes[0].value[0])
  .toMatchObject({descricao:'Descrição corrigida',valorBRL:500});
 expect(commit.mock.calls[0][0].changes[0].value[0].moedaOrigem).toBeUndefined();
});

test('nova despesa PYG conserva guaranis e taxa na criação sem reprecificar depois',async()=>{
 const commit=vi.fn(async({changes})=>({cloudOk:true,values:{despesas:changes[0].value}}));
 const {setDespesas}=montar([],commit,{moedaPadrao:'PYG',taxasCambio:{BRL:1,PYG:1100,USD:0.2,EUR:0.18}});
 fireEvent.click(screen.getByRole('button',{name:/Lançar Nova Despesa/}));
 fireEvent.change(screen.getByPlaceholderText(/Pagamento Fornecedor/),{target:{value:'Material de limpeza'}});
 fireEvent.change(screen.getByText(/Valor na moeda original/).parentElement.querySelector('input'),{target:{value:'25000'}});
 fireEvent.click(screen.getByRole('button',{name:/Registrar Despesa no Sistema/}));
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 const registro=commit.mock.calls[0][0].changes[0].value[0];
 expect(registro).toMatchObject({moedaOrigem:'PYG',valorOriginal:25000,taxaCambioAplicada:1100,valorBRL:22.73});
 expect(setDespesas).toHaveBeenCalled();
});
test('sem cotação PYG confirmada não registra despesa em guaranis',async()=>{
 const commit=vi.fn();montar([],commit,{moedaPadrao:'PYG',taxasCambio:{BRL:1,PYG:0}});
 fireEvent.click(screen.getByRole('button',{name:/Lançar Nova Despesa/}));
 fireEvent.change(screen.getByPlaceholderText(/Pagamento Fornecedor/),{target:{value:'Internet'}});
 fireEvent.change(screen.getByText(/Valor na moeda original/).parentElement.querySelector('input'),{target:{value:'25000'}});
 fireEvent.click(screen.getByRole('button',{name:/Registrar Despesa no Sistema/}));
 expect(screen.getByText(/Valor ou cotação inválidos/)).toBeTruthy();
 expect(commit).not.toHaveBeenCalled();
});

test('editar descrição de despesa PYG com câmbio novo preserva taxa histórica',async()=>{
 const exp={id:'DPYG',descricao:'Frete',status:'pendente',categoria:'Outros',
   moedaOrigem:'PYG',valorOriginal:25000,taxaCambioAplicada:1150,valorBRL:21.74};
 const commit=vi.fn(async({changes})=>({cloudOk:true,values:{despesas:changes[0].value}}));
 montar([exp],commit,{moedaPadrao:'PYG',taxasCambio:{BRL:1,PYG:1100,USD:0.2,EUR:0.18}});
 fireEvent.click(screen.getByRole('button',{name:'Editar'}));
 fireEvent.change(screen.getByDisplayValue('Frete'),{target:{value:'Frete corrigido'}});
 fireEvent.click(screen.getByRole('button',{name:/Salvar alterações/}));
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 expect(commit.mock.calls[0][0].changes[0].value[0])
   .toMatchObject({descricao:'Frete corrigido',moedaOrigem:'PYG',valorOriginal:25000,
     taxaCambioAplicada:1150,valorBRL:21.74});
});
