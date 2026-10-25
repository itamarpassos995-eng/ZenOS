import { ehEncomendaUsoUnico } from './orderItems.js';

// Indexação local reutilizada enquanto o catálogo não muda.
// A busca não executa consultas à nuvem e nunca monta centenas de sugestões.
export const indexarProdutosPDV = (produtos = []) => (produtos || [])
  .filter(Boolean)
  .map(produto => ({
    produto,
    disponivel: !ehEncomendaUsoUnico(produto) || Number(produto.estoque || 0) > 0,
    texto: `${produto.nome || ''} ${produto.sku || ''} ${produto.grupo || ''}`.toLowerCase(),
  }));

export const indexarClientesPDV = (clientes = []) => (clientes || [])
  .filter(Boolean)
  .map(cliente => ({
    cliente,
    texto: `${cliente.nome || ''} ${cliente.documento || ''} ${cliente.telefone || ''}`.toLowerCase(),
  }));

const termosBusca = texto => String(texto || '').toLowerCase().trim().split(/\s+/).filter(Boolean);

export function buscarProdutosPDV(indice = [], busca = '', limite = 40) {
  const termos = termosBusca(busca);
  if (!termos.length) return [];
  const encontrados = [];
  for (const item of indice) {
    if (item.disponivel && termos.every(termo => item.texto.includes(termo))) {
      encontrados.push(item.produto);
      if (encontrados.length >= limite) break;
    }
  }
  return encontrados;
}

export function buscarClientesPDV(indice = [], busca = '', limite = 12) {
  const termos = termosBusca(busca);
  if (!termos.length) return [];
  const encontrados = [];
  for (const item of indice) {
    if (termos.every(termo => item.texto.includes(termo))) {
      encontrados.push(item.cliente);
      if (encontrados.length >= limite) break;
    }
  }
  return encontrados;
}
