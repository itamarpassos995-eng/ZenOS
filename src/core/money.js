// Money V2: decimal strings on disk, BigInt only inside pure calculations.
// No network, clock, preferences or implicit FX in this module.
export const CURRENCIES = Object.freeze(['BRL', 'PYG', 'USD', 'EUR']);
export const MONEY_VERSION = 2;
const MAX_DIGITS = 60;
const MAX_SCALE = 18;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
export const assertCurrency = code => {
  if (!CURRENCIES.includes(code)) fail('MONEY_CURRENCY', 'Moeda explícita inválida.');
  return code;
};
const pow = n => 10n ** BigInt(n);
const validRounding = mode => {
  if (!['HALF_UP', 'HALF_EVEN', 'DOWN'].includes(mode)) fail('MONEY_ROUNDING', 'Arredondamento inválido.');
};
const deepFreeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
};
function decimal(value) {
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value))
    fail('MONEY_DECIMAL', 'Use uma quantia decimal canônica em texto.');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  if (whole.length + fraction.length > MAX_DIGITS || fraction.length > MAX_SCALE)
    fail('MONEY_LIMIT', 'Precisão ou tamanho monetário excedido.');
  return { units: BigInt(whole + fraction) * (negative ? -1n : 1n), scale: fraction.length };
}
function render(units, scale) {
  const negative = units < 0n;
  const raw = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const value = scale ? raw.slice(0, -scale) + '.' + raw.slice(-scale) : raw;
  const clean = value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
  return (negative ? '-' : '') + clean;
}
export function canonicalDecimal(value) {
  const d = decimal(value);
  return render(d.units, d.scale);
}
export function money(amount, currency, source) {
  assertCurrency(currency);
  if (typeof source !== 'string' || !source.trim()) fail('MONEY_SOURCE', 'Origem monetária obrigatória.');
  return Object.freeze({ schemaVersion: MONEY_VERSION, amount: canonicalDecimal(amount), currency, source });
}
export function assertMoney(value) {
  if (value?.schemaVersion !== MONEY_VERSION) fail('MONEY_VERSION', 'Contrato monetário incompatível.');
  return money(value.amount, value.currency, value.source);
}
export function compare(a, b) {
  assertMoney(a); assertMoney(b);
  if (a.currency !== b.currency) fail('MONEY_MIXED_CURRENCIES', 'Converta explicitamente antes de comparar.');
  const x = decimal(a.amount), y = decimal(b.amount), scale = Math.max(x.scale, y.scale);
  const difference = x.units * pow(scale - x.scale) - y.units * pow(scale - y.scale);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
export function add(a, b, source = 'sum') {
  assertMoney(a); assertMoney(b);
  if (a.currency !== b.currency) fail('MONEY_MIXED_CURRENCIES', 'Não é permitido somar moedas diferentes.');
  const x = decimal(a.amount), y = decimal(b.amount), scale = Math.max(x.scale, y.scale);
  return money(render(x.units * pow(scale - x.scale) + y.units * pow(scale - y.scale), scale), a.currency, source);
}
export const negate = a => money(render(-decimal(assertMoney(a).amount).units, decimal(a.amount).scale), a.currency, a.source);
export const subtract = (a, b, source = 'difference') => add(a, negate(b), source);
function roundedDivide(numerator, denominator, mode) {
  if (denominator <= 0n) fail('MONEY_RATE', 'Divisor monetário deve ser positivo.');
  const sign = numerator < 0n ? -1n : 1n;
  const n = numerator * sign, quotient = n / denominator, remainder = n % denominator;
  const increment = mode !== 'DOWN' && (remainder * 2n > denominator ||
    (remainder * 2n === denominator && (mode === 'HALF_UP' || quotient % 2n !== 0n)));
  return (quotient + (increment ? 1n : 0n)) * sign;
}
function precision(scale) {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) fail('MONEY_SCALE', 'Escala monetária inválida.');
}
export const currencyScale = currency => assertCurrency(currency) === 'PYG' ? 0 : 2;
export function quantize(value, scale, rounding = 'HALF_UP') {
  assertMoney(value); precision(scale); validRounding(rounding);
  const d = decimal(value.amount);
  const units = d.scale > scale ? roundedDivide(d.units, pow(d.scale - scale), rounding) : d.units * pow(scale - d.scale);
  const result = money(render(units, scale), value.currency, value.source);
  return { value: result, residual: subtract(value, result, 'rounding-residual'), rounding, scale };
}
export function multiply(value, factor, { scale = 8, rounding = 'HALF_UP' } = {}) {
  assertMoney(value); precision(scale); validRounding(rounding);
  const a = decimal(value.amount), b = decimal(factor), originalScale = a.scale + b.scale;
  const product = a.units * b.units;
  const units = originalScale > scale ? roundedDivide(product, pow(originalScale - scale), rounding) : product * pow(scale - originalScale);
  return money(render(units, scale), value.currency, value.source);
}
export function divide(value, divisor, { scale = 12, rounding = 'HALF_UP' } = {}) {
  assertMoney(value); precision(scale); validRounding(rounding);
  const a = decimal(value.amount), b = decimal(divisor);
  if (b.units <= 0n) fail('MONEY_DIVISOR', 'Divisor deve ser positivo.');
  const units = roundedDivide(a.units * pow(b.scale + scale), b.units * pow(a.scale), rounding);
  return money(render(units, scale), value.currency, value.source);
}
// Locale is explicit; currency alone cannot establish decimal separators.
export function parseMoneyInput(input, currency, { locale, source = 'input', allowNegative = false } = {}) {
  assertCurrency(currency);
  if (!['pt-BR', 'es-PY', 'es-ES', 'en-US'].includes(locale)) fail('MONEY_LOCALE', 'Idioma da entrada obrigatório.');
  if (typeof input !== 'string' || !input.trim()) fail('MONEY_INPUT', 'Informe um valor.');
  const comma = locale !== 'en-US', group = comma ? '.' : ',', separator = comma ? ',' : '.';
  const escapedGroup = group === '.' ? '\\.' : ',';
  const escapedSeparator = separator === '.' ? '\\.' : ',';
  const pattern = new RegExp(`^-?(?:\\d+|\\d{1,3}(?:${escapedGroup}\\d{3})+)(?:${escapedSeparator}\\d+)?$`);
  const text = input.trim();
  if (!pattern.test(text)) fail('MONEY_INPUT', 'Separadores incompatíveis com o idioma informado.');
  const canonical = text.split(group).join('').replace(separator, '.');
  const result = money(canonical, currency, source);
  if (!allowNegative && decimal(result.amount).units < 0n) fail('MONEY_NEGATIVE', 'Valor negativo não permitido.');
  return result;
}
export function formatMoney(value, { locale = 'pt-BR', scale = currencyScale(value.currency), rounding = 'HALF_UP', currencyDisplay = 'code' } = {}) {
  const q = quantize(value, scale, rounding).value;
  const d = decimal(q.amount), negative = d.units < 0n;
  const absolute = d.units < 0n ? -d.units : d.units;
  const scaled = absolute * pow(scale - d.scale);
  const whole = scaled / pow(scale), fraction = (scaled % pow(scale)).toString().padStart(scale, '0');
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole);
  const separator = new Intl.NumberFormat(locale).formatToParts(1.1).find(p => p.type === 'decimal')?.value || '.';
  return `${negative ? '-' : ''}${currencyDisplay === 'symbol' ? ({BRL:'R$',PYG:'₲',USD:'US$',EUR:'€'}[value.currency]) : value.currency} ${grouped}${scale ? separator + fraction : ''}`;
}
export function convertMoney(value, destination, quote, { appliedAt, purpose, scale = 8, rounding = 'HALF_UP' } = {}) {
  assertMoney(value); assertCurrency(destination); precision(scale);
  if (value.currency === destination) return { value, conversion: null };
  if (!quote || quote.from !== value.currency || quote.to !== destination || !quote.id || !quote.quotedAt || !quote.expiresAt)
    fail('MONEY_QUOTE', 'Cotação explícita e identificada obrigatória.');
  const fromTime = Date.parse(quote.quotedAt), expiry = Date.parse(quote.expiresAt), applied = Date.parse(appliedAt);
  if (![fromTime, expiry, applied].every(Number.isFinite) || fromTime > applied || expiry < applied || expiry < fromTime || !purpose)
    fail('MONEY_QUOTE_EXPIRED', 'Cotação vencida ou metadados incompletos.');
  const rate = decimal(quote.rate);
  if (rate.units <= 0n) fail('MONEY_RATE', 'Cotação deve ser positiva.');
  const result = multiply(value, quote.rate, { scale, rounding });
  const output = money(result.amount, destination, value.source);
  const exactProduct = (() => {
    const a = decimal(value.amount);
    return render(a.units * rate.units, a.scale + rate.scale);
  })();
  // Residual is a decimal string in destination currency, possibly >18 places.
  const p = decimal(value.amount), exactScale = p.scale + rate.scale;
  const rounded = decimal(output.amount), common = Math.max(exactScale, rounded.scale);
  const residual = render(p.units * rate.units * pow(common - exactScale) - rounded.units * pow(common - rounded.scale), common);
  return { value: output, conversion: deepFreeze({
    schemaVersion: MONEY_VERSION, original: { ...value }, result: { ...output },
    quote: { id: quote.id, from: quote.from, to: quote.to, rate: canonicalDecimal(quote.rate), quotedAt: quote.quotedAt, expiresAt: quote.expiresAt },
    appliedAt, purpose, scale, rounding, exactProduct, residual,
  }) };
}
export function allocateMoney(value, weights, { scale = currencyScale(value.currency) } = {}) {
  assertMoney(value); precision(scale);
  if (!weights.length) fail('MONEY_ALLOCATION', 'Rateio exige destinatários.');
  const ds = weights.map(decimal), common = Math.max(...ds.map(d => d.scale));
  const ws = ds.map(d => d.units * pow(common - d.scale));
  if (ws.some(w => w < 0n) || ws.every(w => w === 0n)) fail('MONEY_ALLOCATION', 'Pesos inválidos.');
  const rounded = quantize(value, scale), d = decimal(rounded.value.amount);
  const signed = d.units * pow(scale - d.scale), sign = signed < 0n ? -1n : 1n, total = signed * sign;
  const sum = ws.reduce((a, b) => a + b, 0n);
  const shares = ws.map((w, index) => ({ index, units: total * w / sum, remainder: total * w % sum }));
  let left = total - shares.reduce((a, s) => a + s.units, 0n);
  for (const share of [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (left === 0n) break;
    share.units++; left--;
  }
  return { values: shares.map(s => money(render(s.units * sign, scale), value.currency, value.source)), residual: rounded.residual };
}
