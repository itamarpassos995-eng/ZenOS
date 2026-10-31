import { stringifyCanonico, validarBackup } from './backupCore.js';

// Exclusivo para a migração autorizada. Nenhuma mudança no merge das outras lojas.
export async function prepararLimpezaVipe({ userId, email, backup, fields, data, control }) {
  if (userId !== 'QNtFleq9ajNNmU6iwiFSi5w1alu2' || String(email).toLowerCase() !== 'vipeagropecuaria@gmail.com') throw new Error('Destino não corresponde à VIPE.');
  const allowed = new Set(['produtos','clientes','historicoVendas','caixaMovimentos','despesas']);
  if (!Array.isArray(fields) || !fields.length || fields.some(field => !allowed.has(field))) throw new Error('Seleção de limpeza inválida.');
  if (control && !['legacy','shadow'].includes(control.mode)) throw new Error('Armazenamento mudou. Limpeza bloqueada.');
  const validacao = await validarBackup(backup);
  if (!validacao.ok || backup.metadata.lojaId !== userId || backup.metadata.schemaVersion !== 1) throw new Error('Backup VIPE inválido ou armazenamento incompatível.');
  for (const field of fields) {
    if (stringifyCanonico(data[field] ?? []) !== stringifyCanonico(backup.data.operacao[field] ?? [])) throw new Error('Dados mudaram após o backup. Exporte um novo backup antes de limpar.');
  }
  return Object.fromEntries(fields.map(field => [field, []]));
}
