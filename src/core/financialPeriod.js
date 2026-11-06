import { intervaloCaixa } from './cashAuditHistory.js';
import { obterDataRegistro, parseZenOSDate } from './dates.js';
export function financialPeriod(period='hoje',now=new Date(),from='',to='') {
 try {return intervaloCaixa(period,now,from,to);}catch{return null;}
}
export function withinFinancialPeriod(record,range,{payment=false}={}) {
 if(!range)return false;
 const date=payment?parseZenOSDate(record.dataPagamento):obterDataRegistro(record);
 return !!date&&+date>=Date.parse(range.inicio)&&+date<Date.parse(range.fim);
}
