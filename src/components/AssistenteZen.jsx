import React, { useState, useEffect, useRef, useMemo } from 'react';

/**
 * AssistenteZen - Assistente Inteligente Integrado do ZenOS
 * Atua como copiloto onisciente no sistema, respeitando perfil e permissões do usuário logado.
 */
export default function AssistenteZen({
  operadorAtivo,
  patenteUsuario,
  temPermissao,
  produtos = [],
  historicoVendas = [],
  clientes = [],
  despesas = [],
  fornecedores = [],
  navegarPara,
  ecraAtual,
  fmt = (v) => `R$ ${Number(v || 0).toFixed(2)}`,
  tx = (pt) => pt,
  moeda = 'BRL'
}) {
  const [aberto, setAberto] = useState(false);
  const [inputTexto, setInputTexto] = useState('');
  const [mensagens, setMensagens] = useState(() => [
    {
      id: 'msg-welcome',
      tipo: 'assistente',
      texto: `Olá! Sou seu assistente ZenOS. Posso navegar por qualquer tela, consultar estoque, analisar os produtos mais vendidos e sugerir reposição. Como posso te ajudar agora?`,
      chips: [
        { label: '📊 Mais vendidos (semana)', comando: 'mais vendidos da semana' },
        { label: '⚠️ O que repor no estoque?', comando: 'o que precisa de reposicao' },
        { label: '💰 Vendas de hoje', comando: 'quanto vendemos hoje' },
        { label: '🛒 Abrir PDV', comando: 'abrir pdv' },
        { label: '📦 Ver Estoque', comando: 'abrir produtos' },
      ]
    }
  ]);
  const [digitando, setDigitando] = useState(false);
  const fimChatRef = useRef(null);
  const inputRef = useRef(null);

  // Rolagem suave para a última mensagem
  useEffect(() => {
    if (aberto) {
      fimChatRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [mensagens, aberto]);

  // Atalho de teclado: Ctrl + Espaço ou Ctrl + J abre/fecha o assistente
  useEffect(() => {
    const lidarAtalho = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyJ' || e.code === 'Space')) {
        e.preventDefault();
        setAberto(v => !v);
      }
    };
    window.addEventListener('keydown', lidarAtalho);
    return () => window.removeEventListener('keydown', lidarAtalho);
  }, []);

  // Normalização de texto para interpretação de comandos
  const normalizar = (txt) => {
    return String(txt || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  // Motor de Inteligência Local (Compreensão de Linguagem Natural & Permissões)
  const processarComando = (textoOriginal) => {
    const raw = normalizar(textoOriginal);
    const operadorNome = operadorAtivo?.nome || 'Operador';
    const isGerente = patenteUsuario === 'gerencia' || operadorAtivo?.id === 'admin' || operadorAtivo?.permissoes?.admin;

    // 1. NAVEGAÇÃO DE TELAS
    if (raw.includes('abrir pdv') || raw.includes('ir pro pdv') || raw.includes('ir para o pdv') || raw.includes('fazer venda') || raw.includes('nova venda') || raw === 'pdv' || raw === 'vender' || raw === 'caixa') {
      if (!temPermissao('pdv')) {
        return {
          texto: `Acesso negado: o perfil de **${operadorNome}** não tem permissão para acessar o **PDV**.`,
          tipo: 'erro'
        };
      }
      navegarPara('pdv');
      return {
        texto: `Abrindo a tela de **PDV Balcão de Vendas** agora mesmo!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para PDV', exec: () => navegarPara('pdv') }
      };
    }

    if (raw.includes('abrir compra') || raw.includes('ir para compras') || raw.includes('entrada de estoque') || raw.includes('compras') || raw.includes('lancar compra')) {
      if (!temPermissao('produtos')) {
        return {
          texto: `Acesso negado: o perfil de **${operadorNome}** não tem permissão para Entrada / Compras.`,
          tipo: 'erro'
        };
      }
      navegarPara('compras');
      return {
        texto: `Abrindo a tela de **Entrada / Compras de Mercadorias**!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para Compras', exec: () => navegarPara('compras') }
      };
    }

    if (raw.includes('abrir produto') || raw.includes('ver produto') || raw.includes('catalogo') || raw === 'produtos' || raw === 'estoque') {
      if (!temPermissao('produtos')) {
        return {
          texto: `Acesso negado: o perfil de **${operadorNome}** não tem permissão para o catálogo de **Produtos & Estoque**.`,
          tipo: 'erro'
        };
      }
      navegarPara('produtos');
      return {
        texto: `Abrindo a tela de **Produtos & Estoque**!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para Produtos', exec: () => navegarPara('produtos') }
      };
    }

    if (raw.includes('abrir cliente') || raw.includes('ver cliente') || raw.includes('fiado') || raw === 'clientes') {
      if (!temPermissao('clientes')) {
        return {
          texto: `Acesso negado: o perfil de **${operadorNome}** não tem permissão para **Clientes & Fiado**.`,
          tipo: 'erro'
        };
      }
      navegarPara('clientes');
      return {
        texto: `Abrindo a tela de **Clientes & Fiado**!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para Clientes', exec: () => navegarPara('clientes') }
      };
    }

    if (raw.includes('abrir venda') || raw.includes('relatorio de venda') || raw.includes('historico de venda') || raw === 'vendas') {
      if (!temPermissao('vendas')) {
        return {
          texto: `Acesso negado: o perfil de **${operadorNome}** não tem permissão para o relatório de **Vendas & Devoluções**.`,
          tipo: 'erro'
        };
      }
      navegarPara('vendas');
      return {
        texto: `Abrindo o histórico de **Vendas & Devoluções**!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para Vendas', exec: () => navegarPara('vendas') }
      };
    }

    if (raw.includes('despesa') || raw.includes('contas a pagar') || raw.includes('contas')) {
      if (!temPermissao('despesas')) {
        return {
          texto: `Acesso negado: o perfil de **${operadorNome}** não tem permissão para **Contas a Pagar / Despesas**.`,
          tipo: 'erro'
        };
      }
      navegarPara('despesas');
      return {
        texto: `Abrindo **Contas a Pagar / Despesas**!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para Despesas', exec: () => navegarPara('despesas') }
      };
    }

    if (raw.includes('fornecedor')) {
      if (!temPermissao('produtos')) {
        return {
          texto: `Acesso negado: permissão necessária para gerenciar **Fornecedores**.`,
          tipo: 'erro'
        };
      }
      navegarPara('fornecedores');
      return {
        texto: `Abrindo a tela de **Fornecedores**!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para Fornecedores', exec: () => navegarPara('fornecedores') }
      };
    }

    if (raw.includes('mesa') || raw.includes('comanda')) {
      if (!temPermissao('mesas')) {
        return {
          texto: `Acesso negado: sem permissão para **Mesas / Comandas**.`,
          tipo: 'erro'
        };
      }
      navegarPara('mesas');
      return {
        texto: `Abrindo o mapa de **Mesas / Comandas**!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para Mesas', exec: () => navegarPara('mesas') }
      };
    }

    if (raw.includes('inteligencia') || raw.includes('curva abc')) {
      if (!temPermissao('inteligencia')) {
        return {
          texto: `Acesso negado: sem permissão para **Inteligência / Curva ABC**.`,
          tipo: 'erro'
        };
      }
      navegarPara('inteligencia');
      return {
        texto: `Abrindo a tela de **Estoque Inteligente & Curva ABC**!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para Inteligência', exec: () => navegarPara('inteligencia') }
      };
    }

    if (raw.includes('configurac') || raw.includes('ajuste') || raw.includes('config')) {
      if (!temPermissao('admin')) {
        return {
          texto: `Acesso restrito: apenas a Gerência/Administrador pode abrir as **Configurações**.`,
          tipo: 'erro'
        };
      }
      navegarPara('configuracoes');
      return {
        texto: `Abrindo as **Configurações do Sistema**!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para Configurações', exec: () => navegarPara('configuracoes') }
      };
    }

    if (raw.includes('inicio') || raw.includes('dashboard') || raw.includes('home') || raw.includes('hub') || raw.includes('turno')) {
      navegarPara('hub');
      return {
        texto: `Levando você para a **Tela Inicial (Hub / Turno de Caixa)**!`,
        tipo: 'sucesso',
        acao: { rotulo: 'Ir para Início', exec: () => navegarPara('hub') }
      };
    }

    // 2. CADASTRO GUIADO (CONFIRMAÇÃO)
    if (raw.includes('cadastrar produto') || raw.includes('novo produto') || raw.includes('adicionar produto')) {
      if (!temPermissao('produtos')) {
        return {
          texto: `Você não possui permissão para cadastrar novos produtos.`,
          tipo: 'erro'
        };
      }
      return {
        texto: `Deseja abrir o formulário para **cadastrar um novo produto** no estoque agora?`,
        tipo: 'pergunta',
        acao: {
          rotulo: 'Sim, cadastrar produto',
          exec: () => {
            navegarPara('produtos');
          }
        }
      };
    }

    if (raw.includes('cadastrar cliente') || raw.includes('novo cliente') || raw.includes('adicionar cliente')) {
      if (!temPermissao('clientes')) {
        return {
          texto: `Você não possui permissão para cadastrar novos clientes.`,
          tipo: 'erro'
        };
      }
      return {
        texto: `Deseja abrir o cadastro de um **novo cliente** agora?`,
        tipo: 'pergunta',
        acao: {
          rotulo: 'Sim, cadastrar cliente',
          exec: () => {
            navegarPara('clientes');
          }
        }
      };
    }

    // 3. ANÁLISE DE MAIS VENDIDOS (HOJE / SEMANA / MÊS)
    if (raw.includes('mais vend') || raw.includes('campeoes de venda') || raw.includes('top vend') || raw.includes('o que mais sa') || raw.includes('ranking')) {
      if (!temPermissao('vendas') && !temPermissao('inteligencia') && !isGerente) {
        return {
          texto: `Acesso restrito: seu perfil não tem permissão para consultar dados consolidados de vendas.`,
          tipo: 'erro'
        };
      }

      const hoje = new Date();
      const diasFiltro = raw.includes('hoje') ? 1 : raw.includes('mes') || raw.includes('30 dia') ? 30 : 7;
      const dataLimite = new Date(hoje.getTime() - diasFiltro * 24 * 60 * 60 * 1000);

      const vendasFiltradas = historicoVendas.filter(v => {
        if (v.estado === 'cancelada') return false;
        const d = v.createdAt ? new Date(v.createdAt) : null;
        if (!d || isNaN(d.getTime())) return true; // se não tiver data parseável, inclui
        return d >= dataLimite;
      });

      // Agrupar itens vendidos
      const rankingMap = {};
      vendasFiltradas.forEach(venda => {
        if (!Array.isArray(venda.itens)) return;
        venda.itens.forEach(it => {
          const chave = it.nome || 'Produto sem nome';
          const qtd = parseInt(it.qtd) || 0;
          const valor = (parseFloat(it.precoPraticadoBRL) || 0) * qtd;
          if (!rankingMap[chave]) {
            rankingMap[chave] = { nome: chave, qtd: 0, total: 0, produtoId: it.produtoId || it.id };
          }
          rankingMap[chave].qtd += qtd;
          rankingMap[chave].total += valor;
        });
      });

      const ranking = Object.values(rankingMap).sort((a, b) => b.qtd - a.qtd).slice(0, 5);

      if (ranking.length === 0) {
        return {
          texto: `Não encontrei vendas registradas no período ${diasFiltro === 1 ? 'de hoje' : diasFiltro === 30 ? 'dos últimos 30 dias' : 'dos últimos 7 dias'}.`,
          tipo: 'info'
        };
      }

      let resposta = `🏆 **Top Produtos Mais Vendidos (${diasFiltro === 1 ? 'Hoje' : diasFiltro === 30 ? 'Últimos 30 dias' : 'Últimos 7 dias'}):**\n\n`;
      ranking.forEach((item, idx) => {
        const prodAtual = produtos.find(p => p.nome === item.nome || p.id === item.produtoId);
        const estoqueRestante = prodAtual ? prodAtual.estoque : '?';
        const alertaEstoque = prodAtual && prodAtual.estoque <= 5 ? ` ⚠️ *(Estoque baixo: ${estoqueRestante} un)*` : ` *(Estoque: ${estoqueRestante} un)*`;
        resposta += `**${idx + 1}º ${item.nome}**\n• ${item.qtd} unidades vendidas | Total: ${fmt(item.total, moeda)}${alertaEstoque}\n\n`;
      });

      return {
        texto: resposta,
        tipo: 'analise',
        acao: {
          rotulo: 'Ver Estoque Completo',
          exec: () => navegarPara('produtos')
        }
      };
    }

    // 4. ALERTA E CÁLCULO DE REPOSIÇÃO DE ESTOQUE
    if (raw.includes('reposi') || raw.includes('repor') || raw.includes('estoque baixo') || raw.includes('acabando') || raw.includes('comprar mais') || raw.includes('falta')) {
      if (!temPermissao('produtos') && !isGerente) {
        return {
          texto: `Acesso restrito: seu perfil não tem permissão para consultar estoque e compras.`,
          tipo: 'erro'
        };
      }

      // Vendas dos últimos 7 dias para calcular ritmo de vendas
      const umaSemanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const vendasRecentes = historicoVendas.filter(v => {
        if (v.estado === 'cancelada') return false;
        const d = v.createdAt ? new Date(v.createdAt) : null;
        return !d || isNaN(d.getTime()) || d >= umaSemanaAtras;
      });

      const vendasPorItem = {};
      vendasRecentes.forEach(v => {
        if (Array.isArray(v.itens)) {
          v.itens.forEach(it => {
            const k = it.nome || it.produtoId;
            vendasPorItem[k] = (vendasPorItem[k] || 0) + (parseInt(it.qtd) || 0);
          });
        }
      });

      // Filtra produtos com estoque crítico (<= 5) e ativos
      const itensRepor = produtos
        .filter(p => (p.ativo !== false) && p.tipoItem !== 'servico' && !p.usoUnicoEncomendado && (p.estoque || 0) <= 5)
        .map(p => {
          const vendas7d = vendasPorItem[p.nome] || vendasPorItem[p.id] || 0;
          // Sugestão de reposição: cobrir pelo menos 2 semanas com base na última semana ou mínimo de 10
          const estoqueAtual = p.estoque || 0;
          const metaEstoque = vendas7d > 0 ? Math.max(10, vendas7d * 2) : 10;
          const sugerido = Math.max(5, metaEstoque - estoqueAtual);
          return {
            ...p,
            vendas7d,
            sugerido
          };
        })
        .sort((a, b) => (b.vendas7d || 0) - (a.vendas7d || 0));

      if (itensRepor.length === 0) {
        return {
          texto: `✅ **Estoque em dia!** Não encontrei nenhum produto ativo com estoque crítico (menor ou igual a 5 unidades).`,
          tipo: 'sucesso'
        };
      }

      const topRepor = itensRepor.slice(0, 5);
      let resposta = `⚠️ **Itens com Estoque Baixo que Precisam de Reposição:**\n\n`;
      topRepor.forEach((item, idx) => {
        resposta += `**${idx + 1}. ${item.nome}** (SKU: ${item.sku || 'N/A'})\n`;
        resposta += `• Estoque Atual: **${item.estoque || 0} un**\n`;
        resposta += `• Vendas recentes: ${item.vendas7d} un na semana\n`;
        resposta += `• 👉 **Sugestão de Compra: Repor +${item.sugerido} unidades**\n\n`;
      });

      if (itensRepor.length > 5) {
        resposta += `*E mais outros ${itensRepor.length - 5} produtos com estoque baixo.*`;
      }

      return {
        texto: resposta,
        tipo: 'alerta',
        acao: {
          rotulo: '📥 Abrir Entrada / Compras para Repor',
          exec: () => navegarPara('compras')
        }
      };
    }

    // 5. RESUMO DE VENDAS DE HOJE
    if (raw.includes('vendi hoje') || raw.includes('vendas de hoje') || raw.includes('quanto vendemos') || raw.includes('resumo do dia') || raw.includes('total de hoje')) {
      if (!temPermissao('vendas') && !temPermissao('pdv') && !isGerente) {
        return {
          texto: `Acesso negado: você não tem permissão para consultar o resumo de vendas.`,
          tipo: 'erro'
        };
      }

      const inicioHoje = new Date();
      inicioHoje.setHours(0, 0, 0, 0);

      const vendasHoje = historicoVendas.filter(v => {
        if (v.estado === 'cancelada') return false;
        const d = v.createdAt ? new Date(v.createdAt) : null;
        return d && !isNaN(d.getTime()) && d >= inicioHoje;
      });

      const totalFaturado = vendasHoje.reduce((acc, v) => acc + (parseFloat(v.totalBRL) || 0), 0);
      const qtdPedidos = vendasHoje.length;
      const ticketMedio = qtdPedidos > 0 ? totalFaturado / qtdPedidos : 0;

      return {
        texto: `📊 **Resumo de Vendas de Hoje:**\n\n• Total Faturado: **${fmt(totalFaturado, moeda)}**\n• Pedidos Realizados: **${qtdPedidos} vendas**\n• Ticket Médio: **${fmt(ticketMedio, moeda)}**`,
        tipo: 'analise',
        acao: {
          rotulo: 'Ver Detalhes das Vendas',
          exec: () => navegarPara('vendas')
        }
      };
    }

    // 6. BUSCA DE PRODUTO ESPECÍFICO (ESTOQUE OU PREÇO)
    // Ex: "quanto tem de cerveja?", "estoque coca cola", "preco da tinta"
    const termosBusca = raw
      .replace(/quanto\s+(tem|custa|vale|sai|e)/g, '')
      .replace(/(estoque|saldo|preco|valor|de|do|da|temos|tem|procurar|achar|ver|saldo)/g, '')
      .trim();

    if (termosBusca.length >= 3) {
      const produtosEncontrados = produtos.filter(p => {
        const nomeNorm = normalizar(p.nome);
        const skuNorm = normalizar(p.sku);
        return nomeNorm.includes(termosBusca) || skuNorm.includes(termosBusca);
      }).slice(0, 4);

      if (produtosEncontrados.length > 0) {
        let resposta = `📦 **Encontrei ${produtosEncontrados.length} produto(s) correspondente(s):**\n\n`;
        produtosEncontrados.forEach(p => {
          const precoVenda = p.preco1BRL || p.precoVendaBRL || p.precoBalcao || 0;
          resposta += `**${p.nome}**\n• Estoque: **${p.estoque ?? 0} unidades**\n• Preço: **${fmt(precoVenda, moeda)}**\n`;
          if (isGerente && p.custoBRL) {
            resposta += `• Custo: ${fmt(p.custoBRL, moeda)} | Margem: ${p.margemLucro || p.margem || 'N/A'}%\n`;
          }
          resposta += `• SKU: \`${p.sku || 'Sem SKU'}\`\n\n`;
        });

        return {
          texto: resposta,
          tipo: 'info',
          acao: {
            rotulo: 'Abrir no Catálogo',
            exec: () => navegarPara('produtos')
          }
        };
      }
    }

    // 7. RESPOSTA PADRÃO / CONVERSACIONAL COM SUGESTÕES
    return {
      texto: `Entendi o que você digitou! Como assistente do ZenOS, posso realizar as seguintes tarefas para você:\n\n• **Navegar:** Digite *"abrir pdv"*, *"ir para compras"*, *"ver clientes"*, *"abrir despesas"*, etc.\n• **Inteligência:** Pergunte *"o que mais vendeu na semana?"* ou *"o que precisa de reposição?"*.\n• **Estoque e Preço:** Pergunte *"estoque de [nome do produto]"*.\n• **Faturamento:** Pergunte *"quanto vendemos hoje?"*.`,
      tipo: 'ajuda',
      chips: [
        { label: '📊 Mais Vendidos', comando: 'mais vendidos da semana' },
        { label: '⚠️ Reposição Estoque', comando: 'o que precisa de reposicao' },
        { label: '🛒 Abrir PDV', comando: 'abrir pdv' },
        { label: '📦 Ver Estoque', comando: 'abrir produtos' },
      ]
    };
  };

  const enviarMensagem = (textoEnvio) => {
    const texto = (textoEnvio || inputTexto).trim();
    if (!texto) return;

    const novaMsgUsuario = {
      id: `usr-${Date.now()}`,
      tipo: 'usuario',
      texto: texto
    };

    setMensagens(prev => [...prev, novaMsgUsuario]);
    setInputTexto('');
    setDigitando(true);

    setTimeout(() => {
      const respostaProcessada = processarComando(texto);
      const novaMsgAssistente = {
        id: `ast-${Date.now()}`,
        tipo: 'assistente',
        texto: respostaProcessada.texto,
        subtipo: respostaProcessada.tipo,
        acao: respostaProcessada.acao,
        chips: respostaProcessada.chips
      };
      setMensagens(prev => [...prev, novaMsgAssistente]);
      setDigitando(false);
    }, 280);
  };

  return (
    <>
      {/* BOTÃO FLUTUANTE DE ATIVAÇÃO DA IA */}
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        title="Assistente Zen AI (Ctrl + Espaço)"
        style={{
          position: 'fixed',
          bottom: '22px',
          right: '22px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 18px',
          borderRadius: '999px',
          border: '1px solid rgba(129, 140, 248, 0.4)',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          color: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.5), 0 8px 10px -6px rgba(124, 58, 237, 0.5)',
          cursor: 'pointer',
          fontWeight: 800,
          fontSize: '14px',
          letterSpacing: '0.4px',
          transition: 'all 0.2s ease-in-out',
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <span style={{ fontSize: '18px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>✨</span>
        <span>Zen AI</span>
        <span style={{
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          padding: '2px 7px',
          borderRadius: '12px',
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase'
        }}>
          Copiloto
        </span>
      </button>

      {/* PAINEL / JANELA DO CHAT */}
      {aberto && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '22px',
            width: '430px',
            maxWidth: 'calc(100vw - 36px)',
            height: '620px',
            maxHeight: 'calc(100vh - 110px)',
            backgroundColor: '#0b1120',
            border: '1px solid #312e81',
            borderRadius: '20px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 20px rgba(99, 102, 241, 0.2)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}
        >
          {/* CABEÇALHO */}
          <div style={{
            padding: '16px 18px',
            background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                boxShadow: '0 4px 10px rgba(99, 102, 241, 0.4)'
              }}>
                ✨
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>
                    Assistente Zen AI
                  </h4>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '6px',
                    background: '#10b981',
                    color: '#ffffff',
                    letterSpacing: '0.5px'
                  }}>
                    ATIVO
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  Operador: <strong style={{ color: '#cbd5e1' }}>{operadorAtivo?.nome || 'Admin'}</strong>
                  {patenteUsuario === 'gerencia' && <span style={{ color: '#a855f7', marginLeft: '5px' }}>(Gerência)</span>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setAberto(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  borderRadius: '8px',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Fechar"
              >
                ✕
              </button>
            </div>
          </div>

          {/* FEED DE MENSAGENS */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            backgroundColor: '#020617'
          }}>
            {mensagens.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.tipo === 'usuario' ? 'flex-end' : 'flex-start',
                  maxWidth: '100%'
                }}
              >
                <div
                  style={{
                    maxWidth: '88%',
                    padding: '12px 14px',
                    borderRadius: msg.tipo === 'usuario' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    backgroundColor: msg.tipo === 'usuario'
                      ? '#4f46e5'
                      : msg.subtipo === 'erro'
                      ? 'rgba(239, 68, 68, 0.15)'
                      : msg.subtipo === 'alerta'
                      ? 'rgba(245, 158, 11, 0.15)'
                      : '#1e293b',
                    border: msg.tipo === 'usuario'
                      ? 'none'
                      : msg.subtipo === 'erro'
                      ? '1px solid #ef4444'
                      : msg.subtipo === 'alerta'
                      ? '1px solid #f59e0b'
                      : '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {/* Formatação simples de Markdown: negrito e quebras */}
                  {msg.texto.split('\n').map((linha, lIdx) => (
                    <div key={lIdx} style={{ marginBottom: linha === '' ? '8px' : '2px' }}>
                      {linha.includes('**') ? (
                        linha.split('**').map((trecho, tIdx) => (
                          tIdx % 2 === 1 ? <strong key={tIdx} style={{ color: '#ffffff' }}>{trecho}</strong> : trecho
                        ))
                      ) : (
                        linha
                      )}
                    </div>
                  ))}

                  {/* AÇÃO RÁPIDA DENTRO DA MENSAGEM */}
                  {msg.acao && (
                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          msg.acao.exec();
                          setAberto(false);
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px 14px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
                        }}
                      >
                        <span>➔</span> {msg.acao.rotulo}
                      </button>
                    </div>
                  )}
                </div>

                {/* CHIPS DE SUGESTÃO (SE HOUVER) */}
                {msg.chips && msg.chips.length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    marginTop: '8px',
                    maxWidth: '100%'
                  }}>
                    {msg.chips.map((chip, cIdx) => (
                      <button
                        key={cIdx}
                        type="button"
                        onClick={() => enviarMensagem(chip.comando)}
                        style={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '14px',
                          padding: '5px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#93c5fd',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#1e293b';
                          e.currentTarget.style.borderColor = '#60a5fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#0f172a';
                          e.currentTarget.style.borderColor = '#334155';
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {digitando && (
              <div style={{
                alignSelf: 'flex-start',
                backgroundColor: '#1e293b',
                padding: '8px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>Consultando o sistema...</span>
              </div>
            )}
            <div ref={fimChatRef} />
          </div>

          {/* CAMPO DE ENTRADA */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviarMensagem();
            }}
            style={{
              padding: '12px',
              backgroundColor: '#0f172a',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              gap: '8px'
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputTexto}
              onChange={(e) => setInputTexto(e.target.value)}
              placeholder="Digite um comando ou pergunta..."
              style={{
                flex: 1,
                backgroundColor: '#020617',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '10px 14px',
                color: '#ffffff',
                fontSize: '13px',
                outline: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = '#6366f1'}
              onBlur={(e) => e.target.style.borderColor = '#334155'}
            />
            <button
              type="submit"
              disabled={!inputTexto.trim()}
              style={{
                background: inputTexto.trim() ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : '#1e293b',
                border: 'none',
                borderRadius: '10px',
                padding: '0 16px',
                color: inputTexto.trim() ? '#ffffff' : '#64748b',
                fontWeight: 800,
                fontSize: '13px',
                cursor: inputTexto.trim() ? 'pointer' : 'default',
                transition: 'all 0.15s ease'
              }}
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
