export const BACKUP_VERSION = 'ZENOS_V1_BACKUP_1';

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const canonicalizar = (value) => {
  if (Array.isArray(value)) return value.map(canonicalizar);
  if (!isPlainObject(value)) return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    if (value[key] !== undefined) acc[key] = canonicalizar(value[key]);
    return acc;
  }, {});
};

export const stringifyCanonico = (value) => JSON.stringify(canonicalizar(value));

const bytesToHex = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

export async function sha256Texto(texto) {
  const dados = new TextEncoder().encode(String(texto ?? ''));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', dados);
  return bytesToHex(new Uint8Array(hash));
}

export const contarEntidadesBackup = (dados = {}) => ({
  produtos: Array.isArray(dados?.operacao?.produtos) ? dados.operacao.produtos.length : 0,
  clientes: Array.isArray(dados?.operacao?.clientes) ? dados.operacao.clientes.length : 0,
  fornecedores: Array.isArray(dados?.operacao?.fornecedores) ? dados.operacao.fornecedores.length : 0,
  vendas: Array.isArray(dados?.operacao?.historicoVendas) ? dados.operacao.historicoVendas.length : 0,
  compras: Array.isArray(dados?.operacao?.historicoCompras) ? dados.operacao.historicoCompras.length : 0,
  despesas: Array.isArray(dados?.operacao?.despesas) ? dados.operacao.despesas.length : 0,
  caixaMovimentos: Array.isArray(dados?.operacao?.caixaMovimentos) ? dados.operacao.caixaMovimentos.length : 0,
  turnos: Array.isArray(dados?.operacao?.sessoesCaixa) ? dados.operacao.sessoesCaixa.length : 0,
  vouchers: Array.isArray(dados?.operacao?.vouchers) ? dados.operacao.vouchers.length : 0,
  operadores: Array.isArray(dados?.operacao?.vendedores) ? dados.operacao.vendedores.length : 0,
  contas: Array.isArray(dados?.operacao?.clientes) ? dados.operacao.clientes.filter(c => Number(c?.saldoDevedorBRL || c?.saldoDevedor || 0) !== 0).length : 0,
  mesasComandas: Array.isArray(dados?.mesas?.mesas) ? dados.mesas.mesas.length : 0,
  financeiro: Array.isArray(dados?.financeiroLivro) ? dados.financeiroLivro.length : 0,
  auditoriaEstoque: Array.isArray(dados?.estoqueAuditoria) ? dados.estoqueAuditoria.reduce((n, grupo) => n + (Array.isArray(grupo?.movimentos) ? grupo.movimentos.length : 0), 0) : 0,
  configuracoes: dados?.configuracoes && Object.keys(dados.configuracoes).length ? 1 : 0,
  produtoIndices: Array.isArray(dados?.produtoIndices) ? dados.produtoIndices.length : 0,
});

const corpoSemChecksum = (backup) => {
  const clone = canonicalizar(backup || {});
  if (clone?.metadata) delete clone.metadata.checksum;
  return clone;
};

export async function calcularChecksumBackup(backup) {
  return sha256Texto(stringifyCanonico(corpoSemChecksum(backup)));
}

export async function montarBackup({ lojaId, createdBy, zenosVersion = '1.0.0', schemaVersion = 1, dados = {} }) {
  if (!lojaId) throw new Error('Loja não identificada para backup.');
  const backup = {
    metadata: {
      backupVersion: BACKUP_VERSION,
      zenosVersion,
      schemaVersion,
      lojaId: String(lojaId),
      createdAt: new Date().toISOString(),
      createdBy: String(createdBy || 'Administrador'),
      checksum: '',
    },
    counts: contarEntidadesBackup(dados),
    data: canonicalizar(dados),
  };
  backup.metadata.checksum = await calcularChecksumBackup(backup);
  return backup;
}

export async function validarBackup(backup) {
  const erros = [];
  if (!backup || typeof backup !== 'object') erros.push('Arquivo de backup inválido.');
  if (backup?.metadata?.backupVersion !== BACKUP_VERSION) erros.push('Versão de backup incompatível.');
  if (!backup?.metadata?.lojaId) erros.push('Loja do backup não identificada.');
  if (!backup?.metadata?.checksum) erros.push('Checksum ausente.');
  const countsReais = contarEntidadesBackup(backup?.data || {});
  const countsDeclarados = backup?.counts || {};
  for (const [chave, valor] of Object.entries(countsReais)) {
    if (Number(countsDeclarados[chave] || 0) !== Number(valor || 0)) erros.push(`Contagem divergente: ${chave}.`);
  }
  let checksumCalculado = null;
  if (!erros.includes('Checksum ausente.')) {
    checksumCalculado = await calcularChecksumBackup(backup);
    if (checksumCalculado !== backup?.metadata?.checksum) erros.push('Checksum não confere. O arquivo pode ter sido alterado ou corrompido.');
  }
  return { ok: erros.length === 0, erros, counts: countsReais, checksumCalculado };
}

export function simularRestauracaoEmMemoria(backup) {
  return canonicalizar(backup?.data || {});
}
