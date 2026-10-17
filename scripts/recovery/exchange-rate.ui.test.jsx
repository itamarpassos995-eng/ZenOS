import {test,expect} from 'vitest';
import {exchangeRateSnapshotsEqual} from '../../src/core/exchangeRateGuard.js';
test('Cotacoes: ordem dos campos nao bloqueia o caixa, mudanca real continua bloqueada',()=>{
 const source={BRL:1,EUR:0.16,PYG:1300,USD:0.18};
 expect(exchangeRateSnapshotsEqual(source,{BRL:1,USD:0.18,EUR:0.16,PYG:1300})).toBe(true);
 expect(exchangeRateSnapshotsEqual(source,{...source,USD:0.19})).toBe(false);
 expect(exchangeRateSnapshotsEqual(source,{BRL:1,EUR:0.16,PYG:1300})).toBe(false);
 expect(exchangeRateSnapshotsEqual(source,{...source,USD:NaN})).toBe(false);
});
