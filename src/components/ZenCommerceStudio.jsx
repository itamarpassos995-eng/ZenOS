import React, { useMemo, useState } from 'react';
import { aparenciaPadrao, normalizarAparencia, normalizarBanner } from '../core/commerceAppearance';
import { criarUrlPublica, estadoPlanoCommerce } from '../core/commerceTenancy';
import { normalizarRegraPublicacao, projetarCatalogoPublico } from '../core/commerceCatalog';
import { montarGaleriaProduto, MAX_FOTOS_ADICIONAIS, prepararFotoProduto, urlFotoSegura } from '../core/commerceImages';

// Editor isolado. A ativação/publicação REAL pertence ao backend da loja.
// Sem callbacks de persistência, oferece prévia e download de rascunho local.
const tile = { background:'#10212e', border:'1px solid #294152',borderRadius:16,padding:16 };
const lbl = {fontSize:11,fontWeight:800,letterSpacing:'.07em',textTransform:'uppercase',color:'#aac0cc'};
const campo = {width:'100%',boxSizing:'border-box',borderRadius:9,border:'1px solid #344f5f',background:'#0d1b27',color:'#f8fafc',padding:'11px 12px',fontSize:13};
const tabStyle = ativo => ({padding:'10px 13px',borderRadius:9,border:'1px solid '+(ativo?'#ceaa72':'#344f5f'),background:ativo?'#51412e':'#0d1b27',color:ativo?'#fff1d7':'#bed2dc',fontWeight:800,fontSize:12,cursor:'pointer'});
const opcao = (value,children) => <option key={value} value={value}>{children}</option>;
const moeda = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);

