import { verificarPinOperador } from './operatorPin.js';

export function ehOperadorGerencial(operador) {
  if (!operador) return false;
  return String(operador.id || '') === 'admin'
    || String(operador.patente || '').toLowerCase() === 'gerencia'
    || operador?.permissoes?.admin === true;
}

export function patenteEfetivaOperador(operador) {
  return ehOperadorGerencial(operador) ? 'gerencia' : String(operador?.patente || 'vendedor');
}

export async function validarCredencialGerencial({ vendedores = [], senha = '', senhaLegada = '' } = {}) {
  const credencial = String(senha ?? '');
  if (!credencial) return null;
  const gerentes = (Array.isArray(vendedores) ? vendedores : []).filter(ehOperadorGerencial);
  for (const gerente of gerentes) {
    if (await verificarPinOperador(gerente, credencial)) return gerente;
  }
  // Compatibilidade somente para bases realmente antigas sem nenhum operador gerencial cadastrado.
  if (gerentes.length === 0 && senhaLegada && String(senhaLegada) === credencial) {
    return { id: 'legacy-manager', nome: 'Gerência legada', patente: 'gerencia', legado: true };
  }
  return null;
}
