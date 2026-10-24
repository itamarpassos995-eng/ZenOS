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
test('abertura não faz query; saldo em aberto independe da seleção de período',()=>{
 setup();
 expect(screen.getAllByText('R$ 1.500,00').length).toBeGreaterThan(0);
 expect(buscarPaginaExtrato).not.toHaveBeenCalled();
 expect(buscarHistoricoIntegralCliente).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Vendido fiado no período'}));
 expect(screen.getAllByText('R$ 200,00').length).toBeGreaterThan(0);
 expect(screen.getAllByText('R$ 1.500,00').length).toBeGreaterThan(0);
 expect(buscarPaginaExtrato).not.toHaveBeenCalled();
});
test('extrato só consulta por ação explícita e falha não vira página confirmada',async()=>{
 setup();
 fireEvent.click(screen.getByRole('button',{name:'Consultar extrato'}));
 expect(buscarPaginaExtrato).not.toHaveBeenCalled();
 buscarPaginaExtrato.mockResolvedValueOnce({itens:[{id:'L1',tipo:'venda_fiada',
  valor:200,createdAt:hoje,saldoClienteDepois:1500,referenciaId:'V1'}],
  cursor:null,possuiMais:false});
 fireEvent.click(screen.getByRole('button',{name:'Buscar período'}));
 await waitFor(()=>expect(buscarPaginaExtrato).toHaveBeenCalledTimes(1));
 await waitFor(()=>expect(screen.getByText(/Páginas percorridas/)).toBeTruthy());
 expect(screen.getByText('V1')).toBeTruthy();
 buscarPaginaExtrato.mockRejectedValueOnce(new Error('missing index'));
 fireEvent.click(screen.getByRole('button',{name:'Atualizar consulta'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('missing index'));
});
