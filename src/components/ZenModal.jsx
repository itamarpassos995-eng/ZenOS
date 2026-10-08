import React from 'react';

const PALETA = {
  info: { borda: '#38bdf8', fundo: '#082f49', botao: '#0284c7', icone: 'ℹ️' },
  warning: { borda: '#f59e0b', fundo: '#2b1704', botao: '#d97706', icone: '⚠️' },
  danger: { borda: '#f43f5e', fundo: '#2e0a16', botao: '#e11d48', icone: '⛔' },
  success: { borda: '#10b981', fundo: '#022c22', botao: '#059669', icone: '✅' },
};

export default function ZenModal({ aberto, variante='info', titulo='ZenOS', mensagem='', detalhes=[], confirmarTexto='OK', cancelarTexto='Cancelar', onConfirmar, onCancelar, apenasConfirmar=false, children }) {
  if (!aberto) return null;
  const c = PALETA[variante] || PALETA.info;
  const listaDetalhes = Array.isArray(detalhes)
    ? detalhes
    : (detalhes == null || String(detalhes).length === 0 ? [] : [String(detalhes)]);
  return <div style={{position:'fixed',inset:0,zIndex:20000,background:'rgba(2,6,23,.88)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
    <div style={{width:'100%',maxWidth:520,background:'#0b1120',border:`1px solid ${c.borda}`,borderRadius:24,boxShadow:'0 30px 80px rgba(0,0,0,.65)',overflow:'hidden',color:'#fff'}}>
      <div style={{display:'flex',alignItems:'center',gap:14,padding:'20px 22px',background:`linear-gradient(135deg, ${c.fundo}, #0b1120)`}}>
        <img src="/logo-zenos.png?v=4" alt="ZenOS" style={{width:48,height:48,objectFit:'contain'}}/>
        <div style={{flex:1}}><div style={{fontSize:10,fontWeight:900,letterSpacing:2,color:c.borda}}>ZENOS • SISTEMA DE GESTÃO</div><div style={{fontSize:19,fontWeight:900,marginTop:3}}>{c.icone} {titulo}</div></div>
      </div>
      <div style={{padding:'20px 22px'}}>
        {mensagem && <div style={{fontSize:14,lineHeight:1.55,color:'#e2e8f0',whiteSpace:'pre-line'}}>{mensagem}</div>}
        {listaDetalhes.length>0 && <div style={{marginTop:14,background:'#020617',border:'1px solid #1e293b',borderRadius:14,padding:14,display:'flex',flexDirection:'column',gap:8}}>{listaDetalhes.map((x,i)=><div key={i} style={{fontSize:12,color:'#cbd5e1'}}>{x}</div>)}</div>}
        {children}
      </div>
      <div style={{display:'flex',gap:10,padding:'16px 22px 20px',borderTop:'1px solid #1e293b'}}>
        {!apenasConfirmar && <button onClick={onCancelar} style={{flex:1,padding:12,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#cbd5e1',fontWeight:900,cursor:'pointer'}}>{cancelarTexto}</button>}
        <button onClick={onConfirmar} style={{flex:1,padding:12,borderRadius:10,border:'none',background:c.botao,color:'#fff',fontWeight:900,cursor:'pointer'}}>{confirmarTexto}</button>
      </div>
    </div>
  </div>;
}
