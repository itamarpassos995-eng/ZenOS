/**
 * Read-only dashboard display. A BRL accounting balance is NOT evidence of a
 * native PYG, USD or EUR contractual amount. Never apply current exchange rate
 * to historical debt or silently invent nominal credit balances.
 *
 * Only a future audited per-client native debt snapshot may provide the value
 * for non-BRL stores. Until then, the card explicitly indicates missing proof.
 */
export function apurarFiadoMoedaPadrao(clientes=[],moedaPadrao='BRL'){
  const saldos=clientes.map(c=>Number(c?.saldoDevedorBRL));
  if(saldos.some((v,i)=>clientes[i]?.saldoDevedorBRL!=null&&(!Number.isFinite(v)||v<0)))
    return {status:'inconsistente',totalNativo:null,totalBRL:null,moeda:moedaPadrao};
  const totalBRL=Math.round(saldos.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0)*100)/100;
  if(!['BRL','PYG','USD','EUR'].includes(moedaPadrao))
    return {status:'inconsistente',totalNativo:null,totalBRL,moeda:moedaPadrao};
  if(moedaPadrao==='BRL')
    return {status:'confirmado',totalNativo:totalBRL,totalBRL,moeda:'BRL'};
  if(totalBRL===0)
    return {status:'confirmado',totalNativo:0,totalBRL,moeda:moedaPadrao};
  return {status:'sem_origem_nativa',totalNativo:null,totalBRL,moeda:moedaPadrao};
}
