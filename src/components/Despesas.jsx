import React, { useState, useRef } from 'react';
import ZenModal from './ZenModal';
import {db} from '../firebase';
import {doc,getDocFromServer} from 'firebase/firestore';
import {getOperationalSnapshot} from '../core/operationalRepository';
import {avaliarPagamentoExistente} from '../core/expensePaymentReconcile';

export default function Despesas({ commitOperacaoNegocio, registrarFinanceiro, caixaMovimentos = [], setCaixaMovimentos, sessaoAtiva, saldoSessaoFisicoBRL = 0, operadorAtivo, despesas, setDespesas, fmt, tx, patenteUsuario, moeda, converterParaBRL, converterDeBRL }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [despesaEmEdicao, setDespesaEmEdicao] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('pendente'); // pendente, paga, todas

  // Form states
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('Fornecedor');
  const [valorInput, setValorInput] = useState('');
  const [dataVencimento, setDataVencimento] = useState(new Date().toISOString().split('T')[0]);

  // Pagamento states
  const [modalPagamentoAberto, setModalPagamentoAberto] = useState(false);
  const [despesaParaPagar, setDespesaParaPagar] = useState(null);
  const [formaPagamento, setFormaPagamento] = useState('Dinheiro / Caixa');
  const [modalZen, setModalZen] = useState(null);
  const [opcaoExclusaoFinanceira, setOpcaoExclusaoFinanceira] = useState('ajustar');
  const salvandoDespesaRef = useRef(false);
  const [salvandoDespesa, setSalvandoDespesa] = useState(false);
  const exclusaoPendenteRef = useRef(false);
  const [exclusaoPendenteId, setExclusaoPendenteId] = useState(null);
  const avisarZen=(variante,titulo,mensagem,detalhes=[])=>setModalZen({variante,titulo,mensagem,detalhes,apenasConfirmar:true});
  const confirmarZen=({titulo,mensagem,confirmarTexto=null,variante='warning',tipo=null})=>new Promise(resolve=>setModalZen({variante,titulo,mensagem,confirmarTexto:confirmarTexto || tx('Confirmar','Confirmar','Confirm'),cancelarTexto:tx('Cancelar','Cancelar','Cancel'),tipo,resolver:resolve}));

  if (patenteUsuario !== 'gerencia') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#64748b' }}>
        <span style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</span>
        <h2 style={{ color: '#f8fafc' }}>{tx('Acesso Restrito','Acceso Restringido','Restricted Access')}</h2>
        <p>{tx('Apenas a Gerência tem acesso ao módulo financeiro de Contas a Pagar.','Solo la Gerencia tiene acceso al módulo financiero de Cuentas a Pagar.','Only Management has access to the Accounts Payable financial module.')}</p>
      </div>
    );
  }

  const abrirNovaDespesa = () => {
    setDespesaEmEdicao(null);
    setDescricao('');
    setCategoria('Fornecedor');
    setValorInput('');
    setDataVencimento(new Date().toISOString().split('T')[0]);
    setModalAberto(true);
  };

  const editarDespesa = despesa => {
    if(!despesa || despesa.status!=='pendente' || despesa.compraId || despesa.naturezaContabil==='estoque_ativo' || String(despesa.descricao||'').startsWith('Compra de Estoque - ')) {
      return avisarZen('warning','Edição exige correção financeira','Somente despesas manuais pendentes podem ser editadas. Para valores já pagos, use a remoção com ajuste do resultado, preservando o histórico.');
    }
    setDespesaEmEdicao(despesa);
    setDescricao(despesa.descricao||'');
    setCategoria(despesa.categoria||'Outros');
    const valorExibido=typeof converterDeBRL==='function' ? converterDeBRL(Number(despesa.valorBRL)||0,moeda) : Number(despesa.valorBRL)||0;
    setValorInput(Number(valorExibido).toFixed(moeda==='PYG'?0:2));
    setDataVencimento(despesa.dataVencimento||new Date().toISOString().slice(0,10));
    setModalAberto(true);
  };

  const salvarDespesa = async () => {
    if(salvandoDespesaRef.current)return;
    if(despesaEmEdicao && (despesaEmEdicao.status!=='pendente' || despesaEmEdicao.compraId || despesaEmEdicao.naturezaContabil==='estoque_ativo'))
      return avisarZen('warning','Edição bloqueada','Esta despesa não pode ser editada diretamente por ter pagamento ou vínculo com compra.');

    if (!descricao.trim()) return avisarZen('warning',tx('Descrição obrigatória','Descripción obligatoria','Description required'),tx('Informe a descrição da despesa.','Informe la descripción del gasto.','Enter the expense description.'));
    const valBRL = converterParaBRL(parseFloat(valorInput.replace(',', '.')) || 0, moeda);
    if (valBRL <= 0) return avisarZen('warning',tx('Valor inválido','Valor inválido','Invalid amount'),tx('Informe um valor válido maior que zero.','Informe un valor válido mayor que cero.','Enter a valid amount greater than zero.'));

    const novaDespesa = {
      ...(despesaEmEdicao || {}),
      id: despesaEmEdicao ? despesaEmEdicao.id : `DESP-${Date.now()}`,
      descricao,
      categoria,
      valorBRL: valBRL,
      dataVencimento,
      status: despesaEmEdicao ? despesaEmEdicao.status : 'pendente',
      dataPagamento: despesaEmEdicao ? despesaEmEdicao.dataPagamento : null,
      formaPagamento: despesaEmEdicao ? despesaEmEdicao.formaPagamento : null
    };
    const listaProposta = despesaEmEdicao
      ? despesas.map(d => d.id === despesaEmEdicao.id ? novaDespesa : d)
      : [novaDespesa, ...despesas];
    salvandoDespesaRef.current=true;
    setSalvandoDespesa(true);
    try {
      let confirmadas = listaProposta;
      if (typeof commitOperacaoNegocio === 'function') {
        const confirmado = await commitOperacaoNegocio({
          changes:[{ field:'despesas', value:listaProposta, storageSuffix:'despesas' }],
          guards:despesaEmEdicao?[{type:'entity_unchanged',field:'despesas',entityId:despesaEmEdicao.id,expected:despesaEmEdicao}]:[],
        });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou a despesa.');
        confirmadas = confirmado.values?.despesas || listaProposta;
      }
      setDespesas(confirmadas);
      setModalAberto(false);
      setDespesaEmEdicao(null);
    } catch (erro) {
      avisarZen('danger',tx('Despesa não salva','Gasto no guardado','Expense not saved'),tx('A nuvem não confirmou o lançamento. Nenhuma alteração foi considerada concluída.','La nube no confirmó el registro. Ningún cambio fue considerado concluido.','The cloud did not confirm the entry. No change was considered complete.'),[erro?.message || tx('Falha de persistência','Falla de persistencia','Persistence failure')]);
    }finally{
      salvandoDespesaRef.current=false;
      setSalvandoDespesa(false);
    }
  };

  const abrirPagamento = (despesa) => {
    setDespesaParaPagar(despesa);
    setFormaPagamento('Dinheiro / Caixa');
    setModalPagamentoAberto(true);
  };

  const pagamentoEmAndamentoRef=useRef(false);
  // Apenas quando o livro já possui o lançamento e a transação anterior
  // não deixou comprovante: nunca debitar o caixa novamente.
  const reconciliarPagamentoPreExistente = async (despesa) => {
    const [snap,livro]=await Promise.all([
      getOperationalSnapshot(db,userId),
      getDocFromServer(doc(db,'lojas',String(userId),'financeiro_livro',`DESPESA-${despesa.id}`))
    ]);
    const remoto=snap.exists()?snap.data():null;
    const lista=Array.isArray(remoto?.despesas)?remoto.despesas:null;
    if(!lista||!livro.exists())return {status:'blocked',reason:'documentos_autoritativos_indisponiveis'};
    const registros=lista.filter(d=>String(d.id)===String(despesa.id));
    if(registros.length!==1)return {status:'blocked',reason:'despesa_ausente_ou_duplicada'};
    const original=registros[0];
    if(original.status==='paga'){
      setDespesas(lista);
      return {status:'already_paid'};
    }
    if(original.status!=='pendente')return {status:'blocked',reason:'despesa_nao_pendente'};
    const resultado=avaliarPagamentoExistente({
      despesa:original,lancamento:livro.data(),movimentos:remoto.caixaMovimentos||[]
    });
    if(resultado.status!=='verified')return {status:'blocked',reason:resultado.reason};
    if(typeof commitOperacaoNegocio!=='function')
      return {status:'blocked',reason:'servico_de_commit_indisponivel'};
    const correcao=lista.map(d=>String(d.id)===String(original.id)?{
      ...d,status:'paga',dataPagamento:resultado.createdAt || d.dataPagamento || new Date().toISOString(),
      formaPagamento:livro.data().formaPagamento||d.formaPagamento||null,
      reconciliadaComLancamentoId:livro.id,
    }:d);
    const confirmado=await commitOperacaoNegocio({
      changes:[{field:'despesas',value:correcao,storageSuffix:'despesas'}],
      financialEntries:[], // nunca gravar novamente o valor do pagamento
      guards:[{type:'entity_field_equals',field:'despesas',entityId:original.id,entityKey:'id',
        property:'status',expected:'pendente',
        message:'A situação da despesa mudou em outro caixa. Recarregue antes de continuar.'}],
      operationKey:`despesa-reconciliar-pagamento:${original.id}`,
    });
    if(!confirmado?.cloudOk)return {status:'blocked',reason:confirmado?.error?.message||'confirmation_unknown'};
    setDespesas(confirmado.values?.despesas||correcao);
    return {status:'reconciled'};
  };

  const confirmarPagamento = async () => {
    if(pagamentoEmAndamentoRef.current)return;
    pagamentoEmAndamentoRef.current=true;
    try{
    const dinheiro = String(formaPagamento || '').toLowerCase().includes('dinheiro');
    const valor = Number(despesaParaPagar?.valorBRL || 0);
    if (dinheiro && !sessaoAtiva) return setModalZen({ variante:'danger', titulo:tx('Caixa fechado','Caja cerrada','Register closed'), mensagem:tx('Para pagar uma despesa em dinheiro é necessário um turno de caixa aberto.','Para pagar un gasto en efectivo es necesario un turno de caja abierto.','An open cash shift is required to pay an expense in cash.'), apenasConfirmar:true });
    if (dinheiro && valor > Number(saldoSessaoFisicoBRL || 0) + 0.001) return setModalZen({ variante:'danger', titulo:tx('Saldo insuficiente na gaveta','Saldo insuficiente en caja','Insufficient drawer balance'), mensagem:`${tx('Disponível:','Disponible:','Available:')} ${fmt(saldoSessaoFisicoBRL,'BRL')}`, detalhes:[`${tx('Despesa:','Gasto:','Expense:')} ${fmt(valor,'BRL')}`], apenasConfirmar:true });

    const createdAt = new Date().toISOString();
    const despesasPropostas = despesas.map(d => d.id === despesaParaPagar.id ? { ...d, status:'paga', dataPagamento:createdAt, formaPagamento } : d);
    const mov = dinheiro ? { id:`MOV-DESP-${despesaParaPagar.id}`, sessaoId:sessaoAtiva.id, createdAt, dataHora:new Date(createdAt).toLocaleString('pt-BR'), tipo: despesaParaPagar?.naturezaContabil === 'estoque_ativo' ? 'saida_compra' : 'saida_despesa', direcao:'saida', afetaGaveta:true, valorBRL:valor, detalhesMoedas:{BRL:valor}, descricao:despesaParaPagar.descricao, despesaId:despesaParaPagar.id, operador:operadorAtivo?.nome||'Administrador' } : null;
    const caixaProposto = mov ? [mov, ...(caixaMovimentos || [])] : caixaMovimentos;
    const financeiro = {
      id: `DESPESA-${despesaParaPagar.id}`,
      tipo: despesaParaPagar.naturezaContabil === 'estoque_ativo' ? 'pagamento_compra' : 'pagamento_despesa',
      origem: despesaParaPagar.naturezaContabil === 'estoque_ativo' ? 'despesas_compra' : 'despesas',
      referenciaId: despesaParaPagar.compraId || despesaParaPagar.id,
      valor,
      formaPagamento: dinheiro ? 'dinheiro_gaveta' : String(formaPagamento).toLowerCase().includes('pix') ? 'pix' : 'cartao_corporativo',
      createdAt,
      afetaCaixaFisico: dinheiro,
      afetaResultado: despesaParaPagar.afetaResultado !== false,
      direcao: 'saida',
      sessaoId: dinheiro ? sessaoAtiva?.id : null,
      observacao: despesaParaPagar.descricao,
      detalhes: { categoria: despesaParaPagar.categoria, naturezaContabil: despesaParaPagar.naturezaContabil || null },
      operadorId:operadorAtivo?.id || 'admin',
      operadorNome:operadorAtivo?.nome || 'Administrador',
    };

    try {
      let confirmadas = despesasPropostas;
      let caixaConfirmado = caixaProposto;
      if (typeof commitOperacaoNegocio === 'function') {
        const changes = [{ field:'despesas', value:despesasPropostas, storageSuffix:'despesas' }];
        if (mov) changes.push({ field:'caixaMovimentos', value:caixaProposto, storageSuffix:'caixa_movs' });
        const guards = dinheiro ? [
          { type:'cash_session_open', sessionId:sessaoAtiva.id },
          { type:'cash_balance_at_least', sessionId:sessaoAtiva.id, amount:valor, message:'O saldo físico do caixa mudou em outro terminal. O pagamento foi bloqueado.' },
        ] : [];
        const confirmado = await commitOperacaoNegocio({ changes, financialEntries:[financeiro], guards });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou o pagamento.');
        confirmadas = confirmado.values?.despesas || despesasPropostas;
        caixaConfirmado = confirmado.values?.caixaMovimentos || caixaProposto;
      } else if (typeof registrarFinanceiro === 'function') {
        await registrarFinanceiro(financeiro);
      }
      setDespesas(confirmadas);
      if (mov && typeof setCaixaMovimentos === 'function') setCaixaMovimentos(caixaConfirmado);
    } catch (err) {
      console.error('[ZenOS][ATT10.2] Falha no pagamento da despesa:', err);
      if(err?.code==='V2_HISTORY_COLLISION'){
        try{
          const resultado=await reconciliarPagamentoPreExistente(despesaParaPagar);
          if(resultado.status==='reconciled'||resultado.status==='already_paid'){
            setModalPagamentoAberto(false);
            setDespesaParaPagar(null);
            return avisarZen('success','Pagamento original localizado',
              resultado.status==='reconciled'
                ? 'Pagamento original confirmado no livro e, quando aplicável, no caixa. A despesa foi conciliada sem novo débito.'
                : 'Esta despesa já estava paga no servidor. A lista foi atualizada sem novo débito.');
          }
          return avisarZen('warning','Pagamento exige conferência',
            'Há um histórico anterior que não pôde ser conciliado com segurança. Nenhum novo pagamento foi registrado. Não repita antes de verificar.',
            [`Referência: DESPESA-${despesaParaPagar?.id||'?'}`,`Motivo: ${resultado.reason||'inconclusivo'}`]);
        }catch(erroConciliacao){
          return avisarZen('warning','Conciliação indisponível',
            'O lançamento anterior não pôde ser verificado no servidor. Não repita o pagamento.',
            [erroConciliacao?.message||'Sem confirmação']);
        }
      }
      return setModalZen({ variante:'danger', titulo:tx('Pagamento sem confirmação','Pago sin confirmar','Payment unconfirmed'), mensagem:tx('Não foi possível confirmar o pagamento. Ele pode existir no servidor. Consulte o histórico antes de repetir.','No se pudo confirmar el pago. Revise el historial antes de repetir.','Payment was not confirmed. Check the server history before retrying.'), detalhes:[err?.message || 'Falha de persistência'], apenasConfirmar:true });
    }

    setModalPagamentoAberto(false);
    setDespesaParaPagar(null);
    }finally{pagamentoEmAndamentoRef.current=false;}
  };

  const excluirDespesa = async (id) => {
    if(exclusaoPendenteRef.current) return;
    const alvo=(despesas||[]).find(d=>String(d.id)===String(id));
    if(!alvo || alvo.excluida) return avisarZen('warning','Despesa indisponível','O registro foi alterado. Atualize a listagem antes de continuar.');
    // Compras de estoque são obrigações associadas a estoque e nota fiscal.
    // Excluir isoladamente causaria divergência no contas a pagar e no CMV.
    if(alvo.compraId||alvo.naturezaContabil==='estoque_ativo'||String(alvo.descricao||'').startsWith('Compra de Estoque - ')) {
      return avisarZen('warning','Despesa vinculada a compra','Corrija ou cancele a compra no fluxo original, com estorno e auditoria. A exclusão isolada foi bloqueada.');
    }
    const paga=alvo.status==='paga'||Boolean(alvo.dataPagamento);
    setOpcaoExclusaoFinanceira('ajustar');
    const escolha=await confirmarZen({
      titulo:tx('Remover despesa','Quitar gasto de la lista','Remove expense'),
      mensagem:`${tx('Remover da lista','Quitar de la lista','Remove from list')} “${alvo.descricao||'este registro'}”? ${paga?'Este lançamento possui pagamento. Escolha se deseja manter seu efeito no resultado financeiro ou fazer um estorno contábil. O caixa físico não será alterado.':'Esta despesa não foi paga; ela ainda não afeta o resultado financeiro.'}`,
      confirmarTexto:tx('Confirmar remoção','Confirmar eliminación','Confirm removal'),
      variante:'warning',tipo:paga?'exclusao_financeira':null
    });
    if(!escolha) return;
    const ajustarResultado=paga&&escolha==='ajustar';
    // Exclusão reversível: manter o documento original para auditoria e
    // reconciliar os painéis pela mesma operação no servidor.
    const instante=new Date().toISOString();
    const despesasPropostas=despesas.map(d=>String(d.id)!==String(id)?d:{
      ...d,status:'excluida',excluida:true,excluidaAt:instante,
      excluidaPor:operadorAtivo?.id||'admin',financeiroMantido:paga&&!ajustarResultado,
      ajusteResultado:ajustarResultado?'estornado':'preservado',
    });
    const estorno=ajustarResultado ? [{
      id:`ESTORNO-RESULTADO-DESPESA-${alvo.id}`,
      tipo:'estorno_resultado_despesa',origem:'exclusao_despesa_manual',
      referenciaId:String(alvo.id),valor:Number(alvo.valorBRL)||0,
      direcao:'entrada',formaPagamento:'ajuste_contabil',afetaCaixaFisico:false,
      afetaResultado:alvo.afetaResultado!==false,createdAt:instante,
      sessaoId:null,operadorId:operadorAtivo?.id||'admin',
      operadorNome:operadorAtivo?.nome||'Administrador',
      observacao:`Estorno contábil de despesa excluída: ${alvo.descricao||alvo.id}. Sem movimentar caixa.`,
    }]:[];
    exclusaoPendenteRef.current = true;
    setExclusaoPendenteId(id);
    try {
      if(typeof commitOperacaoNegocio!=='function')throw new Error('Serviço de confirmação da nuvem indisponível.');
      const resultado=await commitOperacaoNegocio({
        changes:[{field:'despesas',value:despesasPropostas,storageSuffix:'despesas'}],
        financialEntries:estorno,
        guards:[{type:'entity_unchanged',field:'despesas',entityId:alvo.id,expected:alvo}],
        operationKey:`despesa-remocao:${alvo.id}`,
      });
      if(!resultado?.cloudOk)throw resultado?.error||new Error('A nuvem não confirmou a operação.');
      setDespesas(resultado.values?.despesas||despesasPropostas);
      avisarZen('success','Despesa removida',ajustarResultado
        ? 'Ajuste do resultado financeiro confirmado. O pagamento original permaneceu no histórico e o caixa físico não foi alterado.'
        : paga?'Despesa removida da lista. O resultado financeiro e o histórico de pagamento foram preservados.'
          :'Despesa não paga removida da lista. O registro original foi preservado para auditoria.');
    }catch(erro){
      avisarZen('danger','Remoção sem confirmação','A operação pode ter sido concluída no servidor. Verifique a listagem antes de repetir.',[erro?.message||'Falha de persistência']);
    }finally{
      exclusaoPendenteRef.current=false;
      setExclusaoPendenteId(null);
    }
  };

  const despesasFiltradas = despesas.filter(d => !d.excluida && d.status !== 'excluida' && (filtroStatus === 'todas' || d.status === filtroStatus));
  
  const totalFiltradoBRL = despesasFiltradas.reduce((acc, d) => acc + d.valorBRL, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} detalhes={modalZen?.detalhes} confirmarTexto={modalZen?.confirmarTexto || "OK"} cancelarTexto={modalZen?.cancelarTexto || tx('Cancelar','Cancelar','Cancel')} apenasConfirmar={!!modalZen?.apenasConfirmar} onConfirmar={()=>{const r=modalZen?.resolver;const escolha=modalZen?.tipo==='exclusao_financeira'?opcaoExclusaoFinanceira:true;setModalZen(null);if(r)r(escolha);}} onCancelar={()=>{const r=modalZen?.resolver;setModalZen(null);if(r)r(false);}}>
        {modalZen?.tipo==='exclusao_financeira' && <fieldset style={{display:'flex',flexDirection:'column',gap:12,border:'1px solid #334155',borderRadius:12,padding:14,marginTop:16}}>
          <legend style={{fontSize:12,fontWeight:800}}>Efeito no Painel Financeiro</legend>
          <label style={{display:'flex',gap:10,alignItems:'start',fontSize:13}}><input type="radio" name="zenos-opcao-exclusao" checked={opcaoExclusaoFinanceira==='manter'} onChange={()=>setOpcaoExclusaoFinanceira('manter')}/>Remover da lista e manter o valor no resultado financeiro</label>
          <label style={{display:'flex',gap:10,alignItems:'start',fontSize:13}}><input type="radio" name="zenos-opcao-exclusao" checked={opcaoExclusaoFinanceira==='ajustar'} onChange={()=>setOpcaoExclusaoFinanceira('ajustar')}/>Remover da lista e estornar o valor no resultado financeiro</label>
          <small style={{color:'#fbbf24'}}>Ajuste contábil apenas. Não devolve dinheiro ao caixa nem exclui o histórico do pagamento.</small>
        </fieldset>}
      </ZenModal>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{tx('Contas a Pagar & Despesas','Cuentas a Pagar y Gastos','Accounts Payable & Expenses')}</h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>{tx('Gestão de custos fixos, variáveis e fornecedores.','Gestión de costos fijos, variables y proveedores.','Manage fixed, variable and supplier costs.')}</span>
        </div>
        <button onClick={abrirNovaDespesa} style={{ background: 'linear-gradient(135deg, #e11d48, #be123c)', border: 'none', color: '#ffffff', padding: '12px 24px', borderRadius: '12px', fontSize: '13px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(225, 29, 72, 0.3)' }}>
          + Lançar Nova Despesa
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={() => setFiltroStatus('pendente')} style={{ flex: 1, padding: '14px', backgroundColor: filtroStatus === 'pendente' ? '#451a03' : '#0b1120', border: `1px solid ${filtroStatus === 'pendente' ? '#d97706' : '#1e293b'}`, color: filtroStatus === 'pendente' ? '#fbbf24' : '#64748b', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>⏳ {tx('Pendentes','Pendientes','Pending')}</button>
        <button onClick={() => setFiltroStatus('paga')} style={{ flex: 1, padding: '14px', backgroundColor: filtroStatus === 'paga' ? '#064e3b' : '#0b1120', border: `1px solid ${filtroStatus === 'paga' ? '#10b981' : '#1e293b'}`, color: filtroStatus === 'paga' ? '#34d399' : '#64748b', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>✅ {tx('Pagas','Pagadas','Paid')}</button>
        <button onClick={() => setFiltroStatus('todas')} style={{ flex: 1, padding: '14px', backgroundColor: filtroStatus === 'todas' ? '#1e1b4b' : '#0b1120', border: `1px solid ${filtroStatus === 'todas' ? '#6366f1' : '#1e293b'}`, color: filtroStatus === 'todas' ? '#a5b4fc' : '#64748b', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>📋 {tx('Todas as Despesas','Todos los Gastos','All Expenses')}</button>
      </div>

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', backgroundColor: '#020617' }}>
              <th style={{ padding: '16px 20px' }}>{tx('Vencimento','Vencimiento','Due Date')}</th>
              <th style={{ padding: '16px 12px' }}>{tx('Descrição','Descripción','Description')}</th>
              <th style={{ padding: '16px 12px' }}>{tx('Categoria','Categoría','Category')}</th>
              <th style={{ padding: '16px 12px', textAlign: 'right' }}>{tx('Valor (R$)','Valor (R$)','Amount (R$)')}</th>
              <th style={{ padding: '16px 12px', textAlign: 'center' }}>{tx('Status','Estado','Status')}</th>
              <th style={{ padding: '16px 20px', textAlign: 'right' }}>{tx('Ações','Acciones','Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {despesasFiltradas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>{tx('Nenhuma despesa encontrada nesta visão.','Ningún gasto encontrado en esta vista.','No expense found in this view.')}</td></tr>
            ) : (
              despesasFiltradas.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '16px 20px', color: '#cbd5e1', fontWeight: d.status === 'pendente' ? 800 : 500 }}>
                    {d.dataVencimento ? d.dataVencimento.split('T')[0].split('-').reverse().join('/') : '-'}
                  </td>
                  <td style={{ padding: '16px 12px', color: '#f8fafc', fontWeight: 700 }}>
                    {d.descricao}
                    {d.status === 'paga' && <div style={{ fontSize: '10px', color: '#10b981', marginTop: '4px' }}>Pago em: {d.dataPagamento ? d.dataPagamento.split('T')[0].split('-').reverse().join('/') : '-'} via {d.formaPagamento || '-'}</div>}
                    {d.afetaResultado === false && <div style={{ fontSize: '10px', color: '#38bdf8', marginTop: '4px', fontWeight: 800 }}>{tx('Estoque / ativo — não reduz o lucro novamente','Stock / activo — no reduce la ganancia nuevamente','Stock / asset — does not reduce profit again')}</div>}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    <span style={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', padding: '4px 8px', borderRadius: '6px', fontSize: '11px' }}>{d.categoria}</span>
                  </td>
                  <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, color: d.status === 'paga' ? '#64748b' : '#f43f5e', fontSize: '15px' }}>
                    {fmt(d.valorBRL, 'BRL')}
                  </td>
                  <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                    {d.status === 'paga' 
                      ? <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{tx('Paga','Pagada','Paid')}</span>
                      : <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{tx('Pendente','Pendiente','Pending')}</span>}
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    {d.status === 'pendente' && (
                      <button onClick={() => abrirPagamento(d)} style={{ backgroundColor: '#064e3b', border: '1px solid #10b981', color: '#34d399', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', marginRight: '8px' }}>{tx('Baixar Pgto','Registrar Pago','Post Payment')}</button>
                    )}
                    <button onClick={() => editarDespesa(d)} style={{background:'transparent',border:'1px solid #38bdf8',color:'#7dd3fc',padding:'6px 12px',borderRadius:8,fontSize:11,fontWeight:800,cursor:'pointer',marginRight:8}}>{tx('Editar','Editar','Edit')}</button>
                    <button onClick={() => excluirDespesa(d.id)} disabled={exclusaoPendenteId !== null} style={{ backgroundColor: 'transparent', border: '1px solid #334155', color: '#f43f5e', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>{tx('Excluir','Eliminar','Delete')}</button>
                  </td>
                </tr>
              ))
            )}
            {/* Linha de Total */}
            {despesasFiltradas.length > 0 && (
              <tr style={{ backgroundColor: '#020617' }}>
                <td colSpan="3" style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 800, color: '#94a3b8' }}>{tx('TOTAL DESTA VISÃO:','TOTAL DE ESTA VISTA:','TOTAL IN THIS VIEW:')}</td>
                <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, color: filtroStatus === 'paga' ? '#64748b' : '#f43f5e', fontSize: '16px' }}>{fmt(totalFiltradoBRL, 'BRL')}</td>
                <td colSpan="2"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL NOVA DESPESA */}
      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #f43f5e', borderRadius: '24px', width: '100%', maxWidth: '500px', padding: '28px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 800, color: '#fb7185', textTransform: 'uppercase' }}>{tx('Contas a Pagar','Cuentas a Pagar','Accounts Payable')}</span><h3 style={{ fontSize: '20px', fontWeight: 900, margin: '2px 0 0 0' }}>{despesaEmEdicao?tx('Editar Despesa','Editar Gasto','Edit Expense'):tx('Lançar Nova Despesa','Registrar Nuevo Gasto','Add New Expense')}</h3></div>
              <button onClick={() => setModalAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Descrição da Despesa','Descripción del Gasto','Expense Description')}</label>
                <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder={tx('Ex: Pagamento Fornecedor Tintas','Ej: Pago Proveedor Pinturas','Ex: Paint Supplier Payment')} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Valor ({moeda})</label>
                  <input type="text" value={valorInput} onChange={e => setValorInput(e.target.value)} placeholder="0.00" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #f43f5e', borderRadius: '8px', color: '#fb7185', fontWeight: 900, fontSize: '16px', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Data de Vencimento','Fecha de Vencimiento','Due Date')}</label>
                  <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Categoria','Categoría','Category')}</label>
                <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }}>
                  <option value="Fornecedor">📦 {tx('Fornecedor de Mercadorias','Proveedor de Mercaderías','Merchandise Supplier')}</option>
                  <option value="Infraestrutura">🏢 {tx('Aluguel / Água / Luz / Net','Alquiler / Agua / Luz / Internet','Rent / Water / Power / Internet')}</option>
                  <option value="Salários">👥 {tx('Salários / Comissões','Salarios / Comisiones','Salaries / Commissions')}</option>
                  <option value="Impostos">⚖️ {tx('Impostos / Taxas Fiscais','Impuestos / Tasas Fiscales','Taxes / Fiscal Fees')}</option>
                  <option value="Marketing">📢 {tx('Marketing / Publicidade','Marketing / Publicidad','Marketing / Advertising')}</option>
                  <option value="Outros">🔄 {tx('Outras Despesas','Otros Gastos','Other Expenses')}</option>
                </select>
              </div>
            </div>

            <button onClick={salvarDespesa} disabled={salvandoDespesa} style={{ width: '100%', background: 'linear-gradient(135deg, #e11d48, #be123c)', border: 'none', color: '#fff', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(225, 29, 72, 0.3)' }}>
              {salvandoDespesa?'Salvando...':despesaEmEdicao?'Salvar alterações':'Registrar Despesa no Sistema'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL BAIXAR PAGAMENTO */}
      {modalPagamentoAberto && despesaParaPagar && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #10b981', borderRadius: '24px', width: '100%', maxWidth: '400px', padding: '28px', color: '#fff' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 16px 0', color: '#34d399' }}>{tx('Baixar Pagamento','Registrar Pago','Post Payment')}</h3>
            <div style={{ backgroundColor: '#020617', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>{despesaParaPagar.descricao}</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#f8fafc' }}>{fmt(despesaParaPagar.valorBRL, 'BRL')}</div>
            </div>
            
            <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>{tx('De onde saiu o dinheiro?','¿De dónde salió el dinero?','Where did the money come from?')}</label>
            <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '8px', marginBottom: '24px', boxSizing: 'border-box' }}>
              <option value="Dinheiro / Gaveta">💵 {tx('Dinheiro da Gaveta do Caixa','Dinero de la Caja','Cash Drawer Money')}</option>
              <option value="Pix / Banco">🏦 {tx('Transferência Bancária / Pix','Transferencia Bancaria / Pix','Bank Transfer / Pix')}</option>
              <option value="Cartão Corporativo">💳 {tx('Cartão Corporativo','Tarjeta Corporativa','Corporate Card')}</option>
            </select>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setModalPagamentoAberto(false)} style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', color: '#94a3b8', padding: '12px', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}>{tx('Cancelar','Cancelar','Cancel')}</button>
              <button onClick={confirmarPagamento} style={{ flex: 2, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer' }}>{tx('Confirmar Pago','Confirmar Pago','Confirm Paid')}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}