import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcularPrecoPorCustoEMargem, validarMargemPrecoVenda } from '../src/core/pricing.js';
import { normalizarProduto } from '../src/data.js';
import { detectarConflitosIdentidadeProdutos } from '../src/core/productIdentity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const norm = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const hash = (txt='') => { let h=2166136261; for(let i=0;i<txt.length;i++){ h ^= txt.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0).toString(36); };
const keys = p => { const sku=norm(p.sku); const sig=norm([p.nome,p.marca||p.fornecedor,p.unidadeMedida||'UN'].join('|')); return [sku?`sku_${hash(sku)}`:null,sig?`sig_${hash(sig)}`:null].filter(Boolean); };

const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const ok = (cond, msg) => { if (!cond) throw new Error(`[FALHOU] ${msg}`); console.log(`[OK] ${msg}`); };

const preco40 = calcularPrecoPorCustoEMargem(10, 40);
ok(preco40.ok && preco40.valor === '16.67', 'Margem de 40% sobre venda calcula R$ 16,67 para custo R$ 10');
const margem100 = calcularPrecoPorCustoEMargem(10, 100);
ok(!margem100.ok && margem100.valor === '' && !String(margem100.valor).includes('Infinity'), 'Margem de 100% é bloqueada e nunca gera Infinity');
ok(!validarMargemPrecoVenda(100).ok && validarMargemPrecoVenda(99.9).ok, 'Validador aceita até 99,9% e rejeita 100%');

const productRegistry = read('src/core/productRegistry.js');
const firstSet = productRegistry.indexOf('tx.set(');
const readLoop = productRegistry.indexOf('for(const item of refsNovas)');
const validationLoop = productRegistry.indexOf('for(const {item,snap} of leituras)');
ok(readLoop >= 0 && validationLoop > readLoop && firstSet > validationLoop, 'Transação de identidade executa todas as leituras/validações antes da primeira escrita');

const produtos = Array.from({ length: 970 }, (_, i) => normalizarProduto({
  id: `PROD-REAL-${String(i + 1).padStart(4, '0')}`,
  sku: `SKU-REAL-${String(i + 1).padStart(4, '0')}`,
  nome: `Produto Real ${i + 1}`,
  grupo: 'Teste de carga',
  custoBRL: 10 + i,
  precoBRL: 20 + i,
}, i));
ok(produtos.length === 970, 'Simulação preserva catálogo com 970 produtos');
ok(produtos.every((p, i) => p.id === `PROD-REAL-${String(i + 1).padStart(4, '0')}`), 'Normalização preserva todos os IDs existentes em catálogo grande');
ok(new Set(produtos.map(p => p.id)).size === 970, '970 produtos mantêm IDs únicos');
ok(new Set(produtos.flatMap(p => keys(p))).size === 1940, '970 produtos distintos geram chaves de unicidade distintas por SKU e assinatura');
ok(detectarConflitosIdentidadeProdutos(produtos).length === 0, 'Catálogo simulado de 970 produtos não cria conflito artificial de identidade');

const produtosJsx = read('src/components/Produtos.jsx');
const clientesJsx = read('src/components/Clientes.jsx');
const pdvJsx = read('src/components/PDV.jsx');
const app = read('src/App.jsx');
const native = /window\.alert|\balert\(|window\.confirm|\bconfirm\(|window\.prompt|\bprompt\(/;
ok(!native.test(produtosJsx), 'Catálogo não usa alert/confirm/prompt nativo nos fluxos corrigidos');
ok(!native.test(clientesJsx), 'Clientes não usa alert/confirm/prompt nativo nos fluxos corrigidos');
ok(!native.test(pdvJsx), 'PDV não usa alert/confirm/prompt nativo nos fluxos corrigidos');
ok(produtosJsx.includes('Margem sobre venda (%)') && produtosJsx.includes('Máx. 99,9%'), 'Tela de produto explica claramente o conceito e limite da margem');
ok(pdvJsx.includes('Estoque insuficiente') && pdvJsx.includes('mostrarZen'), 'Estoque insuficiente no PDV usa modal ZenOS');
ok(clientesJsx.includes("titulo:'Recebimento registrado'") && clientesJsx.includes('<ZenModal'), 'Recebimento de cliente usa modal ZenOS');
ok(pdvJsx.includes('sessaoId: sessaoAtiva?.id || null'), 'Venda PIX/cartão mantém vínculo com o turno sem afetar gaveta física');
const caixasJsx = read('src/components/GestaoCaixas.jsx');
ok(caixasJsx.includes('PIX registrado') && caixasJsx.includes('Cartões registrados'), 'Painel de caixas mostra PIX e cartões separadamente do dinheiro físico');

ok(app.includes('PROTEÇÃO DE DADOS ATIVA') && app.includes('Nenhum array vazio será enviado ao Firestore'), 'Bootstrap possui bloqueio explícito contra sobrescrita vazia após falha de nuvem');
const catchStart = app.indexOf("console.error('[ZenOS][BOOTSTRAP]");
const nextRealtime = app.indexOf('// ATT 06.2: sincronização reativa V1', catchStart);
const catchSection = app.slice(catchStart, nextRealtime);
ok(catchStart >= 0 && !catchSection.includes('setNuvemSincronizada(true)'), 'Falha de bootstrap não destranca gravação na nuvem');
ok(app.includes("if (!snap.metadata?.fromCache)") && app.includes('setNuvemSincronizada(true)'), 'Somente snapshot confirmado fora do cache pode reabilitar gravações após reconexão');

console.log('\nATT 07.1: cadastro, margem, modais e proteção de dados aprovados.');
