import React from 'react';
import {mkdir,writeFile} from 'node:fs/promises';
import {describe,it,expect,vi,beforeAll,afterEach,afterAll} from 'vitest';
import {render,screen,within,cleanup,waitFor,configure} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const h=vi.hoisted(()=>({token:'',requests:[],user:{uid:'distribution-demo',getIdToken:async()=>h.token}}));
vi.mock('../../src/firebase.js',()=>({auth:{currentUser:h.user},ZENOS_RUNTIME:{isHomologacao:true}}));
vi.mock('firebase/auth',()=>({onAuthStateChanged:(_auth,cb)=>{queueMicrotask(()=>cb(h.user));return ()=>{};},signInWithEmailAndPassword:vi.fn()}));
import DistributionCentral from '../../src/components/DistributionCentral.jsx';
configure({asyncUtilTimeout:10000});
const nativeFetch=globalThis.fetch;
beforeAll(async()=>{
 const data=await nativeFetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'distribution-demo@example.test',password:'SyntheticOnly!482759',returnSecureToken:true})}).then(r=>r.json());h.token=data.idToken;
 globalThis.fetch=async(url,options)=>{h.requests.push({url:String(url),body:JSON.parse(options?.body||'{}')});try{const result=await nativeFetch(String(url).replace('/__distribution','http://127.0.0.1:8787'),{...options,signal:undefined});if(!result.ok)console.error('API rejected',await result.clone().text());if(String(url).endsWith('/query')){const value=await result.clone().json();if(value.document){await mkdir('tmp/distribution',{recursive:true});await writeFile('tmp/distribution/manifest-snapshot.json',JSON.stringify(value.document,null,2));}}return result;}catch(e){console.error('Transport rejected',e.name,e.message);throw e;}};
});
afterEach(cleanup);afterAll(()=>{globalThis.fetch=nativeFetch;});
const button=name=>screen.getByRole('button',{name,exact:true});
async function login(user){await user.type(screen.getByLabelText('PIN do operador'),'482759');await user.click(button('Acessar distribuição'));await screen.findByRole('button',{name:'Pedidos do PDV',exact:true});}
describe('Central with real HTTP API, Auth token and Firestore Emulator',()=>{
 it('completes load, reservation, manual checking, historic manifests and dispatch; changes language and logs out',async()=>{
  localStorage.clear();const user=userEvent.setup();render(<DistributionCentral/>);await login(user);
  expect(button('Hoje').getAttribute('aria-pressed')).toBe('true');
  await user.click(button('Pedidos do PDV'));
  await user.click(await screen.findByLabelText('Selecionar pedido O001'));
  await user.click(screen.getByLabelText('Selecionar pedido O002'));
  await user.click(screen.getByRole('button',{name:/Criar carga selecionada/}));
  await user.click(await screen.findByRole('button',{name:'Reservar estoque',exact:true}));
  await user.click(await screen.findByRole('button',{name:'Iniciar separação',exact:true}));
  await user.type(await screen.findByLabelText('Quantidades conferidas 1'),'5');await user.type(screen.getByLabelText('Quantidades conferidas 2'),'5');
  await user.click(button('Confirmar conferência'));await user.click(await screen.findByRole('button',{name:'Aprovar carga',exact:true}));
  await user.type(await screen.findByLabelText('Veículo / placa'),'HML-2026');await user.type(screen.getByLabelText('Motorista'),'Carlos · teste');await user.type(screen.getByLabelText('Rota'),'Centro / Vila Operária');
  for(const input of screen.getAllByLabelText(/^Quantidade colocada no caminhão /))await user.type(input,input.max);
  await user.click(button('Confirmar carregamento físico'));
  await waitFor(()=>expect(button('Emitir romaneio').disabled).toBe(false));
  await user.click(button('Emitir romaneio'));await user.click(await screen.findByRole('button',{name:/Versão 1 ·/}));
  const preview=await screen.findByTestId('manifest-preview');expect(preview.textContent).toContain('PYG 399.900');await writeFile('tmp/distribution/manifest-preview.html',preview.outerHTML);expect(button('Baixar PDF A4')).toBeTruthy();expect(button('Imprimir A4')).toBeTruthy();
  await user.clear(screen.getByLabelText('Rota'));await user.type(screen.getByLabelText('Rota'),'Rota revisada');await user.click(button('Emitir romaneio'));await screen.findByRole('button',{name:/Versão 2 ·/});
  await user.click(screen.getByRole('button',{name:/Versão 1 ·/}));await waitFor(()=>expect(screen.getByTestId('manifest-preview').textContent).toContain('Centro / Vila Operária'));expect(screen.getByTestId('manifest-preview').textContent).not.toContain('Rota revisada');
  await waitFor(()=>expect(button('Expedir carga').disabled).toBe(false));await user.click(button('Expedir carga'));await user.click(button('Confirmar'));
  await waitFor(()=>expect(within(screen.getByRole('dialog')).queryByRole('button',{name:'Expedir carga',exact:true})).toBeNull());
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Fechar',exact:true}));
  await user.selectOptions(screen.getByRole('combobox',{name:'Idioma'}),'es');expect(screen.getByRole('heading',{name:'Central de Distribución'})).toBeTruthy();
  await user.click(button('Este mes'));await waitFor(()=>expect(screen.queryByRole('status',{name:'Verificando en el servidor…'})).toBeNull());
  await user.click(button('Cerrar sesión'));await screen.findByRole('button',{name:'Acceder a distribución',exact:true});
  const commandTypes=h.requests.filter(r=>r.url.endsWith('/command')).map(r=>r.body.type);
  expect(commandTypes).toEqual(['CREATE','RESERVE','START_PICK','CHECK','APPROVE','CONFIRM_LOADING','MANIFEST','MANIFEST','DISPATCH']);
  expect(h.requests.some(r=>r.url.endsWith('/logout'))).toBe(true);
 });
 it('does not issue logistics queries before verified operator login and shows rejected PIN without success',async()=>{
  localStorage.clear();h.requests.length=0;const user=userEvent.setup();render(<DistributionCentral/>);
  expect(h.requests).toHaveLength(0);await user.type(screen.getByLabelText('PIN do operador'),'999999');await user.click(button('Acessar distribuição'));
  await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Pedidos do PDV',exact:true})).toBeNull();expect(h.requests.every(r=>r.url.endsWith('/session'))).toBe(true);
 });
});
