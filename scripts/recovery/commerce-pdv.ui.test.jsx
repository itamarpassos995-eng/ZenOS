import {test,expect,vi,beforeEach} from 'vitest';
import {importarRascunhoCommerce,reconciliarRascunhoCommerceFaturado} from '../../src/core/commercePDVDraft';
import {lerRascunhoPDV,salvarRascunhoPDV} from '../../src/core/pdvDraft';
import {lerTravaFaturamentoCommerce,gravarTravaFaturamentoCommerce} from '../../src/core/commerceSaleFence';
const id='ab'.repeat(16),vendaId=`COMMERCE-${id}`;
const pedido={lojaId:'A',pedidoId:id,vendaId,preparadoEm:'2026-10-18T12:00:00Z',clienteNome:'Teste',itens:[{produtoId:'P1',quantidade:2,precoUnitarioCentavos:1250}]};
const produtos=[{id:'P1',sku:'S1',nome:'Produto real',precoBRL:99,estoque:3,imagem:'data:image/png;base64,test'}];
const importar=extra=>importarRascunhoCommerce({lojaId:'A',operadorId:'op',pedido,produtos,...extra});
beforeEach(()=>localStorage.clear());
test('importa preço validado e produto original, persiste vínculo sem fotos nem alterar produto',()=>{
 const before=JSON.stringify(produtos);const draft=importar();
 expect(draft.itensVenda[0]).toMatchObject({produtoOriginalId:'P1',qtd:'2',precoPraticadoBRL:12.5});
 const saved=lerRascunhoPDV('A','op');expect(saved.commerceOrigem.vendaId).toBe(vendaId);
 expect(saved.itensVenda[0].imagem).toBeUndefined();expect(JSON.stringify(produtos)).toBe(before);
 saved.itensVenda[0].qtd='1';salvarRascunhoPDV('A','op',saved);
 expect(importar().itensVenda[0].qtd).toBe('1');
});
test('não substitui atendimento nem aceita outra loja, identidade duplicada ou produto ausente',()=>{
 salvarRascunhoPDV('A','op',{itensVenda:[{id:'outro',qtd:'3'}]});
 expect(()=>importar()).toThrow(/atendimento/);expect(lerRascunhoPDV('A','op').itensVenda[0].id).toBe('outro');
 localStorage.clear();expect(()=>importar({lojaId:'B'})).toThrow(/confirmado/);
 expect(()=>importar({produtos:[]})).toThrow(/não confere/);
 expect(()=>importar({produtos:[...produtos,...produtos]})).toThrow(/não confere/);
});
test('trava preserva pedido mesmo com carrinho vazio; nova importação não apaga edição',()=>{
 const draft=importar();salvarRascunhoPDV('A','op',{...draft,itensVenda:[]});
 expect(lerRascunhoPDV('A','op').commerceOrigem.pedidoId).toBe(id);
 expect(importar().itensVenda).toHaveLength(0);
});
test('recuperação autoritativa encerra somente rascunho do mesmo pedido e loja',()=>{
 importar();
 const reconciliar=p=>reconciliarRascunhoCommerceFaturado({lojaId:'A',operadorId:'op',pedido:p});
 expect(()=>reconciliar({...pedido,faturado:false})).toThrow(/não confirmado/);
 expect(()=>reconciliar({...pedido,faturado:true,lojaId:'B'})).toThrow(/não confirmado/);
 reconciliar({...pedido,faturado:true,pedidoId:'cd'.repeat(16),vendaId:`COMMERCE-${'cd'.repeat(16)}`});
 expect(lerRascunhoPDV('A','op').commerceOrigem.pedidoId).toBe(id);
 reconciliar({...pedido,faturado:true});expect(lerRascunhoPDV('A','op')).toBe(null);
});
test('trava só pode acompanhar a venda correspondente e bloqueia faturamento posterior',async()=>{
 const {initializeApp,deleteApp}=await import('firebase/app');const {getFirestore}=await import('firebase/firestore');
 const app=initializeApp({projectId:'demo-zenos-local'},'commerce-fence-unit'),db=getFirestore(app);
 try{
 const sale={id:vendaId,origem:'commerce',commercePedidoId:id,estado:'concluida',createdAt:pedido.preparadoEm};
 const changes=[{field:'historicoVendas',value:[sale]}],guards=[{type:'commerce_order_once',orderId:id,saleId:vendaId}];
 const tx={get:vi.fn(async()=>({exists:()=>false})),set:vi.fn()};
 expect(await lerTravaFaturamentoCommerce(tx,db,'A',[],changes)).toBe(null);expect(tx.get).not.toHaveBeenCalled();
 const fence=await lerTravaFaturamentoCommerce(tx,db,'A',guards,changes);
 expect(fence.ref.path).toBe(`lojas/A/commerce_faturamentos/${id}`);gravarTravaFaturamentoCommerce(tx,fence);
 expect(tx.set).toHaveBeenCalledWith(fence.ref,{pedidoId:id,vendaId,criadoEm:pedido.preparadoEm});
 tx.get.mockResolvedValue({exists:()=>true});await expect(lerTravaFaturamentoCommerce(tx,db,'A',guards,changes)).rejects.toMatchObject({code:'ZENOS_COMMERCE_ALREADY_BILLED'});
 await expect(lerTravaFaturamentoCommerce(tx,db,'A',guards,[])).rejects.toMatchObject({code:'ZENOS_COMMERCE_SALE_INVALID'});
 }finally{await deleteApp(app);}
});
