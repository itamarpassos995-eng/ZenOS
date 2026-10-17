import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,test,expect} from 'vitest';
import Clientes from '../../src/components/Clientes.jsx';
import {traducoes} from '../../src/data.js';

afterEach(cleanup);
const base={id:'DEMO-CLI-CONSTRUCTORA',nome:'Constructora del Este S.A.',pais:'PY',
  saldoDevedorBRL:0,limiteCreditoBRL:15000,diasAtraso:4,perfilPreco:'preco2'};
const traduz=chave=>traducoes.pt[chave]||chave;
const renderizar=(cliente)=>{
  const props={
    clientes:[cliente],setClientes:()=>{},historicoVendas:[],livroFinanceiro:[],
    caixaMovimentos:[],setCaixaMovimentos:()=>{},moeda:'BRL',
    fmt:(v)=>'R$ '+Number(v||0).toFixed(2),t:traduz,tx:pt=>pt,
    converterDeBRL:v=>v,converterParaBRL:v=>v,
  };
  const r=render(<Clientes {...props}/>);
  const linha=screen.getByText(cliente.nome).closest('tr');
  return {linha,...r};
};
test('conta quitada com diasAtraso legado = 4 exibe Em Dia sem alterar dados',()=>{
  const antes=JSON.stringify(base);
  const {linha}=renderizar(base);
  expect(linha.textContent).toContain(traduz('emDia'));
  expect(linha.textContent).not.toContain('4D');
  expect(linha.textContent).not.toContain(traduz('aberto'));
  expect(linha.querySelector('button')).toBeTruthy();
  expect(JSON.stringify(base)).toBe(antes);
});
test('conta com dívida e dias de atraso conserva indicação anterior',()=>{
  const {linha}=renderizar({...base,saldoDevedorBRL:450,diasAtraso:4});
  expect(linha.textContent).toContain('4D');
  expect(linha.textContent).toContain(traduz('diasAtraso'));
});
test('conta com dívida em dia permanece Aberto',()=>{
  const {linha}=renderizar({...base,saldoDevedorBRL:250,diasAtraso:0});
  expect(linha.textContent).toContain(traduz('aberto'));
  expect(linha.textContent).not.toContain('4D');
});
test('excesso de limite mantém prioridade sobre atraso',()=>{
  const {linha}=renderizar({...base,saldoDevedorBRL:16000,diasAtraso:4});
  expect(linha.textContent).toContain(traduz('limiteExcedido'));
  expect(linha.textContent).not.toContain('4D');
});
console.log('Status visual de fiado validado sem escrita de dados');
