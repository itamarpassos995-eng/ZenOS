import React,{useEffect,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {obterSessaoOperadorCommerce,entrarOperadorCommerce} from '../core/commerceOperatorAuth';
import ZenCommercePortal from './ZenCommercePortal';
import ZenCommerceStudio from './ZenCommerceStudio';
// Demonstração local; nenhuma leitura ou gravação Firebase, sem dados reais.
const DEMO_PRODUTOS=[
 {id:'demo-tinta',sku:'DEMO-001',nome:'Tinta Acrílica Premium 18 L',grupo:'Tintas',precoBRL:169.9,estoque:18,estoqueVitrine:6,estoqueGalpao:12},
 {id:'demo-massa',sku:'DEMO-002',nome:'Massa Corrida 25 kg',grupo:'Preparação',precoBRL:89.9,estoque:14,estoqueVitrine:4,estoqueGalpao:10},
];
export default function ZenCommerceHomologacao(){
 const [auth]=useState(()=>{try{return obterSessaoOperadorCommerce();}catch{return null;}}),[uid,setUid]=useState(null),[loja,setLoja]=useState(null),[erro,setErro]=useState(''),[loading,setLoading]=useState(false),[reload,setReload]=useState(0),[produtoFoco,setProdutoFoco]=useState(''),[demo,setDemo]=useState(false);
 useEffect(()=>auth?onAuthStateChanged(auth,user=>setUid(user?.uid||null)):undefined,[auth]);
 useEffect(()=>{let active=true;setLoja(null);setErro('');if(uid)httpsCallable(getFunctions(auth.app,'southamerica-east1'),'commercePedidosAdmin')({action:'consultarLoja'}).then(r=>{if(active)setLoja(r.data);}).catch(e=>{if(active)setErro(e.message||'Acesso não autorizado.');});return()=>{active=false;};},[uid,auth,reload]);
 return <main className="commerce-admin-shell"><div>
  <div className="commerce-admin-heading"><div><h1>Commerce Studio</h1><p>Sua identidade, seus produtos e seus pedidos em um só lugar.</p></div></div><div className="commerce-admin-notice">HOMOLOGAÇÃO · Use somente lojas e produtos fictícios. Sem cobrança ou movimentação financeira.</div>
  {!auth&&<p>Configure o projeto Firebase de homologação para abrir este ambiente.</p>}
  {auth&&!uid&&<div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
      <button onClick={async()=>{try{setErro('');await entrarOperadorCommerce();}catch(e){setErro(e?.code==='auth/unauthorized-domain'?'Este endereço ainda não foi autorizado no Firebase de homologação. O editor de demonstração abaixo funciona sem login.':e.message);}}}>Entrar com conta individual autorizada</button>
      <button type="button" onClick={()=>{setDemo(v=>!v);setProdutoFoco('');}}>{demo?'Fechar demonstração':'Explorar editor sem login'}</button>
    </div>}
  {erro&&<div role="alert"><p>{erro}</p>{uid&&<button disabled={loading} onClick={async()=>{setLoading(true);try{await httpsCallable(getFunctions(auth.app,'southamerica-east1'),'commerceHmlBootstrap')({});setReload(x=>x+1);}catch(e){setErro(e.message||'Não foi possível preparar a loja fictícia.');}finally{setLoading(false);}}}>{loading?'Preparando...':'Preparar minha loja fictícia de teste'}</button>}</div>}
  {uid&&!loja&&!erro&&<p>Carregando loja autorizada...</p>}
  {demo&&!uid&&<section style={{marginTop:18}}>
      <div role="status" className="commerce-admin-notice">DEMONSTRAÇÃO INTERATIVA · Dados fictícios, sem upload, pagamento, publicação ou gravação na nuvem. Alterações nesta tela são temporárias.</div>
      <nav aria-label="Demonstração da Loja Online" style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0'}}>
        <button type="button" aria-pressed={!produtoFoco} onClick={()=>setProdutoFoco('')}>Configuração e layout</button>
        <button type="button" aria-pressed={produtoFoco===DEMO_PRODUTOS[0].id} onClick={()=>setProdutoFoco(DEMO_PRODUTOS[0].id)}>Editar Loja Online de um produto</button>
      </nav>
      <ZenCommerceStudio key={produtoFoco||'demo-layout'} produtoFocoId={produtoFoco||null} produtos={DEMO_PRODUTOS} regrasIniciais={{'demo-tinta':{publicado:true,fonteEstoque:'ambos',precoOnlineBRL:144.9,precoAnteriorBRL:169.9,descricaoWeb:'Cobertura uniforme e acabamento durável.'},'demo-massa':{publicado:true,fonteEstoque:'ambos'}}}/>
    </section>}
   {loja&&<><nav aria-label="Editor Commerce" style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}><button type="button" onClick={()=>setProdutoFoco('')} aria-pressed={!produtoFoco}>Layout e catálogo</button>{loja.produtos.slice(0,20).map(p=><button type="button" key={p.id} aria-pressed={produtoFoco===String(p.id)} onClick={()=>setProdutoFoco(String(p.id))}>Loja Online: {String(p.nome).slice(0,28)}</button>)}</nav><ZenCommercePortal produtos={loja.produtos} produtoFocoId={produtoFoco||null} userId={loja.lojaId} operadorAtivo={{id:uid}} nuvemSincronizada={true}/></>}
 </div></main>;
}
