import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
const roots = ['src', 'api', 'functions/src'];
const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(join(path, entry.name)) : /\.(js|jsx)$/.test(entry.name) ? [join(path, entry.name)] : []);
const classifications = [
  [/Produtos|product|pricing|data\.js/, 'Catálogo e preços'],
  [/PDVCompras|purchase|inventory|stock/, 'Compras, estoque e custos'],
  [/Commerce|commerce|Loja/, 'Commerce'],
  [/Fiscal|fiscal/, 'Fiscal'],
  [/zenReceipt|receipt|zenShare/, 'Recibos, PDFs e compartilhamento'],
  [/Clientes|credit/, 'Clientes e fiado'],
  [/Despesas|expense|recurr/i, 'Despesas e recorrências'],
  [/commission|Comiss|Vendedores|Metas/i, 'Comissões, metas e bônus'],
  [/cash|Caixa/, 'Caixa e conciliação'],
  [/Relatorio|Dashboard|financialAudit|profitability|salesFinancials/i, 'Relatórios e resultado'],
  [/PDV|pdv|Vendas/, 'Vendas e PDV'],
  [/financialLedger|productionSync|operationalV2|syncMerge|persistence/i, 'Persistência e livro'],
  [/Migracao|Configuracoes|ZenAssistente|App\.jsx|Layout/, 'Orquestração, importação e IA'],
];
const files = roots.flatMap(walk).sort();
const result = [];
for (const path of files) {
  if (/\/money[^/]*\.js$/.test(path)) continue;
  const text = readFileSync(path, 'utf8');
  const matches = text.split(/\r?\n/).flatMap((line, index) => {
    const signals = [];
    if (/\b\w*BRL\b/.test(line)) signals.push('contrato BRL');
    if (/converterParaBRL|converterDeBRL|formatarEquivalenciaBRL/.test(line)) signals.push('conversão');
    if (/taxasCambio|taxaCambio|moedaOrigem|moedaComercial|moedaFiscal/.test(line)) signals.push('moeda/cotação');
    if (/parseFloat/.test(line) && /preco|custo|valor|total|desconto|saldo|pagamento/i.test(line)) signals.push('parser numérico');
    if (/R\$|currency:\s*['"]BRL/.test(line)) signals.push('apresentação BRL fixa');
    return signals.length ? [{ line: index + 1, signals }] : [];
  });
  if (!matches.length) continue;
  result.push({ path: relative(process.cwd(), path), area: classifications.find(([r]) => r.test(path))?.[1] || 'Outros consumidores',
    status: 'pending-integration', occurrences: matches.length, matches });
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
mkdirSync('docs/multimoeda', { recursive: true });
writeFileSync('docs/multimoeda/INVENTARIO.json', JSON.stringify({ baseCommit: commit,
  method: 'Triagem estática reproduzível; não comprova cobertura completa. Revisão semântica pendente.', files: result }, null, 2) + '\n');
const md = ['# Inventário monetário — triagem de consumidores', '',
  `Base inspecionada: \`${commit}\`.`, '',
  'Busca estática: ponto de partida para revisão semântica, sem garantia de encontrar todos os valores monetários. Nenhum item abaixo está homologado pelo simples fato de aparecer nesta lista.', '',
  '| Arquivo | Área | Linhas sinalizadas | Estado |', '|---|---|---:|---|',
  ...result.map(f => `| [${f.path}](../../${f.path}) | ${f.area} | ${f.occurrences} | Integração pendente |`), '',
  'Detalhes por linha e sinais encontrados: `INVENTARIO.json`.', '',
  'Antes de concluir: revisar também aliases sem sufixo BRL, fórmulas dinâmicas, configurações, funções de backend, importações, tarefas e valores derivados que a busca não identifica.', ''];
writeFileSync('docs/multimoeda/INVENTARIO.md', md.join('\n'));
console.log(`Inventário: ${result.length} arquivos, ${result.reduce((n, f) => n + f.occurrences, 0)} linhas sinalizadas.`);
