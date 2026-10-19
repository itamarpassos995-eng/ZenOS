import React from 'react';
import {test,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
vi.mock('../../src/core/commercePublicApi',()=>({chamarLojaCommerce:vi.fn()}));
vi.mock('../../src/core/commerceFirebaseConfig',()=>({commerceProjetoHomologacao:true}));
import {chamarLojaCommerce} from '../../src/core/commercePublicApi';
import Store from '../../src/components/ZenCommerceStorefront';
const id='zc-abcdefghjkmnpq',legacyKey='zenos:commerce:carrinho:'+id;
const loja={revision:1,whatsapp:'5511000000000',aparencia:{nomeLoja:'Teste',banners:[]},catalogo:[{skuPublico:'SKU1',nome:'Produto teste',categoria:'Teste',precoCentavos:1000,quantidadeMaxima:5,disponivel:true,imagens:[]}]};
const pedido={id:'a'.repeat(32),totalCentavos:1000,whatsappUrl:'https://wa.me/5511000000000'};
beforeEach(()=>{sessionStorage.clear();vi.clearAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
afterEach(cleanup);
function preparar(){
 fireEvent.click(screen.getByRole('button',{name:'Adicionar',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:/Abrir carrinho/}));
 fireEvent.change(screen.getByLabelText('Seu nome'),{target:{value:'Cliente fictício'}});
 fireEvent.change(screen.getByLabelText('WhatsApp com código do país'),{target:{value:'5511000000000'}});
 fireEvent.click(screen.getByRole('checkbox',{name:/Autorizo esta loja/}));
}
test('confirmação limpa quantidades imediatamente, e nova página começa totalmente vazia',async()=>{
 chamarLojaCommerce.mockImplementation(async d=>{if(d.action==='criarPedido')return pedido;throw Error('inesperado');});
 render(<Store idPublico={id} lojaInicial={loja}/>);
 preparar();
 fireEvent.click(screen.getByRole('button',{name:/Confirmar pedido e continuar/}));
 await screen.findByText('Seu pedido foi recebido');
 expect(screen.getByRole('button',{name:/Abrir carrinho com 0 itens/})).toBeTruthy();
 expect(sessionStorage.getItem(legacyKey)).toBeNull();
 cleanup();
 render(<Store idPublico={id} lojaInicial={loja}/>);
 fireEvent.click(screen.getByRole('button',{name:/Abrir carrinho com 0 itens/}));
 expect(screen.queryByText('Seu pedido foi recebido')).toBeNull();
 expect(screen.getByText('Espaço para suas próximas escolhas')).toBeTruthy();
 expect(chamarLojaCommerce.mock.calls.filter(([d])=>d.action==='criarPedido')).toHaveLength(1);
});
test('falha de rede mantém carrinho só nesta página, recupera confirmação sem novo envio',async()=>{
 chamarLojaCommerce.mockImplementation(async d=>{if(d.action==='criarPedido')throw Error('rede');if(d.action==='consultarPedido')return {encontrado:true,pedido};throw Error('inesperado');});
 render(<Store idPublico={id} lojaInicial={loja}/>);
 preparar();
 fireEvent.click(screen.getByRole('button',{name:/Confirmar pedido e continuar/}));
 await screen.findByRole('button',{name:'Verificar se meu pedido foi recebido'});
 expect(screen.queryByLabelText('Seu nome')).toBeNull();
 expect(screen.getByRole('button',{name:'Encerrar tentativa e limpar carrinho'})).toBeTruthy();
 expect(sessionStorage.getItem(legacyKey)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Verificar se meu pedido foi recebido'}));
 await screen.findByText('Seu pedido foi recebido');
 expect(screen.getByRole('button',{name:/Abrir carrinho com 0 itens/})).toBeTruthy();
 expect(chamarLojaCommerce.mock.calls.filter(([d])=>d.action==='criarPedido')).toHaveLength(1);
});
test('carrinho legado é removido sem carregar itens de outros visitantes',async()=>{
 sessionStorage.setItem(legacyKey,JSON.stringify({chave:'chave-envio-12345678',carrinho:{SKU1:4},pendente:true,recibo:pedido}));
 render(<Store idPublico={id} lojaInicial={loja}/>);
 await waitFor(()=>expect(sessionStorage.getItem(legacyKey)).toBeNull());
 expect(screen.getByRole('button',{name:/Abrir carrinho com 0 itens/})).toBeTruthy();
 expect(chamarLojaCommerce).not.toHaveBeenCalled();
});
test('cadastro e promoções são opções separadas e nenhum checkbox começa selecionado',async()=>{
 chamarLojaCommerce.mockImplementation(async d=>d.action==='criarPedido'?pedido:{encontrado:false});
 render(<Store idPublico={id} lojaInicial={loja}/>);
 preparar();
 const cadastro=screen.getByRole('checkbox',{name:/Quero criar meu cadastro/});
 expect(cadastro.checked).toBe(false);
 fireEvent.click(cadastro);
 const promos=screen.getByRole('checkbox',{name:/Gostaria de receber novidades e promoções/});
 expect(promos.checked).toBe(false);
 fireEvent.click(promos);
 fireEvent.click(screen.getByRole('button',{name:/Confirmar pedido e continuar/}));
 await screen.findByText('Seu pedido foi recebido');
 const call=chamarLojaCommerce.mock.calls.find(([x])=>x.action==='criarPedido')[0];
 expect(call.pedido.criarCadastro).toBe(true);expect(call.pedido.aceitePromocoes).toBe(true);
});

test('API antiga retorna 400 na consulta; exibe atendimento e saida confirmada, sem segunda requisicao',async()=>{
 chamarLojaCommerce.mockImplementation(async d=>{
  if(d.action==='criarPedido')throw Error('rede');
  if(d.action==='consultarPedido')throw Error('Ação inválida. [400]');
  throw Error('inesperado');
 });
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<Store idPublico={id} lojaInicial={loja}/>);
 preparar();
 fireEvent.click(screen.getByRole('button',{name:/Confirmar pedido e continuar/}));
 await screen.findByRole('button',{name:'Verificar se meu pedido foi recebido'});
 fireEvent.click(screen.getByRole('button',{name:'Verificar se meu pedido foi recebido'}));
 await screen.findByText(/O serviço de consulta está indisponível/);
 expect(screen.getByRole('link',{name:'Falar com a loja para conferir'}).getAttribute('href')).toBe('https://wa.me/5511000000000');
 expect(screen.queryByLabelText('Seu nome')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Encerrar tentativa e limpar carrinho'}));
 expect(screen.getByRole('heading',{name:'Precisamos confirmar seu pedido'})).toBeTruthy();
 confirm.mockReturnValue(true);
 fireEvent.click(screen.getByRole('button',{name:'Encerrar tentativa e limpar carrinho'}));
 expect(screen.getByRole('button',{name:/Abrir carrinho com 0 itens/})).toBeTruthy();
 expect(sessionStorage.getItem(legacyKey)).toBeNull();
 expect(chamarLojaCommerce.mock.calls.filter(([d])=>d.action==='criarPedido')).toHaveLength(1);
 confirm.mockRestore();
});
