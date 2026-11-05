// Node 26 exposes a native localStorage without getItem/setItem when no
// --localstorage-file is supplied. Vitest 2 can retain that global instead of
// the jsdom browser storage. Bind the actual jsdom implementation explicitly;
// do not mock success or disable the application's draft persistence guard.
const browser=globalThis.jsdom?.window;
if(!browser)throw new Error('Recovery tests require the jsdom browser environment');
for (const key of ['localStorage','sessionStorage']) {
  const storage=browser[key];
  if(typeof storage?.getItem!=='function'||typeof storage?.setItem!=='function')
    throw new Error(`Browser test environment has no working ${key}`);
  Object.defineProperty(globalThis,key,{value:storage,writable:true,configurable:true});
}
