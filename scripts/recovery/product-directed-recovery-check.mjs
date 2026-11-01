// P0: nunca carregar 2.501 documentos no clique comum de recuperar um produto.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const path=new URL('../../src/components/Produtos.jsx',import.meta.url);
const src=readFileSync(path,'utf8');
assert.match(src,/onClick=\{buscarCadastroPeloSkuAntigo\} title=\{tx\("Localiza somente o SKU original informado/);
assert.match(src,/Recuperar produto por SKU/);
assert.equal((src.match(/tx\("Recuperar produto por SKU","Recuperar producto por SKU"\)/g)||[]).length,1,'Não repetir ação de busca');
assert.match(src,/resultado.status==='orphan_index' && resultado.ownerId/);
assert.match(src,/await examinarCadastroPeloId\(String\(resultado.ownerId\)\)/);
assert.match(src,/podeGerenciarProdutos && <button[^\n]+onClick=\{\(\)=>setConfirmarAuditoriaCompleta\(true\)\}/);
assert.match(src,/onConfirmar=\{auditarCadastrosOriginais\}/);
assert.match(src,/if\(!podeGerenciarProdutos\|\|auditandoIndices\)return;/);
const buttonBlock=src.slice(src.indexOf('  return (\n    <div'),src.lastIndexOf('</div>'));
assert.doesNotMatch(buttonBlock,/onClick=\{auditarCadastrosOriginais\}/);
console.log('PASS: recuperação normal usa busca dirigida; auditoria ampla isolada na confirmação gerencial.');
