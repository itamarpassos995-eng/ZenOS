import React from 'react';
import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
vi.mock('../../src/firebase',()=>({db:{}}));
vi.mock('firebase/firestore',()=>({collection:vi.fn((...x)=>x),query:vi.fn((...x)=>x),where:vi.fn((...x)=>x),orderBy:vi.fn((...x)=>x),limit:vi.fn(n=>n),startAfter:vi.fn(x=>x),getDocsFromServer:vi.fn()}));
vi.mock('../../src/core/productRegistry',()=>({reservarIdentidadeProduto:vi.fn(),liberarIdentidadeProduto:vi.fn()}));
import {getDocsFromServer,where,limit} from 'firebase/firestore';
import GestaoCaixas from '../../src/components/GestaoCaixas.jsx';
// Produtos uses the real parsing, pricing, identity and business-operation payload.
import Produtos from '../../src/components/Produtos.jsx';
afterEach(()=>{cleanup();vi.clearAllMocks();});
test('histórico abre e reimprime sem consulta, livro somente por período e em páginas',async()=>{
 getDocsFromServer.mockResolvedValue({docs:[],size:0});
 vi.spyOn(window,'print').mockImplementation(()=>{});
 const date=new Date().toISOString();
 render(<GestaoCaixas userId="test" tx={s=>s} fmt={n=>String(n)} sessoesCaixa={[{id:'old',createdAt:date,abertura:date,status:'fechada',saldoInformado:1445,saldoSistema:1941.74,diferenca:null,situacaoConciliacao:'PENDENTE_AUDITORIA'}]}/>);
 expect(getDocsFromServer).not.toHaveBeenCalled();
 expect(screen.getByText('Auditoria pendente',{selector:'span'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Consultar caixa'}));
 fireEvent.click(screen.getByRole('dialog').querySelector('.zen-action--primary'));
 expect(window.print).toHaveBeenCalledOnce();expect(getDocsFromServer).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Fechar',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:'Consultar lançamentos do período'}));
 await waitFor(()=>expect(getDocsFromServer).toHaveBeenCalledOnce());
 expect(where).toHaveBeenCalledWith('createdAt','>=',expect.any(String));
 expect(where).toHaveBeenCalledWith('createdAt','<',expect.any(String));expect(limit).toHaveBeenCalledWith(100);
});
test('produto em PYG salvo pela interface envia preço convertido uma vez e reabre nativo',async()=>{
 const product={id:'P1',nome:'Massa',sku:'M1',custoBRL:20000/1150,precoBRL:39990/1150,preco2BRL:38000/1150,habilitarPreco2:true,estoque:0,estoqueVitrine:0,estoqueGalpao:0};
 const commit=vi.fn(async p=>({cloudOk:true,values:{produtos:p.changes.find(c=>c.field==='produtos').value}}));
 render(<Produtos userId="test" produtos={[product]} setProdutos={vi.fn()} moeda="PYG" converterDeBRL={v=>v*1150} converterParaBRL={v=>v/1150} fmt={String} t={s=>s} tx={s=>s} patenteUsuario="gerencia" operadorAtivo={{id:'admin'}} commitOperacaoNegocio={commit}/>);
 fireEvent(window,new CustomEvent('zenos:abrir-produto',{detail:product}));
 expect(screen.getByDisplayValue('39990')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Salvar Produto no Sistema'}));
 await waitFor(()=>expect(commit).toHaveBeenCalledOnce());
 const saved=commit.mock.calls[0][0].changes.find(c=>c.field==='produtos').value[0];
 expect(saved.precoBRL).toBe(39990/1150);expect(saved.custoBRL).toBe(20000/1150);
});
test('preço nativo permanece PYG após mudar a preferência para USD e atualizar câmbio',async()=>{
 const product={id:'P-NATIVE',nome:'Massa',sku:'MN',custoBRL:20000/1150,precoBRL:39990/1150,estoque:0,estoqueVitrine:0,estoqueGalpao:0,
  valoresMonetarios:{versao:1,campos:{custoBRL:{valor:20000,moeda:'PYG'},precoBRL:{valor:39990,moeda:'PYG'}}}};
 const rates={BRL:1,PYG:2000,USD:0.25,EUR:0.2};
 const commit=vi.fn(async p=>({cloudOk:true,values:{produtos:p.changes.find(c=>c.field==='produtos').value}}));
 render(<Produtos userId="test" produtos={[product]} setProdutos={vi.fn()} moeda="USD" converterDeBRL={(v,m)=>v*rates[m]} converterParaBRL={(v,m)=>v/rates[m]} fmt={String} t={s=>s} tx={s=>s} patenteUsuario="gerencia" operadorAtivo={{id:'admin'}} commitOperacaoNegocio={commit}/>);
 fireEvent(window,new CustomEvent('zenos:abrir-produto',{detail:product}));
 expect(screen.getByDisplayValue('39990')).toBeTruthy();
 expect(screen.getByRole('combobox',{name:'Moeda do preço'}).value).toBe('PYG');
 fireEvent.click(screen.getByRole('button',{name:'Salvar Produto no Sistema'}));
 await waitFor(()=>expect(commit).toHaveBeenCalledOnce());
 const saved=commit.mock.calls[0][0].changes.find(c=>c.field==='produtos').value[0];
 expect(saved.valoresMonetarios).toEqual(product.valoresMonetarios);expect(saved.precoBRL).toBe(product.precoBRL);
});

test('todos os caixas encontra registro antigo, consulta e reimprime sem popup ou leitura da nuvem',()=>{
 vi.spyOn(window,'print').mockImplementation(()=>{});
 const popup=vi.spyOn(window,'open').mockImplementation(()=>{throw Error('Popup proibido neste teste');});
 const records=[{id:'LEGADO-31-OUT',operadorNome:'Operador histórico',abertura:'31/10/2025, 11:59:26',fechamento:'2025-10-31T14:00:00Z',status:'fechada',saldoInicial:100,saldoSistema:100,saldoInformado:100,diferenca:0,
  detalheAbertura:{PYG:'120.000'},detalheFechamento:{PYG:'120.000'}}];
 const before=JSON.stringify(records);
 render(<GestaoCaixas userId="test" tx={s=>s} fmt={n=>String(n)} sessoesCaixa={records}/>);
 expect(screen.queryByText('Operador histórico')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Todos os caixas'}));
 expect(screen.getByText('Operador histórico')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Consultar lançamentos do período'}).disabled).toBe(true);
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'LEGADO-31'}});
 fireEvent.click(screen.getByRole('button',{name:'Reimprimir',exact:true}));
 const report=screen.getByRole('dialog');expect(report.textContent).toContain('LEGADO-31-OUT');expect(report.textContent).toContain('120.000');
 expect(window.print).toHaveBeenCalledOnce();expect(popup).not.toHaveBeenCalled();expect(getDocsFromServer).not.toHaveBeenCalled();
 expect(report.textContent).not.toContain('pixEntradas');expect(JSON.stringify(records)).toBe(before);
 fireEvent.keyDown(report,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();
});
test('registro fechado sem data permanece consultável em Todos, sem fabricar data ou diferença',()=>{
 render(<GestaoCaixas userId="test" tx={s=>s} fmt={n=>String(n)} sessoesCaixa={[{id:'SEM-DATA',operadorNome:'Sem data',status:'fechada',diferenca:null}]}/>);
 fireEvent.click(screen.getByRole('button',{name:'Todos os caixas'}));
 fireEvent.click(screen.getByRole('button',{name:'Consultar caixa'}));
 const report=screen.getByRole('dialog');expect(report.textContent).toContain('SEM-DATA');expect(report.textContent).toContain('diferença indeterminada');
 expect(report.textContent).not.toContain('Invalid Date');expect(getDocsFromServer).not.toHaveBeenCalled();
});
