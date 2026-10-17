import React,{useState,useRef} from 'react';
import {beforeAll,afterAll,afterEach,beforeEach,test,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {webcrypto} from 'node:crypto';
import {doc,getDoc} from 'firebase/firestore';
import {createRealFixture} from './real_fixture.mjs';
import {getOperationalSnapshot,peekV2Session} from '../../src/core/operationalRepository.js';
import {persistV1BusinessOperationSafe} from '../../src/core/productionSync.js';
import {normalizarProduto,normalizarCliente,traducoes} from '../../src/data.js';
const fixture=vi.hoisted(()=>({current:null}));
vi.mock('../../src/firebase',()=>({get db(){return fixture.current?.db;}}));
import PDV from '../../src/components/PDV.jsx';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
let commits=[],chosen;
beforeAll(async()=>{
 fixture.current=await createRealFixture();const f=fixture.current,b=f.operation;
 chosen=b.produtos.find(p=>p.tipoItem!=='servico'&&Number(p.estoqueVitrine)>20&&Number(p.precoBRL)>Number(p.custoBRL)*1.5);expect(chosen).toBeTruthy();
 const seed=await persistV1BusinessOperationSafe({db:f.db,userId:f.userId,operationKey:'ui-only-fixtures',changes:[
  {field:'clientes',baseValue:b.clientes,value:[...b.clientes,{id:'TEST-UI-CLIENT',nome:'Cliente de homologacao',limiteCreditoBRL:100000,saldoDevedorBRL:0}]},
  {field:'vouchers',baseValue:b.vouchers,value:[...b.vouchers,{codigo:'VALE-TEST-UI',saldoBRL:100000,status:'ativo'}]}]});expect(seed.cloudOk,seed.error?.message).toBe(true);
 f.operation=(await getOperationalSnapshot(f.db,f.userId)).data();
});
beforeEach(async()=>{commits=[];fixture.current.operation=(await getOperationalSnapshot(fixture.current.db,fixture.current.userId)).data();});
afterEach(cleanup);afterAll(async()=>fixture.current?.close());
function Harness(){
 const initial=fixture.current.operation;
 const [produtos,setProdutos]=useState(initial.produtos.map(normalizarProduto));
 const [clientes,setClientes]=useState(initial.clientes.map(normalizarCliente));
 const [historicoVendas,setHistoricoVendas]=useState(initial.historicoVendas);
 const [vouchers,setVouchers]=useState(initial.vouchers);
 const bases=useRef({...initial,produtos:produtos,clientes:clientes});
 const commit=async args=>{
  const base=bases.current;
  const result=await persistV1BusinessOperationSafe({...args,db:fixture.current.db,userId:fixture.current.userId,changes:args.changes.map(c=>({...c,baseValue:base[c.field]}))});
  commits.push({args,result});if(result.cloudOk)Object.assign(bases.current,result.values);return result;
 };
 return <PDV perfilLoja={{nomeLoja:'Homologacao'}} taxasCambio={{BRL:1,PYG:1300,USD:0.2}} commitVendaCritica={commit}
  userId={fixture.current.userId} produtos={produtos} setProdutos={setProdutos} clientes={clientes} setClientes={setClientes}
  historicoVendas={historicoVendas} setHistoricoVendas={setHistoricoVendas} vouchers={vouchers} setVouchers={setVouchers}
  moeda="BRL" fmt={n=>Number(n||0).toFixed(2)} t={k=>traducoes.pt[k]||k} tx={pt=>pt} converterDeBRL={v=>v} converterParaBRL={v=>v}
  patenteUsuario="gerencia" idioma="pt" regrasDesconto={{margemMinima:0}} vendedores={initial.vendedores}
  operadorAtivo={{id:'admin',nome:'Homologacao',patente:'gerencia',permissoes:{admin:true}}} sessaoAtiva={initial.sessoesCaixa.find(s=>s.status==='aberta')}/>;
}
test.each(['dinheiro_brl','pix','cartaoCredito','cartaoDebito','misto','voucher','crediario'])('PDV real: pagamento %s confirma venda, estoque e financeiro sem tocar na V1',async method=>{
 const f=fixture.current,before=(await getDoc(doc(f.db,'lojas',f.userId,'dados','operacao'))).data();
 const oldProduct=f.operation.produtos.find(p=>p.id===chosen.id),oldSales=f.operation.historicoVendas.length;
 render(<Harness/>);
 if(method==='crediario'){
  fireEvent.focus(screen.getByPlaceholderText(/Consumidor Final/));
  fireEvent.change(screen.getByPlaceholderText(/Consumidor Final/),{target:{value:'Cliente de homologacao'}});
  fireEvent.mouseDown(await screen.findByText('Cliente de homologacao',{exact:true}));
 }
 fireEvent.change(screen.getByPlaceholderText(traducoes.pt.buscaPlaceholder),{target:{value:String(chosen.sku)}});
 fireEvent.click(await screen.findByText(chosen.nome,{exact:true}));
 fireEvent.click(await screen.findByRole('button',{name:'Adicionar',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:/Receber no Caixa/}));
 const paymentSelect=screen.getAllByRole('combobox').find(select=>[...select.options].some(o=>o.value==='dinheiro_brl'));
 expect(paymentSelect).toBeTruthy();
 const launch=(kind,amount)=>{
  fireEvent.change(paymentSelect,{target:{value:kind}});
  if(kind==='voucher')fireEvent.change(screen.getByPlaceholderText('VALE-000000'),{target:{value:'VALE-TEST-UI'}});
  if(amount!==undefined)fireEvent.change(screen.getByPlaceholderText('0.00'),{target:{value:String(amount)}});
  fireEvent.click(screen.getByRole('button',{name:'+ Lançar Pagamento',exact:true}));
 };
 if(method==='misto'){launch('dinheiro_brl',Number(chosen.precoBRL)/2);launch('pix');}else launch(method);
 const submit=screen.getByRole('button',{name:'Liquidar no Caixa',exact:true});expect(submit.disabled).toBe(false);fireEvent.click(submit);
 fireEvent.click(await screen.findByRole('button',{name:'Continuar venda',exact:true}));
 await waitFor(()=>expect(commits.length).toBe(1),{timeout:30000});expect(commits[0].result.cloudOk,commits[0].result.error?.message).toBe(true);
 await screen.findByRole('button',{name:'Novo Atendimento',exact:true},{timeout:30000});
 const state=(await getOperationalSnapshot(f.db,f.userId)).data();const sale=state.historicoVendas.find(v=>v.id===commits[0].args.operationKey.replace('pdv:',''));
 expect(sale).toBeTruthy();expect(sale.estado).toBe('concluida');expect(state.historicoVendas.length).toBe(oldSales+1);
 expect(state.produtos.find(p=>p.id===chosen.id).estoque).toBe(Number(oldProduct.estoque)-1);
 expect((await getDoc(doc(f.db,'lojas',f.userId,'dados','operacao'))).data()).toEqual(before);
 for(const entry of commits[0].result.financialEntries)expect((await getDoc(doc(f.db,'lojas',f.userId,'financeiro_livro',entry.id))).exists()).toBe(true);
 if(method==='crediario')expect(state.clientes.find(c=>c.id==='TEST-UI-CLIENT').saldoDevedorBRL).toBe(Number(chosen.precoBRL));
});
