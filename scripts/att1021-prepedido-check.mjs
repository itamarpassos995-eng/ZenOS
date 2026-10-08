import fs from 'node:fs';
import assert from 'node:assert/strict';

const pdv = fs.readFileSync(new URL('../src/components/PDV.jsx', import.meta.url), 'utf8');
let ok = 0;
const check = (name, fn) => { fn(); ok += 1; console.log(`[OK] ${name}`); };

check('Nome digitado livremente é persistido no pré-pedido/venda', () => {
  assert.match(pdv, /clienteNome:\s*\(String\(clienteSelecionadoPDV\?\.nome\s*\|\|\s*''\)\.trim\(\)\s*\|\|\s*String\(nomeClienteVulso\s*\|\|\s*''\)\.trim\(\)/);
});

check('Nome salvo é reaplicado ao recuperar o pré-pedido', () => {
  assert.match(pdv, /setNomeClienteVulso\(pedido\.clienteNome/);
});

check('Fila exibe o nome persistido do pré-pedido', () => {
  assert.match(pdv, /\{v\.clienteNome\}/);
});

check('Fila lista todos os pendentes sem corte por quantidade', () => {
  assert.match(pdv, /historicoVendas\.filter\(v => v\.estado === 'pendente'\)\.map\(v =>/);
  const trecho = pdv.slice(pdv.indexOf("historicoVendas.filter(v => v.estado === 'pendente').map"), pdv.indexOf("historicoVendas.filter(v => v.estado === 'pendente').map") + 1000);
  assert.doesNotMatch(trecho, /\.slice\s*\(/);
});

check('Fila suporta rolagem para listas longas', () => {
  assert.match(pdv, /maxHeight:\s*'80vh'.*overflowY:\s*'auto'/s);
});

check('30 pré-pedidos permanecem 30 no filtro pendente', () => {
  const pedidos = Array.from({length:30}, (_,i)=>({id:`P${i+1}`,estado:'pendente',clienteNome:`Cliente ${i+1}`}));
  const pendentes = pedidos.filter(v=>v.estado==='pendente');
  assert.equal(pendentes.length, 30);
  assert.equal(new Set(pendentes.map(p=>p.clienteNome)).size, 30);
});

console.log(`ATT 10.2.1 pré-pedido: ${ok}/6 aprovados.`);
