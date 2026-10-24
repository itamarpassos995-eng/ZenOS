import React, { useEffect, useMemo, useRef, useState } from 'react';
import { periodoValido, resumirRecebiveis } from '../core/receivablesSummary.js';
import { buscarPaginaExtrato, buscarHistoricoIntegralCliente } from '../core/financialLedgerQueries.js';
const dataLocal=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const hoje=()=>dataLocal(new Date());
const diasAtras=dias=>{const d=new Date();d.setDate(d.getDate()-dias+1);return dataLocal(d);};
const moeda=v=>'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const botao={border:'1px solid #334155',borderRadius:8,background:'#15273b',color:'#e2e8f0',cursor:'pointer',padding:'9px 12px',fontWeight:700};
const celula={borderBottom:'1px solid #263447',padding:'11px 9px',textAlign:'left'};

export default function ContasReceber({db,userId,clientes=[],historicoVendas=[],initialClient=null,onVoltar}) {
 const [periodo,setPeriodo]=useState('7'),[inicioPersonalizado,setInicioPersonalizado]=useState(diasAtras(7));
 const [fimPersonalizado,setFimPersonalizado]=useState(hoje());
 // Nenhum resultado é selecionado/consultado automaticamente.
 // A opção de TODAS as contas em aberto exige clique explícito.
 const [consultaAtiva,setConsultaAtiva]=useState(null),[pesquisa,setPesquisa]=useState('');
 const [cliente,setCliente]=useState(initialClient),[linhas,setLinhas]=useState([]),[cursor,setCursor]=useState(null);
 const [mais,setMais]=useState(false),[estado,setEstado]=useState('nao_consultado');
 const [erro,setErro]=useState(''),[escopoCompleto,setEscopoCompleto]=useState(false);
 const [consultaLegado,setConsultaLegado]=useState(false);
 const serial=useRef(0);
 const inicio=periodo==='personalizado'?inicioPersonalizado:diasAtras(Number(periodo));
 const fim=periodo==='personalizado'?fimPersonalizado:hoje();
 const valido=periodoValido(inicio,fim);
 const resumo=useMemo(()=>{
  if(!consultaAtiva||consultaAtiva.tipo!=='periodo')return null;
  return resumirRecebiveis({
    clientes,historicoVendas,inicio:consultaAtiva.inicio,fim:consultaAtiva.fim,
  });
 },[clientes,historicoVendas,consultaAtiva]);
 const contasAbertas=useMemo(()=>{
  if(consultaAtiva?.tipo!=='abertos')return [];
  return (clientes||[]).filter(c=>Number(c?.saldoDevedorBRL||0)>0)
   .map(c=>({id:String(c.id),nome:String(c.nome||'Cliente'),
    saldo:Number(c.saldoDevedorBRL||0)}))
   .sort((a,b)=>b.saldo-a.saldo||a.nome.localeCompare(b.nome));
 },[clientes,consultaAtiva]);
 const lista=useMemo(()=>{
  const origem=consultaAtiva?.tipo==='abertos'?contasAbertas:(resumo?.vendas||[]);
  return origem.filter(x=>!pesquisa.trim()||x.nome.toLocaleLowerCase('pt-BR')
   .includes(pesquisa.trim().toLocaleLowerCase('pt-BR')));
 },[contasAbertas,resumo,consultaAtiva,pesquisa]);
 const consultarPeriodo=()=>{if(valido)setConsultaAtiva({tipo:'periodo',inicio,fim});};
 const consultarTodasAbertas=()=>setConsultaAtiva({tipo:'abertos'});
 const selecionarPeriodo=(valor)=>{setPeriodo(valor);setConsultaAtiva(null);};
 const alterarInicio=(valor)=>{setInicioPersonalizado(valor);setConsultaAtiva(null);};
 const alterarFim=(valor)=>{setFimPersonalizado(valor);setConsultaAtiva(null);};
 useEffect(()=>{serial.current++;setLinhas([]);setCursor(null);setMais(false);
  setEstado('nao_consultado');setErro('');setEscopoCompleto(false);setConsultaLegado(false);
 },[userId,cliente?.id,inicio,fim]);
 useEffect(()=>()=>{serial.current++;},[]);
 const buscar=async(reiniciar=false)=>{
  if(!cliente||!valido||estado==='carregando')return;
  const key=++serial.current;setErro('');setEstado('carregando');
  try{
   const pagina=await buscarPaginaExtrato({db,userId,clienteId:cliente.id,inicio,fim,cursor:reiniciar?null:cursor});
   if(key!==serial.current)return;
   setLinhas(prev=>{const encontrados=new Map((reiniciar?[]:prev).map(l=>[String(l.id),l]));
    for(const l of pagina.itens)encontrados.set(String(l.id),l);return [...encontrados.values()];});
   setCursor(pagina.cursor);setMais(pagina.possuiMais);setEscopoCompleto(!pagina.possuiMais);
   setConsultaLegado(false);setEstado('confirmado');
  }catch(e){if(key===serial.current){setErro(e?.message||'Consulta indisponível');setEstado('erro');}}
 };
 const legadoCompleto=async()=>{
  if(!cliente||estado==='carregando')return;
  const key=++serial.current;setErro('');setEstado('carregando');
  try{
   const retorno=await buscarHistoricoIntegralCliente({db,userId,clienteId:cliente.id});
   if(key!==serial.current)return;
   setLinhas(retorno.itens);setCursor(null);setMais(false);setEscopoCompleto(true);
   setConsultaLegado(true);setEstado('confirmado');
  }catch(e){if(key===serial.current){setErro(e?.message||'Consulta indisponível');setEstado('erro');}}
 };
 return <section style={{padding:16,maxWidth:1150,margin:'0 auto',color:'#e2e8f0'}}>
  <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
   {onVoltar && <button type="button" style={botao} onClick={onVoltar}>← Clientes e Fiado</button>}
   <h2 style={{fontSize:22,margin:'0 0 6px'}}>📆 Contas a Receber</h2>
  </div>
  <p style={{fontSize:13,color:'#94a3b8'}}>Consulte dívidas e vendas fiadas sem carregar automaticamente o extrato histórico. Dados em aberto vêm do cadastro operacional sincronizado.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'18px 0'}}>
   {[['7','7 dias'],['30','30 dias'],['personalizado','Escolher período']].map(([id,label])=>
    <button key={id} type="button" onClick={()=>selecionarPeriodo(id)} style={{...botao,background:periodo===id?'#086c67':'#15273b'}}>{label}</button>)}
   {periodo==='personalizado'&&<>
    <label style={{fontSize:12}}>Início <input aria-label="Início do período" type="date" style={botao} value={inicioPersonalizado} onChange={e=>alterarInicio(e.target.value)}/></label>
    <label style={{fontSize:12}}>Fim <input aria-label="Fim do período" type="date" style={botao} value={fimPersonalizado} onChange={e=>alterarFim(e.target.value)}/></label>
   </>}
  </div>
  {!valido&&<p role="alert" style={{color:'#fbbf24'}}>O período precisa ter entre 1 e 120 dias.</p>}
  <p style={{color:'#94a3b8',fontSize:12,margin:'2px 0 13px'}}>
    Os filtros por data referem-se à <strong>data da venda fiada</strong>.
    Vencimentos de parcelas só aparecerão quando estiverem registrados de forma confiável.
  </p>
  <div style={{display:'flex',gap:9,flexWrap:'wrap',alignItems:'center',marginBottom:15}}>
    <button type="button" style={{...botao,background:'#086c67'}} disabled={!valido}
      onClick={consultarPeriodo}>🔎 Buscar período</button>
    <button type="button" style={{...botao,background:'#15273b'}}
      onClick={consultarTodasAbertas}>Exibir todas as contas em aberto (sem filtro de data)</button>
    <input style={{...botao,flex:'1 1 190px',minWidth:0}} aria-label="Pesquisar cliente"
      value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Pesquisar cliente"/>
  </div>
  {!consultaAtiva&&<div role="status" style={{border:'1px solid #334155',background:'#101f30',
    borderRadius:12,padding:20,color:'#b5cbe0'}}>
    Nenhuma consulta selecionada. Escolha 7 dias, 30 dias ou um período de até 120 dias e clique
    em <strong>Buscar período</strong>. Para listar dívidas de qualquer época, clique expressamente
    em <strong>Exibir todas as contas em aberto</strong>.
  </div>}
  {consultaAtiva && <>
    <p style={{color:'#94a3b8',fontSize:12}}>
      {consultaAtiva.tipo==='abertos'
        ? 'Consulta explícita: dívidas atuais de todas as datas, calculadas pelos saldos operacionais já sincronizados.'
        : `Vendas fiadas realizadas entre ${consultaAtiva.inicio} e ${consultaAtiva.fim}. O valor corresponde às vendas originais, não às parcelas a vencer.`}
    </p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:15}}>
      {(consultaAtiva.tipo==='abertos'
        ? [['Total em aberto',moeda(contasAbertas.reduce((a,c)=>a+c.saldo,0))],
           ['Clientes com dívida',contasAbertas.length]]
        : [['Vendido fiado no período',moeda(resumo?.totalVendido||0)],
           ['Vendas no período',resumo?.vendas.length||0]]
      ).map(([titulo,valor])=><div key={titulo} style={{border:'1px solid #334155',
        background:'#101f30',padding:16,borderRadius:12}}>
        <div style={{fontSize:11,color:'#94a3b8'}}>{titulo}</div>
        <div style={{fontSize:21,fontWeight:800,marginTop:6}}>{valor}</div>
      </div>)}
    </div>
    <div style={{overflowX:'auto',border:'1px solid #334155',borderRadius:12}}>
      <table style={{width:'100%',borderCollapse:'collapse',minWidth:640,fontSize:12}}>
       <thead><tr>{['Cliente',consultaAtiva.tipo==='abertos'?'Saldo em aberto':'Vendido fiado',
        'Origem','Ação'].map(t=><th key={t} style={celula}>{t}</th>)}</tr></thead>
       <tbody>{lista.map(v=><tr key={consultaAtiva.tipo+v.id}>
        <td style={celula}>{v.nome}</td>
        <td style={celula}>{moeda(consultaAtiva.tipo==='abertos'?v.saldo:v.valor)}</td>
        <td style={celula}>{consultaAtiva.tipo==='abertos'?'Saldo atual':(v.data+' — '+v.id)}</td>
        <td style={celula}><button style={botao} type="button"
         disabled={consultaAtiva.tipo==='periodo'&&!v.clienteId}
         onClick={()=>setCliente({id:consultaAtiva.tipo==='abertos'?v.id:v.clienteId,nome:v.nome})}>
         Consultar extrato</button></td>
       </tr>)}
       {!lista.length&&<tr><td colSpan={4} style={celula}>Nenhum registro encontrado no filtro consultado.</td></tr>}
       </tbody>
      </table>
    </div>
  </>}
  <p style={{color:'#fbbf24',fontSize:12,marginTop:14}}>
    Parcelas e vencimentos individuais sem registro confiável não serão inventados.
    O botão de contas em aberto não faz uma leitura global do Livro Financeiro.
  </p>
  {cliente&&<div role="dialog" aria-label="Extrato do cliente" style={{position:'fixed',inset:0,zIndex:2500,background:'rgba(0,0,0,.82)',overflowY:'auto',padding:16}}>
   <div style={{maxWidth:950,margin:'4vh auto',borderRadius:13,padding:20,background:'#101b2b',border:'1px solid #334155'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}>
     <h3 style={{margin:0}}>Extrato de {cliente.nome}</h3><button style={botao} type="button" onClick={()=>setCliente(null)}>Fechar</button>
    </div>
    <p style={{color:'#94a3b8',fontSize:12}}>Período selecionado: {inicio} a {fim}. Consulta explícita ao servidor. Registros legados sem data não aparecem na pesquisa por período; use a consulta histórica vinculada para verificá-los.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
     <button style={botao} type="button" disabled={!valido||estado==='carregando'} onClick={()=>buscar(true)}>Buscar período</button>
     <button style={botao} type="button" disabled={estado==='carregando'} onClick={legadoCompleto}>Consultar lançamentos vinculados do cliente (inclui legado)</button>
    </div>
    {estado==='nao_consultado'&&<p style={{color:'#fbbf24'}} role="status">A consulta ainda não foi iniciada.</p>}
    {estado==='carregando'&&<p role="status">Consultando servidor…</p>}
    {estado==='erro'&&<p role="alert" style={{color:'#fca5a5'}}>Erro: {erro}. Nenhum resultado foi confirmado como completo.</p>}
    {estado==='confirmado'&&<p role="status" style={{color:'#a7f3d0'}}>{consultaLegado
      ? 'Histórico de lançamentos vinculados a este cliente confirmado; documentos sem clienteId exigem auditoria separada.'
      : escopoCompleto?'Páginas percorridas até o fim; atualize para conferir novos lançamentos.':'Página confirmada; outras páginas podem existir. Atualize se houve movimentação concorrente.'}</p>}
    <div style={{overflowX:'auto'}}><table style={{width:'100%',minWidth:670,borderCollapse:'collapse',fontSize:12}}>
     <thead><tr>{['Data','Tipo','Valor','Saldo após','Referência'].map(t=><th key={t} style={celula}>{t}</th>)}</tr></thead>
     <tbody>{linhas.map(l=><tr key={l.id}>
      <td style={celula}>{l.createdAt?new Date(l.createdAt).toLocaleString('pt-BR'):'Sem data'}</td>
      <td style={celula}>{l.tipo||'—'}</td><td style={celula}>{moeda(l.valor)}</td>
      <td style={celula}>{l.saldoClienteDepois==null?'—':moeda(l.saldoClienteDepois)}</td>
      <td style={celula}>{l.referenciaId||l.id}</td>
     </tr>)}</tbody>
    </table></div>
    {estado==='confirmado'&&mais&&!consultaLegado&&
     <button type="button" style={{...botao,marginTop:12}} onClick={()=>buscar(false)}>Carregar mais 50</button>}
    {estado==='confirmado'&&<button type="button" style={{...botao,marginTop:12,marginLeft:8}} onClick={()=>buscar(true)}>Atualizar consulta</button>}
   </div>
  </div>}
 </section>;
}
