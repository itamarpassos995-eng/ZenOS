import React from 'react';
import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
vi.mock('../../src/firebase',()=>({db:{}}));
vi.mock('firebase/firestore',async importOriginal=>{
 const original=await importOriginal();
 return {...original,doc:vi.fn(()=>({path:'book'})),getDocFromServer:vi.fn()};
});
vi.mock('../../src/core/operationalRepository',()=>({getOperationalSnapshot:vi.fn()}));
import {getDocFromServer} from 'firebase/firestore';
import {getOperationalSnapshot} from '../../src/core/operationalRepository';
import Despesas from '../../src/components/Despesas.jsx';
afterEach(()=>{cleanup();vi.resetAllMocks()});
const despesa={id:'d1',descricao:'Internet',status:'pendente',valorBRL:100};
const livro={id:'DESPESA-d1',referenciaId:'d1',valor:100,tipo:'pagamento_despesa',origem:'despesas',afetaCaixaFisico:true,sessaoId:'cx1',formaPagamento:'dinheiro_gaveta'};
const mov={id:'MOV-DESP-d1',sessaoId:'cx1',despesaId:'d1',tipo:'saida_despesa',direcao:'saida',afetaGaveta:true,valorBRL:100};
const setup=commit=>render(<Despesas userId="store" despesas={[despesa]} setDespesas={vi.fn()}
 commitOperacaoNegocio={commit} caixaMovimentos={[]} setCaixaMovimentos={vi.fn()}
 sessaoAtiva={{id:'cx1',status:'aberta'}} saldoSessaoFisicoBRL={5000}
 operadorAtivo={{id:'adm',nome:'Gerência'}} patenteUsuario="gerencia"
 fmt={v=>String(v)} tx={v=>v} moeda="BRL" converterParaBRL={v=>v}/>);
async function pagar(){
 fireEvent.click(screen.getByRole('button',{name:'Baixar Pgto'}));
 fireEvent.click(screen.getByRole('button',{name:'Confirmar Pago'}));
}
test('histórico existente reconcilia status sem uma segunda saída do caixa',async()=>{
 const commit=vi.fn()
 .mockResolvedValueOnce({cloudOk:false,error:Object.assign(new Error('Histórico já existe'),{code:'V2_HISTORY_COLLISION'})})
 .mockResolvedValueOnce({cloudOk:true,values:{despesas:[{...despesa,status:'paga'}]}});
 getDocFromServer.mockResolvedValue({exists:()=>true,id:'DESPESA-d1',data:()=>livro});
 getOperationalSnapshot.mockResolvedValue({exists:()=>true,data:()=>({despesas:[despesa],caixaMovimentos:[mov]})});
 setup(commit);await pagar();
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(2));
 const second=commit.mock.calls[1][0];
 expect(second.financialEntries).toEqual([]);
 expect(second.changes).toHaveLength(1);
 expect(second.changes[0].field).toBe('despesas');
 expect(second.guards[0]).toMatchObject({type:'entity_field_equals',property:'status',expected:'pendente'});
 expect(second.operationKey).toBe('despesa-reconciliar-pagamento:d1');
 await waitFor(()=>expect(screen.getByText(/Pagamento original localizado/)).toBeTruthy());
});
test('sem movimento original, não concilia e não debita de novo',async()=>{
 const commit=vi.fn().mockResolvedValue({cloudOk:false,error:Object.assign(new Error('Histórico já existe'),{code:'V2_HISTORY_COLLISION'})});
 getDocFromServer.mockResolvedValue({exists:()=>true,id:'DESPESA-d1',data:()=>livro});
 getOperationalSnapshot.mockResolvedValue({exists:()=>true,data:()=>({despesas:[despesa],caixaMovimentos:[]})});
 setup(commit);await pagar();
 await waitFor(()=>expect(screen.getByText(/Pagamento exige conferência/)).toBeTruthy());
 expect(commit).toHaveBeenCalledTimes(1);
});
