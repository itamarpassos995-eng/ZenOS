import React, { useState, useEffect, useRef, useMemo } from "react";
import "./ZenAssistenteIA.css";

export default function ZenAssistenteIA({
  aberto,
  onFechar,
  onAbrir,
  operadorAtivo,
  patenteUsuario,
  temPermissao,
  navegarPara,
  onAbrirCaixa,
  produtos = [],
  historicoVendas = [],
  clientes = [],
  despesas = [],
  caixaMovimentos = [],
  sessoesCaixa = [],
  sessaoAtiva,
  moeda = "BRL",
  fmt = (v) => `R$ ${Number(v || 0).toFixed(2)}`,
  tx = (pt) => pt,
  saldoSessaoFisicoBRL = 0,
}) {
  const [inputTexto, setInputTexto] = useState("");
  const [gravandoVoz, setGravandoVoz] = useState(false);
  const [mensagens, setMensagens] = useState([]);
  const fimMensagensRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  const nomeOperador = operadorAtivo?.nome || "Operador";
  const ehGerente = patenteUsuario === "gerencia" || operadorAtivo?.id === "admin";

  // Mensagem inicial de boas-vindas
  useEffect(() => {
    if (mensagens.length === 0) {
      setMensagens([
        {
          id: "welcome",
          remetente: "assistant",
          hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          texto: `Olá, ${nomeOperador}! Sou o **Zen IA**, seu copiloto de gestão em tempo real. Você pode me perguntar qualquer coisa, buscar clientes pelo nome, consultar estoques ou pedir para abrir telas e operações.`,
          chips: [
            ...(!sessaoAtiva ? [{ label: "🔓 Abrir turno de caixa", comando: "abrir caixa" }] : []),
            { label: "🏆 Mais vendidos hoje", comando: "o que mais vendeu hoje" },
            { label: "⚠️ O que preciso repor?", comando: "o que preciso repor no estoque" },
            { label: "🛒 Abrir PDV Balcão", comando: "abrir pdv" },
            { label: "👥 Quem deve fiado?", comando: "clientes com fiado" },
            { label: "➕ Cadastrar cliente", comando: "cadastrar cliente" },
            { label: "➕ Cadastrar produto", comando: "cadastrar produto" },
            { label: "💵 Saldo da gaveta", comando: "saldo do caixa" },
          ]
        }
      ]);
    }
  }, [nomeOperador, sessaoAtiva]);

  // Rola até o fim da lista de mensagens
  useEffect(() => {
    if (aberto) {
      setTimeout(() => {
        fimMensagensRef.current?.scrollIntoView({ behavior: "smooth" });
        inputRef.current?.focus();
      }, 150);
    }
  }, [aberto, mensagens]);

  // Atalho de teclado global Ctrl+K ou Cmd+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (aberto) onFechar();
        else onAbrir();
      } else if (e.key === "Escape" && aberto) {
        onFechar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [aberto, onAbrir, onFechar]);

  // Configuração da API de Reconhecimento de Voz (Web Speech API)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "pt-BR";

      recognition.onresult = (event) => {
        const transcricao = event.results[0][0].transcript;
        if (transcricao) {
          setInputTexto(transcricao);
          setGravandoVoz(false);
          processarComando(transcricao);
        }
      };

      recognition.onerror = () => setGravandoVoz(false);
      recognition.onend = () => setGravandoVoz(false);

      recognitionRef.current = recognition;
    }
  }, []);

  const alternarVoz = () => {
    if (!recognitionRef.current) {
      responderIA("🎙️ Reconhecimento de voz não suportado pelo seu navegador.");
      return;
    }

    if (gravandoVoz) {
      recognitionRef.current.stop();
      setGravandoVoz(false);
    } else {
      try {
        recognitionRef.current.start();
        setGravandoVoz(true);
      } catch (err) {
        console.error("Erro ao iniciar voz:", err);
      }
    }
  };

  // CÁLCULO DE VENDAS E MAIS VENDIDOS
  const calcularMaisVendidos = (periodo = "hoje") => {
    const agora = new Date();
    const dataHojeFormatada = agora.toLocaleDateString();

    const vendasFiltradas = historicoVendas.filter((venda) => {
      if (!venda || venda.estado === "cancelado") return false;
      if (!ehGerente && venda.vendedorId && venda.vendedorId !== operadorAtivo?.id) {
        return false;
      }
      if (periodo === "geral") return true;

      const dataVendaStr = venda.dataHora || venda.createdAt;
      if (!dataVendaStr) return false;
      const dataVenda = new Date(dataVendaStr);

      if (periodo === "hoje") {
        return dataVenda.toLocaleDateString() === dataHojeFormatada;
      }
      if (periodo === "semana") {
        const diffDias = (agora.getTime() - dataVenda.getTime()) / (1000 * 3600 * 24);
        return diffDias <= 7;
      }
      return true;
    });

    const mapaProdutos = new Map();

    vendasFiltradas.forEach((venda) => {
      const itens = Array.isArray(venda.itens)
        ? venda.itens
        : Array.isArray(venda.itensDocumento)
        ? venda.itensDocumento
        : [];

      itens.forEach((it) => {
        const prodId = it.produtoId || it.produtoOriginalId || it.id || it.sku || it.nome;
        const nome = it.nome || "Item sem nome";
        const qtd = Number(it.qtd || it.quantidade || 1);
        const preco = Number(it.precoPraticadoBRL || it.precoBRL || it.subtotal || 0);
        const faturamento = preco * (it.precoPraticadoBRL ? qtd : 1);

        if (!mapaProdutos.has(prodId)) {
          mapaProdutos.set(prodId, {
            id: prodId,
            nome,
            sku: it.sku || it.produtoOriginalSku || "",
            qtdTotal: 0,
            faturamentoBRL: 0,
          });
        }
        const itemAtual = mapaProdutos.get(prodId);
        itemAtual.qtdTotal += qtd;
        itemAtual.faturamentoBRL += faturamento;
      });
    });

    const ranking = Array.from(mapaProdutos.values())
      .sort((a, b) => b.qtdTotal - a.qtdTotal)
      .map((item) => {
        const prodCadastrado = produtos.find(
          (p) => String(p.id) === String(item.id) || (p.sku && p.sku === item.sku)
        );
        return {
          ...item,
          estoqueAtual: prodCadastrado?.estoque ?? "N/D",
          precoAtualBRL: prodCadastrado?.precoBRL ?? 0,
        };
      });

    return { ranking, totalVendas: vendasFiltradas.length };
  };

  // CÁLCULO DE SUGESTÃO DE REPOSIÇÃO
  const calcularSugestaoReposicao = () => {
    const agora = new Date();
    const mapaVendas15d = new Map();

    historicoVendas.forEach((venda) => {
      if (!venda || venda.estado === "cancelado") return false;
      const dataVendaStr = venda.dataHora || venda.createdAt;
      if (!dataVendaStr) return;
      const diffDias = (agora.getTime() - new Date(dataVendaStr).getTime()) / (1000 * 3600 * 24);
      if (diffDias > 15) return;

      const itens = Array.isArray(venda.itens)
        ? venda.itens
        : Array.isArray(venda.itensDocumento)
        ? venda.itensDocumento
        : [];

      itens.forEach((it) => {
        const prodId = it.produtoId || it.produtoOriginalId || it.id || it.sku;
        const qtd = Number(it.qtd || it.quantidade || 1);
        mapaVendas15d.set(prodId, (mapaVendas15d.get(prodId) || 0) + qtd);
      });
    });

    const sugestoes = [];

    (produtos || []).forEach((prod) => {
      if (!prod || prod.ativo === false) return;
      const estoque = Number(prod.estoque ?? 0);
      const vendas15d = mapaVendas15d.get(prod.id) || (prod.sku ? mapaVendas15d.get(prod.sku) : 0) || 0;
      const giroDiario = vendas15d / 15;
      const estoqueSeguranca = Math.max(3, Math.ceil(giroDiario * 7));

      if (estoque === 0) {
        const sugestaoQtd = Math.max(5, Math.ceil(giroDiario * 15));
        sugestoes.push({
          produto: prod,
          estoqueAtual: 0,
          vendas15d,
          sugestaoQtd,
          custoEstimadoBRL: (prod.custoBRL || 0) * sugestaoQtd,
          status: "critico",
        });
      } else if (estoque < estoqueSeguranca) {
        const sugestaoQtd = Math.max(1, estoqueSeguranca * 2 - estoque);
        sugestoes.push({
          produto: prod,
          estoqueAtual: estoque,
          vendas15d,
          sugestaoQtd,
          custoEstimadoBRL: (prod.custoBRL || 0) * sugestaoQtd,
          status: "baixo",
        });
      }
    });

    return sugestoes.sort((a, b) => {
      if (a.status === "critico" && b.status !== "critico") return -1;
      if (b.status === "critico" && a.status !== "critico") return 1;
      return b.vendas15d - a.vendas15d;
    });
  };

  // CÁLCULO DE RESUMO DE HOJE
  const calcularResumoHoje = () => {
    const hojeStr = new Date().toLocaleDateString();
    const vendasHoje = historicoVendas.filter((v) => {
      if (!v || v.estado === "cancelado") return false;
      if (!ehGerente && v.vendedorId && v.vendedorId !== operadorAtivo?.id) return false;
      const d = v.dataHora || v.createdAt;
      return d ? new Date(d).toLocaleDateString() === hojeStr : false;
    });

    const totalFaturadoBRL = vendasHoje.reduce((acc, v) => acc + Number(v.totalBRL || 0), 0);
    const qtdPedidos = vendasHoje.length;
    const ticketMedio = qtdPedidos > 0 ? totalFaturadoBRL / qtdPedidos : 0;

    return { totalFaturadoBRL, qtdPedidos, ticketMedio };
  };

  // CLIENTES COM FIADO
  const obterClientesFiado = () => {
    return (clientes || [])
      .filter((c) => (c?.saldoDevedorBRL || 0) > 0)
      .sort((a, b) => (b.saldoDevedorBRL || 0) - (a.saldoDevedorBRL || 0));
  };

  // BUSCA UNIVERSAL DE REFERÊNCIAS (CLIENTES E PRODUTOS)
  const buscarReferencias = (termoBruto) => {
    let termo = (termoBruto || "").toLowerCase().trim();
    if (!termo) return { clientesEncontrados: [], produtosEncontrados: [] };

    // Limpa palavras comuns de comando para isolar o termo real
    const prefixos = [
      "abrir cliente", "buscar cliente", "cliente", "ver cliente", "acha cliente", "procura cliente",
      "abrir produto", "buscar produto", "produto", "ver produto", "acha produto", "procura produto",
      "abrir", "buscar", "ver", "procurar", "acha"
    ];
    for (const p of prefixos) {
      if (termo.startsWith(p + " ")) {
        termo = termo.slice(p.length).trim();
        break;
      }
    }

    if (!termo) termo = termoBruto.toLowerCase().trim();

    // Busca em clientes
    const clientesEncontrados = (clientes || []).filter((c) => {
      if (!c) return false;
      const nome = (c.nome || "").toLowerCase();
      const doc = (c.documento || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const tel = (c.telefone || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const email = (c.email || "").toLowerCase();
      const termoLimpo = termo.replace(/[^a-z0-9]/g, "");

      return (
        nome.includes(termo) ||
        (termoLimpo.length >= 3 && doc.includes(termoLimpo)) ||
        (termoLimpo.length >= 4 && tel.includes(termoLimpo)) ||
        email.includes(termo)
      );
    });

    // Busca em produtos
    const produtosEncontrados = (produtos || []).filter((p) => {
      if (!p || p.ativo === false) return false;
      const nome = (p.nome || "").toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      const grupo = (p.grupo || "").toLowerCase();
      const cod = (p.codigoBarras || "").toLowerCase();

      return (
        nome.includes(termo) ||
        (sku && sku.includes(termo)) ||
        (cod && cod.includes(termo)) ||
        grupo.includes(termo)
      );
    });

    return {
      termoPesquisado: termo,
      clientesEncontrados: clientesEncontrados.slice(0, 4),
      produtosEncontrados: produtosEncontrados.slice(0, 4),
      totalClientes: clientesEncontrados.length,
      totalProdutos: produtosEncontrados.length,
    };
  };

  // NAVEGAÇÃO SEGURA POR PERMISSÃO
  const executarNavegacaoSegura = (modulo, nomeLegivel, acaoAposNavegar) => {
    if (!temPermissao(modulo)) {
      return {
        ok: false,
        mensagem: `🔒 Seu perfil não possui permissão para acessar **${nomeLegivel}**. Solicite acesso à gerência.`
      };
    }
    navegarPara(modulo);
    if (typeof acaoAposNavegar === "function") {
      setTimeout(acaoAposNavegar, 100);
    }
    return {
      ok: true,
      mensagem: `🚀 Abrindo **${nomeLegivel}** agora mesmo!`
    };
  };

  // AÇÕES DE INTERAÇÃO DIRETA
  const abrirFichaCliente = (cli) => {
    if (!temPermissao("clientes")) {
      responderIA("🔒 Seu usuário não possui acesso ao módulo de Clientes.");
      return;
    }
    navegarPara("clientes");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("zenos:abrir-cliente", { detail: cli }));
    }, 120);
    onFechar();
  };

  const vincularClienteAoPDV = (cli) => {
    if (!temPermissao("pdv")) {
      responderIA("🔒 Seu usuário não possui acesso ao PDV Balcão.");
      return;
    }
    navegarPara("pdv");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("zenos:selecionar-cliente-pdv", { detail: cli }));
    }, 120);
    onFechar();
  };

  const verHistoricoComprasCliente = (cli) => {
    const compras = (historicoVendas || []).filter((v) => {
      if (!v || v.estado === "cancelado") return false;
      return (
        String(v.clienteId) === String(cli.id) ||
        (v.clienteNome && v.clienteNome.toLowerCase() === cli.nome.toLowerCase())
      );
    });

    if (compras.length === 0) {
      responderIA(
        `📜 O cliente **${cli.nome}** ainda não possui compras registradas no histórico.`,
        [
          { label: "🛒 Vender para ele no PDV", comando: `vincular ${cli.nome} no pdv` },
          { label: "👤 Ver ficha cadastral", comando: `abrir cliente ${cli.nome}` }
        ]
      );
      return;
    }

    const totalGasto = compras.reduce((acc, c) => acc + Number(c.totalBRL || 0), 0);
    const ultimaCompra = compras[0];

    responderIA(
      `📜 **Histórico de Compras de ${cli.nome}:**
` +
      `• Total de Compras Realizadas: **${compras.length} pedido(s)**
` +
      `• Total Gasto no Estabelecimento: **${fmt(totalGasto)}**
` +
      `• Última Compra: **${ultimaCompra?.dataHora || "Data recente"}** (${fmt(ultimaCompra?.totalBRL || 0)})`,
      [
        { label: "🛒 Abrir PDV com este cliente", comando: `vincular ${cli.nome} no pdv` },
        { label: "👤 Abrir Ficha Cadastral", comando: `abrir cliente ${cli.nome}` }
      ]
    );
  };

  const abrirFichaProduto = (prod) => {
    if (!temPermissao("produtos")) {
      responderIA("🔒 Seu usuário não possui acesso ao módulo de Produtos e Estoque.");
      return;
    }
    navegarPara("produtos");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("zenos:abrir-produto", { detail: prod }));
    }, 120);
    onFechar();
  };

  const adicionarProdutoAoPDV = (prod) => {
    if (!temPermissao("pdv")) {
      responderIA("🔒 Seu usuário não possui acesso ao PDV Balcão.");
      return;
    }
    navegarPara("pdv");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("zenos:adicionar-item-pdv", { detail: prod }));
    }, 120);
    onFechar();
  };

  // DISPARO DA ABERTURA DO TURNO DE CAIXA
  const dispararAberturaCaixa = () => {
    if (typeof onAbrirCaixa === "function") {
      onAbrirCaixa();
    }
    onFechar();
  };

  // PROCESSADOR CENTRAL DE LINGUAGEM NATURAL E COMANDOS
  const processarComando = (textoBruto) => {
    const texto = (textoBruto || "").trim();
    if (!texto) return;

    const horaAtual = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Adiciona pergunta do usuário na lista
    const novaMensagemUsuario = {
      id: `user-${Date.now()}`,
      remetente: "user",
      hora: horaAtual,
      texto: texto
    };

    setMensagens((prev) => [...prev, novaMensagemUsuario]);
    setInputTexto("");

    const tLower = texto.toLowerCase();

    // 1. ABERTURA / STATUS DO CAIXA
    if (
      tLower.includes("abrir caixa") ||
      tLower.includes("abertura de caixa") ||
      tLower.includes("abrir turno") ||
      tLower.includes("iniciar turno") ||
      tLower.includes("abrir o caixa") ||
      tLower.includes("começar turno")
    ) {
      if (sessaoAtiva) {
        responderIA(
          `O turno de caixa já está **Aberto ✅** por **${sessaoAtiva.operadorNome || "Operador"}**.
` +
          `• Abertura: **${sessaoAtiva.abertura || "Hoje"}**
` +
          `• Saldo inicial informado: **${fmt(sessaoAtiva.saldoInicial || 0)}**
` +
          `• Saldo estimado na gaveta: **${fmt(saldoSessaoFisicoBRL)}**`,
          [
            { label: "🛒 Ir para o PDV Balcão", comando: "abrir pdv" },
            { label: "💰 Vendas de hoje", comando: "quanto vendemos hoje" }
          ]
        );
        return;
      }

      responderIA(
        `O turno de caixa está **Fechado ⚠️** no momento.
` +
        `Você pode abrir o caixa agora mesmo sem sair do PDV e sem perder nenhum item do seu carrinho!`,
        [
          { label: "🛒 Abrir PDV Balcão", comando: "abrir pdv" }
        ],
        { tipo: "abrir_caixa" }
      );
      return;
    }

    // AVISO PROATIVO: SE TENTAR VENDER OU FINALIZAR E O CAIXA ESTIVER FECHADO
    if ((tLower.includes("fechar venda") || tLower.includes("finalizar pedido") || tLower.includes("liquidar")) && !sessaoAtiva) {
      responderIA(
        `⚠️ **Atenção:** O caixa ainda está fechado, então o PDV não conseguirá liquidar a venda.
` +
        `Deseja abrir o caixa agora mesmo? Seus itens no PDV não serão perdidos!`,
        [],
        { tipo: "abrir_caixa" }
      );
      return;
    }

    // 2. MAIS VENDIDOS / GIRO
    if (
      tLower.includes("mais vendido") ||
      tLower.includes("mais vendida") ||
      tLower.includes("o que mais vendeu") ||
      tLower.includes("top produtos") ||
      tLower.includes("campeoes de venda") ||
      tLower.includes("campeões")
    ) {
      if (!temPermissao("vendas") && !temPermissao("pdv") && !ehGerente) {
        responderIA(`🔒 Seu operador não possui permissão para consultar histórico e relatórios de vendas.`);
        return;
      }

      let periodo = "hoje";
      if (tLower.includes("semana") || tLower.includes("7 dias")) periodo = "semana";
      else if (tLower.includes("geral") || tLower.includes("sempre") || tLower.includes("mes") || tLower.includes("mês")) periodo = "geral";

      const { ranking, totalVendas } = calcularMaisVendidos(periodo);
      const rotuloPeriodo = periodo === "hoje" ? "Hoje" : periodo === "semana" ? "Últimos 7 dias" : "Todo o Histórico";

      if (ranking.length === 0) {
        responderIA(`Não há registros de vendas concluídas no período (**${rotuloPeriodo}**).`, [
          { label: "📅 Ver na semana", comando: "mais vendidos na semana" },
          { label: "📊 Ver no geral", comando: "mais vendidos no geral" },
          { label: "🛒 Abrir PDV Balcão", comando: "abrir pdv" }
        ]);
        return;
      }

      const top5 = ranking.slice(0, 5);

      responderIA(
        `🏆 **Top Campeões de Venda (${rotuloPeriodo}):**
Foram realizadas **${totalVendas} vendas** ${!ehGerente ? "(apenas suas vendas)" : ""}.`,
        [
          { label: "⚠️ O que preciso repor?", comando: "o que repor no estoque" },
          { label: "📅 Ver mais vendidos na semana", comando: "mais vendidos na semana" },
          { label: "📦 Ir para Estoque", comando: "abrir produtos" }
        ],
        {
          tipo: "ranking_vendas",
          itens: top5,
          onAcaoPrincipal: () => navegarPara("produtos"),
          rotuloAcaoPrincipal: "📦 Ver todos no Estoque"
        }
      );
      return;
    }

    // 3. REPOSIÇÃO DE ESTOQUE / O QUE COMPRAR / ESTOQUE BAIXO
    if (
      tLower.includes("repor") ||
      tLower.includes("reposi") ||
      tLower.includes("o que comprar") ||
      tLower.includes("comprar mercadoria") ||
      tLower.includes("estoque baixo") ||
      tLower.includes("estoque acabando") ||
      tLower.includes("zerado") ||
      tLower.includes("falta no estoque") ||
      tLower.includes("falta estoque")
    ) {
      if (!temPermissao("produtos")) {
        responderIA(`🔒 Seu perfil não possui acesso ao módulo de **Produtos e Estoque**.`);
        return;
      }

      const itens = calcularSugestaoReposicao();

      if (itens.length === 0) {
        responderIA(`✅ **Excelente notícia!** Todos os produtos ativos estão com estoque adequado e acima da margem de segurança baseada nas vendas dos últimos 15 dias.`, [
          { label: "📦 Ver catálogo de produtos", comando: "abrir produtos" },
          { label: "🏆 Mais vendidos hoje", comando: "o que mais vendeu hoje" }
        ]);
        return;
      }

      const criticos = itens.filter((i) => i.status === "critico");
      const baixos = itens.filter((i) => i.status === "baixo");

      responderIA(
        `⚠️ **Sugestão Inteligente de Reposição:**
Encontrei **${itens.length} produto(s)** que precisam de compra imediata (${criticos.length} zerado(s) e ${baixos.length} com estoque crítico/baixo).`,
        [
          { label: "📥 Ir para PDV Compras (Entrada)", comando: "abrir compras" },
          { label: "📦 Ver Produtos & Estoque", comando: "abrir produtos" }
        ],
        {
          tipo: "sugestao_reposicao",
          itens: itens.slice(0, 6),
          onAcaoPrincipal: () => navegarPara("compras"),
          rotuloAcaoPrincipal: "📥 Fazer Entrada no PDV Compras"
        }
      );
      return;
    }

    // 4. FATURAMENTO / VENDAS DE HOJE
    if (
      tLower.includes("quanto faturou") ||
      tLower.includes("faturamento") ||
      tLower.includes("quanto vend") ||
      tLower.includes("vendas hoje") ||
      tLower.includes("total de hoje") ||
      tLower.includes("ticket medio") ||
      tLower.includes("ticket médio") ||
      tLower.includes("resumo do dia")
    ) {
      if (!temPermissao("vendas") && !ehGerente) {
        responderIA(`🔒 Consulta de faturamento diário restrita à gerência ou operadores com permissão de vendas.`);
        return;
      }

      const { totalFaturadoBRL, qtdPedidos, ticketMedio } = calcularResumoHoje();

      responderIA(
        `💰 **Resumo de Vendas Hoje (${new Date().toLocaleDateString()}):**
` +
        `• Total Faturado: **${fmt(totalFaturadoBRL)}**
` +
        `• Pedidos Finalizados: **${qtdPedidos} venda(s)**
` +
        `• Ticket Médio: **${fmt(ticketMedio)}**`,
        [
          { label: "🏆 Campeões de Venda Hoje", comando: "o que mais vendeu hoje" },
          { label: "💵 Ver Saldo da Gaveta", comando: "saldo da gaveta" },
          { label: "📑 Abrir Histórico de Vendas", comando: "abrir vendas" }
        ]
      );
      return;
    }

    // 5. CLIENTES COM FIADO / CONTAS A RECEBER
    if (
      tLower.includes("fiado") ||
      tLower.includes("devedor") ||
      tLower.includes("quem deve") ||
      tLower.includes("saldo devedor") ||
      tLower.includes("contas a receber") ||
      tLower.includes("cobrança") ||
      tLower.includes("cobranca")
    ) {
      if (!temPermissao("clientes")) {
        responderIA(`🔒 Seu usuário não possui acesso ao módulo de **Clientes e Fiado**.`);
        return;
      }

      const devedores = obterClientesFiado();
      const totalFiadoBRL = devedores.reduce((acc, c) => acc + (c.saldoDevedorBRL || 0), 0);

      if (devedores.length === 0) {
        responderIA(`🎉 **Tudo em dia!** Não há clientes com saldo devedor ou fiado em aberto no momento.`, [
          { label: "👥 Abrir Lista de Clientes", comando: "abrir clientes" },
          { label: "🛒 Ir para o PDV", comando: "abrir pdv" }
        ]);
        return;
      }

      responderIA(
        `👥 **Clientes com Saldo Devedor (Fiado em Aberto):**
` +
        `Existem **${devedores.length} cliente(s)** com pendência, totalizando **${fmt(totalFiadoBRL)}** a receber.`,
        [
          { label: "📋 Abrir Clientes para Baixa/Cobrança", comando: "abrir clientes" },
          { label: "💰 Resumo do Dia", comando: "quanto vendemos hoje" }
        ],
        {
          tipo: "fiado_clientes",
          itens: devedores.slice(0, 5),
          onAcaoPrincipal: () => navegarPara("clientes"),
          rotuloAcaoPrincipal: "📋 Abrir Tela de Clientes & Contas"
        }
      );
      return;
    }

    // 6. CAIXA / TURNO / GAVETA (STATUS GERAL)
    if (
      tLower.includes("gaveta") ||
      tLower.includes("saldo do caixa") ||
      tLower.includes("saldo da gaveta") ||
      tLower.includes("dinheiro no caixa") ||
      tLower.includes("sangria") ||
      tLower.includes("suprimento")
    ) {
      if (!temPermissao("pdv")) {
        responderIA(`🔒 Seu operador não tem acesso às operações de caixa.`);
        return;
      }

      responderIA(
        `💵 **Status do Caixa & Gaveta:**
` +
        `• Turno Atual: **${sessaoAtiva ? "Turno Aberto ✅" : "Turno Fechado ⚠️"}**
` +
        `• Saldo Físico Calculado na Gaveta: **${fmt(saldoSessaoFisicoBRL)}**
` +
        `• Operador Responsável: **${nomeOperador}**`,
        [
          ...(!sessaoAtiva ? [{ label: "🔓 Abrir turno de caixa", comando: "abrir caixa" }] : []),
          { label: "🛒 Abrir PDV Balcão", comando: "abrir pdv" },
          { label: "💰 Vendas de hoje", comando: "quanto vendemos hoje" },
          ...(temPermissao("admin") ? [{ label: "🏦 Auditoria Geral de Caixas", comando: "abrir auditoria de caixas" }] : [])
        ]
      );
      return;
    }

    // 7. ABERTURA DIRETA DE CADASTROS (Produto / Cliente)
    if (
      tLower.includes("cadastrar produto") ||
      tLower.includes("novo produto") ||
      tLower.includes("adicionar produto") ||
      tLower.includes("criar produto")
    ) {
      const res = executarNavegacaoSegura("produtos", "Produtos & Estoque", () => {
        window.dispatchEvent(new CustomEvent("zenos:abrir-novo-produto"));
      });
      responderIA(`${res.mensagem}
✨ *Dica: Já posicionei o formulário de cadastro pronto para você preencher.*`);
      return;
    }

    if (
      tLower.includes("cadastrar cliente") ||
      tLower.includes("novo cliente") ||
      tLower.includes("adicionar cliente") ||
      tLower.includes("criar cliente")
    ) {
      const res = executarNavegacaoSegura("clientes", "Clientes & Fiado", () => {
        window.dispatchEvent(new CustomEvent("zenos:abrir-novo-cliente"));
      });
      responderIA(`${res.mensagem}
✨ *Dica: Já posicionei o formulário de novo cliente na tela.*`);
      return;
    }

    // 8. NAVEGAÇÃO ENTRE TELAS DO SISTEMA
    if (tLower.includes("abrir pdv") || tLower.includes("ir pro pdv") || tLower.includes("ir para pdv") || tLower.includes("ir pro caixa") || tLower.includes("frente de caixa")) {
      const res = executarNavegacaoSegura("pdv", "PDV Balcão");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("abrir compras") || tLower.includes("pdv compras") || tLower.includes("entrada de mercadoria") || tLower.includes("dar entrada")) {
      const res = executarNavegacaoSegura("compras", "PDV Compras / Entrada de Mercadoria");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("abrir produtos") || tLower.includes("ir para produtos") || tLower.includes("tela de produtos") || tLower.includes("ver estoque")) {
      const res = executarNavegacaoSegura("produtos", "Produtos & Estoque");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("abrir clientes") || tLower.includes("ir para clientes") || tLower.includes("tela de clientes")) {
      const res = executarNavegacaoSegura("clientes", "Clientes & Fiado");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("abrir vendas") || tLower.includes("historico de vendas") || tLower.includes("histórico de vendas")) {
      const res = executarNavegacaoSegura("vendas", "Histórico de Vendas");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("abrir fornecedores") || tLower.includes("ir para fornecedores")) {
      const res = executarNavegacaoSegura("fornecedores", "Fornecedores");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("abrir mesas") || tLower.includes("comandas")) {
      const res = executarNavegacaoSegura("mesas", "Mesas / Comandas");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("abrir fiscal") || tLower.includes("ir para fiscal") || tLower.includes("nfe")) {
      const res = executarNavegacaoSegura("fiscal", "Módulo Fiscal / NF-e");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("abrir configur") || tLower.includes("configurações") || tLower.includes("ajustes")) {
      const res = executarNavegacaoSegura("configuracoes", "Configurações do Sistema");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("abrir comiss") || tLower.includes("comissões")) {
      const res = executarNavegacaoSegura("comissoes", "Comissões de Vendedores");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("auditoria") || tLower.includes("auditoria de caixas")) {
      const res = executarNavegacaoSegura("auditoria_caixas", "Auditoria Geral de Caixas");
      responderIA(res.mensagem);
      return;
    }

    if (tLower.includes("ir para o inicio") || tLower.includes("ir para o início") || tLower.includes("abrir hub") || tLower.includes("dashboard") || tLower.includes("painel")) {
      navegarPara("hub");
      responderIA("🏠 Retornando ao Painel Principal (Hub).");
      return;
    }

    // 9. BUSCA INTELIGENTE DE REFERÊNCIAS (CLIENTE / PRODUTO)
    const { termoPesquisado, clientesEncontrados, produtosEncontrados, totalClientes, totalProdutos } = buscarReferencias(texto);

    if (totalClientes > 0 || totalProdutos > 0) {
      let textoRetorno = `Encontrei referências no sistema para **"${termoPesquisado}"**.
Com qual destas opções posso te ajudar?`;
      if (totalClientes > 0 && totalProdutos === 0) {
        textoRetorno = `Encontrei **${totalClientes} cliente(s)** com o termo **"${termoPesquisado}"**:`;
      } else if (totalProdutos > 0 && totalClientes === 0) {
        textoRetorno = `Encontrei **${totalProdutos} produto(s)** com o termo **"${termoPesquisado}"**:`;
      }

      responderIA(
        textoRetorno,
        [
          ...(totalClientes > 0 ? [{ label: "➕ Novo Cliente", comando: "cadastrar cliente" }] : []),
          ...(totalProdutos > 0 ? [{ label: "➕ Novo Produto", comando: "cadastrar produto" }] : []),
          { label: "🛒 Abrir PDV", comando: "abrir pdv" }
        ],
        {
          tipo: "busca_referencias",
          clientes: clientesEncontrados,
          produtos: produtosEncontrados
        }
      );
      return;
    }

    // 10. SAUDAÇÕES
    if (tLower === "oi" || tLower === "olá" || tLower === "ola" || tLower === "bom dia" || tLower === "boa tarde" || tLower === "boa noite") {
      responderIA(
        `Olá, ${nomeOperador}! Como posso te ajudar agora? Você pode digitar o nome de um cliente, de um produto ou escolher uma das ações rápidas abaixo:`,
        [
          ...(!sessaoAtiva ? [{ label: "🔓 Abrir turno de caixa", comando: "abrir caixa" }] : []),
          { label: "🏆 Mais vendidos hoje", comando: "o que mais vendeu hoje" },
          { label: "⚠️ O que repor no estoque", comando: "o que repor no estoque" },
          { label: "💰 Vendas de hoje", comando: "quanto vendemos hoje" },
          { label: "🛒 Abrir PDV Balcão", comando: "abrir pdv" }
        ]
      );
      return;
    }

    // 11. FALLBACK INTELIGENTE (QUANDO NÃO ENCONTRA NENHUMA REFERÊNCIA OU COMANDO)
    responderIA(
      `Não encontrei nenhum cliente, produto ou comando relacionado a **"${texto}"**.

` +
      `Como posso te ajudar agora? Posso consultar estoques, buscar clientes, ver o que mais vendeu ou abrir qualquer tela para você.

` +
      `Aqui estão algumas ideias do que você pode fazer agora:`,
      [
        ...(!sessaoAtiva ? [{ label: "🔓 Abrir turno de caixa", comando: "abrir caixa" }] : []),
        { label: "🏆 Mais vendidos hoje", comando: "o que mais vendeu hoje" },
        { label: "⚠️ O que repor no estoque", comando: "o que repor no estoque" },
        { label: "➕ Cadastrar novo cliente", comando: "cadastrar cliente" },
        { label: "➕ Cadastrar novo produto", comando: "cadastrar produto" },
        { label: "💰 Vendas de hoje", comando: "quanto vendemos hoje" },
        { label: "👥 Quem deve fiado?", comando: "clientes com fiado" },
        { label: "🛒 Abrir PDV Balcão", comando: "abrir pdv" }
      ]
    );
  };

  const responderIA = (texto, chips = [], cartaoEspecial = null) => {
    const hora = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msg = {
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      remetente: "assistant",
      hora,
      texto,
      chips,
      cartaoEspecial
    };
    setMensagens((prev) => [...prev, msg]);
  };

  const limparHistorico = () => {
    setMensagens([
      {
        id: "cleared",
        remetente: "assistant",
        hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        texto: `Histórico limpo. Como posso te ajudar agora, ${nomeOperador}?`,
        chips: [
          ...(!sessaoAtiva ? [{ label: "🔓 Abrir turno de caixa", comando: "abrir caixa" }] : []),
          { label: "🏆 Mais vendidos", comando: "o que mais vendeu hoje" },
          { label: "⚠️ O que repor?", comando: "o que preciso repor no estoque" },
          { label: "🛒 Abrir PDV", comando: "abrir pdv" }
        ]
      }
    ]);
  };

  return (
    <>
      {/* Botão Flutuante luminoso no canto inferior direito */}
      {!aberto && (
        <button
          className="zen-ia-float-trigger no-print"
          onClick={onAbrir}
          title="Assistente Zen IA (Ctrl+K)"
          aria-label="Abrir Assistente Zen IA"
        >
          <span className="zen-ia-pulse-badge" />
          <span>✨ Zen IA</span>
        </button>
      )}

      {/* Gaveta / Drawer do Assistente IA */}
      {aberto && (
        <div className="zen-ia-panel-backdrop no-print" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
          <aside className="zen-ia-drawer" role="dialog" aria-modal="true" aria-label="Zen IA">
            {/* Cabeçalho */}
            <div className="zen-ia-header">
              <div className="zen-ia-header-left">
                <div className="zen-ia-avatar">✨</div>
                <div className="zen-ia-title">
                  <strong>Zen<span>IA</span> Assistente</strong>
                  <small>
                    {nomeOperador} • <span style={{ color: ehGerente ? "#ffd52f" : "#34d399", fontWeight: 900 }}>{patenteUsuario?.toUpperCase() || "OPERADOR"}</span>
                  </small>
                </div>
              </div>
              <div className="zen-ia-header-actions">
                <button className="zen-ia-btn-icon" onClick={limparHistorico} title="Limpar conversa">
                  🗑️
                </button>
                <button className="zen-ia-btn-icon" onClick={onFechar} title="Fechar (Esc)">
                  ✕
                </button>
              </div>
            </div>

            {/* Lista de Mensagens */}
            <div className="zen-ia-messages">
              {mensagens.map((msg) => (
                <div key={msg.id} className={`zen-ia-msg ${msg.remetente}`}>
                  <div className="zen-ia-bubble-header">
                    <span>{msg.remetente === "assistant" ? "Zen IA" : nomeOperador}</span>
                    <time>{msg.hora}</time>
                  </div>

                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {msg.texto}
                  </div>

                  {/* Renderização de cartões especiais */}
                  {msg.cartaoEspecial && (
                    <div className="zen-ia-card-grid">
                      {/* CARTÃO: ABRIR TURNO DE CAIXA */}
                      {msg.cartaoEspecial.tipo === "abrir_caixa" && (
                        <div style={{ marginTop: 8 }}>
                          <button
                            className="zen-ia-action-btn"
                            style={{
                              background: "linear-gradient(135deg, #10b981, #059669)",
                              borderColor: "#34d399",
                              color: "#ffffff",
                              fontWeight: 900,
                              fontSize: "13px",
                              padding: "12px 16px"
                            }}
                            onClick={dispararAberturaCaixa}
                          >
                            🔓 Abrir Turno de Caixa Agora
                          </button>
                        </div>
                      )}

                      {/* CARTÃO: BUSCA DE REFERÊNCIAS (CLIENTES E PRODUTOS) */}
                      {msg.cartaoEspecial.tipo === "busca_referencias" && (
                        <>
                          {/* Clientes encontrados */}
                          {msg.cartaoEspecial.clientes && msg.cartaoEspecial.clientes.map((cli) => (
                            <div key={`cli-${cli.id}`} className="zen-ia-ref-card">
                              <div className="zen-ia-ref-header">
                                <div className="zen-ia-ref-avatar">👤</div>
                                <div className="zen-ia-ref-title">
                                  <strong>{cli.nome}</strong>
                                  <small>
                                    {cli.telefone ? `📞 ${cli.telefone}` : ""}
                                    {cli.documento ? ` • Doc: ${cli.documento}` : ""}
                                    {cli.cidade ? ` • ${cli.cidade}` : ""}
                                  </small>
                                </div>
                                <div className="zen-ia-ref-status">
                                  {Number(cli.saldoDevedorBRL || 0) > 0 ? (
                                    <span className="zen-ia-tag-debt">⚠️ Fiado: {fmt(cli.saldoDevedorBRL)}</span>
                                  ) : (
                                    <span className="zen-ia-tag-ok">✅ Em dia</span>
                                  )}
                                </div>
                              </div>
                              <div className="zen-ia-ref-buttons">
                                <button
                                  type="button"
                                  onClick={() => abrirFichaCliente(cli)}
                                  className="zen-ia-sub-btn"
                                  title="Abrir ficha completa do cliente"
                                >
                                  👤 Ver Ficha
                                </button>
                                <button
                                  type="button"
                                  onClick={() => vincularClienteAoPDV(cli)}
                                  className="zen-ia-sub-btn highlight"
                                  title="Atribuir este cliente à venda atual no PDV"
                                >
                                  🛒 Vincular ao PDV
                                </button>
                                <button
                                  type="button"
                                  onClick={() => verHistoricoComprasCliente(cli)}
                                  className="zen-ia-sub-btn"
                                  title="Ver compras anteriores do cliente"
                                >
                                  📜 Compras
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* Produtos encontrados */}
                          {msg.cartaoEspecial.produtos && msg.cartaoEspecial.produtos.map((prod) => (
                            <div key={`prod-${prod.id}`} className="zen-ia-ref-card">
                              <div className="zen-ia-ref-header">
                                <div className="zen-ia-ref-avatar prod">📦</div>
                                <div className="zen-ia-ref-title">
                                  <strong>{prod.nome}</strong>
                                  <small>
                                    {prod.sku ? `SKU: ${prod.sku}` : ""}
                                    {prod.grupo ? ` • Grupo: ${prod.grupo}` : ""}
                                  </small>
                                </div>
                                <div className="zen-ia-ref-status">
                                  <span className="zen-ia-tag-price">{fmt(prod.precoBRL)}</span>
                                  <span className={prod.estoque <= 0 ? "zen-ia-tag-stock-zero" : "zen-ia-tag-stock"}>
                                    Estoque: {prod.estoque} un
                                  </span>
                                </div>
                              </div>
                              <div className="zen-ia-ref-buttons">
                                <button
                                  type="button"
                                  onClick={() => abrirFichaProduto(prod)}
                                  className="zen-ia-sub-btn"
                                  title="Abrir cadastro deste produto"
                                >
                                  📦 Ver Produto
                                </button>
                                <button
                                  type="button"
                                  onClick={() => adicionarProdutoAoPDV(prod)}
                                  className="zen-ia-sub-btn highlight"
                                  title="Lançar item diretamente no carrinho do PDV"
                                >
                                  🛒 Lançar no PDV
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* CARTÃO: RANKING DE VENDAS */}
                      {msg.cartaoEspecial.tipo === "ranking_vendas" && (
                        <>
                          {msg.cartaoEspecial.itens.map((it, idx) => (
                            <div key={it.id || idx} className="zen-ia-data-item">
                              <div className="zen-ia-rank-badge">#{idx + 1}</div>
                              <div className="zen-ia-item-info">
                                <strong>{it.nome}</strong>
                                <small>SKU: {it.sku || "(sem SKU)"} • Estoque: {it.estoqueAtual} un</small>
                              </div>
                              <div className="zen-ia-item-value">
                                <strong>{it.qtdTotal} un</strong>
                                <small>{fmt(it.faturamentoBRL)}</small>
                              </div>
                            </div>
                          ))}
                          {msg.cartaoEspecial.onAcaoPrincipal && (
                            <button
                              className="zen-ia-action-btn"
                              onClick={() => {
                                msg.cartaoEspecial.onAcaoPrincipal();
                                onFechar();
                              }}
                            >
                              {msg.cartaoEspecial.rotuloAcaoPrincipal}
                            </button>
                          )}
                        </>
                      )}

                      {/* CARTÃO: REPOSIÇÃO DE ESTOQUE */}
                      {msg.cartaoEspecial.tipo === "sugestao_reposicao" && (
                        <>
                          {msg.cartaoEspecial.itens.map((it, idx) => (
                            <div key={it.produto?.id || idx} className="zen-ia-data-item">
                              <div
                                className="zen-ia-rank-badge"
                                style={{
                                  background: it.status === "critico" ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)",
                                  color: it.status === "critico" ? "#ef4444" : "#f59e0b"
                                }}
                              >
                                {it.status === "critico" ? "🔴" : "🟠"}
                              </div>
                              <div className="zen-ia-item-info">
                                <strong>{it.produto?.nome}</strong>
                                <small>
                                  Estoque: <b>{it.estoqueAtual} un</b> • Vendas 15d: {it.vendas15d} un
                                </small>
                              </div>
                              <div className="zen-ia-item-value">
                                <strong style={{ color: "#19d3ff" }}>+ {it.sugestaoQtd} un</strong>
                                <small>Custo: {fmt(it.custoEstimadoBRL)}</small>
                              </div>
                            </div>
                          ))}
                          {msg.cartaoEspecial.onAcaoPrincipal && (
                            <button
                              className="zen-ia-action-btn"
                              onClick={() => {
                                msg.cartaoEspecial.onAcaoPrincipal();
                                onFechar();
                              }}
                            >
                              {msg.cartaoEspecial.rotuloAcaoPrincipal}
                            </button>
                          )}
                        </>
                      )}

                      {/* CARTÃO: FIADO */}
                      {msg.cartaoEspecial.tipo === "fiado_clientes" && (
                        <>
                          {msg.cartaoEspecial.itens.map((cli, idx) => (
                            <div key={cli.id || idx} className="zen-ia-data-item">
                              <div className="zen-ia-rank-badge">👤</div>
                              <div className="zen-ia-item-info">
                                <strong>{cli.nome}</strong>
                                <small>{cli.telefone ? `Tel: ${cli.telefone}` : "Sem telefone"}</small>
                              </div>
                              <div className="zen-ia-item-value">
                                <strong style={{ color: "#ef4444" }}>{fmt(cli.saldoDevedorBRL)}</strong>
                                {Number(cli.diasAtraso || 0) > 0 && <small>{cli.diasAtraso} dias de atraso</small>}
                              </div>
                            </div>
                          ))}
                          {msg.cartaoEspecial.onAcaoPrincipal && (
                            <button
                              className="zen-ia-action-btn"
                              onClick={() => {
                                msg.cartaoEspecial.onAcaoPrincipal();
                                onFechar();
                              }}
                            >
                              {msg.cartaoEspecial.rotuloAcaoPrincipal}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Sugestões e Chips de Ação */}
                  {msg.chips && msg.chips.length > 0 && (
                    <div className="zen-ia-chips">
                      {msg.chips.map((ch, i) => (
                        <button
                          key={i}
                          className="zen-ia-chip"
                          onClick={() => processarComando(ch.comando)}
                        >
                          {ch.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={fimMensagensRef} />
            </div>

            {/* Rodapé e Campo de Entrada */}
            <div className="zen-ia-footer">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  processarComando(inputTexto);
                }}
                className="zen-ia-input-wrapper"
              >
                <button
                  type="button"
                  onClick={alternarVoz}
                  className={`zen-ia-btn-mic ${gravandoVoz ? "recording" : ""}`}
                  title={gravandoVoz ? "Ouvindo... Clique para parar" : "Falar por voz"}
                >
                  {gravandoVoz ? "🔴" : "🎤"}
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  value={inputTexto}
                  onChange={(e) => setInputTexto(e.target.value)}
                  placeholder="Pergunte algo, digite o nome de um cliente ou peça para abrir..."
                />

                <button
                  type="submit"
                  disabled={!inputTexto.trim()}
                  className="zen-ia-btn-send"
                  title="Enviar comando"
                >
                  ➤
                </button>
              </form>
              <div className="zen-ia-hint">
                <small>Dica: Pressione <kbd>Ctrl</kbd> + <kbd>K</kbd> a qualquer momento para abrir ou fechar</small>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
