import { ehEncomendaUsoUnico } from '../core/orderItems';
import React, { useState, useRef } from 'react';
import { normalizarProduto } from '../data';
import { db } from '../firebase';
import { transferirEstoqueEntreLocais } from '../core/inventory';
import { atualizarProdutoUnico, detectarConflitosIdentidadeProdutos, skuJaExiste, gerarIdSeguro } from '../core/productIdentity';
import { reservarIdentidadeProduto, liberarIdentidadeProduto } from '../core/productRegistry';
import {resultadoCadastroIndeterminado} from '../core/productAckOutcome';
import { localizarProdutoExistenteServidor } from '../core/productServerLookup';
import {auditarIndicesProdutosServidor} from '../core/productIndexAudit';
import {diagnosticarCadastroOcultoServidor} from '../core/productRecoveryDiagnosis';
import {verificarRecomposicaoOriginal} from '../core/productOriginalRebuildCheck';
import {prepararReativacaoOriginal} from '../core/productRecoveryCore';
import {getOperationalSnapshot} from '../core/operationalRepository';
import {localizarSkuHistoricoServidor} from '../core/productHistoricalSkuLookup';
import {liberarIndiceOrfaoPDV} from '../core/productOrphanRelease';
import { carregarHistoricoEstoqueProduto, criarEventoEstoque, obterPoliticaHistoricoEstoque, registrarEventosEstoque } from '../core/stockAudit';
import ZenModal from './ZenModal';
import { calcularPrecoPorCustoEMargem, calcularMargemPorCustoEPreco, validarMargemPrecoVenda, MAX_MARGEM_PRECO_PCT } from '../core/pricing';
import { validarCredencialGerencial } from '../core/accessControl';

