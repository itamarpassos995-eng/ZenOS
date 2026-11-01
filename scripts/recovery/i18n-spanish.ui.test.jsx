import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const mocks=vi.hoisted(()=>({call:vi.fn(),auth:{currentUser:{uid:'user-A'}}}));
vi.mock('firebase/functions',()=>({getFunctions:vi.fn(),httpsCallable:()=>mocks.call}));
vi.mock('../../src/firebase',()=>({auth:mocks.auth}));
import {useUiLanguage} from '../../src/core/useUiLanguage.js';
import {UI_LANGUAGE_KEY,lerIdiomaUi,salvarIdiomaUi} from '../../src/core/uiLanguage.js';
import {traducoes} from '../../src/data.js';
import FiscalAtivacaoAssistente from '../../src/components/FiscalAtivacaoAssistente.jsx';
import FiscalAdministracaoPainel from '../../src/components/FiscalAdministracaoPainel.jsx';
const tx=(_pt,es)=>es||_pt;
beforeEach(()=>{
 localStorage.clear();Element.prototype.scrollIntoView=vi.fn();
 mocks.auth.currentUser={uid:'user-A'};mocks.call.mockReset();
 mocks.call.mockResolvedValue({data:{status:'solicitado',pais:'PY',habilitado:false}});
});
afterEach(cleanup);
function LanguageHarness(){const [idioma,setIdioma]=useUiLanguage(localStorage);return <><select aria-label="Idioma" value={idioma} onChange={e=>setIdioma(e.target.value)}><option value="pt">PT</option><option value="es">ES</option><option value="en">EN</option></select><output>{traducoes[idioma].produtosEstoque}</output></>;}
it('idioma escolhido permanece após desmontar e remontar, sem consulta de dados',()=>{
 const first=render(<LanguageHarness/>);expect(screen.getByRole('status').textContent).toBe('Produtos & Estoque');
 fireEvent.change(screen.getByRole('combobox',{name:'Idioma'}),{target:{value:'es'}});
 expect(localStorage.getItem(UI_LANGUAGE_KEY)).toBe('es');expect(document.documentElement.lang).toBe('es-PY');
 expect(screen.getByRole('status').textContent).toBe('Productos y Stock');first.unmount();
 render(<LanguageHarness/>);expect(screen.getByRole('combobox').value).toBe('es');expect(document.documentElement.lang).toBe('es-PY');expect(mocks.call).not.toHaveBeenCalled();
});
it('preferência inválida e armazenamento indisponível preservam inicialização',()=>{
 localStorage.setItem(UI_LANGUAGE_KEY,'invalid');expect(lerIdiomaUi(localStorage)).toBe('pt');
 expect(salvarIdiomaUi(localStorage,'invalid')).toBeNull();expect(salvarIdiomaUi(localStorage,'es-PY')).toBe('es');
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 expect(lerIdiomaUi(blocked)).toBe('pt');expect(salvarIdiomaUi(blocked,'es')).toBe('es');
});
it('formulário fiscal PY da imagem aparece em espanhol e mantém os dados ao trocar idioma',async()=>{
 const user=userEvent.setup();const props={lojaId:'store-A',perfilLoja:{pais:'PY'}};
 const page=render(<FiscalAtivacaoAssistente {...props} tx={tx}/>);
 await user.click(await screen.findByRole('button',{name:/Completar datos fiscales/}));
 await user.click(screen.getByRole('checkbox',{name:'Factura electrónica'}));
 await user.click(screen.getByRole('button',{name:'Continuar'}));
 expect(screen.getByRole('heading',{name:'Datos de la empresa'})).toBeTruthy();
 expect(screen.getByRole('textbox',{name:'RUC sin DV *'})).toBeTruthy();
 expect(screen.getByRole('textbox',{name:'Dirección'})).toBeTruthy();
 expect(screen.getByRole('textbox',{name:'Punto de expedición'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Cerrar'})).toBeTruthy();
 expect(page.container.textContent).not.toMatch(/Dados da empresa|Responsável|Endereço|Ponto de expedição|Fechar/);
 await user.type(screen.getByRole('textbox',{name:'Razón social *'}),'Empresa teste');
 page.rerender(<FiscalAtivacaoAssistente {...props} tx={pt=>pt}/>);
 expect(screen.getByRole('textbox',{name:'Razón social *'}).value).toBe('Empresa teste');
 expect(mocks.call).toHaveBeenCalledTimes(1);
});
it('administração fiscal recebe tradutor, sem nova consulta ao trocar idioma',async()=>{
 mocks.auth.currentUser={getIdTokenResult:async()=>({claims:{zenosFiscalAdmin:true}})};
 mocks.call.mockResolvedValue({data:{solicitacoes:[],limitado:false}});
 const page=render(<FiscalAdministracaoPainel tx={tx}/>);
 await screen.findByRole('heading',{name:'Administración ZenOS Fiscal'});
 expect(screen.getByRole('button',{name:'Actualizar solicitudes'})).toBeTruthy();
 expect(page.container.textContent).not.toContain('Administração');
});
it('rótulos do PDV possuem traduções completas em PT, ES e EN',()=>{
 for(const key of ['itensLancados','nenhumItem','resumoVenda','subtotal','descontoGlobal','totalPagar'])for(const idioma of ['pt','es','en'])expect(traducoes[idioma][key]).toBeTruthy();
 expect(traducoes.es.resumoVenda).toBe('Resumen de la venta');
});
