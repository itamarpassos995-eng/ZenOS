import React, { useState, useEffect, useRef, useMemo } from "react";
import { obterDataRegistro } from "../core/dates.js";
import { obterFinanceiroVenda } from "../core/salesFinancials.js";
import "./ZenAssistenteIA.css";

// Utilitário de normalização de texto (remove acentos e pontuações para busca semântica natural)
const normalizar = (str = "") =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
  vendedores = [],
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
  const vendedoresCandidatos = useMemo(() => {
    const porId = new Map();
    (vendedores || []).forEach((v) => {
      if (v?.id != null && v?.nome) porId.set(String(v.id), v);
    });
    (historicoVendas || []).forEach((v) => {
      const id = v?.vendedorId ?? v?.operadorId;
      const nome = v?.vendedorNome || v?.operadorNome || v?.vendedor;
      if (id != null && nome && !porId.has(String(id))) porId.set(String(id), { id, nome });
    });
    return [...porId.values()];
  }, [vendedores, historicoVendas]);

  // Mensagem inicial de boas-vindas
  useEffect(() => {
    if (mensagens.length === 0) {
      setMensagens([
        {
          id: "welcome",
          remetente: "assistant",
          hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          texto: `Olá, ${nomeOperador}! Sou o **Zen IA**, seu copiloto de gestão em tempo real. Você pode me perguntar qualquer coisa em português comum: vendas por vendedor, produtos mais vendidos, reposição de estoque, consultar clientes, ou pedir para abrir telas e operações.`,
          chips: [
            ...(!sessaoAtiva ? [{ label: "🔓 Abrir turno de caixa", comando: "abrir caixa" }] : []),
            { label: "👥 Vendas por vendedor", comando: "quanto cada vendedor vendeu" },
            { label: "🏆 Mais vendidos hoje", comando: "o que mais vendeu hoje" },
            { label: "⚠️ O que preciso repor?", comando: "o que preciso repor no estoque" },
            { label: "💰 Faturamento de hoje", comando: "quanto faturou hoje" },
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
    if (aberto && fimMensagensRef.current) {
      fimMensagensRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [mensagens, aberto]);

  // Foco no input ao abrir
  useEffect(() => {
    if (aberto) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [aberto]);

  // Preserva Ctrl/Cmd+K para abrir/fechar e ESC para fechar.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === "k") {
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

  // Controle de comando de voz (Web Speech API)
  const alternarVoz = () => {
    if (gravandoVoz) {
      recognitionRef.current?.stop();
      setGravandoVoz(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      responderIA("🎙️ Reconhecimento de voz não suportado pelo navegador. Experimente digitar a pergunta ou utilizar o Chrome.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setGravandoVoz(true);
      recognition.onend = () => setGravandoVoz(false);
      recognition.onerror = () => setGravandoVoz(false);
      recognition.onresult = (event) => {
        const transcricao = event.results[0][0].transcript;
        if (transcricao) {
          setInputTexto(transcricao);
          processarComando(transcricao);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Erro ao iniciar voz:", err);
      setGravandoVoz(false);
    }
  };

  // DETECÇÃO INTELIGENTE DE PERÍODOS
  // Reconhece intenções por significado e variações comuns de digitação, sem exigir frases exatas.
  // Mantém as rotas atuais; o classificador só decide qual fluxo existente executar.
  const distanciaEdicao = (a, b) => {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const atual = [i];
      for (let j = 1; j <= b.length; j += 1) {
        atual[j] = Math.min(
          anterior[j] + 1,
          atual[j - 1] + 1,
          anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      anterior = atual;
    }
    return anterior[b.length];
  };

  const tokenParecido = (token, conceito) => {
    if (token === conceito || token.startsWith(conceito) || conceito.startsWith(token)) return true;
    if (token.length < 5 || conceito.length < 5) return false;
    const limite = Math.max(token.length, conceito.length) > 9 ? 2 : 1;
    return Math.abs(token.length - conceito.length) <= limite && distanciaEdicao(token, conceito) <= limite;
  };

  const classificarIntencao = (texto) => {
    const normalizado = normalizar(texto);
    const palavras = normalizado.split(" ").filter(Boolean);
    const temConceito = (conceitos) => palavras.some((palavra) => conceitos.some((conceito) => tokenParecido(palavra, conceito)));
    const meioPagamentoExplicito = palavras.some((p) => ["pix", "cartao", "credito", "debito", "dinheiro", "especie", "ted", "boleto"].some((m) => p === m || p.startsWith(m)));
    const sinais = {
      pessoa: palavras.some((p) => ["vendedor", "vendedores", "vendedora", "atendente", "atendentes", "colaborador", "colaboradores", "funcionario", "funcionarios", "equipe", "time", "galera", "pessoal"].some((c) => p === c || p.startsWith(c))),
      venda: temConceito(["vendeu", "venderam", "vendendo", "venda", "vendas", "vendemos", "vendemo", "vende", "faturou", "faturamento", "faturando", "movimento", "movimentou", "tirou", "fechou", "bateu", "produziu", "producao", "desempenho", "resultado", "comissao", "comissoes", "meta", "metas", "saiu"]),
      ranking: temConceito(["ranking", "lider", "liderando", "frente", "primeiro", "campeao", "top", "melhor", "mais", "maior", "destaque", "tabela", "lista"]),
      pagamento: meioPagamentoExplicito || (palavras.some((p) => ["pagamento", "pagamentos", "recebimento", "recebimentos"].includes(p)) && !normalizado.includes("vendas") && !normalizado.includes("faturamento")),
      estoque: temConceito(["estoque", "mercadoria", "mercadorias", "produto", "produtos", "item", "itens"]),
    };
    const intents = {
      vendedores: sinais.pessoa ? 50 + (sinais.venda ? 50 : 0) + (sinais.ranking ? 25 : 0) : 0,
      pagamentos: sinais.pagamento ? 100 : 0,
      vendas: sinais.venda && !sinais.pessoa && !sinais.pagamento ? 100 : 0,
      produtos: 0,
      reposicao: 0,
      estoque: 0,
      lucro: 0,
      fiado: 0,
    };

    // "Cada um", "quem vendeu mais" e nomes próprios sem o termo vendedor também são claros.
    if ((normalizado.includes("cada um") || normalizado.includes("cada qual") || normalizado.includes("cada pessoa") || normalizado.includes("por pessoa")) && sinais.venda) intents.vendedores = Math.max(intents.vendedores, 140);
    if (normalizado.includes("time de vendas") || normalizado.includes("equipe de vendas") || normalizado.includes("nossos vendedores")) intents.vendedores = Math.max(intents.vendedores, 140);
    const pessoaCadastradaNaFrase = (vendedoresCandidatos || []).some((v) => {
      const primeiroNome = normalizar(v?.nome || "").split(" ")[0];
      return primeiroNome.length >= 3 && palavras.some((palavra) => tokenParecido(palavra, primeiroNome));
    });
    if (sinais.venda && !sinais.pessoa && !pessoaCadastradaNaFrase && ["quem", "qual", "lider", "frente"].some((palavra) => normalizado.includes(palavra))) intents.vendedores += 60;
    if (!sinais.pessoa && !pessoaCadastradaNaFrase && /quem vendeu mais|quem mais vendeu|qual vendedor|quem ta vendendo mais|quem esta vendendo mais/.test(normalizado)) intents.vendedores += 120;

    // O nome de um vendedor é reconhecido contra o cadastro real, mesmo sem termo exato.
    const pessoa = (vendedoresCandidatos || []).find((v) => {
      const primeiroNome = normalizar(v?.nome || "").split(" ")[0];
      return primeiroNome.length >= 3 && palavras.some((palavra) => tokenParecido(palavra, primeiroNome));
    });
    if (pessoa && sinais.venda) intents.vendedores += 130;

    if (normalizado.includes("gaveta") || normalizado.includes("saldo do caixa") || normalizado.includes("saldo da gaveta")) intents.pagamentos = Math.max(intents.pagamentos, 120);
    if (sinais.pagamento && sinais.venda && meioPagamentoExplicito) intents.vendas = 0;
    if (sinais.pessoa && sinais.venda && sinais.pagamento) intents.vendedores = 0;
    if (normalizado.includes("mais saiu") || normalizado.includes("mais vendido") || normalizado.includes("mais vende") || normalizado.includes("campeao") || normalizado.includes("top produto")) intents.produtos = 120;
    if (normalizado.includes("repor") || normalizado.includes("reposicao") || normalizado.includes("acabando") || normalizado.includes("falta no estoque") || normalizado.includes("estoque baixo") || normalizado.includes("o que comprar")) intents.reposicao = 120;
    if (sinais.estoque && (normalizado.includes("quanto vale") || normalizado.includes("valor") || normalizado.includes("custo") || normalizado.includes("inventario") || normalizado.includes("patrimonio"))) intents.estoque = 120;
    if (["lucro", "margem", "rentabilidade", "cmv"].some((termo) => normalizado.includes(termo))) intents.lucro = 120;
    if (["fiado", "devedor", "devendo", "divida", "cobranca", "contas a receber"].some((termo) => normalizado.includes(termo))) intents.fiado = 120;

    // Uma forma de pagamento explícita evita confusão com a palavra "vendas".
    if (sinais.pagamento && sinais.venda) intents.pagamentos += 30;
    if (normalizado.includes("quem vendeu mais") || normalizado.includes("quem mais vendeu") || normalizado.includes("quem lidera") || normalizado.includes("quem esta liderando") || normalizado.includes("na frente nas vendas") || normalizado.includes("liderando as vendas")) {
      intents.vendedores = Math.max(intents.vendedores, 160);
      intents.vendas = 0;
    }
    if (normalizado.includes("quanto cada") && sinais.venda) intents.vendedores = Math.max(intents.vendedores, 140);
    if (normalizado.includes("lucro") || normalizado.includes("margem") || normalizado.includes("rentabilidade") || normalizado.includes("cmv")) intents.lucro = Math.max(intents.lucro, 140);
    const [intencao, score] = Object.entries(intents).sort((a, b) => b[1] - a[1])[0];
    return { intencao: score > 0 ? intencao : "desconhecido", pessoa };
  };

  const detectarPeriodo = (norm) => {
    if (norm.includes("ontem")) return { periodo: "ontem", rotulo: "Ontem" };
    if (
      norm.includes("semana") ||
      norm.includes("7 dias") ||
      norm.includes("ultimos 7") ||
      norm.includes("ultimos dias")
    ) {
      return { periodo: "semana", rotulo: "Últimos 7 dias" };
    }
    if (
      norm.includes("mes") ||
      norm.includes("30 dias") ||
      norm.includes("mensal") ||
      norm.includes("neste mes") ||
      norm.includes("este mes")
    ) {
      return { periodo: "mes", rotulo: "Este Mês (30 dias)" };
    }
    if (norm.includes("hoje")) return { periodo: "hoje", rotulo: "Hoje" };
    if (
      norm.includes("geral") ||
      norm.includes("total") ||
      norm.includes("sempre") ||
      norm.includes("historico") ||
      norm.includes("todos os tempos")
    ) {
      return { periodo: "geral", rotulo: "Todo o Histórico" };
    }
    return { periodo: "hoje", rotulo: "Hoje" };
  };

  // EXTRAÇÃO E FILTRO DE DATA DE VENDAS
  const extrairDataVenda = (venda) => obterDataRegistro(venda);

  // Mesma regra do histórico e das comissões: somente vendas efetivamente concluídas.
  const vendaConcluida = (v) => v?.estado === "concluida" || v?.estado === "parcial";
  const vendaVisivelAoOperador = (v) =>
    ehGerente || String(v?.vendedorId ?? "") === String(operadorAtivo?.id ?? "");

  const filtrarVendasPorPeriodo = (vendas, periodo = "hoje") => {
    const agora = new Date();
    const hojeStr = agora.toLocaleDateString();
    const ontem = new Date(agora);
    ontem.setDate(ontem.getDate() - 1);
    const ontemStr = ontem.toLocaleDateString();

    return (vendas || []).filter((v) => {
      if (!vendaConcluida(v)) return false;
      if (periodo === "geral") return true;

      const dataVenda = extrairDataVenda(v);
      if (!dataVenda) return false;

      if (periodo === "hoje") {
        return dataVenda.toLocaleDateString() === hojeStr;
      }
      if (periodo === "ontem") {
        return dataVenda.toLocaleDateString() === ontemStr;
      }
      if (periodo === "semana") {
        const diffDias = (agora.getTime() - dataVenda.getTime()) / (1000 * 3600 * 24);
        return diffDias >= 0 && diffDias <= 7;
      }
      if (periodo === "mes") {
        const diffDias = (agora.getTime() - dataVenda.getTime()) / (1000 * 3600 * 24);
        return diffDias >= 0 && diffDias <= 30;
      }
      return true;
    });
  };

  // CÁLCULO DE VENDAS POR VENDEDOR
  const calcularVendasPorVendedor = (periodo = "hoje") => {
    const vendasFiltradas = filtrarVendasPorPeriodo(historicoVendas, periodo);
    const mapa = new Map();

    // Pré-popula com todos os vendedores cadastrados para dar visibilidade completa
    (vendedores || []).forEach((vend) => {
      if (!vend || !vend.id) return;
      const vid = String(vend.id).trim();
      mapa.set(vid, {
        id: vid,
        nome: vend.nome || "Vendedor",
        cargo: vend.cargo || vend.patente || (vid === "admin" ? "Gerência" : "Vendedor Balcão"),
        percentual: Number(vend.percentual || 0),
        comissaoTipo: vend.comissaoTipo || "lucro",
        totalFaturadoBRL: 0,
        qtdVendas: 0,
        qtdItens: 0,
        ticketMedioBRL: 0,
        participacaoPct: 0,
      });
    });

    let totalGeralBRL = 0;
    let totalItensGeral = 0;

    vendasFiltradas.forEach((v) => {
      const vid = String(v.vendedorId || v.operadorId || "admin").trim();
      const vnome =
        v.vendedorNome ||
        v.operadorNome ||
        v.vendedor ||
        (vid === "admin" ? "Administrador (Gerência)" : `Vendedor #${vid}`);
      const totalVenda = obterFinanceiroVenda(v).totalLiquidoBRL;

      const itens = Array.isArray(v.itens)
        ? v.itens
        : Array.isArray(v.itensDocumento)
        ? v.itensDocumento
        : [];
      const qtdItens = itens.reduce((acc, it) => acc + Number(it.qtd || it.quantidade || 1), 0);

      if (!mapa.has(vid)) {
        mapa.set(vid, {
          id: vid,
          nome: vnome,
          cargo: vid === "admin" ? "Gerência" : "Vendedor",
          percentual: 0,
          comissaoTipo: "lucro",
          totalFaturadoBRL: 0,
          qtdVendas: 0,
          qtdItens: 0,
          ticketMedioBRL: 0,
          participacaoPct: 0,
        });
      }

      const item = mapa.get(vid);
      item.totalFaturadoBRL += totalVenda;
      item.qtdVendas += 1;
      item.qtdItens += qtdItens;

      totalGeralBRL += totalVenda;
      totalItensGeral += qtdItens;
    });

    const lista = Array.from(mapa.values()).map((v) => {
      const ticket = v.qtdVendas > 0 ? v.totalFaturadoBRL / v.qtdVendas : 0;
      const pct = totalGeralBRL > 0 ? (v.totalFaturadoBRL / totalGeralBRL) * 100 : 0;
      return {
        ...v,
        ticketMedioBRL: ticket,
        participacaoPct: Number(pct.toFixed(1)),
      };
    });

    const comVendas = lista
      .filter((v) => v.qtdVendas > 0)
      .sort((a, b) => b.totalFaturadoBRL - a.totalFaturadoBRL || b.qtdVendas - a.qtdVendas);

    const semVendas = lista
      .filter((v) => v.qtdVendas === 0)
      .sort((a, b) => a.nome.localeCompare(b.nome));

    return {
      ranking: [...comVendas, ...semVendas],
      comVendas,
      semVendas,
      totalGeralBRL,
      totalVendasGeral: vendasFiltradas.length,
      totalItensGeral,
      periodo,
    };
  };

  // CÁLCULO DE VENDAS E MAIS VENDIDOS
  const calcularMaisVendidos = (periodo = "hoje") => {
    const vendasFiltradas = filtrarVendasPorPeriodo(historicoVendas, periodo).filter(vendaVisivelAoOperador);

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

    (historicoVendas || []).forEach((venda) => {
      if (!vendaConcluida(venda)) return;
      const dataVenda = extrairDataVenda(venda);
      if (!dataVenda) return;
      const diffDias = (agora.getTime() - dataVenda.getTime()) / (1000 * 3600 * 24);
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

  // CÁLCULO DE RESUMO FINANCEIRO DE VENDAS
  const calcularResumoPeriodo = (periodo = "hoje") => {
    const vendasFiltradas = filtrarVendasPorPeriodo(historicoVendas, periodo).filter(vendaVisivelAoOperador);

    const financeiros = vendasFiltradas.map(obterFinanceiroVenda);
    const totalFaturadoBRL = financeiros.reduce((acc, v) => acc + v.totalLiquidoBRL, 0);
    const qtdPedidos = vendasFiltradas.length;
    const ticketMedio = qtdPedidos > 0 ? totalFaturadoBRL / qtdPedidos : 0;

    // Reutiliza a apuração canônica, incluindo devoluções e prejuízos.
    const custoTotalBRL = financeiros.reduce((acc, v) => acc + v.cmvLiquidoBRL, 0);
    const lucroEstimadoBRL = financeiros.reduce((acc, v) => acc + v.lucroLiquidoBRL, 0);
    const margemPct = totalFaturadoBRL > 0 ? (lucroEstimadoBRL / totalFaturadoBRL) * 100 : 0;

    return {
      totalFaturadoBRL,
      qtdPedidos,
      ticketMedio,
      custoTotalBRL,
      lucroEstimadoBRL,
      margemPct: Number(margemPct.toFixed(1)),
      periodo,
    };
  };

  // CÁLCULO DE VENDAS POR FORMA DE PAGAMENTO
  const calcularVendasPorFormaPagamento = (periodo = "hoje") => {
    const vendasFiltradas = filtrarVendasPorPeriodo(historicoVendas, periodo).filter(vendaVisivelAoOperador);
    const mapaFormas = new Map();

    const normalizarNomeForma = (formaId = "") => {
      const f = String(formaId).toLowerCase();
      if (f.includes("pix")) return { nome: "Pix", icone: "⚡" };
      if (f.includes("dinheiro") || f.includes("especie")) return { nome: "Dinheiro (Espécie)", icone: "💵" };
      if (f.includes("credito") || f.includes("cartao_credito")) return { nome: "Cartão de Crédito", icone: "💳" };
      if (f.includes("debito") || f.includes("cartao_debito")) return { nome: "Cartão de Débito", icone: "💳" };
      if (f.includes("crediario") || f.includes("fiado")) return { nome: "Fiado / Crediário", icone: "📝" };
      if (f.includes("voucher") || f.includes("vale")) return { nome: "Voucher / Crédito", icone: "🎟️" };
      return { nome: "Outras Formas", icone: "💰" };
    };

    let totalGeralBRL = 0;

    vendasFiltradas.forEach((venda) => {
      const pagamentosLancados = [];

      if (Array.isArray(venda.pagamentos)) {
        venda.pagamentos.forEach((p) => {
          if (Array.isArray(p)) {
            pagamentosLancados.push({ formaId: p[0], valor: Number(p[1] || 0) });
          } else if (typeof p === "object" && p !== null) {
            pagamentosLancados.push({
              formaId: p.formaId || p.forma || p.metodo,
              valor: Number(p.valorConvertidoBRL || p.valorBRL || p.valor || 0)
            });
          }
        });
      } else if (venda.formaPagamento) {
        pagamentosLancados.push({ formaId: venda.formaPagamento, valor: Number(venda.totalBRL || 0) });
      }

      if (pagamentosLancados.length === 0 && Number(venda.totalBRL || 0) > 0) {
        pagamentosLancados.push({ formaId: "dinheiro", valor: Number(venda.totalBRL || 0) });
      }

      pagamentosLancados.forEach(({ formaId, valor }) => {
        const info = normalizarNomeForma(formaId);
        if (!mapaFormas.has(info.nome)) {
          mapaFormas.set(info.nome, {
            id: info.nome,
            nome: info.nome,
            icone: info.icone,
            totalBRL: 0,
            qtdVendas: 0,
          });
        }
        const item = mapaFormas.get(info.nome);
        item.totalBRL += valor;
        item.qtdVendas += 1;
        totalGeralBRL += valor;
      });
    });

    const lista = Array.from(mapaFormas.values())
      .map((item) => ({
        ...item,
        participacaoPct: totalGeralBRL > 0 ? Number(((item.totalBRL / totalGeralBRL) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.totalBRL - a.totalBRL);

    return { formas: lista, totalGeralBRL, periodo };
  };

  // CLIENTES COM FIADO
  const obterClientesFiado = () => {
    return (clientes || [])
      .filter((c) => (c?.saldoDevedorBRL || 0) > 0)
      .sort((a, b) => (b.saldoDevedorBRL || 0) - (a.saldoDevedorBRL || 0));
  };

  // TOP CLIENTES QUE MAIS COMPRAM
  const calcularTopClientes = (limite = 5) => {
    const mapa = new Map();

    (historicoVendas || []).forEach((v) => {
      if (!vendaConcluida(v) || !vendaVisivelAoOperador(v)) return;
      const cliId = String(v.clienteId || v.clienteNome || "Consumidor Balcão");
      if (cliId === "Consumidor Balcão" || cliId === "null" || cliId === "undefined") return;

      const cliNome = v.clienteNome || cliId;
      const total = obterFinanceiroVenda(v).totalLiquidoBRL;

      if (!mapa.has(cliId)) {
        mapa.set(cliId, { id: cliId, nome: cliNome, totalGastoBRL: 0, qtdCompras: 0 });
      }
      const item = mapa.get(cliId);
      item.totalGastoBRL += total;
      item.qtdCompras += 1;
    });

    return Array.from(mapa.values())
      .sort((a, b) => b.totalGastoBRL - a.totalGastoBRL)
      .slice(0, limite);
  };

  // VALOR TOTAL DO ESTOQUE
  const calcularResumoEstoque = () => {
    const ativos = (produtos || []).filter((p) => p && p.ativo !== false);
    const totalItens = ativos.length;
    let unidadesEstoque = 0;
    let valorCustoTotal = 0;
    let valorVendaTotal = 0;
    let produtosZerados = 0;

    ativos.forEach((p) => {
      const est = Number(p.estoque || 0);
      const custo = Number(p.custoBRL || 0);
      const preco = Number(p.precoBRL || 0);

      unidadesEstoque += Math.max(0, est);
      valorCustoTotal += Math.max(0, est) * custo;
      valorVendaTotal += Math.max(0, est) * preco;

      if (est <= 0) produtosZerados += 1;
    });

    return {
      totalItens,
      unidadesEstoque,
      valorCustoTotal,
      valorVendaTotal,
      produtosZerados,
      lucroProjetado: Math.max(0, valorVendaTotal - valorCustoTotal),
    };
  };

  // BUSCA UNIVERSAL DE REFERÊNCIAS (CLIENTES E PRODUTOS)
  const buscarReferencias = (termoBruto) => {
    let termo = (termoBruto || "").toLowerCase().trim();
    if (!termo) return { clientesEncontrados: [], produtosEncontrados: [] };

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

    const tNorm = normalizar(texto);
    const { periodo, rotulo: rotuloPeriodo } = detectarPeriodo(tNorm);
    const intencaoDetectada = classificarIntencao(texto);

    // =========================================================================
    // 1. ABERTURA / STATUS DO CAIXA
    // =========================================================================
    if (
      tNorm.includes("abrir caixa") ||
      tNorm.includes("abertura de caixa") ||
      tNorm.includes("abrir turno") ||
      tNorm.includes("iniciar turno") ||
      tNorm.includes("comecar turno")
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
        [{ label: "🛒 Abrir PDV Balcão", comando: "abrir pdv" }],
        { tipo: "abrir_caixa" }
      );
      return;
    }

    // AVISO PROATIVO: FINALIZAR VENDA COM CAIXA FECHADO
    if (
      (tNorm.includes("fechar venda") || tNorm.includes("finalizar pedido") || tNorm.includes("liquidar")) &&
      !sessaoAtiva
    ) {
      responderIA(
        `⚠️ **Atenção:** O caixa ainda está fechado, então o PDV não conseguirá liquidar a venda.
` +
        `Deseja abrir o caixa agora mesmo? Seus itens no PDV não serão perdidos!`,
        [],
        { tipo: "abrir_caixa" }
      );
      return;
    }

    // =========================================================================
    // 2. VENDEDORES / QUANTO CADA VENDEDOR VENDEU / RANKING DE EQUIPE
    // =========================================================================
    const tokens = new Set(tNorm.split(" "));

    // Checa se o usuário perguntou sobre um vendedor específico por nome
    let vendedorEspecificoEncontrado = null;
    for (const vCand of vendedoresCandidatos) {
      const primeiroNomeNorm = normalizar(vCand.nome.split(" ")[0]);
      if (primeiroNomeNorm.length >= 3 && (tokens.has(primeiroNomeNorm) || tNorm.includes(primeiroNomeNorm))) {
        if (
          tNorm.includes("quanto") ||
          tNorm.includes("vendeu") ||
          tNorm.includes("venda") ||
          tNorm.includes("pedidos") ||
          tNorm.includes("comissao") ||
          tNorm.includes("desempenho")
        ) {
          vendedorEspecificoEncontrado = vCand;
          break;
        }
      }
    }

    const ehPerguntaVendedorGeral =
      intencaoDetectada.intencao === "vendedores" ||
      tNorm === "vendedor" ||
      tNorm === "vendedores" ||
      tNorm === "equipe de vendas" ||
      tNorm === "equipe" ||
      /quanto[s]?\s+.*vendedor/.test(tNorm) ||
      /venda[s]?\s+.*vendedor/.test(tNorm) ||
      /ranking\s+.*vendedor/.test(tNorm) ||
      /desempenho\s+.*(vendedor|equipe|operador)/.test(tNorm) ||
      /comissa[o|es]\s+.*(vendedor|equipe)/.test(tNorm) ||
      /quem\s+(mais\s+vendeu|vendeu\s+mais|lidera\s+as\s+vendas)/.test(tNorm) ||
      tNorm.includes("melhor vendedor") ||
      tNorm.includes("vendas por vendedor") ||
      tNorm.includes("vendas de cada vendedor") ||
      tNorm.includes("quanto cada vendedor vendeu") ||
      tNorm.includes("quantos cada vendedor vendeu") ||
      tNorm.includes("quanto cada um vendeu") ||
      tNorm.includes("quanto cada operador vendeu") ||
      tNorm.includes("producao dos vendedores") ||
      tNorm.includes("total por vendedor");

    if (vendedorEspecificoEncontrado) {
      if (!ehGerente && String(vendedorEspecificoEncontrado.id) !== String(operadorAtivo?.id)) {
        responderIA("🔒 Consulta de desempenho de outros vendedores é restrita à gerência.");
        return;
      }

      const res = calcularVendasPorVendedor(periodo);
      const dadosVend = res.ranking.find(
        (r) =>
          String(r.id) === String(vendedorEspecificoEncontrado.id) ||
          normalizar(r.nome).includes(normalizar(vendedorEspecificoEncontrado.nome.split(" ")[0]))
      );

      if (!dadosVend || dadosVend.qtdVendas === 0) {
        responderIA(
          `👤 **Desempenho de ${vendedorEspecificoEncontrado.nome} (${rotuloPeriodo}):**
` +
          `Ainda não há vendas finalizadas registradas para este vendedor no período selecionado.`,
          [
            { label: "👥 Ver toda a equipe", comando: "quanto cada vendedor vendeu" },
            { label: "📅 Ver na semana", comando: `quanto ${vendedorEspecificoEncontrado.nome} vendeu na semana` },
            { label: "📊 Histórico geral", comando: `quanto ${vendedorEspecificoEncontrado.nome} vendeu no geral` }
          ]
        );
        return;
      }

      const posicao = res.comVendas.findIndex((r) => r.id === dadosVend.id) + 1;
      responderIA(
        `👤 **Desempenho de ${dadosVend.nome} (${rotuloPeriodo}):**
` +
        `• Total Faturado: **${fmt(dadosVend.totalFaturadoBRL)}**
` +
        `• Pedidos Finalizados: **${dadosVend.qtdVendas} venda(s)**
` +
        `• Ticket Médio: **${fmt(dadosVend.ticketMedioBRL)}**
` +
        `• Participação na Loja: **${dadosVend.participacaoPct}%** ${posicao === 1 ? "(Líder da equipe 🏆)" : `(${posicao}º no ranking)`}`,
        [
          { label: "👥 Ver ranking completo", comando: `quanto cada vendedor vendeu ${periodo}` },
          { label: "📅 Ver na semana", comando: `quanto ${dadosVend.nome} vendeu na semana` },
          { label: "💰 Ver Comissões", comando: "abrir comissoes" }
        ],
        {
          tipo: "ranking_vendedores",
          itens: [dadosVend],
          onAcaoPrincipal: () => navegarPara("comissoes"),
          rotuloAcaoPrincipal: "💰 Ver Comissões & Metas"
        }
      );
      return;
    }

    if (ehPerguntaVendedorGeral) {
      if (!ehGerente) {
        // Usuário sem permissão gerencial vê apenas seu próprio desempenho
        const res = calcularVendasPorVendedor(periodo);
        const meuDesempenho = res.ranking.find((r) => String(r.id) === String(operadorAtivo?.id));
        const total = meuDesempenho?.totalFaturadoBRL || 0;
        const qtd = meuDesempenho?.qtdVendas || 0;

        responderIA(
          `👤 **Seu Desempenho (${rotuloPeriodo}):**
` +
          `• Vendas concluídas: **${qtd} pedido(s)**
` +
          `• Total Faturado: **${fmt(total)}**
` +
          `*(Consulta da equipe completa restrita à gerência)*`,
          [
            { label: "🛒 Ir para o PDV", comando: "abrir pdv" },
            { label: "🏆 Mais vendidos hoje", comando: "o que mais vendeu hoje" }
          ]
        );
        return;
      }

      let resultadoVendedores = calcularVendasPorVendedor(periodo);
      let periodoUtilizado = rotuloPeriodo;

      // Se pediu hoje e ainda não há nenhuma venda hoje, busca inteligentemente os últimos 7 dias
      let avisoVendasHoje = "";
      if (resultadoVendedores.totalVendasGeral === 0 && periodo === "hoje") {
        const resultadoSemana = calcularVendasPorVendedor("semana");
        if (resultadoSemana.totalVendasGeral > 0) {
          resultadoVendedores = resultadoSemana;
          periodoUtilizado = "Últimos 7 dias (hoje ainda não houve vendas)";
          avisoVendasHoje = "ℹ️ Como hoje ainda não tivemos vendas registradas, puxei os dados dos **últimos 7 dias** para você acompanhar:\n\n";
        }
      }

      const { ranking, comVendas, totalGeralBRL, totalVendasGeral } = resultadoVendedores;

      if (totalVendasGeral === 0) {
        responderIA(
          `👥 **Vendas por Vendedor (${periodoUtilizado}):**
` +
          `Não há registros de vendas finalizadas no período selecionado.`,
          [
            { label: "📅 Ver na semana", comando: "quanto cada vendedor vendeu na semana" },
            { label: "📅 Ver este mês", comando: "quanto cada vendedor vendeu no mes" },
            { label: "📊 Ver no geral", comando: "quanto cada vendedor vendeu no geral" },
            { label: "🛒 Abrir PDV Balcão", comando: "abrir pdv" }
          ]
        );
        return;
      }

      const lider = comVendas[0];
      const textoLider = lider
        ? `🏆 **Líder em Vendas:** **${lider.nome}** com **${fmt(lider.totalFaturadoBRL)}** (${lider.participacaoPct}% do total).`
        : "";

      responderIA(
        `${avisoVendasHoje}👥 **Desempenho de Vendas por Vendedor (${periodoUtilizado}):**
` +
        `A equipe faturou **${fmt(totalGeralBRL)}** em **${totalVendasGeral} venda(s)**.
` +
        `${textoLider}`,
        [
          { label: "📅 Ver na semana", comando: "quanto cada vendedor vendeu na semana" },
          { label: "📅 Ver este mês", comando: "quanto cada vendedor vendeu no mes" },
          { label: "📊 Ver no geral", comando: "quanto cada vendedor vendeu no geral" },
          { label: "💰 Ver Comissões", comando: "abrir comissoes" },
          { label: "🏆 Mais vendidos", comando: "o que mais vendeu hoje" }
        ],
        {
          tipo: "ranking_vendedores",
          itens: ranking.slice(0, 8),
          onAcaoPrincipal: () => navegarPara("comissoes"),
          rotuloAcaoPrincipal: "💰 Abrir Painel de Comissões & Metas"
        }
      );
      return;
    }

    // =========================================================================
    // 3. FORMAS DE PAGAMENTO (Pix, Dinheiro, Cartão, Fiado)
    // =========================================================================
    const ehPerguntaPagamento =
      intencaoDetectada.intencao === "pagamentos" ||
      tNorm.includes("forma de pagamento") ||
      tNorm.includes("formas de pagamento") ||
      tNorm.includes("meios de pagamento") ||
      tNorm.includes("quanto no pix") ||
      tNorm.includes("vendas no pix") ||
      tNorm.includes("quanto em dinheiro") ||
      tNorm.includes("vendas em dinheiro") ||
      tNorm.includes("quanto no cartao") ||
      tNorm.includes("vendas no cartao") ||
      tNorm.includes("como pagaram") ||
      tNorm.includes("recebimento");

    if (ehPerguntaPagamento) {
      if (!temPermissao("vendas") && !ehGerente) {
        responderIA("🔒 Consulta de recebimentos restrita à gerência.");
        return;
      }

      const { formas, totalGeralBRL } = calcularVendasPorFormaPagamento(periodo);

      if (formas.length === 0) {
        responderIA(`Não há registros de recebimentos de vendas em **${rotuloPeriodo}**.`, [
          { label: "📅 Ver na semana", comando: "formas de pagamento na semana" },
          { label: "🛒 Abrir PDV", comando: "abrir pdv" }
        ]);
        return;
      }

      // Se perguntou por pix especificamente
      if (tNorm.includes("pix")) {
        const pix = formas.find((f) => f.nome.toLowerCase().includes("pix"));
        const totalPix = pix ? pix.totalBRL : 0;
        const qtdPix = pix ? pix.qtdVendas : 0;
        responderIA(
          `⚡ **Recebimentos via Pix (${rotuloPeriodo}):**
` +
          `• Total Recebido: **${fmt(totalPix)}**
` +
          `• Quantidade de Vendas: **${qtdPix} pedido(s)**
` +
          `• Participação: **${pix ? pix.participacaoPct : 0}%** do faturamento do período.`,
          [
            { label: "💳 Ver todas as formas", comando: `formas de pagamento ${periodo}` },
            { label: "💰 Faturamento de hoje", comando: "quanto faturou hoje" }
          ]
        );
        return;
      }

      // Se perguntou por dinheiro especificamente
      if (tNorm.includes("dinheiro") || tNorm.includes("especie")) {
        const dinheiro = formas.find((f) => f.nome.toLowerCase().includes("dinheiro"));
        const totalDinheiro = dinheiro ? dinheiro.totalBRL : 0;
        const qtdDinheiro = dinheiro ? dinheiro.qtdVendas : 0;
        responderIA(
          `💵 **Recebimentos em Dinheiro / Gaveta (${rotuloPeriodo}):**
` +
          `• Total em Espécie: **${fmt(totalDinheiro)}**
` +
          `• Quantidade de Vendas: **${qtdDinheiro} pedido(s)**
` +
          `• Saldo atual estimado da gaveta: **${fmt(saldoSessaoFisicoBRL)}**`,
          [
            { label: "💳 Ver todas as formas", comando: `formas de pagamento ${periodo}` },
            { label: "💵 Saldo da Gaveta", comando: "saldo da gaveta" }
          ]
        );
        return;
      }

      responderIA(
        `💳 **Vendas por Meio de Pagamento (${rotuloPeriodo}):**
` +
        `Total recebido: **${fmt(totalGeralBRL)}** distribuído entre as seguintes formas:`,
        [
          { label: "📅 Ver na semana", comando: "formas de pagamento na semana" },
          { label: "👥 Vendas por vendedor", comando: "quanto cada vendedor vendeu" },
          { label: "💰 Resumo do dia", comando: "quanto faturou hoje" }
        ],
        {
          tipo: "formas_pagamento",
          itens: formas
        }
      );
      return;
    }

    // =========================================================================
    // 4. LUCRO / RENTABILIDADE / MARGEM
    // =========================================================================
    if (
      tNorm.includes("lucro") ||
      tNorm.includes("lucramos") ||
      tNorm.includes("lucrou") ||
      tNorm.includes("margem de lucro") ||
      tNorm.includes("rentabilidade") ||
      intencaoDetectada.intencao === "lucro"
    ) {
      if (!temPermissao("vendas") && !ehGerente) {
        responderIA("🔒 Consulta de margem e lucro é exclusiva para gerência.");
        return;
      }

      const resumo = calcularResumoPeriodo(periodo);

      responderIA(
        `📈 **Lucro e Rentabilidade (${rotuloPeriodo}):**
` +
        `• Faturamento Bruto: **${fmt(resumo.totalFaturadoBRL)}**
` +
        `• Custo das Mercadorias (CMV): **${fmt(resumo.custoTotalBRL)}**
` +
        `• **Lucro Bruto Estimado: ${fmt(resumo.lucroEstimadoBRL)}**
` +
        `• Margem Média: **${resumo.margemPct}%** sobre as vendas finalizadas.`,
        [
          { label: "📅 Ver lucro na semana", comando: "qual foi o lucro na semana" },
          { label: "📅 Ver lucro no mês", comando: "qual foi o lucro no mes" },
          { label: "💰 Ver Faturamento", comando: "quanto faturou hoje" },
          { label: "👥 Vendas por vendedor", comando: "quanto cada vendedor vendeu" }
        ]
      );
      return;
    }

    // =========================================================================
    // 5. MAIS VENDIDOS / PRODUTOS CAMPEÕES
    // =========================================================================
    if (
      tNorm.includes("mais vendido") ||
      tNorm.includes("mais vendida") ||
      intencaoDetectada.intencao === "produtos" ||
      tNorm.includes("o que mais vendeu") ||
      tNorm.includes("top produtos") ||
      tNorm.includes("campeoes de venda") ||
      tNorm.includes("campeoes") ||
      tNorm.includes("produtos mais vendidos")
    ) {
      if (!temPermissao("vendas") && !temPermissao("pdv") && !ehGerente) {
        responderIA(`🔒 Seu operador não possui permissão para consultar histórico e relatórios de vendas.`);
        return;
      }

      const { ranking, totalVendas } = calcularMaisVendidos(periodo);

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
` +
        `Foram realizadas **${totalVendas} vendas** ${!ehGerente ? "(apenas suas vendas)" : ""}.`,
        [
          { label: "⚠️ O que preciso repor?", comando: "o que repor no estoque" },
          { label: "📅 Ver mais vendidos na semana", comando: "mais vendidos na semana" },
          { label: "👥 Vendas por vendedor", comando: "quanto cada vendedor vendeu" },
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

    // =========================================================================
    // 6. REPOSIÇÃO DE ESTOQUE / O QUE COMPRAR / ESTOQUE BAIXO
    // =========================================================================
    if (
      tNorm.includes("repor") ||
      tNorm.includes("reposi") ||
      tNorm.includes("o que comprar") ||
      intencaoDetectada.intencao === "reposicao" ||
      tNorm.includes("comprar mercadoria") ||
      tNorm.includes("estoque baixo") ||
      tNorm.includes("estoque acabando") ||
      tNorm.includes("zerado") ||
      tNorm.includes("falta no estoque") ||
      tNorm.includes("falta estoque")
    ) {
      if (!temPermissao("produtos")) {
        responderIA(`🔒 Seu perfil não possui acesso ao módulo de **Produtos e Estoque**.`);
        return;
      }

      const itens = calcularSugestaoReposicao();

      if (itens.length === 0) {
        responderIA(
          `✅ **Excelente notícia!** Todos os produtos ativos estão com estoque adequado e acima da margem de segurança baseada nas vendas dos últimos 15 dias.`,
          [
            { label: "📦 Ver catálogo de produtos", comando: "abrir produtos" },
            { label: "🏆 Mais vendidos hoje", comando: "o que mais vendeu hoje" }
          ]
        );
        return;
      }

      const criticos = itens.filter((i) => i.status === "critico");
      const baixos = itens.filter((i) => i.status === "baixo");

      responderIA(
        `⚠️ **Sugestão Inteligente de Reposição:**
` +
        `Encontrei **${itens.length} produto(s)** que precisam de compra imediata (${criticos.length} zerado(s) e ${baixos.length} com estoque crítico/baixo).`,
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

    // =========================================================================
    // 7. FATURAMENTO / VENDAS GERAIS / RESUMO
    // =========================================================================
    if (
      tNorm.includes("quanto faturou") ||
      tNorm.includes("faturamento") ||
      tNorm.includes("quanto vend") ||
      tNorm.includes("vendas hoje") ||
      tNorm.includes("total de hoje") ||
      tNorm.includes("ticket medio") ||
      tNorm.includes("ticket medio") ||
      tNorm.includes("resumo do dia") ||
      tNorm.includes("faturamento de ontem") ||
      tNorm.includes("vendas de ontem") ||
      tNorm.includes("vendas da semana") ||
      tNorm.includes("vendas do mes")
    ) {
      if (!temPermissao("vendas") && !ehGerente) {
        responderIA(`🔒 Consulta de faturamento restrita à gerência ou operadores com permissão.`);
        return;
      }

      const resumo = calcularResumoPeriodo(periodo);

      responderIA(
        `💰 **Resumo de Vendas (${rotuloPeriodo}):**
` +
        `• Total Faturado: **${fmt(resumo.totalFaturadoBRL)}**
` +
        `• Pedidos Finalizados: **${resumo.qtdPedidos} venda(s)**
` +
        `• Ticket Médio: **${fmt(resumo.ticketMedio)}**`,
        [
          { label: "👥 Vendas por vendedor", comando: `quanto cada vendedor vendeu ${periodo}` },
          { label: "🏆 Campeões de Venda", comando: `o que mais vendeu ${periodo}` },
          { label: "💳 Formas de Pagamento", comando: `formas de pagamento ${periodo}` },
          { label: "💵 Ver Saldo da Gaveta", comando: "saldo da gaveta" }
        ]
      );
      return;
    }

    // =========================================================================
    // 8. TOP CLIENTES QUE MAIS COMPRAM
    // =========================================================================
    if (
      tNorm.includes("quem mais compra") ||
      tNorm.includes("melhores clientes") ||
      tNorm.includes("top clientes") ||
      tNorm.includes("clientes vips") ||
      tNorm.includes("quem compra mais")
    ) {
      if (!temPermissao("clientes")) {
        responderIA(`🔒 Consulta de clientes restrita a perfis autorizados.`);
        return;
      }

      const topClientes = calcularTopClientes(5);

      if (topClientes.length === 0) {
        responderIA("Ainda não temos compras associadas a clientes com cadastro no histórico.", [
          { label: "👥 Abrir Clientes", comando: "abrir clientes" }
        ]);
        return;
      }

      responderIA(
        `⭐ **Clientes Campeões de Compra (Top Clientes):**
` +
        `Aqui estão os clientes que mais movimentaram compras na sua loja:`,
        [
          { label: "👥 Abrir Clientes & Fiado", comando: "abrir clientes" },
          { label: "🛒 Ir para o PDV", comando: "abrir pdv" }
        ],
        {
          tipo: "top_clientes",
          itens: topClientes
        }
      );
      return;
    }

    // =========================================================================
    // 9. VALOR TOTAL DO ESTOQUE / INVENTÁRIO
    // =========================================================================
    if (
      tNorm.includes("valor do estoque") ||
      tNorm.includes("quanto vale o estoque") ||
      tNorm.includes("total do estoque") ||
      tNorm.includes("inventario") ||
      intencaoDetectada.intencao === "estoque"
    ) {
      if (!temPermissao("produtos")) {
        responderIA(`🔒 Seu operador não possui acesso ao módulo de Produtos e Estoque.`);
        return;
      }

      const est = calcularResumoEstoque();

      responderIA(
        `📦 **Panorama Geral do Estoque:**
` +
        `• Produtos Ativos no Catálogo: **${est.totalItens} itens**
` +
        `• Volume Físico Total: **${est.unidadesEstoque} unidades**
` +
        `• **Valor de Custo do Estoque: ${fmt(est.valorCustoTotal)}**
` +
        `• **Valor Potencial de Venda: ${fmt(est.valorVendaTotal)}**
` +
        `• Lucro Bruto Projetado: **${fmt(est.lucroProjetado)}**
` +
        `• Itens com Estoque Zerado: **${est.produtosZerados} produto(s)**`,
        [
          { label: "⚠️ O que preciso repor?", comando: "o que repor no estoque" },
          { label: "📦 Abrir Produtos & Estoque", comando: "abrir produtos" },
          { label: "📥 Entrada no PDV Compras", comando: "abrir compras" }
        ]
      );
      return;
    }

    // =========================================================================
    // 10. CLIENTES COM FIADO / CONTAS A RECEBER
    // =========================================================================
    if (
      tNorm.includes("fiado") ||
      tNorm.includes("devedor") ||
      tNorm.includes("quem deve") ||
      tNorm.includes("saldo devedor") ||
      tNorm.includes("contas a receber") ||
      tNorm.includes("cobranca") ||
      intencaoDetectada.intencao === "fiado"
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

    // =========================================================================
    // 11. DESPESAS / CONTAS PAGAS
    // =========================================================================
    if (
      tNorm.includes("despesa") ||
      tNorm.includes("despesas") ||
      tNorm.includes("quanto gastou") ||
      tNorm.includes("contas pagas") ||
      tNorm.includes("gastos")
    ) {
      if (!temPermissao("financeiro") && !ehGerente) {
        responderIA(`🔒 Consulta de despesas restrita a operadores autorizados.`);
        return;
      }

      const hojeStr = new Date().toLocaleDateString();
      const despesasHoje = (despesas || []).filter((d) => {
        const data = d.data || d.createdAt || d.dataHora;
        return data ? new Date(data).toLocaleDateString() === hojeStr : false;
      });

      const totalDespesasHoje = despesasHoje.reduce((acc, d) => acc + Number(d.valorBRL || d.valor || 0), 0);
      const totalDespesasGeral = (despesas || []).reduce((acc, d) => acc + Number(d.valorBRL || d.valor || 0), 0);

      responderIA(
        `💸 **Controle de Despesas:**
` +
        `• Lançamentos de Hoje: **${fmt(totalDespesasHoje)}** (${despesasHoje.length} registro(s))
` +
        `• Total Acumulado Registrado: **${fmt(totalDespesasGeral)}**`,
        [
          { label: "💰 Faturamento de hoje", comando: "quanto faturou hoje" },
          { label: "💵 Saldo da Gaveta", comando: "saldo da gaveta" }
        ]
      );
      return;
    }

    // =========================================================================
    // 12. CAIXA / TURNO / GAVETA (STATUS GERAL)
    // =========================================================================
    if (
      tNorm.includes("gaveta") ||
      tNorm.includes("saldo do caixa") ||
      tNorm.includes("saldo da gaveta") ||
      tNorm.includes("dinheiro no caixa") ||
      tNorm.includes("sangria") ||
      tNorm.includes("suprimento") ||
      tNorm === "caixa"
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

    // =========================================================================
    // 13. ABERTURA DIRETA DE CADASTROS (Produto / Cliente)
    // =========================================================================
    if (
      tNorm.includes("cadastrar produto") ||
      tNorm.includes("novo produto") ||
      tNorm.includes("adicionar produto") ||
      tNorm.includes("criar produto")
    ) {
      const res = executarNavegacaoSegura("produtos", "Produtos & Estoque", () => {
        window.dispatchEvent(new CustomEvent("zenos:abrir-novo-produto"));
      });
      responderIA(`${res.mensagem}
✨ *Dica: Já posicionei o formulário de cadastro pronto para você preencher.*`);
      return;
    }

    if (
      tNorm.includes("cadastrar cliente") ||
      tNorm.includes("novo cliente") ||
      tNorm.includes("adicionar cliente") ||
      tNorm.includes("criar cliente")
    ) {
      const res = executarNavegacaoSegura("clientes", "Clientes & Fiado", () => {
        window.dispatchEvent(new CustomEvent("zenos:abrir-novo-cliente"));
      });
      responderIA(`${res.mensagem}
✨ *Dica: Já posicionei o formulário de novo cliente na tela.*`);
      return;
    }

    // =========================================================================
    // 14. NAVEGAÇÃO ENTRE TELAS DO SISTEMA
    // =========================================================================
    if (
      tNorm.includes("abrir pdv") ||
      tNorm.includes("ir pro pdv") ||
      tNorm.includes("ir para pdv") ||
      tNorm.includes("ir pro caixa") ||
      tNorm.includes("frente de caixa")
    ) {
      const res = executarNavegacaoSegura("pdv", "PDV Balcão");
      responderIA(res.mensagem);
      return;
    }

    if (
      tNorm.includes("abrir compras") ||
      tNorm.includes("pdv compras") ||
      tNorm.includes("entrada de mercadoria") ||
      tNorm.includes("dar entrada")
    ) {
      const res = executarNavegacaoSegura("compras", "PDV Compras / Entrada de Mercadoria");
      responderIA(res.mensagem);
      return;
    }

    if (
      tNorm.includes("abrir produtos") ||
      tNorm.includes("ir para produtos") ||
      tNorm.includes("tela de produtos") ||
      tNorm.includes("ver estoque")
    ) {
      const res = executarNavegacaoSegura("produtos", "Produtos & Estoque");
      responderIA(res.mensagem);
      return;
    }

    if (
      tNorm.includes("abrir clientes") ||
      tNorm.includes("ir para clientes") ||
      tNorm.includes("tela de clientes")
    ) {
      const res = executarNavegacaoSegura("clientes", "Clientes & Fiado");
      responderIA(res.mensagem);
      return;
    }

    if (
      tNorm.includes("abrir vendas") ||
      tNorm.includes("historico de vendas")
    ) {
      const res = executarNavegacaoSegura("vendas", "Histórico de Vendas");
      responderIA(res.mensagem);
      return;
    }

    if (tNorm.includes("abrir fornecedores") || tNorm.includes("ir para fornecedores")) {
      const res = executarNavegacaoSegura("fornecedores", "Fornecedores");
      responderIA(res.mensagem);
      return;
    }

    if (tNorm.includes("abrir mesas") || tNorm.includes("comandas")) {
      const res = executarNavegacaoSegura("mesas", "Mesas / Comandas");
      responderIA(res.mensagem);
      return;
    }

    if (tNorm.includes("abrir fiscal") || tNorm.includes("ir para fiscal") || tNorm.includes("nfe")) {
      const res = executarNavegacaoSegura("fiscal", "Módulo Fiscal / NF-e");
      responderIA(res.mensagem);
      return;
    }

    if (tNorm.includes("abrir configur") || tNorm.includes("configuracoes") || tNorm.includes("ajustes")) {
      const res = executarNavegacaoSegura("configuracoes", "Configurações do Sistema");
      responderIA(res.mensagem);
      return;
    }

    if (tNorm.includes("abrir comiss") || tNorm.includes("comissoes")) {
      const res = executarNavegacaoSegura("comissoes", "Comissões de Vendedores");
      responderIA(res.mensagem);
      return;
    }

    if (tNorm.includes("auditoria") || tNorm.includes("auditoria de caixas")) {
      const res = executarNavegacaoSegura("auditoria_caixas", "Auditoria Geral de Caixas");
      responderIA(res.mensagem);
      return;
    }

    if (
      tNorm.includes("ir para o inicio") ||
      tNorm.includes("abrir hub") ||
      tNorm.includes("dashboard") ||
      tNorm.includes("painel")
    ) {
      navegarPara("hub");
      responderIA("🏠 Retornando ao Painel Principal (Hub).");
      return;
    }

    // =========================================================================
    // 15. BUSCA INTELIGENTE DE REFERÊNCIAS (CLIENTE / PRODUTO)
    // =========================================================================
    const { termoPesquisado, clientesEncontrados, produtosEncontrados, totalClientes, totalProdutos } =
      buscarReferencias(texto);

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

    // =========================================================================
    // 16. SAUDAÇÕES E AJUDA
    // =========================================================================
    if (
      tNorm === "oi" ||
      tNorm === "ola" ||
      tNorm === "bom dia" ||
      tNorm === "boa tarde" ||
      tNorm === "boa noite" ||
      tNorm === "ajuda" ||
      tNorm.includes("o que voce faz") ||
      tNorm.includes("o que pode fazer")
    ) {
      responderIA(
        `Olá, ${nomeOperador}! Como posso te ajudar agora? Sou seu assistente completo de gestão.
` +
        `Você pode perguntar métricas da loja, vendas por vendedor, pesquisar clientes/produtos ou clicar nos atalhos abaixo:`,
        [
          ...(!sessaoAtiva ? [{ label: "🔓 Abrir turno de caixa", comando: "abrir caixa" }] : []),
          { label: "👥 Vendas por vendedor", comando: "quanto cada vendedor vendeu" },
          { label: "🏆 Mais vendidos hoje", comando: "o que mais vendeu hoje" },
          { label: "⚠️ O que repor no estoque", comando: "o que repor no estoque" },
          { label: "💰 Faturamento de hoje", comando: "quanto vendemos hoje" },
          { label: "🛒 Abrir PDV Balcão", comando: "abrir pdv" }
        ]
      );
      return;
    }

    // =========================================================================
    // 17. FALLBACK INTELIGENTE COM SUGESTÕES ACIONÁVEIS
    // =========================================================================
    responderIA(
      `Não encontrei nenhum cliente, produto ou comando relacionado a **"${texto}"**.

` +
      `Como posso te ajudar agora? Posso consultar estoques, desempenho de vendedores, buscar clientes ou abrir qualquer tela para você.

` +
      `Aqui estão algumas ideias do que você pode perguntar agora:`,
      [
        ...(!sessaoAtiva ? [{ label: "🔓 Abrir turno de caixa", comando: "abrir caixa" }] : []),
        { label: "👥 Vendas por vendedor", comando: "quanto cada vendedor vendeu" },
        { label: "🏆 Mais vendidos hoje", comando: "o que mais vendeu hoje" },
        { label: "⚠️ O que repor no estoque", comando: "o que repor no estoque" },
        { label: "💰 Faturamento de hoje", comando: "quanto vendemos hoje" },
        { label: "➕ Cadastrar novo cliente", comando: "cadastrar cliente" },
        { label: "➕ Cadastrar novo produto", comando: "cadastrar produto" },
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
          { label: "👥 Vendas por vendedor", comando: "quanto cada vendedor vendeu" },
          { label: "🏆 Mais vendidos hoje", comando: "o que mais vendeu hoje" },
          { label: "⚠️ O que repor no estoque", comando: "o que repor no estoque" },
          { label: "💰 Vendas de hoje", comando: "quanto vendemos hoje" },
          { label: "🛒 Abrir PDV", comando: "abrir pdv" }
        ]
      }
    ]);
  };

  return (
    <>
      {/* Botão Flutuante (Discreto no canto inferior direito) */}
      {!aberto && (
        <button
          className="zen-ia-float-trigger no-print"
          onClick={onAbrir}
          title="Abrir Zen IA Assistente (Copiloto de Gestão)"
          aria-label="Abrir Zen IA Assistente"
        >
          <span className="zen-ia-pulse-badge" />
          ✨ Zen IA
        </button>
      )}

      {/* Drawer / Painel Lateral */}
      {aberto && (
        <div
          className="zen-ia-panel-backdrop no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) onFechar();
          }}
        >
          <div className="zen-ia-drawer" role="dialog" aria-modal="true" aria-label="Painel Zen IA Assistente">
            {/* Cabeçalho do Drawer */}
            <div className="zen-ia-header">
              <div className="zen-ia-header-left">
                <div className="zen-ia-avatar">✨</div>
                <div>
                  <div className="zen-ia-title">Zen IA Assistente</div>
                  <div className="zen-ia-hint">
                    {nomeOperador} • <span style={{ color: "#fbbf24", fontWeight: 800 }}>{patenteUsuario?.toUpperCase()}</span>
                  </div>
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

                      {/* CARTÃO: RANKING DE VENDEDORES */}
                      {msg.cartaoEspecial.tipo === "ranking_vendedores" && (
                        <>
                          {msg.cartaoEspecial.itens.map((v, idx) => {
                            const medalha = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
                            const corMedalha = idx === 0 ? "#fbbf24" : idx === 1 ? "#cbd5e1" : idx === 2 ? "#d97706" : "#38bdf8";
                            return (
                              <div key={v.id || idx} className="zen-ia-data-item">
                                <div
                                  className="zen-ia-rank-badge"
                                  style={{
                                    background: idx < 3 ? "rgba(251, 191, 36, 0.12)" : "rgba(25, 211, 255, 0.12)",
                                    color: corMedalha,
                                    fontSize: idx < 3 ? "14px" : "11px"
                                  }}
                                >
                                  {medalha}
                                </div>
                                <div className="zen-ia-item-info">
                                  <strong>{v.nome}</strong>
                                  <small>
                                    {v.cargo || "Vendedor"} • {v.qtdVendas} venda(s)
                                    {v.participacaoPct > 0 ? ` • ${v.participacaoPct}% da loja` : ""}
                                  </small>
                                </div>
                                <div className="zen-ia-item-value">
                                  <strong style={{ color: "#10b981" }}>{fmt(v.totalFaturadoBRL)}</strong>
                                  <small>Médio: {fmt(v.ticketMedioBRL)}</small>
                                </div>
                              </div>
                            );
                          })}
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

                      {/* CARTÃO: RANKING DE PRODUTOS MAIS VENDIDOS */}
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

                      {/* CARTÃO: FORMAS DE PAGAMENTO */}
                      {msg.cartaoEspecial.tipo === "formas_pagamento" && (
                        <>
                          {msg.cartaoEspecial.itens.map((fp, idx) => (
                            <div key={fp.id || idx} className="zen-ia-data-item">
                              <div className="zen-ia-rank-badge" style={{ fontSize: "14px" }}>{fp.icone || "💳"}</div>
                              <div className="zen-ia-item-info">
                                <strong>{fp.nome}</strong>
                                <small>{fp.qtdVendas} recebimento(s){fp.participacaoPct > 0 ? ` • ${fp.participacaoPct}% do total` : ""}</small>
                              </div>
                              <div className="zen-ia-item-value">
                                <strong style={{ color: "#38bdf8" }}>{fmt(fp.totalBRL)}</strong>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* CARTÃO: TOP CLIENTES */}
                      {msg.cartaoEspecial.tipo === "top_clientes" && (
                        <>
                          {msg.cartaoEspecial.itens.map((cli, idx) => (
                            <div key={cli.id || idx} className="zen-ia-data-item">
                              <div className="zen-ia-rank-badge">#{idx + 1}</div>
                              <div className="zen-ia-item-info">
                                <strong>{cli.nome}</strong>
                                <small>{cli.qtdCompras} compra(s)</small>
                              </div>
                              <div className="zen-ia-item-value">
                                <strong style={{ color: "#10b981" }}>{fmt(cli.totalGastoBRL)}</strong>
                              </div>
                            </div>
                          ))}
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

            {/* Rodapé com Input e Microfone */}
            <div className="zen-ia-footer">
              <form
                className="zen-ia-input-wrapper"
                onSubmit={(e) => {
                  e.preventDefault();
                  processarComando(inputTexto);
                }}
              >
                <button
                  type="button"
                  className={`zen-ia-btn-mic ${gravandoVoz ? "recording" : ""}`}
                  onClick={alternarVoz}
                  title={gravandoVoz ? "Gravando voz... Clique para parar" : "Falar por comando de voz"}
                >
                  🎤
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Pergunte algo (ex: quanto cada vendedor vendeu, mais vendidos)..."
                  value={inputTexto}
                  onChange={(e) => setInputTexto(e.target.value)}
                />

                <button
                  type="submit"
                  className="zen-ia-btn-send"
                  disabled={!inputTexto.trim()}
                  title="Enviar pergunta"
                >
                  ➤
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
