import {test,expect,vi} from 'vitest';
import {zenosStorage} from '../../src/core/storage.js';

test('app storage persists a browser draft through the real jsdom Storage',()=>{
 expect(globalThis.localStorage).toBe(globalThis.jsdom.window.localStorage);
 expect(globalThis.sessionStorage).toBe(window.sessionStorage);
 const key='__recovery_storage_probe__';
 expect(zenosStorage.setItem(key,'protected draft')).toBe(true);
 expect(zenosStorage.getItem(key)).toBe('protected draft');
 expect(window.localStorage.getItem(zenosStorage.keyForDebug(key))).toBe('protected draft');
 expect(zenosStorage.removeItem(key)).toBe(true);
 expect(zenosStorage.getItem(key)).toBeNull();
});

test('an actual storage failure still refuses to confirm draft persistence',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{setItem(){throw new DOMException('Full','QuotaExceededError');}}});
  expect(zenosStorage.setItem('__recovery_storage_probe__','must not be approved')).toBe(false);
 }finally{
  Object.defineProperty(globalThis,'localStorage',original);error.mockRestore();
 }
});
