import React from 'react';
import {afterEach,test,expect,vi} from 'vitest';
import {render,fireEvent,screen,cleanup,waitFor} from '@testing-library/react';
vi.mock('../../src/firebase',()=>({db:{}}));
vi.mock('../../src/core/productIndexAudit',()=>({auditarIndicesProdutosServidor:vi.fn()}));
vi.mock('../../src/core/productRecoveryDiagnosis',()=>({diagnosticarCadastroOcultoServidor:vi.fn()}));
vi.mock('../../src/core/operationalRepository',()=>({getOperationalSnapshot:vi.fn()}));
import {auditarIndicesProdutosServidor} from '../../src/core/productIndexAudit';
import {diagnosticarCadastroOcultoServidor} from '../../src/core/productRecoveryDiagnosis';
import {getOperationalSnapshot} from '../../src/core/operationalRepository';
import Produtos from '../../src/components/Produtos.jsx';
const p={id:'id-66346',nome:'Pneu Original',sku:'SKU-66346',ativo:false,estoque:7,estoqueVitrine:2,estoqueGalpao:5,precoBRL:100};
const idx={produtoId:p.id,nomes:[p.nome],skus:[p.sku],indices:2};
const auditoria={status:'complete',readCount:4,catalogCount:2,inativos:[idx],ausentes:[],duplicados:[],ativos:1};
const base={
 userId:'store',produtos:[p],setProdutos:vi.fn(),moeda:'BRL',fmt:v=>String(v),
 t:s=>s,tx:s=>s,fornecedoresGlobais:[],operadorAtivo:{id:'adm',nome:'Gerente'},patenteUsuario:'gerencia',
 historicoVendas:[],historicoCompras:[],vendedores:[],regrasDesconto:{},commitOperacaoNegocio:vi.fn()
};
afterEach(()=>{cleanup();vi.clearAllMocks()});
async function abrir(){
 fireEvent.click(screen.getByRole('button',{name:'Auditoria completa (avançada)'}));
 // Sem confirmação, a varredura NÃO pode iniciar.
 expect(auditarIndicesProdutosServidor).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Executar auditoria completa'}));
 await waitFor(()=>expect(screen.getByText(/Conferência de produtos concluída/)).toBeTruthy());
 fireEvent.click(screen.getByRole('button',{name:'OK'}));
 fireEvent.click(screen.getByRole('button',{name:'Conferir cadastro'}));
}
test('botão só aparece após auditoria e recupera cadastro inativo conservando dados',async()=>{
 auditoria&&auditarIndicesProdutosServidor.mockResolvedValue(auditoria);
 diagnosticarCadastroOcultoServidor.mockResolvedValue({status:'original_inativo',ownerId:p.id,produto:p,indicesAtivos:2});
 getOperationalSnapshot.mockResolvedValue({exists:()=>true,data:()=>({produtos:[p],_syncMeta:{fieldRevisions:{produtos:11}}})});
 const commit=vi.fn(async ({changes})=>({cloudOk:true,values:{produtos:changes[0].value}}));
 render(<Produtos {...base} commitOperacaoNegocio={commit}/>);
 expect(screen.queryByRole('button',{name:'Reativar este produto original'})).toBeNull();
 await abrir();
 await waitFor(()=>expect(screen.getByText(/Produto desativado/)).toBeTruthy());
 expect(commit).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'OK'}));
 fireEvent.click(screen.getByRole('button',{name:'Reativar este produto original'}));
 expect(commit).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Confirmar reativação do original'}));
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 const params=commit.mock.calls[0][0];
 expect(params.changes[0].value[0]).toMatchObject({id:p.id,sku:p.sku,estoque:7,ativo:true});
 expect(params.guards[0]).toMatchObject({type:'entity_unchanged',entityId:p.id,expected:p});
 expect(params.operationKey).toContain('reativar-original:id-66346:11');
 expect(params.changes[0].value).toHaveLength(1);
});
test('índice sem cadastro nunca apresenta reativação nem gravação',async()=>{
 auditarIndicesProdutosServidor.mockResolvedValue({...auditoria,inativos:[],ausentes:[idx],catalogCount:0});
 diagnosticarCadastroOcultoServidor.mockResolvedValue({status:'indice_sem_cadastro',ownerId:p.id,indicesAtivos:2});
 const commit=vi.fn();
 render(<Produtos {...base} produtos={[]} commitOperacaoNegocio={commit}/>);
 await abrir();
 await waitFor(()=>expect(screen.getByText(/Cadastro precisa ser completado/)).toBeTruthy());
 fireEvent.click(screen.getByRole('button',{name:'OK'}));
 expect(screen.queryByRole('button',{name:'Reativar este produto original'})).toBeNull();
 expect(commit).not.toHaveBeenCalled();
});
test('operador comum não pode auditar nem reativar',()=>{
 render(<Produtos {...base} patenteUsuario="operador"/>);
 expect(screen.queryByRole('button',{name:'Auditoria completa (avançada)'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Recuperar produto por SKU'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Conferir cadastro'})).toBeNull();
});
