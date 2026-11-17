import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const firebase=fs.readFileSync(new URL('../src/firebase.js',import.meta.url),'utf8');

assert.match(app,/ZENOS_BOOTSTRAP_TIMEOUT/);
assert.match(app,/window\.setTimeout\([\s\S]*?30000\)/);
assert.match(app,/setCarregandoAuth\(false\)/);
assert.match(app,/ZENOS_AUTH_OBSERVER_ERROR/);
assert.match(app,/zenos_safe_session=1/);
assert.match(app,/zenos_bootstrap_auto_recovery/);
assert.ok(app.includes('window.location.replace(recoveryUrl.toString())'));
assert.ok(app.includes('if (!ZENOS_SAFE_SESSION)'));
assert.ok(app.includes("recoveryUrl.searchParams.set('zenos_safe_session', '1')"));
assert.ok(app.includes("window.sessionStorage.setItem('zenos_safe_session', '1')"));

assert.match(app,/window\.sessionStorage\.setItem\('zenos_safe_session','1'\)/);
assert.match(app,/role="alert"/);
assert.match(firebase,/ZENOS_SAFE_SESSION\s*=\s*safeSessionRequested\s*&&\s*ZENOS_RUNTIME\.isProduction/);
assert.match(firebase,/initializeAuth\(app, \{ persistence: browserSessionPersistence \}\)/);
assert.match(firebase,/ZENOS_SAFE_SESSION\s*\?\s*memoryLocalCache\(\)/);
assert.match(firebase,/persistentLocalCache\(\{ tabManager: persistentMultipleTabManager\(\) \}\)/);
assert.doesNotMatch(app+firebase,/indexedDB\.deleteDatabase\(|localStorage\.clear\(|sessionStorage\.clear\(/);
console.log('VIPE: Auth watchdog, opt-in memory recovery and preserved browser storage — OK');
