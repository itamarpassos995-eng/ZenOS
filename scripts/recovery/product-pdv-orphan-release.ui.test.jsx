import React from 'react';
import {afterEach,test,expect,vi} from 'vitest';
import {render,fireEvent,screen,cleanup,waitFor} from '@testing-library/react';
vi.mock('../../src/firebase',()=>({db:{}}));
vi.mock('../../src/core/productHistoricalSkuLookup',()=>({localizarSkuHistoricoServidor:vi.fn()}));
vi.mock('../../src/core/productOrphanRelease',()=>({liberarIndiceOrfaoPDV:vi.fn()}));
import {localizarSkuHistoricoServidor} from '../../src/core/productHistoricalSkuLookup';
import {liberarIndiceOrfaoPDV} from '../../src/core/productOrphanRelease';
import Produtos from '../../src/components/Produtos.jsx';
afterEach(()=>{cleanup();vi.resetAllMocks()});
const props=()=>({
 userId:'store-a',produtos:[],setProdutos:vi.fn(),moeda:'BRL',
 t:s=>s,tx:s=>s,fmt:n=>String(n),fornecedoresGlobais:[],
 operadorAtivo:{id:'manager-id'},patenteUsuario:'gerencia',
 historicoVendas:[],historicoCompras:[],vendedores:[],regrasDesconto:{},
 commitOperacaoNegocio:vi.fn()
});
test('gerência vê liberação só após consulta órfã e confirmação; operação não altera catálogo',async()=>{
 localizarSkuHistoricoServidor.mockResolvedValue({status:'orphan_index',ownerId:'PROD-BALCAO-123456789',legacyReadStatus:'available'});
 liberarIndiceOrfaoPDV.mockResolvedValue({status:'released',ownerId:'PROD-BALCAO-123456789',indices:2});
 const data=props();
 render(<Produtos {...data}/>);
 expect(screen.queryByRole('button',{name:/Conferir e liberar índice órfão/})).toBeNull();
 fireEvent.change(screen.getByRole('textbox',{name:'SKU original'}),{target:{value:'66346'}});
 fireEvent.click(screen.getByRole('button',{name:'Buscar SKU original'}));
 await waitFor(()=>expect(screen.getByText('Cadastro não localizado no catálogo atual')).toBeTruthy());
 expect(liberarIndiceOrfaoPDV).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'OK'}));
 fireEvent.click(screen.getByRole('button',{name:/Conferir e liberar índice órfão/}));
 expect(liberarIndiceOrfaoPDV).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Conferir e liberar se seguro'}));
 await waitFor(()=>expect(liberarIndiceOrfaoPDV).toHaveBeenCalledWith({
  db:{},userId:'store-a',sku:'66346',ownerId:'PROD-BALCAO-123456789',operadorId:'manager-id'
 }));
 await waitFor(()=>expect(screen.getByText('Índice órfão liberado com auditoria')).toBeTruthy());
 expect(data.setProdutos).not.toHaveBeenCalled();
 expect(data.commitOperacaoNegocio).not.toHaveBeenCalled();
});
test('liberação rejeitada preserva cadastro e expõe motivo, sem mentir sucesso',async()=>{
 localizarSkuHistoricoServidor.mockResolvedValue({status:'orphan_index',ownerId:'PROD-BALCAO-123456789'});
 liberarIndiceOrfaoPDV.mockResolvedValue({status:'blocked',reason:'historico_estoque_ou_vendas_vinculado'});
 const data=props();
 render(<Produtos {...data}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'SKU original'}),{target:{value:'66346'}});
 fireEvent.click(screen.getByRole('button',{name:'Buscar SKU original'}));
 await waitFor(()=>expect(screen.getByText('Cadastro não localizado no catálogo atual')).toBeTruthy());
 fireEvent.click(screen.getByRole('button',{name:'OK'}));
 fireEvent.click(screen.getByRole('button',{name:/Conferir e liberar índice órfão/}));
 fireEvent.click(screen.getByRole('button',{name:'Conferir e liberar se seguro'}));
 await waitFor(()=>expect(screen.getByText('Liberação bloqueada para proteger dados')).toBeTruthy());
 expect(data.setProdutos).not.toHaveBeenCalled();
});
test('sem permissão gerencial o botão não existe',()=>{
 render(<Produtos {...props()} patenteUsuario="operador"/>);
 expect(screen.queryByRole('button',{name:/Conferir e liberar índice órfão/})).toBeNull();
});
