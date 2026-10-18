// ZenOS Commerce — núcleo OFFLINE de catálogo seletivo (NÃO faz gravações nem vendas).
import { montarGaleriaProduto, normalizarFotosExtras } from './commerceImages.js';
// A publicação pública deve ser gerada exclusivamente pelo backend após autorização de loja.
const FONTES = ['vitrine', 'deposito', 'ambos'];
const arredondarMoeda = n => Math.round((n + Number.EPSILON) * 100) / 100;

export function normalizarRegraPublicacao(regra = {}) {
  const fonte = FONTES.includes(regra.fonteEstoque) ? regra.fonteEstoque : 'deposito';
  const reservaMinima = Number(regra.reservaMinima ?? 0);
  const limite = regra.limiteOnline == null || regra.limiteOnline === '' ? null : Number(regra.limiteOnline);
  const preco = regra.precoOnlineBRL == null || regra.precoOnlineBRL === '' ? null : Number(regra.precoOnlineBRL);
  const precoAnterior = regra.precoAnteriorBRL == null || regra.precoAnteriorBRL === '' ? null : Number(regra.precoAnteriorBRL);
  if (!Number.isFinite(reservaMinima) || reservaMinima < 0) throw new Error('Reserva de estoque inválida.');
  if (limite !== null && (!Number.isFinite(limite) || limite < 0)) throw new Error('Limite de venda online inválido.');
  if (preco !== null && (!Number.isFinite(preco) || preco <= 0)) throw new Error('Preço online inválido.');
  if (precoAnterior !== null && (!Number.isFinite(precoAnterior) || precoAnterior <= 0)) throw new Error('Preço anterior inválido.');
  return {
    publicado: regra.publicado === true,
    fonteEstoque: fonte,
    reservaMinima,
    limiteOnline: limite,
    precoOnlineBRL: preco === null ? null : arredondarMoeda(preco),
    precoAnteriorBRL: precoAnterior===null?null:arredondarMoeda(precoAnterior),
    descricaoWeb: String(regra.descricaoWeb||'').trim().slice(0,800),
    categoriaPublica: String(regra.categoriaPublica || '').trim().slice(0, 60),
    imagemPublica: urlImagemSegura(regra.imagemPublica),
    usarFotoCadastro: regra.usarFotoCadastro !== false,
    fotoCadastroStoragePath: typeof regra.fotoCadastroStoragePath==='string' ? regra.fotoCadastroStoragePath.slice(0,350) : '',
    capaImagemId: String(regra.capaImagemId || 'cadastro').slice(0,64),
    galeriaImagens: normalizarFotosExtras(regra.galeriaImagens),
  };
}

export function urlImagemSegura(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    return url.href;
  } catch { return null; }
}

// Compatibilidade somente de leitura com ATT02. A escrita em estoque não acontece aqui.
export function lerEstoquePorLocal(produto = {}) {
  const valid = n => { const x=Number(n); return Number.isFinite(x) ? Math.max(0,x) : 0; };
  const presente = k => produto[k] !== undefined && produto[k] !== null && produto[k] !== '';
  const total = valid(produto.estoque);
  const vitrine = valid(produto.estoqueVitrine);
  const deposito = valid(produto.estoqueGalpao);
  if (!presente('estoqueVitrine') && !presente('estoqueGalpao')) {
    return { total, vitrine:total, deposito:0, legadoSemLocalizacao:true };
  }
  const totalCanonico = presente('estoque') ? total : vitrine + deposito;
  const galpaoAjustado = Math.min(deposito, totalCanonico);
  return {
    total:totalCanonico,
    vitrine:Math.max(0,totalCanonico-galpaoAjustado),
    deposito:galpaoAjustado,
    legadoSemLocalizacao:false,
  };
}

export function disponivelParaPublicacao(produto, regra = {}) {
  const cfg = normalizarRegraPublicacao(regra);
  if (!cfg.publicado || produto?.tipoItem === 'servico' || produto?.usoUnicoEncomendado) return 0;
  const saldo = lerEstoquePorLocal(produto);
  const fonte = cfg.fonteEstoque === 'vitrine' ? saldo.vitrine : cfg.fonteEstoque === 'deposito' ? saldo.deposito : saldo.total;
  const disponivel = Math.max(0, fonte - cfg.reservaMinima);
  return Math.max(0, Math.min(disponivel, cfg.limiteOnline ?? Infinity));
}

