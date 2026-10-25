import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filtrarVendasHojeVisiveis} from '../src/core/salesTodayScope.js';

const dia = new Date(2026,9,24,12,0,0);
const hoje = new Date(2026,9,24,10,0,0).toISOString();
const ontem = new Date(2026,9,23,10,0,0).toISOString();
const vendas = [
 {id:'V1',vendedorId:'op-1',estado:'concluida',createdAt:hoje,valor:100},
 {id:'V2',vendedorId:'op-2',estado:'concluida',createdAt:hoje,valor:200},
 {id:'V3',vendedorId:'op-1',estado:'parcial',createdAt:hoje,valor:60},
 {id:'V4',vendedorId:'op-1',estado:'pendente',createdAt:hoje,valor:999},
 {id:'V5',vendedorId:'op-1',estado:'cancelada',createdAt:hoje,valor:999},
 {id:'V6',vendedorId:'op-1',estado:'concluida',createdAt:ontem,valor:999},
];
const buscar=(id,patente='vendedor')=>filtrarVendasHojeVisiveis({
 historicoVendas:vendas,operadorAtivo:id?{id}:null,patenteUsuario:patente,referencia:dia,
});
assert.deepEqual(buscar('op-1').map(v=>v.id),['V1','V3']);
assert.deepEqual(buscar('op-2').map(v=>v.id),['V2']);
assert.deepEqual(buscar('admin','gerencia').map(v=>v.id),['V1','V2','V3']);
assert.deepEqual(buscar(null),[]);
assert.equal(buscar('op-1').reduce((sum,v)=>sum+v.valor,0),160);
assert.equal(buscar('op-1').length,2);
assert.equal(buscar('op-2').length,1);
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/App.jsx');
assert.match(app,/const vendasHoje = (?:filtrarVendasHojeVisiveis\(|useMemo\(\(\) => filtrarVendasHojeVisiveis\()/);
assert.match(app,/fmt\(faturamentoHojeBRL\)/);
assert.match(app,/\$\{vendasHoje.length\} \$\{tx\('vendas realizadas'/);
assert.match(app,/zen-status-badge[\s\S]{0,140}tx\('ABERTO','ABIERTO','OPEN'\)/);
assert.doesNotMatch(app,/fmt\(saldoSessaoFisicoBRL\)/);
for(const path of ['src/components/Despesas.jsx','src/components/PDVCompras.jsx']){
 assert.doesNotMatch(read(path),/fmt\(saldoSessaoFisicoBRL/);
}
assert.match(app,/const saldoSessaoFisicoBRL = resumoSessaoAtiva\?\.saldoEsperado \|\| 0;/);
assert.match(app,/const conciliacaoFisica = calcularConciliacaoFisicaMultimoeda\(/);
console.log('P0: KPI por vendedor e caixa cego sem saldo visivel validados.');