export default function ZenCommerceStudio({
  produtos=[], aparenciaInicial=aparenciaPadrao, regrasIniciais={}, licenca={}, idPublico='',
  urlBase='https://lojas.zenos.com.br', onSalvarRascunho=null, onSolicitarAtivacao=null, onPublicar=null, onUploadBannerImage=null, onUploadProductImage=null,
}) {
  const [cfg,setCfg]=useState(()=>normalizarAparencia(aparenciaInicial));
  const [regras,setRegras]=useState(regrasIniciais||{});
  const [aba,setAba]=useState('aparencia');
  const [bannerId,setBannerId]=useState(cfg.banners[0]?.id||'');
  const [aviso,setAviso]=useState('');
  const [filtro,setFiltro]=useState('');
  const [carregando,setCarregando]=useState(false);
  const plano=estadoPlanoCommerce(licenca);
  const catalogo=useMemo(()=>projetarCatalogoPublico({produtos,regras,lojaAtivada:true,modoPrevia:true}),[produtos,regras]);
  const banner=cfg.banners.find(b=>b.id===bannerId)||cfg.banners[0];
  let url='Endereço atribuído após aprovação da assinatura';
  try { if(idPublico) url=criarUrlPublica({urlBase,idPublico}); } catch {}
  const atualizar=(campoNome,valor)=>setCfg(prev=>normalizarAparencia({...prev,[campoNome]:valor}));
  const atualizarBanner=(key,value)=>setCfg(prev=>normalizarAparencia({...prev,banners:prev.banners.map(b=>b.id===banner.id?{...b,[key]:value}:b)}));
  const novaBanner=()=>{
    if(cfg.banners.length>=5)return setAviso('Limite de cinco banners por loja.');
    const id='b-'+(cfg.banners.reduce((v,b)=>Math.max(v,Number(b.id?.split('-')[1])||0),0)+1);
    const b=normalizarBanner({id,titulo:'Sua nova campanha',subtitulo:'Edite sua oferta e escolha uma imagem',ativo:true,corFundo:cfg.corPrincipal},cfg.banners.length);
    setCfg(prev=>normalizarAparencia({...prev,banners:[...prev.banners,b]}));setBannerId(id);setAviso('Novo banner adicionado ao rascunho.');
  };
  const editarProduto=(id,key,valor)=>setRegras(prev=>{const atual=normalizarRegraPublicacao(prev[String(id)]||{});return {...prev,[String(id)]:{...atual,[key]:valor}};});
  const enviarFotosProduto=async(produto,arquivos)=>{
    const lista=Array.from(arquivos||[]);
    if(!lista.length)return;
    const regra=normalizarRegraPublicacao(regras[String(produto.id)]||{});
    if(lista.length+regra.galeriaImagens.length>MAX_FOTOS_ADICIONAIS)
      return setAviso(`Limite de ${MAX_FOTOS_ADICIONAIS} fotos adicionais por produto.`);
    if(typeof onUploadProductImage!=='function')
      return setAviso('Fotos extras ficam disponíveis após a ativação do armazenamento seguro. A foto do cadastro já aparece na prévia.');
    setCarregando(true);
    try {
      // Upload separado por foto, só armazena URL retornada por backend autorizado.
      const adicionadas=[];
      for(const arquivo of lista){
        const preparado=await prepararFotoProduto(arquivo);
        const r=await onUploadProductImage({produtoId:String(produto.id),...preparado});
        if(!r||!urlFotoSegura(r.url))throw new Error('O servidor não confirmou uma imagem HTTPS válida.');
        const id=String(r.id||'');
        if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id))throw new Error('O servidor retornou identificador inválido.');
        adicionadas.push({id,url:r.url,miniaturaUrl:urlFotoSegura(r.miniaturaUrl)||r.url,storagePath:String(r.storagePath||''),ordem:regra.galeriaImagens.length+adicionadas.length,alt:String(produto.nome||'').slice(0,140)});
      }
      setRegras(prev=>{
        const atual=normalizarRegraPublicacao(prev[String(produto.id)]||{});
        return {...prev,[String(produto.id)]:{...atual,galeriaImagens:[...atual.galeriaImagens,...adicionadas]}};
      });
      setAviso(`${adicionadas.length} fotos enviadas e associadas ao rascunho. A loja permanece privada.`);
    } catch(e){setAviso(e?.message||'Não foi possível enviar as fotos. Nenhum produto foi publicado.');}
    finally{setCarregando(false);}
  };
  const moverImagem=(produto,id,delta)=>setRegras(prev=>{
    const atual=normalizarRegraPublicacao(prev[String(produto.id)]||{});
    const galeria=[...atual.galeriaImagens];const i=galeria.findIndex(x=>x.id===id),j=i+delta;
    if(i<0||j<0||j>=galeria.length)return prev;
    [galeria[i],galeria[j]]=[galeria[j],galeria[i]];
    return {...prev,[String(produto.id)]:{...atual,galeriaImagens:galeria.map((x,k)=>({...x,ordem:k}))}};
  });
  const retirarImagem=(produto,id)=>setRegras(prev=>{
    const atual=normalizarRegraPublicacao(prev[String(produto.id)]||{});
    return {...prev,[String(produto.id)]:{...atual,galeriaImagens:atual.galeriaImagens.filter(x=>x.id!==id),capaImagemId:atual.capaImagemId===id?'cadastro':atual.capaImagemId}};
  });
  const exportar=()=>{
    const texto=JSON.stringify({schema:'ZENOS_COMMERCE_DRAFT_V2',aparencia:normalizarAparencia(cfg),regras},null,2);
    const blob=new Blob([texto],{type:'application/json'});
    const ref=URL.createObjectURL(blob);const link=document.createElement('a');link.href=ref;
    link.download='zenos-commerce-rascunho.json';link.click();URL.revokeObjectURL(ref);
    setAviso('Rascunho exportado. Nenhum produto foi publicado.');
  };
  const executar=async(fn,sucesso)=>{if(carregando||typeof fn!=='function')return;if(fn===onPublicar&&!catalogo.length){setAviso('Selecione pelo menos um produto na aba Produtos antes de publicar.');return;}setCarregando(true);setAviso('');try{const resultado=await fn({aparencia:normalizarAparencia(cfg),regras});if(resultado?.regras)setRegras(resultado.regras);setAviso(resultado?.aviso?sucesso+' '+resultado.aviso:sucesso);}catch(e){setAviso(e?.message||'Operação não confirmada.');}finally{setCarregando(false);}};
  const enviarImagem = async (arquivo, chave) => {
    if (!arquivo) return;
    if (!['image/jpeg','image/png','image/webp'].includes(arquivo.type) || arquivo.size > 3_000_000) {
      return setAviso('Imagem inválida. Use JPG, PNG ou WebP com até 3 MB.');
    }
    if (typeof onUploadBannerImage !== 'function') {
      return setAviso('Upload desabilitado na prévia offline. Use um link HTTPS até ativarmos o armazenamento seguro.');
    }
    setCarregando(true);
    try {
      const resultado = await onUploadBannerImage({ arquivo, bannerId:banner.id, tipo:chave });
      const url=resultado?.url;
      if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('O servidor não retornou um link HTTPS válido.');
      if(!resultado.storagePath)throw new Error('Armazenamento privado do banner não confirmado.');
      setCfg(prev=>normalizarAparencia({...prev,banners:prev.banners.map(b=>b.id===banner.id?{...b,[chave]:url,[chave+'StoragePath']:resultado.storagePath}:b)}));
      setAviso('Imagem enviada e associada ao rascunho.');
    } catch (e) {setAviso(e?.message || 'Falha no upload.');}
    finally {setCarregando(false);}
  };
  const publicado=cfg.banners.filter(b=>b.ativo);
  const destaque=cfg.banners.find(b=>b.id===bannerId)||publicado[0]||cfg.banners[0];
  const barraBotao={background:'#ccaa73',color:'#1e2a32',border:0,borderRadius:10,fontWeight:900,cursor:'pointer',padding:'12px 16px'};
  return <div style={{background:'#081621',borderRadius:22,padding:18,color:'#f8fafc',fontFamily:'Inter,system-ui,sans-serif',display:'grid',gap:17}}>
    <div style={{display:'flex',gap:12,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}}>
      <div><div style={{fontSize:11,fontWeight:900,letterSpacing:'.16em',color:'#d1ac76'}}>ZENOS COMMERCE • STUDIO</div>
        <h2 style={{fontSize:24,margin:'6px 0'}}>Minha Loja Online</h2>
        <p style={{fontSize:12,color:'#a2bac8',margin:0}}>Banners, identidade visual, catálogo seletivo e endereço exclusivo. Preview disponível antes de contratar.</p>
      </div>
      <div style={{padding:'10px 15px',borderRadius:12,border:'1px solid #4c5764',background:plano.ativo?'#143d33':'#493b26',fontSize:12,fontWeight:850}}>
        {plano.ativo?'MÓDULO ATIVO':'MÓDULO OPCIONAL — NÃO CONTRATADO'}
      </div>
    </div>
    <div style={{...tile,display:'flex',gap:12,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}}>
      <div style={{minWidth:0}}><div style={lbl}>Link exclusivo da sua loja</div>
        <div style={{marginTop:5,color:'#edf4f8',overflowWrap:'anywhere',fontSize:13}}>{url}</div>
        <small style={{color:'#93abb9'}}>O ID é reservado pelo servidor e permanece estável mesmo quando a loja muda de nome.</small>
      </div>
      <button disabled={!plano.ativo||!idPublico} onClick={async()=>{try{if(!navigator.clipboard?.writeText)throw new Error('Cópia indisponível');await navigator.clipboard.writeText(url);setAviso('Link da loja copiado.');}catch{setAviso('Cópia automática indisponível. Abra a loja e copie o endereço do navegador.');}}} style={tabStyle(plano.ativo)}>Copiar link</button>
    </div>
    <style>{'@media(max-width:1050px){.zen-commerce-layout{grid-template-columns:1fr!important}} @media(max-width:720px){.zen-commerce-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}'}</style>
    <div className="zen-commerce-layout" style={{display:'grid',gridTemplateColumns:'minmax(295px, 0.9fr) minmax(300px, 1.3fr)',gap:16,alignItems:'start'}}>
      <section style={{...tile,display:'grid',gap:15}}>
        <nav style={{display:'flex',gap:7,flexWrap:'wrap'}}>
          {[["aparencia","Aparência"],["banners","Banners"],["produtos","Produtos"],["ativacao","Assinatura"]].map(([id,text])=><button key={id} type="button" style={tabStyle(aba===id)} onClick={()=>setAba(id)}>{text}</button>)}
        </nav>
        {aba==='aparencia'&&<div style={{display:'grid',gap:12}}>
          {[["nomeLoja","Nome da loja"],["slogan","Slogan"],["textoTopo","Mensagem na faixa superior"],["etiquetaFrete","Mensagem de entrega/retirada"]].map(([key,title])=><label key={key} style={{display:'grid',gap:6}}><span style={lbl}>{title}</span><input style={campo} value={cfg[key]} maxLength={key==='nomeLoja'?65:120} onChange={e=>atualizar(key,e.target.value)}/></label>)}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[["corPrincipal","Cor principal"],["corDestaque","Cor de destaque"],["corSuperficie","Fundo"],["corTexto","Cor do texto"]].map(([key,title])=><label key={key} style={{display:'grid',gap:7}}><span style={lbl}>{title}</span><input type="color" value={cfg[key]} onChange={e=>atualizar(key,e.target.value)} style={{...campo,padding:3,height:42}}/></label>)}
          </div>
          <label style={lbl}>Produtos por linha
            <select style={{...campo,marginTop:7}} value={cfg.layoutGrade} onChange={e=>atualizar('layoutGrade',e.target.value)}><option value="3">3 produtos</option><option value="4">4 produtos</option></select>
          </label>
          {[["exibirPesquisa","Barra de pesquisa"],["exibirCategorias","Categorias"],["exibirWhatsapp","Atalho WhatsApp"]].map(([key,title])=><label key={key} style={{fontSize:12,display:'flex',alignItems:'center',gap:9}}><input type="checkbox" checked={cfg[key]} onChange={e=>atualizar(key,e.target.checked)}/>{title}</label>)}
        </div>}
        {aba==='banners'&&<div style={{display:'grid',gap:12}}>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{cfg.banners.map(b=><button key={b.id} type="button" style={tabStyle(b.id===banner?.id)} onClick={()=>setBannerId(b.id)}>{b.ativo?'●':'○'} {b.id.toUpperCase()}</button>)}
            <button type="button" style={tabStyle(false)} onClick={novaBanner}>+ Adicionar</button></div>
          {banner&&<>
            <label style={{display:'flex',gap:10,alignItems:'center',fontSize:12}}><input type="checkbox" checked={banner.ativo} onChange={e=>atualizarBanner('ativo',e.target.checked)}/> Exibir banner na loja</label>
            {[["selo","Selo / campanha"],["titulo","Título principal"],["subtitulo","Subtítulo"],["chamada","Texto do botão"],["caminho","Destino interno (ex.: /catalogo)"],["imagemDesktop","Imagem HTTPS para desktop"],["imagemMobile","Imagem HTTPS para celular"]].map(([key,title])=><label key={key} style={{display:'grid',gap:6}}><span style={lbl}>{title}</span><input style={campo} value={banner[key]||''} onChange={e=>{atualizarBanner(key,e.target.value);if(key.startsWith('imagem'))atualizarBanner(key+'StoragePath','');}} placeholder={key.startsWith('imagem')?'https://...':undefined}/></label>)}
            <label style={{display:'grid',gap:6}}><span style={lbl}>Enviar imagem (JPG, PNG ou WebP)</span><input type="file" accept="image/jpeg,image/png,image/webp" style={{...campo,fontSize:11}} disabled={carregando||!onUploadBannerImage} onChange={e=>enviarImagem(e.target.files?.[0],'imagemDesktop')}/></label>
            <label style={{display:'grid',gap:6}}><span style={lbl}>Imagem para celular (opcional)</span><input type="file" accept="image/jpeg,image/png,image/webp" style={{...campo,fontSize:11}} disabled={carregando||!onUploadBannerImage} onChange={e=>enviarImagem(e.target.files?.[0],'imagemMobile')}/></label>
            {!onUploadBannerImage&&<small>Entre com uma conta autorizada para enviar imagens.</small>}
            <label style={{display:'grid',gap:6}}><span style={lbl}>Cor de fundo quando imagem não estiver disponível</span><input type="color" value={banner.corFundo} onChange={e=>atualizarBanner('corFundo',e.target.value)} style={{...campo,padding:3,height:42}}/></label>
            <button type="button" style={{...tabStyle(false),color:'#febbbb'}} onClick={()=>{const restantes=cfg.banners.filter(b=>b.id!==banner.id);setCfg(prev=>normalizarAparencia({...prev,banners:restantes}));setBannerId(restantes[0]?.id||'');}}>Remover banner</button>
          </>}
          <small style={{color:'#9db6c4'}}>Imagens externas HTTPS nesta prévia. Upload de arquivos e otimização de imagens dependerão de armazenamento contratado e autorizado.</small>
        </div>}
        {aba==='produtos'&&<div style={{display:'grid',gap:9}}>
          <input style={campo} placeholder="Buscar produto no estoque..." value={filtro} onChange={e=>setFiltro(e.target.value)}/>
          {produtos.filter(p=>(String(p.nome||'')+String(p.sku||'')).toLowerCase().includes(filtro.toLowerCase())).slice(0,50).map(p=>{
            const regra=normalizarRegraPublicacao(regras[String(p.id)]||{});
            const fotos=montarGaleriaProduto({produto:p,regra,previa:true});
            return <div key={p.id} style={{padding:10,background:'#0b1924',border:'1px solid #263e4e',borderRadius:11,display:'grid',gap:8}}>
              <label style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:13,fontWeight:850}}><span style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}>{fotos.capa?<img src={fotos.capa.miniaturaUrl} alt={p.nome||'Produto'} style={{width:55,height:55,borderRadius:8,objectFit:'cover',background:'#283745'}}/>:<span style={{width:55,height:55,borderRadius:8,background:'#283745',display:'grid',placeItems:'center'}}>📷</span>}{String(p.nome||p.sku||p.id).slice(0,65)}</span><input type="checkbox" checked={regra.publicado} onChange={e=>editarProduto(p.id,'publicado',e.target.checked)}/></label>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
                <label style={lbl}>Origem de estoque<select value={regra.fonteEstoque} style={{...campo,marginTop:5}} onChange={e=>editarProduto(p.id,'fonteEstoque',e.target.value)}><option value="deposito">Depósito</option><option value="vitrine">Vitrine</option><option value="ambos">Ambos</option></select></label>
                <label style={lbl}>Reserva para loja<input type="number" min="0" step="1" style={{...campo,marginTop:5}} value={regra.reservaMinima} onChange={e=>editarProduto(p.id,'reservaMinima',Math.max(0,Number(e.target.value)||0))}/></label>
                <label style={lbl}>Preço online (R$)<input type="number" min="0.01" step="0.01" style={{...campo,marginTop:5}} placeholder="Padrão" value={regra.precoOnlineBRL??''} onChange={e=>editarProduto(p.id,'precoOnlineBRL',e.target.value===''?null:Math.max(.01,Number(e.target.value)||.01))}/></label>
                <label style={lbl}>Limite online<input type="number" min="0" step="1" style={{...campo,marginTop:5}} placeholder="Sem limite" value={regra.limiteOnline??''} onChange={e=>editarProduto(p.id,'limiteOnline',e.target.value===''?null:Math.max(0,Number(e.target.value)||0))}/></label>
              </div>
              <div style={{display:'grid',gap:8,background:'#10212e',padding:10,borderRadius:9,border:'1px solid #304657'}}>
                <div style={{fontSize:12,fontWeight:850,color:'#f5d5a4'}}>Galeria de imagens da loja online</div>
                <label style={{fontSize:12,display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={regra.usarFotoCadastro} onChange={e=>editarProduto(p.id,'usarFotoCadastro',e.target.checked)}/> Aproveitar automaticamente a foto cadastrada no ZenOS</label>
                {fotos.temFotoCadastro&&<div style={{fontSize:11,color:'#aed2c5'}}>Foto original preservada no cadastro. Não é necessário carregá-la novamente.</div>}
                {fotos.pendenteSincronizacao&&<div style={{fontSize:11,color:'#ffcf99'}}>Na prévia esta foto já aparece. Antes de publicar, a imagem Base64 será sincronizada com armazenamento otimizado por loja; não será incorporada à página pública como Base64.</div>}
                <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
                  {fotos.imagens.map((img,i)=><div key={img.id} style={{display:'grid',gap:4,width:96,padding:5,border:regra.capaImagemId===img.id?'2px solid #e9b873':'1px solid #395368',borderRadius:9}}>
                    <img src={img.miniaturaUrl} alt={img.alt||p.nome} style={{width:82,height:82,objectFit:'cover',borderRadius:6}}/>
                    <button type="button" onClick={()=>editarProduto(p.id,'capaImagemId',img.id)} style={{...tabStyle(false),fontSize:10,padding:5}}>{fotos.capa?.id===img.id?'★ Capa':'Definir capa'}</button>
                    {img.id!=='cadastro'&&<div style={{display:'flex',gap:2}}>
                      <button type="button" aria-label="Mover foto para esquerda" onClick={()=>moverImagem(p,img.id,-1)} disabled={i===0} style={{...tabStyle(false),padding:5,flex:1}}>←</button>
                      <button type="button" aria-label="Mover foto para direita" onClick={()=>moverImagem(p,img.id,1)} style={{...tabStyle(false),padding:5,flex:1}}>→</button>
                      <button type="button" aria-label="Remover foto adicional" onClick={()=>retirarImagem(p,img.id)} style={{...tabStyle(false),padding:5,color:'#ffb5b5',flex:1}}>×</button>
                    </div>}
                  </div>)}
                </div>
                <label style={{display:'grid',gap:6,fontSize:11,color:'#a2bac8'}}>Adicionar fotos em alta resolução (até {MAX_FOTOS_ADICIONAIS} extras)
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={carregando||typeof onUploadProductImage!=='function'||regra.galeriaImagens.length>=MAX_FOTOS_ADICIONAIS} style={{...campo,fontSize:11}} onChange={e=>{enviarFotosProduto(p,e.target.files);e.target.value='';}}/>
                </label>
                <div style={{fontSize:11,color:'#93aab8'}}>Fotos extras: JPEG, PNG ou WebP até 12 MB por arquivo. Versão premium até 1800 px e miniatura otimizada a 480 px. O upload exige o armazenamento privado configurado e não publica a loja.</div>
              </div>
            </div>;
          })}
          {!produtos.length&&<p style={{color:'#9db6c4',fontSize:12}}>Nenhum produto carregado. Esta é uma prévia isolada.</p>}
        </div>}
        {aba==='ativacao'&&<div style={{display:'grid',gap:12,fontSize:13,color:'#dae7ed'}}>
          <div><strong>Commerce é um módulo adicional.</strong><p style={{color:'#a2bac8',lineHeight:1.5}}>Sua assinatura do sistema de gestão não ativa automaticamente uma loja pública ou pagamentos. O preço deve ser informado e aceito antes da contratação.</p></div>
          <div style={{background:'#0b1924',padding:13,borderRadius:11}}>Situação: <b>{plano.status.toUpperCase()}</b><br/><small>{plano.mensagem}</small></div>
          <button type="button" disabled={typeof onSolicitarAtivacao!=='function'||carregando} style={barraBotao} onClick={()=>executar(onSolicitarAtivacao,'Solicitação de proposta registrada; nenhuma cobrança ou ativação foi realizada.')}>Solicitar proposta comercial</button>
          {typeof onSolicitarAtivacao!=='function'&&<small>Ativação indisponível nesta prévia offline. O sistema deverá abrir a contratação com preço e aceite explícito.</small>}
        </div>}
        <div style={{borderTop:'1px solid #314450',paddingTop:13,display:'grid',gap:8}}>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            <button style={{...tabStyle(false),flex:1}} onClick={exportar}>Exportar rascunho</button>
            <button disabled={typeof onSalvarRascunho!=='function'||carregando} style={{...barraBotao,flex:1}} onClick={()=>executar(onSalvarRascunho,'Rascunho privado salvo no ZenOS. A vitrine não foi publicada.')}>Salvar no ZenOS</button>
          </div>
          <button disabled={!catalogo.length||!plano.ativo||typeof onPublicar!=='function'||carregando} style={{...barraBotao,background:plano.ativo?'#8edaaf':'#445160',color:plano.ativo?'#12271f':'#bdcbd2'}} onClick={()=>executar(onPublicar,'Publicação solicitada e encaminhada ao servidor para validação.')}>Publicar loja</button>
          <div role="status" style={{fontSize:12,color:'#e3c491',minHeight:18}}>{aviso||(!catalogo.length?'Selecione produtos para habilitar a publicação.':!plano.ativo?'Prévia privada: ninguém compra ou paga nesta tela.':'')}</div>
        </div>
      </section>
      <section style={{...tile,padding:0,overflow:'hidden',background:cfg.corSuperficie,color:cfg.corTexto}}>
        <div style={{padding:'8px 15px',textAlign:'center',background:cfg.corPrincipal,color:'#fff',fontSize:10}}>{cfg.textoTopo}</div>
        <div style={{padding:'19px 22px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <b style={{fontSize:21,letterSpacing:-.8}}>{cfg.nomeLoja}</b><div style={{display:'flex',gap:16,fontSize:12}}><span>Categorias</span><span>Novidades</span><span>Carrinho ◇</span></div>
        </div>
        {cfg.exibirPesquisa&&<div style={{padding:'0 22px 18px'}}><div style={{padding:'11px 14px',border:'1px solid #dde1e2',borderRadius:40,fontSize:12,color:'#78858a'}}>Buscar produtos, marcas e categorias... ⌕</div></div>}
        <div style={{margin:'0 14px',minHeight:290,background:destaque?.corFundo||cfg.corPrincipal,color:'#fff',borderRadius:14,overflow:'hidden',position:'relative',display:'flex',alignItems:'center'}}>
          {(destaque?.imagemDesktop||destaque?.imagemMobile)&&<img alt="" src={destaque.imagemDesktop||destaque.imagemMobile} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:1}}/>}
          {(destaque?.imagemDesktop||destaque?.imagemMobile)&&<div aria-hidden="true" style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(7,17,24,.77),rgba(7,17,24,.25) 70%,transparent)'}}/>}
           <div style={{position:'relative',padding:'28px 32px',maxWidth:440}}>
            <small style={{fontWeight:900,letterSpacing:'.16em',color:'#f8e7cf'}}>{destaque?.selo||'SELEÇÃO ESPECIAL'}</small>
            <h2 style={{fontSize:'clamp(23px,3vw,35px)',lineHeight:1.13,letterSpacing:-1,margin:'15px 0'}}>{destaque?.titulo||'Seus produtos, sua vitrine'}</h2>
            <p style={{fontSize:13,lineHeight:1.7,opacity:.88}}>{destaque?.subtitulo||cfg.slogan}</p>
            <span title="Ação disponível na loja publicada" style={{...barraBotao,display:'inline-block',background:cfg.corDestaque,marginTop:9,cursor:'default'}}>{destaque?.chamada||'Conhecer'}</span>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:7,marginTop:13}}>{publicado.map((b,i)=><button key={b.id} onClick={()=>setBannerId(b.id)} aria-label={'Prévia do banner '+(i+1)} style={{border:0,borderRadius:12,width:bannerId===b.id?26:7,height:7,background:bannerId===b.id?cfg.corPrincipal:'#c1c8cd',cursor:'pointer'}}/>)}</div>
        <div style={{padding:'26px 20px'}}>
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:10}}><div><small style={{color:'#8b9193',fontWeight:700}}>CURADORIA DA LOJA</small><h3 style={{fontSize:22,margin:'7px 0 20px'}}>Escolhidos para você</h3></div><span style={{fontSize:12,color:cfg.corPrincipal}}>Ver tudo →</span></div>
          <div className="zen-commerce-card-grid" style={{display:'grid',gridTemplateColumns:`repeat(${cfg.layoutGrade}, minmax(0,1fr))`,gap:10}}>
            {catalogo.slice(0,8).map((p,i)=><div key={p.skuPublico||i} style={{minWidth:0,border:'1px solid #e4e3df',borderRadius:10,overflow:'hidden',background:'#fff'}}>
              <div style={{aspectRatio:'1',display:'grid',placeItems:'center',background:['#e6d7c8','#e9e8e1','#d3dfdb','#ece2e8'][i%4],fontSize:32}}>{p.imagemUrl?<img src={p.imagemUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:['✦','◈','✳','◇'][i%4]}</div>
              <div style={{padding:9}}><div style={{fontSize:9,color:'#76818a'}}>{p.categoria}</div><div style={{fontSize:11,fontWeight:700,minHeight:30,margin:'5px 0'}}>{p.nome}</div><b style={{fontSize:12,color:cfg.corPrincipal}}>{moeda(p.precoBRL)}</b></div>
            </div>)}
          </div>
          {!catalogo.length&&<div style={{padding:28,border:'1px dashed #cbd5cf',borderRadius:10,textAlign:'center',color:'#697b76',fontSize:12}}>Sua seleção aparecerá aqui. Abra a aba <strong>Produtos</strong> e escolha os itens da loja.</div>}
          <div style={{marginTop:22,textAlign:'center',padding:14,borderRadius:10,background:'#e9edea',fontSize:11}}>{cfg.etiquetaFrete} • Atendimento seguro • Vitrine exclusiva</div>
        </div>
        <div style={{padding:20,background:cfg.corPrincipal,color:'#fff',fontSize:11,display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:7}}><span>{cfg.nomeLoja} — {cfg.slogan}</span><span>Prévia do ZenOS Commerce</span></div>
      </section>
    </div>
  </div>;
}
