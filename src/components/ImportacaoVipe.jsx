import React,{useState} from 'react';
import {auth} from '../firebase';
import {normalizarProduto,normalizarCliente} from '../data';
import {detectarConflitosIdentidadeProdutos} from '../core/productIdentity';
const EMAIL='vipeagropecuaria@gmail.com';
const CODIGO_EXIBIDO='qntfleq9';
const SCHEMAS={
 produtos:['id_origen','descripcion','costo_original','precio_original','existencia_migracao'],
 clientes:['id_origen','codigo_o_nombre'],
 fornecedores:['id_origen','nombre']
};
function lerCSV(texto){
 const lines=texto.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
 if(!lines.length)throw Error('Arquivo vazio.');
 const parse=line=>{const a=[];let s='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++;}else q=!q;}else if(c===';'&&!q){a.push(s.trim());s='';}else s+=c;}a.push(s.trim());return a;};
 const keys=parse(lines.shift());return lines.map((line,i)=>{const cols=parse(line);if(cols.length!==keys.length)throw Error('Colunas inconsistentes na linha '+(i+2));return Object.fromEntries(keys.map((key,j)=>[key,cols[j]]));});
}
function dinheiro(v,modo){const s=String(v||'').trim();if(!/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:[.,]\d+)?$/.test(s))throw Error('Preço inválido: '+s);return Number(modo==='milhar'?s.replace(/,/g,''):s.replace(',','.'));}
export default function ImportacaoVipe({userId,operadorAtivo,patenteUsuario,produtos,setProdutos,clientes,setClientes,fornecedores,setFornecedores,commitOperacaoNegocio,taxaPYG}){
 const [arquivos,setArquivos]=useState({}),[modo,setModo]=useState(''),[confirmacao,setConfirmacao]=useState(''),[status,setStatus]=useState(''),[ocupado,setOcupado]=useState(false);
 const email=String(auth.currentUser?.email||'').toLowerCase();
 if(email!==EMAIL)return null;
 const autorizado=Boolean(userId)&&String(auth.currentUser?.uid||'')===String(userId)&&email===EMAIL&&(patenteUsuario==='gerencia'||operadorAtivo?.permissoes?.admin===true);
 const carregar=async(tipo,file)=>{if(!file)return;try{const rows=lerCSV(await file.text());const missing=SCHEMAS[tipo].filter(k=>!(k in (rows[0]||{})));if(missing.length)throw Error('Colunas ausentes: '+missing.join(', '));const ids=rows.map(r=>r.id_origen);if(ids.some(x=>!x)||new Set(ids).size!==ids.length)throw Error('IDs ausentes ou duplicados no arquivo.');setArquivos(prev=>({...prev,[tipo]:rows}));setStatus(tipo+': '+rows.length+' registros validados.');}catch(e){setStatus('ERRO: '+e.message);setArquivos(prev=>({...prev,[tipo]:undefined}));}};
 const importar=async()=>{
  if(ocupado||!autorizado)return;
  setOcupado(true);setStatus('Validando...');
  try{
   if(confirmacao!=='IMPORTAR VIPE')throw Error('Digite IMPORTAR VIPE para autorizar.');
   if(!['milhar','decimal'].includes(modo))throw Error('Confirme o padrão de preços.');
   if(['produtos','clientes','fornecedores'].some(k=>!arquivos[k]))throw Error('Selecione os três CSVs preparados.');
   if(!Number.isFinite(Number(taxaPYG))||Number(taxaPYG)<=0)throw Error('Câmbio PYG/BRL inválido na loja.');
   if(produtos.length||clientes.length||fornecedores.length)throw Error('A loja não está vazia. Importação bloqueada para evitar conflitos.');
   if(auth.currentUser?.email?.toLowerCase()!==EMAIL||String(auth.currentUser?.uid||'')!==String(userId||''))throw Error('Sessão ou ID da loja não corresponde à VIPE.');
   const p=arquivos.produtos.map(r=>normalizarProduto({
    id:'VIPE-PROD-'+r.id_origen,sku:r.codigo_barras||'VIPE-'+r.id_origen,nome:r.descripcion,
    grupo:r.categoria||'Geral',custoBRL:dinheiro(r.costo_original,modo)/Number(taxaPYG),
    precoBRL:dinheiro(r.precio_original,modo)/Number(taxaPYG),
    estoque:Math.max(0,Number(String(r.existencia_migracao).replace(',','.'))),
    ativo:true,inativo:false,arquivado:false,oculto:false,
    origemMigracao:'VIPE-FPX',idOrigemMigracao:r.id_origen
   })));
   if(p.some(x=>!x.nome||!x.sku||!Number.isFinite(x.precoBRL)||!Number.isFinite(x.custoBRL)||!Number.isFinite(x.estoque)))throw Error('Produto incompleto.');
   if(detectarConflitosIdentidadeProdutos(p).length)throw Error('IDs de produto repetidos.');
   const skus=p.map(x=>x.sku.toUpperCase());if(new Set(skus).size!==skus.length)throw Error('SKUs repetidos.');
   const c=arquivos.clientes.map(r=>normalizarCliente({
     id:'VIPE-CLI-'+r.id_origen,nome:r.codigo_o_nombre,pais:'PY',tipoDocumento:'RUC',limiteCreditoBRL:0,saldoDevedorBRL:0,
     origemMigracao:'VIPE-FPX',idOrigemMigracao:r.id_origen
   }));
   const f=arquivos.fornecedores.map(r=>({
     id:'VIPE-FORN-'+r.id_origen,nome:r.nombre,pais:'PY',telefone:r.dato_4||'',documento:'',
     origemMigracao:'VIPE-FPX',idOrigemMigracao:r.id_origen
   }));
   if(c.some(x=>!x.nome)||f.some(x=>!x.nome))throw Error('Cliente ou fornecedor sem nome.');
   const r=await commitOperacaoNegocio({operationKey:'vipe-fpx-inicial-v1',changes:[
    {field:'produtos',value:p,storageSuffix:'produtos'},
    {field:'clientes',value:c,storageSuffix:'clientes'},
    {field:'fornecedores',value:f,storageSuffix:'fornecedores'}
   ]});
   if(!r?.cloudOk)throw r?.error||Error('Servidor não confirmou a migração.');
   setProdutos(r.values?.produtos||p);setClientes(r.values?.clientes||c);setFornecedores(r.values?.fornecedores||f);
   setStatus('CONFIRMADO: '+p.length+' produtos, '+c.length+' clientes e '+f.length+' fornecedores. Confira no PDV.');
   setConfirmacao('');
  }catch(e){setStatus('IMPORTAÇÃO NÃO CONFIRMADA: '+(e?.message||String(e)));}
  finally{setOcupado(false);}
 };
 return <section style={{border:'1px solid #eab308',padding:18,borderRadius:12,marginBottom:20,background:'#111827'}}>
 <h3>Importação controlada — VIPE Agropecuária</h3>
 <p>Destino: {email}. ID da loja: {String(userId||'não identificado')} (código informado na tela: {CODIGO_EXIBIDO}). Somente nesta conta, com permissão de gerência.</p>
 <p>Para evitar duplicações, só permite importar em loja completamente vazia. Estoques negativos ficam em zero.</p>
 {!autorizado?<p>Permissão de gerência necessária. Nenhuma gravação disponível.</p>:<>
 {['produtos','clientes','fornecedores'].map(k=><label key={k} style={{display:'block',margin:'10px 0'}}>{k}: <input type="file" accept=".csv,text/csv" onChange={e=>carregar(k,e.target.files?.[0])}/>{arquivos[k]?.length||0} registros</label>)}
 <label>Formato do preço original: <select value={modo} onChange={e=>setModo(e.target.value)}><option value="">Selecione</option><option value="milhar">10,000 significa 10.000 guaranis</option><option value="decimal">10,000 significa 10 guaranis</option></select></label>
 <p>Câmbio configurado: {String(taxaPYG)} PYG por BRL. Os valores serão convertidos à moeda interna BRL.</p>
 <label>Confirmação: <input value={confirmacao} placeholder="IMPORTAR VIPE" onChange={e=>setConfirmacao(e.target.value)}/></label>
 <button disabled={ocupado||confirmacao!=='IMPORTAR VIPE'} onClick={importar} style={{display:'block',padding:12,marginTop:12}}>{ocupado?'Importando...':'Importar os três cadastros'}</button>
 </>}
 <p role="status">{status}</p>
 </section>;
}
