import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const uiFiles = [
  'src/App.jsx',
  'src/components/ZenVisualLayout.jsx',
  'src/components/PDV.jsx',
  'src/components/PDVCompras.jsx',
  'src/components/Produtos.jsx',
  'src/components/Clientes.jsx',
  'src/components/Vendas.jsx',
  'src/components/Fornecedores.jsx',
  'src/components/EstoqueInteligente.jsx',
  'src/components/Comissoes.jsx',
  'src/components/DashboardMobile.jsx',
  'src/components/Despesas.jsx',
  'src/components/GestaoCaixas.jsx',
  'src/components/Configuracoes.jsx',
  'src/components/Mesas.jsx',
  'src/components/Migracao.jsx',
  'src/components/Fiscal.jsx',
  'src/components/FiscalErrorBoundary.jsx',
  'src/components/TerminalLogin.jsx',
];

const allowedDirectText = new Set([
  'Zen','OS','ZenOS','ZenOS Cloud SaaS Enterprise','ZENOS (CLOUD)','ZENOS FISCAL','ZÊNITE','Zênite','CEO','LIVE','OK','×',
  'SKU','BRL','USD','EUR','PYG','CF','CMV','UN','KG','M²','CX','KIT','NCM','CEST','A4',
  'CPF','CNPJ','CI / RUC','WhatsApp',
  'Português (PT)','Español (ES)','English (EN)',
  'BRL (R$)','USD ($)','EUR (€)','PYG (₲)',
]);

const allowedDirectAttrs = [
  /^••••$/,
  /^0%$/,
  /^000\.000\.000-00$/,
  /^\(00\) 00000-0000$/,
  /^1000\.00$/,
];

const failures = [];
const uiCall = /\b(?:avisarZen|mostrarZen|setModalZen|setErro|setErroMesas|setErroSalvarRegras|setErroPrevia|avisarAppZen|confirmarAppZen)\s*\(/;
const humanLanguage = /[ãõáéíóúçÁÉÍÓÚÇ]|\b(?:não|Não|caixa|Caixa|venda|Venda|cliente|Cliente|produto|Produto|estoque|Estoque|operador|Operador|senha|Senha|dados|Dados|pagamento|Pagamento|fornecedor|Fornecedor|salvar|Salvar|excluir|Excluir|confirmar|Confirmar|erro|Erro|falha|Falha|turno|Turno|movimentação|Movimentação|recebimento|Recebimento|devolução|Devolução|comissão|Comissão|despesa|Despesas)\b/;

for (const file of uiFiles) {
  const full = path.join(root, file);
  const source = fs.readFileSync(full, 'utf8');

  if (!source.includes('tx(') && !source.includes('t(')) {
    failures.push(`${file}: sem uso do mecanismo de idioma`);
  }

  // Visible JSX text must be wrapped by t()/tx(), except invariant technical labels/brands.
  const nodeRegex = />([^<>{}\n][^<>{}\n]{0,140})</g;
  for (const match of source.matchAll(nodeRegex)) {
    const value = match[1].trim();
    if (!/[A-Za-zÀ-ÿ]/.test(value)) continue;
    if (value.includes('tx(') || value.includes('t(')) continue;
    if (allowedDirectText.has(value)) continue;
    if (/^(?:R\$|₲|\$|€|%|\+|-|\/)/.test(value)) continue;
    if (/^(?:[A-Z0-9_./-]{1,12})$/.test(value)) continue;
    if (value.includes('=>') || value.includes('return') || value.includes('p.estoque') || value.includes('String(') || value.includes('.join(') || value.includes('`')) continue;
    failures.push(`${file}: texto JSX direto -> "${value}"`);
  }

  // Human-readable placeholder/title/aria-label must also participate in i18n.
  const attrRegex = /\b(?:placeholder|title|aria-label)=["']([^"']*[A-Za-zÀ-ÿ][^"']*)["']/g;
  for (const match of source.matchAll(attrRegex)) {
    const value = match[1].trim();
    if (allowedDirectAttrs.some(re => re.test(value))) continue;
    if (/^(?:ZenOS|SKU|NCM|CEST|BRL|USD|EUR|PYG)$/.test(value)) continue;
    failures.push(`${file}: atributo visível direto -> "${value}"`);
  }

  // Regression guard for modals/errors: Portuguese UI messages must not bypass tx().
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (!uiCall.test(line) || line.includes('tx(') || !humanLanguage.test(line)) return;
    failures.push(`${file}:${index + 1}: mensagem operacional fora de tx() -> ${line.trim().slice(0,180)}`);
  });
}

const dataUrl = pathToFileURL(path.join(root, 'src/data.js')).href;
const { traducoes } = await import(dataUrl);
const baseKeys = Object.keys(traducoes.pt || {}).sort();
for (const idioma of ['es','en']) {
  const keys = Object.keys(traducoes[idioma] || {}).sort();
  const faltando = baseKeys.filter(key => !keys.includes(key));
  const extras = keys.filter(key => !baseKeys.includes(key));
  if (faltando.length) failures.push(`traducoes.${idioma}: faltam chaves: ${faltando.join(', ')}`);
  if (extras.length) failures.push(`traducoes.${idioma}: chaves extras: ${extras.join(', ')}`);
}
if (traducoes.pt?.modulosSistema !== 'Módulos do Sistema') {
  failures.push('traducoes.pt.modulosSistema deve permanecer em português');
}

const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'src/components/ZenVisualLayout.jsx'), 'utf8');
const fiscal = fs.readFileSync(path.join(root, 'src/components/Fiscal.jsx'), 'utf8');

const invariantes = [
  [app.includes('tx={tx}') && app.includes('idioma={idioma}'), 'App propaga tx/idioma'],
  [shell.includes("idioma === 'es' ? 'es-PY'") && shell.includes("idioma === 'en' ? 'en-US'"), 'Hero usa locale do idioma'],
  [fiscal.includes("idioma === 'es' ? 'es-PY'") && fiscal.includes("idioma === 'en' ? 'en-US'"), 'Fiscal usa locale do idioma'],
  [app.includes("ecraAtual === 'pdv'") && app.includes('<PDV '), 'PDV permanece ligado à mesma tela'],
  [app.includes("ecraAtual === 'fiscal'") && app.includes('<FiscalErrorBoundary'), 'Fiscal continua isolado por ErrorBoundary'],
];
for (const [ok, label] of invariantes) if (!ok) failures.push(`invariante: ${label}`);

if (failures.length) {
  console.error('i18n coverage: REPROVADO');
  failures.forEach(item => console.error(' - ' + item));
  process.exit(1);
}

console.log(`i18n coverage: APROVADO — ${uiFiles.length} arquivos operacionais verificados; PT/ES/EN com chaves compatíveis.`);
