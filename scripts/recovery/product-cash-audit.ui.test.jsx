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
 const popup={document:{title:'',createElement:()=>({style:{}}),body:{appendChild:vi.fn()},close:vi.fn()},focus:vi.fn(),print:vi.fn()};
 vi.spyOn(window,'open').mockReturnValue(popup);
 const date=new Date().toISOString();
 render(<GestaoCaixas userId="test" tx={s=>s} fmt={n=>String(n)} sessoesCaixa={[{id:'old',createdAt:date,abertura:date,status:'fechada',saldoInformado:1445,saldoSistema:1941.74,diferenca:null,situacaoConciliacao:'PENDENTE_AUDITORIA'}]}/>);
 expect(getDocsFromServer).not.toHaveBeenCalled();
 expect(screen.getByText('Auditoria pendente')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Conferir / Reimprimir'}));
 fireEvent.click(screen.getByRole('button',{name:'Reimprimir',exact:true}));
 expect(popup.print).toHaveBeenCalledOnce();expect(getDocsFromServer).not.toHaveBeenCalled();
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
