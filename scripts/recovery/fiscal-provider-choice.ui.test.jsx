import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const mocks=vi.hoisted(()=>({call:vi.fn(),auth:{currentUser:{uid:'user-A'}}}));
vi.mock('firebase/functions',()=>({getFunctions:vi.fn(),httpsCallable:()=>mocks.call}));
vi.mock('../../src/firebase',()=>({auth:mocks.auth}));
vi.mock('../../src/components/FiscalCredenciaisForm',()=>({default:()=>null}));
import FiscalAtivacaoAssistente from '../../src/components/FiscalAtivacaoAssistente.jsx';
import {cacheConfiguracaoFiscal} from '../../src/core/fiscalConfigCache.js';
import {validarConfiguracaoFiscal,avaliarConfiguracaoFiscal} from '../../functions/src/fiscalAtivacaoCore.js';
beforeEach(()=>{
 cacheConfiguracaoFiscal.limpar();mocks.call.mockReset();
 Element.prototype.scrollIntoView=vi.fn();
 mocks.call.mockImplementation(async payload=>{
  if(payload.action==='consultar')return {data:{versaoConfiguracao:2,status:'solicitado',pais:'PY',habilitado:false}};
  const value=validarConfiguracaoFiscal(payload);
  return {data:{...value,versaoConfiguracao:2,status:'configuracao_pendente',habilitado:false,ativacao:avaliarConfiguracaoFiscal(value)}};
 });
});
afterEach(cleanup);
describe('Escolha fiscal por país e provedor',()=>{
 it('consulta uma vez em StrictMode e não consulta ao trocar país/provedor/documentos',async()=>{
  const user=userEvent.setup();render(<React.StrictMode><FiscalAtivacaoAssistente lojaId="store-A" perfilLoja={{pais:'PY'}}/></React.StrictMode>);
  await user.click(await screen.findByRole('button',{name:/Completar dados fiscais/}));
  await user.click(screen.getByRole('radio',{name:'Usar minha conta em um provedor'}));
  await user.selectOptions(screen.getByRole('combobox',{name:'Provedor fiscal'}),'kuota');
  await user.click(screen.getByRole('checkbox',{name:/Nota de remisión/}));
  await user.selectOptions(screen.getByRole('combobox',{name:'País da empresa'}),'BR');
  expect(screen.queryByRole('checkbox',{name:/Nota de remisión/})).toBeNull();
  expect(screen.getByRole('radio',{name:'Integração padrão ZenOS'}).checked).toBe(true);
  expect(mocks.call).toHaveBeenCalledTimes(1);
 });
 it('salva escolha e quatro documentos em um único comando sem emissão externa',async()=>{
  const user=userEvent.setup();render(<FiscalAtivacaoAssistente lojaId="store-A" perfilLoja={{pais:'PY'}}/>);
  await user.click(await screen.findByRole('button',{name:/Completar dados fiscais/}));
  await user.click(screen.getByRole('radio',{name:'Usar minha conta em um provedor'}));
  await user.selectOptions(screen.getByRole('combobox',{name:'Provedor fiscal'}),'kuota');
  for(const checkbox of screen.getAllByRole('checkbox'))await user.click(checkbox);
  await user.click(screen.getByRole('button',{name:'Continuar'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Razón social *'}),{target:{value:'Teste fiscal'}});
  fireEvent.change(screen.getByRole('textbox',{name:'RUC sem DV *'}),{target:{value:'80012345'}});
  fireEvent.change(screen.getByRole('textbox',{name:'E-mail'}),{target:{value:'test@example.invalid'}});
  await user.click(screen.getByRole('button',{name:'Continuar'}));
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button',{name:'Salvar configuração'}));
  await waitFor(()=>expect(mocks.call).toHaveBeenCalledTimes(2));
  expect(mocks.call.mock.calls[1][0]).toMatchObject({action:'configurar',lojaId:'store-A',pais:'PY',integracao:{versao:1,modalidade:'propria',provedor:'kuota'}});
  expect(mocks.call.mock.calls[1][0].tiposDocumento).toHaveLength(4);
  await screen.findByText('Configuração salva — consulte as pendências');
 });
 it('não envia nova escolha para backend antigo que não confirma suporte',async()=>{
  mocks.call.mockResolvedValue({data:{status:'solicitado',pais:'PY',habilitado:false}});
  const user=userEvent.setup();render(<FiscalAtivacaoAssistente lojaId="store-A" perfilLoja={{pais:'PY'}}/>);
  await user.click(await screen.findByRole('button',{name:/Completar dados fiscais/}));
  await user.click(screen.getByRole('checkbox',{name:'Factura electrónica'}));
  await user.click(screen.getByRole('button',{name:'Continuar'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Razón social *'}),{target:{value:'Teste'}});
  fireEvent.change(screen.getByRole('textbox',{name:'RUC sem DV *'}),{target:{value:'80012345'}});
  fireEvent.change(screen.getByRole('textbox',{name:'E-mail'}),{target:{value:'test@example.invalid'}});
  await user.click(screen.getByRole('button',{name:'Continuar'}));await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button',{name:'Salvar configuração'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Nenhuma configuração foi enviada');
  expect(mocks.call).toHaveBeenCalledTimes(1);
 });
});
