import React,{useState} from 'react';
import {test,expect,vi,afterAll} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,configure} from '@testing-library/react';
import {webcrypto} from 'node:crypto';
import {doc,getDoc} from 'firebase/firestore';
import {createRealFixture} from './real_fixture.mjs';
import {getOperationalSnapshot} from '../../src/core/operationalRepository.js';
import {persistV1BusinessOperationSafe} from '../../src/core/productionSync.js';
const holder=vi.hoisted(()=>({value:null}));
vi.mock('../../src/firebase',()=>({get db(){return holder.value?.db;}}));
import Clientes from '../../src/components/Clientes.jsx';
import Produtos from '../../src/components/Produtos.jsx';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
configure({getElementError:()=>new Error('Elemento de cadastro não encontrado; dados privados omitidos.')});
afterAll(async()=>{cleanup();await holder.value?.close();});

test('Cadastros reais: novo cliente e novo produto são confirmados em V2 sem regravar V1',async()=>{
 const f=await createRealFixture();holder.value=f;
 const before=(await getDoc(doc(f.db,'lojas',f.userId,'dados','operacao'))).data();
 let base=f.operation,confirmed=0;
 const commit=async args=>{
  const result=await persistV1BusinessOperationSafe({...args,db:f.db,userId:f.userId,
   changes:args.changes.map(c=>({...c,baseValue:base[c.field]}))});
  expect(result.cloudOk,result.error?.message).toBe(true);
  if(result.cloudOk){base={...base,...result.values};confirmed++;}return result;
 };
 const common={moeda:'BRL',fmt:n=>String(Number(n||0)),t:k=>k,tx:pt=>pt,converterDeBRL:n=>n,converterParaBRL:n=>n,commitOperacaoNegocio:commit};
 function ClientHarness(){const [clientes,setClientes]=useState(base.clientes);
  return <Clientes {...common} clientes={clientes} setClientes={setClientes}/>;}
 render(<ClientHarness/>);
 fireEvent.click(screen.getByText('novoClienteBtn',{selector:'button',exact:true}));
 fireEvent.change(screen.getByPlaceholderText('Ex: Pinturas Silva'),{target:{value:'EMULATOR-ONLY-NEW-CUSTOMER'}});
 fireEvent.click(screen.getByText('Cadastrar Cliente',{selector:'button',exact:true}));
 await waitFor(()=>expect(confirmed).toBe(1),{timeout:30000});
 expect(base.clientes.length).toBe(f.operation.clientes.length+1);
 expect(base.clientes.some(c=>c.nome==='EMULATOR-ONLY-NEW-CUSTOMER')).toBe(true);
 cleanup();
 function ProductHarness(){const [produtos,setProdutos]=useState(base.produtos);
  return <Produtos {...common} userId={f.userId} patenteUsuario="gerencia" produtos={produtos} setProdutos={setProdutos} fornecedoresGlobais={[]} historicoVendas={base.historicoVendas} historicoCompras={base.historicoCompras} vendedores={base.vendedores} regrasDesconto={{margemMinima:0}}/>;}
 render(<ProductHarness/>);
 fireEvent.click(screen.getByText('novoProdutoBtn',{selector:'button',exact:true}));
 fireEvent.change(screen.getByText('SKU',{selector:'label',exact:true}).parentElement.querySelector('input'),{target:{value:'EMULATOR-NEW-PRODUCT'}});
 fireEvent.change(screen.getByText('Nome do Item',{exact:true}).parentElement.querySelector('input'),{target:{value:'EMULATOR-ONLY-NEW-PRODUCT'}});
 fireEvent.click(screen.getByText('Salvar Produto no Sistema',{selector:'button',exact:true}));
 await waitFor(()=>expect(confirmed).toBe(2),{timeout:30000});
 const actual=(await getOperationalSnapshot(f.db,f.userId)).data();
 expect(actual.produtos.length).toBe(f.operation.produtos.length+1);
 expect(actual.produtos.some(p=>p.sku==='EMULATOR-NEW-PRODUCT')).toBe(true);
 expect((await getDoc(doc(f.db,'lojas',f.userId,'dados','operacao'))).data()).toEqual(before);
 cleanup();
},120000);
