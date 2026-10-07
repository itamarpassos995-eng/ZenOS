import React, { useState } from 'react';
import { db, auth } from '../firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { produtosIniciais, clientesIniciais, normalizarProduto, normalizarCliente } from '../data';
import { zenosStorage } from '../core/storage';
import { normalizarPerfilLoja, salvarPerfilLojaLocal } from '../core/storeProfile';
import ZenModal from './ZenModal';
import { ehOperadorGerencial } from '../core/accessControl';
import { criarCredencialPin, pinEhFraco } from '../core/operatorPin';
import { baixarBackupJson, coletarBackupLoja, restaurarBackupSomenteHomologacao } from '../core/backupRecovery';
import { validarBackup } from '../core/backupCore';
import { ZENOS_RUNTIME } from '../core/runtimeEnvironment';
import { notifyPersistenceStatus } from '../core/persistenceSafety';

export default function Configuracoes({ userId, operadorAtivo, perfilLojaGlobal, setPerfilLojaGlobal, produtos, setProdutos, clientes, setClientes, historicoVendas, setHistoricoVendas, caixaMovimentos, setCaixaMovimentos, despesas, setDespesas, tx, regrasDesconto, setRegrasDesconto, vendedores, setVendedores }) {
  const [modalResetAberto, setModalResetAberto] = useState(false);
  const [senhaAdmin, setSenhaAdmin] = useState('');
  const [etapaAviso, setEtapaAviso] = useState(1);
  const [carregandoReset, setCarregandoReset] = useState(false);
  const [modalZen, setModalZen] = useState(null);
  const [backupValidadoNestaSessao, setBackupValidadoNestaSessao] = useState(false);
  const [processandoBackup, setProcessandoBackup] = useState(false);
  const [arquivoBackupSelecionado, setArquivoBackupSelecionado] = useState(null);
  const avisarZen = (variante, titulo, mensagem, detalhes = []) => setModalZen({ variante, titulo, mensagem, detalhes, apenasConfirmar:true });
  const confirmarZen = ({ titulo, mensagem, detalhes = [], confirmarTexto = 'Confirmar', variante = 'warning' }) => new Promise(resolve => setModalZen({ variante, titulo, mensagem, detalhes, confirmarTexto, cancelarTexto:'Cancelar', resolver:resolve }));

  const [selProdutos, setSelProdutos] = useState(false);
  const [selClientes, setSelClientes] = useState(false);
  const [selVendas, setSelVendas] = useState(false);
  const [selCaixa, setSelCaixa] = useState(false);
  const [selDespesas, setSelDespesas] = useState(false);
  const [selTudo, setSelTudo] = useState(false);

  const [perfilLoja, setPerfilLoja] = useState(() => normalizarPerfilLoja(perfilLojaGlobal || {}));
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);

  // ESTADO PARA EDIÇÃO DE PERMISSÕES
  const [vendedorEmEdicaoId, setVendedorEmEdicaoId] = useState(null);
  const [pinEdicaoPorId, setPinEdicaoPorId] = useState({});

  const handleSelTudo = (val) => {
    setSelTudo(val); setSelProdutos(val); setSelClientes(val); setSelVendas(val); setSelCaixa(val); setSelDespesas(val);
  };

  const lidarMudancaPerfil = (campo, valor) => {
    setPerfilLoja(prev => ({ ...prev, [campo]: valor }));
  };

  const salvarPerfilLoja = async () => {
    if (!perfilLoja.nomeFantasia.trim()) return avisarZen('warning','Nome obrigatório',tx ? tx('O Nome Fantasia é obrigatório.', 'El Nombre Comercial es obligatorio.', 'Store Name is required.') : 'Nome obrigatório.');
    setSalvandoPerfil(true);
    try {
      const user = auth.currentUser;
      const perfilNormalizado = salvarPerfilLojaLocal(user?.uid, perfilLoja);
      if (setPerfilLojaGlobal) setPerfilLojaGlobal(perfilNormalizado); 
      
      if (user) {
        notifyPersistenceStatus({status:'SALVANDO',field:'configuracoes'});
        await setDoc(doc(db, "lojas", user.uid, "dados", "configuracoes"), { perfilLoja: normalizarPerfilLoja(perfilLoja), updatedAtClient: new Date().toISOString(), updatedAtServer: serverTimestamp() }, { merge: true });
        notifyPersistenceStatus({status:'SINCRONIZADO',field:'configuracoes'});
      }
      avisarZen('success','Configurações salvas',tx ? tx('Dados fiscais da loja atualizados com sucesso!', '¡Datos fiscales actualizados con éxito!', 'Fiscal data successfully updated!') : 'Dados atualizados!');
      window.location.reload(); 
    } catch (err) {
      console.error("Erro ao guardar perfil:", err);
      avisarZen('danger','Falha ao salvar','Erro ao guardar. Verifique a conexão.');
    }
    setSalvandoPerfil(false);
  };


  const exportarBackupCompleto = async () => {
    if (!userId) return avisarZen('danger','Loja não identificada','Não foi possível identificar a loja para gerar o backup.');
    setProcessandoBackup(true);
    try {
      const backup = await coletarBackupLoja({ db, userId, operadorNome: operadorAtivo?.nome || auth.currentUser?.email || 'Administrador' });
      const validacao = await validarBackup(backup);
      if (!validacao.ok) throw new Error(validacao.erros.join(' '));
      baixarBackupJson(backup);
      setBackupValidadoNestaSessao(true);
      avisarZen('success','Backup validado e exportado',`Backup íntegro. Produtos: ${validacao.counts.produtos} • Clientes: ${validacao.counts.clientes} • Vendas: ${validacao.counts.vendas}.`);
    } catch (error) {
      console.error('[ZenOS Backup]', error);
      setBackupValidadoNestaSessao(false);
      avisarZen('danger','Falha no backup',error?.message || 'Não foi possível gerar um backup validado.');
    } finally { setProcessandoBackup(false); }
  };

  const validarArquivoBackup = async (file) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const resultado = await validarBackup(parsed);
      if (!resultado.ok) throw new Error(resultado.erros.join(' '));
      setArquivoBackupSelecionado(parsed);
      avisarZen('success','Backup íntegro',`Checksum confirmado. Produtos: ${resultado.counts.produtos} • Vendas: ${resultado.counts.vendas}.`);
    } catch (error) {
      setArquivoBackupSelecionado(null);
      avisarZen('danger','Backup inválido',error?.message || 'O arquivo não passou na validação.');
    }
  };

  const restaurarBackupHomologacao = async () => {
    if (!ZENOS_RUNTIME.isHomologacao) return avisarZen('danger','Restauração bloqueada','A restauração só é permitida no ambiente de homologação.');
    if (!arquivoBackupSelecionado) return avisarZen('warning','Selecione um backup','Valide primeiro um arquivo de backup.');
    const confirmou = await confirmarZen({ titulo:'Restaurar em homologação vazia', mensagem:'Esta operação é permitida somente em uma loja de homologação vazia e não apaga registros existentes.', confirmarTexto:'Restaurar', variante:'warning' });
    if (!confirmou) return;
    setProcessandoBackup(true);
    try {
      const r = await restaurarBackupSomenteHomologacao({ db, userId, backup: arquivoBackupSelecionado });
      avisarZen('success','Restauração concluída',`Backup restaurado na homologação. Produtos: ${r.counts.produtos} • Vendas: ${r.counts.vendas}.`);
    } catch (error) {
      avisarZen('danger','Restauração bloqueada',error?.message || 'Não foi possível restaurar o backup.');
    } finally { setProcessandoBackup(false); }
  };

  const [novoVendedorNome, setNovoVendedorNome] = useState('');
  const [novoVendedorCargo, setNovoVendedorCargo] = useState('');
  const [novoVendedorSenha, setNovoVendedorSenha] = useState('');
  const [novoVendedorPercentual, setNovoVendedorPercentual] = useState('');
  const [novoVendedorPermissoes, setNovoVendedorPermissoes] = useState({
    admin: false, pdv: true, produtos: false, clientes: false, vendas: false, caixa: false, despesas: false, mesas: false, inteligencia: false
  });

  const adicionarVendedor = async () => {
    if (!novoVendedorNome.trim() || !novoVendedorSenha.trim()) return avisarZen('warning','Dados incompletos','Informe o nome e o PIN do operador.');
    if (pinEhFraco(novoVendedorSenha)) return avisarZen('warning','PIN muito previsível','Escolha um PIN diferente de admin, 1234, 0000, 1111 e sequências triviais.');
    const credencialPin = await criarCredencialPin(novoVendedorSenha);
    
    const nv = { 
      id: Date.now().toString(), 
      nome: novoVendedorNome.trim(), 
      cargo: novoVendedorCargo.trim() || 'Operador',
      ...credencialPin,
      patente: novoVendedorPermissoes.admin ? 'gerencia' : 'vendedor',
      comissaoTipo: 'venda', 
      percentual: parseFloat(novoVendedorPercentual) || 0,
      permissoes: novoVendedorPermissoes
    };

    if (setVendedores) setVendedores([...(vendedores || []), nv]);
    
    setNovoVendedorNome('');
    setNovoVendedorCargo('');
    setNovoVendedorSenha('');
    setNovoVendedorPercentual('');
    setNovoVendedorPermissoes({ admin: false, pdv: true, produtos: false, clientes: false, vendas: false, caixa: false, despesas: false, mesas: false, inteligencia: false });
    
    avisarZen('success','Operador cadastrado','Utilizador adicionado com sucesso!');
  };

  const removerVendedor = async (idParaRemover) => {
    if (String(idParaRemover) === 'admin') return avisarZen('warning','Administrador principal protegido','O administrador principal não pode ser removido. Altere o PIN se necessário.');
    if (!vendedores || vendedores.length <= 1) return avisarZen('warning','Operação bloqueada','Você não pode excluir o último utilizador do sistema.');
    const alvo=(vendedores||[]).find(v=>String(v.id)===String(idParaRemover));
    const confirmou=await confirmarZen({ titulo:'Remover operador', mensagem:`Remover ${alvo?.nome || 'este operador'} do sistema?`, confirmarTexto:'Remover', variante:'danger' });
    if (confirmou && setVendedores) setVendedores(vendedores.filter(v => String(v.id) !== String(idParaRemover)));
  };

  // 🛡️ ATUALIZA AS PERMISSÕES DE UM VENDEDOR JÁ EXISTENTE
  const atualizarPermissaoVendedor = (idVendedor, campoPermissao, valorCheckbox) => {
    if (String(idVendedor) === 'admin' && campoPermissao === 'admin' && !valorCheckbox) return avisarZen('warning','Administrador principal protegido','O administrador principal deve manter acesso total.');
    if (setVendedores) {
      const novaLista = vendedores.map(v => {
        if (v.id === idVendedor) {
          const permissoes = { ...(v.permissoes || {}), [campoPermissao]: valorCheckbox };
          return {
            ...v,
            permissoes,
            patente: campoPermissao === 'admin' ? (valorCheckbox ? 'gerencia' : (String(v.id) === 'admin' ? 'gerencia' : 'vendedor')) : v.patente
          };
        }
        return v;
      });
      setVendedores(novaLista);
    }
  };

  const atualizarPinOperador = async (operador) => {
    const novoPin = String(pinEdicaoPorId[operador.id] ?? '').trim();
    if (!novoPin || pinEhFraco(novoPin)) return avisarZen('warning','PIN inválido','Escolha um PIN com pelo menos 4 caracteres, diferente dos padrões previsíveis bloqueados.');
    const credencialPin = await criarCredencialPin(novoPin);
    if (setVendedores) setVendedores((vendedores || []).map(v => String(v.id) === String(operador.id) ? { ...v, ...credencialPin } : v));
    setPinEdicaoPorId(prev => ({ ...prev, [operador.id]: '' }));
    avisarZen('success','PIN atualizado',`PIN de ${operador.nome} atualizado com sucesso.`);
  };

  const executarResetGranular = async () => {
    if (!backupValidadoNestaSessao) return avisarZen('danger','Backup obrigatório','Antes de restaurar/limpar dados, gere e valide um backup completo nesta sessão.');
    if (!senhaAdmin) return avisarZen('warning','Senha necessária','Por favor, digite a senha da conta administradora.');
    if (!selProdutos && !selClientes && !selVendas && !selCaixa && !selDespesas) { return avisarZen('warning','Nada selecionado','Selecione pelo menos uma opção para restaurar ou limpar.'); }
    setCarregandoReset(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Utilizador não autenticado.');
      const credential = EmailAuthProvider.credential(user.email, senhaAdmin);
      await reauthenticateWithCredential(user, credential);
      const novosProdutos = selProdutos ? produtosIniciais.map((p, idx) => normalizarProduto(p, idx)) : produtos;
      const novosClientes = selClientes ? clientesIniciais.map(c => normalizarCliente(c)) : clientes;
      const novoHistoricoVendas = selVendas ? [] : historicoVendas;
      const novosCaixaMovs = selCaixa ? [] : caixaMovimentos;
      const novasDespesas = selDespesas ? [] : despesas;
      setProdutos(novosProdutos); setClientes(novosClientes); setHistoricoVendas(novoHistoricoVendas); setCaixaMovimentos(novosCaixaMovs); setDespesas(novasDespesas);
      notifyPersistenceStatus({status:'SALVANDO',field:'reset_granular'});
      await setDoc(doc(db, "lojas", user.uid, "dados", "operacao"), { produtos: novosProdutos, clientes: novosClientes, historicoVendas: novoHistoricoVendas, caixaMovimentos: novosCaixaMovs, despesas: novasDespesas, _syncMeta:{lastField:'reset_granular',updatedAtClient:new Date().toISOString(),updatedAtServer:serverTimestamp()} }, { merge: true });
      notifyPersistenceStatus({status:'SINCRONIZADO',field:'reset_granular'});
      avisarZen('success','Operação concluída','Itens selecionados limpos/restaurados com sucesso!');
      setModalResetAberto(false); setSenhaAdmin(''); setEtapaAviso(1); handleSelTudo(false);
    } catch (err) {
      console.error("Erro ao validar senha:", err);
      avisarZen('danger','Autenticação falhou','Senha incorreta ou erro de autenticação.');
    } finally {
      setCarregandoReset(false);
    }
  };

  const lidarComMudancaRegra = (campo, valor) => {
    if (!setRegrasDesconto) return;
    setRegrasDesconto(prev => {
      const atual = prev || {};
      if (campo === 'margemIdeal') {
        const ideal = Math.min(100, Math.max(0.1, Number(valor) || 0.1));
        const minimaAtual = Math.max(0, Number(atual.margemMinima ?? 15) || 0);
        return { ...atual, margemIdeal: ideal, margemMinima: Math.min(minimaAtual, ideal) };
      }
      if (campo === 'margemMinima') {
        const idealAtual = Math.max(0, Number(atual.margemIdeal ?? 30) || 0);
        const minima = Math.min(Math.max(0, Number(valor) || 0), idealAtual);
        return { ...atual, margemMinima: minima };
      }
      return { ...atual, [campo]: valor };
    });
  };

  return (
    <>
      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} detalhes={modalZen?.detalhes} confirmarTexto={modalZen?.confirmarTexto || 'OK'} cancelarTexto={modalZen?.cancelarTexto || 'Cancelar'} apenasConfirmar={!!modalZen?.apenasConfirmar} onConfirmar={()=>{ const r=modalZen?.resolver; setModalZen(null); if(r) r(true); }} onCancelar={()=>{ const r=modalZen?.resolver; setModalZen(null); if(r) r(false); }} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '1000px', margin: '0 auto' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Configurações do Sistema</h2>
        <span style={{ fontSize: '13px', color: '#64748b' }}>Gestão de equipa, rentabilidade e segurança</span>
      </div>

      <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🏛️</span>
            <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: 0 }}>
              {tx ? tx('Dados da Empresa e Fiscal', 'Datos de la Empresa y Fiscal', 'Company & Fiscal Data') : 'Dados da Empresa'}
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#020617', padding: '4px 8px', borderRadius: '10px', border: '1px solid #334155' }}>
            <span style={{ fontSize: '16px' }}>{perfilLoja.pais === 'BR' ? '🇧🇷' : perfilLoja.pais === 'PY' ? '🇵🇾' : '🌐'}</span>
            <select value={perfilLoja.pais} onChange={(e) => lidarMudancaPerfil('pais', e.target.value)} style={{ backgroundColor: 'transparent', color: '#f8fafc', fontSize: '12px', fontWeight: 900, border: 'none', outline: 'none', cursor: 'pointer' }}>
              <option value="BR" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Brasil (BR)</option>
              <option value="PY" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Paraguay (PY)</option>
              <option value="OUTRO" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Outro (Global)</option>
            </select>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Nome Fantasia (Loja)</label>
            <input type="text" value={perfilLoja.nomeFantasia} onChange={(e) => lidarMudancaPerfil('nomeFantasia', e.target.value)} placeholder="Ex: Zênite Atacadão" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc', padding: '12px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>{perfilLoja.pais === 'PY' ? 'Razón Social' : 'Razão Social (Legal)'}</label>
            <input type="text" value={perfilLoja.razaoSocial} onChange={(e) => lidarMudancaPerfil('razaoSocial', e.target.value)} placeholder="Ex: Zênite Tintas LTDA" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc', padding: '12px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>{perfilLoja.pais === 'BR' ? 'CNPJ' : perfilLoja.pais === 'PY' ? 'RUC' : 'NIF / Documento Fiscal'}</label>
            <input type="text" value={perfilLoja.documento1} onChange={(e) => lidarMudancaPerfil('documento1', e.target.value)} placeholder={perfilLoja.pais === 'BR' ? '00.000.000/0001-00' : '8000000-1'} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#38bdf8', fontWeight: 900, padding: '12px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>{perfilLoja.pais === 'BR' ? 'Inscrição Estadual (IE)' : perfilLoja.pais === 'PY' ? 'Timbrado Fiscal' : 'Registo Comercial'}</label>
            <input type="text" value={perfilLoja.documento2} onChange={(e) => lidarMudancaPerfil('documento2', e.target.value)} placeholder={perfilLoja.pais === 'PY' ? '12345678' : 'Isento ou Número'} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc', padding: '12px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Telemóvel / WhatsApp</label>
            <input type="text" value={perfilLoja.telefone} onChange={(e) => lidarMudancaPerfil('telefone', e.target.value)} placeholder="+55 11 99999-9999" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#34d399', fontWeight: 900, padding: '12px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Cidade / Região</label>
            <input type="text" value={perfilLoja.cidade} onChange={(e) => lidarMudancaPerfil('cidade', e.target.value)} placeholder="Ex: São Paulo - SP" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc', padding: '12px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Endereço Completo (Para Recibos)</label>
            <input type="text" value={perfilLoja.endereco} onChange={(e) => lidarMudancaPerfil('endereco', e.target.value)} placeholder="Rua das Tintas, 123 - Centro" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc', padding: '12px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>

          <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #334155', paddingTop: '16px' }}><h4 style={{margin:'0 0 12px',color:'#38bdf8'}}>🖨️ Personalização de Impressão</h4><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}><div><label style={{fontSize:11,color:'#94a3b8',fontWeight:800}}>Largura / Papel</label><select value={perfilLoja.larguraRecibo||'80'} onChange={e=>lidarMudancaPerfil('larguraRecibo',e.target.value)} style={{width:'100%',padding:10,borderRadius:8,background:'#020617',border:'1px solid #334155',color:'#fff'}}><option value="58">Térmica 58 mm</option><option value="80">Térmica 80 mm</option><option value="A4">A4</option></select></div><div><label style={{fontSize:11,color:'#94a3b8',fontWeight:800}}>Cabeçalho livre</label><input value={perfilLoja.cabecalhoRecibo||''} onChange={e=>lidarMudancaPerfil('cabecalhoRecibo',e.target.value)} placeholder="Ex: Obrigado por comprar conosco" style={{width:'100%',boxSizing:'border-box',padding:10,borderRadius:8,background:'#020617',border:'1px solid #334155',color:'#fff'}}/></div></div><div style={{display:'flex',gap:18,flexWrap:'wrap',marginTop:12}}><label><input type="checkbox" checked={perfilLoja.mostrarLogoRecibo!==false} onChange={e=>lidarMudancaPerfil('mostrarLogoRecibo',e.target.checked)}/> Mostrar logo</label><label><input type="checkbox" checked={perfilLoja.mostrarEnderecoRecibo!==false} onChange={e=>lidarMudancaPerfil('mostrarEnderecoRecibo',e.target.checked)}/> Mostrar endereço</label><label><input type="checkbox" checked={perfilLoja.mostrarTelefoneRecibo!==false} onChange={e=>lidarMudancaPerfil('mostrarTelefoneRecibo',e.target.checked)}/> Mostrar telefone</label></div></div>

          <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #334155', paddingTop: '16px' }}>
            <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Mensagem de Rodapé (Impressões)</label>
            <input type="text" value={perfilLoja.rodapeRecibo} onChange={(e) => lidarMudancaPerfil('rodapeRecibo', e.target.value)} placeholder="Ex: Volte sempre! Siga o nosso Instagram @loja" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#cbd5e1', padding: '12px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button 
            onClick={salvarPerfilLoja}
            disabled={salvandoPerfil}
            style={{ background: 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#ffffff', padding: '14px 32px', borderRadius: '12px', fontSize: '14px', fontWeight: 900, cursor: salvandoPerfil ? 'not-allowed' : 'pointer', opacity: salvandoPerfil ? 0.7 : 1, transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.4)' }}
          >
            {salvandoPerfil ? 'A Guardar...' : (tx ? tx('Guardar Informações Fiscais', 'Guardar Datos Fiscales', 'Save Fiscal Data') : 'Guardar Informações Fiscais')}
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🚥</span>
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: 0 }}>Semáforo de Lucratividade</h3>
        </div>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
          Proteja o seu lucro. O sistema avalia a margem real de cada venda em tempo real <b>(Total da Venda vs Custo dos Produtos)</b>.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <div style={{ backgroundColor: '#021e15', border: '1px solid rgba(16,185,129,0.3)', padding: '16px', borderRadius: '12px' }}>
            <span style={{ display: 'block', color: '#10b981', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>🟢 Margem Saudável (Ideal)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#cbd5e1', fontSize: '13px' }}>A partir de</span>
              <input 
                type="number" min="0.1" max="100" step="0.1" value={regrasDesconto?.margemIdeal ?? 30} 
                onChange={(e) => lidarComMudancaRegra('margemIdeal', parseFloat(e.target.value) || 0)}
                style={{ width: '60px', backgroundColor: '#020617', border: '1px solid #10b981', color: '#34d399', fontWeight: 900, padding: '8px', borderRadius: '6px', textAlign: 'center', outline: 'none' }}
              />
              <span style={{ color: '#cbd5e1', fontSize: '13px' }}>%</span>
            </div>
            <span style={{ display: 'block', color: '#64748b', fontSize: '10px', marginTop: '8px' }}>Lucro excelente. O PDV liberta a venda sem alertas.</span>
          </div>

          <div style={{ backgroundColor: '#2b1704', border: '1px solid rgba(245,158,11,0.3)', padding: '16px', borderRadius: '12px' }}>
            <span style={{ display: 'block', color: '#f59e0b', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>🟡 Margem em Alerta</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#cbd5e1', fontSize: '13px' }}>Limite mínimo amarelo:</span>
              <input 
                type="number" min="0" max="100" step="0.1" value={regrasDesconto?.margemMinima ?? 15} 
                onChange={(e) => lidarComMudancaRegra('margemMinima', parseFloat(e.target.value) || 0)}
                style={{ width: '60px', backgroundColor: '#020617', border: '1px solid #f59e0b', color: '#fbbf24', fontWeight: 900, padding: '8px', borderRadius: '6px', textAlign: 'center', outline: 'none' }}
              />
              <span style={{ color: '#cbd5e1', fontSize: '13px' }}>%</span>
            </div>
            <span style={{ display: 'block', color: '#64748b', fontSize: '10px', marginTop: '8px' }}>Avisa o vendedor que o lucro final está a ficar baixo.</span>
          </div>

          <div style={{ backgroundColor: '#2e0a16', border: '1px solid rgba(225,29,72,0.3)', padding: '16px', borderRadius: '12px' }}>
            <span style={{ display: 'block', color: '#e11d48', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>🔴 Margem Crítica / Prejuízo</span>
            <span style={{ color: '#fca5a5', fontSize: '12px', fontWeight: 800 }}>Abaixo de {regrasDesconto?.margemMinima ?? 15}%</span>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
              <input 
                type="checkbox" checked={regrasDesconto?.exigirSenhaVermelho ?? true} 
                onChange={(e) => lidarComMudancaRegra('exigirSenhaVermelho', e.target.checked)}
                style={{ accentColor: '#e11d48', width: '16px', height: '16px' }}
              />
              <span style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>Bloquear e Exigir Senha</span>
            </label>

            {(regrasDesconto?.exigirSenhaVermelho ?? true) && (
              <div style={{ marginTop: '12px', padding:'10px 12px', borderRadius:8, border:'1px solid rgba(225,29,72,.25)', background:'rgba(225,29,72,.06)', color:'#cbd5e1', fontSize:11, lineHeight:1.45 }}>
                A autorização usa o <b>PIN de qualquer Administrador/Gerência cadastrado</b>. Altere esses PINs em “Gestão de Equipa e Controlo de Acessos”.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🔐</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: 0 }}>Gestão de Equipa e Controlo de Acessos</h3>
        </div>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
          Crie utilizadores, defina cargos customizados e marque exatamente quais os módulos do sistema cada um pode aceder.
        </p>

        <div style={{ backgroundColor: '#020617', padding: '20px', borderRadius: '16px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, marginBottom: '6px', display: 'block' }}>Nome do Operador</label>
              <input type="text" value={novoVendedorNome} onChange={e => setNovoVendedorNome(e.target.value)} placeholder="Ex: João Silva" style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '10px 14px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, marginBottom: '6px', display: 'block' }}>Cargo / Título (Livre)</label>
              <input type="text" value={novoVendedorCargo} onChange={e => setNovoVendedorCargo(e.target.value)} placeholder="Ex: Caixa Sênior, Estoquista..." style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#38bdf8', padding: '10px 14px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, marginBottom: '6px', display: 'block' }}>Senha / PIN de Acesso</label>
              <input type="text" autoComplete="one-time-code" name="zenos-new-operator-pin" data-lpignore="true" data-1p-ignore="true" value={novoVendedorSenha} onChange={e => setNovoVendedorSenha(e.target.value)} placeholder="Novo PIN seguro" style={{ width: '100%', WebkitTextSecurity:'disc', backgroundColor: '#0b1120', border: '1px solid #14b8a6', borderRadius: '8px', color: '#34d399', fontWeight: 900, padding: '10px 14px', outline: 'none', fontSize: '13px', textAlign: 'center', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, marginBottom: '6px', display: 'block' }}>% Comissão (Opcional)</label>
              <input type="number" value={novoVendedorPercentual} onChange={e => setNovoVendedorPercentual(e.target.value)} placeholder="0%" style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#fbbf24', fontWeight: 900, padding: '10px 14px', outline: 'none', fontSize: '13px', textAlign: 'center', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ borderTop: '1px dashed #334155', paddingTop: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, color: '#e2e8f0', marginBottom: '12px', display: 'block', textTransform: 'uppercase' }}>Permissões de Acesso do Utilizador</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                <input type="checkbox" checked={novoVendedorPermissoes.admin} onChange={e => setNovoVendedorPermissoes({...novoVendedorPermissoes, admin: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} />
                <span style={{ color: '#fb7185', fontWeight: 900 }}>Administrador (Acesso Total)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                <input type="checkbox" disabled={novoVendedorPermissoes.admin} checked={novoVendedorPermissoes.admin || novoVendedorPermissoes.pdv} onChange={e => setNovoVendedorPermissoes({...novoVendedorPermissoes, pdv: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#10b981' }} />
                🛒 Operar PDV (Vendas)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                <input type="checkbox" disabled={novoVendedorPermissoes.admin} checked={novoVendedorPermissoes.admin || novoVendedorPermissoes.mesas} onChange={e => setNovoVendedorPermissoes({...novoVendedorPermissoes, mesas: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#10b981' }} />
                🍽 Gestão de Mesas
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                <input type="checkbox" disabled={novoVendedorPermissoes.admin} checked={novoVendedorPermissoes.admin || novoVendedorPermissoes.produtos} onChange={e => setNovoVendedorPermissoes({...novoVendedorPermissoes, produtos: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#0284c7' }} />
                📦 Cadastrar/Editar Produtos
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                <input type="checkbox" disabled={novoVendedorPermissoes.admin} checked={novoVendedorPermissoes.admin || novoVendedorPermissoes.clientes} onChange={e => setNovoVendedorPermissoes({...novoVendedorPermissoes, clientes: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#d97706' }} />
                👥 Clientes e Fiados
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                <input type="checkbox" disabled={novoVendedorPermissoes.admin} checked={novoVendedorPermissoes.admin || novoVendedorPermissoes.caixa} onChange={e => setNovoVendedorPermissoes({...novoVendedorPermissoes, caixa: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }} />
                💵 Movimentar Caixa
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                <input type="checkbox" disabled={novoVendedorPermissoes.admin} checked={novoVendedorPermissoes.admin || novoVendedorPermissoes.vendas} onChange={e => setNovoVendedorPermissoes({...novoVendedorPermissoes, vendas: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }} />
                📑 Ver Histórico
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                <input type="checkbox" disabled={novoVendedorPermissoes.admin} checked={novoVendedorPermissoes.admin || novoVendedorPermissoes.despesas} onChange={e => setNovoVendedorPermissoes({...novoVendedorPermissoes, despesas: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }} />
                💸 Lançar Despesas
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                <input type="checkbox" disabled={novoVendedorPermissoes.admin} checked={novoVendedorPermissoes.admin || novoVendedorPermissoes.inteligencia} onChange={e => setNovoVendedorPermissoes({...novoVendedorPermissoes, inteligencia: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#a855f7' }} />
                📊 Painel Executivo
              </label>
            </div>
          </div>
          <button onClick={adicionarVendedor} type="button" style={{ backgroundColor: '#4f46e5', border: 'none', color: '#fff', padding: '14px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.3)' }}>+ Adicionar Utilizador ao Sistema</button>
        </div>

        {/* LISTA DE UTILIZADORES COM EDIÇÃO DE PERMISSÃO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Utilizadores Cadastrados ({vendedores?.length || 0})</span>
          {vendedores?.map(v => (
            <div key={v.id} style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#020617', padding: '16px', borderRadius: '12px', border: '1px solid #1e293b', gap: '16px' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#f8fafc', fontWeight: 900, fontSize: '15px' }}>{v.nome}</span>
                    <span style={{ fontSize: '10px', backgroundColor: ehOperadorGerencial(v) ? 'rgba(244, 63, 94, 0.2)' : 'rgba(56, 189, 248, 0.2)', color: ehOperadorGerencial(v) ? '#fb7185' : '#38bdf8', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>{v.cargo || 'Operador'}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>PIN: <strong style={{ color: '#fff' }}>••••</strong> • Comissão: <strong style={{ color: '#34d399' }}>{v.percentual}%</strong></span>
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setVendedorEmEdicaoId(vendedorEmEdicaoId === v.id ? null : v.id)} style={{ backgroundColor: '#1e293b', border: 'none', color: '#cbd5e1', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontWeight: 800, fontSize: '12px' }}>
                    {vendedorEmEdicaoId === v.id ? 'Ocultar Permissões' : '✏️ Editar Permissões'}
                  </button>
                  <button onClick={() => removerVendedor(v.id)} style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontWeight: 800, fontSize: '12px' }}>Remover</button>
                </div>
              </div>

              {/* BLOCO QUE EXPANDE PARA EDITAR PERMISSÕES */}
              {vendedorEmEdicaoId === v.id && (
                <div style={{ borderTop: '1px dashed #334155', paddingTop: '16px', animation: 'fadeIn 0.3s' }}>
                  <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800, textTransform: 'uppercase', marginBottom: '12px', display: 'block' }}>Ajustar Acessos Deste Usuário:</span>
                  <div style={{display:'flex',gap:8,alignItems:'end',flexWrap:'wrap',marginBottom:14,padding:12,border:'1px solid #1e293b',borderRadius:10,background:'#0b1120'}}>
                    <div style={{flex:'1 1 220px'}}><label style={{display:'block',fontSize:10,color:'#94a3b8',fontWeight:900,marginBottom:5}}>ALTERAR PIN DE ACESSO</label><input type="text" autoComplete="one-time-code" name={`zenos-pin-${v.id}`} data-lpignore="true" data-1p-ignore="true" value={pinEdicaoPorId[v.id] || ''} onChange={e=>setPinEdicaoPorId(prev=>({...prev,[v.id]:e.target.value}))} placeholder="Novo PIN (mín. 4)" style={{width:'100%',boxSizing:'border-box',padding:'9px 11px',borderRadius:8,border:'1px solid #334155',background:'#020617',color:'#fff',WebkitTextSecurity:'disc'}} /></div>
                    <button type="button" onClick={()=>atualizarPinOperador(v)} style={{padding:'9px 14px',borderRadius:8,border:'none',background:'#0d9488',color:'#fff',fontWeight:900,cursor:'pointer'}}>Salvar novo PIN</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                      <input type="checkbox" checked={ehOperadorGerencial(v)} disabled={String(v.id)==='admin'} onChange={e => atualizarPermissaoVendedor(v.id, 'admin', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} />
                      <span style={{ color: '#fb7185', fontWeight: 900 }}>Administrador (Acesso Total)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                      <input type="checkbox" disabled={v.permissoes?.admin || false} checked={v.permissoes?.admin || v.permissoes?.pdv || false} onChange={e => atualizarPermissaoVendedor(v.id, 'pdv', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#10b981' }} />
                      🛒 Operar PDV (Vendas)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                      <input type="checkbox" disabled={v.permissoes?.admin || false} checked={v.permissoes?.admin || v.permissoes?.mesas || false} onChange={e => atualizarPermissaoVendedor(v.id, 'mesas', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#10b981' }} />
                      🍽 Gestão de Mesas
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                      <input type="checkbox" disabled={v.permissoes?.admin || false} checked={v.permissoes?.admin || v.permissoes?.produtos || false} onChange={e => atualizarPermissaoVendedor(v.id, 'produtos', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#0284c7' }} />
                      📦 Produtos e Compras
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                      <input type="checkbox" disabled={v.permissoes?.admin || false} checked={v.permissoes?.admin || v.permissoes?.clientes || false} onChange={e => atualizarPermissaoVendedor(v.id, 'clientes', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#d97706' }} />
                      👥 Clientes e Fiados
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                      <input type="checkbox" disabled={v.permissoes?.admin || false} checked={v.permissoes?.admin || v.permissoes?.caixa || false} onChange={e => atualizarPermissaoVendedor(v.id, 'caixa', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }} />
                      💵 Movimentar Caixa
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                      <input type="checkbox" disabled={v.permissoes?.admin || false} checked={v.permissoes?.admin || v.permissoes?.vendas || false} onChange={e => atualizarPermissaoVendedor(v.id, 'vendas', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }} />
                      📑 Ver Histórico
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                      <input type="checkbox" disabled={v.permissoes?.admin || false} checked={v.permissoes?.admin || v.permissoes?.despesas || false} onChange={e => atualizarPermissaoVendedor(v.id, 'despesas', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }} />
                      💸 Lançar Despesas
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                      <input type="checkbox" disabled={v.permissoes?.admin || false} checked={v.permissoes?.admin || v.permissoes?.inteligencia || false} onChange={e => atualizarPermissaoVendedor(v.id, 'inteligencia', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#a855f7' }} />
                      📊 Painel Executivo
                    </label>
                  </div>
                </div>
              )}

            </div>
          ))}
        </div>
      </div>

      <div style={{ backgroundColor:'#082f49', border:'1px solid #0ea5e9', borderRadius:'20px', padding:'24px', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div><h3 style={{margin:0,color:'#7dd3fc',fontSize:'18px',fontWeight:900}}>🛡️ Backup e Recuperação V1</h3><div style={{fontSize:'12px',color:'#bae6fd',marginTop:'5px'}}>Exporte um backup com checksum antes de operações críticas. Restauração é bloqueada em produção.</div></div>
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
          <button disabled={processandoBackup} onClick={exportarBackupCompleto} style={{padding:'11px 16px',borderRadius:'10px',border:'none',background:'#0284c7',color:'#fff',fontWeight:900,cursor:'pointer'}}>⬇ Exportar Backup Validado</button>
          <label style={{padding:'11px 16px',borderRadius:'10px',border:'1px solid #38bdf8',background:'#020617',color:'#7dd3fc',fontWeight:900,cursor:'pointer'}}>✓ Validar arquivo<input type="file" accept="application/json,.json" onChange={e=>validarArquivoBackup(e.target.files?.[0])} style={{display:'none'}}/></label>
          {ZENOS_RUNTIME.isHomologacao && <button disabled={!arquivoBackupSelecionado || processandoBackup} onClick={restaurarBackupHomologacao} style={{padding:'11px 16px',borderRadius:'10px',border:'1px solid #f59e0b',background:'#451a03',color:'#fbbf24',fontWeight:900,cursor:'pointer'}}>↩ Restaurar em Homologação Vazia</button>}
        </div>
        <div style={{fontSize:'11px',color:backupValidadoNestaSessao?'#86efac':'#fbbf24',fontWeight:800}}>{backupValidadoNestaSessao?'✓ Backup desta sessão exportado e validado. Operações de limpeza podem prosseguir após reautenticação.':'⚠ A zona de limpeza fica protegida até existir backup validado nesta sessão.'}</div>
      </div>

      <div style={{ backgroundColor: '#2e0a16', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fb7185', margin: 0 }}>Zona de Perigo • Limpeza</h3>
        </div>
        <div>
          <button onClick={() => { setEtapaAviso(1); setSenhaAdmin(''); handleSelTudo(false); setModalResetAberto(true); }} type="button" style={{ backgroundColor: '#e11d48', border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', fontSize: '13px' }}>🗑️ Gerir Restauração</button>
        </div>
      </div>

      {modalResetAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.9)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '2px solid #f43f5e', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '480px', color: '#fff', boxSizing: 'border-box' }}>
            {etapaAviso === 1 ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}><span style={{ fontSize: '36px' }}>🛡️</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f43f5e', margin: '6px 0 0 0' }}>Escolha o que Restaurar</h3></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#020617', padding: '16px', borderRadius: '14px', border: '1px solid #1e293b', marginBottom: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 900, color: '#fbbf24', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}><input type="checkbox" checked={selTudo} onChange={e => handleSelTudo(e.target.checked)} style={{ width: '16px', height: '16px' }} />🔥 Selecionar Todos</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0' }}><input type="checkbox" checked={selProdutos} onChange={e => setSelProdutos(e.target.checked)} style={{ width: '16px', height: '16px' }} />📦 Produtos</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0' }}><input type="checkbox" checked={selClientes} onChange={e => setSelClientes(e.target.checked)} style={{ width: '16px', height: '16px' }} />👥 Clientes</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0' }}><input type="checkbox" checked={selVendas} onChange={e => setSelVendas(e.target.checked)} style={{ width: '16px', height: '16px' }} />📑 Vendas</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0' }}><input type="checkbox" checked={selCaixa} onChange={e => setSelCaixa(e.target.checked)} style={{ width: '16px', height: '16px' }} />💵 Caixa</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0' }}><input type="checkbox" checked={selDespesas} onChange={e => setSelDespesas(e.target.checked)} style={{ width: '16px', height: '16px' }} />💸 Despesas</label>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setModalResetAberto(false)} type="button" style={{ flex: 1, padding: '12px', backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={() => { if (!selProdutos && !selClientes && !selVendas && !selCaixa && !selDespesas) { return avisarZen('warning','Nada selecionado','Selecione ao menos uma categoria.'); } setEtapaAviso(2); }} type="button" style={{ flex: 1, padding: '12px', backgroundColor: '#e11d48', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer' }}>Avançar ➔</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}><span style={{ fontSize: '32px' }}>🔐</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: '8px 0 0 0' }}>Senha Administrador</h3></div>
                <input type="password" autoComplete="current-password" name="zenos-account-password-confirmation" value={senhaAdmin} onChange={e => setSenhaAdmin(e.target.value)} placeholder="••••••••••••" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #f43f5e', borderRadius: '12px', color: '#fff', padding: '14px', outline: 'none', fontSize: '16px', boxSizing: 'border-box', marginBottom: '24px', textAlign: 'center' }} autoFocus />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setEtapaAviso(1)} type="button" style={{ flex: 1, padding: '14px', backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>Voltar</button>
                  <button disabled={carregandoReset} onClick={executarResetGranular} type="button" style={{ flex: 2, padding: '14px', backgroundColor: carregandoReset ? '#475569' : '#e11d48', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: carregandoReset ? 'not-allowed' : 'pointer' }}>Confirmar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
