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
 expect(screen.queryByRole('button',{name:/Conferir cadastro incompleto/})).toBeNull();
 fireEvent.change(screen.getByRole('textbox',{name:'SKU original'}),{target:{value:'66346'}});
 fireEvent.click(screen.getByRole('button',{name:'Recuperar produto por SKU'}));
 await waitFor(()=>expect(screen.getByText(/Cadastro ainda não disponível/)).toBeTruthy());
 expect(liberarIndiceOrfaoPDV).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'OK'}));
 fireEvent.click(screen.getByRole('button',{name:/Conferir cadastro incompleto/}));
 expect(liberarIndiceOrfaoPDV).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Conferir e liberar se seguro'}));
 await waitFor(()=>expect(liberarIndiceOrfaoPDV).toHaveBeenCalledWith({
  db:{},userId:'store-a',sku:'66346',ownerId:'PROD-BALCAO-123456789',operadorId:'manager-id'
 }));
 await waitFor(()=>expect(screen.getByText(/Cadastro liberado com segurança/)).toBeTruthy());
 expect(data.setProdutos).not.toHaveBeenCalled();
 expect(data.commitOperacaoNegocio).not.toHaveBeenCalled();
});
test('liberação rejeitada preserva cadastro e expõe motivo, sem mentir sucesso',async()=>{
 localizarSkuHistoricoServidor.mockResolvedValue({status:'orphan_index',ownerId:'PROD-BALCAO-123456789'});
 liberarIndiceOrfaoPDV.mockResolvedValue({status:'blocked',reason:'historico_estoque_ou_vendas_vinculado'});
 const data=props();
 render(<Produtos {...data}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'SKU original'}),{target:{value:'66346'}});
 fireEvent.click(screen.getByRole('button',{name:'Recuperar produto por SKU'}));
 await waitFor(()=>expect(screen.getByText(/Cadastro ainda não disponível/)).toBeTruthy());
 fireEvent.click(screen.getByRole('button',{name:'OK'}));
 fireEvent.click(screen.getByRole('button',{name:/Conferir cadastro incompleto/}));
 fireEvent.click(screen.getByRole('button',{name:'Conferir e liberar se seguro'}));
 await waitFor(()=>expect(screen.getByText(/Cadastro precisa de suporte/)).toBeTruthy());
 expect(data.setProdutos).not.toHaveBeenCalled();
});
test('sem permissão gerencial o botão não existe',()=>{
 render(<Produtos {...props()} patenteUsuario="operador"/>);
 expect(screen.queryByRole('button',{name:/Conferir cadastro incompleto/})).toBeNull();
});
