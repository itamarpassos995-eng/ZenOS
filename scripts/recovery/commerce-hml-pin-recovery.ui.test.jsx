import React from 'react';
import {test,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,waitFor,fireEvent,cleanup} from '@testing-library/react';

const mocks=vi.hoisted(()=>({
 user:{uid:'owner-hml',getIdToken:vi.fn(async()=>'' )},
 reauth:vi.fn(async()=>({})),signIn:vi.fn(),signOut:vi.fn(),
 backend:vi.fn(async ({action})=>({data:action==='consultar'?{preparada:true}:action==='redefinirPins'?{redefinidos:true,operadores:2}:{}})),
}));
vi.mock('../../src/firebase',()=>({auth:{app:{}}}));
vi.mock('firebase/auth',()=>({
 GoogleAuthProvider:class {setCustomParameters(){}},
 onAuthStateChanged:(_auth,callback)=>{callback(mocks.user);return ()=>{};},
 reauthenticateWithPopup:mocks.reauth,signInWithPopup:mocks.signIn,signOut:mocks.signOut,
}));
vi.mock('firebase/functions',()=>({getFunctions:()=>({}),httpsCallable:()=>mocks.backend}));
import Gate from '../../src/components/ZenCommerceOperationalHmlGate.jsx';
beforeEach(()=>{mocks.backend.mockImplementation(async ({action})=>({data:action==='consultar'?{preparada:true}:action==='redefinirPins'?{redefinidos:true,operadores:2}:{}}));});
afterEach(()=>{cleanup();vi.clearAllMocks();});
test('redefinição exige Google recente e salva os dois PINs sem sair da loja',async()=>{
 render(<Gate><p>Tela PDV de teste</p></Gate>);
 expect(await screen.findByText('Tela PDV de teste')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Esqueci os PINs de teste'}));
 expect(screen.getByRole('dialog',{name:'Recuperar PINs da homologação'})).toBeTruthy();
 const form=screen.getByRole('dialog');
 fireEvent.change(screen.getByLabelText('Novo PIN do operador A'),{target:{value:'73518249'}});
 fireEvent.change(screen.getByLabelText('Novo PIN do operador B'),{target:{value:'92473518'}});
 fireEvent.click(screen.getByRole('button',{name:'Reautenticar Google e salvar novos PINs'}));
 await screen.findByText(/Os dois PINs foram atualizados/);
 expect(mocks.reauth).toHaveBeenCalledTimes(1);
 expect(mocks.user.getIdToken).toHaveBeenCalledWith(true);
 expect(mocks.backend).toHaveBeenCalledWith({action:'redefinirPins',pinAdmin:'73518249',pinSegundo:'92473518'});
 expect(screen.getByRole('button',{name:'Recarregar ZenOS e entrar'})).toBeTruthy();
 expect(mocks.signOut).not.toHaveBeenCalled();
});
test('se Google negar reautenticação não envia nenhum PIN ao backend',async()=>{
 mocks.reauth.mockRejectedValueOnce(Error('Reautenticação cancelada'));
 render(<Gate><p>Tela PDV de teste</p></Gate>);
 await screen.findByText('Tela PDV de teste');
 fireEvent.click(screen.getByRole('button',{name:'Esqueci os PINs de teste'}));
 fireEvent.change(screen.getByLabelText('Novo PIN do operador A'),{target:{value:'73518249'}});
 fireEvent.change(screen.getByLabelText('Novo PIN do operador B'),{target:{value:'92473518'}});
 fireEvent.click(screen.getByRole('button',{name:'Reautenticar Google e salvar novos PINs'}));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Reautenticação cancelada');
 expect(mocks.backend).not.toHaveBeenCalledWith(expect.objectContaining({action:'redefinirPins'}));
});
