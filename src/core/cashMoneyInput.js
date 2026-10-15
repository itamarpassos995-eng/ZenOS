// Entradas de dinheiro físico: não converter texto inválido em zero nem truncar separadores de milhar.
export const MOEDAS_CAIXA = Object.freeze(['BRL', 'USD', 'EUR', 'PYG']);

const agrupamentoValido = (texto, separador) => separador === '.'
  ? /^\d{1,3}(?:\.\d{3})+$/.test(texto)
  : /^\d{1,3}(?:,\d{3})+$/.test(texto);

export function interpretarValorMonetario(entrada, moeda = 'BRL', { permitirVazio = false } = {}) {
  const codigo = String(moeda || '').toUpperCase();
  if (!MOEDAS_CAIXA.includes(codigo)) return { ok: false, erro: 'Moeda não reconhecida.' };
  const texto = String(entrada ?? '').trim().replace(/\s/g, '');
  if (!texto) {
    return permitirVazio
      ? { ok: true, valor: 0, vazio: true }
      : { ok: false, erro: 'Informe o valor (digite 0 quando não houver dinheiro).' };
  }
  if (!/^[0-9.,]+$/.test(texto)) return { ok: false, erro: 'Use somente números e separadores decimais válidos.' };

  const posPonto = texto.lastIndexOf('.');
  const posVirgula = texto.lastIndexOf(',');
  let inteiro = texto;
  let decimal = '';
  if (posPonto >= 0 && posVirgula >= 0) {
    const separadorDecimal = posPonto > posVirgula ? '.' : ',';
    const separadorMilhar = separadorDecimal === '.' ? ',' : '.';
    const partes = texto.split(separadorDecimal);
    if (partes.length !== 2 || !(/^\d+$/.test(partes[1])) || partes[1].length > 2
        || codigo === 'PYG' || !(/^\d+$/.test(partes[0]) || agrupamentoValido(partes[0], separadorMilhar))) {
      return { ok: false, erro: 'Separadores monetários inválidos para esta moeda.' };
    }
    inteiro = partes[0].split(separadorMilhar).join('');
    decimal = partes[1];
  } else if (posPonto >= 0 || posVirgula >= 0) {
    const sep = posPonto >= 0 ? '.' : ',';
    if (agrupamentoValido(texto, sep)) {
      inteiro = texto.split(sep).join('');
    } else {
      const partes = texto.split(sep);
      if (codigo === 'PYG' || partes.length !== 2 || !/^\d+$/.test(partes[0])
          || !/^\d{1,2}$/.test(partes[1])) {
        return { ok: false, erro: 'Informe um valor válido (PYG não admite centavos).' };
      }
      inteiro = partes[0];
      decimal = partes[1];
    }
  }
  if (!/^\d+$/.test(inteiro)) return { ok: false, erro: 'Formato numérico inválido.' };
  const valor = Number(inteiro + (decimal ? '.' + decimal : ''));
  const fator = codigo === 'PYG' ? 1 : 100;
  if (!Number.isFinite(valor) || valor < 0 || !Number.isSafeInteger(Math.round(valor * fator))) {
    return { ok: false, erro: 'Valor fora do limite seguro.' };
  }
  return { ok: true, valor: Math.round(valor * fator) / fator, vazio: false };
}

export function converterValoresFisicosParaBRL(valores = {}, taxas = {}) {
  let total = 0;
  const nativos = {};
  for (const moeda of MOEDAS_CAIXA) {
    const analisado = interpretarValorMonetario(valores[moeda], moeda, { permitirVazio: true });
    if (!analisado.ok) return { ok: false, erro: moeda + ': ' + analisado.erro, moeda };
    const taxa = moeda === 'BRL' ? 1 : Number(taxas[moeda]);
    if (analisado.valor > 0 && (!Number.isFinite(taxa) || taxa <= 0)) {
      return { ok: false, erro: 'Cotação inválida para ' + moeda + '. Atualize e sincronize o câmbio.', moeda };
    }
    nativos[moeda] = analisado.valor;
    total += moeda === 'BRL' ? analisado.valor : (analisado.valor > 0 ? analisado.valor / taxa : 0);
  }
  if (!Number.isFinite(total) || !Number.isSafeInteger(Math.round(total * 100))) {
    return { ok: false, erro: 'Total convertido fora do limite seguro.' };
  }
  return { ok: true, valoresNativos: nativos, totalBRL: Math.round(total * 100) / 100 };
}
