const pad2 = (valor) => String(valor).padStart(2, '0');

const dataValida = (data) => data instanceof Date && !Number.isNaN(data.getTime());

/**
 * Converte datas históricas do ZenOS sem modificar o registro original.
 * Prioridades suportadas:
 * - Date / timestamp numérico
 * - Firestore Timestamp (toDate ou seconds)
 * - ISO 8601 (createdAt novo)
 * - legado pt-BR/es-ES: DD/MM/YYYY, HH:mm:ss
 * - legado en-US: MM/DD/YYYY, h:mm:ss AM/PM
 *
 * Datas antigas DD/MM x MM/DD sem AM/PM podem ser intrinsecamente ambíguas.
 * Nesses casos preservamos a convenção histórica predominante do ZenOS (DD/MM/YYYY).
 */
export const parseZenOSDate = (valor) => {
  if (!valor) return null;

  if (valor instanceof Date) return dataValida(valor) ? new Date(valor.getTime()) : null;

  if (typeof valor === 'number') {
    const data = new Date(valor);
    return dataValida(data) ? data : null;
  }

  if (typeof valor === 'object') {
    if (typeof valor.toDate === 'function') {
      try {
        const data = valor.toDate();
        return dataValida(data) ? data : null;
      } catch (_) {
        return null;
      }
    }
    if (Number.isFinite(Number(valor.seconds))) {
      const millis = Number(valor.seconds) * 1000 + Math.floor((Number(valor.nanoseconds) || 0) / 1e6);
      const data = new Date(millis);
      return dataValida(data) ? data : null;
    }
  }

  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  if (!texto) return null;

  // ISO / RFC / YYYY-MM-DD: formato não ambíguo.
  if (/^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(texto)) {
    const data = new Date(texto);
    return dataValida(data) ? data : null;
  }

  // Saída histórica de toLocaleString pt-BR/es-ES/en-US.
  const legado = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (legado) {
    const [, aTxt, bTxt, anoTxt, horaTxt = '0', minTxt = '0', segTxt = '0', periodoRaw] = legado;
    const a = Number(aTxt);
    const b = Number(bTxt);
    const ano = Number(anoTxt);
    const periodo = String(periodoRaw || '').toUpperCase();

    let dia;
    let mes;
    if (periodo === 'AM' || periodo === 'PM') {
      // en-US toLocaleString => MM/DD/YYYY h:mm:ss AM/PM
      mes = a;
      dia = b;
    } else if (a > 12 && b <= 12) {
      dia = a;
      mes = b;
    } else if (b > 12 && a <= 12) {
      // Único caso não-AM/PM que só pode ser MM/DD.
      mes = a;
      dia = b;
    } else {
      // Convenção histórica predominante no ZenOS: pt-BR/es-ES.
      dia = a;
      mes = b;
    }

    let hora = Number(horaTxt);
    if (periodo === 'AM' && hora === 12) hora = 0;
    if (periodo === 'PM' && hora < 12) hora += 12;

    const minuto = Number(minTxt);
    const segundo = Number(segTxt);
    const data = new Date(ano, mes - 1, dia, hora, minuto, segundo, 0);

    // Evita normalizações silenciosas como 31/02 -> março.
    if (
      dataValida(data)
      && data.getFullYear() === ano
      && data.getMonth() === mes - 1
      && data.getDate() === dia
      && data.getHours() === hora
      && data.getMinutes() === minuto
      && data.getSeconds() === segundo
    ) return data;
    return null;
  }

  return null;
};

export const obterDataRegistro = (registro = {}) => {
  if (registro instanceof Date || typeof registro === 'string' || typeof registro === 'number') {
    return parseZenOSDate(registro);
  }

  const candidatos = [registro.createdAt, registro.dataHora, registro.dataCriacao];
  for (const candidato of candidatos) {
    const data = parseZenOSDate(candidato);
    if (data) return data;
  }
  return null;
};

export const chaveDiaLocal = (valor) => {
  const data = valor instanceof Date ? valor : parseZenOSDate(valor);
  if (!dataValida(data)) return null;
  return `${data.getFullYear()}-${pad2(data.getMonth() + 1)}-${pad2(data.getDate())}`;
};

export const chaveMesLocal = (valor) => {
  const data = valor instanceof Date ? valor : parseZenOSDate(valor);
  if (!dataValida(data)) return null;
  return `${data.getFullYear()}-${pad2(data.getMonth() + 1)}`;
};

export const obterMesLocalAtual = (agora = new Date()) => chaveMesLocal(agora);

export const registroEhDoDiaLocal = (registro, referencia = new Date()) => {
  const data = obterDataRegistro(registro);
  if (!data) return false;
  return chaveDiaLocal(data) === chaveDiaLocal(referencia);
};

export const registroEhDoMesLocal = (registro, mesYYYYMM) => {
  if (!/^\d{4}-\d{2}$/.test(String(mesYYYYMM || ''))) return false;
  const data = obterDataRegistro(registro);
  if (!data) return false;
  return chaveMesLocal(data) === mesYYYYMM;
};


export const registroEhDoIntervaloLocal = (registro, dataInicioYYYYMMDD, dataFimYYYYMMDD) => {
  const inicioTxt = String(dataInicioYYYYMMDD || '');
  const fimTxt = String(dataFimYYYYMMDD || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioTxt) || !/^\d{4}-\d{2}-\d{2}$/.test(fimTxt)) return false;

  const data = obterDataRegistro(registro);
  if (!data) return false;

  const chave = chaveDiaLocal(data);
  const inicio = inicioTxt <= fimTxt ? inicioTxt : fimTxt;
  const fim = inicioTxt <= fimTxt ? fimTxt : inicioTxt;
  return chave >= inicio && chave <= fim;
};

export const deslocarMesYYYYMM = (mesYYYYMM, delta) => {
  if (!/^\d{4}-\d{2}$/.test(String(mesYYYYMM || ''))) return obterMesLocalAtual();
  const [ano, mes] = mesYYYYMM.split('-').map(Number);
  const data = new Date(ano, mes - 1 + Number(delta || 0), 1, 12, 0, 0, 0);
  return chaveMesLocal(data);
};