function precoVenda(produto, regra) {
  return regra.precoOnlineBRL ?? Number(produto?.preco1BRL ?? produto?.precoBRL ?? produto?.preco1 ?? 0);
}

// APENAS campos allowlisted para evitar vazamento de custo, margem, fornecedor, usuários ou fiado.
export function projetarCatalogoPublico({ produtos = [], regras = {}, lojaAtivada = false, modoPrevia = false } = {}) {
  if (!lojaAtivada) return [];
  const vistos = new Set();
  const skusPublicos = new Set();
  return produtos.flatMap(prod => {
    if (!prod?.id || vistos.has(String(prod.id))) return [];
    vistos.add(String(prod.id));
    const config = normalizarRegraPublicacao(regras[String(prod.id)] || {});
    if (!config.publicado) return [];
    const preco = precoVenda(prod,config);
    if (!Number.isFinite(preco) || preco <= 0 || !Number.isSafeInteger(Math.round(preco*100))) return [];
    const skuPublico = String(prod.sku || prod.id).slice(0,80);
    if (skusPublicos.has(skuPublico)) return []; // SKU duplicado nunca pode abrir venda ambígua.
    skusPublicos.add(skuPublico);
    const disponibilidade = disponivelParaPublicacao(prod,config);
    const galeria=montarGaleriaProduto({produto:prod,regra:config,previa:modoPrevia});
    // imagemPublica existente continua compatível; cadastro original é a capa por padrão.
    const imagemUrl=config.imagemPublica||galeria.capa?.url||null;
    return [{
      skuPublico,
      nome: String(prod.nome || '').trim().slice(0,120),
      descricao: String(config.descricaoWeb || prod.descricaoPublica || '').slice(0,800),
      precoAnteriorBRL: config.precoAnteriorBRL>preco?config.precoAnteriorBRL:null,
      categoria: config.categoriaPublica || String(prod.grupo || 'Produtos').slice(0,60),
      precoBRL: arredondarMoeda(preco),
      imagemUrl,
      imagens: galeria.imagens.map(f=>({url:f.url,miniaturaUrl:f.miniaturaUrl,alt:f.alt})),
      fotoPendenteSincronizacao: galeria.pendenteSincronizacao,
      disponivel: disponibilidade > 0,
      quantidadeMaxima: disponibilidade,
    }];
  });
}

// Pré-validação para checkout feita com valores CANÔNICOS do servidor.
// NÃO reserva, NÃO baixa estoque e NÃO confirma pagamentos.
export function validarCarrinhoServidor({ itens = [], produtos = [], regras = {}, lojaAtivada = false } = {}) {
  if (!lojaAtivada) return { ok:false, erro:'Loja online não ativada.' };
  if (!Array.isArray(itens) || itens.length < 1 || itens.length > 50) return { ok:false, erro:'Carrinho inválido.' };
  const resultado = [];
  let subtotalCentavos = 0;
  const acumuladoPorSku = new Map();
  const catalogo = projetarCatalogoPublico({ produtos,regras,lojaAtivada });
  for (const item of itens) {
    const sku = String(item.skuPublico || '');
    const qtd = Number(item.quantidade);
    const cadastro = catalogo.find(p => p.skuPublico === sku);
    if (!cadastro || !cadastro.disponivel || !Number.isSafeInteger(qtd) || qtd < 1 || qtd > 1000) {
      return { ok:false, erro:'Produto indisponível ou quantidade inválida.' };
    }
    const anterior = acumuladoPorSku.get(sku) || 0;
    if (anterior + qtd > cadastro.quantidadeMaxima) return { ok:false, erro:'Estoque online insuficiente.' };
    acumuladoPorSku.set(sku, anterior + qtd);
    const centavos = Math.round(cadastro.precoBRL * 100);
    subtotalCentavos += centavos*qtd;
    if (!Number.isSafeInteger(subtotalCentavos)) return { ok:false, erro:'Valor fora do limite.' };
    resultado.push({ skuPublico:sku, quantidade:qtd, precoUnitarioCentavos:centavos });
  }
  return { ok:true, itens:resultado, subtotalCentavos, moedaCobranca:'BRL', necessitaReservaAtomica:true,
    status:'AGUARDANDO_RESERVA_TRANSACIONAL' };
}
