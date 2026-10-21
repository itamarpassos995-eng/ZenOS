import React from 'react';
import {afterEach,beforeEach,test,expect,vi} from 'vitest';
import {render,fireEvent,screen,cleanup,waitFor} from '@testing-library/react';
vi.mock('../../src/firebase',()=>({db:{}}));
vi.mock('../../src/core/productHistoricalSkuLookup',()=>({localizarSkuHistoricoServidor:vi.fn()}));
import {localizarSkuHistoricoServidor} from '../../src/core/productHistoricalSkuLookup';
import Produtos from '../../src/components/Produtos.jsx';
const base={
 userId:'test-tenant', produtos:[], setProdutos:vi.fn(), moeda:'BRL',
 t: s=>s,tx:s=>s,fmt:n=>String(n),fornecedoresGlobais:[],
 operadorAtivo:{id:'admin',nome:'Administrador'},patenteUsuario:'gerencia',
 historicoVendas:[],historicoCompras:[],vendedores:[],regrasDesconto:{},
 commitOperacaoNegocio:vi.fn()
};
afterEach(()=>{cleanup();vi.resetAllMocks()});
test('SKU histórico exibe confirmação do catálogo e não grava nada',async()=>{
 const catalog=[{id:'original-1',nome:'Pneu confirmado',sku:'66346',ativo:false,estoque:5}];
 localizarSkuHistoricoServidor.mockResolvedValue({status:'found',ownerId:'original-1',produto:catalog[0],catalog});
 const props={...base,setProdutos:vi.fn(),commitOperacaoNegocio:vi.fn()};
 render(<Produtos {...props}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'SKU original'}),{target:{value:'66346'}});
 fireEvent.click(screen.getByRole('button',{name:'Buscar SKU original'}));
 await waitFor(()=>expect(localizarSkuHistoricoServidor).toHaveBeenCalledWith({db:{},userId:'test-tenant',sku:'66346'}));
 await waitFor(()=>expect(props.setProdutos).toHaveBeenCalledWith(catalog));
 expect(screen.getByText(/Produto localizado/)).toBeTruthy();
 expect(props.commitOperacaoNegocio).not.toHaveBeenCalled();
});
test('SKU presente apenas no histórico mostra ID sem restaurar',async()=>{
 localizarSkuHistoricoServidor.mockResolvedValue({status:'historical_only',ownerId:'original-old',nome:'Pneu',sku:'66346'});
 const props={...base,setProdutos:vi.fn(),commitOperacaoNegocio:vi.fn()};
 render(<Produtos {...props}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'SKU original'}),{target:{value:'66346'}});
 fireEvent.click(screen.getByRole('button',{name:'Buscar SKU original'}));
 await waitFor(()=>expect(screen.getByText(/Produto exige conferência/)).toBeTruthy());
 expect(props.setProdutos).not.toHaveBeenCalled();
 expect(props.commitOperacaoNegocio).not.toHaveBeenCalled();
});
test('somente gerência pode acionar busca por SKU',()=>{
 render(<Produtos {...base} patenteUsuario="operador"/>);
 expect(screen.queryByRole('button',{name:'Buscar SKU original'})).toBeNull();
});
