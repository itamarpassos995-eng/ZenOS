import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import ContasReceber from '../../src/components/ContasReceber.jsx';
import {buscarPaginaExtrato,buscarHistoricoIntegralCliente} from '../../src/core/financialLedgerQueries.js';

vi.mock('../../src/core/financialLedgerQueries.js',()=>({
 buscarPaginaExtrato:vi.fn(),
 buscarHistoricoIntegralCliente:vi.fn(),
}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const hoje=new Date().toISOString();
const setup=()=>render(<ContasReceber db={{}} userId="LOJA-TESTE"
 clientes={[{id:'C1',nome:'Ana Silva',saldoDevedorBRL:1500},
  {id:'C2',nome:'João',saldoDevedorBRL:0}]}
 historicoVendas={[{id:'V1',tipoDocumento:'venda',estado:'concluida',createdAt:hoje,
  clienteId:'C1',clienteNome:'Ana Silva',pagamentos:[{formaId:'crediario',valorConvertidoBRL:200}]}]}/>);

test('NÃO abre Todas em aberto e NÃO mostra dívidas nem extrato sem busca explícita',()=>{
 setup();
 expect(screen.getByText(/Nenhuma consulta selecionada/)).toBeTruthy();
 expect(screen.queryByText('R$ 1.500,00')).toBeNull();
 expect(screen.queryByRole('button',{name:'Consultar extrato'})).toBeNull();
 expect(buscarPaginaExtrato).not.toHaveBeenCalled();
 expect(buscarHistoricoIntegralCliente).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'30 dias'}));
 expect(screen.getByText(/Nenhuma consulta selecionada/)).toBeTruthy();
 expect(screen.queryByText('R$ 1.500,00')).toBeNull();
 expect(buscarPaginaExtrato).not.toHaveBeenCalled();
});

test('o período tem prioridade, e só Buscar período exibe as vendas do intervalo',()=>{
 setup();
 fireEvent.click(screen.getByRole('button',{name:/^🔎 Buscar período$/}));
 expect(screen.getAllByText('R$ 200,00').length).toBeGreaterThan(0);
 expect(screen.queryByText('R$ 1.500,00')).toBeNull();
 expect(buscarPaginaExtrato).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'30 dias'}));
 expect(screen.getByText(/Nenhuma consulta selecionada/)).toBeTruthy();
 expect(screen.queryByText('R$ 200,00')).toBeNull();
});

test('Todas em aberto exige clique separado e usa o saldo operacional já carregado',()=>{
 setup();
 fireEvent.click(screen.getByRole('button',{name:/Exibir todas as contas em aberto/}));
 expect(screen.getAllByText('R$ 1.500,00').length).toBeGreaterThan(0);
 expect(screen.queryByText('R$ 200,00')).toBeNull();
 expect(buscarPaginaExtrato).not.toHaveBeenCalled();
 expect(buscarHistoricoIntegralCliente).not.toHaveBeenCalled();
});

test('extrato só consulta após clique explícito, e erro não vira resultado confirmado',async()=>{
 setup();
 fireEvent.click(screen.getByRole('button',{name:/Exibir todas as contas em aberto/}));
 fireEvent.click(screen.getByRole('button',{name:'Consultar extrato'}));
 expect(buscarPaginaExtrato).not.toHaveBeenCalled();
 buscarPaginaExtrato.mockResolvedValueOnce({itens:[{id:'L1',tipo:'venda_fiada',
  valor:200,createdAt:hoje,saldoClienteDepois:1500,referenciaId:'V1'}],
  cursor:null,possuiMais:false});
 const buttons=screen.getAllByRole('button',{name:'Buscar período'});
 fireEvent.click(buttons[buttons.length-1]);
 await waitFor(()=>expect(buscarPaginaExtrato).toHaveBeenCalledTimes(1));
 await waitFor(()=>expect(screen.getByText(/Páginas percorridas/)).toBeTruthy());
 expect(screen.getByText('V1')).toBeTruthy();
 buscarPaginaExtrato.mockRejectedValueOnce(new Error('missing index'));
 fireEvent.click(screen.getByRole('button',{name:'Atualizar consulta'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('missing index'));
});
