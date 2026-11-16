import React from 'react';
import {test,expect,beforeEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import ZenOSUpdateWelcome,{ZENOS_UPDATE_ACK_KEY} from '../../src/components/ZenOSUpdateWelcome.jsx';
import {CLIENT_BUILD_ID} from '../../src/core/clientBuildRecovery.js';

beforeEach(()=>{
 cleanup();
 localStorage.removeItem(ZENOS_UPDATE_ACK_KEY);
});

test('shows premium update notice once and acknowledges before continuing',()=>{
 render(<React.StrictMode><ZenOSUpdateWelcome /></React.StrictMode>);
 expect(screen.getByText('ZenOS Atualizado com Sucesso!')).toBeTruthy();
 expect(screen.getByText('Parabéns! Você já está utilizando a versão mais recente e segura do sistema.')).toBeTruthy();
 expect(localStorage.getItem(ZENOS_UPDATE_ACK_KEY)).toBe(CLIENT_BUILD_ID);
 fireEvent.click(screen.getByRole('button',{name:'Entendido / Continuar'}));
 expect(screen.queryByText('ZenOS Atualizado com Sucesso!')).toBeNull();
 cleanup();
 render(<ZenOSUpdateWelcome />);
 expect(screen.queryByText('ZenOS Atualizado com Sucesso!')).toBeNull();
});

test('same version after reload never shows notification',()=>{
 localStorage.setItem(ZENOS_UPDATE_ACK_KEY,CLIENT_BUILD_ID);
 render(<ZenOSUpdateWelcome />);
 expect(screen.queryByText('ZenOS Atualizado com Sucesso!')).toBeNull();
});

test('older version triggers a new notice exactly once',()=>{
 localStorage.setItem(ZENOS_UPDATE_ACK_KEY,'previous-build');
 render(<ZenOSUpdateWelcome />);
 expect(screen.getByText('ZenOS Atualizado com Sucesso!')).toBeTruthy();
 expect(localStorage.getItem(ZENOS_UPDATE_ACK_KEY)).toBe(CLIENT_BUILD_ID);
});
