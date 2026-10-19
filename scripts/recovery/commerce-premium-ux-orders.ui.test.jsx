import React from 'react';
import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import ZenCommerceOrderCard from '../../src/components/ZenCommerceOrderCard.jsx';
afterEach(()=>{cleanup();vi.clearAllMocks();});
const novo={
 id:'abcdef1234567890',status:'recebido',
 criadoEm:'2026-10-19T13:44:22.436Z',
 cliente:{nome:'Cliente fictício',telefone:'+55 (67) 99999-9999'},
 itens:[{nome:'Produto fictício A',quantidade:5},{nome:'Produto fictício B',quantidade:4}],
 totalCentavos:21150,observacao:'Retirar amanhã'
};
test('pedido novo: hierarquia de status, total, itens e ações premium acessíveis',()=>{
 const onAbrirPDV=vi.fn(),onCancelar=vi.fn();
 render(<ZenCommerceOrderCard pedido={novo} onAbrirPDV={onAbrirPDV} onCancelar={onCancelar}/>);
 expect(screen.getByText('Cliente fictício')).toBeTruthy();
 expect(screen.getByText('Novo')).toBeTruthy();
 expect(screen.getByText(/R\$\s*211,50/)).toBeTruthy();
 expect(screen.getByText('5×')).toBeTruthy();
 expect(screen.getByText('4×')).toBeTruthy();
 expect(screen.getByText('Retirar amanhã')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/Abrir no PDV/}));
 expect(onAbrirPDV).toHaveBeenCalledOnce();
 expect(onAbrirPDV).toHaveBeenCalledWith(novo.id);
 const link=screen.getByRole('link',{name:/Atender pelo WhatsApp/});
 expect(link.getAttribute('href')).toBe('https://wa.me/5567999999999');
 fireEvent.click(screen.getByRole('button',{name:'Cancelar pedido'}));
 expect(onCancelar).toHaveBeenCalledWith(novo);
});
test('pedido em atendimento não pode ser cancelado e pedido concluído não pode faturar outra vez',()=>{
 const onAbrirPDV=vi.fn(),onCancelar=vi.fn();
 const {rerender}=render(<ZenCommerceOrderCard pedido={{...novo,status:'em_atendimento',pdv:{id:'p1'}}} onAbrirPDV={onAbrirPDV} onCancelar={onCancelar}/>);
 expect(screen.getByText('Em atendimento')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Cancelar pedido'})).toBeNull();
 rerender(<ZenCommerceOrderCard pedido={{...novo,status:'encerrado',vendaId:'venda1'}} onAbrirPDV={onAbrirPDV} onCancelar={onCancelar}/>);
 expect(screen.getByRole('button',{name:/Conferir faturamento/})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Cancelar pedido'})).toBeNull();
 rerender(<ZenCommerceOrderCard pedido={{...novo,status:'cancelado'}} onAbrirPDV={onAbrirPDV} onCancelar={onCancelar}/>);
 expect(screen.queryByRole('button',{name:/Abrir no PDV/})).toBeNull();
 expect(screen.queryByRole('button',{name:'Cancelar pedido'})).toBeNull();
});
test('navegação de pedidos funciona com incremento de intenção sem trocar rota; refoca Studio existente',()=>{
 const app=readFileSync('src/App.jsx','utf8');
 const portal=readFileSync('src/components/ZenCommercePortal.jsx','utf8');
 expect(app).toContain('setFocoPedidosOnline(n=>n+1)');
 expect(app).toContain('onAbrir={abrirCentralPedidosOnline}');
 expect(app).toContain('focoPedidosOnline={focoPedidosOnline}');
 expect(portal).toContain('node.scrollIntoView');
 expect(portal).toContain('node.focus({preventScroll:true})');
 expect(portal).toContain('id="zen-pedidos-online"');
});
test('padronização visual não corta embalagens e não altera fluxo financeiro',()=>{
 const publicCss=readFileSync('src/commerce.css','utf8');
 const studio=readFileSync('src/components/ZenCommerceStudio.jsx','utf8');
 const pdv=readFileSync('src/components/PDV.jsx','utf8');
 expect(publicCss).toContain('.commerce-product-image img { display:block;');
 expect(publicCss).toContain('object-fit:contain; object-position:center;');
 expect(studio).toContain("objectFit:'contain',objectPosition:'center'");
 expect(pdv).toContain("tx('Resumo da venda'");
 expect(pdv).toContain("tx('Itens lançados'");
 expect(pdv).toContain("tx('Total a pagar'");
 expect(pdv).toContain('zen-pdv-online-head');
 expect(pdv).toContain("if(pedido?.origem==='commerce')");
});
