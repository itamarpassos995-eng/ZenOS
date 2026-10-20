import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../src/core/productRegistry.js',import.meta.url),'utf8');

test('liberação de índices preserva propriedade e histórico',()=>{
  const release=source.slice(source.indexOf('export async function liberarIdentidadeProduto'));
  assert.match(release,/runTransaction\(db,async tx/);
  assert.match(release,/await tx\.get\(ref\)/);
  assert.match(release,/owner!==String\(produto\.id\)/);
  assert.doesNotMatch(release,/deleteDoc\(/);
});
test('edição verifica propriedade de índices antigos antes de desativar',()=>{
  const reserve=source.slice(source.indexOf('export async function reservarIdentidadeProduto'),source.indexOf('export async function liberarIdentidadeProduto'));
  assert.match(reserve,/leiturasAntigas/);
  assert.match(reserve,/snap\.data\(\)\?\.produtoId/);
  assert.match(reserve,/produtoAnterior\?\.id\|\|produto\.id/);
  assert.match(reserve,/if\(!snap\.exists\(\).*continue/);
});
