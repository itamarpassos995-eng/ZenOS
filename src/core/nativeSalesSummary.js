/**
 * Read-only day summary. Only contractual values marked as independently
 * native are counted as native sales. Legacy BRL and refunds with no native
 * proof are separate pending items, NEVER exchanged at today's rate.
 */
export function resumirVendasNativas(vendas=[],moedaPadrao='BRL',obterContabilBRL=()=>0){
  const moedas=['BRL','PYG','USD','EUR'];
  const totais=Object.fromEntries(moedas.map(m=>[m,0]));
  let documentosNativos=0,pendentes=0,legadoContabilBRL=0;
  for(const v of vendas){
    const nominal=Number(v?.totalOriginal);
    const comprovada=v?.versaoMonetaria===1 && moedas.includes(v.moedaDocumento) &&
      Number.isFinite(nominal) && nominal>=0 && (!v.devolucoes||v.devolucoes.length===0) &&
      v.estado==='concluida';
    if(comprovada){totais[v.moedaDocumento]+=nominal;documentosNativos++;}
    else{pendentes++;const cont=Number(obterContabilBRL(v));if(Number.isFinite(cont))legadoContabilBRL+=cont;}
  }
  const casas=moedaPadrao==='PYG'?1:100;
  return {moedaPadrao,valorNativoComprovado:Math.round((totais[moedaPadrao]||0)*casas)/casas,
    totaisPorMoeda:totais,documentosNativos,documentosPendentes:pendentes,
    legadoContabilBRL:Math.round((legadoContabilBRL+Number.EPSILON)*100)/100,
    parcial:pendentes>0||Object.entries(totais).some(([m,v])=>m!==moedaPadrao&&v>0)};
}
