import React from 'react';
import {test,expect} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import Despesas from '../../src/components/Despesas.jsx';
test('trocar entre operador e gerência preserva ordem dos hooks e a UI',()=>{
 const props={userId:'loja',commitOperacaoNegocio:()=>{},registrarFinanceiro:()=>{},
 caixaMovimentos:[],setCaixaMovimentos:()=>{},sessaoAtiva:{id:'cx'},saldoSessaoFisicoBRL:1000,
 operadorAtivo:{id:'adm'},despesas:[],setDespesas:()=>{},fmt:v=>String(v),
 tx:s=>s,moeda:'BRL',converterParaBRL:v=>v,converterDeBRL:v=>v};
 const view=render(<Despesas {...props} patenteUsuario="operador"/>);
 expect(screen.getByText('Acesso Restrito')).toBeTruthy();
 view.rerender(<Despesas {...props} patenteUsuario="gerencia"/>);
 expect(screen.getByText('Contas a Pagar & Despesas')).toBeTruthy();
 view.rerender(<Despesas {...props} patenteUsuario="operador"/>);
 expect(screen.getByText('Acesso Restrito')).toBeTruthy();
 cleanup();
});
