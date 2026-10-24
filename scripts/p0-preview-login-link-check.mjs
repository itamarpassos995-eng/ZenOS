import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const home=readFileSync(new URL('../public/home-premium-conceito-c.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
assert.equal((home.match(/href="\/\?login=1"/g)||[]).length,3);
assert.equal((home.match(/href="https:\/\/zenos\.app\.br\/\?login=1"/g)||[]).length,0);
assert.match(app,/new URLSearchParams\(window\.location\.search\)\.get\('login'\) === '1'/);
console.log('Página comercial: desktop, hero e mobile acessam login no próprio domínio.');