export default function Produtos({ commitOperacaoNegocio, produtos, setProdutos, moeda, fmt, t, tx, fornecedoresGlobais = [], userId, operadorAtivo, planoLoja = 'basico', historicoVendas = [], historicoCompras = [], patenteUsuario, regrasDesconto, vendedores = [] }) {
  const [gruposCadastrados, setGruposCadastrados] = useState(['Tintas Acrílicas', 'Colorimetria & Pigmentos', 'Massas e Complementos', 'Serviços Especializados', 'Acessórios & Ferramentas']);
  const [filtroGrupo, setFiltroGrupo] = useState('todos');
  const [buscaProdutoTexto, setBuscaProdutoTexto] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(null);
  const [senhaExclusao, setSenhaExclusao] = useState('');
  
  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);
  const [produtoEmEdicao, setProdutoEmEdicao] = useState(null);
  const [secaoFiscalExpandida, setSecaoFiscalExpandida] = useState(false);
  const [paisRegulamentoFiscal, setPaisRegulamentoFiscal] = useState('BR');
  const [novoGrupoTexto, setNovoGrupoTexto] = useState('');
  const [criandoNovoGrupo, setCriandoNovoGrupo] = useState(false);
  const [modalMovimento, setModalMovimento] = useState(null);
  const [movimentoQtd, setMovimentoQtd] = useState('1');
  const [movimentoMotivo, setMovimentoMotivo] = useState('Reposição da vitrine');
  const [movimentoObs, setMovimentoObs] = useState('');
  const [salvandoMovimento, setSalvandoMovimento] = useState(false);
  const [historicoExpandido, setHistoricoExpandido] = useState(false);
  const [historicoMovimentos, setHistoricoMovimentos] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [filtroHistoricoInicio, setFiltroHistoricoInicio] = useState('');
  const [filtroHistoricoFim, setFiltroHistoricoFim] = useState('');
  const [modalZen, setModalZen] = useState(null);
  const [auditandoIndices, setAuditandoIndices] = useState(false);
  const [identidadesAuditadas, setIdentidadesAuditadas] = useState([]);
  const [idOriginalSelecionado, setIdOriginalSelecionado] = useState('');
  const [diagnosticoOriginal, setDiagnosticoOriginal] = useState(null);
  const [conferindoOriginal, setConferindoOriginal] = useState(false);
  const [confirmarReativacaoOriginal, setConfirmarReativacaoOriginal] = useState(false);
  const [recomposicaoOriginal, setRecomposicaoOriginal] = useState(null);
  const [estoqueRecompostoConferido, setEstoqueRecompostoConferido] = useState(false);
  const [abrindoRecomposicao, setAbrindoRecomposicao] = useState(false);
  const [reativandoOriginal, setReativandoOriginal] = useState(false);
  const [skuHistoricoBusca, setSkuHistoricoBusca] = useState('');
  const [buscandoSkuHistorico, setBuscandoSkuHistorico] = useState(false);
  const [candidatoOrfaoPDV, setCandidatoOrfaoPDV] = useState(null);
  const [confirmarLiberacaoOrfao, setConfirmarLiberacaoOrfao] = useState(false);
  const [liberandoOrfaoPDV, setLiberandoOrfaoPDV] = useState(false);
  const mostrarZen = (variante, titulo, mensagem, detalhes = []) => setModalZen({ variante, titulo, mensagem, detalhes, apenasConfirmar: true });

  const buscarCadastroPeloSkuAntigo = async () => {
    if(patenteUsuario!=='gerencia'||buscandoSkuHistorico)return;
    const sku=skuHistoricoBusca.trim();
    if(!sku)return mostrarZen('warning','Informe o SKU antigo','Use o código original que o vendedor cadastrou. A consulta não altera estoque.');
    setCandidatoOrfaoPDV(null);
    setBuscandoSkuHistorico(true);
    try{
      const resultado=await localizarSkuHistoricoServidor({db,userId,sku});
      if(resultado.status==='found'){
        setProdutos(resultado.catalog);
        setFiltroGrupo('todos');
        setMostrarInativos(true);
        setBuscaProdutoTexto(String(resultado.produto.sku||resultado.produto.nome||''));
        return mostrarZen('info','Produto localizado','A busca foi ajustada para mostrar o produto. Confira o estoque e os preços antes de movimentar.',[`SKU: ${resultado.produto.sku||'(sem SKU)'}`]);
      }
      if(resultado.status==='historical_only'){
        return mostrarZen('warning','Produto exige conferência','Encontramos um registro anterior, mas ainda não é seguro exibi-lo como disponível. Nenhum saldo foi alterado.',[`Produto: ${resultado.nome}`,`SKU: ${resultado.sku}`]);
      }
      if(resultado.status==='orphan_index' && String(resultado.ownerId||'').startsWith('PROD-BALCAO-')){
        setCandidatoOrfaoPDV({sku,ownerId:resultado.ownerId});
      }
      return mostrarZen('warning','Cadastro ainda não disponível','Este produto precisa de conferência para voltar à lista. Utilize Recuperar produtos ou entre em contato com o suporte. Nenhum cadastro foi alterado.',[`SKU pesquisado: ${sku}`]);
    }catch(error){
      return mostrarZen('danger','Busca indisponível','Não foi possível conferir os dados do servidor. Nenhum registro foi alterado.',[error?.message||String(error)]);
    }finally{setBuscandoSkuHistorico(false);}
  };

  const executarLiberacaoOrfaoPDV = async () => {
    if(patenteUsuario!=='gerencia'||!candidatoOrfaoPDV||liberandoOrfaoPDV)return;
    setConfirmarLiberacaoOrfao(false);
    setLiberandoOrfaoPDV(true);
    try{
      const resultado=await liberarIndiceOrfaoPDV({
        db,userId,sku:candidatoOrfaoPDV.sku,ownerId:candidatoOrfaoPDV.ownerId,
        operadorId:operadorAtivo?.id||operadorAtivo?.nome,
      });
      if(resultado.status==='released'){
        setCandidatoOrfaoPDV(null);
        return mostrarZen('success','Cadastro liberado com segurança','Agora é possível cadastrar este produto. Confira o estoque físico antes de informar o saldo. O histórico foi preservado.');
      }
      return mostrarZen('warning','Cadastro precisa de suporte','A conferência encontrou informações que impedem liberar o cadastro com segurança. Nenhum dado foi alterado.');
    }finally{setLiberandoOrfaoPDV(false);}
  };

  const examinarCadastroPeloId = async (idSelecionado=idOriginalSelecionado) => {
    if(patenteUsuario!=='gerencia'||conferindoOriginal)return;
    const id=String(idSelecionado||'').trim();
    if(!id)return mostrarZen('warning','Selecione um produto','Escolha o produto que deseja recuperar.');
    setConferindoOriginal(true);setDiagnosticoOriginal(null);
    try{
      const r=await diagnosticarCadastroOcultoServidor({db,userId,ownerId:id});
      setDiagnosticoOriginal(r);
      const option=identidadesAuditadas.find(x=>x.produtoId===id);
      const nome=r.produto?.nome||r.produtoLegado?.nome||option?.nomes?.[0]||'Produto';
      const sku=r.produto?.sku||r.produtoLegado?.sku||option?.skus?.[0]||'';
      if(r.status==='original_ativo'||r.status==='original_inativo'){
        setFiltroGrupo('todos');setMostrarInativos(true);setBuscaProdutoTexto(sku||nome);
      }
      const titulo=r.status==='original_ativo'?'Produto localizado':
        r.status==='original_inativo'?'Produto desativado':
        r.status==='indice_sem_cadastro'?'Cadastro precisa ser completado':
        'Produto exige conferência';
      const mensagem=r.status==='original_ativo'?'O produto já está disponível. Atualizamos a busca para exibi-lo.':
        r.status==='original_inativo'?'O produto está desativado. Confira o estoque físico antes de reativá-lo.':
        r.status==='indice_sem_cadastro'?'Encontramos o nome e o código originais, mas a ficha ainda não foi concluída. É possível conferir se ela pode ser completada sem duplicação.':
        'Não foi possível confirmar o cadastro completo com segurança. Nenhum produto foi modificado. Se necessário, solicite uma conferência ao suporte.';
      mostrarZen(['original_ativo','original_inativo'].includes(r.status)?'info':'warning',
        titulo,mensagem,[`Produto: ${nome}`,`SKU: ${sku||'não informado'}`]);
    }catch(error){
      console.error('[ZenOS][Produtos] Diagnostico por ID',error);
      mostrarZen('danger','Conferência indisponível',
        'Não foi possível consultar o cadastro agora. Nenhum produto foi alterado.');
    }finally{setConferindoOriginal(false);}
  };

  const iniciarRecomposicaoOriginal = async () => {
    if(patenteUsuario!=='gerencia'||abrindoRecomposicao||!diagnosticoOriginal?.ownerId)return;
    setAbrindoRecomposicao(true);
    try{
      const candidato=await verificarRecomposicaoOriginal({db,userId,ownerId:diagnosticoOriginal.ownerId});
      if(!candidato.ok){
        console.warn('[ZenOS][Recomposicao] Fonte nao autoriza cadastro',candidato.reason);
        return mostrarZen('warning','Cadastro precisa de conferência',
          'Não foi possível confirmar que este produto pode ser completado sem afetar outros registros. Nenhum produto foi alterado. Peça ao suporte para conferir o cadastro.');
      }
      // ID e SKU originais permanecem; custo/preços/saldo NÃO são inventados.
      setRecomposicaoOriginal(candidato);
      setEstoqueRecompostoConferido(false);
      setProdutoEmEdicao(null);setCriandoNovoGrupo(false);setNovoGrupoTexto('');
      setHistoricoExpandido(false);setHistoricoMovimentos([]);
      setFormProduto(normalizarProduto({
        id:candidato.ownerId,nome:candidato.nome,sku:candidato.sku,
        grupo:'Acessórios & Ferramentas',estoqueVitrine:'0',estoqueGalpao:'0',
        estoque:0,custoBRL:0,precoBRL:0,margemDesejada:'40'
      }));
      setModalProdutoAberto(true);
    }catch(error){
      console.error('[ZenOS][Recomposicao] Verificacao indisponivel',error);
      mostrarZen('warning','Verificação indisponível','O cadastro não foi alterado. Aguarde a sincronização antes de tentar novamente.');
    }finally{setAbrindoRecomposicao(false);}
  };

  const reativarProdutoOriginal = async () => {
    if(patenteUsuario!=='gerencia'||reativandoOriginal||diagnosticoOriginal?.status!=='original_inativo')return;
    setConfirmarReativacaoOriginal(false);setReativandoOriginal(true);
    const id=String(diagnosticoOriginal.ownerId);
    try{
      // Refazer as provas na hora do clique: não usar status do cache como autorização.
      const confirmadoOriginal=await diagnosticarCadastroOcultoServidor({db,userId,ownerId:id});
      if(confirmadoOriginal.status!=='original_inativo')throw new Error('Identidade não está mais confirmada como inativa.');
      const snap=await getOperationalSnapshot(db,userId);
      const catalogo=snap.exists()?snap.data()?.produtos:null;
      const plano=prepararReativacaoOriginal({diagnostico:confirmadoOriginal,catalogo,ownerId:id});
      if(!plano.ok)throw new Error('Reativação bloqueada: '+plano.reason);
      if(typeof commitOperacaoNegocio!=='function')throw new Error('Serviço de sincronização não confirmado.');
      const revision=snap.data()?._syncMeta?.fieldRevisions?.produtos??'v1';
      const operacao=await commitOperacaoNegocio({
        changes:[{field:'produtos',value:plano.lista,storageSuffix:'produtos'}],
        guards:[{type:'entity_unchanged',field:'produtos',entityId:id,entityKey:'id',expected:plano.antes,
          message:'O produto original mudou em outro caixa. Atualize e confira novamente antes de reativar.'}],
        operationKey:`reativar-original:${id}:${revision}`,
      });
      if(!operacao?.cloudOk){
        // ACK ausente: consultar registro, mas não reenviar com outro ID.
        const check=await getOperationalSnapshot(db,userId);
        const encontrados=Array.isArray(check.data()?.produtos)?
          check.data().produtos.filter(p=>String(p?.id)===id):[];
        if(encontrados.length!==1||encontrados[0].ativo===false)
          throw new Error('Confirmação desconhecida. A reativação pode estar pendente. Não repita.');
        setProdutos(check.data().produtos);
      }else setProdutos(operacao.values?.produtos||plano.lista);
      setDiagnosticoOriginal(null);setMostrarInativos(false);setFiltroGrupo('todos');
      setBuscaProdutoTexto(plano.antes.sku||plano.antes.nome||'');
      mostrarZen('success','Produto original reativado',
        'A nuvem confirmou o cadastro original como ativo. Foram preservados o mesmo ID, SKU, preços, estoque e histórico; nenhuma entrada de estoque foi criada.',
        [`ID: ${id}`,`SKU: ${plano.antes.sku||'-'}`]);
    }catch(error){
      mostrarZen('warning','Reativação não confirmada',
        'Nenhum novo produto foi criado. Confira novamente o diagnóstico e o histórico antes de tentar outra operação.',
        [error?.message||String(error)]);
    }finally{setReativandoOriginal(false);}
  };

  const auditarCadastrosOriginais = async () => {
    if(patenteUsuario!=='gerencia'||auditandoIndices)return;
    setAuditandoIndices(true);setIdentidadesAuditadas([]);setDiagnosticoOriginal(null);
    try{
      const r=await auditarIndicesProdutosServidor({db,userId});
      if(r.status!=='complete')
        return mostrarZen('warning','Conferência não concluída',
          'Não foi possível verificar todos os produtos agora. Nenhum cadastro foi modificado. Tente novamente mais tarde.');
      const candidatos=[
        ...r.inativos.map(x=>({...x,situacao:'Desativado'})),
        ...r.ausentes.map(x=>({...x,situacao:'Cadastro incompleto'})),
        ...r.duplicados.map(x=>({...x,situacao:'Precisa de suporte'}))
      ];
      setIdentidadesAuditadas(candidatos);
      setIdOriginalSelecionado(candidatos[0]?.produtoId||'');
      const detalhes=candidatos.slice(0,20).map(x=>
        `${x.situacao}: ${x.nomes.join(' / ')||'(sem nome)'} — ${x.skus.join(' / ')||'(sem SKU)'}`);
      mostrarZen(r.ausentes.length||r.duplicados.length?'warning':'info',
        'Conferência de produtos concluída',
        candidatos.length
          ?`Encontramos ${candidatos.length} cadastro(s) que precisam de atenção. Selecione um produto e clique em Conferir cadastro. Nenhum produto ou saldo foi alterado.`
          :'Nenhum cadastro incompleto foi encontrado. Caso um produto não apareça, confira os filtros da lista.',
        detalhes);
    }catch(error){
      console.error('[ZenOS][Produtos] Falha na auditoria',error);
      mostrarZen('warning','Conferência indisponível',
        'Não foi possível consultar os produtos agora. Nenhum cadastro foi modificado.');
    }finally{setAuditandoIndices(false);}
  };

  // --- MELHORIA: Autocomplete Inteligente (PRODUTOS + BANCO GLOBAL) ---
  const todosOsFornecedores = [
    ...produtos.map((p) => p.fornecedor),
    ...fornecedoresGlobais.map(f => typeof f === 'object' ? (f.nome || f.razao_social || f.nomeFantasia || f.nomeFornecedor) : f)
  ];
  
  const fornecedoresCadastrados = Array.from(
    new Set(todosOsFornecedores.filter((f) => typeof f === 'string' && f.trim() !== ''))
  ).sort();
  
  const [mostrarFornecedores, setMostrarFornecedores] = useState(false);
  // ---------------------------------------------------------------

  const [formProduto, setFormProduto] = useState(normalizarProduto({}));
  const conflitosIdentidade = detectarConflitosIdentidadeProdutos(produtos || []);
  const idsComConflito = new Set(conflitosIdentidade.map((c) => String(c.id)));
  const fileInputRef = useRef(null);

  const produtosListaFiltrada = (produtos || []).filter(p => {
    if (!p || (!mostrarInativos && p.ativo === false)) return false;
    
    const nomeLower = (p.nome || '').toLowerCase();
    const skuLower = (p.sku || '').toLowerCase();
    const grupoItem = p.grupo || 'Geral';
    const bateGrupo = filtroGrupo === 'todos' || grupoItem === filtroGrupo;
    const texto = buscaProdutoTexto.toLowerCase().trim();
    const bateTexto = texto === '' || nomeLower.includes(texto) || skuLower.includes(texto);
    return bateGrupo && bateTexto;
  });

  const atualizarPrecoPorCustoEMargem = (custoStr, margemStr) => calcularPrecoPorCustoEMargem(custoStr, margemStr).valor;

  const atualizarMargemPorPreco = (custoStr, precoStr) => calcularMargemPorCustoEPreco(custoStr, precoStr);

  const abrirCadastroNovoProduto = () => {
    setRecomposicaoOriginal(null);
    setEstoqueRecompostoConferido(false);
    setProdutoEmEdicao(null);
    setSecaoFiscalExpandida(false);
    setCriandoNovoGrupo(false);
    setNovoGrupoTexto('');
    setPaisRegulamentoFiscal(moeda === 'PYG' ? 'PY' : 'BR');
    setHistoricoExpandido(false);
    setHistoricoMovimentos([]);
    // ID único por cadastro novo: evita colidir com um produto antigo/inativo de mesmo SKU+nome+grupo.
    setFormProduto(normalizarProduto({ 
      id: gerarIdSeguro('PROD'),
      ativo: true,
      sku: `SKU-${Date.now().toString().slice(-5)}`, 
      grupo: gruposCadastrados[0],
      estoqueVitrine: '0',
      estoqueGalpao: '0',
      localizacao: '',
      margemDesejada: '40'
    }));
    setModalProdutoAberto(true);
  };

  const abrirEdicaoProduto = (prod) => {
    setRecomposicaoOriginal(null);
    setProdutoEmEdicao(prod);
    setSecaoFiscalExpandida(false);
    setCriandoNovoGrupo(false);
    setPaisRegulamentoFiscal(moeda === 'PYG' ? 'PY' : 'BR');
    setHistoricoExpandido(false);
    setHistoricoMovimentos([]);
    setFiltroHistoricoInicio('');
    setFiltroHistoricoFim('');
    const custo = prod.custoBRL || 0;
    const preco = prod.precoBRL || 0;
    const margem = preco > 0 ? (((preco - custo) / preco) * 100).toFixed(1) : '40';
    setFormProduto({
      ...normalizarProduto(prod),
      custoBRL: custo.toFixed(2),
      margemDesejada: margem,
      precoBRL: preco.toFixed(2),
      preco2BRL: prod.preco2BRL ? prod.preco2BRL.toFixed(2) : '',
      preco3BRL: prod.preco3BRL ? prod.preco3BRL.toFixed(2) : '',
      estoqueVitrine: (prod.estoqueVitrine ?? prod.estoque ?? 0).toString(),
      estoqueGalpao: (prod.estoqueGalpao ?? 0).toString(),
      localizacao: prod.localizacao || ''
    });
    setModalProdutoAberto(true);
  };

  const lidarUploadImagem = (e) => {
    const arquivo = e.target.files?.[0];
    if (arquivo) {
      const reader = new FileReader();
      // Foto reduzida (máx. 400px, JPEG): todo o catálogo fica num único documento da nuvem
      // com limite de ~1 MB; fotos originais enchiam esse limite e bloqueavam vendas.
      reader.onloadend = () => {
        const original = reader.result;
        const img = new Image();
        img.onload = () => {
          try {
            const escala = Math.min(1, 400 / Math.max(img.width || 1, img.height || 1));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * escala));
            canvas.height = Math.max(1, Math.round(img.height * escala));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            setFormProduto(prev => ({ ...prev, imagem: canvas.toDataURL('image/jpeg', 0.7) }));
          } catch (_) { setFormProduto(prev => ({ ...prev, imagem: original })); }
        };
        img.onerror = () => setFormProduto(prev => ({ ...prev, imagem: original }));
        img.src = original;
      };
      reader.readAsDataURL(arquivo);
    }
  };

  const salvarProduto = async () => {
    if(recomposicaoOriginal){
      // Este caminho só recompõe a ficha original ausente. Não modifica outros cadastros.
      if(String(formProduto.id)!==String(recomposicaoOriginal.ownerId)||
         String(formProduto.sku).trim().toUpperCase()!==String(recomposicaoOriginal.sku).trim().toUpperCase()||
         String(formProduto.nome).trim().toLowerCase()!==String(recomposicaoOriginal.nome).trim().toLowerCase())
        return mostrarZen('warning','Dados originais protegidos',
          'Nome, código e identificação do produto devem ser preservados. Confira os valores de preço e estoque físico e tente novamente.');
      if(!estoqueRecompostoConferido)
        return mostrarZen('warning','Confirme o estoque',
          'Antes de concluir, confira as quantidades físicas na vitrine e no depósito e marque a confirmação na ficha.');
      if(!(Number(String(formProduto.precoBRL??'').replace(',','.'))>0))
        return mostrarZen('warning','Preço obrigatório',
          'Informe o preço de venda correto antes de concluir o cadastro. O sistema não preenche valores de um cadastro incompleto.');
      const verificado=await verificarRecomposicaoOriginal({db,userId,ownerId:recomposicaoOriginal.ownerId});
      if(!verificado.ok){
        console.warn('[ZenOS][Recomposicao] Bloqueio no salvamento',verificado.reason);
        return mostrarZen('warning','Cadastro não concluído',
          'A conferência encontrou uma alteração ou outro vínculo deste produto. Nenhum item foi criado. Atualize e peça uma conferência ao suporte.');
      }
    }
    if (!formProduto.nome.trim()) return mostrarZen('warning', tx('Nome obrigatório','Nombre obligatorio','Name required'), tx('Informe o nome do produto antes de salvar.','Informe el nombre del producto antes de guardar.','Enter the product name before saving.'));
    const margemValidacao = validarMargemPrecoVenda(formProduto.margemDesejada);
    if (!margemValidacao.ok && Number(formProduto.custoBRL || 0) > 0) return mostrarZen('warning', tx('Margem inválida','Margen inválido','Invalid margin'), margemValidacao.erro, [`${tx('Use um valor entre','Use un valor entre','Use a value between')} 0% ${tx('e','y','and')} ${MAX_MARGEM_PRECO_PCT}%.`, tx('A margem é calculada sobre o preço de venda.','El margen se calcula sobre el precio de venta.','Margin is calculated on the sale price.')]);
    let grupoFinal = formProduto.grupo;
    if (criandoNovoGrupo && novoGrupoTexto.trim()) {
      grupoFinal = novoGrupoTexto.trim();
      if (!gruposCadastrados.includes(grupoFinal)) setGruposCadastrados([...gruposCadastrados, grupoFinal]);
    }
    const custo = Math.max(0, parseFloat(String(formProduto.custoBRL).replace(',', '.')) || 0);
    const preco = Math.max(0, parseFloat(String(formProduto.precoBRL).replace(',', '.')) || (custo > 0 ? custo * 1.5 : 10));
    const preco2 = formProduto.habilitarPreco2 ? (parseFloat(String(formProduto.preco2BRL).replace(',', '.')) || 0) : 0;
    const preco3 = formProduto.habilitarPreco3 ? (parseFloat(String(formProduto.preco3BRL).replace(',', '.')) || 0) : 0;
    const vitrine = Math.max(0, parseInt(formProduto.estoqueVitrine) || 0);
    const galpao = Math.max(0, parseInt(formProduto.estoqueGalpao) || 0);
    const estoqueTotal = vitrine + galpao;

    if (skuJaExiste(produtos, formProduto.sku, produtoEmEdicao)) {
      return mostrarZen('danger', tx('SKU duplicado','SKU duplicado','Duplicate SKU'), `${tx('Já existe outro produto com o SKU','Ya existe otro producto con el SKU','Another product already uses SKU')} ${formProduto.sku}.`, [tx('Use um SKU diferente para impedir movimentação no item errado.','Use un SKU diferente para evitar movimientos en el ítem equivocado.','Use a different SKU to prevent movement on the wrong item.')]);
    }

    const dadosFinais = normalizarProduto({
      ...formProduto,
      grupo: grupoFinal,
      custoBRL: custo,
      precoBRL: preco,
      preco2BRL: preco2,
      preco3BRL: preco3,
      estoque: estoqueTotal,
      estoqueVitrine: vitrine,
      estoqueGalpao: galpao,
      localizacao: formProduto.localizacao || ''
    });
    // Cadastro novo nunca herda "ativo:false" de um registro antigo na mesclagem com a nuvem.
    if (!produtoEmEdicao && !recomposicaoOriginal) dadosFinais.ativo = true;

    let listaProposta;
    if (produtoEmEdicao) {
      try { listaProposta = atualizarProdutoUnico(produtos, produtoEmEdicao, dadosFinais, 'edição do produto'); }
      catch (erro) { return mostrarZen('danger', tx('Edição bloqueada','Edición bloqueada','Edit blocked'), erro.message || tx('Não foi possível editar o produto com segurança.','No fue posible editar el producto con seguridad.','Could not safely edit the product.')); }
    } else {
      listaProposta = [dadosFinais, ...(produtos || [])];
    }

    let eventoInicial = null;
    if (!produtoEmEdicao && dadosFinais.tipoItem !== 'servico' && estoqueTotal > 0) {
      eventoInicial = criarEventoEstoque({
        produto: dadosFinais,
        tipo: 'cadastro_inicial',
        origem: 'cadastro',
        destino: vitrine > 0 && galpao > 0 ? 'vitrine+deposito' : vitrine > 0 ? 'vitrine' : 'deposito',
        quantidade: estoqueTotal,
        saldoAntes: { estoque: 0, estoqueVitrine: 0, estoqueGalpao: 0 },
        saldoDepois: dadosFinais,
        motivo: 'Saldo inicial do cadastro',
        operador: operadorAtivo,
      });
    }

    try {
      await reservarIdentidadeProduto({ db, userId, produto: dadosFinais, produtoAnterior: produtoEmEdicao });
    } catch (erro) {
      if(erro?.code === 'ZENOS_PRODUTO_DUPLICADO'){
        const localizado=await localizarProdutoExistenteServidor({db,userId,produto:dadosFinais});
        if(localizado.status==='found'){
          setProdutos(localizado.catalog);
          setFiltroGrupo('todos');
          setMostrarInativos(true);
          setBuscaProdutoTexto(String(localizado.produto.sku||localizado.produto.nome||''));
          setModalProdutoAberto(false);
          return mostrarZen('info',tx('Produto localizado no servidor','Producto localizado en servidor','Product found on server'),
            tx('O cadastro existente foi recuperado da nuvem e a busca foi atualizada. Confira estoque, situação e preços; não crie outro produto.',
               'Se recuperó el registro existente y se actualizó la búsqueda. Revise existencias y precios; no cree otro producto.',
               'Existing catalog record refreshed from server. Check stock and prices; do not create a duplicate.'));
        }
        if(localizado.status==='orphan_index'||localizado.status==='conflict'){
          return mostrarZen('warning',tx('Cadastro exige reconciliação','Registro requiere conciliación','Catalog requires reconciliation'),
            tx('Existe uma identidade reservada sem correspondência única no catálogo confirmado. Nenhum dado foi apagado. Acione o suporte para conferir os registros antes de cadastrar novamente.',
               'Hay una identidad reservada sin coincidencia única. Ningún dato fue borrado. Contacte soporte antes de registrar de nuevo.',
               'Reserved identity without a unique catalog match. No data was removed. Contact support before retrying.'));
        }
      }
      return mostrarZen('danger', erro?.code === 'ZENOS_PRODUTO_DUPLICADO' ? tx('Produto duplicado','Producto duplicado','Duplicate product') : tx('Cadastro não concluído','Registro no concluido','Registration not completed'), erro.message || 'Não foi possível reservar a identidade do produto.');
    }

    try {
      let produtosConfirmados = listaProposta;
      if (typeof commitOperacaoNegocio === 'function') {
        const confirmado = await commitOperacaoNegocio({
          changes: [{ field:'produtos', value:listaProposta, storageSuffix:'produtos' }],
          stockEvents: eventoInicial ? [eventoInicial] : [],
          ...(recomposicaoOriginal ? {operationKey:`recompor-original:${recomposicaoOriginal.ownerId}`} : {}),
        });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou o cadastro do produto.');
        produtosConfirmados = confirmado.values?.produtos || listaProposta;
      } else {
        if (eventoInicial) await registrarEventosEstoque({ db, userId, eventos:[eventoInicial] });
      }
      setProdutos(produtosConfirmados);
      setModalProdutoAberto(false);
      setRecomposicaoOriginal(null);
      setEstoqueRecompostoConferido(false);
    } catch (erro) {
      console.error('[ZenOS][ATT10.2] Produto não confirmado:', erro);
      if (!resultadoCadastroIndeterminado(erro)) {
        try {
          if (produtoEmEdicao) await reservarIdentidadeProduto({ db, userId, produto:produtoEmEdicao, produtoAnterior:dadosFinais });
          else if(!recomposicaoOriginal) await liberarIdentidadeProduto({ db, userId, produto:dadosFinais });
          // Em recomposição, o índice antecede este atendimento: preservá-lo mesmo
          // se a nuvem recusar ou a confirmação não chegar.
        } catch (rollbackErro) {
          console.error('[ZenOS][ATT10.2] Falha ao restaurar índice do produto:', rollbackErro);
        }
      } else {
        console.warn('[ZenOS] Confirmação do produto desconhecida; índice original preservado para reconciliação.');
      }
      return mostrarZen('danger', tx('Cadastro não confirmado','Registro sin confirmar','Registration unconfirmed'), tx('A confirmação da nuvem não foi obtida. O cadastro pode estar no servidor; confira a identidade original antes de tentar novamente.','No se recibió confirmación. El registro puede existir en el servidor; verifique antes de repetir.','Cloud confirmation was not received. The original record may exist on the server; verify before retrying.'), [erro?.message || tx('Falha de persistência','Falla de persistencia','Persistence failure')]);
    }
  };

  const abrirMovimentoRapido = (produto, localDestino, delta) => {
    const destino = localDestino === 'deposito' ? 'deposito' : 'vitrine';
    const origem = destino === 'vitrine' ? 'deposito' : 'vitrine';
    // Botão "-" inverte a direção: diminuir um local significa transferir para o outro.
    const origemEfetiva = delta > 0 ? origem : destino;
    const destinoEfetivo = delta > 0 ? destino : origem;
    setModalMovimento({ produto, origem: origemEfetiva, destino: destinoEfetivo });
    setMovimentoQtd('1');
    setMovimentoMotivo(destinoEfetivo === 'vitrine' ? 'Reposição da vitrine' : 'Retorno ao depósito');
    setMovimentoObs('');
  };

  const confirmarMovimentoEstoque = async () => {
    if (!modalMovimento?.produto) return;
    const quantidade = Math.max(0, Number(String(movimentoQtd).replace(',', '.')) || 0);
    if (quantidade <= 0) return mostrarZen('warning', tx('Quantidade inválida','Cantidad inválida','Invalid quantity'), tx('Informe uma quantidade maior que zero.','Informe una cantidad mayor que cero.','Enter a quantity greater than zero.'));
    if (!movimentoMotivo.trim()) return mostrarZen('warning', tx('Motivo obrigatório','Motivo obligatorio','Reason required'), tx('Informe o motivo da movimentação.','Informe el motivo del movimiento.','Enter the reason for the movement.'));

    setSalvandoMovimento(true);
    try {
      const resultado = transferirEstoqueEntreLocais(modalMovimento.produto, modalMovimento.origem, modalMovimento.destino, quantidade);
      const evento = criarEventoEstoque({
        produto: modalMovimento.produto,
        tipo: 'transferencia_interna',
        origem: modalMovimento.origem,
        destino: modalMovimento.destino,
        quantidade,
        saldoAntes: resultado.movimento.antes,
        saldoDepois: resultado.movimento.depois,
        motivo: movimentoMotivo,
        observacao: movimentoObs,
        operador: operadorAtivo,
      });
      const listaProposta = atualizarProdutoUnico(produtos, modalMovimento.produto, resultado.produto, 'movimentação de estoque');
      let produtosConfirmados = listaProposta;
      if (typeof commitOperacaoNegocio === 'function') {
        const confirmado = await commitOperacaoNegocio({
          changes:[{ field:'produtos', value:listaProposta, storageSuffix:'produtos' }],
          stockEvents:[evento],
        });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou a movimentação.');
        produtosConfirmados = confirmado.values?.produtos || listaProposta;
      } else {
        await registrarEventosEstoque({ db, userId, eventos:[evento] });
      }
      setProdutos(produtosConfirmados);
      const produtoConfirmado = produtosConfirmados.find(p => String(p.id) === String(resultado.produto.id) && String(p.sku || '').toUpperCase() === String(resultado.produto.sku || '').toUpperCase()) || resultado.produto;
      if (produtoEmEdicao && String(produtoEmEdicao.id) === String(modalMovimento.produto.id) && String(produtoEmEdicao.sku || '').toUpperCase() === String(modalMovimento.produto.sku || '').toUpperCase()) {
        setProdutoEmEdicao(produtoConfirmado);
        setFormProduto((prev) => ({
          ...prev,
          estoqueVitrine: String(produtoConfirmado.estoqueVitrine ?? 0),
          estoqueGalpao: String(produtoConfirmado.estoqueGalpao ?? 0),
          estoque: produtoConfirmado.estoque,
        }));
      }
      setModalMovimento(null);
      if (historicoExpandido && produtoEmEdicao && String(produtoEmEdicao.id) === String(modalMovimento.produto.id) && String(produtoEmEdicao.sku || '').toUpperCase() === String(modalMovimento.produto.sku || '').toUpperCase()) {
        await carregarHistoricoProduto(produtoConfirmado.id);
      }
    } catch (erro) {
      console.error('[ZenOS][ATT10.2] Falha na movimentação auditada:', erro);
      mostrarZen('danger', tx('Movimentação bloqueada','Movimiento bloqueado','Movement blocked'), erro.message || tx('Não foi possível movimentar o estoque com segurança.','No fue posible mover el stock con seguridad.','Could not safely move stock.'));
    } finally {
      setSalvandoMovimento(false);
    }
  };

  const carregarHistoricoProduto = async (produtoId = produtoEmEdicao?.id) => {
    if (!produtoId || !userId) return;
    setCarregandoHistorico(true);
    try {
      const lista = await carregarHistoricoEstoqueProduto({
        db,
        userId,
        produtoId,
        produtoSku: produtoEmEdicao?.sku || '',
        plano: planoLoja,
        inicio: filtroHistoricoInicio || null,
        fim: filtroHistoricoFim || null,
      });
      setHistoricoMovimentos(lista);
    } catch (erro) {
      console.error('[ZenOS][ATT06] Falha ao carregar histórico:', erro);
      mostrarZen('danger', tx('Histórico indisponível','Historial no disponible','History unavailable'), tx('Não foi possível carregar o histórico de estoque deste produto.','No fue posible cargar el historial de stock de este producto.','Could not load this product stock history.'));
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const alternarHistorico = async () => {
    const novoEstado = !historicoExpandido;
    setHistoricoExpandido(novoEstado);
    if (novoEstado && produtoEmEdicao) await carregarHistoricoProduto(produtoEmEdicao.id);
  };


  const produtoTemHistorico = (produto) => {
    const id=String(produto?.id||''); const sku=String(produto?.sku||'').toUpperCase();
    const emVendas=(historicoVendas||[]).some(v=>(v.itens||[]).some(i=>String(i.produtoOriginalId||'')===id || String(i.produtoOriginalSku||i.sku||'').toUpperCase()===sku));
    const emCompras=(historicoCompras||[]).some(c=>(c.itens||[]).some(i=>String(i.produtoId||i.id||'')===id || String(i.sku||'').toUpperCase()===sku));
    return emVendas||emCompras;
  };
  const pedirExclusao = produto => { if(patenteUsuario!=='gerencia') return mostrarZen('danger', tx('Acesso restrito','Acceso restringido','Restricted access'), tx('Somente a gerência pode inativar ou excluir produtos.','Solo la gerencia puede inactivar o eliminar productos.','Only management can deactivate or delete products.')); setSenhaExclusao(''); setModalExcluir(produto); };
  const confirmarExclusao = async () => {
    if(!modalExcluir) return;
    const autorizador = await validarCredencialGerencial({ vendedores, senha: senhaExclusao, senhaLegada: regrasDesconto?.senhaGerente });
    if(!autorizador) return mostrarZen('danger', tx('Senha incorreta','Contraseña incorrecta','Incorrect password'), tx('Informe o PIN de um Administrador/Gerência cadastrado.','Ingrese el PIN de un Administrador/Gerencia registrado.','Enter the PIN of a registered Administrator/Management user.'));
    const temHist=produtoTemHistorico(modalExcluir);
    const listaProposta = temHist
      ? produtos.map(p=>String(p.id)===String(modalExcluir.id)&&String(p.sku)===String(modalExcluir.sku)?{...p,ativo:false,inativadoEm:new Date().toISOString(),inativadoPor:operadorAtivo?.nome||'Gerência'}:p)
      : produtos.filter(p=>!(String(p.id)===String(modalExcluir.id)&&String(p.sku)===String(modalExcluir.sku)));
    try {
      let produtosConfirmados = listaProposta;
      if (typeof commitOperacaoNegocio === 'function') {
        const confirmado = await commitOperacaoNegocio({ changes:[{ field:'produtos', value:listaProposta, storageSuffix:'produtos' }] });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou a alteração.');
        produtosConfirmados = confirmado.values?.produtos || listaProposta;
      }
      setProdutos(produtosConfirmados);
      if (!temHist) {
        try { await liberarIdentidadeProduto({db,userId,produto:modalExcluir}); }
        catch (erroIndice) { console.error('[ZenOS][ATT10.2] Produto removido, mas índice não foi liberado:', erroIndice); mostrarZen('warning','Produto removido com proteção pendente','O produto foi removido, porém o índice de unicidade não pôde ser liberado. Não recadastre o mesmo SKU até sincronizar novamente.'); }
      }
      setModalExcluir(null);
    } catch (erro) {
      mostrarZen('danger',tx('Alteração não concluída','Cambio no concluido','Change not completed'),tx('A nuvem não confirmou a exclusão/inativação. O catálogo foi mantido.','La nube no confirmó la eliminación/inactivación. El catálogo fue preservado.','The cloud did not confirm deletion/deactivation. The catalog was preserved.'),[erro?.message || tx('Falha de persistência','Falla de persistencia','Persistence failure')]);
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{t ? t('catalogoTitulo') : 'Catálogo'}</h2><span style={{ fontSize: '13px', color: '#64748b' }}>{t ? t('catalogoSub') : 'Gerenciamento'}</span></div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{display:'flex',alignItems:'center',gap:6,color:'#94a3b8',fontSize:11,fontWeight:800}}><input type="checkbox" checked={mostrarInativos} onChange={e=>setMostrarInativos(e.target.checked)}/> {tx('Mostrar inativos','Mostrar inactivos','Show inactive')}</label>{patenteUsuario==='gerencia' && <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
            <input aria-label="SKU original" inputMode="text" placeholder="SKU (ex. SKU-63346)" value={skuHistoricoBusca} onChange={e=>setSkuHistoricoBusca(e.target.value)} style={{width:155,maxWidth:'100%',background:'#020617',color:'#f8fafc',border:'1px solid #334155',borderRadius:8,padding:'10px 8px'}}/>
            <button type="button" disabled={buscandoSkuHistorico} onClick={buscarCadastroPeloSkuAntigo} style={{background:'#164e63',color:'#e0f2fe',border:'1px solid #38bdf8',borderRadius:8,padding:'10px',fontWeight:800}}>{buscandoSkuHistorico?'Conferindo...':'Buscar SKU original'}</button>
          </div>}
          {patenteUsuario==='gerencia' && candidatoOrfaoPDV && <button type="button" disabled={liberandoOrfaoPDV} onClick={()=>setConfirmarLiberacaoOrfao(true)} style={{border:'1px solid #f59e0b',borderRadius:10,padding:'10px',background:'#422006',color:'#fde68a',fontWeight:800}}>{liberandoOrfaoPDV?'Conferindo...':'Conferir cadastro incompleto'}</button>}
          {patenteUsuario==='gerencia' && <button type="button" disabled={auditandoIndices} onClick={auditarCadastrosOriginais} title="Verifica cadastros indisponíveis sem alterar produtos ou estoque" style={{background:'#0f172a',border:'1px solid #38bdf8',color:'#e0f2fe',borderRadius:12,padding:'10px 12px',fontWeight:800,cursor:'pointer'}}>{auditandoIndices?'Conferindo...':'Recuperar produtos'}</button>}
          {patenteUsuario==='gerencia' && identidadesAuditadas.length>0 && (
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              <select aria-label="Produto para conferir" value={idOriginalSelecionado}
                onChange={e=>{setIdOriginalSelecionado(e.target.value);setDiagnosticoOriginal(null);}}
                style={{maxWidth:235,minWidth:110,background:'#020617',color:'#e0f2fe',border:'1px solid #64748b',padding:10,borderRadius:8}}>
                {identidadesAuditadas.map(x=><option key={x.produtoId} value={x.produtoId}>{x.situacao} · {x.nomes[0]||x.skus[0]||x.produtoId}</option>)}
              </select>
              <button type="button" disabled={conferindoOriginal} onClick={()=>examinarCadastroPeloId()}
                style={{border:'1px solid #38bdf8',borderRadius:8,padding:10,background:'#0c4a6e',color:'#e0f2fe',fontWeight:800}}>
                {conferindoOriginal?'Conferindo...':'Conferir cadastro'}
              </button>
            </div>
          )}
          {patenteUsuario==='gerencia' && diagnosticoOriginal?.status==='original_inativo' &&
            <button type="button" disabled={reativandoOriginal} onClick={()=>setConfirmarReativacaoOriginal(true)}
              style={{border:'1px solid #34d399',borderRadius:8,padding:10,background:'#064e3b',color:'#d1fae5',fontWeight:800}}>
              {reativandoOriginal?'Conferindo...':'Reativar este produto original'}
            </button>}
          {patenteUsuario==='gerencia' && diagnosticoOriginal?.status==='indice_sem_cadastro' &&
            <button type="button" disabled={abrindoRecomposicao} onClick={iniciarRecomposicaoOriginal}
              style={{border:'1px solid #34d399',borderRadius:8,padding:10,background:'#064e3b',color:'#d1fae5',fontWeight:800}}>
              {abrindoRecomposicao?'Conferindo...':'Completar cadastro'}
            </button>}
          <button onClick={abrirCadastroNovoProduto} style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', border: '1px solid #38bdf8', color: '#ffffff', padding: '12px 24px', borderRadius: '12px', fontSize: '13px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(2, 132, 199, 0.3)' }}>{t ? t('novoProdutoBtn') : '+ Novo Produto'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0b1120', padding: '16px 20px', borderRadius: '16px', border: '1px solid #1e293b', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <button onClick={() => setFiltroGrupo('todos')} style={{ backgroundColor: filtroGrupo === 'todos' ? '#082f49' : '#020617', color: filtroGrupo === 'todos' ? '#38bdf8' : '#94a3b8', border: `1px solid ${filtroGrupo === 'todos' ? '#0284c7' : '#1e293b'}`, borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t ? t('todosGrupos') : 'Todos'} ({produtosListaFiltrada.length})</button>
          {gruposCadastrados.map((grp) => {
            const ativo = filtroGrupo === grp;
            const qtd = produtos.filter(p => (p.grupo || 'Geral') === grp).length;
            return (
              <button key={grp} onClick={() => setFiltroGrupo(grp)} style={{ backgroundColor: ativo ? '#082f49' : '#020617', color: ativo ? '#38bdf8' : '#94a3b8', border: `1px solid ${ativo ? '#0284c7' : '#1e293b'}`, borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>{grp} ({qtd})</button>
            );
          })}
        </div>
        <input type="text" value={buscaProdutoTexto} onChange={(e) => setBuscaProdutoTexto(e.target.value)} placeholder={t ? t('buscarProd') : 'Buscar...'} style={{ width: '280px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', padding: '8px 14px', color: '#ffffff', fontSize: '13px', outline: 'none' }} />
      </div>

      {conflitosIdentidade.length > 0 && (
        <div style={{ backgroundColor: 'rgba(127,29,29,0.24)', border: '1px solid #ef4444', borderRadius: '12px', padding: '12px 16px', color: '#fecaca', fontSize: '12px', fontWeight: 800 }}>
          ⛔ Conflito de identidade detectado em {conflitosIdentidade.length} ID(s) de produto. Movimentações desses itens serão bloqueadas para impedir que um produto altere outro. Nenhum cadastro será corrigido automaticamente.
        </div>
      )}

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px' }}>{tx('Foto & SKU','Foto y SKU','Photo & SKU')}</th>
                <th style={{ padding: '16px 12px' }}>{tx('Descrição','Descripción','Description')}</th>
                <th style={{ padding: '16px 12px' }}>{tx('Grupo & Unidade','Grupo y Unidad','Group & Unit')}</th>
                <th style={{ padding: '16px 12px' }}>{tx('Localização','Ubicación','Location')}</th>
                <th style={{ padding: '16px 12px', textAlign: 'center' }}>{tx('Vitrine | Galpão','Exhibición | Depósito','Display | Warehouse')}</th>
                <th style={{ padding: '16px 12px', textAlign: 'right' }}>{tx('Custo','Costo','Cost')}</th>
                <th style={{ padding: '16px 12px', textAlign: 'right' }}>{tx('Preço Venda','Precio Venta','Sale Price')}</th>
                <th style={{ padding: '16px 12px', textAlign: 'right' }}>{tx('Atacado','Mayorista','Wholesale')}</th>
                <th style={{ padding: '16px 12px', textAlign: 'center' }}>{tx('Margem','Margen','Margin')}</th>
                <th style={{ padding: '16px 20px', textAlign: 'right' }}>{tx('Ações','Acciones','Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {produtosListaFiltrada.length === 0 ? (
                <tr><td colSpan="10" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>{tx('Nenhum produto encontrado.','Ningún producto encontrado.','No products found.')}</td></tr>
              ) : (
                produtosListaFiltrada.map((prod) => {
                  const custo = prod.custoBRL || 0; const preco = prod.precoBRL || 0; const margem = preco > 0 ? (((preco - custo) / preco) * 100).toFixed(1) : 0;
                  const ehServico = prod.tipoItem === 'servico';
                  return (
                    <tr key={`${prod.id}-${prod.sku}`} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {prod.imagem ? <img src={prod.imagem} alt={prod.nome} style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover' }} /> : <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#020617', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{ehServico ? '🛠️' : '📦'}</div>}
                          <span>{prod.sku}</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px' }}><div style={{ fontWeight: 700, color: '#ffffff', fontSize: '14px' }}>{prod.nome} {ehEncomendaUsoUnico(prod) && <span style={{ color: '#fbbf24', fontSize: '10px' }}>({tx('⭐ Encomenda','⭐ Pedido','⭐ Special Order')})</span>} {idsComConflito.has(String(prod.id)) && <span style={{ color: '#f87171', fontSize: '10px' }}>({tx('⛔ ID duplicado','⛔ ID duplicado','⛔ Duplicate ID')})</span>}</div><span style={{ fontSize: '11px', color: '#64748b' }}>{prod.marca ? `Marca: ${prod.marca}` : 'S/ Marca'}</span></td>
                      <td style={{ padding: '16px 12px' }}><span style={{ backgroundColor: '#020617', border: '1px solid #1e293b', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>{prod.grupo || 'Geral'}</span><span style={{ marginLeft: '6px', fontSize: '11px', color: '#38bdf8', fontWeight: 800 }}>[{prod.unidadeMedida || 'UN'}]</span></td>
                      <td style={{ padding: '16px 12px', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>{prod.localizacao || '—'}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        {ehServico ? <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '11px' }}>{tx('Infinito','Infinito','Infinite')}</span> : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '6px', minWidth: '150px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '9px', color: '#38bdf8', fontWeight: 900, textTransform: 'uppercase' }}>{tx('Vitrine','Exhibición','Display')}</span>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: '#0f172a', padding: '4px 6px', borderRadius: '8px', border: '1px solid #164e63' }}>
                                <button title={tx('Transferir da vitrine para o depósito','Transferir de exhibición a depósito','Transfer from display to warehouse')} onClick={() => idsComConflito.has(String(prod.id)) ? mostrarZen('danger', 'Conflito de identidade', 'Movimentação bloqueada porque este produto possui ID duplicado no catálogo.') : abrirMovimentoRapido(prod, 'vitrine', -1)} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fb7185', fontWeight: 900, cursor: 'pointer' }}>-</button>
                                <span style={{ fontWeight: 900, fontSize: '14px', minWidth: '30px', textAlign: 'center', color: '#38bdf8' }}>{prod.estoqueVitrine ?? prod.estoque ?? 0}</span>
                                <button title={tx('Transferir do depósito para a vitrine','Transferir de depósito a exhibición','Transfer from warehouse to display')} onClick={() => idsComConflito.has(String(prod.id)) ? mostrarZen('danger', 'Conflito de identidade', 'Movimentação bloqueada porque este produto possui ID duplicado no catálogo.') : abrirMovimentoRapido(prod, 'vitrine', 1)} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: '#020617', border: '1px solid #334155', color: '#34d399', fontWeight: 900, cursor: 'pointer' }}>+</button>
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '9px', color: '#a855f7', fontWeight: 900, textTransform: 'uppercase' }}>{tx('Depósito','Depósito','Warehouse')}</span>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: '#0f172a', padding: '4px 6px', borderRadius: '8px', border: '1px solid #4c1d95' }}>
                                <button title={tx('Transferir do depósito para a vitrine','Transferir de depósito a exhibición','Transfer from warehouse to display')} onClick={() => idsComConflito.has(String(prod.id)) ? mostrarZen('danger', 'Conflito de identidade', 'Movimentação bloqueada porque este produto possui ID duplicado no catálogo.') : abrirMovimentoRapido(prod, 'deposito', -1)} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fb7185', fontWeight: 900, cursor: 'pointer' }}>-</button>
                                <span style={{ fontWeight: 900, fontSize: '14px', minWidth: '30px', textAlign: 'center', color: '#a855f7' }}>{prod.estoqueGalpao ?? 0}</span>
                                <button title={tx('Transferir da vitrine para o depósito','Transferir de exhibición a depósito','Transfer from display to warehouse')} onClick={() => idsComConflito.has(String(prod.id)) ? mostrarZen('danger', 'Conflito de identidade', 'Movimentação bloqueada porque este produto possui ID duplicado no catálogo.') : abrirMovimentoRapido(prod, 'deposito', 1)} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: '#020617', border: '1px solid #334155', color: '#34d399', fontWeight: 900, cursor: 'pointer' }}>+</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', justifyContent: 'end', alignItems: 'center', gap: '4px 6px', fontSize: '12px', lineHeight: '16px', whiteSpace: 'nowrap' }}>
                          <span title={tx('Último custo do fornecedor','Último costo del proveedor','Last supplier cost')} style={{ backgroundColor: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: '4px', padding: '0 4px', fontSize: '9px', fontWeight: 800, color: '#c4b5fd', textAlign: 'center' }}>CF</span>
                          <span style={{ color: '#c4b5fd' }}>{Number.isFinite(prod.ultimoCustoFornecedorBRL) && prod.ultimoCustoFornecedorBRL >= 0 ? fmt(prod.ultimoCustoFornecedorBRL) : '—'}</span>
                          <span title={tx('Custo médio/efetivo atual','Costo medio/efectivo actual','Current average/effective cost')} style={{ backgroundColor: 'rgba(34, 211, 238, 0.08)', border: '1px solid rgba(34, 211, 238, 0.2)', borderRadius: '4px', padding: '0 4px', fontSize: '9px', fontWeight: 800, color: '#67e8f9', textAlign: 'center' }}>CMV</span>
                          <span style={{ color: '#67e8f9' }}>{fmt(custo)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, color: '#34d399', fontSize: '15px' }}>{fmt(preco)}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: prod.habilitarPreco2 ? '#38bdf8' : '#475569' }}>{prod.habilitarPreco2 && prod.preco2BRL > 0 ? fmt(prod.preco2BRL) : '—'}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}><span style={{ backgroundColor: margem >= 40 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: margem >= 40 ? '#34d399' : '#fbbf24', border: `1px solid ${margem >= 40 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`, padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{margem}%</span></td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}><div style={{display:'flex',gap:6,justifyContent:'flex-end'}}><button onClick={() => pedirExclusao(prod)} style={{background:'#2e0a16',border:'1px solid #7f1d1d',color:'#fb7185',padding:'7px 10px',borderRadius:8,fontSize:11,fontWeight:900,cursor:'pointer'}}>{prod.ativo===false?'Inativo':'Inativar'}</button><button onClick={() => abrirEdicaoProduto(prod)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#38bdf8', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>{tx('Editar','Editar','Edit')}</button></div></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalMovimento && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1700, padding: '16px' }}>
          <div style={{ width: '100%', maxWidth: '480px', backgroundColor: '#0b1120', border: '1px solid #0ea5e9', borderRadius: '20px', padding: '24px', color: '#fff' }}>
            <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 900, textTransform: 'uppercase' }}>{tx('Movimentação Auditada','Movimiento Auditado','Audited Movement')}</div>
            <h3 style={{ margin: '6px 0 6px', fontSize: '18px' }}>{modalMovimento.produto.nome}</h3>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '16px' }}>
              {modalMovimento.origem === 'vitrine' ? 'Vitrine' : 'Depósito'} → {modalMovimento.destino === 'vitrine' ? 'Vitrine' : 'Depósito'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', marginBottom: '12px' }}>
              <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>{tx('Quantidade','Cantidad','Quantity')}</label><input type="number" min="0.01" step="0.01" value={movimentoQtd} onChange={(e) => setMovimentoQtd(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '9px', boxSizing: 'border-box' }} /></div>
              <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>{tx('Motivo *','Motivo *','Reason *')}</label><select value={movimentoMotivo} onChange={(e) => setMovimentoMotivo(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '9px' }}><option>{tx('Reposição da vitrine','Reposición de exhibición','Display replenishment')}</option><option>{tx('Retorno ao depósito','Retorno al depósito','Return to warehouse')}</option><option>{tx('Organização interna','Organización interna','Internal organization')}</option><option>{tx('Inventário / conferência','Inventario / verificación','Inventory / check')}</option><option>{tx('Outro','Otro','Other')}</option></select></div>
            </div>
            <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>{tx('Observação','Observación','Note')}</label><textarea value={movimentoObs} onChange={(e) => setMovimentoObs(e.target.value)} placeholder={tx('Opcional: informe detalhes da movimentação','Opcional: informe detalles del movimiento','Optional: enter movement details')} rows="3" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '9px', boxSizing: 'border-box', resize: 'vertical' }} /></div>
            <div style={{ padding: '10px 12px', backgroundColor: '#082f49', border: '1px solid #0e7490', borderRadius: '10px', color: '#bae6fd', fontSize: '11px', marginBottom: '16px' }}>{tx('Esta ação não altera o estoque total: apenas transfere unidades entre Vitrine e Depósito e registra operador, data, motivo e saldos antes/depois.','Esta acción no altera el stock total: solo transfiere unidades entre Exhibición y Depósito y registra operador, fecha, motivo y saldos antes/después.','This action does not change total stock: it only transfers units between Display and Warehouse and records operator, date, reason and balances before/after.')}</div>
            <div style={{ display: 'flex', gap: '10px' }}><button disabled={salvandoMovimento} onClick={() => setModalMovimento(null)} style={{ flex: 1, padding: '11px', borderRadius: '9px', backgroundColor: '#1e293b', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontWeight: 800 }}>{tx('Cancelar','Cancelar','Cancel')}</button><button disabled={salvandoMovimento} onClick={confirmarMovimentoEstoque} style={{ flex: 2, padding: '11px', borderRadius: '9px', background: 'linear-gradient(135deg,#0284c7,#0369a1)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 900 }}>{salvandoMovimento ? 'Registrando...' : 'Confirmar movimentação'}</button></div>
          </div>
        </div>
      )}

      {modalProdutoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #0284c7', borderRadius: '24px', width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto', padding: '28px', boxShadow: '0 25px 50px rgba(0,0,0,0.85)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', letterSpacing: '1px', textTransform: 'uppercase' }}>{tx('Ficha Cadastral Universal','Ficha Universal','Universal Record')}</span>
                <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: '2px 0 0 0' }}>{produtoEmEdicao ? `${tx('Editar:','Editar:','Edit:')} ${produtoEmEdicao.nome}` : tx('Cadastrar Produto ou Serviço','Registrar Producto o Servicio','Register Product or Service')}</h3>
              </div>
              <button onClick={() => {setModalProdutoAberto(false);setRecomposicaoOriginal(null);}} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '18px' }}>
              {[{ id: 'mercadoria', rotulo: tx('Mercadoria Revenda','Mercadería Reventa','Resale Goods'), icone: '📦' }, { id: 'materia_prima', rotulo: tx('Matéria-Prima','Materia Prima','Raw Material'), icone: '🧪' }, { id: 'kit', rotulo: tx('Kit/Combo','Kit/Combo','Kit/Combo'), icone: '🎁' }, { id: 'servico', rotulo: tx('Serviço','Servicio','Service'), icone: '🛠️' }].map(tipo => {
                const ativo = formProduto.tipoItem === tipo.id;
                return (
                  <button key={tipo.id} type="button" onClick={() => setFormProduto({ ...formProduto, tipoItem: tipo.id })} style={{ backgroundColor: ativo ? '#082f49' : '#020617', border: `1px solid ${ativo ? '#0284c7' : '#1e293b'}`, color: ativo ? '#38bdf8' : '#94a3b8', borderRadius: '10px', padding: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span>{tipo.icone}</span><span>{tipo.rotulo}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '18px', marginBottom: '18px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{tx('Foto do Item','Foto del Ítem','Item Photo')}</label>
                <div onClick={() => fileInputRef.current?.click()} style={{ width: '130px', height: '115px', borderRadius: '12px', backgroundColor: '#020617', border: '2px dashed #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}>
                  {formProduto.imagem ? <img src={formProduto.imagem} alt="Produto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center', color: '#64748b' }}><span style={{ fontSize: '24px', display: 'block' }}>📷</span><span style={{ fontSize: '10px', fontWeight: 700 }}>{tx('Foto','Foto','Photo')}</span></div>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={lidarUploadImagem} style={{ display: 'none' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px', gap: '10px' }}>
                  <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>SKU</label><input type="text" value={formProduto.sku} onChange={(e) => setFormProduto({ ...formProduto, sku: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 800, fontSize: '13px', padding: '8px 10px', outline: 'none' }} /></div>
                  <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Nome do Item','Nombre del Ítem','Item Name')}</label><input type="text" value={formProduto.nome} onChange={(e) => setFormProduto({ ...formProduto, nome: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 700, fontSize: '13px', padding: '8px 10px', outline: 'none' }} /></div>
                  <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Unid','Unid','Unit')}</label><select value={formProduto.unidadeMedida} onChange={(e) => setFormProduto({ ...formProduto, unidadeMedida: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#38bdf8', fontSize: '12px', fontWeight: 900, padding: '8px', outline: 'none' }}><option value="UN">UN</option><option value="KG">KG</option><option value="L">L</option><option value="M">M</option><option value="M²">M²</option><option value="CX">CX</option><option value="KIT">KIT</option></select></div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Grupo','Grupo','Group')}</label><button type="button" onClick={() => setCriandoNovoGrupo(!criandoNovoGrupo)} style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}>{criandoNovoGrupo ? 'Voltar' : '+ Criar'}</button></div>
                    {criandoNovoGrupo ? <input type="text" value={novoGrupoTexto} onChange={(e) => setNovoGrupoTexto(e.target.value)} placeholder={tx('Novo grupo...','Nuevo grupo...','New group...')} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #0284c7', borderRadius: '8px', color: '#38bdf8', fontSize: '12px', padding: '8px', outline: 'none' }} /> : <select value={formProduto.grupo} onChange={(e) => setFormProduto({ ...formProduto, grupo: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontSize: '12px', padding: '8px', outline: 'none' }}>{gruposCadastrados.map(g => <option key={g} value={g}>{g}</option>)}</select>}
                  </div>
                  <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Marca','Marca','Brand')}</label><input type="text" value={formProduto.marca} onChange={(e) => setFormProduto({ ...formProduto, marca: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontSize: '12px', padding: '8px 10px', outline: 'none' }} /></div>
                  
                  {/* --- O Campo de Fornecedor dinâmico e inteligente --- */}
                  <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Fornecedor','Proveedor','Supplier')}</label>
                    <input 
                      type="text" 
                      value={formProduto.fornecedor || ''} 
                      onChange={(e) => {
                        setFormProduto({ ...formProduto, fornecedor: e.target.value });
                        setMostrarFornecedores(true);
                      }} 
                      onFocus={() => setMostrarFornecedores(true)}
                      onBlur={() => setTimeout(() => setMostrarFornecedores(false), 250)}
                      autoComplete="off"
                      placeholder={tx('Buscar...','Buscar...','Search...')}
                      style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontSize: '12px', padding: '8px 10px', outline: 'none' }} 
                    />
                    {mostrarFornecedores && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', marginTop: '4px', zIndex: 50, maxHeight: '150px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}>
                        {fornecedoresCadastrados
                          .filter(f => f.toLowerCase().includes((formProduto.fornecedor || '').toLowerCase()))
                          .map((forn) => (
                            <div 
                              // CHAVE ÚNICA DE STRING (Resolve o bug de não clicar quando digita)
                              key={forn} 
                              // EVENTO MOUSE DOWN (Resolve o bug de o campo perder o foco antes de registrar o clique)
                              onMouseDown={(e) => {
                                e.preventDefault(); // Impede que o navegador roube o foco do input
                                setFormProduto(prev => ({ ...prev, fornecedor: forn }));
                                setMostrarFornecedores(false);
                              }} 
                              style={{ padding: '8px 10px', color: '#cbd5e1', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #1e293b', transition: 'background-color 0.2s' }}
                              onMouseEnter={(e) => e.target.style.backgroundColor = '#1e293b'}
                              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                            >
                              {forn}
                            </div>
                        ))}
                        {fornecedoresCadastrados.filter(f => f.toLowerCase().includes((formProduto.fornecedor || '').toLowerCase())).length === 0 && (
                          <div style={{ padding: '8px 10px', color: '#64748b', fontSize: '11px', fontStyle: 'italic' }}>
                            {formProduto.fornecedor ? tx('Novo fornecedor...','Nuevo proveedor...','New supplier...') : tx('Nenhum salvo ainda.','Ninguno guardado aún.','None saved yet.')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* --------------------------------------------------- */}

                  <div><label style={{ fontSize: '11px', color: '#34d399', fontWeight: 800 }}>{tx('Localização Física','Ubicación Física','Physical Location')}</label><input type="text" value={formProduto.localizacao} onChange={(e) => setFormProduto({ ...formProduto, localizacao: e.target.value })} placeholder={tx('Ex: Gôndola 1, Prat. A','Ej: Góndola 1, Est. A','Ex: Aisle 1, Shelf A')} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #10b981', borderRadius: '8px', color: '#ffffff', fontSize: '12px', padding: '8px 10px', outline: 'none' }} /></div>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px 20px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '12px', alignItems: 'start', marginBottom: '8px' }}>
                <div style={{minWidth:0}}><label style={{ minHeight: '30px', display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>{tx('Custo (R$)','Costo (R$)','Cost (R$)')}</label><input type="text" value={formProduto.custoBRL} onChange={(e) => setFormProduto({ ...formProduto, custoBRL: e.target.value, precoBRL: atualizarPrecoPorCustoEMargem(e.target.value, formProduto.margemDesejada) })} onFocus={(e) => e.target.select()} style={{ width: '100%', height:'38px', boxSizing:'border-box', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontWeight: 800, fontSize: '14px', textAlign: 'right', padding: '6px 10px', outline: 'none' }} /></div>
                <div style={{minWidth:0}}><label style={{ minHeight: '30px', display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>{tx('Margem sobre venda (%)','Margen sobre venta (%)','Margin on sale (%)')}</label><input type="number" min="0" max={MAX_MARGEM_PRECO_PCT} step="0.1" value={formProduto.margemDesejada} onChange={(e) => setFormProduto({ ...formProduto, margemDesejada: e.target.value, precoBRL: atualizarPrecoPorCustoEMargem(formProduto.custoBRL, e.target.value) })} onFocus={(e) => e.target.select()} style={{ width: '100%', height:'38px', boxSizing:'border-box', backgroundColor: '#0b1120', border: `1px solid ${validarMargemPrecoVenda(formProduto.margemDesejada).ok ? '#334155' : '#f43f5e'}`, borderRadius: '8px', color: validarMargemPrecoVenda(formProduto.margemDesejada).ok ? '#fbbf24' : '#fb7185', fontWeight: 800, fontSize: '14px', textAlign: 'right', padding: '6px 10px', outline: 'none' }} /></div>
                <div style={{minWidth:0}}><label style={{ minHeight: '30px', display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>{tx('Preço Venda','Precio Venta','Sale Price')}</label><input type="text" value={formProduto.precoBRL} onChange={(e) => setFormProduto({ ...formProduto, precoBRL: e.target.value, margemDesejada: atualizarMargemPorPreco(formProduto.custoBRL, e.target.value) })} onFocus={(e) => e.target.select()} style={{ width: '100%', height:'38px', boxSizing:'border-box', backgroundColor: '#0b1120', border: '1px solid #34d399', borderRadius: '8px', color: '#34d399', fontWeight: 900, fontSize: '15px', textAlign: 'right', padding: '6px 10px', outline: 'none' }} /></div>
                <div style={{minWidth:0}}><label style={{ minHeight: '30px', display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>{tx('Vitrine / Loja','Exhibición / Tienda','Display / Store')}</label><input type="number" disabled={formProduto.tipoItem === 'servico' || Boolean(produtoEmEdicao)} value={formProduto.estoqueVitrine} onChange={(e) => setFormProduto({ ...formProduto, estoqueVitrine: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: '100%', height:'38px', boxSizing:'border-box', backgroundColor: '#0b1120', border: '1px solid #0369a1', borderRadius: '8px', color: '#38bdf8', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '6px', outline: 'none' }} /></div>
                <div style={{minWidth:0}}><label style={{ minHeight: '30px', display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#a855f7', fontWeight: 700 }}>{tx('Galpão / Depósito','Depósito / Almacén','Warehouse / Storage')}</label><input type="number" disabled={formProduto.tipoItem === 'servico' || Boolean(produtoEmEdicao)} value={formProduto.estoqueGalpao} onChange={(e) => setFormProduto({ ...formProduto, estoqueGalpao: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: '100%', height:'38px', boxSizing:'border-box', backgroundColor: '#0b1120', border: '1px solid #7e22ce', borderRadius: '8px', color: '#a855f7', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '6px', outline: 'none' }} /></div>
              </div>
              <div style={{fontSize:'9px',color:'#64748b',margin:'0 0 10px'}}>{tx('Margem calculada sobre a venda. Máx. 99,9%. Ex.: custo 10 + margem 40% = venda 16,67.','Margen calculada sobre la venta. Máx. 99,9%. Ej.: costo 10 + margen 40% = venta 16,67.','Margin calculated on sale price. Max. 99.9%. Ex.: cost 10 + 40% margin = sale 16.67.')}</div>
              <div style={{ borderTop: '1px solid #1e293b', paddingTop: '10px', display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={formProduto.habilitarPreco2} onChange={(e) => setFormProduto({ ...formProduto, habilitarPreco2: e.target.checked })} style={{ cursor: 'pointer' }} /><label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>{tx('Preço 2 (Atacado)','Precio 2 (Mayorista)','Price 2 (Wholesale)')}</label>{formProduto.habilitarPreco2 && <input type="text" value={formProduto.preco2BRL} onChange={(e) => setFormProduto({ ...formProduto, preco2BRL: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: '90px', backgroundColor: '#0b1120', border: '1px solid #38bdf8', borderRadius: '6px', color: '#38bdf8', fontWeight: 800, fontSize: '12px', textAlign: 'right', padding: '4px 8px', outline: 'none' }} />}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={formProduto.habilitarPreco3} onChange={(e) => setFormProduto({ ...formProduto, habilitarPreco3: e.target.checked })} style={{ cursor: 'pointer' }} /><label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>{tx('Preço 3 (Distrib.)','Precio 3 (Distrib.)','Price 3 (Distributor)')}</label>{formProduto.habilitarPreco3 && <input type="text" value={formProduto.preco3BRL} onChange={(e) => setFormProduto({ ...formProduto, preco3BRL: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: '90px', backgroundColor: '#0b1120', border: '1px solid #818cf8', borderRadius: '6px', color: '#818cf8', fontWeight: 800, fontSize: '12px', textAlign: 'right', padding: '4px 8px', outline: 'none' }} />}</div>
              </div>
            </div>

            <div style={{ backgroundColor: '#070d19', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
              <div onClick={() => setSecaoFiscalExpandida(!secaoFiscalExpandida)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', cursor: 'pointer', backgroundColor: secaoFiscalExpandida ? '#0c1527' : '#070d19', borderBottom: secaoFiscalExpandida ? '1px solid #1e293b' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '14px' }}>⚖️</span><span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8' }}>{tx('Parâmetros Fiscais (NCM / DNIT / IVA)','Parámetros Fiscales (NCM / DNIT / IVA)','Fiscal Parameters (NCM / DNIT / VAT)')}</span></div>
                <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 900 }}>{secaoFiscalExpandida ? '▲ Recolher' : '▼ Expandir'}</span>
              </div>
              {secaoFiscalExpandida && (
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button type="button" onClick={() => setPaisRegulamentoFiscal('BR')} style={{ backgroundColor: paisRegulamentoFiscal === 'BR' ? '#064e3b' : '#020617', border: `1px solid ${paisRegulamentoFiscal === 'BR' ? '#10b981' : '#334155'}`, color: paisRegulamentoFiscal === 'BR' ? '#34d399' : '#94a3b8', padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>{tx('🇧🇷 Brasil (NCM)','🇧🇷 Brasil (NCM)','🇧🇷 Brazil (NCM)')}</button>
                    <button type="button" onClick={() => setPaisRegulamentoFiscal('PY')} style={{ backgroundColor: paisRegulamentoFiscal === 'PY' ? '#1e1b4b' : '#020617', border: `1px solid ${paisRegulamentoFiscal === 'PY' ? '#6366f1' : '#334155'}`, color: paisRegulamentoFiscal === 'PY' ? '#a5b4fc' : '#94a3b8', padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>🇵🇾 {tx('Paraguai (DNIT)','Paraguay (DNIT)','Paraguay (DNIT)')}</button>
                  </div>
                  {paisRegulamentoFiscal === 'BR' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>NCM</label><input type="text" value={formProduto.ncm} onChange={(e) => setFormProduto({ ...formProduto, ncm: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>CEST</label><input type="text" value={formProduto.cest} onChange={(e) => setFormProduto({ ...formProduto, cest: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>{tx('CFOP Saída','CFOP Salida','CFOP Output')}</label><input type="text" value={formProduto.cfop} onChange={(e) => setFormProduto({ ...formProduto, cfop: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>{tx('Origem','Origen','Origin')}</label><select value={formProduto.origem} onChange={(e) => setFormProduto({ ...formProduto, origem: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '11px', padding: '8px', outline: 'none' }}><option value="0">{tx('0 - Nacional','0 - Nacional','0 - Domestic')}</option><option value="1">{tx('1 - Importada','1 - Importada','1 - Imported')}</option></select></div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>{tx('Código DNIT','Código DNIT','DNIT Code')}</label><input type="text" value={formProduto.codigoDnit} onChange={(e) => setFormProduto({ ...formProduto, codigoDnit: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>{tx('Taxa IVA (PY)','Tasa IVA (PY)','VAT Rate (PY)')}</label><select value={formProduto.ivaParaguai} onChange={(e) => setFormProduto({ ...formProduto, ivaParaguai: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }}><option value="10">10%</option><option value="5">5%</option><option value="0">{tx('Isento','Exento','Exempt')}</option></select></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>{tx('Unidade SIFEN','Unidad SIFEN','SIFEN Unit')}</label><select value={formProduto.unidadMedidaPy} onChange={(e) => setFormProduto({ ...formProduto, unidadMedidaPy: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }}><option value="UNI">{tx('Unidade','Unidad','Unit')}</option><option value="GL">{tx('Galão','Galón','Gallon')}</option><option value="LT">{tx('Litro','Litro','Liter')}</option></select></div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {produtoEmEdicao && (
              <div style={{ backgroundColor: '#070d19', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
                <div onClick={alternarHistorico} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', cursor: 'pointer', backgroundColor: historicoExpandido ? '#0c1527' : '#070d19', borderBottom: historicoExpandido ? '1px solid #1e293b' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>🧾</span><span style={{ fontSize: '12px', fontWeight: 900, color: '#cbd5e1' }}>{tx('Histórico de Movimentações de Estoque','Historial de Movimientos de Stock','Stock Movement History')}</span></div>
                  <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 900 }}>{historicoExpandido ? '▲ Recolher' : '▼ Expandir'}</span>
                </div>
                {historicoExpandido && (
                  <div style={{ padding: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Plano:','Plan:','Plan:')} <span style={{ color: '#38bdf8' }}>{obterPoliticaHistoricoEstoque(planoLoja).rotulo}</span></div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>{tx('Janela consultável: últimos','Ventana consultable: últimos','Available window: last')} {obterPoliticaHistoricoEstoque(planoLoja).dias} {tx('dias. A exclusão física automática não é feita nesta ATT.','días. La eliminación física automática no se realiza en esta ATT.','days. Automatic physical deletion is not performed in this ATT.')}</div>
                      </div>
                      <button type="button" onClick={() => carregarHistoricoProduto(produtoEmEdicao.id)} style={{ backgroundColor: '#082f49', border: '1px solid #0284c7', color: '#38bdf8', borderRadius: '8px', padding: '7px 12px', fontWeight: 800, cursor: 'pointer' }}>{tx('Atualizar','Actualizar','Refresh')}</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>{tx('De','Desde','From')}</label><input type="date" value={filtroHistoricoInicio} onChange={(e) => setFiltroHistoricoInicio(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '8px', boxSizing: 'border-box' }} /></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>{tx('Até','Hasta','To')}</label><input type="date" value={filtroHistoricoFim} onChange={(e) => setFiltroHistoricoFim(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '8px', boxSizing: 'border-box' }} /></div>
                      <div style={{ display: 'flex', alignItems: 'end' }}><button type="button" onClick={() => carregarHistoricoProduto(produtoEmEdicao.id)} style={{ width: '100%', backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', borderRadius: '8px', padding: '8px', fontWeight: 800, cursor: 'pointer' }}>{tx('Filtrar datas','Filtrar fechas','Filter dates')}</button></div>
                    </div>
                    {carregandoHistorico ? (
                      <div style={{ color: '#94a3b8', padding: '20px', textAlign: 'center' }}>{tx('Carregando histórico...','Cargando historial...','Loading history...')}</div>
                    ) : historicoMovimentos.length === 0 ? (
                      <div style={{ color: '#64748b', padding: '20px', textAlign: 'center', backgroundColor: '#020617', borderRadius: '10px' }}>{tx('Nenhuma movimentação registrada dentro do período disponível.','Ningún movimiento registrado en el período disponible.','No movement recorded in the available period.')}</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                        {historicoMovimentos.map((mov) => (
                          <div key={mov.id} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '10px', padding: '10px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                              <strong style={{ color: '#e2e8f0', fontSize: '12px' }}>{mov.tipo === 'transferencia_interna' ? `↔ ${tx('Transferência interna','Transferencia interna','Internal transfer')}` : mov.tipo === 'venda' ? `🛒 ${tx('Venda','Venta','Sale')}` : mov.tipo === 'devolucao' ? `↩ ${tx('Devolução','Devolución','Return')}` : mov.tipo === 'compra_entrada' ? `📦 ${tx('Entrada de compra','Entrada de compra','Purchase entry')}` : mov.tipo}</strong>
                              <span style={{ color: '#64748b', fontSize: '10px' }}>{mov.createdAt ? new Date(mov.createdAt).toLocaleString('pt-BR') : '—'}</span>
                            </div>
                            <div style={{ marginTop: '6px', color: '#cbd5e1', fontSize: '11px' }}>
                              <span style={{ color: '#38bdf8', fontWeight: 800 }}>{mov.quantidade}</span> un. • {mov.origem || 'externo'} → {mov.destino || '—'} • {mov.motivo || 'Sem motivo'}
                            </div>
                            <div style={{ marginTop: '4px', color: '#64748b', fontSize: '10px' }}>{tx('Operador:','Operador:','Operator:')} {mov.operadorNome || '—'}{mov.referenciaId ? ` • Ref.: ${mov.referenciaId}` : ''}</div>
                            {mov.saldoAntes && mov.saldoDepois && <div style={{ marginTop: '4px', color: '#94a3b8', fontSize: '10px' }}>Antes V/D/T: {mov.saldoAntes.vitrine}/{mov.saldoAntes.deposito}/{mov.saldoAntes.total} → Depois: {mov.saldoDepois.vitrine}/{mov.saldoDepois.deposito}/{mov.saldoDepois.total}</div>}
                            {mov.observacao && <div style={{ marginTop: '4px', color: '#94a3b8', fontSize: '10px' }}>Obs.: {mov.observacao}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setModalProdutoAberto(false)} style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', color: '#94a3b8', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>{tx('Cancelar','Cancelar','Cancel')}</button>
              {recomposicaoOriginal && <label style={{flex:2,display:'flex',alignItems:'center',gap:8,color:'#e0f2fe',fontSize:12}}>
                <input aria-label="Conferi o estoque físico" type="checkbox" checked={estoqueRecompostoConferido}
                  onChange={e=>setEstoqueRecompostoConferido(e.target.checked)}/>
                Conferi as quantidades físicas e os preços deste produto
              </label>}
              <button onClick={salvarProduto} style={{ flex: 2, background: 'linear-gradient(135deg, #0284c7, #0369a1)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}>{tx('Salvar Produto no Sistema','Guardar Producto en el Sistema','Save Product in System')}</button>
            </div>
          </div>
        </div>
      )}
    
      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} detalhes={modalZen?.detalhes} apenasConfirmar={true} onConfirmar={()=>setModalZen(null)} onCancelar={()=>setModalZen(null)} />
      <ZenModal aberto={confirmarReativacaoOriginal} variante="warning"
        titulo="Reativar produto desativado"
        mensagem="Confirme que o estoque físico está correto. A reativação mantém os valores e o código já cadastrados. Se houver qualquer alteração simultânea, a operação será bloqueada."
        detalhes={diagnosticoOriginal?.produto?[
          `Produto: ${diagnosticoOriginal.produto.nome}`,
          `SKU: ${diagnosticoOriginal.produto.sku}`,
          `Saldo registrado: ${diagnosticoOriginal.produto.estoque??'não informado'}`,
        ]:[]}
        confirmarTexto="Confirmar reativação do original" cancelarTexto="Cancelar"
        onConfirmar={reativarProdutoOriginal} onCancelar={()=>setConfirmarReativacaoOriginal(false)} />
      <ZenModal aberto={confirmarLiberacaoOrfao} variante="warning" titulo="Conferir cadastro incompleto"
        mensagem="A confirmação só será permitida se não houver outro cadastro nem movimentações vinculadas. Nenhuma alteração será feita se faltar alguma informação."
        detalhes={candidatoOrfaoPDV?[`SKU: ${candidatoOrfaoPDV.sku}`]:[]}
        confirmarTexto="Conferir e liberar se seguro" cancelarTexto="Cancelar"
        onConfirmar={executarLiberacaoOrfaoPDV} onCancelar={()=>setConfirmarLiberacaoOrfao(false)} />

      {modalExcluir && <div style={{position:'fixed',inset:0,zIndex:20000,background:'rgba(2,6,23,.88)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><div style={{maxWidth:480,width:'100%',background:'#0b1120',border:'1px solid #f43f5e',borderRadius:22,padding:22,color:'#fff'}}><div style={{display:'flex',gap:12,alignItems:'center'}}><img src="/logo-zenos.png?v=4" style={{width:46,height:46,objectFit:'contain'}}/><div><div style={{color:'#fb7185',fontSize:11,fontWeight:900}}>{tx('AÇÃO GERENCIAL','ACCIÓN GERENCIAL','MANAGEMENT ACTION')}</div><h3 style={{margin:'3px 0'}}>{tx('Inativar / excluir produto','Inactivar / eliminar producto','Deactivate / delete product')}</h3></div></div><p style={{color:'#cbd5e1',fontSize:13,lineHeight:1.5}}>{tx('Se o produto já participou de venda ou compra, ele será apenas','Si el producto ya participó de una venta o compra, será solamente','If the product has already been used in a sale or purchase, it will only be')} <b>{tx('inativado','inactivado','deactivated')}</b> {tx('para preservar o histórico. Exclusão física só ocorre em cadastro sem uso.','para preservar el historial. La eliminación física solo ocurre en registros sin uso.','to preserve history. Physical deletion only occurs for unused records.')}</p><input type="text" autoComplete="one-time-code" name="zenos-product-manager-pin" data-lpignore="true" data-1p-ignore="true" value={senhaExclusao} onChange={e=>setSenhaExclusao(e.target.value)} placeholder={tx('PIN do Administrador / Gerência','PIN del Administrador / Gerencia','Administrator / Management PIN')} style={{width:'100%',WebkitTextSecurity:'disc',boxSizing:'border-box',padding:12,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#fff'}}/><div style={{display:'flex',gap:10,marginTop:14}}><button onClick={()=>setModalExcluir(null)} style={{flex:1,padding:11,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#cbd5e1'}}>{tx('Cancelar','Cancelar','Cancel')}</button><button onClick={confirmarExclusao} style={{flex:1,padding:11,borderRadius:10,border:'none',background:'#e11d48',color:'#fff',fontWeight:900}}>{tx('Confirmar','Confirmar','Confirm')}</button></div></div></div>}
</div>
  );
}
