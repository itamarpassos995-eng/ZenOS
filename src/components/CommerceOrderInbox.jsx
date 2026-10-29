import React,{useCallback,useEffect,useRef,useState} from 'react';

// Central de pedidos fora do Firestore. O token Firebase Auth existente só
// autentica o proprietário; nenhum getDoc/getDocs/onSnapshot é usado.
export default function CommerceOrderInbox({
  lojaId,aberto,onFechar,onContagem,onCarregarNoPdv,onAbrirFilaAntiga,obterToken
}){
  const [pedidos,setPedidos]=useState([]);
  const [falha,setFalha]=useState('');
  const [carregando,setCarregando]=useState(false);
  const [abrindoId,setAbrindoId]=useState('');
  const [arquivarId,setArquivarId]=useState('');
  const [novoAviso,setNovoAviso]=useState('');
  const knownRef=useRef(null);
  const tokenGetter=useRef(obterToken);
  tokenGetter.current=obterToken;
  const atualizar=useCallback(async()=>{
    if(!lojaId)return;
    try{
      const bearer=await tokenGetter.current?.();
      if(!bearer)throw Error('Sessão indisponível');
      const r=await fetch('/api/commerce/inbox',{method:'GET',
        headers:{Authorization:'Bearer '+bearer,'Accept':'application/json'},
        cache:'no-store',credentials:'omit'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw Error('Não foi possível consultar os pedidos');
      const list=Array.isArray(data.pedidos)?data.pedidos:[];
      const ids=new Set(list.map(p=>p.id));
      if(knownRef.current){
        const novos=list.filter(p=>!knownRef.current.has(p.id));
        if(novos.length)setNovoAviso(novos.length===1?
          'Novo pedido online recebido!':novos.length+' novos pedidos online!');
      }
      knownRef.current=ids;
      setPedidos(list);
      setFalha('');
      onContagem?.(list.length);
    }catch{
      setFalha('A fila de pedidos está indisponível. Nenhum pedido foi confirmado.');
      onContagem?.(0);
    }
  },[lojaId,onContagem]);
  useEffect(()=>{
    knownRef.current=null;setPedidos([]);onContagem?.(0);
    if(!lojaId)return;
    void atualizar();
    const timer=setInterval(()=>{if(!document.hidden)void atualizar();},30000);
    const focus=()=>void atualizar();
    window.addEventListener('focus',focus);
    return()=>{clearInterval(timer);window.removeEventListener('focus',focus);};
  },[lojaId,atualizar]);
  useEffect(()=>{if(aberto)void atualizar();},[aberto,atualizar]);

  const solicitacao=async(id,acao)=>{
    if(abrindoId)return;
    setAbrindoId(id);setFalha('');
    try{
      const token=await tokenGetter.current?.();
      if(!token)throw Error('Sessão expirada');
      const q='/api/commerce/inbox?id='+encodeURIComponent(id);
      const r=await fetch(q,{method:acao==='carregar'?'GET':'PATCH',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:acao==='carregar'?undefined:JSON.stringify({acao:'arquivar'}),
        credentials:'omit',cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw Error('O pedido não pôde ser recuperado. Tente novamente.');
      if(acao==='carregar'){
        if(!data.pedido?.id||!Array.isArray(data.pedido.itens))
          throw Error('Pedido sem itens válidos');
        onCarregarNoPdv?.(data.pedido);
      }else{
        setArquivarId('');
        await atualizar();
      }
    }catch(err){setFalha(String(err.message||'Falha ao processar pedido'));}
    finally{setAbrindoId('');}
  };

  return <>
    {!!novoAviso&&!aberto&&
      <button type="button" onClick={()=>{setNovoAviso('');onFechar?.('abrir');}}
        style={{position:'fixed',zIndex:3000,right:18,bottom:90,padding:'12px 18px',
          color:'#fff',background:'#0369a1',border:'1px solid #7dd3fc',
          borderRadius:12,boxShadow:'0 12px 36px #0007',cursor:'pointer'}}>
        🛒 {novoAviso} <strong>Ver pedidos</strong>
      </button>}
    {aberto&&<div className="no-print" role="presentation"
      style={{position:'fixed',inset:0,zIndex:2200,background:'rgba(2,6,23,.84)',
        backdropFilter:'blur(6px)',display:'grid',placeItems:'center',padding:12}}>
      <section role="dialog" aria-modal="true" aria-label="Pedidos da loja online"
        style={{background:'#0b1426',border:'1px solid #0284c7',borderRadius:18,
          color:'#e2e8f0',width:'100%',maxWidth:660,maxHeight:'90vh',overflowY:'auto',
          padding:20,boxShadow:'0 25px 70px #0009'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <div><div style={{color:'#22d3ee',fontSize:11,fontWeight:900,letterSpacing:1.6}}>
            ZENOS COMMERCE</div>
            <h2 style={{fontSize:20,margin:'4px 0 0'}}>🛒 Pedidos da Loja Online</h2></div>
          <button type="button" aria-label="Fechar pedidos" onClick={()=>{setNovoAviso('');onFechar?.();}}
            style={{border:'1px solid #334155',background:'#020617',
              color:'#fff',borderRadius:9,padding:'8px 12px',cursor:'pointer'}}>✕</button>
        </div>
        <p style={{fontSize:12,color:'#94a3b8',margin:'12px 0 18px'}}>
          Pedidos recebidos no servidor. Confira preços e estoque ao finalizar no caixa.
        </p>
        {falha&&<p role="alert" style={{padding:12,color:'#fecaca',
          background:'#450a0a',borderRadius:8}}>{falha}</p>}
        {carregando&&<p>Atualizando pedidos…</p>}
        {!pedidos.length&&!falha&&<div style={{padding:28,textAlign:'center',
          border:'1px dashed #334155',borderRadius:12,color:'#94a3b8'}}>
          Nenhum pedido pendente no momento.
        </div>}
        <div style={{display:'grid',gap:10}}>
          {pedidos.map(p=><article key={p.id}
            style={{border:'1px solid #0e7490',borderRadius:12,
              padding:14,background:'#071b31',display:'grid',gap:9}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
              <strong style={{fontSize:14}}>📦 {p.id}</strong>
              <span style={{fontSize:11,color:'#67e8f9'}}>{p.criadoEm?new Date(p.criadoEm).toLocaleString('pt-BR'):''}</span>
            </div>
            {arquivarId===p.id?
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:12}}>Arquivar somente após conferir o atendimento?</span>
                <button type="button" disabled={!!abrindoId} onClick={()=>void solicitacao(p.id,'arquivar')}
                  style={{padding:10,border:0,borderRadius:7,color:'#fff',background:'#b45309'}}>Confirmar</button>
                <button type="button" onClick={()=>setArquivarId('')}
                  style={{padding:10,border:'1px solid #64748b',borderRadius:7,
                    color:'#fff',background:'transparent'}}>Voltar</button>
              </div>:
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button type="button" disabled={!!abrindoId} onClick={()=>void solicitacao(p.id,'carregar')}
                  style={{padding:'11px 15px',border:0,borderRadius:8,
                    color:'#fff',background:'#059669',fontWeight:800,cursor:'pointer'}}>
                  {abrindoId===p.id?'Carregando…':'🛒 Abrir no Caixa'}
                </button>
                <button type="button" disabled={!!abrindoId} onClick={()=>setArquivarId(p.id)}
                  style={{padding:'10px 14px',border:'1px solid #475569',
                    borderRadius:8,color:'#cbd5e1',background:'transparent',cursor:'pointer'}}>Arquivar</button>
              </div>}
          </article>)}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',
          alignItems:'center',gap:8,marginTop:18,flexWrap:'wrap'}}>
          <button type="button" onClick={()=>void atualizar()} style={{padding:10,
            border:'1px solid #0284c7',background:'#082f49',color:'#fff',
            borderRadius:9,cursor:'pointer'}}>↻ Atualizar</button>
          <button type="button" onClick={onAbrirFilaAntiga} style={{padding:10,
            border:'1px solid #475569',background:'transparent',color:'#cbd5e1',
            borderRadius:9,cursor:'pointer'}}>Ver pré-pedidos anteriores</button>
        </div>
      </section>
    </div>}
  </>;
}