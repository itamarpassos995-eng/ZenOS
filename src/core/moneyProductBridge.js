import { money, assertMoney, divide, multiply, subtract, compare, parseMoneyInput, formatMoney, convertMoney, CURRENCIES, canonicalDecimal, quantize } from './money.js';
import { createPriceBook, createCommercialSnapshot, reconcilePayment } from './moneyOperations.js';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const fields = { custoBRL: 'cost', precoBRL: 'sale', preco2BRL: 'wholesale', preco3BRL: 'price3' };
// Boundary for numbers from the legacy engine. No exponents or silent zero.
export function legacyDecimal(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) fail('MONEY_LEGACY_NUMBER', 'Número legado inválido.');
  const raw = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(raw)) fail('MONEY_LEGACY_NUMBER', 'Valor legado fora do contrato decimal.');
  return canonicalDecimal(raw);
}
export function quoteFromConfiguredRates(from, to, rates, at, purpose = 'configured-rates') {
  const valid = currency => {
    if (!CURRENCIES.includes(currency)) fail('MONEY_CURRENCY', 'Moeda inválida.');
    const value = currency === 'BRL' ? '1' : legacyDecimal(rates[currency]);
    if (compare(money(value, 'BRL', purpose), money('0', 'BRL', purpose)) <= 0) fail('MONEY_RATE', 'Cotação obrigatória e positiva.');
    return value;
  };
  const rate = divide(money(valid(to), 'BRL', purpose), valid(from), { scale: 18 }).amount;
  return { id: `configured:${from}:${to}:${valid(from)}:${valid(to)}:${at}`, from, to, rate, quotedAt: at,
    expiresAt: new Date(Date.parse(at) + 60_000).toISOString() };
}
export function bridgeConvert(value, to, rates, at, purpose = 'display', scale = 12) {
  assertMoney(value);
  if (value.currency === to) return { value, conversion: null };
  return convertMoney(value, to, quoteFromConfiguredRates(value.currency, to, rates, at, purpose), { appliedAt: at, purpose, scale });
}
export function nativeProductValue(product, field) {
  const value = product?.moneyPrices?.values?.[fields[field]];
  if (!value) fail('MONEY_LEGACY_AMBIGUOUS', 'Preço/custo sem moeda original comprovada. Confira o cadastro antes de continuar.');
  return assertMoney(value);
}
export const moneyInputText = (value, locale) => value.amount.replace('.', locale === 'en-US' ? '.' : ',');
export function productMoneyForm(product, { defaultCurrency, locale }) {
  if (!product) return { moneyPriceCurrency: defaultCurrency, moneyCostCurrency: defaultCurrency, custoBRL: '0', precoBRL: '0', preco2BRL: '', preco3BRL: '' };
  const sale = nativeProductValue(product, 'precoBRL'), cost = nativeProductValue(product, 'custoBRL');
  return { moneyPriceCurrency: sale.currency, moneyCostCurrency: cost.currency,
    ...Object.fromEntries(Object.entries(fields).map(([field, key]) => [field,
      product.moneyPrices.values[key] ? moneyInputText(product.moneyPrices.values[key], locale) : ''])) };
}
export function saveProductMoney(product, form, { tenantId, actor, locale, rates, at }) {
  const parse = (field, currency) => parseMoneyInput(String(form[field] || '0'), currency, { locale, source: `product:${product.id}:${field}` });
  const values = {
    cost: parse('custoBRL', form.moneyCostCurrency), sale: parse('precoBRL', form.moneyPriceCurrency),
    wholesale: parse('preco2BRL', form.moneyPriceCurrency), price3: parse('preco3BRL', form.moneyPriceCurrency),
  };
  if (compare(values.sale, money('0', values.sale.currency, 'validation')) <= 0) fail('MONEY_PRICE', 'Informe um preço de venda maior que zero.');
  const previous = product.moneyPrices;
  if (previous && (values.sale.currency !== previous.values.sale.currency || values.cost.currency !== previous.values.cost.currency))
    fail('MONEY_CURRENCY_CHANGE', 'A moeda de um cadastro existente exige alteração de precificação própria e auditada.');
  const book = createPriceBook({ tenantId, id: product.id, actor, createdAt: at, values, revision: (previous?.revision || 0) + 1 });
  const conversions = [];
  const compatibility = Object.fromEntries(Object.entries(fields).map(([field, key]) => {
    const r = bridgeConvert(values[key], 'BRL', rates, at, 'legacy-product-projection');
    if (r.conversion) conversions.push(r.conversion);
    return [field, Number(r.value.amount)];
  }));
  return { ...product, ...compatibility, moneyPrices: book, moneyCompatibility: { schemaVersion: 2, at, conversions,
    purpose: 'legacy-product-projection', sourceRevision: book.revision },
    ...(previous ? { moneyPriceAudit: [...(product.moneyPriceAudit || []), { actor, at, before: previous, after: book }] } : {}) };
}
export function projectProductMoney(product, rates, at) {
  if (!product.moneyPrices) return product;
  const projected = Object.fromEntries(Object.keys(fields).map(field => [field,
    Number(bridgeConvert(nativeProductValue(product, field), 'BRL', rates, at, 'pos-price-projection').value.amount)]));
  return { ...product, ...projected };
}
export function formatProductMoney(product, field, currency, rates, locale, at) {
  return formatMoney(bridgeConvert(nativeProductValue(product, field), currency, rates, at).value, { locale });
}
export function productMargin(product, rates, at) {
  const sale = nativeProductValue(product, 'precoBRL');
  const cost = bridgeConvert(nativeProductValue(product, 'custoBRL'), sale.currency, rates, at, 'margin').value;
  if (compare(sale, money('0', sale.currency, 'margin')) <= 0) return '0';
  return multiply(divide(subtract(sale, cost), sale.amount), '100', { scale: 1 }).amount;
}
export function priceFromMargin(costText, marginText, form, { locale, rates, at }) {
  const cost = parseMoneyInput(String(costText || '0'), form.moneyCostCurrency, { locale, source: 'cost-input' });
  const margin = parseMoneyInput(String(marginText || '0'), 'BRL', { locale, source: 'percent-input' }).amount;
  const percent = money(margin, 'BRL', 'percent-input');
  if (compare(percent, money('100', 'BRL', 'percent-input')) >= 0) fail('MONEY_MARGIN', 'Margem deve ser menor que 100%.');
  const converted = bridgeConvert(cost, form.moneyPriceCurrency, rates, at, 'price-from-cost').value;
  const result = divide(multiply(converted, '100'), subtract(money('100', 'BRL', 'percent-input'), percent).amount);
  return moneyInputText(quantize(result, form.moneyPriceCurrency === 'PYG' ? 0 : 2).value, locale);
}
export function decorateMoneySale(sale, { currency, rates, locale, discountText, resolvePaymentAccount, changeAccountId }) {
  const at = sale.createdAt;
  const original = (item, type) => {
    // Price actually negotiated in the POS wins over catalogue price.
    if (type === 'price') {
      if (item.moneyEnteredPrice) return assertMoney(item.moneyEnteredPrice);
      for (const key of ['sale', 'wholesale', 'price3']) {
        const native = item.moneyPrices?.values?.[key];
        if (native && Number(bridgeConvert(native, 'BRL', rates, at, 'verify-negotiated-price').value.amount) === Number(item.precoPraticadoBRL)) return assertMoney(native);
      }
      return bridgeConvert(money(legacyDecimal(item.precoPraticadoBRL), 'BRL', `sale:${sale.id}:negotiated-price`), currency, rates, at, 'sale-price').value;
    }
    return money(legacyDecimal(item.custoNaVendaBRL ?? item.custoBRL), 'BRL', `sale:${sale.id}:book-cost`);
  };
  const items = sale.itens.map(item => ({ id: String(item.id), quantity: String(item.qtd), unitPrice: original(item, 'price'), unitCost: original(item, 'cost') }));
  const currencies = [...new Set(items.flatMap(item => [item.unitPrice.currency, item.unitCost.currency]).concat(sale.pagamentos.map(p => p.moedaOrigem),sale.moedaTrocoInfo?[sale.moedaTrocoInfo]:[]))];
  const quotes = currencies.filter(c => c !== currency).map(c => quoteFromConfiguredRates(c, currency, rates, at));
  const snapshot = createCommercialSnapshot({ tenantId: sale.moneyTenantId, id: sale.id, actor: sale.finalizadoPorId || sale.vendedorId,
    createdAt: at, kind: sale.tipoDocumento === 'venda' ? 'sale' : sale.tipoDocumento === 'pre_pedido' ? 'preorder' : 'quotation', currency, items,
    discount: parseMoneyInput(String(discountText || '0'), currency, { locale, source: `sale:${sale.id}:discount` }), quotes });
  // The compatibility engine may contain binary dust; compare at native settlement precision.
  const legacyTotal = quantize(bridgeConvert(money(legacyDecimal(sale.totalBRL), 'BRL', 'legacy-total'), currency, rates, at).value, currency === 'PYG' ? 0 : 2).value;
  if (compare(snapshot.total, legacyTotal) !== 0) fail('MONEY_TOTAL_MISMATCH', 'Totais divergentes: operação preservada para conferência.');
  const settlement = sale.tipoDocumento === 'venda' ? reconcilePayment({ document: snapshot, appliedAt: at, quotes,
    payments: sale.pagamentos.map(p => ({ id: String(p.id), method: p.formaId, accountId: resolvePaymentAccount ? resolvePaymentAccount(p) : p.accountId,
      amount: money(legacyDecimal(p.valorOriginal), p.moedaOrigem, `sale:${sale.id}:payment:${p.id}`) })),
    change: Number(sale.trocoOriginal) > 0 ? [{ id: `${sale.id}:change`, accountId: changeAccountId,
      amount: money(legacyDecimal(sale.trocoOriginal), sale.moedaTrocoInfo, `sale:${sale.id}:change`) }] : [] }) : null;
  if (settlement && compare(quantize(settlement.outstanding, currency === 'PYG' ? 0 : 2).value, money('0', currency, 'validation')) !== 0)
    fail('MONEY_SETTLEMENT_MISMATCH', 'Pagamento/troco não fecha na moeda da venda. Nenhum lançamento foi confirmado.');
  return { ...sale, moedaComercial: currency, totaisComerciais: { total: Number(snapshot.total.amount), desconto: Number(snapshot.discount.amount) },
    moneySnapshot: snapshot, moneySettlement: settlement ? {...settlement,
      settlementDecision:'settled-at-native-precision',settlementScale:currency==='PYG'?0:2,
      roundingResidual:settlement.outstanding} : null };
}
