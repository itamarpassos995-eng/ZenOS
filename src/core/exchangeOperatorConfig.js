import { interpretarValorMonetario } from './cashMoneyInput.js';
import { money, divide, quantize } from './money.js';
import { legacyDecimal } from './moneyProductBridge.js';

// Same input convention as the existing ZenOS exchange dialog:
// USD/EUR are BRL per foreign unit; PYG is foreign units per BRL.
export function exchangeFromOperatorInputs(inputs) {
  const parsed = {};
  for (const code of ['USD','EUR','PYG']) {
    const r = interpretarValorMonetario(inputs[code], code === 'PYG' ? 'PYG' : 'BRL');
    if (!r.ok || r.valor <= 0) throw Object.assign(new Error(r.erro || 'Informe cotações positivas.'), { code:'MONEY_OPERATOR_RATE' });
    parsed[code] = legacyDecimal(r.valor);
  }
  return {
    schemaVersion:1, convention:'BRL-per-USD_EUR__PYG-per-BRL', inputs:parsed,
    rates:{ BRL:1, USD:divide(money('1','BRL','exchange-input'),parsed.USD,{scale:18}).amount,
      EUR:divide(money('1','BRL','exchange-input'),parsed.EUR,{scale:18}).amount, PYG:Number(parsed.PYG) },
  };
}
export function operatorInputsFromRates(rates) {
  const inverse = code => quantize(divide(money('1','BRL','exchange-display'),legacyDecimal(rates[code]),{scale:18}),2).value.amount;
  return {USD:inverse('USD'),EUR:inverse('EUR'),PYG:legacyDecimal(rates.PYG)};
}
export function displayOperatorInputs(inputs) {
  const fixed = value => { const [integer,fraction='']=String(value).split('.'); return integer+'.'+fraction.padEnd(2,'0'); };
  return {USD:fixed(inputs.USD),EUR:fixed(inputs.EUR),PYG:String(inputs.PYG)};
}
